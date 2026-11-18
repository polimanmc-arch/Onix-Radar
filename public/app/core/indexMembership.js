// Pertenencia histórica a un índice (point-in-time) para evitar el sesgo de selección del backtest:
// en cada fecha sólo son elegibles los valores que estaban en el índice en esa fecha.
// Datos: window.StockScannerConfig.SP500_HISTORY (scripts/build-sp500-history.js).
(function(){
  const DAY = 86400;
  const toDay = iso => Math.floor(Date.UTC(+iso.slice(0,4), +iso.slice(5,7)-1, +iso.slice(8,10)) / 1000 / DAY);

  function createIndexMembership(history){
    if(!history?.intervals) return null;
    const ranges = {};      // ticker → [[startDay, endDay|Infinity]] (tramos originales del archivo)
    const extended = {};    // ticker → [startDay, endDay) tramo anterior al ticker actual (renombres)
    for(const [t, list] of Object.entries(history.intervals)){
      ranges[t] = list.map(([s, e]) => [toDay(s), e ? toDay(e) : Infinity]);
    }
    // Empresas actuales cuya fecha de alta (Wikipedia) es anterior al primer tramo de su ticker
    // actual: estaban en el índice con otro símbolo (FB → META). Se extiende hasta ese tramo.
    for(const [t, added] of Object.entries(history.currentAdded || {})){
      const first = ranges[t]?.[0];
      if(!first) continue;
      const addedDay = toDay(added);
      if(addedDay < first[0]) extended[t] = [addedDay, first[0]];
    }
    const inRanges = (list, day) => !!list && list.some(([s, e]) => s <= day && day < e);
    const dayOf = timeSec => Math.floor(Number(timeSec) / DAY);
    return {
      lastChange: history.lastChange,
      source: history.source,
      // ¿Era miembro el día de `timeSec` (segundos)? Incluye el tramo extendido por renombre.
      isMember(ticker, timeSec){
        const day = dayOf(timeSec);
        if(inRanges(ranges[ticker], day)) return true;
        const x = extended[ticker];
        return !!x && x[0] <= day && day < x[1];
      },
      // Tamaño del índice en esa fecha según los tramos originales (sin duplicar renombres).
      size(timeSec){
        const day = dayOf(timeSec);
        let n = 0;
        for(const list of Object.values(ranges)) if(inRanges(list, day)) n++;
        return n;
      },
      // Todos los tickers que fueron miembros en algún momento desde `timeSec` hasta hoy.
      tickersSince(timeSec){
        const day = dayOf(timeSec);
        const out = new Set();
        for(const [t, list] of Object.entries(ranges)) if(list.some(([, e]) => e > day)) out.add(t);
        Object.keys(extended).forEach(t => out.add(t));
        return [...out].sort();
      },
      isExtended: ticker => !!extended[ticker],
    };
  }

  const cfg = window.StockScannerConfig = window.StockScannerConfig || {};
  const sp500 = createIndexMembership(cfg.SP500_HISTORY);
  if(sp500){
    cfg.INDEX_MEMBERSHIP = Object.assign(cfg.INDEX_MEMBERSHIP || {}, { SP500_PIT: sp500 });
    // Universo sólo para Backtest: miembros de los últimos ~6 años (el semanal de Yahoo cubre 5).
    cfg.UNIVERSE_PRESETS = cfg.UNIVERSE_PRESETS || {};
    cfg.UNIVERSE_PRESETS.SP500_PIT = {
      label: 'S&P 500 histórico',
      tickers: sp500.tickersSince(Date.now() / 1000 - 6 * 365.25 * DAY),
      group: 'us',
      backtestOnly: true,
      pointInTime: 'SP500_PIT',
    };
  }
  window.StockScannerCore = Object.assign(window.StockScannerCore || {}, { createIndexMembership });
})();
