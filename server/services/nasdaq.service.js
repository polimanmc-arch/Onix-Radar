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

// Russell 2000 reconstruido con el método del índice: empresas de EE. UU. ordenadas por capitalización,
// puestos 1.001 a 3.000 (el Russell 1000 son las 1.000 primeras). Es una aproximación con datos del día:
// el índice oficial se recompone una vez al año.
const NOT_COMMON = /warrant|units?|right(s)?|preferred|depositary|notes? due|debentures|%|ETF|ETN|fund|trust units/i;
async function getRussell2000() {
  const cacheKey = 'tickers:russell2000';
  const cached = getCache(cacheKey);
  if (cached) return cached;
  const rows = [];
  for (const exchange of EXCHANGES) {
    try {
      const url = `https://api.nasdaq.com/api/screener/stocks?tableType=stocks&exchange=${exchange}&limit=10000&offset=0&download=true`;
      const json = await fetchJson(url, { timeoutMs: 15000 });
      for (const row of json?.data?.rows || []) {
        const sym = (row.symbol || '').trim().replace('/', '-');
        const cap = Number(row.marketCap);
        if (!sym || sym.length > 5 || !SYMBOL_REGEX.test(sym)) continue;
        if (row.country !== 'United States' || !(cap > 0) || NOT_COMMON.test(row.name || '')) continue;
        rows.push({ sym, cap });
      }
    } catch (error) {
      console.warn(`Russell 2000 ${exchange}: ${error.message}`);
    }
  }
  const seen = new Set();
  const ranked = rows.sort((a, b) => b.cap - a.cap).filter(r => (seen.has(r.sym) ? false : seen.add(r.sym)));
  if (ranked.length < 2500) throw new Error('No se pudo reconstruir el Russell 2000 (faltan datos de capitalización).');
  const members = ranked.slice(1000, 3000);
  const payload = { count: members.length, asOf: new Date().toISOString().slice(0, 10), ranks: [1001, 3000],
    minCap: members[members.length - 1]?.cap || null, maxCap: members[0]?.cap || null, tickers: members.map(r => r.sym) };
  setCache(cacheKey, payload, 12 * 60 * 60 * 1000);
  return payload;
}

module.exports = { getTickers, getRussell2000 };
