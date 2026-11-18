(function(){
  const { TIMEFRAMES } = window.StockScannerConfig || {};
  const { fetchTicker, avg, std } = window.StockScannerCore;


  function applyWeightBounds(signedWeights, minAbs, maxAbs){
    const n = Array.isArray(signedWeights) ? signedWeights.length : 0;
    if(!n) return [];
    const signs = signedWeights.map(w => w < 0 ? -1 : 1);
    const original = signedWeights.map(w => Math.abs(Number(w)||0));
    const total = original.reduce((a,b)=>a+b,0);
    const base = total > 0 ? original.map(v => v/total) : Array.from({length:n}, ()=>1/n);

    let minW = Math.max(0, Number(minAbs)||0);
    let maxW = Math.max(0, Number(maxAbs)||0);
    if(maxW <= 0) maxW = 1;
    minW = Math.min(minW, maxW, 1/n);
    if(minW * n > 1 || maxW * n < 1){
      return Array.from({length:n}, (_,i)=>signs[i] * (1/n));
    }

    const weights = Array(n).fill(null);
    let free = new Set(Array.from({length:n}, (_,i)=>i));
    let changed = true;
    let guard = 0;
    while(changed && guard < 20){
      guard += 1;
      changed = false;
      const fixedSum = weights.reduce((a,v)=>a+(v==null?0:v),0);
      const remaining = 1 - fixedSum;
      if(remaining <= 0) break;
      const freeIdx = Array.from(free);
      const freeBaseSum = freeIdx.reduce((a,i)=>a+base[i],0) || freeIdx.length;
      for(const i of freeIdx){
        const provisional = remaining * ((base[i] || 1/freeIdx.length) / freeBaseSum);
        if(provisional < minW - 1e-9){ weights[i] = minW; free.delete(i); changed = true; }
        else if(provisional > maxW + 1e-9){ weights[i] = maxW; free.delete(i); changed = true; }
      }
    }
      const fixedSum = weights.reduce((a,v)=>a+(v==null?0:v),0);
      const remaining = Math.max(0, 1 - fixedSum);
      const freeIdx = Array.from(free);
      const freeBaseSum = freeIdx.reduce((a,i)=>a+base[i],0) || freeIdx.length;
      for(const i of freeIdx){
        weights[i] = remaining * ((base[i] || 1/freeIdx.length) / freeBaseSum);
      }
    const finalSum = weights.reduce((a,b)=>a+b,0) || 1;
    return weights.map((w,i)=>signs[i]*(w/finalSum));
  }

  async function buildPortfolioWorkflow(opts){
    const {
      results, filters, shortFilters,
      pfCapital, pfMinWeight, pfMaxWeight, pfMaxPos, pfRiskFree, pfCorFilter, pfCorThresh,
      pfMode, pfSims, pfStopType, pfStopATRMult, pfStopATRPeriod, pfStopPctVal,
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
        const rawRets=[];
        for(let i=0;i<Math.min(closes.length-1,100);i++) if(closes[i+1]>0) rawRets.push((closes[i]-closes[i+1])/closes[i+1]);
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
        stockData.push({ticker:r.ticker,name:cached.name||r.name,price:r.price||closes[0],side,sign:side==='short'?-1:1,rawRets,signedRets,annRetRaw,annRet:signedAnnRet,annVol,sharpe,atr,stopLoss:side==='short'?(atr?closes[0]+stopATRMult*atr:null):stopLoss,riskPerShare,riskPerSharePct,stopLossPct:side==='short'?closes[0]*(1+stopPctVal/100):stopLossPct,sector,industry,closes:[...closes],pricePath:[...closes].reverse(),timePath});
      }
      if(stockData.length<2){ return { ok:false, message:'No hubo suficientes acciones con datos históricos suficientes para optimizar.' }; }

      const n=stockData.length;
      const minLen=Math.min(...stockData.map(s=>s.rawRets.length));
      const centeredReturns=stockData.map(s=>{
        const rets=s.signedRets.slice(0,minLen), mean=avg(rets);
        const centered=rets.map(r=>r-mean);
        return {centered,variance:centered.reduce((sum,r)=>sum+r*r,0)};
      });
      // Evaluate only pairs actually needed by selection or the final matrix.
      // Avoid an N x N allocation for a universe that becomes <= 50 positions.
      const correlationFor=(i,j)=>{
          if(i===j) return 1;
          const {centered:ri,variance:vi}=centeredReturns[i];
          const {centered:rj,variance:vj}=centeredReturns[j];
          let cov=0;
          for(let k=0;k<minLen;k++) cov+=ri[k]*rj[k];
          return vi>0&&vj>0?cov/Math.sqrt(vi*vj):0;
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

      const retLen=Math.min(...sel.map(s=>s.rawRets.length));
      if(!Number.isFinite(retLen) || retLen < 2){
        return { ok:false, message:'No hubo suficientes retornos históricos alineados para construir el portafolio.' };
      }
      const covMat=Array.from({length:m},()=>Array(m).fill(0));
      for(let i=0;i<m;i++){
        for(let j=i;j<m;j++){
          const ri=sel[i].rawRets.slice(0,retLen), rj=sel[j].rawRets.slice(0,retLen);
          const mi=avg(ri), mj=avg(rj);
          let cov=0; for(let k=0;k<retLen;k++) cov+=(ri[k]-mi)*(rj[k]-mj);
          cov=cov/(retLen-1)*ppy; covMat[i][j]=cov; covMat[j][i]=cov;
        }
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
      const drawWeights=()=>{
        if(!m) return [];
        const raw=sel.map(()=>Math.random());
        let sum=raw.reduce((a,b)=>a+b,0)||1;
        let w=raw.map((x,i)=>(x/sum)*Math.min(1,m*capPerName)*(sel[i].sign<0?-1:1));
        for(let iter=0;iter<10;iter++){
          let capped=false; let absSum=0;
          for(let i=0;i<w.length;i++){
            const sign=w[i]<0?-1:1;
            const abs=Math.abs(w[i]);
            if(abs>capPerName){ w[i]=sign*capPerName; capped=true; }
            absSum+=Math.abs(w[i]);
          }
          if(absSum<=0) break;
          const scale=Math.min(1,1/absSum);
          w=w.map(x=>x*scale);
          if(!capped) break;
        }
        return w;
      };

      // Equal-weight mode skips sampling entirely for the "chosen" portfolio,
      // but we still run reduced sampling to draw the frontier backdrop.
      const effectiveSims = pfMode === 'equalweight' ? Math.min(sims, 5000) : sims;
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

      let chosen;
      if(pfMode === 'maxsharpe') chosen = bestSharpe;
      else if(pfMode === 'minvol') chosen = bestMinVol;
      else if(pfMode === 'maxret') chosen = bestRet;
      else if(pfMode === 'equalweight') chosen = ewPoint;
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
        totalStocks:stockData.length,afterCorFilter:sel.length,removedByCor:stockData.length-sel.length,
        portReturn:simAnnReturn,portVol:eqVol,portSharpe:simSharpe,
        cash:finalPt.cash,endingEquity:finalPt.value,
        mode:pfMode,capital,altSharpe:bestSharpe,altMinVol:bestMinVol,
        source:pfUniverseSource,manualInputCount:manualEntries.length,
        simsRequested:sims, simsUsed:effectiveSims, scanDirection
      });
      setTab('portfolio');
      return { ok:true };
    }finally{
      setPfBuilding(false);
    }
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore||{}, { buildPortfolioWorkflow });
})();
