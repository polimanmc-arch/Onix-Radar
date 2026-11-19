const express = require('express');
const path = require('path');
const chartRoutes = require('./routes/chart.routes');
const sectorsRoutes = require('./routes/sectors.routes');
const tickersRoutes = require('./routes/tickers.routes');
const quotesRoutes = require('./routes/quotes.routes');
const { createTelegramRouter } = require('./routes/telegram.routes');
const yahooFinance2 = require('./services/yahooFinance2');

function createApp(options = {}) {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'Radar Onix', node: process.versions.node, yahooFinance2: yahooFinance2.status() }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api', chartRoutes);
  app.use('/api', sectorsRoutes);
  app.use('/api', tickersRoutes);
  app.use('/api', quotesRoutes);
  app.use('/api', createTelegramRouter(options.telegram));
  return app;
}

module.exports = { createApp };
