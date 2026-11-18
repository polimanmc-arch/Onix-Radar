// portfolioController.js — portfolio watchlist CRUD.
window.StockScannerControllers = window.StockScannerControllers || {};

window.StockScannerControllers.createPortfolioWatchlistActions = function({
  parsePortfolioManualTickers, setPfWatchlists, setPfSelectedWatchlistId, setPfWatchlistName,
  setPfManualTickers, setPfUniverseSource, pfWatchlists
}){
  return {
    saveCurrentManualWatchlist: function({ pfManualTickers, pfWatchlistName, pfSelectedWatchlistId }){
      const normalized = parsePortfolioManualTickers(pfManualTickers).map(x => (x.sideHint==='short'?'-':x.sideHint==='long'?'+':'') + x.ticker).join(', ');
      if(!normalized) return { ok:false, message:'Agrega al menos un ticker manual para guardar la watchlist.' };
      const baseName = (pfWatchlistName || 'Watchlist ' + new Date().toLocaleString()).trim();
      const id = pfSelectedWatchlistId || String(Date.now());
      setPfWatchlists(prev => {
        const next = [...(prev||[])];
        const idx = next.findIndex(x => x.id===id || x.name.toLowerCase()===baseName.toLowerCase());
        const item = { id: idx>=0 ? next[idx].id : id, name: baseName, tickers: normalized, savedAt: new Date().toISOString() };
        if(idx>=0) next[idx]=item; else next.unshift(item);
        return next.slice(0,50);
      });
      setPfSelectedWatchlistId(id);
      setPfWatchlistName(baseName);
      return { ok:true, id, name:baseName };
    },
    loadSelectedManualWatchlist: function(pfSelectedWatchlistId){
      const item = pfWatchlists.find(x => x.id===pfSelectedWatchlistId);
      if(!item) return { ok:false };
      setPfManualTickers(item.tickers || '');
      setPfWatchlistName(item.name || '');
      setPfUniverseSource('manual');
      return { ok:true, item };
    },
    deleteSelectedManualWatchlist: function(pfSelectedWatchlistId){
      if(!pfSelectedWatchlistId) return { ok:false };
      setPfWatchlists(prev => prev.filter(x => x.id!==pfSelectedWatchlistId));
      setPfSelectedWatchlistId('');
      return { ok:true };
    }
  };
};
