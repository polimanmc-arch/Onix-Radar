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
    { id: 'DOW30', preset: 'DOW30', name: 'Dow Jones 30', flag: '🇺🇸', blurb: 'Las 30 grandes clásicas de EE. UU.', benchmark: 'SPY', currency: '$' },
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
    },
    {
      id: 'trend', icon: '🚀', name: 'Seguir la tendencia', level: 'Tranquilo',
      pitch: 'Se sube a las acciones que llevan meses subiendo y se baja cuando dejan de hacerlo.',
      buy: 'El precio está por encima de su media de 40 semanas y la media corta supera a la larga.',
      sell: 'El precio cae por debajo de su media de 40 semanas.',
      entry: [c('PRICE', '>', { ind: 'SMA', p: 40 }), c('SMA', '>', { ind: 'SMA', p: 40 }, { params: { p: 10 } })],
      exit: [[c('PRICE', '<', { ind: 'SMA', p: 40 })]],
    },
    {
      id: 'momentum', icon: '⚡', name: 'Momentum', level: 'Atrevido',
      pitch: 'Compra a los líderes: acciones con mucha fuerza cerca de sus máximos del año.',
      buy: 'Tiene fuerza (RSI alto) y cotiza a menos de un 5 % de su máximo de 52 semanas.',
      sell: 'Pierde la fuerza (el RSI baja de 45).',
      entry: [c('RSI', '>', 60, { params: { p: 14 } }), c('DIST_HIGH', '>', -5, { params: { p: 52 } })],
      exit: [[c('RSI', '<', 45, { params: { p: 14 } })]],
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
      pfStopATRPeriod: 14, pfMinWeight: 1, pfMaxWeight: 25, pfMode: 'maxsharpe', btAllocationMode: 'equal',
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

  window.StockScannerCore = Object.assign(window.StockScannerCore || {}, {
    SIMPLE_MARKETS: MARKETS, SIMPLE_STRATEGIES: STRATEGIES, SIMPLE_PERIODS: PERIODS, SIMPLE_CAPITAL: CAPITAL,
    buildSimpleBacktestOptions, summarizeSimpleResult,
  });
})();
