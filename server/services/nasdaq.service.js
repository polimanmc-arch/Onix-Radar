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

module.exports = { getTickers };
