window.StockScannerApi = {
  async getJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `HTTP ${response.status}`);
    }
    return response.json();
  },
  chart(ticker, interval, range) {
    const params = new URLSearchParams({ interval, range });
    return this.getJson(`/api/chart/${encodeURIComponent(ticker)}?${params.toString()}`);
  },
  sectors(symbols) {
    const params = new URLSearchParams({ symbols: symbols.join(',') });
    return this.getJson(`/api/sectors?${params.toString()}`);
  },
  tickers() {
    return this.getJson('/api/tickers');
  }
};
