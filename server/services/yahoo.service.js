const { getCache, setCache } = require('../utils/cache');
const { getDiskCache, setDiskCache, pruneDiskCache } = require('../utils/diskCache');
const { fetchJson, fetchText } = require('../utils/http');
const SECTOR_MAP = require('../data/sectorMap');
const yf2 = require('./yahooFinance2');
const { getUsSector, getUsName } = require('./nasdaq.service');

const CHART_MEMORY_TTL_MS = Number(process.env.ONIX_CHART_MEMORY_TTL_MS) || 15 * 60_000;
const CHART_DISK_TTL_MS = Number(process.env.ONIX_CHART_DISK_TTL_MS) || 12 * 60 * 60 * 1000;
const chartInflight = new Map();
let chartRequests = 0;
let chartMemoryHits = 0;
let chartDiskHits = 0;
let chartNetworkHits = 0;
let chartFailures = 0;
let lastPruneAt = 0;


function rawNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'object' && v && 'raw' in v) return isFinite(v.raw) ? v.raw : null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function safePct(v) {
  const n = rawNum(v);
  if (n == null) return null;
  return Math.abs(n) <= 1 ? n * 100 : n;
}

async function getQuoteDetails(symbol) {
  const cacheKey = `quoteDetails:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const urls = [
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,financialData,assetProfile`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,financialData,assetProfile`,
  ];

  // yahoo-finance2 primero (gestiona el crumb); después, las URLs directas.
  const sources = [
    async () => yf2.quoteSummary(symbol, ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'assetProfile']),
    ...urls.map(url => async () => (await fetchJson(url, { timeoutMs: 9000 }))?.quoteSummary?.result?.[0]),
  ];
  for (const source of sources) {
    try {
      const r = await source();
      if (!r) continue;
      const price = r.price || {};
      const sd = r.summaryDetail || {};
      const ks = r.defaultKeyStatistics || {};
      const fd = r.financialData || {};
      const ap = r.assetProfile || {};
      const enterpriseValue = rawNum(ks.enterpriseValue) ?? rawNum(fd.enterpriseValue);
      const freeCashflow = rawNum(fd.freeCashflow);
      const out = {
        sector: ap.sector || null,
        industry: ap.industry || null,
        country: ap.country || null,
        exchange: price.exchangeName || price.exchange || null,
        marketCap: rawNum(price.marketCap),
        sharesOutstanding: rawNum(price.sharesOutstanding) ?? rawNum(ks.sharesOutstanding),
        floatShares: rawNum(ks.floatShares),
        shortInterestPct: rawNum(ks.shortPercentOfFloat),
        institutionalOwnershipPct: rawNum(ks.heldPercentInstitutions),
        insiderOwnershipPct: rawNum(ks.heldPercentInsiders),
        beta: rawNum(ks.beta) ?? rawNum(sd.beta) ?? rawNum(fd.beta),
        peRatio: rawNum(sd.trailingPE),
        forwardPE: rawNum(sd.forwardPE),
        priceToSales: rawNum(sd.priceToSalesTrailing12Months),
        priceToBook: rawNum(sd.priceToBook),
        evToEbitda: rawNum(ks.enterpriseToEbitda) ?? rawNum(fd.enterpriseToEbitda),
        debtToEquity: rawNum(fd.debtToEquity),
        currentRatio: rawNum(fd.currentRatio),
        roe: rawNum(fd.returnOnEquity),
        roa: rawNum(fd.returnOnAssets),
        grossMargin: rawNum(fd.grossMargins),
        operatingMargin: rawNum(fd.operatingMargins),
        revenueGrowth: rawNum(fd.revenueGrowth),
        epsGrowth: rawNum(fd.earningsGrowth),
        freeCashFlowYield: enterpriseValue && freeCashflow != null ? (freeCashflow / enterpriseValue) : null,
      };
      setCache(cacheKey, out, 6 * 60 * 60 * 1000);
      return out;
    } catch (_) {}
  }
  const fallback = {};
  setCache(cacheKey, fallback, 30 * 60 * 1000);
  return fallback;
}

function decodeHtmlEntities(str = '') {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function getSectorFromStockAnalysis(symbol) {
  const urls = [
    `https://stockanalysis.com/stocks/${encodeURIComponent(String(symbol).toLowerCase())}/`,
    `https://stockanalysis.com/etf/${encodeURIComponent(String(symbol).toLowerCase())}/`,
  ];

  for (const url of urls) {
    try {
      const html = await fetchText(url, { timeoutMs: 7000 });
      const sectorMatch = html.match(/"sector"\s*:\s*"([^"]+)"/i)
        || html.match(/Sector<\/[^>]+>\s*<[^>]*>\s*([^<]{2,80})</i)
        || html.match(/Sector\s*<\/div>\s*<div[^>]*>\s*([^<]{2,80})</i);
      const industryMatch = html.match(/"industry"\s*:\s*"([^"]+)"/i)
        || html.match(/Industry<\/[^>]+>\s*<[^>]*>\s*([^<]{2,120})</i)
        || html.match(/Industry\s*<\/div>\s*<div[^>]*>\s*([^<]{2,120})</i);

      const sector = decodeHtmlEntities((sectorMatch?.[1] || '').trim());
      const industry = decodeHtmlEntities((industryMatch?.[1] || '').trim());
      if (sector) return { sector, industry: industry || '' };
    } catch (_) {}
  }
  return null;
}


