// Optimización walk-forward (idea de backtesting.py / vectorbt).
// 1) Rejilla completa: cada combinación de parámetros sobre todo el periodo (mapa de calor; es
//    el óptimo "dentro de muestra", optimista por construcción).
// 2) Tramos: en cada ventana dentro de muestra (IS) se elige la mejor combinación según el
//    objetivo y se aplica sin cambios a la ventana siguiente fuera de muestra (OOS).
// 3) Las ventanas OOS se encadenan en una curva: es la estimación honesta del método. Se compara
//    con los parámetros actuales en las mismas ventanas OOS.
(function(){
  const RULE_SETS = [
    ['entryRules','Entrada long','long'],
    ['exitRules','Salida long','long'],
    ['shortEntryRules','Entrada short','short'],
    ['shortExitRules','Salida short','short'],
    ['mktFilterRules','Régimen',null],
  ];
  const TEXT_INDS = new Set(['SECTOR','INDUSTRY','COUNTRY','EXCHANGE']);
  const MAX_COMBOS = 64;
  const MAX_FOLDS = 12;

  const hasPeriod = ind => {
    const def = (window.StockScannerConfig?.INDICATORS || []).find(x => x.id === ind);
    return def ? def.param != null : false;
  };
  const condLabel = c => `${c.ind}${c.params?.p ? '(' + c.params.p + ')' : ''} [${(c.tf || '?').toUpperCase()}]`;

  // Parámetros numéricos optimizables a partir de las reglas activas.
  function listOptimizableParams(cfg = {}){
    const out = [];
    const dir = cfg.btDirection || 'long';
    for(const [key, label, side] of RULE_SETS){
      if(side && dir !== 'both' && side !== dir) continue;
      if(key === 'mktFilterRules' && !cfg.mktFilterEnabled) continue;
      (cfg[key] || []).forEach((g, gi) => (g.conditions || []).forEach((c, ci) => {
        if(!c || TEXT_INDS.has(c.ind)) return;
        const base = `${label} G${gi + 1} · ${condLabel(c)}`;
        if(hasPeriod(c.ind) && Number.isFinite(Number(c.params?.p)))
          out.push({ id: `${key}.${gi}.${ci}.p`, label: `${base} · periodo`, key, gi, ci, field: 'p', current: Number(c.params.p), integer: true, min: 1 });
        if(c.cmpType === 'val' && Number.isFinite(Number(c.cmpVal)))
          out.push({ id: `${key}.${gi}.${ci}.cmpVal`, label: `${base} ${c.op} umbral`, key, gi, ci, field: 'cmpVal', current: Number(c.cmpVal), integer: false });
        if(c.cmpType === 'ind' && hasPeriod(c.cmpInd) && Number.isFinite(Number(c.cmpParams?.p)))
          out.push({ id: `${key}.${gi}.${ci}.cmpP`, label: `${base} vs ${c.cmpInd} · periodo`, key, gi, ci, field: 'cmpP', current: Number(c.cmpParams.p), integer: true, min: 1 });
      }));
    }
    if(cfg.stopATR) out.push({ id: 'stopATRMult', label: 'Stop ATR · multiplicador', global: 'stopATRMult', current: Number(cfg.stopATRMult) || 2, integer: false, min: 0.1 });
    if(cfg.stopPct) out.push({ id: 'stopPctVal', label: 'Stop % · porcentaje', global: 'stopPctVal', current: Number(cfg.stopPctVal) || 8, integer: false, min: 0.5 });
    return out;
  }

  // Rango sugerido alrededor del valor actual (5 valores).
  function suggestRange(param){
    const v = Number(param.current) || 0;
    if(param.integer){
      const step = Math.max(1, Math.round(Math.abs(v) * 0.25));
      const from = Math.max(param.min ?? 1, v - 2 * step);
      return { from, to: from + 4 * step, step };
    }
    const step = Math.abs(v) >= 10 ? Math.max(1, Math.round(Math.abs(v) * 0.1)) : Math.max(0.1, Math.round(Math.abs(v) * 0.25 * 10) / 10 || 0.5);
    const from = param.min != null ? Math.max(param.min, v - 2 * step) : v - 2 * step;
    return { from: +from.toFixed(4), to: +(from + 4 * step).toFixed(4), step };
  }

  function rangeValues({ from, to, step }, integer){
    const a = Number(from), b = Number(to), s = Math.abs(Number(step));
    if(!Number.isFinite(a) || !Number.isFinite(b) || !(s > 0)) return [];
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const vals = [];
    for(let x = lo; x <= hi + s * 1e-9 && vals.length <= MAX_COMBOS; x += s){
      const v = integer ? Math.round(x) : +x.toFixed(6);
      if(!vals.includes(v)) vals.push(v);
    }
    return vals;
  }

  function buildGrid(params, ranges){
    let combos = [[]];
    params.forEach((p, i) => {
      const values = rangeValues(ranges[i], p.integer).filter(v => p.min == null || v >= p.min);
      combos = combos.flatMap(c => values.map(v => [...c, v]));
    });
    return combos.filter(c => c.length === params.length);
  }

  function applyParams(cfg, params, values){
    const next = { ...cfg };
    const cloned = new Set();
    params.forEach((p, i) => {
      const v = values[i];
      if(p.global){ next[p.global] = v; return; }
      if(!cloned.has(p.key)){ next[p.key] = JSON.parse(JSON.stringify(cfg[p.key] || [])); cloned.add(p.key); }
      const c = next[p.key]?.[p.gi]?.conditions?.[p.ci];
      if(!c) return;
      if(p.field === 'p') c.params = { ...(c.params || {}), p: v };
      else if(p.field === 'cmpVal') c.cmpVal = v;
      else if(p.field === 'cmpP') c.cmpParams = { ...(c.cmpParams || {}), p: v };
    });
    return next;
  }

  // Ventanas en "semanas atrás". Una ventana (S, E) evalúa señales en S … E+2 y ejecuta en
  // S-1 … E+1; la siguiente ventana empieza en E+1 para que no haya huecos ni solapes.
  function buildFolds({ totalWeeks, isWeeks, oosWeeks, anchored }){
    const folds = [];
    const S0 = Math.round(totalWeeks);
    for(let k = 0; k < MAX_FOLDS; k++){
      const isStart = anchored ? S0 : S0 - k * oosWeeks;
      const isLen = anchored ? isWeeks + k * oosWeeks : isWeeks;
      const isEnd = isStart - isLen - 1;
      const oosStart = isEnd + 1;
      const oosEnd = oosStart - oosWeeks - 1;
      if(isEnd < 0 || oosEnd < 0) break;
      folds.push({ index: k, isStart, isEnd, oosStart, oosEnd });
    }
    return folds;
  }

  const METRICS = {
    sharpe: { label: 'Sharpe', get: r => r.sharpe },
    annReturn: { label: 'Retorno anual', get: r => r.annReturn },
    calmar: { label: 'Calmar', get: r => r.calmar },
    sortino: { label: 'Sortino', get: r => r.sortino },
  };
  function closedTrades(r){ return (r?.allTrades || []).length; }
  function score(r, objective, minTrades){
    if(!r) return -Infinity;
    if(closedTrades(r) < minTrades) return -Infinity;
    const v = Number(METRICS[objective]?.get(r));
    return Number.isFinite(v) ? v : -Infinity;
  }
  function summary(r){
    if(!r) return null;
    return { totalReturn: r.totalReturn, annReturn: r.annReturn, sharpe: r.sharpe, maxDrawdown: r.maxDrawdown,
      calmar: r.calmar, sortino: r.sortino, trades: closedTrades(r), windowStart: r.windowStart, windowEnd: r.windowEnd };
  }

  // Encadena ventanas OOS por retornos: cada ventana empieza en efectivo con el valor final de la anterior.
  function stitch(results, capital){
    const curve = [];
    let level = capital;
    for(const r of results){
      if(!r?.equityCurve?.length || !(r.startVal > 0)) continue;
      const scale = level / r.startVal;
      r.equityCurve.forEach(p => curve.push({ time: p.time, value: p.value * scale }));
      level = curve[curve.length - 1].value;
    }
    const weeks = curve.length;
    const rets = [];
    let prev = capital, peak = capital, maxDD = 0;
    curve.forEach(p => { rets.push(p.value / prev - 1); prev = p.value; if(p.value > peak) peak = p.value; maxDD = Math.max(maxDD, (peak - p.value) / peak); });
    const total = weeks ? level / capital - 1 : 0;
    const ann = weeks ? Math.pow(Math.max(0, 1 + total), 52 / weeks) - 1 : 0;
    const m = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
    const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / (rets.length - 1)) : 0;
    return { curve, totalReturn: total, annReturn: ann, sharpeNoRf: sd > 0 ? m / sd * Math.sqrt(52) : 0, maxDrawdown: maxDD, weeks };
  }

  async function runWalkForward(opts = {}){
    const { base, params = [], ranges = [], isWeeks = 52, oosWeeks = 13, anchored = false,
      objective = 'sharpe', minTrades = 5, abortSignal, onProgress } = opts;
    const { runBacktestWorkflow } = window.StockScannerCore;
    if(!params.length) return { ok: false, message: 'Elige al menos un parámetro.' };
    const combos = buildGrid(params, ranges);
    if(!combos.length) return { ok: false, message: 'Los rangos no producen valores válidos.' };
    if(combos.length > MAX_COMBOS) return { ok: false, message: `Demasiadas combinaciones (${combos.length}). Máximo ${MAX_COMBOS}: amplía el paso o reduce el rango.` };
    const totalWeeks = Number(base?.btWeeks) || 0;
    const folds = buildFolds({ totalWeeks, isWeeks, oosWeeks, anchored });
    if(!folds.length) return { ok: false, message: `El periodo del backtest (${totalWeeks} semanas) no admite una ventana IS de ${isWeeks} más una OOS de ${oosWeeks}.` };

    const totalRuns = combos.length + folds.length * combos.length + folds.length * 2;
    let done = 0;
    const progress = (phase) => { if(typeof onProgress === 'function') onProgress({ done, total: totalRuns, phase }); };
    const noop = () => {};
    const runOnce = async (values, S, E) => {
      if(abortSignal?.aborted){ const e = new Error('Walk-forward cancelado'); e.name = 'AbortError'; throw e; }
      let res = null;
      const cfg = values ? applyParams(base, params, values) : base;
      await runBacktestWorkflow({ ...cfg, btWeeks: S, btEndOffset: E, savedStrategiesLength: 0, abortSignal,
        setBtRunning: noop, setBtProgress: noop, setTab: noop, setBacktest: r => { res = r; } });
      done++;
      return res && (res.status === 'ok' || res.status === 'no_trades') && res.equityCurve?.length ? res : null;
    };

    try{
      // 1) Rejilla completa (dentro de muestra).
      const grid = [];
      for(const values of combos){
        progress('Rejilla completa');
        const r = await runOnce(values, totalWeeks, 0);
        if(r === null && done === 1) return { ok: false, message: 'El backtest no produjo resultados con esta configuración. Ejecútalo una vez para revisar datos y reglas.' };
        grid.push({ values, score: score(r, objective, minTrades), ...summary(r) });
      }
      // 2) Tramos IS → OOS.
      const foldResults = [];
      const oosRuns = [], baselineRuns = [];
      for(const f of folds){
        let best = null;
        for(const values of combos){
          progress(`Tramo ${f.index + 1}/${folds.length} · IS`);
          const r = await runOnce(values, f.isStart, f.isEnd);
          const s = score(r, objective, minTrades);
          if(!best || s > best.score) best = { values, score: s, is: summary(r) };
        }
        progress(`Tramo ${f.index + 1}/${folds.length} · OOS`);
        const chosen = Number.isFinite(best.score) ? best.values : params.map(p => p.current);
        const oos = await runOnce(chosen, f.oosStart, f.oosEnd);
        const baseline = await runOnce(null, f.oosStart, f.oosEnd);
        oosRuns.push(oos); baselineRuns.push(baseline);
        foldResults.push({ ...f, values: chosen, fallback: !Number.isFinite(best.score), isScore: best.score, is: best.is,
          oos: summary(oos), baseline: summary(baseline) });
      }
      progress('Listo');
      const capital = Number(base.btCapital) || 100000;
      const wf = stitch(oosRuns, capital);
      const baselineWf = stitch(baselineRuns, capital);
      const validIs = foldResults.map(f => f.is?.annReturn).filter(Number.isFinite);
      const meanIsAnn = validIs.length ? validIs.reduce((a, b) => a + b, 0) / validIs.length : null;
      const bestFull = grid.reduce((a, g) => (!a || g.score > a.score ? g : a), null);
      const choiceCounts = {};
      foldResults.forEach(f => { const k = f.values.join(' / '); choiceCounts[k] = (choiceCounts[k] || 0) + 1; });
      return {
        ok: true, objective, objectiveLabel: METRICS[objective]?.label || objective, minTrades,
        params: params.map(p => ({ id: p.id, label: p.label, current: p.current })),
        combos: combos.length, runs: done, isWeeks, oosWeeks, anchored,
        grid, bestFull, folds: foldResults, wf, baseline: baselineWf,
        // Eficiencia walk-forward: retorno anual OOS encadenado / retorno anual IS medio del elegido.
        wfe: meanIsAnn != null && meanIsAnn > 0 ? wf.annReturn / meanIsAnn : null,
        meanIsAnnReturn: meanIsAnn,
        choiceCounts,
      };
    }catch(e){
      if(e?.name === 'AbortError') return { ok: false, cancelled: true, message: 'Walk-forward cancelado.' };
      throw e;
    }
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore || {}, {
    listOptimizableParams, suggestRange, buildWalkForwardGrid: buildGrid, buildWalkForwardFolds: buildFolds,
    applyWalkForwardParams: applyParams, runWalkForward, WALK_FORWARD_LIMITS: { MAX_COMBOS, MAX_FOLDS },
  });
})();
