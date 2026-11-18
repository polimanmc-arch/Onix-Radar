const express = require('express');
const { getChart, getChartCacheStats } = require('../services/marketData.service');
const { getDiskCacheStats, hasDiskCache, pruneDiskCache } = require('../utils/diskCache');
const { hasCache } = require('../utils/cache');

const router = express.Router();

router.get('/chart/:ticker', async (req, res) => {
  try {
    const data = await getChart(req.params.ticker, req.query.interval || '1wk', req.query.range || '2y');
    res.json(data);
  } catch (error) {
    // Return a graceful payload instead of HTTP 500 so the frontend can show
    // an inline error message without polluting the console or crashing a modal.
    res.json({ chart: { result: [] }, error: error.message, ok: false });
  }
});

router.post('/charts', async (req, res) => {
  const rawSymbols = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
  const symbols = [...new Set(rawSymbols
    .map(s => String(s || '').trim().toUpperCase())
    .filter(s => s && /^[A-Z0-9.^=\-]+$/.test(s))
  )].slice(0, 500);
  const interval = String(req.body?.interval || '1wk');
  const range = String(req.body?.range || '2y');
  const concurrency = Math.max(1, Math.min(40, Number(req.body?.concurrency) || 18));

  const results = {};
  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(async ticker => {
      try {
        const data = await getChart(ticker, interval, range);
        return [ticker, data];
      } catch (error) {
        return [ticker, { chart: { result: [] }, error: error.message, ok: false }];
      }
    }));
    settled.forEach((item, idx) => {
      const ticker = batch[idx];
      if (item.status === 'fulfilled') results[item.value[0]] = item.value[1];
      else results[ticker] = { chart: { result: [] }, error: item.reason?.message || 'Error', ok: false };
    });
  }

  res.json({ ok: true, count: symbols.length, results });
});

router.post('/charts/cache/check', async (req, res) => {
  const rawSymbols = Array.isArray(req.body?.symbols) ? req.body.symbols : [];
  const symbols = [...new Set(rawSymbols
    .map(s => String(s || '').trim().toUpperCase())
    .filter(s => s && /^[A-Z0-9.^=\-]+$/.test(s))
  )].slice(0, 10000);
  const interval = String(req.body?.interval || '1wk');
  const range = String(req.body?.range || '2y');
  const missing = [];
  const memory = [];
  const disk = [];

  for (const ticker of symbols) {
    const key = `chart:${ticker}:${interval}:${range}`;
    if (hasCache(key)) {
      memory.push(ticker);
      continue;
    }
    if (await hasDiskCache('charts', key)) disk.push(ticker);
    else missing.push(ticker);
  }

  res.json({
    ok: true,
    count: symbols.length,
    interval,
    range,
    cached: memory.length + disk.length,
    memory: memory.length,
    disk: disk.length,
    missing: missing.length,
    missingSymbols: missing,
  });
});

router.get('/charts/cache/stats', async (_req, res) => {
  const disk = await getDiskCacheStats('charts');
  res.json({ ok: true, memory: getChartCacheStats(), disk });
});

router.post('/charts/cache/prune', async (_req, res) => {
  const pruned = await pruneDiskCache('charts');
  const disk = await getDiskCacheStats('charts');
  res.json({ ok: true, pruned, disk });
});

module.exports = router;
