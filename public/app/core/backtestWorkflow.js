(function(){
  const { fetchTicker, aggregateCandles, boundWeights } = window.StockScannerCore;

  async function runBacktestWorkflow(opts){
    const {
      entryRules, exitRules, shortEntryRules, shortExitRules, btDirection,
      stopATR, stopATRMult, stopPct, stopPctVal,
      btWeeks, btCapital, pfMaxPos, pfRiskFree, btBenchmark, btCommission, btSlippage,
      pfStopATRPeriod, pfMinWeight, pfMaxWeight, pfMode, btAllocationMode,
      btUniverseSource, btCustomTickers, btUniverseLimit,
      savedUniverseLists,
      mktFilterEnabled, mktFilterTicker, mktFilterTf,
      mktFilterInd, mktFilterPeriod, mktFilterOp, mktFilterVal, mktFilterRules,
      savedStrategiesLength, dataCacheRef, abortSignal,
      setBtRunning, setBtProgress, setTab, setBacktest,
    } = opts;

    const perfStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const progressStage = (phase) => {
      if(/datos|scan/i.test(phase)) return {id:'data',label:'Datos',base:0,weight:52};
      if(/benchmark/i.test(phase)) return {id:'benchmark',label:'Benchmark',base:52,weight:6};
      if(/regimen|r[eé]gimen/i.test(phase)) return {id:'regime',label:'Régimen',base:58,weight:7};
      if(/simulando/i.test(phase)) return {id:'simulation',label:'Simulación',base:65,weight:28};
      if(/finalizando|listo/i.test(phase)) return {id:'results',label:'Resultados',base:93,weight:7};
      if(/cancelado/i.test(phase)) return {id:'cancelled',label:'Cancelado',base:0,weight:0};
      return {id:'setup',label:'Preparando',base:0,weight:4};
    };
    const report=(phase,done=0,total=0,extra={})=>{
      const phasePct=total>0?Math.max(0,Math.min(100,Math.round((done/total)*100))):0;
      const stage=progressStage(phase);
      const pct=Math.max(0,Math.min(100,Math.round(stage.base+(phasePct/100)*stage.weight)));
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if(typeof setBtProgress==='function') setBtProgress({phase,stage:stage.id,stageLabel:stage.label,done,total,phasePct,pct,elapsedMs:Math.round(now-perfStart),...extra});
    };
    let cooperativeYieldCount=0;
    let cooperativeLongSliceCount=0;
    let lastYieldAt=perfStart;
    const nowMs=()=>((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
    const yieldToUi=()=>new Promise(resolve=>{
      cooperativeYieldCount++;
      const done=()=>{
        const now=nowMs();
        if(now-lastYieldAt>80) cooperativeLongSliceCount++;
        lastYieldAt=now;
        resolve();
      };
      if(typeof requestAnimationFrame==='function') requestAnimationFrame(()=>setTimeout(done,0));
      else setTimeout(done,0);
    });
    const shouldYield=(budgetMs=32)=>(nowMs()-lastYieldAt)>=budgetMs;
    const yieldIfNeeded=async(phase,done,total,extra={},budgetMs=32)=>{
      if(!shouldYield(budgetMs)) return;
      report(phase,done,total,extra);
      await yieldToUi();
      throwIfCancelled();
    };
    const makeAbortError=()=>{ const err=new Error('Backtest cancelado'); err.name='AbortError'; return err; };
    const throwIfCancelled=()=>{ if(abortSignal?.aborted) throw makeAbortError(); };

    setBtRunning(true);
    report('Preparando backtest',0,1);
    setTab('backtest');
    try{
      const mainTf='1wk';
      const ruleTfs=[...new Set([
        ...entryRules.flatMap(g=>g.conditions?.map(c=>c.tf)||[]),
        ...exitRules.flatMap(g=>g.conditions?.map(c=>c.tf)||[]),
        ...shortEntryRules.flatMap(g=>g.conditions?.map(c=>c.tf)||[]),
        ...shortExitRules.flatMap(g=>g.conditions?.map(c=>c.tf)||[]),
        ...(mktFilterRules||[]).flatMap(g=>g.conditions?.map(c=>c.tf)||[]),
        mainTf
      ])];
      const allStockData={};
      let loadStats = {requested:0,unique:0,loaded:0,failed:0,insufficient:0};
      const tickerIssues=[];
      const pushTickerIssue=(issue)=>{
        if(tickerIssues.length<500) tickerIssues.push(issue);
      };
      let backtestLocalOnlyCache = false;
      const normalizeTickerList = (list=[]) => [...new Set((list||[])
        .map(t=>String(t||'').trim().toUpperCase())
        .filter(t=>t&&/^[A-Z0-9.^=\-]+$/.test(t))
      )];
      const allRuleConditions=[
        ...entryRules.flatMap(g=>g.conditions||[]),
        ...exitRules.flatMap(g=>g.conditions||[]),
        ...shortEntryRules.flatMap(g=>g.conditions||[]),
        ...shortExitRules.flatMap(g=>g.conditions||[]),
        ...(mktFilterRules||[]).flatMap(g=>g.conditions||[]),
      ];
      const conditionLookback=(c={})=>{
        const nums=[c.params?.p,c.params?.ks,c.params?.dp,c.params?.sl,c.params?.sg,c.cmpParams?.p,c.cmpParams?.ks,c.cmpParams?.dp,c.cmpParams?.sl,c.cmpParams?.sg]
          .map(Number).filter(Number.isFinite);
        let base=nums.length?Math.max(...nums):30;
        if(c.ind==='MACD'||c.cmpInd==='MACD'){
          base=Math.max(base,(Number(c.params?.sl)||26)+(Number(c.params?.sg)||9)+10,(Number(c.cmpParams?.sl)||26)+(Number(c.cmpParams?.sg)||9)+10);
        }
        return Math.max(20,base+8);
      };
      const maxRuleLookback=Math.max(40,...allRuleConditions.map(conditionLookback));
      const maxBarsForTf=(tf)=>{
        if(tf==='4h') return Math.max(600,Math.ceil(btWeeks*18)+160);
        if(tf==='1d') return Math.max(260,Math.ceil(btWeeks*7)+maxRuleLookback+80);
        if(tf==='1mo') return Math.max(120,Math.ceil(btWeeks/3)+maxRuleLookback+80);
        return Math.max(120,btWeeks+maxRuleLookback+80);
      };
      const trimSeriesData=(d,tf)=>{
        if(!d?.ok) return d;
        const maxBars=maxBarsForTf(tf);
        if(!Array.isArray(d.closes)||d.closes.length<=maxBars) return d;
        const trimArr=(arr)=>Array.isArray(arr)?arr.slice(0,maxBars):arr;
        return {
          ...d,
          closes:trimArr(d.closes),
          highs:trimArr(d.highs),
          lows:trimArr(d.lows),
          opens:trimArr(d.opens),
          volumes:trimArr(d.volumes),
          times:trimArr(d.times),
          _trimmedFrom:d.closes.length,
        };
      };
      const perfMarks = {};
      let trimmedSeriesCount=0;
      let trimmedBarsSaved=0;
      const markPerf = (name) => {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        perfMarks[name] = Math.round(now - perfStart);
      };
      const inFlightFetches = new Map();
      const transientDataCache = new Map();
      let transientCacheHits = 0;
      let transientCacheWrites = 0;
      let transientCacheReleased = 0;
      let batchChartRequests = 0;
      let batchChartSymbols = 0;
      const batchFetchConcurrency = ruleTfs.length>2 ? 18 : 34;
      const cacheKeyFor = (ticker,tf) => ticker+'|'+tf;
      const fetchWithTimeout=async(ticker,tf,timeoutMs=16000)=>{
        throwIfCancelled();
        const ac=typeof AbortController!=='undefined'?new AbortController():null;
        const onAbort=()=>ac?.abort();
        if(abortSignal&&ac) abortSignal.addEventListener('abort',onAbort,{once:true});
        const timer=ac?setTimeout(()=>ac.abort(),timeoutMs):null;
        try{ return await fetchTicker(ticker,tf,ac?.signal||null); }
        catch(e){
          if(e?.name==='AbortError'||abortSignal?.aborted) throw makeAbortError();
          return {ticker,tf,ok:false,error:e?.message||'Error'};
        }
        finally{
          if(timer) clearTimeout(timer);
          if(abortSignal&&ac) abortSignal.removeEventListener('abort',onAbort);
        }
      };
      const parseChartPayload=(ticker,tf,payload)=>{
        const tfDef=(window.StockScannerConfig?.TIMEFRAMES||[]).find(t=>t.id===tf)||(window.StockScannerConfig?.TIMEFRAMES||[])[1]||{};
        const result=payload?.chart?.result?.[0];
        if(!result?.timestamp) return {ticker,tf,ok:false,error:payload?.error||'Sin datos'};
        const q=result.indicators?.quote?.[0]||{};
        let opens=(q.open||[]),highs=(q.high||[]),lows=(q.low||[]),closes=(q.close||[]),volumes=(q.volume||[]),times=(result.timestamp||[]);
        const rows=[];
        for(let i=0;i<times.length;i++){
          const o=opens[i],h=highs[i],l=lows[i],c=closes[i];
          if([o,h,l,c].some(x=>x==null)) continue;
          rows.push({time:times[i],open:+o,high:+h,low:+l,close:+c,volume:+(volumes[i]||0)});
        }
        rows.sort((a,b)=>b.time-a.time);
        opens=rows.map(r=>r.open); highs=rows.map(r=>r.high); lows=rows.map(r=>r.low); closes=rows.map(r=>r.close); volumes=rows.map(r=>r.volume); times=rows.map(r=>r.time);
        if(tfDef.aggregateFactor&&tfDef.aggregateFactor>1&&typeof aggregateCandles==='function'){
          const agg=aggregateCandles(opens,highs,lows,closes,volumes,times,tfDef.aggregateFactor);
          opens=agg.opens; highs=agg.highs; lows=agg.lows; closes=agg.closes; volumes=agg.volumes; times=agg.times;
        }
        return {ticker,tf,ok:closes.length>5,error:closes.length>5?null:'Muy pocos datos',opens,highs,lows,closes,volumes,times,price:closes[0],prevClose:closes[1]};
      };
      const fetchAndCache=async(ticker,tf,timeoutMs=16000)=>{
        const transientKey=cacheKeyFor(ticker,tf);
        if(transientDataCache.has(transientKey)){
          transientCacheHits++;
          return transientDataCache.get(transientKey);
        }
        const cached=dataCacheRef.current[ticker]?.[tf];
        if(cached&&cached.ok){
          const trimmed=trimSeriesData(cached,tf);
          if(trimmed?._trimmedFrom){
            trimmedSeriesCount++;
            trimmedBarsSaved+=Math.max(0,trimmed._trimmedFrom-(trimmed.closes?.length||0));
          }
          return trimmed;
        }
        if(cached&&cached.ok===false&&cached._ts&&(Date.now()-cached._ts)<60000) return cached;
        const key=transientKey;
        if(inFlightFetches.has(key)) return inFlightFetches.get(key);
        const req=fetchWithTimeout(ticker,tf,timeoutMs).then(d=>{
          const stored=d?.ok ? trimSeriesData(d,tf) : {...(d||{ticker,tf,ok:false,error:'Error'}),_ts:Date.now()};
          if(stored?._trimmedFrom){
            trimmedSeriesCount++;
            trimmedBarsSaved+=Math.max(0,stored._trimmedFrom-(stored.closes?.length||0));
          }
          if(!backtestLocalOnlyCache || ticker===btBenchmark){
            dataCacheRef.current[ticker]={...(dataCacheRef.current[ticker]||{}),[tf]:d?.ok ? d : stored};
          }
          return stored;
        }).finally(()=>inFlightFetches.delete(key));
        inFlightFetches.set(key,req);
        return req;
      };
      const fetchBatchAndCache=async(tickers,tf,phaseOffset=0,phaseTotal=0)=>{
        const tfDef=(window.StockScannerConfig?.TIMEFRAMES||[]).find(t=>t.id===tf)||(window.StockScannerConfig?.TIMEFRAMES||[])[1]||{};
        const missing=[];
        tickers.forEach(ticker=>{
          const cached=dataCacheRef.current[ticker]?.[tf];
          if(cached?.ok) return;
          if(cached&&cached.ok===false&&cached._ts&&(Date.now()-cached._ts)<60000) return;
          missing.push(ticker);
        });
        if(!missing.length) return;
        if(missing.length<4){
          await Promise.allSettled(missing.map(t=>fetchAndCache(t,tf)));
          return;
        }
        try{
          throwIfCancelled();
          const resp=await fetch('/api/charts',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({symbols:missing,interval:tfDef.yahooInterval,range:tfDef.yahooRange,concurrency:batchFetchConcurrency}),
            signal:abortSignal||undefined,
          });
          if(!resp.ok) throw new Error('HTTP '+resp.status);
          const json=await resp.json();
          const results=json?.results||{};
          batchChartRequests++;
          batchChartSymbols+=missing.length;
          for(let mi=0;mi<missing.length;mi++){
            const ticker=missing[mi];
            const parsed=parseChartPayload(ticker,tf,results[ticker]);
            const stored=parsed?.ok ? trimSeriesData(parsed,tf) : {...parsed,_ts:Date.now()};
            if(stored?._trimmedFrom){
              trimmedSeriesCount++;
              trimmedBarsSaved+=Math.max(0,stored._trimmedFrom-(stored.closes?.length||0));
            }
            if(backtestLocalOnlyCache && ticker!==btBenchmark){
              transientDataCache.set(cacheKeyFor(ticker,tf),stored);
              transientCacheWrites++;
            }else{
              dataCacheRef.current[ticker]={...(dataCacheRef.current[ticker]||{}),[tf]:stored};
            }
            if((mi+1)%50===0){
              await yieldIfNeeded('Cargando datos del universo',Math.min(phaseOffset+mi+1,phaseTotal||phaseOffset+missing.length),phaseTotal||phaseOffset+missing.length,{
                current:ticker,
                batchChartRequests,
                batchChartSymbols,
                transientCacheWrites,
                transientCacheReleased,
              },24);
            }
          }
        }catch(e){
          if(e?.name==='AbortError'||abortSignal?.aborted) throw makeAbortError();
          await Promise.allSettled(missing.map(t=>fetchAndCache(t,tf)));
        }
      };
      const loadTickerData=async(ticker,tfs)=>{
        throwIfCancelled();
        const entries=await Promise.all(tfs.map(async tf=>[tf,await fetchAndCache(ticker,tf)]));
        if(backtestLocalOnlyCache){
          tfs.forEach(tf=>{
            const key=cacheKeyFor(ticker,tf);
            if(transientDataCache.delete(key)) transientCacheReleased++;
          });
        }
        const byTf={};
        entries.forEach(([tf,d])=>{ if(d?.ok) byTf[tf]=d; });
        const mainData=byTf[mainTf];
        if(mainData&&mainData.closes.length>btWeeks+10){
          allStockData[ticker]=byTf;
          return {ticker,ok:true};
        }
        if(mainData) return {ticker,ok:false,reason:'insufficient',detail:'Historial insuficiente ('+(mainData.closes?.length||0)+' barras)'};
        const failedTfs=entries.filter(([,d])=>!d?.ok).map(([tf,d])=>tf+(d?.error?': '+d.error:''));
        return {ticker,ok:false,reason:'failed',detail:failedTfs.slice(0,3).join(' | ')||'Sin datos'};
      };
      const loadUniverseData=async(tickers,tfs,conc=12)=>{
        const uniqueTickers=normalizeTickerList(tickers);
        loadStats = {requested:tickers.length,unique:uniqueTickers.length,loaded:0,failed:0,insufficient:0};
        for(let i=0;i<uniqueTickers.length;i+=conc){
          throwIfCancelled();
          const batch=uniqueTickers.slice(i,i+conc);
          await Promise.allSettled(tfs.map(tf=>fetchBatchAndCache(batch,tf,i,uniqueTickers.length)));
          await yieldIfNeeded('Cargando datos del universo',Math.min(i+batch.length,uniqueTickers.length),uniqueTickers.length,{
            loaded:loadStats.loaded,
            failed:loadStats.failed,
            insufficient:loadStats.insufficient,
            current:batch[batch.length-1]||'',
          },20);
          const settled=await Promise.allSettled(batch.map(t=>loadTickerData(t,tfs)));
          throwIfCancelled();
          settled.forEach(r=>{
            if(r.status!=='fulfilled'){ loadStats.failed++; pushTickerIssue({ticker:'?',reason:'failed',detail:r.reason?.message||'Error'}); return; }
            if(r.value?.ok) loadStats.loaded++;
            else if(r.value?.reason==='insufficient'){
              loadStats.insufficient++;
              pushTickerIssue({ticker:r.value.ticker,reason:'insufficient',detail:r.value.detail||'Historial insuficiente'});
            }
            else{
              loadStats.failed++;
              pushTickerIssue({ticker:r.value?.ticker||'?',reason:'failed',detail:r.value?.detail||'Sin datos'});
            }
          });
          report('Cargando datos del universo',Math.min(i+batch.length,uniqueTickers.length),uniqueTickers.length,{
            loaded:loadStats.loaded,
            failed:loadStats.failed,
            insufficient:loadStats.insufficient,
            current:batch[batch.length-1]||'',
            trimmedSeriesCount,
            trimmedBarsSaved,
          });
          await yieldToUi();
          throwIfCancelled();
        }
        return loadStats;
      };

      if(btUniverseSource && btUniverseSource !== 'scan'){
        // Fetch own universe fresh — independent of scan results
        const { UNIVERSE_PRESETS, SP500, NASDAQ100, DOW30 } = window.StockScannerConfig;
        const presetMap = Object.fromEntries(Object.entries(UNIVERSE_PRESETS || {}).map(([k,v])=>[k,v.tickers]));
        (savedUniverseLists||[]).forEach(list=>{
          if(list?.id) presetMap['LIST_'+list.id]=list.tickers||[];
        });
        if(!Object.keys(presetMap).length) Object.assign(presetMap, { SP500, NASDAQ100, DOW30 });
        let rawTickers = btUniverseSource === 'custom'
          ? (btCustomTickers||'').split(/[\s,;]+/).map(t=>t.trim().toUpperCase()).filter(t=>t&&/^[A-Z0-9.^=\-]+$/.test(t))
          : (presetMap[btUniverseSource]||[]);
        if(btUniverseSource === 'GLOBAL_FULL_UNIVERSE'){
          try{
            const resp=await fetch('/api/tickers');
            const json=await resp.json();
            const allUs=Array.isArray(json?.tickers) ? json.tickers.map(t=>String(t).toUpperCase()).filter(Boolean) : [];
            rawTickers=[...new Set([...(rawTickers||[]), ...allUs])];
          }catch(e){}
        }
        rawTickers=normalizeTickerList(rawTickers);
        const sourceTotal=rawTickers.length;
        const limit=Math.max(0,Math.round(Number(btUniverseLimit)||0));
        if(limit>0&&rawTickers.length>limit) rawTickers=rawTickers.slice(0,limit);
        if(rawTickers.length < 3){
          const message='Agrega al menos 3 tickers para el universo del backtest.';
          setBacktest({status:'config_error',message,equityCurve:[],weeklyLog:[],allTrades:[],diagnostics:{loadStats:{requested:rawTickers.length,unique:rawTickers.length,loaded:0,failed:0,insufficient:0},tickerIssues:[],validTickers:0},perf:{totalMs:Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now())-perfStart),tickers:0}});
          return { ok:false, message };
        }
        backtestLocalOnlyCache = rawTickers.length > 900;
        report('Cargando datos del universo',0,rawTickers.length,{loaded:0,failed:0,insufficient:0,current:backtestLocalOnlyCache?'modo memoria ligera':'',sourceTotal,limit,trimmedSeriesCount,trimmedBarsSaved});
        await loadUniverseData(rawTickers,ruleTfs,rawTickers.length>3000?300:rawTickers.length>900?240:120);
      } else {
        // Use data already in cache from last scan
        let cacheTickers=normalizeTickerList(Object.keys(dataCacheRef.current).filter(t=>!t.startsWith('__')));
        const sourceTotal=cacheTickers.length;
        const limit=Math.max(0,Math.round(Number(btUniverseLimit)||0));
        if(limit>0&&cacheTickers.length>limit) cacheTickers=cacheTickers.slice(0,limit);
        report('Leyendo datos del ultimo scan',0,cacheTickers.length,{loaded:0,failed:0,insufficient:0,trimmedSeriesCount,trimmedBarsSaved});
        backtestLocalOnlyCache = cacheTickers.length > 900;
        await loadUniverseData(cacheTickers,ruleTfs,cacheTickers.length>3000?300:cacheTickers.length>900?240:160);
      }
      markPerf('dataMs');
      const allTickers=Object.keys(allStockData);
      if(allTickers.length<3){
        const diagnostics={loadStats,tickerIssues:tickerIssues.slice(0,500),validTickers:allTickers.length};
        const perf={...perfMarks,totalMs:Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now())-perfStart),tickers:allTickers.length,loadStats,tickerIssues:tickerIssues.slice(0,500),lightMemory:backtestLocalOnlyCache,trimmedSeriesCount,trimmedBarsSaved,maxRuleLookback,batchChartRequests,batchChartSymbols,batchFetchConcurrency,transientCacheHits,transientCacheWrites,transientCacheReleased,transientCacheRemaining:transientDataCache.size,cooperativeYieldCount,cooperativeLongSliceCount};
        setBacktest({
          status:'data_error',
          equityCurve:[],
          weeklyLog:[],
          allTrades:[],
          startVal:btCapital,
          endVal:btCapital,
          totalReturn:0,
          annReturn:0,
          annVol:0,
          sharpe:0,
          maxDrawdown:0,
          trades:{buys:0,sells:0,stopATRHits:0,stopPctHits:0},
          weeks:btWeeks,
          capital:btCapital,
          winRate:0,
          avgWin:0,
          avgLoss:0,
          profitFactor:0,
          sortino:0,
          calmar:0,
          avgDuration:0,
          benchCurve:null,
          benchReturn:null,
          benchSymbol:btBenchmark,
          totalCommissionPaid:0,
          commission:btCommission||0,
          slippage:btSlippage||0,
          atrPeriod:Math.max(1, Math.round(Number(pfStopATRPeriod)||14)),
          allocationMode:btAllocationMode||'equal',
          timestamp:Date.now(),
          label:'Backtest sin datos suficientes',
          diagnostics,
          perf,
          mktFilter:null,
        });
        return { ok:false, message:'Necesitas al menos 3 acciones con datos validos. Cargadas: '+loadStats.loaded+', sin datos: '+loadStats.failed+', insuficientes: '+loadStats.insufficient+'.', diagnostics, perf };
      }

      let benchData=null;
      try{
        report('Cargando benchmark',0,1);
        const bData=await fetchAndCache(btBenchmark,mainTf,16000);
        if(bData?.ok){
          benchData={closes:bData.closes,times:bData.times};
        }
      }catch(e){}
      markPerf('benchmarkMs');

      const startWeek=btWeeks;
      const atrPeriod=Math.max(1, Math.round(Number(pfStopATRPeriod)||14));
      const minWeight=Math.max(0, (Number(pfMinWeight)||1)/100);
      const maxWeight=Math.max(minWeight || 0.01, Math.min(1, (Number(pfMaxWeight)||25)/100));
      const equityCurve=[]; const weeklyLog=[];
      let holdings={};
      let cashBalance=btCapital;
      const tradeCount={buys:0,sells:0,stopATRHits:0,stopPctHits:0};
      const allTrades=[];
      const signalStats={longEntries:0,shortEntries:0,exitSignals:0,weeksBlocked:0,weeksSimulated:0};
      let intrabarFetches=0;
      const commRate=(btCommission||0)/100;  // e.g. 0.1% → 0.001
      const slipRate=Math.max(0, Number(btSlippage)||0)/100;
      let totalCommissionPaid=0;
      const finiteNum = v => Number.isFinite(Number(v)) ? Number(v) : null;
      const validPrice = v => {
        const n=finiteNum(v);
        return n!=null&&n>0 ? n : null;
      };
      const barPrice = (d,idx,prefer='open') => {
        if(!d) return null;
        const first = prefer==='close' ? d.closes?.[idx] : d.opens?.[idx];
        const second = prefer==='close' ? d.opens?.[idx] : d.closes?.[idx];
        return validPrice(first) ?? validPrice(second) ?? validPrice(d.closes?.[idx+1]) ?? null;
      };
      const validTickers=allTickers.filter(t=>allStockData[t]?.[mainTf]?.closes.length>startWeek+10);
      const ts0=allStockData[allTickers[0]]?.[mainTf]?.times;
      const allowLongs=btDirection!=='short';
      const allowShorts=btDirection!=='long';
      const simulationChunkSize=validTickers.length>5000?200:validTickers.length>2500?300:validTickers.length>1000?500:validTickers.length||1;
      let simulationChunks=0;
      let simulationYieldCount=0;
      let fastRuleEvalCount=0;
      let fastRuleFallbackCount=0;
      const indicatorSeriesCache = new WeakMap();
      const getSeriesCache = (d) => {
        let m=indicatorSeriesCache.get(d);
        if(!m){ m=new Map(); indicatorSeriesCache.set(d,m); }
        return m;
      };
      const paramsKey = (p={}) => [p.p||'',p.ks||'',p.dp||'',p.sl||'',p.sg||''].join(':');
      const buildSeries = (d, ind, params={}) => {
        const L=d?.closes?.length||0;
        const out=Array(L).fill(null);
        if(!d?.ok || L<2) return out;
        const p=Math.max(1,Number(params.p)||20);
        if(ind==='PRICE') return d.closes.slice();
        if(ind==='VOL') return (d.volumes||[]).slice();
        if(ind==='CHG'){
          for(let i=0;i<L-1;i++) if(d.closes[i+1]) out[i]=((d.closes[i]-d.closes[i+1])/d.closes[i+1])*100;
          return out;
        }
        if(ind==='GAP'){
          for(let i=0;i<L-1;i++) if(d.closes[i+1]&&d.opens?.[i]!=null) out[i]=((d.opens[i]-d.closes[i+1])/d.closes[i+1])*100;
          return out;
        }
        if(ind==='SMA'){
          let sum=0;
          for(let i=L-1;i>=0;i--){
            sum+=Number(d.closes[i])||0;
            if(i+p<L) sum-=Number(d.closes[i+p])||0;
            if(i+p<=L) out[i]=sum/p;
          }
          return out;
        }
        if(ind==='WMA'){
          const denom=p*(p+1)/2;
          for(let i=0;i+p<=L;i++){
            let s=0;
            for(let j=0;j<p;j++) s+=(Number(d.closes[i+j])||0)*(p-j);
            out[i]=s/denom;
          }
          return out;
        }
        if(ind==='EMA'){
          if(L<p) return out;
          const k=2/(p+1);
          let ema=0;
          for(let i=L-1;i>=L-p;i--) ema+=Number(d.closes[i])||0;
          ema/=p;
          out[L-p]=ema;
          for(let i=L-p-1;i>=0;i--){
            ema=(Number(d.closes[i])||0)*k+ema*(1-k);
            out[i]=ema;
          }
          return out;
        }
        if(ind==='RSI'){
          if(L<p+1) return out;
          let gains=0,losses=0;
          for(let i=L-1;i>=L-p;i--){
            const diff=(Number(d.closes[i-1])||0)-(Number(d.closes[i])||0);
            if(diff>0) gains+=diff; else losses-=diff;
          }
          let avgG=gains/p, avgL=losses/p;
          out[L-p-1]=avgL===0&&avgG===0?50:avgL===0?100:100-100/(1+avgG/avgL);
          for(let i=L-p-2;i>=0;i--){
            const diff=(Number(d.closes[i])||0)-(Number(d.closes[i+1])||0);
            avgG=(avgG*(p-1)+(diff>0?diff:0))/p;
            avgL=(avgL*(p-1)+(diff<0?-diff:0))/p;
            out[i]=avgL===0&&avgG===0?50:avgL===0?100:100-100/(1+avgG/avgL);
          }
          return out;
        }
        if(ind==='STOCH'){
          const kS=Math.max(1,Number(params.ks)||1);
          const raw=Array(L).fill(null);
          for(let i=0;i+p<=L;i++){
            let hh=-Infinity,ll=Infinity;
            for(let j=0;j<p;j++){ hh=Math.max(hh,Number(d.highs?.[i+j])||-Infinity); ll=Math.min(ll,Number(d.lows?.[i+j])||Infinity); }
            raw[i]=hh===ll?50:(((Number(d.closes[i])||0)-ll)/(hh-ll))*100;
          }
          for(let i=0;i+kS<=L;i++){
            let sum=0,ok=true;
            for(let j=0;j<kS;j++){ if(raw[i+j]==null){ ok=false; break; } sum+=raw[i+j]; }
            if(ok) out[i]=sum/kS;
          }
          return out;
        }
        if(ind==='MACD'){
          const fast=Math.max(1,Number(params.p)||12), slow=Math.max(fast+1,Number(params.sl)||26), sig=Math.max(1,Number(params.sg)||9);
          const emaOldest=(arr,n)=>{
            if(arr.length<n) return [];
            const k=2/(n+1), res=[];
            let ema=0;
            for(let i=0;i<n;i++) ema+=arr[i]||0;
            ema/=n; res.push(ema);
            for(let i=n;i<arr.length;i++){ ema=(arr[i]||0)*k+ema*(1-k); res.push(ema); }
            return res;
          };
          const oldest=[...d.closes].reverse();
          const ef=emaOldest(oldest,fast), es=emaOldest(oldest,slow);
          if(!ef.length||!es.length) return out;
          const off=slow-fast, line=[];
          for(let i=0;i<es.length;i++) line.push(ef[i+off]-es[i]);
          const signal=emaOldest(line,sig);
          if(!signal.length) return out;
          const startLine=line.length-signal.length;
          for(let i=0;i<signal.length;i++){
            const oldestIdx=slow+sig-2+i;
            const newestIdx=L-1-oldestIdx;
            if(newestIdx>=0&&newestIdx<L) out[newestIdx]=line[i+startLine]-signal[i];
          }
          return out;
        }
        if(ind==='ATR'){
          const tr=Array(Math.max(0,L-1)).fill(null);
          for(let i=0;i<L-1;i++) tr[i]=Math.max(d.highs[i]-d.lows[i],Math.abs(d.highs[i]-d.closes[i+1]),Math.abs(d.lows[i]-d.closes[i+1]));
          for(let i=0;i+p<=tr.length;i++){
            let atr=0;
            for(let j=0;j<p;j++) atr+=tr[i+j];
            atr/=p;
            for(let j=i+p;j<tr.length;j++) atr=(atr*(p-1)+tr[j])/p;
            out[i]=atr;
          }
          return out;
        }
        return null;
      };
      const getSeries = (d, ind, params={}) => {
        const key=ind+'|'+paramsKey(params);
        const cache=getSeriesCache(d);
        if(cache.has(key)) return cache.get(key);
        const series=buildSeries(d,ind,params);
        if(series) cache.set(key,series);
        return series;
      };
      const avgRangeAt=(d,idx,n)=>{
        let sum=0,count=0;
        for(let i=idx;i<Math.min(idx+n,d.closes.length);i++){
          const c=d.closes[i]; if(!c) continue;
          sum+=((d.highs[i]-d.lows[i])/c)*100; count++;
        }
        return count?sum/count:null;
      };
      const avgAt=(arr,idx,n)=>{
        let sum=0,count=0;
        for(let i=idx;i<Math.min(idx+n,arr?.length||0);i++){ if(arr[i]!=null){ sum+=Number(arr[i])||0; count++; } }
        return count?sum/count:null;
      };
      const highestAt=(arr,idx,n)=>{
        let v=-Infinity,count=0;
        for(let i=idx;i<Math.min(idx+n,arr?.length||0);i++){ if(arr[i]!=null){ v=Math.max(v,arr[i]); count++; } }
        return count?v:null;
      };
      const lowestAt=(arr,idx,n)=>{
        let v=Infinity,count=0;
        for(let i=idx;i<Math.min(idx+n,arr?.length||0);i++){ if(arr[i]!=null){ v=Math.min(v,arr[i]); count++; } }
        return count?v:null;
      };
      const countDirAt=(opens,closes,idx,n,dir)=>{
        let count=0;
        for(let i=idx;i<Math.min(idx+n,opens?.length||0,closes?.length||0);i++){
          if(dir==='up' ? closes[i]>opens[i] : closes[i]<opens[i]) count++;
        }
        return count;
      };
      const consecDirAt=(opens,closes,idx,dir)=>{
        let count=0;
        for(let i=idx;i<Math.min(opens?.length||0,closes?.length||0);i++){
          const ok=dir==='up' ? closes[i]>opens[i] : closes[i]<opens[i];
          if(!ok) break; count++;
        }
        return count;
      };
      const currentVwapAt=(d,idx)=>{
        let pv=0,vol=0;
        for(let i=(d.closes?.length||0)-1;i>=idx;i--){
          const v=d.volumes?.[i]||0;
          if(!v) continue;
          pv+=(((d.highs?.[i]||0)+(d.lows?.[i]||0)+(d.closes?.[i]||0))/3)*v;
          vol+=v;
        }
        return vol>0?pv/vol:null;
      };
      const metaValueFast=(id, meta={})=>{
        const pctVal=v=>{ const n=Number(v); return Number.isFinite(n)?(Math.abs(n)<=1?n*100:n):null; };
        const numVal=v=>{ const n=Number(v); return Number.isFinite(n)?n:null; };
        const txtVal=v=>v==null?null:String(v).trim()||null;
        switch(id){
          case 'SECTOR': return txtVal(meta.sector);
          case 'INDUSTRY': return txtVal(meta.industry);
          case 'COUNTRY': return txtVal(meta.country);
          case 'EXCHANGE': return txtVal(meta.exchange);
          case 'MARKET_CAP': return numVal(meta.marketCap);
          case 'FLOAT': return numVal(meta.floatShares);
          case 'SHARES_OUT': return numVal(meta.sharesOutstanding);
          case 'SHORT_INT_PCT': return pctVal(meta.shortInterestPct);
          case 'INST_OWN_PCT': return pctVal(meta.institutionalOwnershipPct);
          case 'INSIDER_OWN_PCT': return pctVal(meta.insiderOwnershipPct);
          case 'BETA': return numVal(meta.beta);
          case 'PE': return numVal(meta.peRatio);
          case 'FWD_PE': return numVal(meta.forwardPE);
          case 'PS': return numVal(meta.priceToSales);
          case 'PB': return numVal(meta.priceToBook);
          case 'EV_EBITDA': return numVal(meta.evToEbitda);
          case 'DEBT_EQUITY': return numVal(meta.debtToEquity);
          case 'CURRENT_RATIO': return numVal(meta.currentRatio);
          case 'ROE': return pctVal(meta.roe);
          case 'ROA': return pctVal(meta.roa);
          case 'GROSS_MARGIN': return pctVal(meta.grossMargin);
          case 'OPER_MARGIN': return pctVal(meta.operatingMargin);
          case 'REV_GROWTH': return pctVal(meta.revenueGrowth);
          case 'EPS_GROWTH': return pctVal(meta.epsGrowth);
          case 'FCF_YIELD': return pctVal(meta.freeCashFlowYield);
          default: return null;
        }
      };
      const evalIndAt=(id,params,d,idx,meta={})=>{
        if(idx==null||idx<0) return [null,null];
        const p=Math.max(1,Number(params?.p)||20);
        if(['SECTOR','INDUSTRY','COUNTRY','EXCHANGE','MARKET_CAP','FLOAT','SHARES_OUT','SHORT_INT_PCT','INST_OWN_PCT','INSIDER_OWN_PCT','BETA','PE','FWD_PE','PS','PB','EV_EBITDA','DEBT_EQUITY','CURRENT_RATIO','ROE','ROA','GROSS_MARGIN','OPER_MARGIN','REV_GROWTH','EPS_GROWTH','FCF_YIELD'].includes(id)){
          const v=metaValueFast(id,meta); return [v,v];
        }
        const series=getSeries(d,id,params);
        if(series) return [series[idx] ?? null, series[idx+1] ?? null];
        fastRuleFallbackCount++;
        if(id==='DIST_HIGH'){
          const hh0=highestAt(d.highs,idx,p), hh1=highestAt(d.highs,idx+1,p);
          return [hh0&&d.closes[idx]!=null?((d.closes[idx]/hh0)-1)*100:null, hh1&&d.closes[idx+1]!=null?((d.closes[idx+1]/hh1)-1)*100:null];
        }
        if(id==='DIST_LOW'){
          const ll0=lowestAt(d.lows,idx,p), ll1=lowestAt(d.lows,idx+1,p);
          return [ll0&&d.closes[idx]!=null?((d.closes[idx]/ll0)-1)*100:null, ll1&&d.closes[idx+1]!=null?((d.closes[idx+1]/ll1)-1)*100:null];
        }
        if(id==='ADR_PCT') return [avgRangeAt(d,idx,p), avgRangeAt(d,idx+1,p)];
        if(id==='AVG_VOL') return [avgAt(d.volumes,idx,p), avgAt(d.volumes,idx+1,p)];
        if(id==='RVOL'){
          const avg0=avgAt(d.volumes,idx+1,p), avg1=avgAt(d.volumes,idx+2,p);
          return [avg0?(d.volumes?.[idx]||0)/avg0:null, avg1?(d.volumes?.[idx+1]||0)/avg1:null];
        }
        if(id==='DOLLAR_VOL') return [d.closes?.[idx]!=null&&d.volumes?.[idx]!=null?d.closes[idx]*d.volumes[idx]:null, d.closes?.[idx+1]!=null&&d.volumes?.[idx+1]!=null?d.closes[idx+1]*d.volumes[idx+1]:null];
        if(id==='GREEN_COUNT') return [countDirAt(d.opens,d.closes,idx,p,'up'), countDirAt(d.opens,d.closes,idx+1,p,'up')];
        if(id==='RED_COUNT') return [countDirAt(d.opens,d.closes,idx,p,'dn'), countDirAt(d.opens,d.closes,idx+1,p,'dn')];
        if(id==='CONSEC_UP') return [consecDirAt(d.opens,d.closes,idx,'up'), consecDirAt(d.opens,d.closes,idx+1,'up')];
        if(id==='CONSEC_DN') return [consecDirAt(d.opens,d.closes,idx,'dn'), consecDirAt(d.opens,d.closes,idx+1,'dn')];
        if(id==='EXT_EMA_PCT'){
          const ema=getSeries(d,'EMA',params);
          return [ema?.[idx]&&d.closes?.[idx]!=null?((d.closes[idx]/ema[idx])-1)*100:null, ema?.[idx+1]&&d.closes?.[idx+1]!=null?((d.closes[idx+1]/ema[idx+1])-1)*100:null];
        }
        if(id==='EXT_VWAP_PCT'){
          const v0=currentVwapAt(d,idx), v1=currentVwapAt(d,idx+1);
          return [v0&&d.closes?.[idx]!=null?((d.closes[idx]/v0)-1)*100:null, v1&&d.closes?.[idx+1]!=null?((d.closes[idx+1]/v1)-1)*100:null];
        }
        return [null,null];
      };
      const compareFast=(cur,cmp,op)=>{
        if(op==='>') return cur>cmp;
        if(op==='<') return cur<cmp;
        if(op==='>=') return cur>=cmp;
        if(op==='<=') return cur<=cmp;
        return false;
      };
      const testFilterAt=(f,dataByTf,idxByTf)=>{
        const d=dataByTf?.[f.tf];
        const idx=idxByTf?.[f.tf];
        const meta=dataByTf?._meta||{};
        if(!d?.ok && !meta) return {pass:false,val:null,cmp:null};
        const [cur,prev]=evalIndAt(f.ind,f.params,d||{ok:false},idx,meta);
        if(cur==null) return {pass:false,val:null,cmp:null};
        if(['SECTOR','INDUSTRY','COUNTRY','EXCHANGE'].includes(f.ind)){
          const left=String(cur||'').trim().toLowerCase();
          const right=String(f.cmpVal??'').trim().toLowerCase();
          return {pass:f.op==='<'?left!==right:left===right,val:cur,cmp:f.cmpVal??''};
        }
        let cmp=null, cmpPrev=null;
        if(f.cmpType==='val'){ cmp=f.cmpVal; cmpPrev=f.cmpVal; }
        else if(f.cmpType==='prev'){ cmp=prev; cmpPrev=null; }
        else{
          const [iv,ip]=evalIndAt(f.cmpInd,f.cmpParams,d||{ok:false},idx,meta);
          cmp=iv; cmpPrev=ip;
        }
        if(cmp==null) return {pass:false,val:cur,cmp:null};
        let pass=false;
        if(['>','<','>=','<='].includes(f.op)) pass=compareFast(cur,cmp,f.op);
        else if(f.op==='x_up') pass=cur>cmp&&prev!=null&&cmpPrev!=null&&prev<=cmpPrev;
        else if(f.op==='x_dn') pass=cur<cmp&&prev!=null&&cmpPrev!=null&&prev>=cmpPrev;
        return {pass,val:cur,cmp};
      };
      const evalRuleGroupsDetailedFast=(groups,dataByTf,idxByTf)=>{
        fastRuleEvalCount++;
        for(let gi=0;gi<(groups||[]).length;gi++){
          const grp=groups[gi]; let gp=true; const vals=[];
          for(const c of (grp.conditions||[])){
            const r=testFilterAt(c,dataByTf,idxByTf);
            const lbl=c.ind+(c.params?.p?'('+c.params.p+')':'')+' ['+(c.tf||'?')+'] '+c.op+' '+(c.cmpType==='val'?c.cmpVal:c.cmpType==='prev'?'prev':c.cmpInd);
            vals.push({lbl,pass:r.pass,val:r.val,cmp:r.cmp});
            if(!r.pass){ gp=false; break; }
          }
          if(gp) return {matched:true,groupIdx:gi+1,conditions:vals};
        }
        return {matched:false,groupIdx:0,conditions:[]};
      };
      // Instante en que una barra queda cerrada (times = inicio de barra, en segundos).
      // Mensual: inicio del mes siguiente (calendario); resto: inicio + duración nominal.
      const TF_SECONDS={'4h':4*3600,'1d':86400,'1wk':7*86400};
      const barCloseTime=(tf,start)=>{
        if(start==null) return null;
        if(tf==='1mo'){
          const d=new Date((start+43200)*1000); // +12 h: medianoche local europea/asiática cae en su mes
          return Math.floor(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)/1000);
        }
        return start+(TF_SECONDS[tf]||86400);
      };
      // Índice (más reciente primero) de la última barra de `tf` ya cerrada en `decisionTime`.
      // Evita usar el cierre de una vela que todavía está formándose (sesgo de futuro).
      const findClosedIndexAt=(d,tf,decisionTime)=>{
        const times=d?.times;
        if(!times?.length||decisionTime==null) return -1;
        let lo=0, hi=times.length-1, ans=-1;
        while(lo<=hi){
          const mid=(lo+hi)>>1;
          if(barCloseTime(tf,times[mid])<=decisionTime){ ans=mid; hi=mid-1; }
          else lo=mid+1;
        }
        return ans;
      };
      // La señal semanal se decide al cierre de la semana `signalIndex`.
      const signalDecisionTime=(times,signalIndex)=>barCloseTime(mainTf,times?.[signalIndex]);

      let weekAlignedCache = null;
      let maxWeekAlignedCacheSize = 0;
      const getAlignedIndexMap = (ticker, signalIndex) => {
        const key = ticker + '|' + signalIndex;
        if(weekAlignedCache?.has(key)) return weekAlignedCache.get(key);
        const dataByTf = allStockData[ticker];
        const decisionTime = signalDecisionTime(dataByTf?.[mainTf]?.times, signalIndex);
        const aligned = {};
        Object.entries(dataByTf||{}).forEach(([tf,d])=>{
          if(tf==='_meta') return;
          aligned[tf] = tf===mainTf ? signalIndex : findClosedIndexAt(d, tf, decisionTime);
        });
        if(weekAlignedCache){
          weekAlignedCache.set(key, aligned);
          if(weekAlignedCache.size>maxWeekAlignedCacheSize) maxWeekAlignedCacheSize=weekAlignedCache.size;
        }
        return aligned;
      };
      const processTickerChunks=async(label,signalIndex,handler)=>{
        for(let offset=0;offset<validTickers.length;offset+=simulationChunkSize){
          throwIfCancelled();
          const end=Math.min(offset+simulationChunkSize,validTickers.length);
          for(let ti=offset;ti<end;ti++){
            handler(validTickers[ti]);
            if((ti-offset+1)%50===0){
              await yieldIfNeeded('Simulando semanas',startWeek-signalIndex+Math.min(0.95,(ti+1)/validTickers.length),startWeek-2,{
                current:`${label}: ${Math.min(ti+1,validTickers.length)}/${validTickers.length}`,
                simulationChunks,
                simulationYieldCount,
              },24);
            }
          }
          simulationChunks++;
          if(validTickers.length>1000 && end<validTickers.length){
            simulationYieldCount++;
            const weekDone=startWeek-signalIndex+Math.min(0.95,end/validTickers.length);
            report('Simulando semanas',weekDone,startWeek-2,{current:`${label}: ${end}/${validTickers.length}`,simulationChunks,simulationYieldCount});
            await yieldToUi();
          }
        }
      };

      // ── Market regime filter pre-computation ─────────────────────────────
      // Builds a timestamp→indicatorValue map so the check aligns by calendar
      // date even if the market data has a different bar count than stocks.
      let mktFilterMap = null; // ts (number) → {price, indVal}
      if(false && mktFilterEnabled && mktFilterTicker){
        try{
          const { seriesWMA, seriesSMA, seriesEMA, seriesRSI } = window.StockScannerCore;
          const mktTf = mktFilterTf || '1wk';
          const period = Math.max(2, mktFilterPeriod || 30);
          let mktD = dataCacheRef.current[mktFilterTicker]?.[mktTf];
          if(!mktD?.ok){
            mktD = await fetchTicker(mktFilterTicker, mktTf, null);
            if(mktD?.ok) dataCacheRef.current[mktFilterTicker] = { ...(dataCacheRef.current[mktFilterTicker]||{}), [mktTf]: mktD };
          }
          if(mktD?.ok && mktD.closes.length > period + btWeeks + 10){
            const closes = mktD.closes; // newest-first
            const times  = mktD.times;  // newest-first
            // Build indicator series (oldest-first convention from series functions)
            const seriesFnMap = { WMA:seriesWMA, SMA:seriesSMA, EMA:seriesEMA, RSI:seriesRSI };
            const seriesFn = seriesFnMap[mktFilterInd] || seriesWMA;
            const indSeries = seriesFn(closes, period);
            // indSeries[i] = indicator at the bar indexed closes.length-period-i (MA)
            // or closes.length-period-i-1 (RSI, which needs one extra bar to seed)
            const isRsi = mktFilterInd === 'RSI';
            mktFilterMap = {};
            for(let j=0; j<closes.length; j++){
              const k = isRsi ? (closes.length - period - j - 1) : (closes.length - period - j);
              if(k >= 0 && k < indSeries.length && times[j]){
                mktFilterMap[times[j]] = { price: closes[j], indVal: indSeries[k] };
              }
            }
          }
        }catch(e){ console.warn('[Onix] Market filter fetch failed:', e); }
      }

      // Returns true if entries are ALLOWED this week (filter passes or is disabled).
      // Uses binary search on sorted timestamps for fast per-week lookup.
      const mktSortedTs = mktFilterMap ? Object.keys(mktFilterMap).map(Number).sort((a,b)=>a-b) : null;
      const checkMktFilter = (signalIndex) => {
        if(!mktFilterMap || !mktSortedTs) return true;
        const ts = ts0?.[signalIndex];
        if(!ts) return true;
        // Find latest market bar on or before this week's timestamp
        let lo=0, hi=mktSortedTs.length-1, entry=null;
        while(lo<=hi){ const mid=(lo+hi)>>1; if(mktSortedTs[mid]<=ts){entry=mktFilterMap[mktSortedTs[mid]];lo=mid+1;}else hi=mid-1; }
        if(!entry) return true;
        const { price, indVal } = entry;
        if(mktFilterOp==='price_above_ind') return price > indVal;
        if(mktFilterOp==='price_below_ind') return price < indVal;
        if(mktFilterOp==='ind_above_val')   return indVal > (mktFilterVal||50);
        if(mktFilterOp==='ind_below_val')   return indVal < (mktFilterVal||50);
        return true;
      };

      let mktDataByTf = null;
      if(mktFilterEnabled){
        try{
          report('Cargando regimen de mercado',0,1);
          const regimeRules=(mktFilterRules&&mktFilterRules.length)?mktFilterRules:[];
          const regimeTfs=[...new Set(regimeRules.flatMap(g=>g.conditions?.map(c=>c.tf)||[]))];
          mktDataByTf={};
          const entries=await Promise.all(regimeTfs.map(async tf=>[tf,await fetchAndCache(btBenchmark,tf,16000)]));
          entries.forEach(([tf,d])=>{ if(d?.ok) mktDataByTf[tf]=d; });
        }catch(e){ console.warn('[Onix] Market regime fetch failed:', e); mktDataByTf=null; }
      }
      markPerf('regimeMs');

      const checkMktRegimeRules = (signalIndex) => {
        if(!mktFilterEnabled) return true;
        const regimeRules=(mktFilterRules&&mktFilterRules.length)?mktFilterRules:[];
        if(!regimeRules.length || !mktDataByTf || !Object.keys(mktDataByTf).length) return true;
        const decisionTime=signalDecisionTime(ts0,signalIndex);
        if(!decisionTime) return true;
        const idxByTf={};
        Object.entries(mktDataByTf||{}).forEach(([tf,d])=>{ if(tf!=='_meta') idxByTf[tf]=findClosedIndexAt(d,tf,decisionTime); });
        const res=evalRuleGroupsDetailedFast(regimeRules,mktDataByTf,idxByTf);
        return !!res.matched;
      };

      // Estadísticas de las 12 semanas cerradas hasta la barra de señal (sin datos futuros).
      // score: Sharpe semanal en la dirección de la operación (para shorts se invierten retornos).
      // vol: desviación típica semanal (usada por Min Varianza como peso inverso a la volatilidad).
      // momentum: retorno medio semanal en la dirección de la operación (usado por Max Return).
      const signalStats12=(ticker,dir,sigIdx)=>{
        const empty={score:0,vol:null,momentum:0};
        const closes=allStockData[ticker]?.[mainTf]?.closes;
        if(!closes) return empty;
        const end=Math.min(sigIdx+13,closes.length-1);
        if(end-sigIdx<4) return empty;
        const rets=[];
        for(let i=sigIdx;i<end;i++) if(closes[i+1]>0) rets.push((closes[i]-closes[i+1])/closes[i+1]);
        if(rets.length<4) return empty;
        const sign=dir==='short'?-1:1;
        const mean=rets.reduce((a,b)=>a+b,0)/rets.length;
        const vol=Math.sqrt(rets.reduce((a,r)=>a+(r-mean)**2,0)/(rets.length-1));
        const sharpe=vol>0?mean/vol:(mean>0?1:-1);
        return {score:sign*sharpe,vol,momentum:sign*mean};
      };

      const calcAtrStop=(d,h,signalIndex)=>{
        if(!stopATR||!d?.highs||!d?.lows||signalIndex+atrPeriod>=d.closes.length) return null;
        let atrSum=0;
        for(let i=signalIndex;i<signalIndex+atrPeriod;i++){
          atrSum+=Math.max(d.highs[i]-d.lows[i],Math.abs(d.highs[i]-d.closes[i+1]),Math.abs(d.lows[i]-d.closes[i+1]));
        }
        const atrVal=atrSum/atrPeriod;
        return h.dir==='short' ? h.entryPrice+stopATRMult*atrVal : h.entryPrice-stopATRMult*atrVal;
      };

      const applySlippage=(price,dir,action)=>{
        price=validPrice(price);
        if(price==null) return null;
        if(!slipRate) return price;
        const isShort=dir==='short';
        const adverseUp = (action==='entry' && !isShort) || (action==='exit' && isShort);
        return price * (adverseUp ? (1+slipRate) : (1-slipRate));
      };

      const findIntrabarStop=(dataByTf,h,signalIndex,executionIndex,stopPrice)=>{
        const intraday=dataByTf?.['4h'];
        const weekly=dataByTf?.[mainTf];
        if(!intraday?.ok || !weekly?.times || stopPrice==null) return null;
        const startTs=weekly.times?.[signalIndex];
        const endTs=weekly.times?.[executionIndex];
        if(!startTs||!endTs||endTs<=startTs) return null;
        const bars=[];
        for(let i=0;i<intraday.times.length;i++){
          const ts=intraday.times[i];
          if(ts>startTs && ts<=endTs && intraday.opens?.[i]!=null && intraday.highs?.[i]!=null && intraday.lows?.[i]!=null){
            bars.push({idx:i,time:ts,open:intraday.opens[i],high:intraday.highs[i],low:intraday.lows[i]});
          }
        }
        bars.sort((a,b)=>a.time-b.time);
        const isShort=h.dir==='short';
        for(const b of bars){
          if(isShort){
            if(b.open>=stopPrice) return {time:b.time,price:b.open,kind:'gap'};
            if(b.high>=stopPrice) return {time:b.time,price:stopPrice,kind:'touch'};
          }else{
            if(b.open<=stopPrice) return {time:b.time,price:b.open,kind:'gap'};
            if(b.low<=stopPrice) return {time:b.time,price:stopPrice,kind:'touch'};
          }
        }
        return null;
      };

      const ensureIntrabarStopData=async(ticker,dataByTf)=>{
        throwIfCancelled();
        if(!stopATR&&!stopPct) return;
        if(dataByTf?.['4h']?.ok) return;
        intrabarFetches++;
        const d=await fetchAndCache(ticker,'4h',10000);
        if(d?.ok) dataByTf['4h']=d;
      };
      const ensureIntrabarStopDataBatched=async(tickers,conc=6)=>{
        if(!tickers.length) return;
        for(let i=0;i<tickers.length;i+=conc){
          throwIfCancelled();
          const batch=tickers.slice(i,i+conc);
          await Promise.allSettled(batch.map(t=>{
            const dataByTf=allStockData[t];
            return dataByTf ? ensureIntrabarStopData(t,dataByTf) : Promise.resolve();
          }));
          throwIfCancelled();
        }
      };

      const formatRuleDetail=(prefix,res)=>{
        const conditions=(res?.conditions||[]).slice(0,6).map(c=>{
          const n=Number(c?.val);
          return (c?.lbl||'?')+'='+(Number.isFinite(n)?n.toFixed(1):String(c?.val ?? '-'));
        });
        return prefix+' G'+(res?.groupIdx||1)+': '+conditions.join(' & ');
      };

      // Reglas de peso por señal (heurísticas sobre 12 semanas; no usan la matriz de covarianza):
      //  equal/equalweight → iguales · maxsharpe → proporcional al Sharpe (>0)
      //  minvol → inverso de la volatilidad · maxret → proporcional al retorno medio (>0)
      // Todos respetan [minWeight, maxWeight]; si no cabe el 100% queda efectivo.
      const buildTargetWeights=(signals)=>{
        const n=signals.length;
        if(!n) return [];
        const allocMode = btAllocationMode === 'portfolio' ? (pfMode || 'maxsharpe') : (btAllocationMode || 'equal');
        const floor=1e-6;
        const raw=signals.map(s=>{
          if(allocMode==='equal'||allocMode==='equalweight') return 1;
          if(allocMode==='minvol') return 1/Math.max(1e-4, Number(s.vol)||0);
          if(allocMode==='maxret') return Math.max(floor, Number(s.momentum)||0);
          return Math.max(floor, Number(s.score)||0);
        });
        return boundWeights(raw, minWeight, maxWeight);
      };
      const selectTopSignals=(signals,k)=>{
        if(k<=0||!signals.length) return [];
        const top=[];
        for(const s of signals){
          if(top.length<k){
            top.push(s);
            top.sort((a,b)=>b.score-a.score);
            continue;
          }
          if(s.score<=top[top.length-1].score) continue;
          top[top.length-1]=s;
          top.sort((a,b)=>b.score-a.score);
        }
        return top;
      };

      for(let signalIndex=startWeek;signalIndex>=2;signalIndex--){
        throwIfCancelled();
        weekAlignedCache = new Map();
        if(signalIndex%4===0){
          report('Simulando semanas',startWeek-signalIndex,startWeek-2);
          await yieldToUi();
          throwIfCancelled();
        }
        const executionIndex=signalIndex-1;
        const mktOk = checkMktRegimeRules(signalIndex); // false -> exit holdings and block new entries this week
        signalStats.weeksSimulated++;
        if(!mktOk) signalStats.weeksBlocked++;
        const entrySignals=[];
        if(allowLongs && mktOk) await processTickerChunks('Entradas long',signalIndex,(ticker)=>{
          if(holdings[ticker]) return;
          const dataByTf=allStockData[ticker]; const d=dataByTf[mainTf];
          if(signalIndex>=d.closes.length-5||executionIndex>=d.opens.length) return;
          const md=getAlignedIndexMap(ticker,signalIndex);
          const er=evalRuleGroupsDetailedFast(entryRules,dataByTf,md);
          if(er.matched) entrySignals.push({ticker,dir:'long',signalIndex,executionIndex,entryMatch:er});
        });
        const longSignalTickers = entrySignals.length ? new Set(entrySignals.map(e=>e.ticker)) : null;
        signalStats.longEntries+=entrySignals.length;

        const shortSignals=[];
        if(allowShorts && mktOk){
          await processTickerChunks('Entradas short',signalIndex,(ticker)=>{
            if(holdings[ticker]) return;
            if(longSignalTickers?.has(ticker)) return;
            const dataByTf=allStockData[ticker]; const d=dataByTf[mainTf];
            if(signalIndex>=d.closes.length-5||executionIndex>=d.opens.length) return;
            const md=getAlignedIndexMap(ticker,signalIndex);
            const sr=evalRuleGroupsDetailedFast(shortEntryRules,dataByTf,md);
            if(sr.matched) shortSignals.push({ticker,dir:'short',signalIndex,executionIndex,entryMatch:sr});
          });
        }
        signalStats.shortEntries+=shortSignals.length;

        const exitSignals=[];
        if((stopATR||stopPct) && Object.keys(holdings).length){
          await ensureIntrabarStopDataBatched(Object.keys(holdings),6);
        }
        for(const ticker of Object.keys(holdings)){
          const dataByTf=allStockData[ticker]; const d=dataByTf?.[mainTf];
          if(!d||signalIndex>=d.closes.length-2||executionIndex>=d.opens.length) continue;
          if(!mktOk){
            exitSignals.push({ticker,signalIndex,executionIndex,reason:'Salida por regimen de mercado'});
            continue;
          }
          const h=holdings[ticker];
          const isShort=h.dir==='short';
          const signalData=getAlignedIndexMap(ticker,signalIndex);
          const signalClose=d.closes?.[signalData?.[mainTf] ?? signalIndex];
          const rules=isShort?shortExitRules:exitRules;
          const hasRules=rules.some(g=>g.conditions?.length>0);
          if(hasRules){
            const xr=evalRuleGroupsDetailedFast(rules,dataByTf,signalData);
            if(xr.matched){ exitSignals.push({ticker,signalIndex,executionIndex,reason:(isShort?'Short ':'')+'Regla G'+xr.groupIdx+': '+xr.conditions.map(c=>c.lbl+'='+c.val?.toFixed(1)).join(' & ')}); continue; }
          }
          if(stopATR){
            const stopPrice=calcAtrStop(d,h,signalIndex);
            if(stopPrice!=null && d.times?.[signalIndex]) h.stopSeries=[...(h.stopSeries||[]),{time:d.times[signalIndex],value:stopPrice}];
            const intraHit=findIntrabarStop(dataByTf,h,signalIndex,executionIndex,stopPrice);
            const weeklyHit=stopPrice!=null && (isShort?signalClose>=stopPrice:signalClose<=stopPrice);
            if(intraHit||weeklyHit){
              const rawExitPrice=intraHit?.price ?? stopPrice;
              if(intraHit?.time) h.stopSeries=[...(h.stopSeries||[]),{time:intraHit.time,value:stopPrice}];
              const execPrice=applySlippage(rawExitPrice,h.dir,'exit');
              const label=intraHit ? (intraHit.kind==='gap'?'Gap 4H':'Toque 4H') : 'Cierre semanal';
              exitSignals.push({ticker,signalIndex,executionIndex,execPrice,exitTime:intraHit?.time||d.times?.[executionIndex]||0,reason:'Stop ATR '+atrPeriod+' ×'+stopATRMult+' '+label+' ($'+rawExitPrice.toFixed(2)+')'});
              continue;
            }
          }
          const pnlPct=isShort?((h.entryPrice-signalClose)/h.entryPrice*100):((signalClose-h.entryPrice)/h.entryPrice*100);
          if(stopPct){
            const stopPrice=isShort?h.entryPrice*(1+stopPctVal/100):h.entryPrice*(1-stopPctVal/100);
            if(d.times?.[signalIndex]) h.stopSeries=[...(h.stopSeries||[]),{time:d.times[signalIndex],value:stopPrice}];
            const intraHit=findIntrabarStop(dataByTf,h,signalIndex,executionIndex,stopPrice);
            if(intraHit||pnlPct<=-stopPctVal){
              const rawExitPrice=intraHit?.price ?? stopPrice;
              if(intraHit?.time) h.stopSeries=[...(h.stopSeries||[]),{time:intraHit.time,value:stopPrice}];
              const execPrice=applySlippage(rawExitPrice,h.dir,'exit');
              const label=intraHit ? (intraHit.kind==='gap'?'Gap 4H':'Toque 4H') : 'Cierre semanal';
              exitSignals.push({ticker,signalIndex,executionIndex,execPrice,exitTime:intraHit?.time||d.times?.[executionIndex]||0,reason:'Stop -'+stopPctVal+'% '+label+' ($'+rawExitPrice.toFixed(2)+')'});
              continue;
            }
          }
        }
        signalStats.exitSignals+=exitSignals.length;

        for(const {ticker,reason,executionIndex,execPrice:signalExecPrice,exitTime:signalExitTime} of exitSignals){
          const d=allStockData[ticker]?.[mainTf];
          if(d&&executionIndex<Math.max(d.opens?.length||0,d.closes?.length||0)){
            const h=holdings[ticker];
            const rawExecPrice=validPrice(signalExecPrice) ?? barPrice(d,executionIndex,'open');
            if(!h||rawExecPrice==null||validPrice(h.entryPrice)==null||!Number.isFinite(Number(h.shares))||h.shares<=0) continue;
            const isShort=h.dir==='short';
            const execPrice=validPrice(signalExecPrice) ?? applySlippage(rawExecPrice,h.dir,'exit');
            if(execPrice==null) continue;
            const grossPnlPerShare=isShort?(h.entryPrice-execPrice):(execPrice-h.entryPrice);
            const exitCommission=commRate*h.shares*execPrice;
            const entryCommission=h.entryCommission||0;
            const totalCost=entryCommission+exitCommission;
            const netPnl=h.shares*grossPnlPerShare-totalCost;
            const netReturnPct=(netPnl/(h.shares*h.entryPrice))*100;
            // La comisión de entrada ya se sumó al abrir la posición.
            totalCommissionPaid+=exitCommission;
            allTrades.push({ticker,name:d.name||ticker,dir:h.dir,entryPrice:h.entryPrice,exitPrice:execPrice,shares:h.shares,entrySignalIndex:h.entrySignalIndex,entryExecIndex:h.entryExecIndex,exitSignalIndex:executionIndex+1,exitExecIndex:executionIndex,entryWeek:h.entryExecIndex,exitWeek:executionIndex,entryTime:d.times?.[h.entryExecIndex]||0,exitTime:signalExitTime||d.times?.[executionIndex]||0,returnPct:netReturnPct,pnl:netPnl,commission:totalCost,duration:h.entryExecIndex-executionIndex,reason,entryReason:h.entryReason||'',stopSeries:h.stopSeries||[],slippagePct:btSlippage||0});
            // Deduct exit commission from cash proceeds
            cashBalance += isShort?(h.shares*h.entryPrice+h.shares*grossPnlPerShare-exitCommission):(h.shares*execPrice-exitCommission);
            tradeCount.sells++;
            if(reason.startsWith('Stop ATR')) tradeCount.stopATRHits++;
            if(reason.startsWith('Stop -')) tradeCount.stopPctHits++;
          }
          delete holdings[ticker];
        }

        const currentHeld=Object.keys(holdings).length; const slotsAvail=pfMaxPos-currentHeld;
        const newSignalCount=entrySignals.length+shortSignals.length;
        let selectedSignals=[];
        if(slotsAvail>0&&newSignalCount>0){
          for(const s of entrySignals) Object.assign(s,signalStats12(s.ticker,'long',s.signalIndex));
          for(const s of shortSignals) Object.assign(s,signalStats12(s.ticker,'short',s.signalIndex));
          selectedSignals=selectTopSignals([...entrySignals,...shortSignals],Math.min(newSignalCount,slotsAvail));
        }
        if(slotsAvail>0&&selectedSignals.length>0){
          let portValue=cashBalance;
          for(const t of Object.keys(holdings)){
            const d=allStockData[t]?.[mainTf]; const h=holdings[t];
            if(d&&executionIndex<Math.max(d.opens?.length||0,d.closes?.length||0)){
              const p=barPrice(d,executionIndex,'open');
              if(p==null) continue;
              portValue += h.dir==='short' ? h.shares*(2*h.entryPrice-p) : h.shares*p;
            }
          }
          const targetWeights=buildTargetWeights(selectedSignals);
          // Los pesos reparten el efectivo disponible (no el valor total, que ya incluye posiciones
          // abiertas) y cada posición nueva queda limitada a maxWeight del valor de la cartera.
          const investableCash=cashBalance;
          for(let bi=0;bi<selectedSignals.length;bi++){
            const {ticker:t,dir,entryMatch,signalIndex:entrySignalIndex,executionIndex:entryExecIndex}=selectedSignals[bi];
            const d=allStockData[t]?.[mainTf];
            if(!d||entryExecIndex>=Math.max(d.opens?.length||0,d.closes?.length||0)) continue;
            const rawEntryPrice=barPrice(d,entryExecIndex,'open');
            const execPrice=applySlippage(rawEntryPrice,dir,'entry'); if(execPrice==null||execPrice<=0) continue;
            const weightedAllocation = ['portfolio','maxsharpe','minvol','maxret'].includes(btAllocationMode||'');
            const targetAmount=weightedAllocation ? Math.min(investableCash*targetWeights[bi], portValue*maxWeight) : portValue/pfMaxPos;
            const shares=Math.floor(Math.min(targetAmount,cashBalance)/execPrice);
            if(shares>0){
              const entryCommission=commRate*shares*execPrice;
              const entryReason=formatRuleDetail(dir==='short'?'Short':'Long',entryMatch);
              holdings[t]={shares,entryPrice:execPrice,entrySignalIndex,entryExecIndex,entryReason,dir,entryCommission,stopSeries:[]};
              cashBalance-=shares*execPrice+entryCommission;
              totalCommissionPaid+=entryCommission;
              tradeCount.buys++;
            }
          }
        }

        let weekEndValue=cashBalance;
        for(const t of Object.keys(holdings)){
          const d=allStockData[t]?.[mainTf]; const h=holdings[t];
          if(d&&executionIndex<Math.max(d.closes?.length||0,d.opens?.length||0)){
            const p=barPrice(d,executionIndex,'close');
            if(p==null) continue;
            weekEndValue += h.dir==='short' ? h.shares*(2*h.entryPrice-p) : h.shares*p;
          }
        }
        const nLongs=Object.values(holdings).filter(h=>h.dir==='long').length;
        const nShorts=Object.values(holdings).filter(h=>h.dir==='short').length;
        equityCurve.push({week:startWeek-signalIndex,value:weekEndValue,time:ts0?.[executionIndex]||0,holdings:Object.keys(holdings).length,longs:nLongs,shorts:nShorts,passing:entrySignals.length,mktBlocked:!mktOk});
        if(newSignalCount>0||exitSignals.length>0||!mktOk){
          weeklyLog.push({week:startWeek-signalIndex,time:ts0?.[executionIndex]||0,passing:entrySignals.length,shortSigs:shortSignals.length,held:Object.keys(holdings).length,bought:selectedSignals.length,sold:exitSignals.length,reasons:exitSignals.map(e=>e.reason),value:weekEndValue,mktBlocked:!mktOk});
        }
        weekAlignedCache = null;
      }

      const startVal=btCapital; const endVal=equityCurve.length?equityCurve[equityCurve.length-1].value:startVal;
      const totalReturn=(endVal-startVal)/startVal;
      // La serie de valor arranca en el capital inicial: el drawdown cuenta pérdidas desde el inicio
      // y el primer retorno semanal también entra en volatilidad/Sharpe/Sortino.
      const valuePath=[startVal,...equityCurve.map(p=>p.value)];
      let peak2=startVal,maxDD2=0; valuePath.forEach(v=>{ if(v>peak2) peak2=v; const dd=peak2>0?(peak2-v)/peak2:0; if(dd>maxDD2) maxDD2=dd; });
      // Años efectivamente simulados (una entrada de la curva por semana).
      const years=(equityCurve.length||btWeeks)/52; const annReturn=years>0?Math.pow(Math.max(0,1+totalReturn),1/years)-1:totalReturn;
      const weeklyRets=[]; for(let i=1;i<valuePath.length;i++) if(valuePath[i-1]>0) weeklyRets.push((valuePath[i]-valuePath[i-1])/valuePath[i-1]);
      const avgWR=weeklyRets.length?weeklyRets.reduce((a,b)=>a+b,0)/weeklyRets.length:0;
      const wStd=weeklyRets.length>1?Math.sqrt(weeklyRets.reduce((a,r)=>a+(r-avgWR)**2,0)/(weeklyRets.length-1)):0;
      const annVol=wStd*Math.sqrt(52); const sharpe=annVol>0?(annReturn-pfRiskFree/100)/annVol:0;
      const validTrades=allTrades.filter(t=>validPrice(t.entryPrice)!=null&&validPrice(t.exitPrice)!=null&&finiteNum(t.pnl)!=null&&finiteNum(t.returnPct)!=null);
      const wins=validTrades.filter(t=>t.pnl>0); const losses=validTrades.filter(t=>t.pnl<=0);
      const winRate=validTrades.length>0?wins.length/validTrades.length:0;
      const avgWin=wins.length?wins.reduce((a,t)=>a+t.returnPct,0)/wins.length:0;
      const avgLoss=losses.length?losses.reduce((a,t)=>a+t.returnPct,0)/losses.length:0;
      const grossProfit=wins.reduce((a,t)=>a+t.pnl,0); const grossLoss=Math.abs(losses.reduce((a,t)=>a+t.pnl,0));
      const profitFactor=grossLoss>0?grossProfit/grossLoss:grossProfit>0?Infinity:0;
      // Desviación a la baja estándar: semanas positivas cuentan como 0, se divide entre todas las semanas.
      const downRets=weeklyRets.filter(r=>r<0);
      const downDev=downRets.length>1&&weeklyRets.length?Math.sqrt(downRets.reduce((a,r)=>a+r*r,0)/weeklyRets.length)*Math.sqrt(52):0;
      const sortino=downDev>0?(annReturn-pfRiskFree/100)/downDev:0;
      const calmar=maxDD2>0?annReturn/maxDD2:0;
      const avgDuration=validTrades.length?validTrades.reduce((a,t)=>a+t.duration,0)/validTrades.length:0;
      let cacheEntriesBefore=Object.keys(dataCacheRef.current||{}).filter(t=>!t.startsWith('__')).length;
      let cacheEntriesAfter=cacheEntriesBefore;
      let cacheTickersReleased=0;
      const releaseBacktestMemory=(keepTickers=[])=>{
        if(!backtestLocalOnlyCache) return;
        const keep=new Set([...keepTickers,btBenchmark].filter(Boolean));
        keep.forEach(t=>{
          if(allStockData[t]) dataCacheRef.current[t]={...(dataCacheRef.current[t]||{}),...allStockData[t]};
        });
        Object.keys(dataCacheRef.current||{}).forEach(t=>{
          if(t.startsWith('__')) return;
          if(!keep.has(t)) delete dataCacheRef.current[t];
        });
        cacheEntriesAfter=Object.keys(dataCacheRef.current||{}).filter(t=>!t.startsWith('__')).length;
        cacheTickersReleased=Math.max(0,cacheEntriesBefore-cacheEntriesAfter);
      };
      const compactStopSeries=(series=[])=>{
        const clean=(series||[]).filter(p=>p&&Number.isFinite(Number(p.time))&&Number.isFinite(Number(p.value)));
        if(clean.length<=2) return clean;
        return [clean[0],clean[clean.length-1]];
      };
      const compactTrade=(t)=>({
        ticker:t.ticker,
        name:t.name||t.ticker,
        dir:t.dir,
        entryPrice:t.entryPrice,
        exitPrice:t.exitPrice,
        shares:t.shares,
        entrySignalIndex:t.entrySignalIndex,
        entryExecIndex:t.entryExecIndex,
        exitSignalIndex:t.exitSignalIndex,
        exitExecIndex:t.exitExecIndex,
        entryWeek:t.entryWeek,
        exitWeek:t.exitWeek,
        entryTime:t.entryTime,
        exitTime:t.exitTime,
        returnPct:t.returnPct,
        pnl:t.pnl,
        commission:t.commission||0,
        duration:t.duration,
        reason:t.reason||'',
        entryReason:t.entryReason||'',
        stopSeries:compactStopSeries(t.stopSeries),
        slippagePct:t.slippagePct||0,
      });
      const compactTrades=validTrades.map(compactTrade);
      releaseBacktestMemory([...new Set(compactTrades.map(t=>t.ticker))]);

      let benchCurve=null;
      if(benchData&&benchData.closes.length>btWeeks){
        benchCurve=[]; const bStart=benchData.closes[btWeeks];
        for(let w=btWeeks;w>=1;w--){ benchCurve.push({week:btWeeks-w,value:btCapital*(benchData.closes[w-1]/bStart),time:benchData.times[w-1]||0}); }
      }
      const benchReturn=benchCurve?.length?((benchCurve[benchCurve.length-1].value-btCapital)/btCapital):null;
      const mktFilterBlockedWeeks = equityCurve.filter(p=>p.mktBlocked).length;
      markPerf('simulationMs');
      const totalMs=Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now())-perfStart);
      const perfStages={
        dataMs:perfMarks.dataMs||0,
        benchmarkMs:Math.max(0,(perfMarks.benchmarkMs||perfMarks.dataMs||0)-(perfMarks.dataMs||0)),
        regimeMs:Math.max(0,(perfMarks.regimeMs||perfMarks.benchmarkMs||0)-(perfMarks.benchmarkMs||perfMarks.dataMs||0)),
        simulationMs:Math.max(0,(perfMarks.simulationMs||totalMs)-(perfMarks.regimeMs||perfMarks.benchmarkMs||perfMarks.dataMs||0)),
        resultsMs:Math.max(0,totalMs-(perfMarks.simulationMs||totalMs)),
      };
      const result={equityCurve,weeklyLog,startVal,endVal,totalReturn,annReturn,annVol,sharpe,maxDrawdown:maxDD2,trades:tradeCount,allTrades:compactTrades,weeks:btWeeks,capital:btCapital,winRate,avgWin,avgLoss,profitFactor,sortino,calmar,avgDuration,benchCurve,benchReturn,benchSymbol:btBenchmark,riskFreePct:Number(pfRiskFree)||0,totalCommissionPaid,commission:btCommission||0,slippage:btSlippage||0,atrPeriod,allocationMode:btAllocationMode||'equal',timestamp:Date.now(),label:'Estrategia '+(savedStrategiesLength+1),
        status:validTrades.length?'ok':'no_trades',
        diagnostics:{signalStats,loadStats,tickerIssues:tickerIssues.slice(0,500),validTickers:validTickers.length},
        perf:{...perfMarks,totalMs,stages:perfStages,alignedCacheSize:maxWeekAlignedCacheSize,tickers:validTickers.length,loadStats,tickerIssues:tickerIssues.slice(0,500),signalStats,intrabarFetches,validTrades:validTrades.length,invalidTrades:allTrades.length-validTrades.length,lightMemory:backtestLocalOnlyCache,trimmedSeriesCount,trimmedBarsSaved,maxRuleLookback,simulationChunkSize,simulationChunks,simulationYieldCount,fastRuleEvalCount,fastRuleFallbackCount,cacheEntriesBefore,cacheEntriesAfter,cacheTickersReleased,batchChartRequests,batchChartSymbols,batchFetchConcurrency,transientCacheHits,transientCacheWrites,transientCacheReleased,transientCacheRemaining:transientDataCache.size,cooperativeYieldCount,cooperativeLongSliceCount},
        mktFilter:mktFilterEnabled?{enabled:true,ticker:btBenchmark,ind:'Reglas',period:(mktFilterRules||[]).length,label:'Reglas sobre '+btBenchmark,rulesCount:(mktFilterRules||[]).length,blockedWeeks:mktFilterBlockedWeeks,totalWeeks:equityCurve.length}:null,
      };
      report('Finalizando resultados',1,1);
      setBacktest(result);
      return { ok:true, perf:result.perf };
    }finally{
      setBtRunning(false);
      report(abortSignal?.aborted?'Cancelado':'Listo',1,1,{cancelled:!!abortSignal?.aborted});
    }
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore||{}, { runBacktestWorkflow });
})();

