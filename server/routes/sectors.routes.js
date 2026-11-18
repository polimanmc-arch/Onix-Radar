const express = require('express');
const { getSectors } = require('../services/marketData.service');

const router = express.Router();

router.get('/sectors', async (req, res) => {
  const symbols = (req.query.symbols || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (!symbols.length) return res.json({});

  try {
    const data = await getSectors(symbols);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
