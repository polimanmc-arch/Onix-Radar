// Alertas del scanner (Telegram). Compartido por el navegador y scripts/run-alerts.js (GitHub Actions).
// Las alertas programadas se ejecutan después del cierre de Wall Street, así que aquí una vela se
// considera cerrada según el horario real de la sesión y no con la convención del scanner en vivo
// (índice 0 = vela en formación). Una señal es "nueva" si se cumple en una vela que cerró dentro
// de la ventana desde la ejecución anterior y no se cumplía en la vela previa: no hace falta estado.
(function(){
  const HOUR = 3600, DAY = 86400;
  const TF_ORDER = ['4h','1d','1wk','1mo'];
  const US_CLOSE_UTC = 21 * HOUR; // 16:00 Nueva York en invierno (20:00 UTC en verano): el más tardío

  // Fecha de la vela: +6 h lleva al día correcto las velas fechadas a medianoche europea
  // (22:00-23:00 UTC del día anterior) sin mover las de EE. UU. (13:30 UTC) al día siguiente.
  const utcMidnight = t => Math.floor((Number(t) + 6 * HOUR) / DAY) * DAY;

  // Instante aproximado de cierre de una vela que empieza en `start` (segundos).
  function candleCloseTime(tf, start){
    if(start == null) return null;
    if(tf === '4h') return start + 4 * HOUR;
    if(tf === '1d') return utcMidnight(start) + US_CLOSE_UTC;
    if(tf === '1wk'){
      const day0 = utcMidnight(start);
      const dow = new Date(day0 * 1000).getUTCDay();      // 0 = domingo, 1 = lunes
      const toFriday = dow === 0 ? 5 : 5 - dow;           // semanas que empiezan en domingo
      return day0 + toFriday * DAY + US_CLOSE_UTC;        // viernes de esa semana
    }
    if(tf === '1mo'){
      const d = new Date((start + 6 * HOUR) * 1000);
      let last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      while(last.getUTCDay() === 0 || last.getUTCDay() === 6) last = new Date(last.getTime() - DAY * 1000);
      return last.getTime() / 1000 + US_CLOSE_UTC;        // último día laborable del mes
    }
    return start + DAY;
  }

  // Índice (más reciente primero) de la última vela cerrada en `at`.
  function lastClosedIndex(d, tf, at){
    const times = d?.times || [];
    for(let i = 0; i < times.length; i++) if(candleCloseTime(tf, times[i]) <= at) return i;
    return -1;
  }

  const TF_LABEL = { '4h':'4H', '1d':'1D', '1wk':'1W', '1mo':'1M' };
  function describeFilter(f){
    const p = f.params?.p ? `(${f.params.p})` : '';
    const op = { '>':'>', '<':'<', '>=':'≥', '<=':'≤', x_up:'cruza ↑', x_dn:'cruza ↓' }[f.op] || f.op;
    const cmp = f.cmpType === 'val' ? f.cmpVal : f.cmpType === 'prev' ? 'anterior' : `${f.cmpInd}${f.cmpParams?.p ? '(' + f.cmpParams.p + ')' : ''}`;
    return `${f.ind}${p} [${TF_LABEL[f.tf] || f.tf}] ${op} ${cmp}`;
  }

  // Evalúa una alerta sobre datos ya descargados. Devuelve las señales en la última vela cerrada de
  // la temporalidad base y, de ellas, las nuevas.
  function evaluateAlert({ alert, dataByTicker, now = Date.now() / 1000, windowSeconds = 26 * HOUR }){
    const { createRuleEvaluator } = window.StockScannerCore;
    const filters = (alert?.filters || []).filter(f => f && f.ind);
    if(!filters.length) return { ok:false, message:'La alerta no tiene filtros.' };
    const tfs = [...new Set(filters.map(f => f.tf))];
    const baseTf = TF_ORDER.find(tf => tfs.includes(tf)) || tfs[0];
    const evaluator = createRuleEvaluator();
    const groups = [{ conditions: filters }];
    const all = [], fresh = [], errors = [];
    for(const [ticker, dataByTf] of Object.entries(dataByTicker || {})){
      if(!tfs.every(tf => dataByTf?.[tf]?.ok)){ errors.push(ticker); continue; }
      const base = dataByTf[baseTf];
      const c = lastClosedIndex(base, baseTf, now);
      if(c < 0 || c + 1 >= base.closes.length) continue;
      const evalAt = i => {
        const at = candleCloseTime(baseTf, base.times[i]);
        const idxByTf = {};
        for(const tf of tfs) idxByTf[tf] = tf === baseTf ? i : lastClosedIndex(dataByTf[tf], tf, at);
        return evaluator.evalRuleGroupsAt(groups, dataByTf, idxByTf);
      };
      const res = evalAt(c);
      if(!res.matched) continue;
      const closedAt = candleCloseTime(baseTf, base.times[c]);
      const price = base.closes[c], prev = base.closes[c + 1];
      const row = { ticker, name: base.name || ticker, price, chg: prev ? (price / prev - 1) * 100 : null, closedAt, candle: base.times[c] };
      all.push(row);
      if(closedAt > now - windowSeconds && !evalAt(c + 1).matched) fresh.push(row);
    }
    return { ok:true, baseTf, all, fresh, errors, evaluatedAt: now };
  }

  const escapeHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Mensajes de Telegram en HTML, troceados por debajo del límite de 4096 caracteres.
  function formatAlertMessages({ title, subtitle, rows = [], filters = [], direction = 'long', maxRows = 60, limit = 3800 }){
    const side = direction === 'short' ? 'Short' : 'Long';
    const head = [`<b>📡 ${escapeHtml(title)}</b>`, escapeHtml(subtitle || ''), ''].filter((l, i) => l || i === 2);
    const lines = rows.slice(0, maxRows).map(r => {
      const chg = Number.isFinite(r.chg) ? ` (${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(1)}%)` : '';
      const price = Number.isFinite(r.price) ? ` ${r.price.toFixed(2)}` : '';
      return `<code>${escapeHtml(r.ticker)}</code>${price}${chg}`;
    });
    if(rows.length > maxRows) lines.push(`… y ${rows.length - maxRows} más`);
    if(!rows.length) lines.push('Sin señales nuevas.');
    const foot = ['', `<i>${side} · ${escapeHtml(filters.map(describeFilter).join(' · '))}</i>`];
    const messages = [];
    let cur = [...head];
    const size = arr => arr.join('\n').length;
    for(const line of lines){
      if(size([...cur, line, ...foot]) > limit){ messages.push(cur.join('\n')); cur = [`<b>📡 ${escapeHtml(title)}</b> (cont.)`, '']; }
      cur.push(line);
    }
    messages.push([...cur, ...foot].join('\n'));
    return messages;
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore || {}, {
    candleCloseTime, lastClosedIndex, evaluateAlert, formatAlertMessages, describeAlertFilter: describeFilter,
  });
})();
