const express = require('express');
const path = require('path');
const chartRoutes = require('./routes/chart.routes');
const sectorsRoutes = require('./routes/sectors.routes');
const tickersRoutes = require('./routes/tickers.routes');
const quotesRoutes = require('./routes/quotes.routes');

function createApp() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'Radar Onix' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api', chartRoutes);
  app.use('/api', sectorsRoutes);
  app.use('/api', tickersRoutes);
  app.use('/api', quotesRoutes);
  return app;
}

module.exports = { createApp };
