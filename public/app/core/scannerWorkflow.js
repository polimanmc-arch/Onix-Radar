(function(){
  const { fetchTicker, testFilterAligned, buildSignalSliceFromIndex, calcSignalScore } = window.StockScannerCore;

  const META_FILTER_IDS = new Set(['SECTOR','INDUSTRY','COUNTRY','EXCHANGE','MARKET_CAP','FLOAT','SHARES_OUT','SHORT_INT_PCT','INST_OWN_PCT','INSIDER_OWN_PCT','BETA','PE','FWD_PE','PS','PB','EV_EBITDA','DEBT_EQUITY','CURRENT_RATIO','ROE','ROA','GROSS_MARGIN','OPER_MARGIN','REV_GROWTH','EPS_GROWTH','FCF_YIELD']);
  function getFilterId(f){ return f?.id || f?.key || f?.ind || null; }
  function scanNeedsMeta(filters = []){
    return (filters||[]).some(f => META_FILTER_IDS.has(getFilterId(f)) || ((f?.cmpType === 'ind') && META_FILTER_IDS.has(f?.cmpInd)));
  }
  function splitMeta(meta = {}){
    const marketMeta = { sector: meta.sector ?? null, industry: meta.industry ?? null, country: meta.country ?? null, exchange: meta.exchange ?? null, marketCap: meta.marketCap ?? null, beta: meta.beta ?? null, sharesOutstanding: meta.sharesOutstanding ?? null, floatShares: meta.floatShares ?? null, shortInterestPct: meta.shortInterestPct ?? null, institutionalOwnershipPct: meta.institutionalOwnershipPct ?? null, insiderOwnershipPct: meta.insiderOwnershipPct ?? null };
    const fundamentalMeta = { peRatio: meta.peRatio ?? null, forwardPE: meta.forwardPE ?? null, priceToSales: meta.priceToSales ?? null, priceToBook: meta.priceToBook ?? null, evToEbitda: meta.evToEbitda ?? null, debtToEquity: meta.debtToEquity ?? null, currentRatio: meta.currentRatio ?? null, roe: meta.roe ?? null, roa: meta.roa ?? null, grossMargin: meta.grossMargin ?? null, operatingMargin: meta.operatingMargin ?? null, revenueGrowth: meta.revenueGrowth ?? null, epsGrowth: meta.epsGrowth ?? null, freeCashFlowYield: meta.freeCashFlowYield ?? null };
    return { marketMeta, fundamentalMeta };
  }
  function buildMetaCoverage(results = []){
    const keys = ['sector','industry','country','exchange','marketCap','beta','sharesOutstanding','floatShares','shortInterestPct','institutionalOwnershipPct','insiderOwnershipPct','peRatio','forwardPE','priceToSales','priceToBook','evToEbitda','debtToEquity','currentRatio','roe','roa','grossMargin','operatingMargin','revenueGrowth','epsGrowth','freeCashFlowYield'];
    const coverage = Object.fromEntries(keys.map(k => [k, 0]));
    for(const r of (results||[])){ const meta = r?.meta || r?._meta || {}; for(const k of keys){ if(meta[k] != null) coverage[k] += 1; } }
    return coverage;
  }

  async function runScanWorkflow(opts){
    const {
      scanning, tickers, filters, shortFilters, scanDirection, conc, minHistoryYears,
      abortRef, setScanning, setResults, setSearch, setOnlyPass, setProg, setTab,
      dataCacheRef, addLog, fetchSectors, fetchQuotes, setSectorData,
    } = opts;

    if(scanning) return;
    try{
      const activeLongFilters = filters || [];
      const activeShortFilters = shortFilters || [];
      const neededFilters = [
        ...(scanDirection !== 'short' ? activeLongFilters : []),
        ...(scanDirection !== 'long' ? activeShortFilters : []),
      ];
      if(!tickers.length || !neededFilters.length) return;

      setScanning(true);
      setResults([]);
      setSearch('');
      setOnlyPass(true);
      const ac = new AbortController();
      abortRef.current = ac;
      setProg({done:0,total:tickers.length,tick:'',errors:0});
      setTab('scanner');
      dataCacheRef.current = {};
      const tfs = [...new Set(neededFilters.map(f => f.tf))];
      // Always fetch 1d — used for the 3-month sparkline on every row
      const fetchTfs = [...new Set([...tfs, '1d'])];
      addLog('▶ Escaneo: '+tickers.length+' tickers × '+conc+' · modo '+scanDirection.toUpperCase()+(minHistoryYears>0?(' · min '+minHistoryYears+' años'):'') );

      const needsMeta = scanNeedsMeta(neededFilters);
      let quotesMap = {};
      if(needsMeta && typeof fetchQuotes === 'function'){
        addLog('💼 Descargando metadata/fundamentales para filtros avanzados...');
        try {
          quotesMap = await fetchQuotes(tickers, true);
        } catch(err) {
          console.error('Failed to fetch detailed quotes for scan:', err);
          quotesMap = {};
        }
        const sectorPatch = {};
        Object.entries(quotesMap||{}).forEach(([ticker, q])=>{
          if(q && (q.sector || q.industry || q.country || q.exchange)) sectorPatch[ticker] = {
            sector: q.sector || 'Other',
            industry: q.industry || '',
            country: q.country || '',
            exchange: q.exchange || ''
          };
        });
        if(Object.keys(sectorPatch).length && typeof setSectorData === 'function') setSectorData(prev=>({ ...prev, ...sectorPatch }));
      }

      // A slow symbol occupies only its own slot, not an entire batch.
      const slots = new Array(tickers.length);
      let all = [], errCount = 0, completed = 0, nextIndex = 0;
      let lastPublish = 0, lastTick = '';
      const pendingLogs = [];
      const publish = (force=false) => {
        const now = Date.now();
        if(!force && now-lastPublish < 250) return;
        lastPublish = now;
        all = slots.filter(Boolean);
        setProg({done:completed,total:tickers.length,tick:lastTick,errors:errCount});
        setResults(all);
        if(pendingLogs.length) addLog(pendingLogs.splice(0).slice(-80).join('\n'));
      };
      const processTicker = async (ticker, index) => {
        const saveResult = row => { slots[index] = row; };
        const tfResults = await Promise.all(fetchTfs.map(async tf => {
          if(ac.signal.aborted) return {ticker,tf,ok:false,error:'aborted'};
          try { return {...await fetchTicker(ticker,tf,ac.signal),tf}; }
          catch(e) { return {ticker,tf,ok:false,error:e?.message||'error'}; }
        }));
        if(ac.signal.aborted) return;
        const dataByTf = {};
        tfResults.forEach(d => { dataByTf[d.tf] = d; });
        if(quotesMap?.[ticker]) {
          const {marketMeta,fundamentalMeta} = splitMeta(quotesMap[ticker]);
          dataByTf._marketMeta=marketMeta; dataByTf._fundamentalMeta=fundamentalMeta;
          dataByTf._meta={...marketMeta,...fundamentalMeta};
        }
        dataCacheRef.current[ticker] = dataByTf;
          const anyOk = Object.values(dataByTf).some(d => d.ok);
          if(!anyOk){
            errCount++;
            saveResult({ticker,name:ticker,err:'No data',passed:false,longPassed:false,shortPassed:false,matchedSides:[],directionLabel:'—',directionSort:0,fRes:[],shortFRes:[],price:null,chg:null,vol:null,volatility:null,mainTf:null});
            return;
          }
          const historyData = dataByTf['1d']?.ok ? dataByTf['1d'] : Object.values(dataByTf).find(d=>d?.ok&&Array.isArray(d.times)&&d.times.length>1);
          const historyYears = historyData?.times?.length>1 ? ((historyData.times[0]-historyData.times[historyData.times.length-1])/(365.25*24*3600)) : 0;
          if(minHistoryYears>0 && historyYears < minHistoryYears){
            saveResult({ticker,name:(historyData?.name||ticker),err:null,passed:false,longPassed:false,shortPassed:false,matchedSides:[],directionLabel:'—',directionSort:0,fRes:[],shortFRes:[],price:historyData?.price||null,chg:null,vol:null,volatility:null,mainTf:null,historyYears});
            return;
          }
          // Live series are newest-first: index 0 is the current candle and
          // index 1 is the latest closed candle. Evaluate each TF independently;
          // a common timestamp can rewind faster TFs by weeks or months.
          const alignedByTf = {_meta:dataByTf._meta||{}};
          const signalTimes = {};
          for(const tf of tfs){
            alignedByTf[tf]=buildSignalSliceFromIndex(dataByTf[tf],1);
            signalTimes[tf]=alignedByTf[tf]?.times?.[0]??null;
          }
          const evalFilterSet = (filterSet)=> (filterSet||[]).map(f=>testFilterAligned(f, alignedByTf));
          const longFRes = scanDirection === 'long' ? evalFilterSet(activeLongFilters) : [];
          const shortFRes = scanDirection === 'short' ? evalFilterSet(activeShortFilters) : [];
          const longPassed = scanDirection === 'long' && activeLongFilters.length>0 && longFRes.every(r=>r.pass);
          const shortPassed = scanDirection === 'short' && activeShortFilters.length>0 && shortFRes.every(r=>r.pass);
          const matchedSides = scanDirection === 'short' ? (shortPassed?['short']:[]) : (longPassed?['long']:[]);
          const passed = scanDirection === 'short' ? shortPassed : longPassed;
          const signalScore = passed ? calcSignalScore(scanDirection==='short'?shortFRes:longFRes) : 0;
          const mainData = dataByTf[tfs[0]];
          const mainAligned = alignedByTf[tfs[0]];
          const price = mainAligned?.closes?.[0] ?? null;
          const prevPrice = mainAligned?.closes?.[1];
          const chg = prevPrice ? ((price-prevPrice)/prevPrice*100) : null;
          const directionLabel = matchedSides[0]?.toUpperCase() || '—';
          const directionSort = matchedSides.includes('long') ? 2 : matchedSides.includes('short') ? 1 : 0;
          // 3-month sparkline data: last ~63 daily closes (newest-first)
          const d1 = dataByTf['1d'];
          const spark = (d1?.ok && Array.isArray(d1.closes)) ? d1.closes.slice(0, 63).filter(v=>v!=null) : [];
          saveResult({ticker,name:mainData?.name||ticker,price,chg,passed,longPassed,shortPassed,matchedSides,directionLabel,direction:matchedSides[0]?.toUpperCase()||'—',directionSort,fRes:longFRes,shortFRes,err:null,mainTf:tfs[0],signalTimes,historyYears,signalScore,spark,meta:dataByTf._meta||{}});
          if(passed) pendingLogs.push('✓ '+ticker+' ($'+(price?.toFixed(2)||'?')+') — '+directionLabel);
      };
      const worker = async () => {
        while(!ac.signal.aborted && nextIndex < tickers.length){
          const index = nextIndex++;
          const ticker = tickers[index];
          try { await processTicker(ticker,index); }
          catch(e) {
            if(!ac.signal.aborted){
              errCount++;
              slots[index]={ticker,name:ticker,err:e?.message||'Exception',passed:false,
                fRes:[],shortFRes:[],price:null,directionSort:0};
            }
          }
          if(ac.signal.aborted) break;
          completed++; lastTick=ticker;
          publish();
        }
      };
      const workerCount = Math.min(tickers.length,Math.max(1,Math.min(40,Math.floor(Number(conc)||16))));
      await Promise.all(Array.from({length:workerCount},worker));
      publish(true);

      const metaCoverage = buildMetaCoverage(all);
      if (Object.keys(metaCoverage).length) dataCacheRef.current.__metaCoverage = metaCoverage;
      addLog('═══ '+(ac.signal.aborted?'Cancelado':'Completado')+': '+all.filter(r=>r.passed).length+'/'+all.length+' pasan ('+errCount+' err) ═══');
      const passedTickers = all.filter(r=>r.passed&&!r.err).map(r=>r.ticker);
      if(!ac.signal.aborted && passedTickers.length){
        addLog('🏢 Descargando sectores para '+passedTickers.length+' acciones...');
        fetchSectors(passedTickers)
          .then(()=>addLog('✅ Sectores cargados'))
          .catch(e=>addLog('⚠ Error cargando sectores: '+(e?.message||e)));
      }
    }catch(e){
      console.error('runScan error', e);
      opts.addLog('❌ Error en escaneo: '+(e?.message||e));
    }finally{
      setScanning(false);
    }
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore||{}, { runScanWorkflow, scanNeedsMeta, splitMeta });
})();
