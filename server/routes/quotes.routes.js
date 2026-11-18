const express = require('express');
const { getQuotes } = require('../services/marketData.service');

const router = express.Router();

// GET /api/quotes?symbols=AAPL,MSFT,...
// Returns a symbol-keyed object with price, day change %, volume, market cap,
// P/E ratio, currency and short name. Designed for batched lookups after a
// portfolio is built — NOT for wide scans (400+ tickers).
router.get('/quotes', async (req, res) => {
  const symbols = (req.query.symbols || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (!symbols.length) return res.json({});

  try {
    const details = String(req.query.details || '').trim() === '1';
    const data = await getQuotes(symbols, { details });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
