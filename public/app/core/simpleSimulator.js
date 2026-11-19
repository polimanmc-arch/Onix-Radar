// Modo simple: simulador de estrategias en 3 pasos (mercado → estrategia → simular).
// Traduce opciones en lenguaje sencillo a la configuración del backtest y del scanner existentes
// y resume el resultado como un juego (capital final, ¿ganaste al mercado?, estrellas).
(function(){
  const c = (ind, op, cmp, extra = {}) => ({
    ind, tf: '1wk', op,
    ...(typeof cmp === 'number' ? { cmpType: 'val', cmpVal: cmp } : cmp === 'prev' ? { cmpType: 'prev' } : { cmpType: 'ind', cmpInd: cmp.ind, cmpParams: { p: cmp.p } }),
    params: {}, ...extra,
  });

  // Mercados agrupados por zona: cada cuadro tiene varias opciones de universo.
  // holdLabel: con qué se compara ("comprar ___ y esperar").
  const ETFS = ['SPY','QQQ','DIA','IWM','VTI','EFA','EEM','VGK','EWJ','GLD','SLV','TLT','IEF','HYG','LQD','XLK','XLF','XLE','XLV','XLI','XLY','XLP','XLU','XLB','XLRE','XLC','SMH','ARKK','VNQ','USO','SCHD','VYM','IBIT'];
  // Tipos de interés: son índices de rentabilidad, no activos que se puedan comprar.
  const YIELDS = ['^TNX', '^TYX', '^FVX', '^IRX'];
  const MARKET_GROUPS = [
    { id: 'us', icon: '🗽', name: 'Acciones de EE. UU.', blurb: 'Wall Street: grandes, tecnológicas y pequeñas', options: [
      { id: 'SP500', preset: 'SP500', name: 'S&P 500', benchmark: 'SPY', holdLabel: 'el S&P 500 (SPY)', currency: '$' },
      { id: 'DOW30', preset: 'DOW30', name: 'Dow Jones 30', benchmark: 'DIA', holdLabel: 'el Dow Jones (DIA)', currency: '$' },
      { id: 'NASDAQ100', preset: 'NASDAQ100', name: 'Nasdaq 100', benchmark: 'QQQ', holdLabel: 'el Nasdaq 100 (QQQ)', currency: '$' },
      { id: 'RUSSELL2000_TOP', preset: 'RUSSELL2000_TOP', name: 'Russell 2000 (top 25)', benchmark: 'IWM', holdLabel: 'el Russell 2000 (IWM)', currency: '$' },
      { id: 'ALL', preset: 'ALL', name: 'Todas las americanas', benchmark: 'SPY', holdLabel: 'el S&P 500 (SPY)', currency: '$' },
    ]},
    { id: 'eu', icon: '🏰', name: 'Europa', blurb: 'Los grandes índices europeos', options: [
      { id: 'SPAIN_IBEX35', preset: 'SPAIN_IBEX35', name: 'IBEX 35', benchmark: '^IBEX', holdLabel: 'el IBEX 35', currency: '€' },
      { id: 'GERMANY_DAX', preset: 'GERMANY_DAX', name: 'DAX 40', benchmark: '^GDAXI', holdLabel: 'el DAX 40', currency: '€' },
      { id: 'FRANCE_CAC40', preset: 'FRANCE_CAC40', name: 'CAC 40', benchmark: '^FCHI', holdLabel: 'el CAC 40', currency: '€' },
      { id: 'UK_FTSE100', preset: 'UK_FTSE100', name: 'FTSE 100', benchmark: '^FTSE', holdLabel: 'el FTSE 100', currency: '£' },
      { id: 'ITALY_FTSEMIB', preset: 'ITALY_FTSEMIB', name: 'FTSE MIB', benchmark: 'FTSEMIB.MI', holdLabel: 'el FTSE MIB', currency: '€' },
      { id: 'NETHERLANDS_AEX', preset: 'NETHERLANDS_AEX', name: 'AEX', benchmark: '^AEX', holdLabel: 'el AEX', currency: '€' },
      { id: 'SWITZERLAND_SMI', preset: 'SWITZERLAND_SMI', name: 'SMI', benchmark: '^SSMI', holdLabel: 'el SMI', currency: 'CHF' },
      { id: 'EUROPE_MAJOR_INDICES_COMPONENTS', preset: 'EUROPE_MAJOR_INDICES_COMPONENTS', name: 'Toda Europa', benchmark: '^STOXX50E', holdLabel: 'el Euro Stoxx 50', currency: '€' },
    ]},
    { id: 'assets', icon: '📦', name: 'ETF y otros activos', blurb: 'Fondos cotizados, índices, materias primas y bonos', options: [
      { id: 'ETFS', tickers: ETFS, name: 'ETF populares', benchmark: 'SPY', holdLabel: 'el S&P 500 (SPY)', currency: '$' },
      { id: 'MARKET_INDICES', preset: 'MARKET_INDICES', name: 'Índices mundiales', benchmark: 'SPY', holdLabel: 'el S&P 500 (SPY)', currency: 'pts', exclude: YIELDS, note: 'Los índices no se compran directamente: es un ejercicio teórico (en la práctica se usan ETF).' },
      { id: 'COMMODITIES', preset: 'COMMODITIES', name: 'Oro y materias primas', benchmark: 'GLD', holdLabel: 'oro (GLD)', currency: '$' },
      { id: 'BONDS_TREASURIES', preset: 'BONDS_TREASURIES', name: 'Bonos', benchmark: 'AGG', holdLabel: 'bonos (AGG)', currency: '$', exclude: YIELDS, note: 'ETF y futuros de bonos; sin los tipos de interés, que no se pueden comprar.' },
      { id: 'MACRO_ASSETS', preset: 'MACRO_ASSETS', name: 'Activos macro', benchmark: 'SPY', holdLabel: 'el S&P 500 (SPY)', currency: '$', exclude: YIELDS },
    ]},
    { id: 'global', icon: '🌍', name: 'Universo completo', blurb: 'Todas las acciones o todos los activos a la vez', options: [
      { id: 'ALL_INDEX_COMPANIES', preset: 'ALL_INDEX_COMPANIES', name: 'Todas las acciones', benchmark: 'ACWI', holdLabel: 'el mundo (ACWI)', currency: '$', heavy: true },
      { id: 'GLOBAL_FULL_UNIVERSE', preset: 'GLOBAL_FULL_UNIVERSE', name: 'Todos los activos', benchmark: 'ACWI', holdLabel: 'el mundo (ACWI)', currency: '$', heavy: true },
    ]},
  ];
  const MARKETS = MARKET_GROUPS.flatMap(g => g.options.map(o => ({ ...o, group: g.id, icon: g.icon })));

  // Indicadores (para mostrar qué usa cada estrategia y explicarlo).
  const IND = {
    WMA30: { name: 'WMA 30', what: 'Media móvil ponderada de 30 semanas: tendencia de fondo, con más peso en las semanas recientes.' },
    RSI4: { name: 'RSI 4', what: 'Índice de fuerza relativa de 4 semanas (0-100): por debajo de 30-35 indica una caída fuerte reciente (sobreventa).' },
    STOCH1: { name: 'Estocástico %K 1', what: 'Dónde cerró la semana dentro de su rango máximo-mínimo (0-100): por debajo de 20 cerró cerca del mínimo.' },
    SMA40: { name: 'SMA 40', what: 'Media móvil simple de 40 semanas (unos 9 meses): referencia de la tendencia de largo plazo.' },
    SMA10: { name: 'SMA 10', what: 'Media móvil simple de 10 semanas: tendencia de corto plazo.' },
    RSI14: { name: 'RSI 14', what: 'Índice de fuerza relativa de 14 semanas (0-100): por encima de 60 indica fuerza sostenida.' },
    HIGH52: { name: 'Distancia al máximo 52 sem.', what: 'Cuánto cotiza por debajo de su precio máximo del último año.' },
  };
  // Cómo se evalúa todo el proceso (igual para todas las estrategias).
  const PROCESS_METRICS = [
    'Escáner: última vela semanal cerrada; las señales se ordenan por ratio de Sharpe del último año.',
    'Portafolio: Markowitz con retornos semanales de unos 2 años; elige el máximo Sharpe (10.000 combinaciones, 2-25 % por acción, filtro de correlación > 0,85).',
    'Backtest: revisión semanal, máx. 10 posiciones con peso por Sharpe reciente, comisión 0,1 % y deslizamiento 0,05 %; mide rentabilidad total y anual, Sharpe, máxima caída y % de operaciones ganadoras.',
  ];

  const STRATEGIES = [
    {
      id: 'base', icon: '🎯', name: 'Estrategia base Radar Onix', level: 'Rebote en tendencia', isBase: true,
      pitch: 'Compra acciones con tendencia alcista que acaban de sufrir una caída fuerte, para aprovechar el rebote.',
      buy: 'La tendencia de fondo sube, el RSI marca sobreventa y la semana cerró cerca de su mínimo.',
      sell: 'La tendencia de fondo se gira, o el RSI y el estocástico marcan sobrecompra.',
      indicators: [IND.WMA30, IND.RSI4, IND.STOCH1],
      rulesBuy: ['WMA(30) sube respecto a la semana anterior', 'RSI(4) < 35', 'Estocástico %K(1) < 20'],
      rulesSell: ['WMA(30) baja respecto a la semana anterior', 'o bien RSI(4) > 65 y Estocástico %K(1) > 80'],
      entry: [c('WMA', '>', 'prev', { params: { p: 30 } }), c('RSI', '<', 35, { params: { p: 4 } }), c('STOCH', '<', 20, { params: { p: 1, ks: 1, dp: 1 } })],
      exit: [[c('WMA', '<', 'prev', { params: { p: 30 } })], [c('RSI', '>', 65, { params: { p: 4 } }), c('STOCH', '>', 80, { params: { p: 1, ks: 1, dp: 1 } })]],
      columns: [
        { label: 'RSI 4', hint: 'Sobreventa por debajo de 35', get: fr => fr[1]?.val, fmt: 'num' },
        { label: 'Estocástico 1', hint: 'Cierre cerca del mínimo por debajo de 20', get: fr => fr[2]?.val, fmt: 'num' },
        { label: 'WMA 30', hint: 'Dirección de la tendencia de fondo', get: fr => (fr[0]?.pass ? 'Sube' : 'Baja'), fmt: 'text' },
      ],
    },
    {
      id: 'trend', icon: '🚀', name: 'Seguir la tendencia', level: 'Tendencia',
      pitch: 'Se sube a las acciones que llevan meses subiendo y se baja cuando dejan de hacerlo.',
      buy: 'El precio está por encima de su media de 40 semanas y la media corta supera a la larga.',
      sell: 'El precio cae por debajo de su media de 40 semanas.',
      indicators: [IND.SMA40, IND.SMA10],
      rulesBuy: ['Precio > SMA(40)', 'SMA(10) > SMA(40)'],
      rulesSell: ['Precio < SMA(40)'],
      entry: [c('PRICE', '>', { ind: 'SMA', p: 40 }), c('SMA', '>', { ind: 'SMA', p: 40 }, { params: { p: 10 } })],
      exit: [[c('PRICE', '<', { ind: 'SMA', p: 40 })]],
      columns: [
        { label: 'Precio vs SMA 40', hint: 'Cuánto cotiza por encima de su media de 40 semanas', get: fr => (fr[0]?.cmp ? fr[0].val / fr[0].cmp - 1 : null), fmt: 'pct' },
        { label: 'SMA 10 vs SMA 40', hint: 'La media corta por encima de la larga confirma la tendencia', get: fr => (fr[1]?.cmp ? fr[1].val / fr[1].cmp - 1 : null), fmt: 'pct' },
      ],
    },
    {
      id: 'momentum', icon: '⚡', name: 'Momentum', level: 'Fuerza',
      pitch: 'Compra a los líderes: acciones con mucha fuerza cerca de sus máximos del año.',
      buy: 'Tiene fuerza (RSI alto) y cotiza a menos de un 5 % de su máximo de 52 semanas.',
      sell: 'Pierde la fuerza (el RSI baja de 45).',
      indicators: [IND.RSI14, IND.HIGH52],
      rulesBuy: ['RSI(14) > 60', 'Distancia al máximo de 52 semanas > -5 %'],
      rulesSell: ['RSI(14) < 45'],
      entry: [c('RSI', '>', 60, { params: { p: 14 } }), c('DIST_HIGH', '>', -5, { params: { p: 52 } })],
      exit: [[c('RSI', '<', 45, { params: { p: 14 } })]],
      columns: [
        { label: 'RSI 14', hint: 'Fuerza del movimiento (alto = mucha fuerza)', get: fr => fr[0]?.val, fmt: 'num' },
        { label: 'Distancia al máximo', hint: 'Qué tan cerca está de su máximo del año', get: fr => (fr[1]?.val != null ? fr[1].val / 100 : null), fmt: 'pct' },
      ],
    },
  ];

  const PERIODS = [ { years: 1, weeks: 52, label: '1 año' }, { years: 3, weeks: 156, label: '3 años' } ];
  const CAPITAL = 10000;

  const withIds = list => list.map((x, i) => ({ _id: 'simple_' + i + '_' + x.ind, ...JSON.parse(JSON.stringify(x)) }));
  const universeTickers = market => {
    const list = market.tickers || window.StockScannerConfig?.UNIVERSE_PRESETS?.[market.preset]?.tickers || [];
    return market.exclude ? list.filter(t => !market.exclude.includes(t)) : list;
  };
  // Lista explícita cuando el universo es propio, tiene exclusiones o es enorme: así el backtest usa
  // exactamente los mismos activos que el escáner (el preset "Universo completo" del modo experto
  // añade además todas las acciones de EE. UU. del Nasdaq).
  const explicitUniverse = market => !!(market.tickers || market.exclude || market.heavy);

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
      btUniverseSource: explicitUniverse(market) ? 'custom' : market.preset,
      btCustomTickers: explicitUniverse(market) ? universeTickers(market).join(', ') : '',
      btUniverseLimit: 0, savedUniverseLists: [], btLightMemory: false,
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
    SIMPLE_MARKETS: MARKETS, SIMPLE_MARKET_GROUPS: MARKET_GROUPS, SIMPLE_PROCESS_METRICS: PROCESS_METRICS, simpleUniverseTickers: universeTickers, SIMPLE_STRATEGIES: STRATEGIES, SIMPLE_PERIODS: PERIODS, SIMPLE_CAPITAL: CAPITAL,
    buildSimpleBacktestOptions, summarizeSimpleResult,
  });
})();