async function getChart(ticker, interval = '1wk', range = '2y') {
  const cacheKey = `chart:${ticker}:${interval}:${range}`;
  const cached = getCache(cacheKey);
  chartRequests++;
  if (cached) {
    chartMemoryHits++;
    return cached;
  }
  const pending = chartInflight.get(cacheKey);
  if (pending) return pending;

  const work = (async () => {
    const diskCached = await getDiskCache('charts', cacheKey);
    if (diskCached) {
      chartDiskHits++;
      setCache(cacheKey, diskCached, CHART_MEMORY_TTL_MS);
      return diskCached;
    }

    const now = Date.now();
    if (now - lastPruneAt > 15 * 60_000) {
      lastPruneAt = now;
      pruneDiskCache('charts').catch(() => {});
    }

    const urls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false`,
    ];

    for (const url of urls) {
      try {
        const data = await fetchJson(url, { timeoutMs: 12000 });
        if (data?.chart?.result?.[0]?.timestamp) {
          chartNetworkHits++;
          setCache(cacheKey, data, CHART_MEMORY_TTL_MS);
          setDiskCache('charts', cacheKey, data, CHART_DISK_TTL_MS).catch(() => {});
          return data;
        }
      } catch (_) {}
    }

    chartFailures++;
    throw new Error(`No se pudo obtener datos para ${ticker}`);
  })().finally(() => chartInflight.delete(cacheKey));

  chartInflight.set(cacheKey, work);
  return work;
}

function getChartCacheStats() {
  return {
    requests: chartRequests,
    memoryHits: chartMemoryHits,
    diskHits: chartDiskHits,
    networkHits: chartNetworkHits,
    failures: chartFailures,
    inflight: chartInflight.size,
    memoryTtlMs: CHART_MEMORY_TTL_MS,
    diskTtlMs: CHART_DISK_TTL_MS,
  };
}

async function getSectorForSymbol(symbol) {
  if (SECTOR_MAP[symbol]) {
    return { sector: SECTOR_MAP[symbol], industry: '' };
  }

  const cacheKey = `sector:${symbol}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const classify = (payload = {}) => {
    const sector = payload.sector || payload.category || payload.fundCategory || payload.quoteType || payload.typeDisp || '';
    const industry = payload.industry || payload.exchange || payload.longName || '';
    if (sector) return { sector, industry: industry || '' };
    return null;
  };

  const viaLibrary = await yf2.quoteSummary(symbol, ['assetProfile', 'summaryProfile', 'quoteType', 'price']);
  if (viaLibrary) {
    const qt = (viaLibrary.quoteType?.quoteType || '').toUpperCase();
    const result = classify({
      sector: viaLibrary.assetProfile?.sector || viaLibrary.summaryProfile?.sector || (qt === 'ETF' ? 'ETF' : qt === 'MUTUALFUND' ? 'Mutual Fund' : ''),
      industry: viaLibrary.assetProfile?.industry || viaLibrary.summaryProfile?.industry || '',
    });
    if (result) {
      setCache(cacheKey, result, 6 * 60 * 60 * 1000);
      return result;
    }
  }

  // Respaldo rápido para acciones de EE. UU.: el sector de Nasdaq (una sola descarga en caché).
  // Desde servidores en la nube Yahoo suele negar el perfil de la empresa, y las demás fuentes son lentas.
  try {
    const us = await getUsSector(symbol);
    if (us?.sector) {
      setCache(cacheKey, us, 6 * 60 * 60 * 1000);
      return us;
    }
  } catch (_) {}

  const quoteUrls = [
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`
  ];
  for (const quoteUrl of quoteUrls) {
    try {
      const data = await fetchJson(quoteUrl, { timeoutMs: 7000 });
      const q = data?.quoteResponse?.result?.[0];
      const qt = (q?.quoteType || '').toUpperCase();
      const typeSector = qt === 'ETF' ? 'ETF' : qt === 'MUTUALFUND' ? 'Mutual Fund' : '';
      const result = classify({ sector: q?.sector || typeSector, industry: q?.industry || q?.fullExchangeName || q?.exchange });
      if (result) {
        setCache(cacheKey, result, 6 * 60 * 60 * 1000);
        return result;
      }
    } catch (_) {}
  }

  const summaryUrls = [
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,summaryProfile,fundProfile,quoteType,price`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,summaryProfile,fundProfile,quoteType,price`
  ];

  for (const summaryUrl of summaryUrls) {
    try {
      const data = await fetchJson(summaryUrl, { timeoutMs: 7000 });
      const resultNode = data?.quoteSummary?.result?.[0] || {};
      const quoteType = (resultNode?.quoteType?.quoteType || '').toUpperCase();
      const result = classify({
        sector: resultNode?.assetProfile?.sector || resultNode?.summaryProfile?.sector || (quoteType === 'ETF' ? 'ETF' : quoteType === 'MUTUALFUND' ? 'Mutual Fund' : ''),
        industry: resultNode?.assetProfile?.industry || resultNode?.summaryProfile?.industry || resultNode?.price?.exchangeName || resultNode?.price?.longName || ''
      });
      if (result) {
        setCache(cacheKey, result, 6 * 60 * 60 * 1000);
        return result;
      }
    } catch (_) {}
  }

  try {
    const stockAnalysis = await getSectorFromStockAnalysis(symbol);
    if (stockAnalysis?.sector) {
      setCache(cacheKey, stockAnalysis, 6 * 60 * 60 * 1000);
      return stockAnalysis;
    }
  } catch (_) {}

  const fallback = { sector: 'Other', industry: '' };
  setCache(cacheKey, fallback, 6 * 60 * 60 * 1000);
  return fallback;
}

async function getSectors(symbols) {
  const entries = await Promise.all(symbols.map(async (symbol) => [symbol, await getSectorForSymbol(symbol)]));
  return Object.fromEntries(entries);
}

async function getQuotes(symbols, options = {}) {
  // Yahoo's v7/finance/quote supports up to ~200 symbols per call; we chunk
  // defensively to stay well below that. Returns a symbol-keyed object with
  // only the fields the UI needs.
  const cleaned = (symbols || []).filter(Boolean);
  if (!cleaned.length) return {};

  const out = {};
  const chunkSize = 50;
  const withDetails = !!options.details;

  // Some Yahoo endpoints wrap numeric values as { raw, fmt }; others return
  // the raw number directly. This helper flattens either shape to a number
  // (or null).
  const num = (v) => {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'object' && 'raw' in v) return isFinite(v.raw) ? v.raw : null;
    const n = Number(v);
    return isFinite(n) ? n : null;
  };

  for (let i = 0; i < cleaned.length; i += chunkSize) {
    const chunk = cleaned.slice(i, i + chunkSize);
    const cacheKey = 'quotes2:' + chunk.join(',');
    const cached = getCache(cacheKey + (withDetails ? ':d1' : ':d0'));
    if (cached) { Object.assign(out, cached); continue; }

    const urls = [
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(','))}`,
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(','))}`,
    ];

    let fetched = await yf2.quote(chunk);
    if (fetched && !fetched.length) fetched = null;
    if (!fetched) for (const url of urls) {
      try {
        const data = await fetchJson(url, { timeoutMs: 10000 });
        const arr = data?.quoteResponse?.result;
        if (Array.isArray(arr)) { fetched = arr; break; }
      } catch (_) {}
    }

    const partial = {};
    if (fetched) {
      for (const q of fetched) {
        if (!q?.symbol) continue;
        partial[q.symbol] = {
          // Price + market
          price:         num(q.regularMarketPrice),
          dayChangePct:  num(q.regularMarketChangePercent),
          dayChange:     num(q.regularMarketChange),
          volume:        num(q.regularMarketVolume),
          avgVolume:     num(q.averageDailyVolume3Month ?? q.averageDailyVolume10Day),
          marketCap:     num(q.marketCap),
          currency:      q.currency ?? null,
          // Valuation ratios
          peRatio:       num(q.trailingPE),
          forwardPE:     num(q.forwardPE),
          priceToSales:  num(q.priceToSalesTrailing12Months),
          priceToBook:   num(q.priceToBook),
          pegRatio:      num(q.pegRatio),
          epsTrailing:   num(q.epsTrailingTwelveMonths),
          // Yields / risk
          dividendYield: num(q.dividendYield ?? q.trailingAnnualDividendYield),
          beta:          num(q.beta),
          // Ownership / capital structure
          sharesOutstanding: num(q.sharesOutstanding),
          floatShares:   num(q.floatShares),
          shortInterestPct: rawNum(q.shortPercentOfFloat),
          institutionalOwnershipPct: rawNum(q.heldPercentInstitutions),
          insiderOwnershipPct: rawNum(q.heldPercentInsiders),
          // 52-week range
          week52High:    num(q.fiftyTwoWeekHigh),
          week52Low:     num(q.fiftyTwoWeekLow),
          // Classification
          sector:        q.sector ?? null,
          industry:      q.industry ?? null,
          country:       q.country ?? null,
          // Names
          shortName:     q.shortName ?? q.longName ?? q.symbol,
          longName:      q.longName ?? q.shortName ?? q.symbol,
          exchange:      q.fullExchangeName ?? q.exchange ?? null,
        };
      }
    }
    if (withDetails && fetched) {
      const detailEntries = await Promise.all(chunk.map(async (symbol) => {
        try {
          const details = await getQuoteDetails(symbol);
          return [symbol, details];
        } catch (_) {
          return [symbol, {}];
        }
      }));
      for (const [symbol, details] of detailEntries) {
        partial[symbol] = { ...(partial[symbol] || {}), ...(details || {}) };
      }
    }

    // Cache whatever we got (including empty map) for 60s to avoid hammering
    // Yahoo when a user refreshes quickly.
    setCache(cacheKey + (withDetails ? ':d1' : ':d0'), partial, 60_000);
    Object.assign(out, partial);
  }

  // Sin nombre de Yahoo (habitual desde servidores en la nube): el nombre de la empresa según Nasdaq.
  for (const symbol of cleaned) {
    const q = out[symbol];
    if (q?.shortName && q.shortName !== symbol) continue;
    try {
      const name = await getUsName(symbol);
      if (name) out[symbol] = { ...(q || {}), symbol, shortName: name, longName: q?.longName && q.longName !== symbol ? q.longName : name };
    } catch (_) {}
  }
  return out;
}

module.exports = { getChart, getSectors, getQuotes, getChartCacheStats };
