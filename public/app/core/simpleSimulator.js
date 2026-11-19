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
      // Igual que "Todo US (Auto)" + "Universo completo" del modo experto: todas las acciones de NYSE, Nasdaq y AMEX
      // (lista del Nasdaq, unas 6.000) más Europa, índices, materias primas y bonos.
      { id: 'MARKET_ALL', dynamic: 'allUs', approx: 7000, name: 'Todo el mercado', benchmark: 'ACWI', holdLabel: 'el mundo (ACWI)', currency: '$', heavy: true, exclude: YIELDS,
        note: 'todas las acciones de NYSE, Nasdaq y AMEX + Europa, índices, materias primas y bonos' },
    ]},
  ];
  const MARKETS = MARKET_GROUPS.flatMap(g => g.options.map(o => ({ ...o, group: g.id, icon: g.icon })));

  // Indicadores (para mostrar qué usa cada estrategia y explicarlo).
  const IND = {
    WMA30: { name: 'WMA 30', what: 'Media móvil ponderada de 30 semanas: tendencia de fondo, con más peso en las semanas recientes.' },
    RSI4: { name: 'RSI 4', what: 'Índice de fuerza relativa de 4 semanas (0-100): por debajo de 30-35 indica una caída fuerte reciente (sobreventa).' },
    STOCH1: { name: 'Stoch %K 1', what: 'Dónde cerró la semana dentro de su rango máximo-mínimo (0-100): por debajo de 20 cerró cerca del mínimo.' },
    SMA40: { name: 'SMA 40', what: 'Media móvil simple de 40 semanas (unos 9 meses): referencia de la tendencia de largo plazo.' },
    SMA10: { name: 'SMA 10', what: 'Media móvil simple de 10 semanas: tendencia de corto plazo.' },
    RSI14: { name: 'RSI 14', what: 'Índice de fuerza relativa de 14 semanas (0-100): por encima de 60 indica fuerza sostenida.' },
    HIGH52: { name: 'Distancia al máximo 52 sem.', what: 'Cuánto cotiza por debajo de su precio máximo del último año.' },
    MKT_SPX: { name: 'Filtro S&P 500', what: 'Filtro de mercado (el mismo del modo experto): sólo se opera si la media ponderada de 30 semanas del S&P 500 (SPY) sube. Si baja, no compra y vende lo que tenga.' },
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
      buy: 'La tendencia de fondo de la acción sube, el RSI marca sobreventa y la semana cerró cerca de su mínimo.',
      sell: 'La tendencia de fondo se gira, o el RSI y el estocástico marcan sobrecompra.',
      indicators: [IND.WMA30, IND.RSI4, IND.STOCH1],
      rulesBuy: ['WMA(30) sube respecto a la semana anterior', 'RSI(4) < 35', 'Stoch %K(1) < 20'],
      rulesSell: ['WMA(30) baja respecto a la semana anterior', 'o bien RSI(4) > 65 y Stoch %K(1) > 80'],
      marketDefault: true, // con el filtro del S&P 500 activado de serie (como en el modo experto)
      entry: [c('WMA', '>', 'prev', { params: { p: 30 } }), c('RSI', '<', 35, { params: { p: 4 } }), c('STOCH', '<', 20, { params: { p: 1, ks: 1, dp: 1 } })],
      exit: [[c('WMA', '<', 'prev', { params: { p: 30 } })], [c('RSI', '>', 65, { params: { p: 4 } }), c('STOCH', '>', 80, { params: { p: 1, ks: 1, dp: 1 } })]],
      columns: [
        { label: 'RSI 4', hint: 'Sobreventa por debajo de 35', get: fr => fr[1]?.val, fmt: 'num' },
        { label: 'Stoch 1', hint: 'Cierre cerca del mínimo por debajo de 20', get: fr => fr[2]?.val, fmt: 'num' },
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

  // Filtro de mercado del modo experto (WMA 30 semanal subiendo), evaluado sobre el S&P 500.
  // Se puede activar o quitar en cualquier estrategia.
  const MARKET_FILTER = { ticker: 'SPY', name: 'S&P 500', rule: c('WMA', '>', 'prev', { params: { p: 30 } }), on: 'WMA(30) del S&P 500 subiendo', off: 'WMA(30) del S&P 500 bajando' };
  const MKT_BUY = 'Filtro de mercado: WMA(30) del S&P 500 sube', MKT_SELL = 'o bien la WMA(30) del S&P 500 baja (vende todo y no compra)';
  function withMarketFilter(strategy, on){
    if(!strategy) return strategy;
    const raw = strategy.raw || strategy;
    if(!on) return raw;
    if(strategy.market) return strategy;
    const lower = t => t.charAt(0).toLowerCase() + t.slice(1);
    return { ...raw, raw, market: MARKET_FILTER,
      buy: 'Con el S&P 500 en tendencia alcista: ' + lower(raw.buy),
      sell: raw.sell.replace(/\.$/, '') + ', o si el S&P 500 se vuelve bajista.',
      indicators: [...raw.indicators, IND.MKT_SPX], rulesBuy: [MKT_BUY, ...raw.rulesBuy], rulesSell: [...raw.rulesSell, MKT_SELL] };
  }
  STRATEGIES.forEach((st, i) => { if(st.marketDefault) STRATEGIES[i] = withMarketFilter(st, true); });

  const PERIODS = [ { years: 1, weeks: 52, label: '1 año' }, { years: 3, weeks: 156, label: '3 años' } ];
  // Periodo libre del backtest: de 1 a 8 años. Hasta 3 años bastan los 5 años de precios semanales del
  // escáner; para más se descargan 10 años (las medias necesitan historia previa al inicio).
  const MAX_YEARS = 8;
  const periodFor = years => { const y = Math.min(MAX_YEARS, Math.max(1, Math.round(Number(years) || 1))); return { years: y, weeks: y * 52, label: y === 1 ? '1 año' : `${y} años` }; };
  const rangeForYears = years => (Number(years) > 3 ? '10y' : '5y');
  const RANGE_YEARS = { '5y': 5, '10y': 10 };
  const CAPITAL = 10000;

  const withIds = list => list.map((x, i) => ({ _id: 'simple_' + i + '_' + x.ind, ...JSON.parse(JSON.stringify(x)) }));
  // Listas que se descargan del servidor (todo el mercado de EE. UU.), una vez por sesión.
  const dynamicLists = {};
  const uniqList = arr => [...new Set((arr || []).filter(Boolean))];
  const universeTickers = market => {
    const cfg = window.StockScannerConfig || {};
    const list = dynamicLists[market.id] || market.tickers || cfg.UNIVERSE_PRESETS?.[market.preset]?.tickers
      || (market.dynamic ? uniqList([...(cfg.ALL_INDEX_COMPANIES || []), ...(cfg.MACRO_ASSETS || [])]) : []);
    return market.exclude ? list.filter(t => !market.exclude.includes(t)) : list;
  };
  const universeReady = market => !market.dynamic || !!dynamicLists[market.id];
  async function resolveUniverse(market, fetchImpl = (u, o) => fetch(u, o)){
    if(market.dynamic === 'allUs' && !dynamicLists[market.id]){
      const cfg = window.StockScannerConfig || {};
      const json = await fetchImpl('/api/tickers').then(r => r.json()).catch(() => ({}));
      const allUs = Array.isArray(json?.tickers) ? json.tickers.map(t => String(t).toUpperCase()).filter(Boolean) : [];
      if(!allUs.length) throw new Error('No se pudo descargar la lista de todas las acciones del mercado. Inténtalo de nuevo.');
      dynamicLists[market.id] = uniqList([...(cfg.ALL_INDEX_COMPANIES || []), ...allUs, ...(cfg.MACRO_ASSETS || [])]);
    }
    return universeTickers(market);
  }
  // Lista explícita cuando el universo es propio, tiene exclusiones o es enorme: así el backtest usa
  // exactamente los mismos activos que el escáner (el preset "Universo completo" del modo experto
  // añade además todas las acciones de EE. UU. del Nasdaq).
  const explicitUniverse = market => !!(market.tickers || market.exclude || market.heavy);

  function buildSimpleBacktestOptions({ market, strategy, period, capital = CAPITAL, weighting = 'markowitz' }){
    const equal = weighting === 'equal';
    return {
      entryRules: [{ _id: 'g1', conditions: withIds(strategy.entry) }],
      exitRules: strategy.exit.map((g, i) => ({ _id: 'x' + i, conditions: withIds(g) })),
      shortEntryRules: [], shortExitRules: [], btDirection: 'long',
      // Sin stops: evitan descargar velas de 4 horas y el resultado se explica sólo con las reglas.
      stopATR: false, stopATRMult: 2, stopPct: false, stopPctVal: 10,
      btWeeks: period.weeks, btCapital: capital, pfMaxPos: 10, pfRiskFree: 3,
      btBenchmark: market.benchmark, btCommission: 0.1, btSlippage: 0.05,
      // Reparte el capital según la relación rentabilidad/riesgo reciente de cada señal (máx. 25 % por acción).
      // Con reparto igual, cada posición recibe la misma parte del dinero.
      pfStopATRPeriod: 14, pfMinWeight: 2, pfMaxWeight: 25, pfMode: equal ? 'equalweight' : 'maxsharpe', btAllocationMode: equal ? 'equal' : 'maxsharpe',
      btUniverseSource: explicitUniverse(market) ? 'custom' : market.preset,
      btCustomTickers: explicitUniverse(market) ? universeTickers(market).join(', ') : '',
      btUniverseLimit: 0, savedUniverseLists: [], btLightMemory: false,
      mktFilterEnabled: !!strategy.market, mktFilterTicker: strategy.market?.ticker || market.benchmark, mktFilterTf: '1wk',
      mktFilterRules: strategy.market ? [{ _id: 'mkt', conditions: withIds([strategy.market.rule]) }] : [],
      mktRegimeTicker: strategy.market?.ticker || null,
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
  const inflightWeekly = new Map(); // descargas de precios semanales en curso, por acción y rango
  async function loadWeekly({ tickers, cacheRef, onProgress, signal, range = null, fetchImpl = (u, o) => fetch(u, o) }){
    const tf = (window.StockScannerConfig?.TIMEFRAMES || []).find(t => t.id === '1wk') || { yahooInterval: '1wk', yahooRange: '5y' };
    const want = range || tf.yahooRange;
    // Falta si no hay datos o si se descargaron con menos años de los que se piden ahora.
    // (Datos sin marca de rango con más de ~5,5 años de velas ya cubren los 10 años pedidos.)
    const yearsOf = d => RANGE_YEARS[d.range] || (d.closes.length > 290 ? 10 : 5);
    const missing = [...new Set(tickers)].filter(t => { const d = cacheRef.current?.[t]?.['1wk']; return !d?.ok || yearsOf(d) < (RANGE_YEARS[want] || 5); });
    if(!missing.length) return;
    // Las acciones que ya se están descargando (p. ej. la precarga al elegir el mercado) no se piden dos veces.
    const waiting = new Map(), toFetch = [];
    missing.forEach(t => { const p = inflightWeekly.get(t + '|' + want); if(p) waiting.set(p, (waiting.get(p) || 0) + 1); else toFetch.push(t); });
    let done = 0;
    const report = n => { done += n; if(typeof onProgress === 'function') onProgress(Math.min(missing.length, done), missing.length); };
    const aborted = () => { if(signal?.aborted){ const e = new Error('Cancelado'); e.name = 'AbortError'; throw e; } };
    const size = 100, parallel = 3;
    const batches = [];
    for(let i = 0; i < toFetch.length; i += size) batches.push(toFetch.slice(i, i + size));
    const fetchBatch = async batch => {
      const res = await fetchImpl('/api/charts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
        body: JSON.stringify({ symbols: batch, interval: tf.yahooInterval, range: want, concurrency: 12, compact: true }) });
      const json = await res.json().catch(() => ({}));
      for(const t of batch){
        const parsed = { ...parseChart(t, json?.results?.[t]), range: want };
        cacheRef.current[t] = { ...(cacheRef.current[t] || {}), '1wk': parsed };
      }
    };
    // Una promesa por lote, registrada antes de empezar para que otras llamadas la esperen.
    const slots = batches.map(batch => {
      let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); promise.catch(() => {});
      batch.forEach(t => inflightWeekly.set(t + '|' + want, promise));
      return { promise, resolve, reject };
    });
    const cleanup = k => batches[k].forEach(t => { if(inflightWeekly.get(t + '|' + want) === slots[k].promise) inflightWeekly.delete(t + '|' + want); });
    let next = 0;
    // Hasta 3 lotes a la vez.
    const worker = async () => {
      while(next < batches.length){
        const k = next++;
        try{ aborted(); await fetchBatch(batches[k]); slots[k].resolve(); }
        catch(e){
          for(let j = k; j < batches.length; j++){ if(j === k || j >= next){ slots[j].reject(e); cleanup(j); } }
          next = batches.length; throw e;
        }
        cleanup(k); report(batches[k].length);
      }
    };
    const own = Promise.all(Array.from({ length: Math.min(parallel, batches.length) }, worker));
    const others = Promise.all([...waiting].map(([p, count]) => p.catch(() => {}).then(() => report(count))));
    await Promise.all([own, others]);
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
  function marketFilterStatus({ strategy, dataByTicker }){
    if(!strategy.market) return null;
    const { buildSignalSliceFromIndex, testFilterAligned } = window.StockScannerCore;
    const d = dataByTicker?.[strategy.market.ticker]?.['1wk'];
    const slice = d?.ok ? buildSignalSliceFromIndex(d, 1) : null;
    if(!slice?.ok) return { ...strategy.market, ok: null };
    const r = testFilterAligned(strategy.market.rule, { '1wk': slice, _meta: {} });
    return { ...strategy.market, ok: !!r.pass, value: r.val, price: slice.closes[0] };
  }

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
    return { analyzed, passing: rows, market: marketFilterStatus({ strategy, dataByTicker }) };
  }

  const CANDIDATES = 40;
  function buildSimplePortfolioOptions({ strategy, candidates, cacheRef, fetchSectors, capital = CAPITAL, weighting = 'markowitz' }){
    const equal = weighting === 'equal';
    return {
      results: candidates.slice(0, CANDIDATES).map(r => ({ ticker: r.ticker, name: r.ticker, passed: true, direction: 'LONG' })),
      filters: withIds(strategy.entry), shortFilters: [],
      // Igual para todas: 1/n por acción (sin el tope de 25 %, para que con pocas acciones también sea igual).
      pfCapital: capital, pfMinWeight: equal ? 0 : 2, pfMaxWeight: equal ? 100 : 25, pfMaxPos: 10, pfRiskFree: 3,
      pfCorFilter: true, pfCorThresh: 0.85, pfMode: equal ? 'equalweight' : 'maxsharpe', pfSims: 10000, pfSeed: 42,
      pfStopType: 'none', pfStopATRMult: 2, pfStopATRPeriod: 14, pfStopPctVal: 8,
      sectorData: {}, scanDirection: 'long', pfUniverseSource: 'scan', pfManualTickers: '',
      fetchSectors, dataCacheRef: cacheRef, setPfBuilding: () => {}, setTab: () => {},
    };
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore || {}, {
    loadSimpleWeekly: loadWeekly, scanSimpleMarket: scanMarket, buildSimplePortfolioOptions, SIMPLE_CANDIDATES: CANDIDATES,
    todaySimpleSignals: todaySignals,
    SIMPLE_MARKETS: MARKETS, SIMPLE_MARKET_GROUPS: MARKET_GROUPS, SIMPLE_PROCESS_METRICS: PROCESS_METRICS, simpleUniverseTickers: universeTickers, resolveSimpleUniverse: resolveUniverse, simpleUniverseReady: universeReady, SIMPLE_STRATEGIES: STRATEGIES, simpleWithMarketFilter: withMarketFilter, SIMPLE_PERIODS: PERIODS, SIMPLE_MAX_YEARS: MAX_YEARS, simplePeriod: periodFor, simpleRangeForYears: rangeForYears, SIMPLE_CAPITAL: CAPITAL,
    buildSimpleBacktestOptions, summarizeSimpleResult,
  });
})();
