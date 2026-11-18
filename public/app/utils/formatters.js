(function(){
  function fmt(n,d){
    const digits=d||2;
    return n!=null?n.toLocaleString("en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits}):"—";
  }
  function fmtV(n){
    return n==null?"—":n>=1e9?(n/1e9).toFixed(1)+"B":n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e3?(n/1e3).toFixed(0)+"K":""+n;
  }
  function indLbl(id,p={},indicators){
    if(id==="STOCH")return "Stoch("+p.p+","+(p.ks||1)+","+(p.dp||3)+")";
    if(id==="MACD")return "MACD("+p.p+","+(p.sl||26)+","+(p.sg||9)+")";
    const def=(indicators||[]).find(x=>x.id===id);
    if(!def) return id;
    if(def.param!=null) return def.label+" ("+p.p+")";
    return def.label;
  }
  function exportScanCsv(shown, filters, indicators, filename){
    const hdr=["Ticker","Nombre","Precio"];
    filters.forEach(f=>{hdr.push(indLbl(f.ind,f.params,indicators)+" ["+f.tf+"] Actual");if(f.cmpType==="prev"||f.cmpType==="ind")hdr.push("vs Comparación");hdr.push("Pasa?")});
    hdr.push("Pasa Todo");
    const rows=[hdr.join(",")];
    shown.forEach(r=>{
      const row=[r.ticker,'"'+(r.name||"").replace(/"/g,"'")+'"',r.price?.toFixed(2)??""];
      r.fRes.forEach((fr,i)=>{row.push(fr.val?.toFixed(4)??"");if(filters[i].cmpType==="prev"||filters[i].cmpType==="ind")row.push(fr.cmp?.toFixed(4)??"");row.push(fr.pass?"SI":"NO")});
      row.push(r.passed?"SI":"NO");
      rows.push(row.join(","));
    });
    const b=new Blob([rows.join("\n")],{type:"text/csv"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(b);
    a.download=filename||("scan_"+new Date().toISOString().slice(0,10)+".csv");
    a.click();
  }
  window.StockScannerFormatters = { fmt, fmtV, indLbl, exportScanCsv };
})();
