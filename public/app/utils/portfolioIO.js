(function(){
  function parsePortfolioManualTickers(text){
    return String(text||"")
      .split(/[\s,;]+/)
      .map(x=>x.trim())
      .filter(Boolean)
      .map(token=>{
        let sideHint="";
        let ticker=token.toUpperCase();
        if(ticker.startsWith("+")){sideHint="long";ticker=ticker.slice(1)}
        else if(ticker.startsWith("-")){sideHint="short";ticker=ticker.slice(1)}
        return {ticker,sideHint};
      })
      .filter(x=>/^[A-Z.\-]+$/.test(x.ticker));
  }

  function loadPortfolioWatchlists(){
    try{
      const raw=localStorage.getItem("probus_portfolio_watchlists_v1") || localStorage.getItem("stock_scanner_portfolio_watchlists_v1");
      const parsed=JSON.parse(raw||"[]");
      return Array.isArray(parsed)?parsed:[];
    }catch{
      return [];
    }
  }

  function savePortfolioWatchlistsToStorage(items){
    try{ localStorage.setItem("probus_portfolio_watchlists_v1", JSON.stringify(Array.isArray(items)?items:[])); }catch{}
  }

  function parsePortfolioCsvText(text){
    const lines=String(text||"")
      .trim()
      .split(/\r?\n/)
      .map(x=>x.trim())
      .filter(Boolean);
    if(!lines.length)return "";
    const out=[];
    const hasHeader=/ticker/i.test(lines[0]);
    const rows=hasHeader?lines.slice(1):lines;
    rows.forEach(line=>{
      const parts=line.split(',').map(x=>x.trim());
      if(!parts[0])return;
      const tk=parts[0].toUpperCase();
      if(!/^[A-Z.\-]+$/.test(tk))return;
      const side=(parts[1]||"").toLowerCase();
      out.push((side==="short"?"-":side==="long"?"+":"")+tk);
    });
    return out.join(', ');
  }

  function exportManualWatchlistCsv(text, watchlistName){
    const rows=parsePortfolioManualTickers(text).map(x=>`${x.ticker},${x.sideHint||""}`);
    if(!rows.length)return {ok:false,message:"No hay tickers manuales para exportar."};
    const blob=new Blob(["ticker,side\n"+rows.join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=((watchlistName||"portfolio_watchlist").replace(/[^a-z0-9_\-]+/gi,"_")||"portfolio_watchlist")+".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),500);
    return {ok:true};
  }

  window.StockScannerPortfolioIO = {
    parsePortfolioManualTickers,
    loadPortfolioWatchlists,
    savePortfolioWatchlistsToStorage,
    parsePortfolioCsvText,
    exportManualWatchlistCsv,
  };
})();
