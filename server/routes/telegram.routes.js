const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { telegramConfig, sendTelegramMessages } = require('../services/telegram.service');

// El texto se genera aquí, a partir de datos validados, con el mismo formateador que las alertas
// programadas: la ruta no reenvía texto libre a tu chat.
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'app', 'core', 'alerts.js'), 'utf8'), sandbox);
const { formatAlertMessages } = sandbox.window.StockScannerCore;

const TICKER = /^[A-Z0-9.^=\-]{1,15}$/;
const TF = new Set(['4h', '1d', '1wk', '1mo']);
const OPS = new Set(['>', '<', '>=', '<=', 'x_up', 'x_dn']);
const short = (v, n) => String(v ?? '').slice(0, n);
const num = v => (Number.isFinite(Number(v)) ? Number(v) : null);

function sanitize(body = {}){
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 500)
    .map(r => ({ ticker: String(r?.ticker || '').toUpperCase(), price: num(r?.price), chg: num(r?.chg) }))
    .filter(r => TICKER.test(r.ticker));
  const filters = (Array.isArray(body.filters) ? body.filters : []).slice(0, 20).map(f => ({
    ind: short(f?.ind, 20).replace(/[^A-Z0-9_]/gi, ''),
    tf: TF.has(f?.tf) ? f.tf : '1d',
    op: OPS.has(f?.op) ? f.op : '>',
    cmpType: ['val', 'prev', 'ind'].includes(f?.cmpType) ? f.cmpType : 'val',
    cmpVal: num(f?.cmpVal) ?? short(f?.cmpVal, 30),
    cmpInd: short(f?.cmpInd, 20).replace(/[^A-Z0-9_]/gi, ''),
    params: { p: num(f?.params?.p) },
    cmpParams: { p: num(f?.cmpParams?.p) },
  })).filter(f => f.ind);
  return {
    title: short(body.title || 'Radar Onix', 80),
    subtitle: short(body.subtitle, 200),
    direction: body.direction === 'short' ? 'short' : 'long',
    rows, filters,
  };
}

function createTelegramRouter({ env = process.env, fetchImpl, now = () => Date.now(), minIntervalMs = 15000, dailyLimit = 40 } = {}){
  const router = express.Router();
  let lastSent = 0, day = '', countToday = 0;

  router.get('/telegram/status', (_req, res) => {
    res.json({ ok: true, configured: telegramConfig(env).configured });
  });

  router.post('/telegram/send', async (req, res) => {
    if(!telegramConfig(env).configured) return res.status(503).json({ ok: false, error: 'Telegram no está configurado en el servidor.' });
    const t = now();
    const today = new Date(t).toISOString().slice(0, 10);
    if(today !== day){ day = today; countToday = 0; }
    if(t - lastSent < minIntervalMs) return res.status(429).json({ ok: false, error: 'Espera unos segundos antes de volver a enviar.' });
    if(countToday >= dailyLimit) return res.status(429).json({ ok: false, error: 'Se alcanzó el límite diario de envíos.' });
    const payload = sanitize(req.body);
    if(!payload.rows.length) return res.status(400).json({ ok: false, error: 'No hay señales que enviar.' });
    lastSent = t; countToday++;
    try{
      const messages = formatAlertMessages(payload);
      const ids = await sendTelegramMessages(messages, { env, ...(fetchImpl ? { fetchImpl } : {}) });
      res.json({ ok: true, messages: ids.length });
    }catch(error){
      res.status(error.status || 500).json({ ok: false, error: error.message });
    }
  });
  return router;
}

module.exports = { createTelegramRouter, sanitize };
