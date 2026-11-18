#!/usr/bin/env node
// Ejecuta las alertas de alerts/alerts.json y envía a Telegram las señales nuevas.
// Pensado para GitHub Actions (.github/workflows/telegram-alerts.yml) después del cierre de EE. UU.
//
// Uso:
//   node scripts/run-alerts.js                 # evalúa y envía (requiere TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID)
//   node scripts/run-alerts.js --dry-run       # evalúa e imprime los mensajes sin enviar
//   node scripts/run-alerts.js --window-hours 72 --only sp500-semanal-long
//   node scripts/run-alerts.js --force-send      # envía aunque no haya señales nuevas (prueba de conexión)
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const CORE_FILES = [
  'config/timeframes.js', 'config/indicators.js', 'config/sp500History.js', 'config/universes.js',
  'core/indicators.js', 'core/engine.js', 'core/ruleEvaluator.js', 'core/alerts.js',
];

function parseArgs(argv){
  const args = { dryRun: false, forceSend: false, windowHours: 26, only: null, file: path.join(ROOT, 'alerts', 'alerts.json'), concurrency: 12 };
  for(let i = 0; i < argv.length; i++){
    const a = argv[i];
    if(a === '--dry-run') args.dryRun = true;
    else if(a === '--force-send') args.forceSend = true;
    else if(a === '--window-hours') args.windowHours = Number(argv[++i]);
    else if(a === '--only') args.only = argv[++i];
    else if(a === '--file') args.file = path.resolve(argv[++i]);
    else if(a === '--concurrency') args.concurrency = Number(argv[++i]);
  }
  if(!(args.windowHours > 0)) throw new Error('--window-hours debe ser un número positivo');
  return args;
}

function loadCore(baseUrl){
  const ctx = vm.createContext({
    window: {}, console, setTimeout, clearTimeout, AbortController, Date, Math, URL,
    fetch: (url, opts) => fetch(String(url).startsWith('/') ? baseUrl + url : url, opts),
  });
  for(const f of CORE_FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'app', f), 'utf8'), ctx, { filename: f });
  return ctx.window;
}

function readAlerts(file){
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = Array.isArray(json) ? json : json.alerts;
  if(!Array.isArray(list)) throw new Error(`${file}: se esperaba { "alerts": [...] }`);
  const ids = new Set();
  for(const a of list){
    if(!a?.id || !Array.isArray(a.filters) || !a.filters.length) throw new Error(`Alerta inválida: necesita "id" y "filters" (${JSON.stringify(a?.id)})`);
    if(ids.has(a.id)) throw new Error(`Id de alerta repetido: ${a.id}`);
    ids.add(a.id);
  }
  return list;
}

function resolveUniverse(alert, cfg){
  const presets = cfg.UNIVERSE_PRESETS || {};
  const ids = Array.isArray(alert.universe) ? alert.universe : alert.universe ? [alert.universe] : [];
  const unknown = ids.filter(id => !presets[id]);
  if(unknown.length) throw new Error(`${alert.id}: universo desconocido ${unknown.join(', ')}`);
  let tickers = [...(alert.tickers || []), ...ids.flatMap(id => presets[id].tickers || [])];
  tickers = [...new Set(tickers.map(t => String(t).trim().toUpperCase()).filter(t => /^[A-Z0-9.^=\-]+$/.test(t)))];
  const limit = Math.max(0, Math.round(Number(alert.limit) || 0));
  if(limit) tickers = tickers.slice(0, limit);
  const label = ids.map(id => presets[id].label || id).join(' + ') || `${tickers.length} símbolos`;
  return { tickers, label };
}

async function fetchUniverse(core, tickers, tfs, concurrency){
  const data = {};
  let next = 0;
  const worker = async () => {
    while(next < tickers.length){
      const t = tickers[next++];
      const byTf = {};
      for(const tf of tfs){
        try{ byTf[tf] = await core.fetchTicker(t, tf); }
        catch(e){ byTf[tf] = { ticker: t, tf, ok: false, error: e.message }; }
      }
      data[t] = byTf;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, tickers.length)) }, worker));
  return data;
}

async function runAlerts({ alerts, core, cfg, now = Date.now() / 1000, windowHours = 26, concurrency = 12, log = console.log }){
  const outputs = [];
  for(const alert of alerts){
    const { tickers, label } = resolveUniverse(alert, cfg);
    const tfs = [...new Set(alert.filters.map(f => f.tf))];
    const t0 = Date.now();
    const data = await fetchUniverse(core, tickers, tfs, concurrency);
    const res = core.evaluateAlert({ alert, dataByTicker: data, now, windowSeconds: windowHours * 3600 });
    if(!res.ok) throw new Error(`${alert.id}: ${res.message}`);
    const date = new Date(now * 1000).toISOString().slice(0, 10);
    const missing = res.errors.length;
    const subtitle = `${date} · ${res.fresh.length} nuevas (${res.all.length} activas) · ${label}` +
      (missing ? ` · ${missing}/${tickers.length} sin datos` : '');
    const messages = core.formatAlertMessages({ title: alert.name || alert.id, subtitle, rows: res.fresh, filters: alert.filters, direction: alert.direction });
    const dataProblem = tickers.length > 0 && missing / tickers.length > 0.5;
    log(`[${alert.id}] ${tickers.length} símbolos, ${res.all.length} activas, ${res.fresh.length} nuevas, ${missing} sin datos (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    outputs.push({ alert, res, messages, shouldSend: res.fresh.length > 0 || alert.notifyEmpty === true || dataProblem, dataProblem });
  }
  return outputs;
}

async function main(){
  const args = parseArgs(process.argv.slice(2));
  const { createApp } = require(path.join(ROOT, 'server', 'app'));
  const { telegramConfig, sendTelegramMessages } = require(path.join(ROOT, 'server', 'services', 'telegram.service'));
  let alerts = readAlerts(args.file).filter(a => a.enabled !== false);
  if(args.only) alerts = alerts.filter(a => a.id === args.only);
  if(!alerts.length){ console.log('No hay alertas activas.'); return; }
  const configured = telegramConfig().configured;
  if(!args.dryRun && !configured) console.log('::warning::TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no están configurados: se evalúa sin enviar.');

  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try{
    const w = loadCore(`http://127.0.0.1:${server.address().port}`);
    const outputs = await runAlerts({ alerts, core: w.StockScannerCore, cfg: w.StockScannerConfig, windowHours: args.windowHours, concurrency: args.concurrency });
    for(const out of outputs){
      if(out.dataProblem) out.messages[out.messages.length - 1] += '\n\n⚠️ Más de la mitad de los símbolos no devolvió datos: revisa la fuente.';
      if(args.dryRun || !configured){ console.log(out.messages.join('\n---\n')); continue; }
      if(!out.shouldSend && !args.forceSend){ console.log(`[${out.alert.id}] sin señales nuevas: no se envía nada.`); continue; }
      await sendTelegramMessages(out.messages);
      console.log(`[${out.alert.id}] enviado a Telegram (${out.messages.length} mensaje/s).`);
    }
  } finally {
    server.close();
  }
}

if(require.main === module) main().catch(e => { console.error(e.message || e); process.exitCode = 1; });
module.exports = { parseArgs, readAlerts, resolveUniverse, runAlerts, loadCore };
