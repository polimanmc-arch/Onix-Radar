// Informe de rendimiento estilo tearsheet (inspirado en QuantStats): retornos mensuales,
// peores drawdowns, Sharpe móvil y estadísticas frente al benchmark.
// Trabaja sobre la curva semanal del backtest: [{time (s), value}], ordenada de antigua a reciente.
(function(){
  const WEEKS_PER_YEAR = 52;

  function weekKey(t){
    const d = new Date((Number(t) + 43200) * 1000);
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - dow);
    const yStart = Date.UTC(dt.getUTCFullYear(), 0, 1);
    return dt.getUTCFullYear() + '-W' + Math.ceil(((dt - yStart) / 86400000 + 1) / 7);
  }
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const stdev = a => {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
  };

  // Retorno de cada mes natural (compuesto) con el valor al cierre del mes anterior como base.
  function monthlyReturns(points, startVal){
    const months = [];
    let prevClose = startVal;
    let cur = null;
    for (const p of points) {
      const d = new Date(p.time * 1000);
      const y = d.getUTCFullYear(), m = d.getUTCMonth();
      if (!cur || cur.year !== y || cur.month !== m) {
        if (cur) { months.push({ year: cur.year, month: cur.month, ret: cur.last / prevClose - 1 }); prevClose = cur.last; }
        cur = { year: y, month: m, last: p.value };
      } else cur.last = p.value;
    }
    if (cur && prevClose > 0) months.push({ year: cur.year, month: cur.month, ret: cur.last / prevClose - 1 });
    const years = {};
    months.forEach(r => { (years[r.year] = years[r.year] || []).push(r); });
    const yearly = Object.keys(years).map(Number).sort((a, b) => a - b).map(year => ({
      year,
      months: years[year],
      ret: years[year].reduce((acc, r) => acc * (1 + r.ret), 1) - 1,
    }));
    return { months, yearly };
  }

  // Periodos de drawdown: desde un máximo hasta recuperar ese máximo (o fin de la serie).
  function drawdownPeriods(points, startVal, limit = 5){
    const values = [{ time: null, value: startVal }, ...points];
    const periods = [];
    let peak = values[0], cur = null;
    for (let i = 1; i < values.length; i++) {
      const p = values[i];
      if (p.value >= peak.value) {
        if (cur) { cur.end = p.time; cur.recoveryWeeks = i - cur.troughIdx; periods.push(cur); cur = null; }
        peak = { ...p, idx: i };
        continue;
      }
      const depth = (peak.value - p.value) / peak.value;
      if (!cur) cur = { start: peak.time ?? points[0]?.time ?? null, startIdx: peak.idx ?? 0, trough: p.time, troughIdx: i, depth, end: null, recoveryWeeks: null };
      if (depth > cur.depth) { cur.depth = depth; cur.trough = p.time; cur.troughIdx = i; }
    }
    if (cur) periods.push(cur);
    return periods
      .map(d => ({ start: d.start, trough: d.trough, end: d.end, depth: d.depth,
        weeks: (d.end != null ? d.troughIdx + (d.recoveryWeeks || 0) : values.length - 1) - d.startIdx,
        recoveryWeeks: d.recoveryWeeks, recovered: d.end != null }))
      .sort((a, b) => b.depth - a.depth)
      .slice(0, limit);
  }

  function rollingSharpe(rets, times, window, rfWeekly){
    const out = [];
    for (let i = window - 1; i < rets.length; i++) {
      const slice = rets.slice(i - window + 1, i + 1);
      const sd = stdev(slice);
      out.push({ time: times[i], value: sd > 0 ? (mean(slice) - rfWeekly) / sd * Math.sqrt(WEEKS_PER_YEAR) : 0 });
    }
    return out;
  }

  // Estadísticas frente al benchmark con retornos semanales emparejados por semana ISO.
  function benchmarkStats(points, startVal, benchCurve, rfWeekly){
    if (!Array.isArray(benchCurve) || benchCurve.length < 3) return null;
    const stratByWeek = new Map();
    let prev = startVal;
    points.forEach(p => { if (prev > 0) stratByWeek.set(weekKey(p.time), p.value / prev - 1); prev = p.value; });
    const pairs = [];
    for (let i = 1; i < benchCurve.length; i++) {
      const a = benchCurve[i - 1].value, b = benchCurve[i].value;
      if (!(a > 0)) continue;
      const s = stratByWeek.get(weekKey(benchCurve[i].time));
      if (s != null) pairs.push([s, b / a - 1]);
    }
    if (pairs.length < 8) return null;
    const xs = pairs.map(p => p[1]), ys = pairs.map(p => p[0]);
    const mx = mean(xs), my = mean(ys);
    let cov = 0, vx = 0, vy = 0;
    for (let i = 0; i < pairs.length; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
    const beta = vx > 0 ? cov / vx : 0;
    const correlation = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0;
    // Alfa de Jensen anualizada: exceso de retorno no explicado por la beta.
    const alpha = ((my - rfWeekly) - beta * (mx - rfWeekly)) * WEEKS_PER_YEAR;
    const active = pairs.map(p => p[0] - p[1]);
    const trackingError = stdev(active) * Math.sqrt(WEEKS_PER_YEAR);
    const informationRatio = trackingError > 0 ? mean(active) * WEEKS_PER_YEAR / trackingError : 0;
    return { beta, alpha, correlation, trackingError, informationRatio, weeks: pairs.length };
  }

  function computeTearsheet({ equityCurve, startVal, benchCurve, riskFreePct = 0, rollingWindow = 26 } = {}){
    const points = (equityCurve || []).filter(p => Number.isFinite(p?.value) && p?.time).map(p => ({ time: p.time, value: p.value }));
    if (!points.length || !(startVal > 0)) return null;
    const rfWeekly = (Number(riskFreePct) || 0) / 100 / WEEKS_PER_YEAR;
    const rets = [], times = [];
    let prev = startVal;
    points.forEach(p => { if (prev > 0) { rets.push(p.value / prev - 1); times.push(p.time); } prev = p.value; });
    const { months, yearly } = monthlyReturns(points, startVal);
    const positiveMonths = months.filter(m => m.ret > 0).length;
    return {
      monthly: months,
      yearly,
      drawdowns: drawdownPeriods(points, startVal),
      rollingSharpe: rets.length >= rollingWindow ? rollingSharpe(rets, times, rollingWindow, rfWeekly) : [],
      rollingWindow,
      weekly: {
        best: rets.length ? Math.max(...rets) : 0,
        worst: rets.length ? Math.min(...rets) : 0,
        positivePct: rets.length ? rets.filter(r => r > 0).length / rets.length : 0,
        count: rets.length,
      },
      months: {
        best: months.length ? Math.max(...months.map(m => m.ret)) : 0,
        worst: months.length ? Math.min(...months.map(m => m.ret)) : 0,
        positivePct: months.length ? positiveMonths / months.length : 0,
      },
      benchmark: benchmarkStats(points, startVal, benchCurve, rfWeekly),
    };
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore || {}, { computeTearsheet });
})();
