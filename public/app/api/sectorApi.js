(function(){
  async function fetchMissingSectors(tickers, existingSectorData, setSectorData){
    const pending=[...new Set((tickers||[]).filter(Boolean))].filter(t=>!(existingSectorData||{})[t]);
    if(!pending.length)return {};
    try{
      const merged={};
      for(let i=0;i<pending.length;i+=50){
        const chunk=pending.slice(i,i+50);
        const resp=await fetch("/api/sectors?symbols="+chunk.join(","));
        const json=await resp.json();
        if(json)Object.assign(merged,json);
      }
      if(Object.keys(merged).length && typeof setSectorData === 'function'){
        setSectorData(prev=>({...prev,...merged}));
      }
      return merged;
    }catch(e){
      console.log("Sector fetch error",e);
      return {};
    }
  }
  window.StockScannerApi = Object.assign(window.StockScannerApi||{}, { fetchMissingSectors });
})();
