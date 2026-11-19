const { getCache, setCache } = require('../utils/cache');
const { fetchJson } = require('../utils/http');

const EXCHANGES = ['NASDAQ', 'NYSE', 'AMEX'];
const SYMBOL_REGEX = /^[A-Z]+(-[A-Z])?$/;

async function getTickers() {
  const cacheKey = 'tickers:all';
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const allTickers = [];
  for (const exchange of EXCHANGES) {
    try {
      const url = `https://api.nasdaq.com/api/screener/stocks?tableType=stocks&exchange=${exchange}&limit=10000&offset=0`;
      const json = await fetchJson(url, { timeoutMs: 12000 });
      const rows = json?.data?.table?.rows || [];
      for (const row of rows) {
        const sym = (row.symbol || '').trim();
        if (sym && sym.length <= 5 && SYMBOL_REGEX.test(sym)) {
          allTickers.push(sym);
        }
      }
    } catch (error) {
      console.warn(`Error ${exchange}: ${error.message}`);
    }
  }

  const payload = { count: [...new Set(allTickers)].length, tickers: [...new Set(allTickers)].sort() };
  setCache(cacheKey, payload, 12 * 60 * 60 * 1000);
  return payload;
}

// Buscador de acciones de Nasdaq (NYSE, Nasdaq y AMEX) con capitalización, país, sector e industria.
// Se descarga una vez cada 12 h y lo comparten el Russell 2000 y el respaldo de sectores.
let screenerInflight = null;
async function getScreenerRows() {
  const cacheKey = 'nasdaq:screener';
  const cached = getCache(cacheKey);
  if (cached) return cached;
  if (screenerInflight) return screenerInflight;
  screenerInflight = (async () => {
    const rows = [];
    for (const exchange of EXCHANGES) {
      try {
        const url = `https://api.nasdaq.com/api/screener/stocks?tableType=stocks&exchange=${exchange}&limit=10000&offset=0&download=true`;
        const json = await fetchJson(url, { timeoutMs: 15000 });
        for (const row of json?.data?.rows || []) {
          const sym = (row.symbol || '').trim().replace('/', '-');
          if (!sym || sym.length > 5 || !SYMBOL_REGEX.test(sym)) continue;
          rows.push({ sym, cap: Number(row.marketCap) || 0, country: row.country || '', name: row.name || '', sector: row.sector || '', industry: row.industry || '' });
        }
      } catch (error) {
        console.warn(`Buscador Nasdaq ${exchange}: ${error.message}`);
      }
    }
    if (rows.length > 3000) setCache(cacheKey, rows, 12 * 60 * 60 * 1000);
    return rows;
  })();
  try { return await screenerInflight; } finally { screenerInflight = null; }
}

// Russell 2000 reconstruido con el método del índice: empresas de EE. UU. ordenadas por capitalización,
// puestos 1.001 a 3.000 (el Russell 1000 son las 1.000 primeras). Es una aproximación con datos del día:
// el índice oficial se recompone una vez al año.
const NOT_COMMON = /warrant|\bunits?\b|\bright(s)?\b|preferred|depositary|\bnotes? due\b|debentures|%|\bETF\b|\bETN\b|\bfund\b|trust units/i;
async function getRussell2000() {
  const cacheKey = 'tickers:russell2000';
  const cached = getCache(cacheKey);
  if (cached) return cached;
  const rows = (await getScreenerRows()).filter(r => r.country === 'United States' && r.cap > 0 && !NOT_COMMON.test(r.name));
  const seen = new Set();
  const ranked = rows.sort((a, b) => b.cap - a.cap).filter(r => (seen.has(r.sym) ? false : seen.add(r.sym)));
  if (ranked.length < 2500) throw new Error('No se pudo reconstruir el Russell 2000 (faltan datos de capitalización).');
  const members = ranked.slice(1000, 3000);
  const payload = { count: members.length, asOf: new Date().toISOString().slice(0, 10), ranks: [1001, 3000],
    minCap: members[members.length - 1]?.cap || null, maxCap: members[0]?.cap || null, tickers: members.map(r => r.sym) };
  setCache(cacheKey, payload, 12 * 60 * 60 * 1000);
  return payload;
}

// Sector de una acción de EE. UU. según Nasdaq, con los nombres que usa Yahoo (respaldo cuando Yahoo no responde).
const NASDAQ_TO_YAHOO = {
  'Technology': 'Technology', 'Telecommunications': 'Communication Services', 'Health Care': 'Healthcare', 'Finance': 'Financial Services',
  'Real Estate': 'Real Estate', 'Consumer Discretionary': 'Consumer Cyclical', 'Consumer Staples': 'Consumer Defensive', 'Industrials': 'Industrials',
  'Basic Materials': 'Basic Materials', 'Energy': 'Energy', 'Utilities': 'Utilities',
};
// La industria corrige clasificaciones raras de Nasdaq (p. ej. laboratorios dentro de "Industrials").
const INDUSTRY_RULES = [
  [/biotech|pharmaceutic|medical|health|hospital|diagnostic/i, 'Healthcare'],
  [/semiconductor|computer|software|electronic components|EDP services/i, 'Technology'],
  [/real estate investment trust|REIT/i, 'Real Estate'],
  [/\bbanks?\b|savings institutions|insurance|investment bankers|finance companies|investment managers/i, 'Financial Services'],
  [/oil|gas production|integrated oil|coal/i, 'Energy'],
  [/electric utilities|water supply|natural gas distribution|power generation/i, 'Utilities'],
];
let sectorMap = null, sectorMapAt = 0;
async function getUsSector(symbol) {
  if (!sectorMap || Date.now() - sectorMapAt > 12 * 60 * 60 * 1000) {
    const rows = await getScreenerRows();
    if (!rows.length) return null;
    sectorMap = new Map(rows.map(r => [r.sym, r]));
    sectorMapAt = Date.now();
  }
  const r = sectorMap.get(String(symbol || '').toUpperCase());
  if (!r || (!r.sector && !r.industry)) return null;
  const byIndustry = INDUSTRY_RULES.find(([re]) => re.test(r.industry || ''));
  const sector = byIndustry ? byIndustry[1] : NASDAQ_TO_YAHOO[r.sector];
  return sector ? { sector, industry: r.industry || '' } : null;
}

module.exports = { getTickers, getRussell2000, getUsSector, getScreenerRows };
