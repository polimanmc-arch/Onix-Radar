const express = require('express');
const { getTickers } = require('../services/nasdaq.service');

const router = express.Router();

router.get('/tickers', async (_req, res) => {
  try {
    const data = await getTickers();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
