(function(){
  const { SP500, NASDAQ100, DOW30, UNIVERSE_PRESETS } = window.StockScannerConfig;
  const uniq = arr => [...new Set((arr||[]).filter(Boolean))];

  function parseTickersText(tText){
    return (tText||"").split(/[;,\s\n]+/).map(t=>t.trim().toUpperCase()).filter(t=>t&&/^[A-Z0-9.^=\-]+$/.test(t));
  }

  async function loadAllUsTickers(){
    const resp = await fetch('/api/tickers');
    const json = await resp.json();
    return Array.isArray(json?.tickers) ? json.tickers.map(t=>String(t).toUpperCase()).filter(Boolean) : [];
  }

  function mergeAllUsIntoComplete(allUsTickers){
    const cfg = window.StockScannerConfig || {};
    const complete = uniq([...(cfg.ALL_INDEX_COMPANIES||[]), ...(allUsTickers||[]), ...(cfg.MACRO_ASSETS||[])]);
    cfg.ALL_US_AUTO = uniq(allUsTickers||[]);
    cfg.GLOBAL_FULL_UNIVERSE = complete;
    if(cfg.UNIVERSE_PRESETS?.GLOBAL_FULL_UNIVERSE) cfg.UNIVERSE_PRESETS.GLOBAL_FULL_UNIVERSE.tickers = complete;
    return complete;
  }

  function createPresetPicker(setPreset,setTText,setUniverseIds,getUniverseIds,getSavedUniverseLists,addLog,setFetchingAll){
    if(typeof setPreset === 'object' && setPreset){
      const opts = setPreset;
      setPreset = opts.setPreset;
      setTText = opts.setTText;
      setUniverseIds = opts.setUniverseIds;
      getUniverseIds = opts.getUniverseIds;
      getSavedUniverseLists = opts.getSavedUniverseLists;
      addLog = opts.addLog;
      setFetchingAll = opts.setFetchingAll;
    }
    return async function pickPreset(k){
      const presetMap = UNIVERSE_PRESETS || { SP500:{tickers:SP500}, NASDAQ100:{tickers:NASDAQ100}, DOW30:{tickers:DOW30}, ALL:{tickers:[...new Set([...SP500,...NASDAQ100])].sort()} };
      const savedLists = (typeof getSavedUniverseLists === 'function' ? getSavedUniverseLists() : []) || [];
      const customMap = Object.fromEntries(savedLists.map(w=>['LIST_'+w.id,{label:w.name,tickers:w.tickers||[]}]));
      const allPresetMap = {
        ...presetMap,
        ...customMap,
        ALL_US: { label:'Todo US (Auto)', tickers: window.StockScannerConfig?.ALL_US_AUTO || [] },
      };
      let nextIds = [k];
      if(typeof getUniverseIds === 'function' && typeof setUniverseIds === 'function'){
        const current = Array.isArray(getUniverseIds()) ? getUniverseIds() : [];
        nextIds = current.includes(k) ? current.filter(id=>id!==k) : [...current, k];
      }
      const needsAllUs = nextIds.includes('ALL_US') || nextIds.includes('GLOBAL_FULL_UNIVERSE');
      let allUsTickers = [];
      if(needsAllUs){
        try{
          if(typeof setFetchingAll === 'function') setFetchingAll(true);
          allUsTickers = await loadAllUsTickers();
          if(allUsTickers.length) mergeAllUsIntoComplete(allUsTickers);
        }catch(e){ if(typeof addLog === 'function') addLog('No pude cargar Todo US (Auto): '+(e?.message||e)); }
        finally{ if(typeof setFetchingAll === 'function') setFetchingAll(false); }
      }
      const tickers = uniq(nextIds.flatMap(id=>{
        if(id === 'ALL_US') return allUsTickers.length ? allUsTickers : (window.StockScannerConfig?.ALL_US_AUTO||[]);
        if(id === 'GLOBAL_FULL_UNIVERSE' && allUsTickers.length) return mergeAllUsIntoComplete(allUsTickers);
        return allPresetMap[id]?.tickers || [];
      }));
      if(typeof setUniverseIds === 'function') setUniverseIds(nextIds);
      if(typeof setPreset === 'function') setPreset(nextIds.length===0 ? 'CUSTOM' : nextIds.length===1 ? nextIds[0] : 'MULTI');
      if(Array.isArray(tickers) && tickers.length) setTText(tickers.join(", "));
      else setTText('');
    };
  }

  async function fetchAllTickersAction({setFetchingAll,setTText,setPreset,setUniverseIds,addLog}){
    setFetchingAll(true);
    try{
      const resp=await fetch('/api/tickers');
      const json=await resp.json();
      if(json?.tickers?.length){
        mergeAllUsIntoComplete(json.tickers);
        setTText(json.tickers.join(', '));
        if(typeof setUniverseIds === 'function') setUniverseIds(['ALL_US']);
        setPreset('ALL_US');
        addLog('✅ '+json.tickers.length+' tickers descargados');
      }
    }catch(e){
      addLog('❌ '+(e?.message||e));
    }finally{
      setFetchingAll(false);
    }
  }

  function updateFilterBySide({side,id,patch,setFilters,setShortFilters}){
    const setter=side==='short'?setShortFilters:setFilters;
    setter(fs=>fs.map(f=>f._id===id?{...f,...patch}:f));
  }

  function removeFilterBySide({side,id,setFilters,setShortFilters}){
    const setter=side==='short'?setShortFilters:setFilters;
    setter(fs=>fs.filter(f=>f._id!==id));
  }

  function appendLog(logRef,setLogLines,msg){
    logRef.current=[...logRef.current,...String(msg).split('\n')].slice(-80);
    setLogLines([...logRef.current]);
  }

  function stopScanAction(abortRef,setScanning){
    abortRef.current?.abort();
    setScanning(false);
  }

  // ── Filter Set actions ─────────────────────────────────────────────────────
  function saveFilterSetAction({name, direction, filters, shortFilters, savedFilterSets, setSavedFilterSets}){
    const trimmed=(name||'').trim();
    if(!trimmed) return {ok:false, message:'Escribe un nombre para el set de filtros.'};
    if(!filters.length && !shortFilters.length) return {ok:false, message:'Agrega al menos un filtro antes de guardar.'};
    const id = String(Date.now());
    const existing = savedFilterSets.findIndex(s=>s.name.toLowerCase()===trimmed.toLowerCase());
    const item = {id: existing>=0 ? savedFilterSets[existing].id : id, name:trimmed, direction, filters, shortFilters, savedAt: new Date().toISOString()};
    setSavedFilterSets(prev => {
      const next=[...prev];
      if(existing>=0) next[existing]=item; else next.unshift(item);
      return next.slice(0,30);
    });
    return {ok:true, name:trimmed};
  }

  function loadFilterSetAction(id, {savedFilterSets, setFilters, setShortFilters, setScanDirection}){
    const item=savedFilterSets.find(s=>s.id===id);
    if(!item) return {ok:false};
    if(Array.isArray(item.filters) && item.filters.length) setFilters(item.filters);
    if(Array.isArray(item.shortFilters) && item.shortFilters.length) setShortFilters(item.shortFilters);
    if(item.direction) setScanDirection(item.direction);
    return {ok:true, item};
  }

  function deleteFilterSetAction(id, setSavedFilterSets){
    setSavedFilterSets(prev=>prev.filter(s=>s.id!==id));
    return {ok:true};
  }

  // ── Notifications ──────────────────────────────────────────────────────────
  async function requestNotificationPermission(){
    if(!('Notification' in window)) return 'unsupported';
    if(Notification.permission==='granted') return 'granted';
    return await Notification.requestPermission();
  }

  function sendScanCompleteNotification({passed, total, errors}){
    if(!('Notification' in window)||Notification.permission!=='granted') return;
    const title = passed>0 ? `✅ Scan completo — ${passed} señal${passed!==1?'es':''} encontrada${passed!==1?'s':''}` : '📡 Scan completo — Sin señales';
    const body  = `${total} tickers escaneados${errors>0?' · '+errors+' errores':''}`;
    try{ new Notification(title,{body,icon:'/assets/favicon.svg',tag:'scan-complete',requireInteraction:false}); }catch{}
  }

  window.StockScannerAppActions = Object.assign(window.StockScannerAppActions||{}, {
    parseTickersText, createPresetPicker, fetchAllTickersAction,
    updateFilterBySide, removeFilterBySide, appendLog, stopScanAction,
    saveFilterSetAction, loadFilterSetAction, deleteFilterSetAction,
    requestNotificationPermission, sendScanCompleteNotification,
  });
})();
