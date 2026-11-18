const yahoo = require('./yahoo.service');

const PRICE_SOURCE = (process.env.PRICE_DATA_SOURCE || 'yahoo').toLowerCase();

function activeProvider() {
  switch (PRICE_SOURCE) {
    case 'yahoo':
    default:
      return yahoo;
  }
}

async function getChart(...args) {
  return activeProvider().getChart(...args);
}

async function getSectors(...args) {
  return activeProvider().getSectors(...args);
}

async function getQuotes(symbols, options = {}) {
  return activeProvider().getQuotes(symbols, options);
}

function getChartCacheStats() {
  const provider = activeProvider();
  return provider.getChartCacheStats ? provider.getChartCacheStats() : {};
}

module.exports = { getChart, getSectors, getQuotes, getChartCacheStats, PRICE_SOURCE };
