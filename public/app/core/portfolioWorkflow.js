(function(){
  const { TIMEFRAMES } = window.StockScannerConfig || {};
  const { fetchTicker, avg, std } = window.StockScannerCore;


  // Límites de peso compartidos con el backtest (ver engine.js → boundWeights).
  const applyWeightBounds = (weights, minAbs, maxAbs) => window.StockScannerCore.boundWeights(weights, minAbs, maxAbs);

  // Clave de periodo para cruzar retornos de distintos símbolos por fecha y no por posición.
  // Se desplaza 6 h para que barras fechadas a medianoche europea (22:00-23:00 UTC del día anterior)
  // caigan en su día sin mover al día siguiente las diarias de EE. UU. (13:30 UTC).
  function periodKey(t, tf){
    if(t==null) return null;
    if(tf==='4h') return String(t);
    const d=new Date((Number(t)+21600)*1000);
    const y=d.getUTCFullYear(), m=d.getUTCMonth()+1, day=d.getUTCDate();
    if(tf==='1mo') return y+'-'+m;
    if(tf==='1wk'){
      const dt=new Date(Date.UTC(y,m-1,day));
      const dow=dt.getUTCDay()||7;
      dt.setUTCDate(dt.getUTCDate()+4-dow);
      const yStart=Date.UTC(dt.getUTCFullYear(),0,1);
      return dt.getUTCFullYear()+'-W'+Math.ceil(((dt-yStart)/86400000+1)/7);
    }
    return y+'-'+m+'-'+day;
  }

  // ── Hierarchical Risk Parity (López de Prado, 2016) ──────────────────────
  // 1) distancia de correlación d_ij = sqrt((1-ρ_ij)/2); 2) distancia entre columnas de d;
  // 3) agrupación jerárquica de enlace simple → orden cuasi-diagonal; 4) bisección recursiva
  // repartiendo el peso en proporción inversa a la varianza de cada mitad.
  // No invierte la matriz de covarianzas: es estable con pocos datos y activos muy correlacionados.
  function hrpWeights(cov){
    const n = Array.isArray(cov) ? cov.length : 0;
    if(!n) return { weights: [], order: [] };
    if(n === 1) return { weights: [1], order: [0] };
    const sd = cov.map((row, i) => Math.sqrt(Math.max(row[i], 1e-18)));
    const d = cov.map((row, i) => row.map((c, j) => {
      const rho = Math.max(-1, Math.min(1, c / (sd[i] * sd[j])));
      return Math.sqrt(Math.max(0, (1 - rho) / 2));
    }));
    const dd = d.map((ri, i) => d.map((rj, j) => {
      if(i === j) return 0;
      let s = 0; for(let k = 0; k < n; k++) s += (ri[k] - rj[k]) ** 2;
      return Math.sqrt(s);
    }));
    let clusters = Array.from({ length: n }, (_, i) => [i]);
    while(clusters.length > 1){
      let best = null;
      for(let a = 0; a < clusters.length; a++) for(let b = a + 1; b < clusters.length; b++){
        let link = Infinity;
        for(const i of clusters[a]) for(const j of clusters[b]) if(dd[i][j] < link) link = dd[i][j];
        if(!best || link < best.link - 1e-15) best = { a, b, link };
      }
      const merged = [...clusters[best.a], ...clusters[best.b]];
      clusters = clusters.filter((_, k) => k !== best.a && k !== best.b);
      clusters.push(merged);
    }
    const order = clusters[0];
    const clusterVar = items => {
      const inv = items.map(i => 1 / Math.max(cov[i][i], 1e-18));
      const s = inv.reduce((a, b) => a + b, 0);
      const w = inv.map(x => x / s);
      let v = 0;
      items.forEach((i, a) => items.forEach((j, b) => { v += w[a] * w[b] * cov[i][j]; }));
      return v;
    };
    const weights = Array(n).fill(1);
    const stack = [order];
    while(stack.length){
      const c = stack.pop();
      if(c.length <= 1) continue;
      const half = c.length >> 1;
      const left = c.slice(0, half), right = c.slice(half);
      const vl = clusterVar(left), vr = clusterVar(right);
      const alpha = vl + vr > 0 ? 1 - vl / (vl + vr) : 0.5;
      left.forEach(i => { weights[i] *= alpha; });
      right.forEach(i => { weights[i] *= 1 - alpha; });
      stack.push(left, right);
    }
    return { weights, order };
  }

  // ── X-ray: revisión de riesgos de concentración y diversificación (idea de Ghostfolio) ──
  const XRAY_LIMITS = { position: 0.25, top3: 0.5, sector: 0.4, effective: 5, corr: 0.8, cash: 0.2 };
  function portfolioXray(portfolio, limits = XRAY_LIMITS){
    const L = { ...XRAY_LIMITS, ...limits };
    const allocs = (portfolio?.allocations || []).filter(a => Number.isFinite(a.weight) && a.weight > 0);
    if(!allocs.length) return [];
    const pct = v => (v * 100).toFixed(1) + '%';
    const invested = allocs.reduce((s, a) => s + a.weight, 0);
    const sorted = [...allocs].sort((a, b) => b.weight - a.weight);
    const checks = [];
    const top = sorted[0];
    checks.push(top.weight > L.position
      ? { id: 'position', level: 'warn', title: 'Posición dominante', detail: `${top.ticker} pesa ${pct(top.weight)} (límite orientativo ${pct(L.position)}).` }
      : { id: 'position', level: 'ok', title: 'Peso por posición', detail: `La mayor es ${top.ticker} con ${pct(top.weight)}.` });
    const top3 = sorted.slice(0, 3).reduce((s, a) => s + a.weight, 0);
    checks.push(top3 > L.top3
      ? { id: 'top3', level: 'warn', title: 'Concentración en 3 valores', detail: `${sorted.slice(0, 3).map(a => a.ticker).join(', ')} suman ${pct(top3)}.` }
      : { id: 'top3', level: 'ok', title: 'Tres mayores posiciones', detail: `Suman ${pct(top3)}.` });
    const sectors = {};
    allocs.forEach(a => { const k = a.sector || 'Sin sector'; sectors[k] = (sectors[k] || 0) + a.weight; });
    const [topSector, topSectorW] = Object.entries(sectors).sort((a, b) => b[1] - a[1])[0];
    checks.push(topSectorW > L.sector && topSector !== 'Other'
      ? { id: 'sector', level: 'warn', title: 'Concentración sectorial', detail: `${topSector}: ${pct(topSectorW)} de la cartera.` }
      : { id: 'sector', level: 'ok', title: 'Sectores', detail: `Mayor exposición: ${topSector} con ${pct(topSectorW)} (${Object.keys(sectors).length} sectores).` });
    const nEff = 1 / allocs.reduce((s, a) => s + (a.weight / invested) ** 2, 0);
    checks.push(nEff < L.effective
      ? { id: 'effective', level: 'warn', title: 'Poca diversificación', detail: `Equivale a ${nEff.toFixed(1)} posiciones iguales (${allocs.length} reales).` }
      : { id: 'effective', level: 'ok', title: 'Diversificación', detail: `Equivale a ${nEff.toFixed(1)} posiciones iguales (${allocs.length} reales).` });
    const rows = portfolio.correlationMatrix || [];
    const held = new Set(allocs.map(a => a.ticker));
    const pairs = [];
    rows.forEach((r, i) => r.row.forEach((rho, j) => {
      if(j <= i) return;
      const other = rows[j]?.ticker;
      if(held.has(r.ticker) && held.has(other) && rho > L.corr) pairs.push({ a: r.ticker, b: other, rho });
    }));
    pairs.sort((x, y) => y.rho - x.rho);
    checks.push(pairs.length
      ? { id: 'corr', level: 'warn', title: 'Posiciones muy correlacionadas', detail: pairs.slice(0, 3).map(p => `${p.a}/${p.b} ${p.rho.toFixed(2)}`).join(' · ') + (pairs.length > 3 ? ` y ${pairs.length - 3} más` : '') }
      : { id: 'corr', level: 'ok', title: 'Correlaciones', detail: `Ningún par supera ${L.corr.toFixed(2)}.` });
    const cash = Math.max(0, 1 - invested);
    if(cash > L.cash) checks.push({ id: 'cash', level: 'info', title: 'Efectivo sin invertir', detail: `${pct(cash)} queda en efectivo por los límites de peso.` });
    return checks;
  }

  async function buildPortfolioWorkflow(opts){
    const {
      results, filters, shortFilters,
      pfCapital, pfMinWeight, pfMaxWeight, pfMaxPos, pfRiskFree, pfCorFilter, pfCorThresh,
      pfMode, pfSims, pfSeed, pfStopType, pfStopATRMult, pfStopATRPeriod, pfStopPctVal,
      pfSkipSparklines = false,
      sectorData, scanDirection, pfUniverseSource, pfManualTickers,
      fetchSectors, dataCacheRef, setPfBuilding, setTab, setPortfolio,
    } = opts;
    const finiteNum = (value, fallback, min = -Infinity, max = Infinity) => {
      const n = Number(value);
      if(!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    };
    const capital = finiteNum(pfCapital, 1000000, 1);
    const minWeightPct = finiteNum(pfMinWeight, 1, 0.5, 100);
    const maxWeightPct = finiteNum(pfMaxWeight, 25, 1, 100);
    const maxPos = Math.round(finiteNum(pfMaxPos, 10, 2, 50));
    const riskFreePct = finiteNum(pfRiskFree, 5, 0, 100);
    const corThresh = finiteNum(pfCorThresh, 0.80, 0.5, 0.99);
    const sims = Math.round(finiteNum(pfSims, 30000, 1, 250000));
    const stopATRMult = finiteNum(pfStopATRMult, 2, 0.5, 5);
    const stopPctVal = finiteNum(pfStopPctVal, 8, 1, 50);
    const atrPeriod = Math.round(finiteNum(pfStopATRPeriod, 14, 1, 200));
    // Semilla del muestreo: misma configuración + misma semilla = mismo portafolio.
    const seed = Math.round(finiteNum(pfSeed, 42, 0, 2147483647));
    const random = window.StockScannerCore.seededRandom(seed);

    const parsePortfolioManualTickers = window.StockScannerPortfolioIO?.parsePortfolioManualTickers || (()=>[]);
    const manualEntries=parsePortfolioManualTickers(pfManualTickers);
    let passed=[];
    if(pfUniverseSource==='manual'){
      passed=manualEntries.map(x=>({ticker:x.ticker,name:x.ticker,passed:true,direction:x.sideHint?x.sideHint.toUpperCase():null,sideHint:x.sideHint}));
    }else{
      passed=(results||[]).filter(r=>r.passed&&!r.err);
    }
    if(passed.length<2) return { ok:false, message:'Necesitas al menos 2 acciones para optimizar el portafolio.' };

    setPfBuilding(true);
    // Allow input and paint between CPU-heavy slices, including cached runs.
    let lastYield = Date.now();
    const yieldToUi = async () => {
      await new Promise(resolve=>setTimeout(resolve,0));
      lastYield = Date.now();
    };
    try{
      await yieldToUi();
      const portfolioFilters=scanDirection==='short'?shortFilters:filters;
      const tfs=[...new Set([...(filters||[]).map(f=>f.tf),...(shortFilters||[]).map(f=>f.tf),...portfolioFilters.map(f=>f.tf)])];
      const mainTf=tfs[0]||'1wk';
      const tfDef=TIMEFRAMES.find(t=>t.id===mainTf);
      const ppy=tfDef?.ppy||52;
      const stockData=[];
      const sectorSnapshot={...sectorData};
      const portfolioTickers=[...new Set(passed.map(r=>r.ticker))];
      const fetchedSectors=await fetchSectors(portfolioTickers);
      Object.assign(sectorSnapshot,fetchedSectors||{});

      for(const r of passed){
        if(Date.now()-lastYield >= 16) await yieldToUi();
        let cached=dataCacheRef.current[r.ticker]?.[mainTf];
        if(!cached||!cached.ok||cached.closes.length<32){
          const fetched=await fetchTicker(r.ticker,mainTf);
          if(fetched?.ok){
            dataCacheRef.current[r.ticker]={...(dataCacheRef.current[r.ticker]||{}),[mainTf]:fetched};
            cached=fetched;
          }
        }
        if(!cached||!cached.ok||cached.closes.length<32) continue;
        const closes=cached.closes.slice(1), highs=cached.highs.slice(1), lows=cached.lows.slice(1);
        // timePath: oldest-to-newest timestamps aligned with pricePath
        const timePath=[...(cached.times||[]).slice(1)].reverse();
        const barTimes=(cached.times||[]).slice(1);
        const rawRets=[], retKeys=[];
        for(let i=0;i<Math.min(closes.length-1,100);i++) if(closes[i+1]>0){ rawRets.push((closes[i]-closes[i+1])/closes[i+1]); retKeys.push(periodKey(barTimes[i],mainTf)); }
        if(rawRets.length<20) continue;
        let side;
        if(pfUniverseSource==='manual'){
          if(r.sideHint) side=r.sideHint;
          else side=scanDirection==='short'?'short':'long';
        }else{
          side=(r.direction||scanDirection||'LONG').toLowerCase()==='short'?'short':'long';
        }
        const signedRets=side==='short'?rawRets.map(x=>-x):rawRets;
        const meanRet=avg(rawRets);
        const variance=rawRets.reduce((a,r2)=>a+(r2-meanRet)**2,0)/(rawRets.length-1);
        const annRetRaw=meanRet*ppy;
        const annVol=Math.sqrt(Math.max(variance,0))*Math.sqrt(ppy);
        const signedAnnRet=avg(signedRets)*ppy;
        const sharpe=(signedAnnRet-(riskFreePct/100))/annVol;
        let atr=null;
        if(closes.length>=atrPeriod+1&&highs&&lows){
          const trs=[];
          for(let i=0;i<atrPeriod;i++) trs.push(Math.max(highs[i]-lows[i],Math.abs(highs[i]-closes[i+1]),Math.abs(lows[i]-closes[i+1])));
          atr=avg(trs);
        }
        const stopLoss=atr?closes[0]-stopATRMult*atr:null;
        const riskPerShare=atr?stopATRMult*atr:null;
        const stopLossPct=closes[0]*(1-stopPctVal/100);
        const riskPerSharePct=closes[0]*(stopPctVal/100);
        const sector=sectorSnapshot[r.ticker]?.sector||'Other';
        const industry=sectorSnapshot[r.ticker]?.industry||'';
        stockData.push({ticker:r.ticker,name:cached.name||r.name,price:r.price||closes[0],side,sign:side==='short'?-1:1,rawRets,signedRets,retKeys,annRetRaw,annRet:signedAnnRet,annVol,sharpe,atr,stopLoss:side==='short'?(atr?closes[0]+stopATRMult*atr:null):stopLoss,riskPerShare,riskPerSharePct,stopLossPct:side==='short'?closes[0]*(1+stopPctVal/100):stopLossPct,sector,industry,closes:[...closes],pricePath:[...closes].reverse(),timePath});
      }
      if(stockData.length<2){ return { ok:false, message:'No hubo suficientes acciones con datos históricos suficientes para optimizar.' }; }

      const n=stockData.length;
      // Retornos alineados por periodo. Si dos símbolos tienen exactamente las mismas fechas se usa
      // el camino rápido por índice; si no, se cruzan sólo los periodos comunes.
      const keySignatures=new Map();
      const alignInfo=stockData.map(s=>{
        const sig=s.retKeys.join('|');
        if(!keySignatures.has(sig)) keySignatures.set(sig,keySignatures.size);
        return {sigId:keySignatures.get(sig),index:new Map(s.retKeys.map((k,i)=>[k,i]))};
      });
      const MIN_COMMON=10;
      const commonPairs=(i,j)=>{
        const a=stockData[i], ai=alignInfo[i], bi=alignInfo[j];
        if(ai.sigId===bi.sigId) return null; // mismas fechas: alineación directa
        const ia=[], ib=[];
        a.retKeys.forEach((k,idx)=>{ const jdx=bi.index.get(k); if(jdx!=null){ ia.push(idx); ib.push(jdx); } });
        return {ia,ib};
      };
      // Covarianza muestral entre dos series ya emparejadas.
      const pairCov=(xs,ys,len,getX,getY)=>{
        if(len<2) return {cov:0,vx:0,vy:0,len};
        let mx=0,my=0; for(let k=0;k<len;k++){ mx+=getX(k); my+=getY(k); } mx/=len; my/=len;
        let cov=0,vx=0,vy=0;
        for(let k=0;k<len;k++){ const dx=getX(k)-mx, dy=getY(k)-my; cov+=dx*dy; vx+=dx*dx; vy+=dy*dy; }
        return {cov,vx,vy,len};
      };
      const pairStats=(i,j,field)=>{
        const xs=stockData[i][field], ys=stockData[j][field];
        const cp=commonPairs(i,j);
        if(!cp){ const len=Math.min(xs.length,ys.length); return pairCov(xs,ys,len,k=>xs[k],k=>ys[k]); }
        return pairCov(xs,ys,cp.ia.length,k=>xs[cp.ia[k]],k=>ys[cp.ib[k]]);
      };
      // Evaluate only pairs actually needed by selection or the final matrix.
      // Avoid an N x N allocation for a universe that becomes <= 50 positions.
      const correlationFor=(i,j)=>{
          if(i===j) return 1;
          const {cov,vx,vy,len}=pairStats(i,j,'signedRets');
          if(len<MIN_COMMON) return 0;
          return vx>0&&vy>0?cov/Math.sqrt(vx*vy):0;
      };

      let included=stockData.map((_,i)=>i);
      if(pfCorFilter){
        const removed=new Set();
        for(let i=0;i<n;i++){
          if(Date.now()-lastYield >= 16) await yieldToUi();
          if(removed.has(i)) continue;
          for(let j=i+1;j<n;j++){
            if(removed.has(j)) continue;
            if(Math.abs(correlationFor(i,j))>corThresh) removed.add(stockData[i].sharpe>=stockData[j].sharpe?j:i);
          }
        }
        included=included.filter(i=>!removed.has(i));
      }
      if(included.length>maxPos){ included.sort((a,b)=>stockData[b].sharpe-stockData[a].sharpe); included=included.slice(0,maxPos); }

      const sel=included.map(i=>stockData[i]);
      const m=sel.length;
      if(m<2){ return { ok:false, message:'Después de aplicar filtros de correlación quedaron menos de 2 acciones.' }; }
      const selectedCorrelation = sel.map((s,i) => ({
        ticker: s.ticker,
        row: sel.map((o,j) => correlationFor(included[i],included[j])),
      }));

      const covMat=Array.from({length:m},()=>Array(m).fill(0));
      for(let i=0;i<m;i++){
        for(let j=i;j<m;j++){
          const {cov,len}=i===j?pairStats(included[i],included[i],'rawRets'):pairStats(included[i],included[j],'rawRets');
          const c=len>=MIN_COMMON?cov/(len-1)*ppy:0;
          covMat[i][j]=c; covMat[j][i]=c;
        }
      }
      if(covMat.some((row,i)=>!(row[i]>0))){
        return { ok:false, message:'No hubo suficientes retornos históricos alineados para construir el portafolio.' };
      }

      const rf=riskFreePct/100; const maxW=maxWeightPct/100; const minW=Math.max(0, minWeightPct/100);
      const frontier=[];
      let bestSharpe={sharpe:-Infinity,weights:[],ret:0,vol:0};
      let bestMinVol={sharpe:-Infinity,weights:[],ret:0,vol:Infinity};
      let bestRet={sharpe:-Infinity,weights:[],ret:-Infinity,vol:0};
      const sampleEvery=Math.max(1,Math.floor(sims/600));
      const capPerName=maxW;
      // Random-weight sampling to approximate the efficient frontier.
      // This is NOT Monte Carlo price simulation — it samples random portfolio
      // weight vectors and evaluates their historical return/vol using the
      // covariance matrix. The best Sharpe, min-vol and max-ret portfolios
      // are all tracked so the UI can offer multiple optimization modes.
      // Pesos aleatorios con la semilla del usuario y los mismos límites [minW, maxW] que el
      // resultado final, para que todos los candidatos del muestreo sean válidos.
      const drawWeights=()=>{
        if(!m) return [];
        const raw=sel.map(s=>random()*(s.sign<0?-1:1));
        return applyWeightBounds(raw,minW,capPerName);
      };

      // Equal-weight mode skips sampling entirely for the "chosen" portfolio,
      // but we still run reduced sampling to draw the frontier backdrop.
      const effectiveSims = (pfMode === 'equalweight' || pfMode === 'hrp') ? Math.min(sims, 5000) : sims;
      const sampleBatch=(start,end)=>{
      for(let sim=start;sim<end;sim++){
        const w=drawWeights();
        let pRet=0; for(let i=0;i<m;i++) pRet+=w[i]*sel[i].annRetRaw;
        let pVar=0; for(let i=0;i<m;i++) for(let j=0;j<m;j++) pVar+=w[i]*w[j]*covMat[i][j];
        const pVol=Math.sqrt(Math.max(0,pVar)); const pSharpe=pVol>0?(pRet-rf)/pVol:-Infinity;
        if(sim%sampleEvery===0) frontier.push({vol:pVol*100,ret:pRet*100,sharpe:pSharpe});
        if(pSharpe>bestSharpe.sharpe) bestSharpe={sharpe:pSharpe,weights:[...w],ret:pRet,vol:pVol};
        if(pVol<bestMinVol.vol) bestMinVol={sharpe:pSharpe,weights:[...w],ret:pRet,vol:pVol};
        if(pRet>bestRet.ret) bestRet={sharpe:pSharpe,weights:[...w],ret:pRet,vol:pVol};
      }
      };
      for(let start=0;start<effectiveSims;start+=64){
        sampleBatch(start,Math.min(start+64,effectiveSims));
        if(Date.now()-lastYield >= 16) await yieldToUi();
      }

      // Compute the equal-weight portfolio analytically (respect per-name cap).
      const ewWeights = (()=>{
        const raw = sel.map(s => s.sign < 0 ? -1/m : 1/m);
        return applyWeightBounds(raw, minW, capPerName);
      })();
      const ewPoint = (()=>{
        let r=0; for(let i=0;i<m;i++) r+=ewWeights[i]*sel[i].annRetRaw;
        let v=0; for(let i=0;i<m;i++) for(let j=0;j<m;j++) v+=ewWeights[i]*ewWeights[j]*covMat[i][j];
        const vol = Math.sqrt(Math.max(0,v));
        return { weights: ewWeights, ret:r, vol, sharpe: vol>0 ? (r-rf)/vol : 0 };
      })();

      // HRP sobre la covarianza con signo (para cortos el riesgo se mide en la dirección de la posición).
      const hrpPoint = (()=>{
        const signedCov = covMat.map((row,i)=>row.map((c,j)=>c*sel[i].sign*sel[j].sign));
        const { weights } = hrpWeights(signedCov);
        const w = applyWeightBounds(weights.map((x,i)=>x*sel[i].sign), minW, capPerName);
        let r=0; for(let i=0;i<m;i++) r+=w[i]*sel[i].annRetRaw;
        let v=0; for(let i=0;i<m;i++) for(let j=0;j<m;j++) v+=w[i]*w[j]*covMat[i][j];
        const vol = Math.sqrt(Math.max(0,v));
        return { weights: w, ret:r, vol, sharpe: vol>0 ? (r-rf)/vol : 0 };
      })();

      let chosen;
      if(pfMode === 'maxsharpe') chosen = bestSharpe;
      else if(pfMode === 'minvol') chosen = bestMinVol;
      else if(pfMode === 'maxret') chosen = bestRet;
      else if(pfMode === 'equalweight') chosen = ewPoint;
      else if(pfMode === 'hrp') chosen = hrpPoint;
      else chosen = bestSharpe;
      chosen = { ...chosen, weights: applyWeightBounds(chosen.weights || [], minW, capPerName) };
      if(!Array.isArray(chosen.weights) || chosen.weights.length !== m || chosen.weights.some(w=>!Number.isFinite(w))){
        chosen = { ...ewPoint, weights: ewWeights };
      }
      const rawAllocations=sel.map((s,i)=>({
        ticker:s.ticker,name:s.name,price:s.price,side:s.side||'long',weight:Math.abs(chosen.weights[i]),signedWeight:chosen.weights[i],
        grossAmount:Math.abs(chosen.weights[i])*capital,amount:chosen.weights[i]*capital,shares:Math.floor(Math.abs(chosen.weights[i]*capital)/s.price),
        annRet:s.annRet,annRetRaw:s.annRetRaw,annVol:s.annVol,sharpe:s.sharpe,
        stopLoss:s.stopLoss,atr:s.atr,riskPerShare:s.riskPerShare,stopLossPct:s.stopLossPct,riskPerSharePct:s.riskPerSharePct,
        sector:s.sector,industry:s.industry,pricePath:s.pricePath,timePath:s.timePath
      })).filter(a=>Number.isFinite(a.signedWeight) && Math.abs(a.signedWeight)>0);
      let allocations=rawAllocations.filter(a=>Math.abs(a.signedWeight)>0.005).sort((a,b)=>Math.abs(b.signedWeight)-Math.abs(a.signedWeight));
      if(!allocations.length){
        allocations=rawAllocations.sort((a,b)=>Math.abs(b.signedWeight)-Math.abs(a.signedWeight));
      }
      if(!allocations.length){
        return { ok:false, message:'La optimización no produjo pesos válidos. Prueba aumentar Max peso %, bajar Min por acción % o desactivar temporalmente el filtro de correlación.' };
      }
      allocations.forEach(a=>{
        a.signedAmount=a.signedWeight*capital;
        const rps=pfStopType==='atr'?a.riskPerShare:pfStopType==='pct'?a.riskPerSharePct:null;
        a.riskAmount=rps?a.shares*rps:null;
        a.activeStop=pfStopType==='atr'?a.stopLoss:pfStopType==='pct'?a.stopLossPct:null;
      });

      const simLen=Math.min(...allocations.map(a=>a.pricePath.length));
      if(!Number.isFinite(simLen) || simLen < 2){
        return { ok:false, message:'No hubo suficientes precios históricos para simular la curva del portafolio.' };
      }
      const positions={}; let cash=capital; const equityCurve=[];
      const eqTimePath=allocations[0]?.timePath||[];
      const placeToTarget=(equity,step)=>{
        allocations.forEach(a=>{
          const px=a.pricePath[step]; if(!(px>0)) return;
          const targetNotional=a.signedWeight*equity;
          const targetShares=(targetNotional>=0?1:-1)*Math.floor(Math.abs(targetNotional)/px);
          const cur=positions[a.ticker]?.shares||0;
          const delta=targetShares-cur;
          if(delta!==0){ cash-=delta*px; positions[a.ticker]={shares:targetShares,price:px}; }
          else if(positions[a.ticker]) positions[a.ticker].price=px;
          else positions[a.ticker]={shares:targetShares,price:px};
        });
      };
      placeToTarget(capital,0);
      for(let step=0;step<simLen;step++){
        allocations.forEach(a=>{ if(positions[a.ticker]) positions[a.ticker].price=a.pricePath[step]; });
        let equity=cash;
        allocations.forEach(a=>{ const pos=positions[a.ticker]; if(!pos) return; const signedVal=pos.shares*(pos.price||0); equity+=signedVal; });
        equityCurve.push({step,value:equity,time:eqTimePath[step]||0,cash});
      }

      // ── Enrichment: fetch fundamentals + 3-month daily closes for sparkline.
      // Both run in parallel since they hit independent endpoints. We tolerate
      // failures gracefully — missing data renders as "—" in the UI.
      const allocTickers = allocations.map(a=>a.ticker);
      const fetchQuotes = window.StockScannerApi?.fetchQuotes;
      const [quotesMap, sparkMap] = await Promise.all([
        (typeof fetchQuotes === 'function' ? fetchQuotes(allocTickers) : Promise.resolve({})),
        (async ()=>{
          const sparkEntries = await Promise.all(allocTickers.map(async t => {
            try {
              // El modo simple no muestra estas mini series: evita descargar años de velas diarias.
              if(pfSkipSparklines) return [t, []];
              const cached = dataCacheRef.current?.[t]?.['1d'];
              let d = cached;
              if(!(d && d.ok && Array.isArray(d.closes) && d.closes.length >= 10)){
                d = await fetchTicker(t, '1d').catch(()=>null);
                if(d?.ok){
                  dataCacheRef.current[t] = { ...(dataCacheRef.current[t]||{}), '1d': d };
                }
              }
              if(!(d?.ok && Array.isArray(d.closes))) return [t, []];
              // 63 trading days ≈ 3 months; closes are newest-first already.
              return [t, d.closes.slice(0, 63).filter(v=>v!=null)];
            } catch(_) { return [t, []]; }
          }));
          return Object.fromEntries(sparkEntries);
        })(),
      ]);
      // Attach fundamentals + sparkline to each allocation.
      allocations.forEach(a => {
        const q = quotesMap?.[a.ticker] || {};
        // Name: prefer shortName from quotes, fall back to existing allocation name
        a.shortName     = q.shortName || a.name || a.ticker;
        a.longName      = q.longName  || q.shortName || a.name || a.ticker;
        a.exchange      = q.exchange || null;
        // Price info (for the summary view in the chart modal)
        a.dayChangePct  = q.dayChangePct ?? null;
        a.dayChange     = q.dayChange ?? null;
        a.volume        = q.volume ?? null;
        a.avgVolume     = q.avgVolume ?? null;
        a.marketCap     = q.marketCap ?? null;
        // Valuation
        a.peRatio       = q.peRatio ?? null;
        a.forwardPE     = q.forwardPE ?? null;
        a.priceToBook   = q.priceToBook ?? null;
        a.pegRatio      = q.pegRatio ?? null;
        a.epsTrailing   = q.epsTrailing ?? null;
        // Yields / risk
        a.dividendYield = q.dividendYield ?? null;
        a.beta          = q.beta ?? null;
        // 52-week range
        a.week52High    = q.week52High ?? null;
        a.week52Low     = q.week52Low ?? null;
        // Sparkline (newest-first closes, ~63 days)
        a.spark         = sparkMap?.[a.ticker] || [];
      });

      const finalPt=equityCurve[equityCurve.length-1]||{value:capital,cash};
      const eqRets=[]; for(let i=1;i<equityCurve.length;i++) if(equityCurve[i-1].value) eqRets.push((equityCurve[i].value-equityCurve[i-1].value)/equityCurve[i-1].value);
      const eqMean=avg(eqRets); const eqVol=std(eqRets)*Math.sqrt(ppy); const simAnnReturn=Math.pow(1+eqMean,ppy)-1; const simSharpe=eqVol>0?(simAnnReturn-rf)/eqVol:0;
      const sectorMap={};
      allocations.forEach(a=>{ const s=a.sector||'N/A'; if(!sectorMap[s]) sectorMap[s]={weight:0,count:0,tickers:[]}; sectorMap[s].weight+=Math.abs(a.signedWeight); sectorMap[s].count++; sectorMap[s].tickers.push(a.ticker); });
      const sectors=Object.entries(sectorMap).map(([name,d])=>({name,weight:d.weight,count:d.count,tickers:d.tickers})).sort((a,b)=>b.weight-a.weight);

      setPortfolio({
        allocations,sectors,frontier,equityCurve,correlationMatrix:selectedCorrelation,
        chosenPoint:{vol:chosen.vol*100,ret:chosen.ret*100},
        altSharpePoint:{vol:bestSharpe.vol*100,ret:bestSharpe.ret*100},
        altMinVolPoint:{vol:bestMinVol.vol*100,ret:bestMinVol.ret*100},
        altMaxRetPoint:{vol:bestRet.vol*100,ret:bestRet.ret*100},
        altEqualWeightPoint:{vol:ewPoint.vol*100,ret:ewPoint.ret*100},
        altHrpPoint:{vol:hrpPoint.vol*100,ret:hrpPoint.ret*100},
        totalStocks:stockData.length,afterCorFilter:sel.length,removedByCor:stockData.length-sel.length,
        portReturn:simAnnReturn,portVol:eqVol,portSharpe:simSharpe,
        cash:finalPt.cash,endingEquity:finalPt.value,
        mode:pfMode,capital,altSharpe:bestSharpe,altMinVol:bestMinVol,
        source:pfUniverseSource,manualInputCount:manualEntries.length,
        simsRequested:sims, simsUsed:effectiveSims, seed, scanDirection
      });
      setTab('portfolio');
      return { ok:true };
    }finally{
      setPfBuilding(false);
    }
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore||{}, { buildPortfolioWorkflow, hrpWeights, portfolioXray });
})();
