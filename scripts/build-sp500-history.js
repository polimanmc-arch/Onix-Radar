#!/usr/bin/env node
// Genera public/app/config/sp500History.js con la composición histórica del S&P 500.
// Fuente: https://github.com/fja05680/sp500 (licencia MIT, Farrell Aultman).
//  - sp500_ticker_start_end.csv: tramos de pertenencia por ticker desde 1996.
//  - sp500.csv: composición actual (Wikipedia) con la fecha de alta de cada empresa, que no
//    cambia con los renombres (FB → META): permite extender hacia atrás los tickers actuales.
// Uso: node scripts/build-sp500-history.js            (descarga y escribe el archivo)
//      node scripts/build-sp500-history.js --dir <carpeta con los CSV ya descargados>
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://raw.githubusercontent.com/fja05680/sp500/master/';
const FILES = { startEnd: 'sp500_ticker_start_end.csv', current: 'sp500.csv', license: 'LICENSE' };
const OUT = path.join(__dirname, '..', 'public', 'app', 'config', 'sp500History.js');

function parseCsv(text){
  const rows = [];
  let row = [], field = '', quoted = false;
  for(let i = 0; i < text.length; i++){
    const ch = text[i];
    if(quoted){
      if(ch === '"' && text[i + 1] === '"'){ field += '"'; i++; }
      else if(ch === '"') quoted = false;
      else field += ch;
    } else if(ch === '"') quoted = true;
    else if(ch === ','){ row.push(field); field = ''; }
    else if(ch === '\n' || ch === '\r'){
      if(ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if(row.some(v => v !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if(field !== '' || row.length){ row.push(field); if(row.some(v => v !== '')) rows.push(row); }
  const [header, ...body] = rows;
  return body.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

// Formato Yahoo: BRK.B → BRK-B.
const yahoo = t => String(t || '').trim().toUpperCase().replace(/\./g, '-');
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

async function load(name, dir){
  if(dir) return fs.readFileSync(path.join(dir, name), 'utf8');
  const res = await fetch(BASE + encodeURIComponent(name));
  if(!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

function build({ startEndCsv, currentCsv, licenseText }){
  const intervals = {};
  for(const r of parseCsv(startEndCsv)){
    const t = yahoo(r.ticker);
    if(!t || !isDate(r.start_date)) continue;
    if(r.end_date && !isDate(r.end_date)) throw new Error(`Fecha no válida para ${t}: ${r.end_date}`);
    (intervals[t] = intervals[t] || []).push([r.start_date, r.end_date || null]);
  }
  Object.values(intervals).forEach(list => list.sort((a, b) => a[0].localeCompare(b[0])));
  const currentAdded = {};
  for(const r of parseCsv(currentCsv)){
    const t = yahoo(r.Symbol);
    if(t && isDate(r['Date added'])) currentAdded[t] = r['Date added'];
  }
  const currentMembers = Object.keys(intervals).filter(t => intervals[t].some(([, e]) => e == null)).sort();
  const lastChange = Object.values(intervals).flat().flat().filter(Boolean).sort().at(-1);
  if(currentMembers.length < 480 || currentMembers.length > 520) throw new Error(`Miembros actuales inesperados: ${currentMembers.length}`);
  return { intervals, currentAdded, currentMembers, lastChange, licenseText };
}

function render({ intervals, currentAdded, currentMembers, lastChange, licenseText }){
  const license = String(licenseText || '').trim().split(/\r?\n/).map(l => '// ' + l).join('\n');
  const data = {
    source: 'https://github.com/fja05680/sp500',
    license: 'MIT',
    lastChange,
    generatedAt: new Date().toISOString().slice(0, 10),
    currentMembers,
    currentAdded,
    intervals,
  };
  return `// Composición histórica del S&P 500, generado por scripts/build-sp500-history.js. No editar a mano.
// Datos de https://github.com/fja05680/sp500 bajo licencia MIT:
${license}
window.StockScannerConfig = window.StockScannerConfig || {};
window.StockScannerConfig.SP500_HISTORY = ${JSON.stringify(data)};
`;
}

async function main(){
  const dirFlag = process.argv.indexOf('--dir');
  const dir = dirFlag > -1 ? process.argv[dirFlag + 1] : null;
  const [startEndCsv, currentCsv, licenseText] = await Promise.all([
    load(FILES.startEnd, dir), load(FILES.current, dir), load(FILES.license, dir),
  ]);
  const built = build({ startEndCsv, currentCsv, licenseText });
  fs.writeFileSync(OUT, render(built), 'utf8');
  console.log(`sp500History.js: ${Object.keys(built.intervals).length} tickers, ${built.currentMembers.length} miembros actuales, último cambio ${built.lastChange}`);
}

if(require.main === module) main().catch(e => { console.error(e.message || e); process.exitCode = 1; });
module.exports = { parseCsv, build, render, yahoo };
