const express = require('express');
const { getTickers, getRussell2000 } = require('../services/nasdaq.service');

const router = express.Router();

router.get('/tickers', async (_req, res) => {
  try {
    const data = await getTickers();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tickers/russell2000', async (_req, res) => {
  try {
    res.json(await getRussell2000());
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

module.exports = router;
