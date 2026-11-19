// Modo simple: simulador de estrategias en 3 pasos (mercado → estrategia → simular).
// Traduce opciones en lenguaje sencillo a la configuración del backtest y del scanner existentes
// y resume el resultado como un juego (capital final, ¿ganaste al mercado?, estrellas).
(function(){
  const c = (ind, op, cmp, extra = {}) => ({
    ind, tf: '1wk', op,
    ...(typeof cmp === 'number' ? { cmpType: 'val', cmpVal: cmp } : cmp === 'prev' ? { cmpType: 'prev' } : { cmpType: 'ind', cmpInd: cmp.ind, cmpParams: { p: cmp.p } }),
    params: {}, ...extra,
  });

  const MARKETS = [
    { id: 'SP500', preset: 'SP500', name: 'S&P 500', flag: '🗽', blurb: 'Las 500 mayores empresas de EE. UU.', benchmark: 'SPY', currency: '$' },
    { id: 'DOW30', preset: 'DOW30', name: 'Dow Jones 30', flag: '🇺🇸', blurb: 'Las 30 grandes clásicas de EE. UU.', benchmark: 'DIA', currency: '$' },
    { id: 'NASDAQ100', preset: 'NASDAQ100', name: 'Nasdaq 100', flag: '💻', blurb: 'Tecnológicas y crecimiento', benchmark: 'QQQ', currency: '$' },
    { id: 'SPAIN_IBEX35', preset: 'SPAIN_IBEX35', name: 'IBEX 35', flag: '🇪🇸', blurb: 'Las mayores empresas españolas', benchmark: '^IBEX', currency: '€' },
    { id: 'GERMANY_DAX', preset: 'GERMANY_DAX', name: 'DAX 40', flag: '🇩🇪', blurb: 'Las grandes de Alemania', benchmark: '^GDAXI', currency: '€' },
  ];

  const STRATEGIES = [
    {
      id: 'dip', icon: '🎯', name: 'Comprar en caídas', level: 'Paciente',
      pitch: 'Compra acciones que van bien pero acaban de caer fuerte, esperando el rebote.',
      buy: 'La tendencia de fondo sube y la acción ha caído con fuerza esta semana.',
      sell: 'Rebota con fuerza o la tendencia de fondo se gira.',
      entry: [c('WMA', '>', 'prev', { params: { p: 30 } }), c('RSI', '<', 35, { params: { p: 4 } })],
      exit: [[c('WMA', '<', 'prev', { params: { p: 30 } })], [c('RSI', '>', 65, { params: { p: 4 } })]],
      columns: [
        { label: 'RSI 4 sem.', hint: 'Fuerza a corto plazo (bajo = caída fuerte)', get: fr => fr[1]?.val, fmt: 'num' },
        { label: 'Media 30 sem.', hint: 'Dirección de la tendencia de fondo', get: fr => (fr[0]?.pass ? 'Sube' : 'Baja'), fmt: 'text' },
      ],
    },
    {
      id: 'trend', icon: '🚀', name: 'Seguir la tendencia', level: 'Tranquilo',
      pitch: 'Se sube a las acciones que llevan meses subiendo y se baja cuando dejan de hacerlo.',
      buy: 'El precio está por encima de su media de 40 semanas y la media corta supera a la larga.',
      sell: 'El precio cae por debajo de su media de 40 semanas.',
      entry: [c('PRICE', '>', { ind: 'SMA', p: 40 }), c('SMA', '>', { ind: 'SMA', p: 40 }, { params: { p: 10 } })],
      exit: [[c('PRICE', '<', { ind: 'SMA', p: 40 })]],
      columns: [
        { label: 'Precio vs media 40 sem.', hint: 'Cuánto cotiza por encima de su media de 40 semanas', get: fr => (fr[0]?.cmp ? fr[0].val / fr[0].cmp - 1 : null), fmt: 'pct' },
        { label: 'Media 10 vs 40 sem.', hint: 'La media corta por encima de la larga confirma la tendencia', get: fr => (fr[1]?.cmp ? fr[1].val / fr[1].cmp - 1 : null), fmt: 'pct' },
      ],
    },
    {
      id: 'momentum', icon: '⚡', name: 'Momentum', level: 'Atrevido',
      pitch: 'Compra a los líderes: acciones con mucha fuerza cerca de sus máximos del año.',
      buy: 'Tiene fuerza (RSI alto) y cotiza a menos de un 5 % de su máximo de 52 semanas.',
      sell: 'Pierde la fuerza (el RSI baja de 45).',
      entry: [c('RSI', '>', 60, { params: { p: 14 } }), c('DIST_HIGH', '>', -5, { params: { p: 52 } })],
      exit: [[c('RSI', '<', 45, { params: { p: 14 } })]],
      columns: [
        { label: 'RSI 14 sem.', hint: 'Fuerza del movimiento (alto = mucha fuerza)', get: fr => fr[0]?.val, fmt: 'num' },
        { label: 'Distancia al máximo 52 sem.', hint: 'Qué tan cerca está de su máximo del año', get: fr => (fr[1]?.val != null ? fr[1].val / 100 : null), fmt: 'pct' },
      ],
    },
  ];

  const PERIODS = [ { years: 1, weeks: 52, label: '1 año' }, { years: 3, weeks: 156, label: '3 años' } ];
  const CAPITAL = 10000;

  const withIds = list => list.map((x, i) => ({ _id: 'simple_' + i + '_' + x.ind, ...JSON.parse(JSON.stringify(x)) }));

  function buildSimpleBacktestOptions({ market, strategy, period }){
    return {
      entryRules: [{ _id: 'g1', conditions: withIds(strategy.entry) }],
      exitRules: strategy.exit.map((g, i) => ({ _id: 'x' + i, conditions: withIds(g) })),
      shortEntryRules: [], shortExitRules: [], btDirection: 'long',
      // Sin stops: evitan descargar velas de 4 horas y el resultado se explica sólo con las reglas.
      stopATR: false, stopATRMult: 2, stopPct: false, stopPctVal: 10,
      btWeeks: period.weeks, btCapital: CAPITAL, pfMaxPos: 10, pfRiskFree: 3,
      btBenchmark: market.benchmark, btCommission: 0.1, btSlippage: 0.05,
      // Reparte el capital según la relación rentabilidad/riesgo reciente de cada señal (máx. 25 % por acción).
      pfStopATRPeriod: 14, pfMinWeight: 2, pfMaxWeight: 25, pfMode: 'maxsharpe', btAllocationMode: 'maxsharpe',
      btUniverseSource: market.preset, btCustomTickers: '', btUniverseLimit: 0, savedUniverseLists: [],
      mktFilterEnabled: false, mktFilterTicker: market.benchmark, mktFilterTf: '1wk', mktFilterRules: [],
      savedStrategiesLength: 0,
    };
  }

  function maxDrawdown(values){
    let peak = -Infinity, dd = 0;
    for(const v of values){ if(v > peak) peak = v; if(peak > 0) dd = Math.max(dd, (peak - v) / peak); }
    return dd;
  }

  // Resumen "de juego" de un resultado del backtest.
  function summarizeSimpleResult(result, { capital = CAPITAL } = {}){
    const curve = (result?.equityCurve || []).filter(p => Number.isFinite(p.value)).map(p => ({ time: p.time, value: p.value }));
    if(!curve.length) return null;
    const final = curve[curve.length - 1].value;
    const ret = final / capital - 1;
    const bench = (result.benchCurve || []).filter(p => Number.isFinite(p.value)).map(p => ({ time: p.time, value: p.value }));
    const benchFinal = bench.length ? bench[bench.length - 1].value : null;
    const benchRet = benchFinal != null ? benchFinal / capital - 1 : null;
    const dd = maxDrawdown([capital, ...curve.map(p => p.value)]);
    const benchDd = bench.length ? maxDrawdown([capital, ...bench.map(p => p.value)]) : null;
    const trades = (result.allTrades || []).length;
    const stars = (ret > 0 ? 1 : 0) + (benchRet != null && ret > benchRet ? 1 : 0) + (benchDd != null && dd < benchDd ? 1 : 0);
    const beat = benchRet != null ? ret > benchRet : null;
    const headline = beat == null ? (ret >= 0 ? '¡Has ganado dinero!' : 'Esta vez has perdido dinero')
      : beat ? '🏆 ¡Le has ganado al mercado!' : ret >= 0 ? '💪 Has ganado, pero el mercado ganó más' : '📉 Esta vez ganó el mercado';
    return {
      capital, final, ret, benchFinal, benchRet, beat, dd, benchDd, stars, headline,
      trades, winRate: result.winRate ?? null, curve, bench,
      start: curve[0].time, end: curve[curve.length - 1].time,
    };
  }

  // Acciones que hoy cumplen la estrategia, con los precios semanales que el backtest ya descargó
  // (sin un segundo escaneo): última vela semanal cerrada, como el scanner.
  // Sólo las acciones del mercado elegido (la caché también guarda otros mercados y el índice).
  function todaySignals({ dataByTicker, tickers, strategy, limit = 18 }){
    const { buildSignalSliceFromIndex, testFilterAligned } = window.StockScannerCore;
    const out = [];
    for(const ticker of new Set(tickers || [])){
      const d = dataByTicker?.[ticker]?.['1wk'];
      if(!d?.ok) continue;
      const slice = buildSignalSliceFromIndex(d, 1);
      if(!slice.ok) continue;
      if(strategy.entry.every(f => testFilterAligned(f, { '1wk': slice, _meta: {} }).pass)){
        const price = slice.closes[0], prev = slice.closes[1];
        out.push({ ticker, price, chg: prev ? (price / prev - 1) * 100 : null });
      }
    }
    out.sort((a, b) => a.ticker.localeCompare(b.ticker));
    return { total: out.length, list: out.slice(0, limit) };
  }

  // ── Proceso completo: datos → escáner → portafolio de Markowitz ────────────────────────────

  function parseChart(ticker, payload){
    const r = payload?.chart?.result?.[0];
    if(!r?.timestamp) return { ticker, tf: '1wk', ok: false, error: payload?.error || 'Sin datos' };
    const q = r.indicators?.quote?.[0] || {};
    const rows = [];
    r.timestamp.forEach((t, i) => {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], cl = q.close?.[i];
      if([o, h, l, cl].some(x => x == null)) return;
      rows.push({ t, o: +o, h: +h, l: +l, c: +cl, v: +(q.volume?.[i] || 0) });
    });
    rows.sort((a, b) => b.t - a.t);
    const closes = rows.map(x => x.c);
    return { ticker, tf: '1wk', ok: closes.length > 5, opens: rows.map(x => x.o), highs: rows.map(x => x.h), lows: rows.map(x => x.l),
      closes, volumes: rows.map(x => x.v), times: rows.map(x => x.t), price: closes[0], prevClose: closes[1] };
  }

  // Descarga una sola vez los precios semanales del mercado (por lotes) y los deja en la caché que
  // después usan el portafolio y el backtest.
  async function loadWeekly({ tickers, cacheRef, onProgress, signal, fetchImpl = (u, o) => fetch(u, o) }){
    const tf = (window.StockScannerConfig?.TIMEFRAMES || []).find(t => t.id === '1wk') || { yahooInterval: '1wk', yahooRange: '5y' };
    const missing = tickers.filter(t => !cacheRef.current?.[t]?.['1wk']?.ok);
    const size = 100;
    for(let i = 0; i < missing.length; i += size){
      if(signal?.aborted){ const e = new Error('Cancelado'); e.name = 'AbortError'; throw e; }
      const batch = missing.slice(i, i + size);
      const res = await fetchImpl('/api/charts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ symbols: batch, interval: tf.yahooInterval, range: tf.yahooRange, concurrency: 18 }) });
      const json = await res.json().catch(() => ({}));
      for(const t of batch){
        const parsed = parseChart(t, json?.results?.[t]);
        cacheRef.current[t] = { ...(cacheRef.current[t] || {}), '1wk': parsed };
      }
      if(typeof onProgress === 'function') onProgress(Math.min(missing.length, i + size), missing.length);
    }
  }

  function sharpe52(closes){
    const rets = [];
    for(let i = 0; i < 52 && i + 1 < closes.length; i++) if(closes[i + 1] > 0) rets.push(closes[i] / closes[i + 1] - 1);
    if(rets.length < 20) return null;
    const m = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, r) => a + (r - m) ** 2, 0) / (rets.length - 1));
    return sd > 0 ? m / sd * Math.sqrt(52) : null;
  }

  // Escáner sobre la última vela semanal cerrada (como el scanner del modo experto).
  function scanMarket({ tickers, dataByTicker, strategy }){
    const { buildSignalSliceFromIndex, testFilterAligned } = window.StockScannerCore;
    const rows = [];
    let analyzed = 0;
    for(const ticker of new Set(tickers || [])){
      const d = dataByTicker?.[ticker]?.['1wk'];
      if(!d?.ok) continue;
      const slice = buildSignalSliceFromIndex(d, 1);
      if(!slice.ok) continue;
      analyzed++;
      const fr = strategy.entry.map(f => testFilterAligned(f, { '1wk': slice, _meta: {} }));
      if(!fr.every(r => r.pass)) continue;
      const price = slice.closes[0], prev = slice.closes[1];
      rows.push({ ticker, price, chg: prev ? price / prev - 1 : null, values: strategy.columns.map(col => col.get(fr)), sharpe1y: sharpe52(slice.closes) });
    }
    rows.sort((a, b) => (b.sharpe1y ?? -Infinity) - (a.sharpe1y ?? -Infinity));
    return { analyzed, passing: rows };
  }

  const CANDIDATES = 40;
  function buildSimplePortfolioOptions({ strategy, candidates, cacheRef, fetchSectors }){
    return {
      results: candidates.slice(0, CANDIDATES).map(r => ({ ticker: r.ticker, name: r.ticker, passed: true, direction: 'LONG' })),
      filters: withIds(strategy.entry), shortFilters: [],
      pfCapital: CAPITAL, pfMinWeight: 2, pfMaxWeight: 25, pfMaxPos: 10, pfRiskFree: 3,
      pfCorFilter: true, pfCorThresh: 0.85, pfMode: 'maxsharpe', pfSims: 10000, pfSeed: 42,
      pfStopType: 'none', pfStopATRMult: 2, pfStopATRPeriod: 14, pfStopPctVal: 8,
      sectorData: {}, scanDirection: 'long', pfUniverseSource: 'scan', pfManualTickers: '',
      fetchSectors, dataCacheRef: cacheRef, setPfBuilding: () => {}, setTab: () => {},
    };
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore || {}, {
    loadSimpleWeekly: loadWeekly, scanSimpleMarket: scanMarket, buildSimplePortfolioOptions, SIMPLE_CANDIDATES: CANDIDATES,
    todaySimpleSignals: todaySignals,
    SIMPLE_MARKETS: MARKETS, SIMPLE_STRATEGIES: STRATEGIES, SIMPLE_PERIODS: PERIODS, SIMPLE_CAPITAL: CAPITAL,
    buildSimpleBacktestOptions, summarizeSimpleResult,
  });
})();
