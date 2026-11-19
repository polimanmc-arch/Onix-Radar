// Modo simple: recorrido guiado por el proceso completo, pensado para presentar la app.
// Mercado + estrategia → 1. Escáner → 2. Portafolio de Markowitz → 3. Backtest.
// Reutiliza el escáner, el optimizador de portafolios y el backtest del modo experto.
window.StockScannerUI = window.StockScannerUI || {};
(function(){
  const { useState, useRef, useEffect } = React;
  const GAMES_KEY = 'onix_simple_games_v1';
  const core = () => window.StockScannerCore;

  const money = (v, cur) => (Number.isFinite(v) ? Math.round(v).toLocaleString('es-ES') : '—') + ' ' + cur;
  const pct = (v, d = 1, sign = true) => (Number.isFinite(v) ? (sign && v >= 0 ? '+' : '') + (v * 100).toFixed(d).replace('.', ',') + ' %' : '—');
  const num = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
  const year = t => (t ? new Date(t * 1000).getFullYear() : '');
  const monthYear = t => (t ? new Date(t * 1000).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : '');
  const SECTOR_ES = { Technology: 'Tecnología', 'Financial Services': 'Financiero', Healthcare: 'Salud', 'Consumer Cyclical': 'Consumo cíclico',
    'Consumer Defensive': 'Consumo básico', Industrials: 'Industria', Energy: 'Energía', 'Communication Services': 'Comunicaciones',
    'Basic Materials': 'Materiales', 'Real Estate': 'Inmobiliario', Utilities: 'Servicios públicos', Other: 'Otros', 'N/A': 'Otros' };
  const sectorEs = s => SECTOR_ES[s] || s || 'Otros';

  function loadGames(){ try{ const v = JSON.parse(localStorage.getItem(GAMES_KEY) || '[]'); return Array.isArray(v) ? v : []; }catch{ return []; } }
  function saveGames(list){ try{ localStorage.setItem(GAMES_KEY, JSON.stringify(list.slice(0, 30))); }catch{} }

  function Stars({ n, size = 26 }){
    return <span className="simple-stars" aria-label={`${n} de 3 estrellas`} style={{ fontSize: size }}>
      {[0, 1, 2].map(i => <span key={i} aria-hidden="true" className={i < n ? 'on' : 'off'}>★</span>)}
    </span>;
  }

  // Estrategia frente al índice.
  function SimpleChart({ summary, currency, holdLabel }){
    const W = 640, H = 230, padL = 58, padR = 14, padT = 12, padB = 26;
    const a = summary.curve, b = summary.bench;
    const all = [summary.capital, ...a.map(p => p.value), ...b.map(p => p.value)];
    const lo = Math.min(...all) * 0.97, hi = Math.max(...all) * 1.03, rg = hi - lo || 1;
    const t0 = a[0].time, t1 = a[a.length - 1].time, tr = (t1 - t0) || 1;
    const x = t => padL + ((t - t0) / tr) * (W - padL - padR);
    const y = v => padT + (1 - (v - lo) / rg) * (H - padT - padB);
    const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + x(p.time).toFixed(1) + ',' + y(p.value).toFixed(1)).join(' ');
    const area = path(a) + ` L${x(t1).toFixed(1)},${(H - padB).toFixed(1)} L${x(t0).toFixed(1)},${(H - padB).toFixed(1)} Z`;
    const ticks = [summary.capital, ...[lo + rg * 0.1, hi - rg * 0.1].filter(v => Math.abs(v - summary.capital) > rg * 0.12)];
    return (
      <figure className="simple-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolución de 10.000 ${currency}: estrategia frente a comprar ${holdLabel}`}>
          {ticks.map(v => <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === summary.capital ? '4 4' : '0'} strokeWidth="1"/>
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-2)">{Math.round(v).toLocaleString('es-ES')}</text>
          </g>)}
          <path d={area} fill="var(--accent)" opacity="0.10"/>
          {b.length > 1 && <path d={path(b)} fill="none" stroke="var(--text-2)" strokeWidth="2" strokeDasharray="6 4"/>}
          <path d={path(a)} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round"/>
          <text x={padL} y={H - 6} fontSize="11" fill="var(--text-2)">{year(t0)}</text>
          <text x={W - padR} y={H - 6} fontSize="11" fill="var(--text-2)" textAnchor="end">{year(t1)}</text>
        </svg>
        <figcaption className="simple-legend">
          <span><i style={{ background: 'var(--accent)' }}/>Estrategia</span>
          <span><i className="dashed"/>{`Comprar ${holdLabel} y esperar`}</span>
        </figcaption>
      </figure>
    );
  }

  // Frontera eficiente: miles de combinaciones de pesos (riesgo, rentabilidad) y el portafolio elegido.
  function FrontierChart({ portfolio }){
    const pts = (portfolio.frontier || []).filter(p => Number.isFinite(p.vol) && Number.isFinite(p.ret));
    const chosen = portfolio.chosenPoint, ew = portfolio.altEqualWeightPoint;
    if(pts.length < 5 || !chosen) return null;
    const W = 460, H = 280, padL = 46, padR = 12, padT = 12, padB = 36;
    const xs = [...pts.map(p => p.vol), chosen.vol], ys = [...pts.map(p => p.ret), chosen.ret];
    const x0 = Math.min(...xs) * 0.95, x1 = Math.max(...xs) * 1.05, y0 = Math.min(...ys), y1 = Math.max(...ys);
    const yr = (y1 - y0) || 1, ylo = y0 - yr * 0.08, yhi = y1 + yr * 0.08;
    const x = v => padL + (v - x0) / ((x1 - x0) || 1) * (W - padL - padR);
    const y = v => padT + (1 - (v - ylo) / ((yhi - ylo) || 1)) * (H - padT - padB);
    const sh = pts.map(p => p.sharpe).filter(Number.isFinite), smin = Math.min(...sh), smax = Math.max(...sh);
    const op = s => (Number.isFinite(s) && smax > smin ? 0.15 + 0.65 * (s - smin) / (smax - smin) : 0.3);
    const ticks = n => Array.from({ length: n }, (_, i) => i / (n - 1));
    return (
      <figure className="simple-frontier">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Frontera eficiente de Markowitz con el portafolio elegido">
          {ticks(4).map(f => { const v = ylo + (yhi - ylo) * f; return <g key={'y' + f}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1"/>
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--text-2)">{Math.round(v) + '%'}</text></g>; })}
          {ticks(4).map(f => { const v = x0 + (x1 - x0) * f; return <text key={'x' + f} x={x(v)} y={H - padB + 14} textAnchor="middle" fontSize="10" fill="var(--text-2)">{Math.round(v) + '%'}</text>; })}
          {pts.map((p, i) => <circle key={i} cx={x(p.vol)} cy={y(p.ret)} r="2.4" fill="var(--accent)" opacity={op(p.sharpe)}/>)}
          {ew && <g><circle cx={x(ew.vol)} cy={y(ew.ret)} r="6" fill="var(--bg-1)" stroke="var(--text-2)" strokeWidth="2"/></g>}
          <g><circle cx={x(chosen.vol)} cy={y(chosen.ret)} r="9" fill="#f5c542" stroke="var(--bg-1)" strokeWidth="2"/>
            <text x={x(chosen.vol)} y={y(chosen.ret) + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#1d1f29">★</text></g>
          <text x={(padL + W - padR) / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--text-2)">Riesgo (volatilidad anual)</text>
          <text x={12} y={(padT + H - padB) / 2} textAnchor="middle" fontSize="11" fill="var(--text-2)" transform={`rotate(-90 12 ${(padT + H - padB) / 2})`}>Rentabilidad esperada</text>
        </svg>
        <figcaption className="simple-legend">
          <span><i style={{ background: 'var(--accent)', opacity: .6 }}/>Combinaciones probadas</span>
          <span><b style={{ color: '#f5c542' }}>★</b> Máximo Sharpe (elegido)</span>
          {ew && <span><i className="ring"/>Mismo peso en todas</span>}
        </figcaption>
      </figure>
    );
  }

  // Gráfico de velas semanales del valor seleccionado en el escáner (mismo motor que el inspector experto).
  function SimpleCandles({ ticker, data, strategy, row, currency }){
    const host = useRef(null);
    const [ok, setOk] = useState(true);
    useEffect(() => {
      const renderer = window.StockScannerUI?.ChartRenderer;
      if(!host.current || !data?.ok || !window.LightweightCharts || !renderer){ setOk(false); return; }
      let chart = null, ro = null;
      try{
        const times = [...data.times].reverse();
        const candles = times.map((time, i) => { const k = times.length - 1 - i;
          return { time, open: data.opens?.[k] ?? data.closes[k], high: data.highs[k], low: data.lows[k], close: data.closes[k] }; });
        chart = renderer.buildPriceChart(host.current, data, times, candles, {
          activeFilters: strategy.entry, activeEntryRules: [], activeExitRules: [], chartTf: '1wk', backtestTrades: [],
          showExitInfo: false, showVolume: true, showIndicators: true, setCrossInfo: () => {}, priceHeight: host.current.clientHeight || 340,
        });
        if(times.length > 104) chart.timeScale().setVisibleLogicalRange({ from: times.length - 104, to: times.length + 2 });
        ro = new ResizeObserver(() => host.current && chart.applyOptions({ width: host.current.clientWidth, height: host.current.clientHeight || 340 }));
        ro.observe(host.current);
        setOk(true);
      }catch(e){ console.warn('Onix modo simple:', e); setOk(false); }
      return () => { ro?.disconnect(); renderer.disposeChart(chart); };
    }, [ticker, data, strategy]);
    const lines = (strategy.entry || []).flatMap(f => [f, f.cmpType === 'ind' ? { ind: f.cmpInd, params: f.cmpParams } : null])
      .filter(f => f && ['WMA', 'SMA', 'EMA'].includes(f.ind)).map(f => `${f.ind}(${f.params.p})`);
    return (
      <figure className="simple-candles">
        <figcaption className="simple-candles-head">
          <div><strong>{ticker}</strong>{row && <span>{`${num(row.price)} ${currency}`}</span>}{row && <em className={row.chg >= 0 ? 'up' : 'down'}>{pct(row.chg)}</em>}</div>
          <small>{`Velas semanales · últimos 2 años${lines.length ? ' · ' + [...new Set(lines)].join(', ') : ''}`}</small>
        </figcaption>
        <div ref={host} className="simple-candles-chart" role="img" aria-label={`Gráfico de velas semanales de ${ticker}`}/>
        {!ok && <p className="simple-note">No hay gráfico disponible para este valor.</p>}
      </figure>
    );
  }

  // Gráfico de dona con leyenda: reparto del dinero por acción o por sector.
  const DONUT_COLORS = ['#5b8cff', '#2ec4a6', '#f5a623', '#e8577c', '#9b6dff', '#3fb8e6', '#8bc34a', '#ff7a45', '#d4b106', '#c06fd6', '#4dd0a0', '#ef6461'];
  function Donut({ items, title, center, currency }){
    const R = 70, SW = 26, CIRC = 2 * Math.PI * R;
    const total = items.reduce((t, i) => t + i.weight, 0) || 1;
    let acc = 0;
    const slices = items.map((it, i) => { const frac = it.weight / total, sl = { ...it, frac, off: acc, color: it.color || DONUT_COLORS[i % DONUT_COLORS.length] }; acc += frac; return sl; });
    return (
      <figure className="simple-donut">
        <div className="simple-donut-body">
          <svg viewBox="0 0 200 200" role="img" aria-label={`${title}: ` + slices.map(sl => `${sl.label} ${pct(sl.weight, 1, false)}`).join(', ')}>
            <circle cx="100" cy="100" r={R} fill="none" stroke="var(--bg-3)" strokeWidth={SW}/>
            {slices.map(sl => <circle key={sl.key} cx="100" cy="100" r={R} fill="none" stroke={sl.color} strokeWidth={SW}
              strokeDasharray={`${Math.max(0, sl.frac * CIRC - (slices.length > 1 ? 1.5 : 0))} ${CIRC}`} strokeDashoffset={-sl.off * CIRC}
              transform="rotate(-90 100 100)"><title>{`${sl.label}: ${pct(sl.weight, 1, false)}`}</title></circle>)}
            <text x="100" y="98" textAnchor="middle" fontSize="30" fontWeight="800" fill="var(--text-0)">{center.value}</text>
            <text x="100" y="120" textAnchor="middle" fontSize="13" fill="var(--text-2)">{center.label}</text>
          </svg>
          <ul className="simple-donut-legend">{slices.map(sl => (
            <li key={sl.key}><i style={{ background: sl.color }}/><span><b>{sl.label}</b>{sl.sub && <small>{sl.sub}</small>}</span>
              <strong>{pct(sl.weight, 1, false)}{currency && <small>{money(sl.weight * 10000, currency)}</small>}</strong></li>
          ))}</ul>
        </div>
      </figure>
    );
  }

  const STAGES = [ { id: 'scan', label: 'Escáner' }, { id: 'portfolio', label: 'Portafolio Markowitz' }, { id: 'backtest', label: 'Backtest' } ];

  function SimpleMode(){
    const C = core();
    const markets = C.SIMPLE_MARKETS, groups = C.SIMPLE_MARKET_GROUPS, strategies = C.SIMPLE_STRATEGIES, periods = C.SIMPLE_PERIODS;
    const [marketId, setMarketId] = useState('DOW30');
    const [strategyId, setStrategyId] = useState('base');
    const [tipOpen, setTipOpen] = useState(null);
    const [selTicker, setSelTicker] = useState(null);
    const [weightView, setWeightView] = useState('stock');
    const [years, setYears] = useState(3);
    const [stage, setStage] = useState('idle');
    const [progress, setProgress] = useState('');
    const [run, setRun] = useState(null);
    const [error, setError] = useState(null);
    const [games, setGames] = useState(loadGames);
    const cacheRef = useRef({});
    const abortRef = useRef(null);
    const sectionRef = useRef(null);
    useEffect(() => () => abortRef.current?.abort(), []);

    const market = markets.find(m => m.id === marketId);
    const group = groups.find(g => g.id === market?.group) || groups[0];
    const countOf = m => C.simpleUniverseReady(m) ? C.simpleUniverseTickers(m).length.toLocaleString('es-ES') : '≈' + (m.approx || 0).toLocaleString('es-ES');
    const strategy = strategies.find(s => s.id === strategyId);
    const period = periods.find(p => p.years === years) || periods[periods.length - 1];
    const running = stage !== 'idle' && stage !== 'done';
    const ready = market && strategy && !running;

    const execute = async () => {
      if(!ready) return;
      const ac = new AbortController(); abortRef.current = ac;
      const cfg = { market, strategy, period };
      setError(null); setRun({ ...cfg }); setSelTicker(null);
      setTimeout(() => sectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 60);
      try{
        // 1. Escáner
        setStage('scan'); setProgress('Descargando precios semanales');
        if(!C.simpleUniverseReady(market)) setProgress('Descargando la lista de todas las acciones del mercado');
        const tickers = await C.resolveSimpleUniverse(market);
        await C.loadSimpleWeekly({ tickers, cacheRef, signal: ac.signal, onProgress: (d, t) => setProgress(`Descargando precios ${d} de ${t}`) });
        const scan = C.scanSimpleMarket({ tickers, dataByTicker: cacheRef.current, strategy });
        setRun(r => ({ ...r, scan: { ...scan, total: tickers.length } }));

        // 2. Portafolio de Markowitz con las mejores candidatas del escáner
        setStage('portfolio'); setProgress('Probando 10.000 combinaciones de pesos');
        let portfolio = null, portfolioError = null;
        if(scan.passing.length >= 2){
          const fetchSectors = async list => { try{ const r = await fetch('/api/sectors?symbols=' + encodeURIComponent(list.join(','))); return r.ok ? r.json() : {}; }catch{ return {}; } };
          const out = await C.buildPortfolioWorkflow({ ...C.buildSimplePortfolioOptions({ strategy, candidates: scan.passing, cacheRef, fetchSectors }), setPortfolio: p => { portfolio = p; } });
          if(!out?.ok) portfolioError = out?.message || 'No se pudo construir el portafolio.';
        }else portfolioError = 'Hoy no hay suficientes acciones que cumplan la estrategia para construir un portafolio (hacen falta al menos 2).';
        setRun(r => ({ ...r, portfolio, portfolioError }));

        // 3. Backtest de la estrategia
        setStage('backtest'); setProgress('Simulando semana a semana');
        let raw = null;
        const out = await C.runBacktestWorkflow({
          ...C.buildSimpleBacktestOptions(cfg), dataCacheRef: cacheRef, abortSignal: ac.signal,
          setBtRunning: () => {}, setTab: () => {}, setBacktest: r => { raw = r; },
          setBtProgress: p => p?.stage === 'simulation' && setProgress(`Simulando semana a semana… ${Math.round(p.phasePct || 0)} %`),
        });
        const summary = raw && C.summarizeSimpleResult(raw);
        const backtest = summary ? { summary, annReturn: raw.annReturn, sharpe: raw.sharpe, commissions: raw.totalCommissionPaid } : null;
        setRun(r => ({ ...r, backtest, backtestError: backtest ? null : (out?.message || 'No hubo datos suficientes para el backtest.') }));
        if(summary){
          const game = { id: Date.now(), market: market.name, flag: market.icon, strategy: strategy.name, icon: strategy.icon, period: period.label, ret: summary.ret, benchRet: summary.benchRet, stars: summary.stars };
          setGames(prev => { const next = [game, ...prev].slice(0, 30); saveGames(next); return next; });
        }
        setStage('done');
      }catch(e){
        setStage('idle');
        setError(e?.name === 'AbortError' ? 'Análisis cancelado.' : (e?.message || 'Algo salió mal. Inténtalo de nuevo.'));
      }finally{ abortRef.current = null; setProgress(''); }
    };

    const stageState = id => {
      const order = STAGES.map(s => s.id), cur = order.indexOf(stage);
      if(run?.[id + 'Error']) return 'error';
      if(stage === 'done' || stage === 'idle') return run?.[id] ? 'done' : 'todo';
      return order.indexOf(id) < cur ? 'done' : order.indexOf(id) === cur ? 'active' : 'todo';
    };
    const ranking = [...games].sort((a, b) => b.ret - a.ret).slice(0, 8);
    const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    const cur = run?.market?.currency;
    const scan = run?.scan, pf = run?.portfolio, bt = run?.backtest;
    const inPortfolio = new Set((pf?.allocations || []).map(a => a.ticker));
    const selected = scan?.passing.some(r => r.ticker === selTicker) ? selTicker : scan?.passing[0]?.ticker;
    const goTo = id => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    const done = id => stageState(id) === 'done';
    const path = [
      { id: 'market', n: 1, label: 'Mercado', state: market ? 'done' : 'todo', detail: market && `${market.icon} ${market.name}`, target: 'simple-step-market' },
      { id: 'strategy', n: 2, label: 'Estrategia', state: strategy ? 'done' : 'todo', detail: strategy && `${strategy.icon} ${strategy.name}`, target: 'simple-step-strategy' },
      { id: 'scan', n: 3, label: 'Escáner', state: stageState('scan'), detail: scan && `${scan.passing.length} de ${scan.analyzed} cumplen`, target: scan && 'simple-panel-scan' },
      { id: 'portfolio', n: 4, label: 'Portafolio Markowitz', state: stageState('portfolio'), detail: pf ? `${pf.allocations.length} acciones` : run?.portfolioError && 'Sin portafolio', target: (pf || run?.portfolioError) && 'simple-panel-portfolio' },
      { id: 'backtest', n: 5, label: 'Backtest', state: stageState('backtest'), detail: bt ? `${pct(bt.summary.ret)} · ${'★'.repeat(bt.summary.stars) || 'sin estrellas'}` : run?.backtestError && 'Sin resultado', target: (bt || run?.backtestError) && 'simple-panel-backtest' },
    ];
    const fmtCol = (v, fmt) => fmt === 'pct' ? pct(v) : fmt === 'num' ? num(v, 1) : (v ?? '—');

    return (
      <div className="simple-mode">
        <section className="simple-hero">
          <h1>Radar Onix · Simulador de inversión</h1>
          <p>Del escáner al portafolio: elige un mercado y una estrategia y sigue el proceso completo con datos reales.</p>
        </section>

        <ol className="simple-pipeline simple-path" aria-label="Camino del análisis">
          {path.map(s => (
            <li key={s.id} data-state={s.state}>
              <button type="button" onClick={() => goTo(s.target)} disabled={!s.target} aria-label={`Paso ${s.n}: ${s.label}`}>
                <span className="dot">{s.n}</span>
                <span><b>{s.label}</b>{s.state === 'active'
                  ? <small role="status">{progress || 'Trabajando…'}</small>
                  : s.detail && <small>{s.detail}</small>}</span>
              </button>
            </li>))}
        </ol>

        <div className="simple-setup">
          <section className="simple-step" aria-labelledby="simple-step-market">
            <h2 id="simple-step-market"><span className={'simple-step-n' + (market ? ' done' : '')}>1</span>Mercado</h2>
            <div className="simple-grid simple-grid-groups">
              {groups.map(g => (
                <button type="button" key={g.id} className="simple-card compact" aria-pressed={g.id === group.id} disabled={running}
                  onClick={() => { if(g.id !== group.id) setMarketId(g.options[0].id); }}>
                  <span className="simple-card-icon">{g.icon}</span><strong>{g.name}</strong><span>{g.blurb}</span>
                </button>
              ))}
            </div>
            <div className="simple-options" role="group" aria-label={`Universo de ${group.name}`}>
              {group.options.map(o => (
                <button type="button" key={o.id} aria-pressed={o.id === marketId} disabled={running} onClick={() => setMarketId(o.id)}
                  title={o.heavy ? 'Más de 1.000 activos: la primera carga puede tardar 1-2 minutos' : undefined}>
                  {o.name}<small>{countOf(o)}</small>
                </button>
              ))}
            </div>
            <p className="simple-note">{`Universo: ${countOf(market)} activos · comparado con comprar ${market.holdLabel}${market.heavy ? ' · la primera carga puede tardar 1-2 minutos' : ''}${market.note ? ' · ' + market.note : ''}`}</p>
          </section>
          <section className="simple-step" aria-labelledby="simple-step-strategy">
            <h2 id="simple-step-strategy"><span className={'simple-step-n' + (strategy ? ' done' : '')}>2</span>Estrategia</h2>
            <div className="simple-grid simple-grid-3">
              {strategies.map(st => (
                <div key={st.id} className="simple-card-wrap">
                  <button type="button" className="simple-card simple-card-strategy" aria-pressed={st.id === strategyId} onClick={() => setStrategyId(st.id)} disabled={running}>
                    <span className="simple-card-icon">{st.icon}</span><strong>{st.name}</strong><span>{st.pitch}</span>
                    <span className="simple-ind-list" aria-label="Indicadores">{st.indicators.map(i => <i key={i.name}>{i.name}</i>)}<i className="tf">Velas semanales</i></span>
                    <em className="simple-badge">{st.isBase ? '★ Base · ' + st.level : st.level}</em>
                  </button>
                  <div className={'simple-tip' + (tipOpen === st.id ? ' open' : '')} onMouseLeave={() => setTipOpen(t => t === st.id ? null : t)}>
                    <button type="button" className="simple-tip-btn" aria-label={`Ver el detalle de ${st.name}`} aria-expanded={tipOpen === st.id}
                      onClick={() => setTipOpen(t => t === st.id ? null : st.id)}>i</button>
                    <div className="simple-tip-pop" role="tooltip">
                      <strong>{`${st.icon} ${st.name}`}</strong>
                      <div className="simple-tip-sec simple-tip-plain"><p><b>Compra:</b> {st.buy}</p><p><b>Vende:</b> {st.sell}</p></div>
                      <div className="simple-tip-sec"><b>Compra cuando se cumplen todas:</b><ul>{st.rulesBuy.map(r => <li key={r}>{r}</li>)}</ul></div>
                      <div className="simple-tip-sec"><b>Vende cuando:</b><ul>{st.rulesSell.map(r => <li key={r}>{r}</li>)}</ul></div>
                      <div className="simple-tip-sec"><b>Indicadores (velas semanales):</b><ul>{st.indicators.map(i => <li key={i.name}><b>{i.name}:</b> {i.what}</li>)}</ul></div>
                      <div className="simple-tip-sec"><b>Cómo se evalúa:</b><ul>{C.SIMPLE_PROCESS_METRICS.map(m => <li key={m}>{m}</li>)}</ul></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="simple-launch">
            <div className="simple-periods" role="group" aria-label="Periodo del backtest">
              <span>Backtest:</span>
              {periods.map(p => <button type="button" key={p.years} aria-pressed={p.years === years} onClick={() => setYears(p.years)} disabled={running}>{p.label}</button>)}
            </div>
            {!running && <button type="button" className="simple-play" onClick={execute} disabled={!ready}>
              {strategy ? '▶  Ejecutar análisis' : 'Elige una estrategia para empezar'}
            </button>}
            {running && <button type="button" className="simple-link" onClick={() => abortRef.current?.abort()}>Cancelar</button>}
          </div>
          {error && <div className="simple-error" role="alert">{error}</div>}
        </div>

        {run && <div ref={sectionRef}>
          {scan && <section id="simple-panel-scan" className="simple-panel" aria-label="Escáner">
            <header><span className={'simple-panel-n' + (done('scan') ? ' done' : '')}>3</span><div>
              <h2>Escáner · ¿qué acciones cumplen hoy la estrategia?</h2>
              <p>Se revisan todas las acciones del mercado con la última vela semanal cerrada y se quedan las que cumplen las reglas de compra.</p>
              <p className="simple-applied"><b>{`${run.strategy.icon} ${run.strategy.name}:`}</b> {run.strategy.rulesBuy.join(' · ')}</p>
            </div></header>
            <div className="simple-kpis">
              <div><span>Acciones analizadas</span><strong>{scan.analyzed}</strong></div>
              <div><span>Cumplen la estrategia</span><strong>{scan.passing.length}</strong></div>
              <div><span>Del mercado</span><strong>{scan.analyzed ? pct(scan.passing.length / scan.analyzed, 0, false) : '—'}</strong></div>
            </div>
            {scan.passing.length ? <div className="simple-scan-grid">
              <div className="simple-table-wrap"><table className="simple-table simple-table-pick">
                <thead><tr><th>#</th><th>Acción</th><th>Precio</th><th>Semana</th>
                  {run.strategy.columns.map(col => <th key={col.label} title={col.hint}>{col.label}</th>)}
                  <th title="Rentabilidad por unidad de riesgo en el último año">Sharpe 1a</th><th/></tr></thead>
                <tbody>{scan.passing.slice(0, 12).map((r, i) => (
                  <tr key={r.ticker} tabIndex={0} aria-selected={r.ticker === selected} className={r.ticker === selected ? 'sel' : ''}
                    onClick={() => setSelTicker(r.ticker)} onKeyDown={e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); setSelTicker(r.ticker); } }}>
                    <td>{i + 1}</td><td><b>{r.ticker}</b></td><td>{num(r.price)}</td>
                    <td className={r.chg >= 0 ? 'up' : 'down'}>{pct(r.chg)}</td>
                    {r.values.map((v, k) => <td key={k}>{fmtCol(v, run.strategy.columns[k].fmt)}</td>)}
                    <td>{num(r.sharpe1y)}</td>
                    <td>{inPortfolio.has(r.ticker) && <span className="simple-tag">En cartera</span>}</td>
                  </tr>))}</tbody>
              </table>
              <p className="simple-note">{`Haz clic en una fila para ver su gráfico.${scan.passing.length > 12 ? ` Y ${scan.passing.length - 12} acciones más.` : ''} Las ${Math.min(scan.passing.length, C.SIMPLE_CANDIDATES)} con mejor Sharpe del último año pasan al optimizador.`}</p></div>
              {selected && <SimpleCandles ticker={selected} data={cacheRef.current[selected]?.['1wk']} strategy={run.strategy} currency={cur}
                row={scan.passing.find(r => r.ticker === selected)}/>}
            </div>
              : <p className="simple-note">Hoy ninguna acción del mercado cumple las reglas: la estrategia esperaría.</p>}
          </section>}

          {run.portfolioError && <section id="simple-panel-portfolio" className="simple-panel" aria-label="Portafolio"><header><span className="simple-panel-n error">4</span><div><h2>Portafolio de Markowitz</h2><p>{run.portfolioError}</p></div></header></section>}
          {pf && <section id="simple-panel-portfolio" className="simple-panel" aria-label="Portafolio de Markowitz">
            <header><span className={'simple-panel-n' + (done('portfolio') ? ' done' : '')}>4</span><div>
              <h2>Portafolio de Markowitz · ¿cuánto invertir en cada acción?</h2>
              <p>El optimizador prueba miles de combinaciones de pesos con las rentabilidades y correlaciones históricas y elige la de máximo Sharpe: la mejor rentabilidad por unidad de riesgo. Máximo 10 acciones y 25 % por acción.</p>
            </div></header>
            <div className="simple-kpis">
              <div><span>Rentabilidad esperada</span><strong>{pct(pf.chosenPoint.ret / 100)}</strong><small>anual, histórica</small></div>
              <div><span>Volatilidad (riesgo)</span><strong>{pct(pf.chosenPoint.vol / 100, 1, false)}</strong><small>anual</small></div>
              <div><span>Ratio de Sharpe</span><strong>{num((pf.chosenPoint.ret - 3) / pf.chosenPoint.vol)}</strong><small>tasa libre de riesgo 3 %</small></div>
              <div><span>Acciones</span><strong>{pf.allocations.length}</strong><small>{`de ${Math.min(scan?.passing.length || 0, C.SIMPLE_CANDIDATES)} candidatas`}</small></div>
            </div>
            <div className="simple-portfolio-grid">
              <FrontierChart portfolio={pf}/>
              <div className="simple-weights">
                <div className="simple-weights-head">
                  <h3>Reparto del dinero</h3>
                  <div className="simple-switch" role="group" aria-label="Ver el reparto">
                    <button type="button" aria-pressed={weightView === 'stock'} onClick={() => setWeightView('stock')}>Por acción</button>
                    <button type="button" aria-pressed={weightView === 'sector'} onClick={() => setWeightView('sector')}>Por sector</button>
                  </div>
                </div>
                {weightView === 'stock'
                  ? <Donut key="stock" title="Peso por acción" currency={cur} center={{ value: String(pf.allocations.length), label: 'acciones' }} items={(() => {
                      const items = pf.allocations.map(a => ({ key: a.ticker, label: a.ticker, sub: a.shortName && a.shortName !== a.ticker ? a.shortName : sectorEs(a.sector), weight: Math.abs(a.weight) }));
                      const cash = 1 - items.reduce((t, i) => t + i.weight, 0);
                      // Con pocas acciones, el límite de 25 % por acción deja parte en efectivo.
                      if(cash > 0.01) items.push({ key: 'cash', label: 'Efectivo', sub: 'límite de 25 % por acción', weight: cash, color: 'var(--text-3)' });
                      return items;
                    })()}/>
                  : <Donut key="sector" title="Peso por sector" currency={cur} center={{ value: String((pf.sectors || []).length), label: 'sectores' }}
                      items={(pf.sectors || []).map(sc => ({ key: sc.name, label: sectorEs(sc.name), sub: `${sc.count} acción${sc.count > 1 ? 'es' : ''}`, weight: sc.weight }))}/>}
              </div>
            </div>
          </section>}

          {run.backtestError && <section id="simple-panel-backtest" className="simple-panel" aria-label="Backtest"><header><span className="simple-panel-n error">5</span><div><h2>Backtest</h2><p>{run.backtestError}</p></div></header></section>}
          {bt && <section id="simple-panel-backtest" className="simple-panel simple-result" aria-label="Resultado del backtest">
            <header><span className={'simple-panel-n' + (done('backtest') ? ' done' : '')}>5</span><div>
              <h2>Backtest · ¿habría funcionado en el pasado?</h2>
              <p>{`La estrategia se aplica semana a semana desde ${monthYear(bt.summary.start)} con 10.000 ${cur}: compra cuando se cumplen las reglas, vende cuando se cumplen las de salida, reparte el dinero según rentabilidad/riesgo y descuenta comisiones.`}</p>
            </div></header>
            <div className="simple-result-head">
              <div className="simple-result-title">{bt.summary.headline}</div>
              <Stars n={bt.summary.stars}/>
            </div>
            <div className="simple-scores">
              <div className="simple-score main"><span>Estrategia</span><strong>{money(bt.summary.final, cur)}</strong><em className={bt.summary.ret >= 0 ? 'up' : 'down'}>{pct(bt.summary.ret)}</em></div>
              <div className="simple-vs">VS</div>
              <div className="simple-score"><span>{`Comprar ${run.market.holdLabel} y esperar`}</span><strong>{money(bt.summary.benchFinal, cur)}</strong><em className={(bt.summary.benchRet || 0) >= 0 ? 'up' : 'down'}>{pct(bt.summary.benchRet)}</em></div>
            </div>
            <SimpleChart summary={bt.summary} currency={cur} holdLabel={run.market.holdLabel}/>
            <div className="simple-facts simple-facts-6">
              <div><span>Rentabilidad anual</span><strong>{pct(bt.annReturn)}</strong></div>
              <div><span>Ratio de Sharpe</span><strong>{num(bt.sharpe)}</strong></div>
              <div><span>Máxima caída</span><strong>{pct(-bt.summary.dd)}</strong><small>{bt.summary.benchDd != null ? `índice ${pct(-bt.summary.benchDd)}` : ''}</small></div>
              <div><span>Operaciones</span><strong>{bt.summary.trades}</strong></div>
              <div><span>Operaciones ganadoras</span><strong>{bt.summary.winRate != null ? Math.round(bt.summary.winRate * 100) + ' %' : '—'}</strong></div>
              <div><span>Comisiones pagadas</span><strong>{money(bt.commissions, cur)}</strong></div>
            </div>
            <div className="simple-stars-help"><span>⭐ ganar dinero</span><span>⭐ ganar al mercado</span><span>⭐ caer menos que el mercado</span></div>
          </section>}
        </div>}

        {ranking.length > 0 && <section className="simple-ranking" aria-label="Tus partidas">
          <div className="simple-ranking-head">
            <h2>🏁 Tus partidas</h2>
            <button type="button" className="simple-link" onClick={() => { setGames([]); saveGames([]); }}>Borrar</button>
          </div>
          <table>
            <thead><tr><th/><th>Estrategia</th><th>Mercado</th><th>Periodo</th><th>Resultado</th><th>Índice</th><th>Estrellas</th></tr></thead>
            <tbody>{ranking.map((g, i) => (
              <tr key={g.id}>
                <td>{medal(i)}</td><td>{`${g.icon} ${g.strategy}`}</td><td>{`${g.flag} ${g.market}`}</td><td>{g.period}</td>
                <td className={g.ret >= 0 ? 'up' : 'down'}>{pct(g.ret)}</td><td>{pct(g.benchRet)}</td><td><Stars n={g.stars} size={15}/></td>
              </tr>
            ))}</tbody>
          </table>
        </section>}

        <p className="simple-disclaimer">Datos reales de Yahoo Finance. Rentabilidades pasadas no garantizan resultados futuros; es una herramienta educativa, no una recomendación de inversión.</p>
      </div>
    );
  }

  window.StockScannerUI.SimpleMode = SimpleMode;
})();
