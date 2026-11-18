(function(){
  // Fetch a batch of quote + fundamental metadata for the provided tickers.
  async function fetchQuotes(tickers, details=false){
    const list = [...new Set((tickers||[]).filter(Boolean))];
    if(!list.length) return {};
    try {
      const resp = await fetch("/api/quotes?symbols=" + encodeURIComponent(list.join(",")) + (details ? "&details=1" : ""));
      if(!resp.ok) return {};
      const json = await resp.json();
      return json || {};
    } catch(e){
      console.log("Quotes fetch error", e);
      return {};
    }
  }
  window.StockScannerApi = Object.assign(window.StockScannerApi||{}, { fetchQuotes });
})();
