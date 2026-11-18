// main.js — App root. Wires all state, derived values, and actions into a
// single appCtx object passed to each tab renderer.
const { SP500, NASDAQ100, DOW30, TIMEFRAMES, INDICATORS, DIR_OPTIONS } = window.StockScannerConfig;
const { fetchMissingSectors, fetchQuotes } = window.StockScannerApi;
const { useState, useCallback, useRef, useEffect, useMemo } = React;
const { useScannerState, usePortfolioState, useBacktestState } = window.StockScannerDomainState;
const { runScanWorkflow, runBacktestWorkflow, buildPortfolioWorkflow } = window.StockScannerCore;
const { createScannerSortHandler, createScannerExportHandler, createPortfolioWatchlistActions } = window.StockScannerControllers;
const { APP_TABS, UI_STYLES: S, TF_COLORS: tfColor, AppHeader, AppNotifications, AppTabNav, SelectedChartLayer } = window.StockScannerUI;
const { renderScannerTabs, renderPortfolioTab, renderBacktestTab } = window.StockScannerTabs;
const { newFilter, newCond, newGroup } = window.StockScannerState;
const { parsePortfolioManualTickers, savePortfolioWatchlistsToStorage, parsePortfolioCsvText, exportManualWatchlistCsv } = window.StockScannerPortfolioIO;
const { fmt, indLbl, exportScanCsv } = window.StockScannerFormatters;
const {
  parseTickersText, createPresetPicker, fetchAllTickersAction,
  updateFilterBySide, removeFilterBySide, appendLog, stopScanAction,
  saveFilterSetAction, loadFilterSetAction, deleteFilterSetAction,
  requestNotificationPermission, sendScanCompleteNotification,
} = window.StockScannerAppActions;

const ACTIVE_APP_TAB_KEY = 'onix_active_app_tab_v1';

function loadActiveAppTab(){
  try{
    const raw = localStorage.getItem(ACTIVE_APP_TAB_KEY);
    return ['scanner','portfolio','backtest'].includes(raw) ? raw : 'scanner';
  }catch{ return 'scanner'; }
}

function App(){
  const [tab, setTab]               = useState(()=>loadActiveAppTab());
  const [serverOk, setServerOk]     = useState(null);
  const [selectedChart, setSelectedChart] = useState(null);
  const [notices, setNotices] = useState([]);

  const dismissNotice = useCallback((id)=>{
    setNotices(prev=>prev.filter(n=>n.id!==id));
  }, []);

  const notify = useCallback(({type='info', title='', message='', timeout=6500}={})=>{
    const cleanMessage = String(message || '').trim();
    if(!cleanMessage) return null;
    const id = Date.now() + Math.random();
    setNotices(prev=>[{id,type,title,message:cleanMessage}, ...prev].slice(0,5));
    if(timeout>0) setTimeout(()=>dismissNotice(id), timeout);
    return id;
  }, [dismissNotice]);

  // ── Domain state hooks ────────────────────────────────────────────────────
  const scannerState   = useScannerState(React);
  const portfolioState = usePortfolioState(React);
  const backtestState  = useBacktestState(React);

  const {
    preset, setPreset, universeIds, setUniverseIds, tText, setTText, scanDirection, setScanDirection,
    filters, setFilters, shortFilters, setShortFilters,
    results, setResults, scanning, setScanning, prog, setProg,
    sortK, setSortK, sortD, setSortD, onlyPass, setOnlyPass,
    search, setSearch, logLines, setLogLines, visRows, setVisRows,
    conc, setConc, fetchingAll, setFetchingAll,
    sectorData, setSectorData, minHistoryYears, setMinHistoryYears,
    abortRef, logRef,
    savedFilterSets, setSavedFilterSets,
    savedScanPresets, setSavedScanPresets,
    scanPresetName, setScanPresetName, selectedScanPresetId, setSelectedScanPresetId,
    savedUniverseLists, setSavedUniverseLists,
    universeListName, setUniverseListName, selectedUniverseListId, setSelectedUniverseListId,
    filterSetName, setFilterSetName, selectedFilterSetId, setSelectedFilterSetId,
  } = scannerState;

  const {
    portfolio, setPortfolio, pfCapital, setPfCapital, pfMaxWeight, setPfMaxWeight,
    pfMaxPos, setPfMaxPos, pfRiskFree, setPfRiskFree,
    pfCorFilter, setPfCorFilter, pfCorThresh, setPfCorThresh,
    pfMode, setPfMode, pfSims, setPfSims,
    pfStopType, setPfStopType, pfStopATRMult, setPfStopATRMult, pfStopATRPeriod, setPfStopATRPeriod, pfStopPctVal, setPfStopPctVal,
    pfUniverseSource, setPfUniverseSource, pfManualTickers, setPfManualTickers,
    pfWatchlists, setPfWatchlists, pfWatchlistName, setPfWatchlistName,
    pfSelectedWatchlistId, setPfSelectedWatchlistId, pfBuilding, setPfBuilding,
    pfMinWeight, setPfMinWeight, pfConfigOpen, setPfConfigOpen, pfManualOpen, setPfManualOpen,
    pfPreset, setPfPreset,
    savedPfPresets, setSavedPfPresets,
    pfPresetName, setPfPresetName,
    selectedPfPresetId, setSelectedPfPresetId,
    PF_DEFAULTS, pfCsvInputRef,
  } = portfolioState;

  const {
    backtest, setBacktest, btRunning, setBtRunning, btProgress, setBtProgress, btWeeks, setBtWeeks,
    btCapital, setBtCapital, btBenchmark, setBtBenchmark,
    savedStrategies, setSavedStrategies,
    entryRules, setEntryRules, exitRules, setExitRules,
    stopATR, setStopATR, stopATRMult, setStopATRMult,
    stopPct, setStopPct, stopPctVal, setStopPctVal,
    btDirection, setBtDirection,
    shortEntryRules, setShortEntryRules, shortExitRules, setShortExitRules,
    btCommission, setBtCommission, btSlippage, setBtSlippage,
    btUniverseSource, setBtUniverseSource, btCustomTickers, setBtCustomTickers,
    btUniverseLimit, setBtUniverseLimit,
    btUniverseListName, setBtUniverseListName,
    btEditingListId, setBtEditingListId,
    btOptionsOpen, setBtOptionsOpen, btUniverseOpen, setBtUniverseOpen,
    btAllocationMode, setBtAllocationMode,
    mktFilterEnabled, setMktFilterEnabled,
    mktFilterTicker, setMktFilterTicker,
    mktFilterTf, setMktFilterTf,
    mktFilterInd, setMktFilterInd,
    mktFilterPeriod, setMktFilterPeriod,
    mktFilterOp, setMktFilterOp,
    mktFilterVal, setMktFilterVal,
    mktFilterRules, setMktFilterRules,
    savedBtPresets, setSavedBtPresets,
    btPresetName, setBtPresetName,
    selectedBtPresetId, setSelectedBtPresetId,
  } = backtestState;

  const dataCacheRef = useRef({});
  const btAbortRef = useRef(null);
  const btWarmAbortRef = useRef(null);
  const [btWarming, setBtWarming] = useState(false);
  const [btWarmProgress, setBtWarmProgress] = useState(null);
  const [btWarmEstimate, setBtWarmEstimate] = useState(null);
  const [btRunGuardDismissedKey, setBtRunGuardDismissedKey] = useState('');
  const [dataCacheStatus, setDataCacheStatus] = useState(null);
  const [dataCacheBusy, setDataCacheBusy] = useState(false);

  // ── Scan completion tracking ──────────────────────────────────────────────
  const [scanMeta, setScanMeta] = useState(null);
  const prevScanningForMetaRef = useRef(false);
  const prevScanningForChartRef = useRef(false);
  useEffect(()=>{
    if(prevScanningForMetaRef.current && !scanning && results.length > 0){
      const passed = results.filter(r=>r.passed).length;
      const errors = results.filter(r=>r.err).length;
      setScanMeta({ total:results.length, passed, direction:scanDirection, preset, ts:Date.now() });
      if(results.length >= 50) sendScanCompleteNotification({ passed, total:results.length, errors });
    }
    prevScanningForMetaRef.current = scanning;
  }, [scanning, results, scanDirection, preset]);

  // ── Server health check ───────────────────────────────────────────────────
  useEffect(()=>{
    fetch('/api/chart/AAPL?interval=1d&range=5d')
      .then(r=>r.json())
      .then(d=>setServerOk(!!(d?.chart?.result?.[0]?.timestamp)))
      .catch(()=>setServerOk(false));
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const tickers    = useMemo(()=>parseTickersText(tText), [tText]);
  const tCount     = tickers.length;
  const pfManualList = useMemo(()=>parsePortfolioManualTickers(pfManualTickers), [pfManualTickers]);
  const passN      = useMemo(()=>results.filter(r=>r.passed).length, [results]);
  const errN       = useMemo(()=>results.filter(r=>r.err).length, [results]);

  const sorted = useMemo(()=>[...results].sort((a,b)=>{
    const d=sortD;
    if(sortK==='ticker')    return a.ticker.localeCompare(b.ticker)*d;
    if(sortK==='price')     return ((a.price||0)-(b.price||0))*d;
    if(sortK==='status')    return (a.passed===b.passed?0:a.passed?-1:1)*d;
    if(sortK==='direction') return ((a.directionSort||0)-(b.directionSort||0))*d;
    if(sortK==='score')     return ((a.signalScore||0)-(b.signalScore||0))*d;
    if(sortK.startsWith('f')){ const i=+sortK.slice(1); return ((a.fRes[i]?.val ?? -1e9)-(b.fRes[i]?.val ?? -1e9))*d; }
    return 0;
  }), [results,sortK,sortD]);

  const shown = useMemo(()=>{
    const srch=search.trim().toUpperCase();
    let rows=onlyPass?sorted.filter(r=>r.passed):sorted;
    if(srch) rows=rows.filter(r=>r.ticker.includes(srch)||(r.name||'').toUpperCase().includes(srch));
    return rows;
  }, [sorted,onlyPass,search]);

  // ── Stable callbacks ──────────────────────────────────────────────────────
  const addLog      = useCallback((msg)=>appendLog(logRef,setLogLines,msg), []);
  const pickPreset  = useMemo(()=>createPresetPicker({
    setPreset,setTText,setUniverseIds,
    getUniverseIds:()=>universeIds,
    getSavedUniverseLists:()=>savedUniverseLists,
    setFetchingAll,
    addLog,
  }), [universeIds,savedUniverseLists,addLog]);
  const fetchSectors= useCallback(async(tickers)=>fetchMissingSectors(tickers,sectorData,setSectorData), [sectorData]);
  const fetchAllTickers = useCallback(()=>fetchAllTickersAction({setFetchingAll,setTText,setPreset,setUniverseIds,addLog}), [addLog]);

  const collectScannerPreset = useCallback(()=>({
    preset,universeIds,tText,scanDirection,filters,shortFilters,conc,minHistoryYears,
  }), [preset,universeIds,tText,scanDirection,filters,shortFilters,conc,minHistoryYears]);

  const applyScannerPresetConfig = useCallback((cfg={})=>{
    if(cfg.preset) setPreset(cfg.preset);
    if(Array.isArray(cfg.universeIds)) setUniverseIds(cfg.universeIds);
    if(cfg.tText!=null) setTText(String(cfg.tText||''));
    if(cfg.scanDirection) setScanDirection(cfg.scanDirection);
    if(Array.isArray(cfg.filters)) setFilters(cfg.filters);
    if(Array.isArray(cfg.shortFilters)) setShortFilters(cfg.shortFilters);
    if(cfg.conc!=null) setConc(Number(cfg.conc)||16);
    if(cfg.minHistoryYears!=null) setMinHistoryYears(Number(cfg.minHistoryYears)||0);
    setResults([]);
    setSearch('');
  }, []);

  const saveScannerPreset = useCallback(()=>{
    const name=(scanPresetName||'').trim();
    if(!name) return notify({type:'warning',title:'Preset Scanner',message:'Escribe un nombre para guardar el preset.'});
    const item={id:selectedScanPresetId||String(Date.now()),name,updatedAt:Date.now(),config:collectScannerPreset()};
    setSavedScanPresets(prev=>{
      const arr=Array.isArray(prev)?prev:[];
      const idx=arr.findIndex(x=>x.id===item.id);
      const next=[...arr];
      if(idx>=0) next[idx]=item; else next.unshift(item);
      return next.slice(0,40);
    });
    setSelectedScanPresetId(item.id);
    notify({type:'success',title:'Preset guardado',message:'La configuración del scanner quedó guardada.'});
  }, [scanPresetName,selectedScanPresetId,collectScannerPreset,notify]);

  const loadScannerPreset = useCallback(()=>{
    const item=(savedScanPresets||[]).find(x=>x.id===selectedScanPresetId);
    if(!item) return notify({type:'warning',title:'Preset Scanner',message:'Selecciona un preset para cargar.'});
    applyScannerPresetConfig(item.config||{});
    setScanPresetName(item.name||'');
    notify({type:'success',title:'Preset cargado',message:'La configuración del scanner fue aplicada.'});
  }, [savedScanPresets,selectedScanPresetId,applyScannerPresetConfig,notify]);

  const deleteScannerPreset = useCallback(()=>{
    if(!selectedScanPresetId) return notify({type:'warning',title:'Preset Scanner',message:'Selecciona un preset para eliminar.'});
    setSavedScanPresets(prev=>(Array.isArray(prev)?prev:[]).filter(x=>x.id!==selectedScanPresetId));
    setSelectedScanPresetId('');
    setScanPresetName('');
    notify({type:'success',title:'Preset eliminado',message:'El preset de scanner fue eliminado.'});
  }, [selectedScanPresetId,notify]);

  const exportScannerPresets = useCallback(()=>{
    const items=Array.isArray(savedScanPresets)?savedScanPresets:[];
    if(!items.length) return notify({type:'warning',title:'Presets Scanner',message:'No hay presets guardados para exportar.'});
    const payload={type:'radar-onix-scanner-presets',version:1,exportedAt:new Date().toISOString(),presets:items};
    const b=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(b);
    a.download='radar_onix_scanner_presets_'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }, [savedScanPresets,notify]);

  const importScannerPresets = useCallback(async(file)=>{
    if(!file) return;
    try{
      const txt=await file.text();
      const json=JSON.parse(txt);
      const incoming=Array.isArray(json) ? json : Array.isArray(json?.presets) ? json.presets : json?.config ? [json] : [];
      const clean=incoming.filter(p=>p&&p.config&&typeof p.config==='object').map((p,i)=>({
        id:String(p.id||Date.now()+'_'+i),
        name:String(p.name||('Preset importado '+(i+1))).trim(),
        updatedAt:Number(p.updatedAt)||Date.now(),
        config:p.config,
      }));
      if(!clean.length) return notify({type:'warning',title:'Importar presets',message:'El archivo no contiene presets validos.'});
      setSavedScanPresets(prev=>{
        const map=new Map((Array.isArray(prev)?prev:[]).map(p=>[p.id,p]));
        clean.forEach(p=>map.set(p.id,p));
        return Array.from(map.values()).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,40);
      });
      notify({type:'success',title:'Presets importados',message:'Se importaron '+clean.length+' preset(s) de Scanner.'});
    }catch(e){ notify({type:'error',title:'Error importando presets',message:e?.message||'Archivo invalido'}); }
  }, [notify]);
  const upF         = useCallback((id,patch,side='long')=>updateFilterBySide({side,id,patch,setFilters,setShortFilters}), []);
  const rmF         = useCallback((id,side='long')=>removeFilterBySide({side,id,setFilters,setShortFilters}), []);
  const stopScan    = useCallback(()=>{
    // If a scanner result chart is open while the scan is aborted, stale result
    // updates can race with the modal and leave the UI in a bad state. Close only
    // charts opened from Scanner results; Portfolio/Backtest charts remain intact.
    setSelectedChart(prev => prev?.source === 'Resultados' ? null : prev);
    stopScanAction(abortRef,setScanning);
  }, []);

  useEffect(()=>{
    const wasScanning = prevScanningForChartRef.current;
    if(wasScanning && !scanning){
      setSelectedChart(prev => prev?.source === 'Resultados' ? null : prev);
    }
    prevScanningForChartRef.current = scanning;
  }, [scanning]);
  const doSort      = useMemo(()=>createScannerSortHandler(sortK,setSortK,setSortD), [sortK]);
  const exportCSV   = useMemo(()=>createScannerExportHandler(exportScanCsv,shown,filters,INDICATORS), [shown,filters]);

  useEffect(()=>{ savePortfolioWatchlistsToStorage(pfWatchlists); }, [pfWatchlists]);

  // Portfolio watchlist CRUD
  const portfolioWatchlistActions = useMemo(()=>createPortfolioWatchlistActions({
    parsePortfolioManualTickers, setPfWatchlists, setPfSelectedWatchlistId, setPfWatchlistName,
    setPfManualTickers, setPfUniverseSource, pfWatchlists
  }), [pfWatchlists]);

  const saveCurrentManualWatchlist = useCallback(()=>{
    const out=portfolioWatchlistActions.saveCurrentManualWatchlist({pfManualTickers,pfWatchlistName,pfSelectedWatchlistId});
    if(!out.ok) notify({type:'warning',title:'Watchlist',message:out.message});
    else notify({type:'success',title:'Watchlist guardada',message:'Tu lista de acciones quedó guardada.'});
  }, [portfolioWatchlistActions,pfManualTickers,pfWatchlistName,pfSelectedWatchlistId,notify]);

  const loadSelectedManualWatchlist = useCallback(()=>{
    portfolioWatchlistActions.loadSelectedManualWatchlist(pfSelectedWatchlistId);
  }, [portfolioWatchlistActions,pfSelectedWatchlistId]);

  const deleteSelectedManualWatchlist = useCallback(()=>{
    portfolioWatchlistActions.deleteSelectedManualWatchlist(pfSelectedWatchlistId);
  }, [portfolioWatchlistActions,pfSelectedWatchlistId]);

  const importPortfolioCsvFile = useCallback(async(file)=>{
    if(!file) return;
    try{
      const txt=await file.text();
      const parsed=parsePortfolioCsvText(txt);
      if(!parsed) return notify({type:'warning',title:'CSV sin tickers',message:'No se encontraron tickers validos en el CSV.'});
      setPfManualTickers(parsed); setPfUniverseSource('manual');
      if(!pfWatchlistName) setPfWatchlistName(file.name.replace(/\.[^.]+$/,''));
      notify({type:'success',title:'CSV importado',message:'La lista manual fue actualizada con los tickers del archivo.'});
    }catch(e){ notify({type:'error',title:'Error leyendo CSV',message:'No pude leer el CSV: '+(e?.message||'error')}); }
  }, [pfWatchlistName,notify]);

  const exportCurrentManualCsv = useCallback(()=>{
    const result=exportManualWatchlistCsv(pfManualTickers,pfWatchlistName);
    if(!result.ok) notify({type:'warning',title:'Exportar CSV',message:result.message});
  }, [pfManualTickers,pfWatchlistName,notify]);

  const collectPortfolioPreset = useCallback(()=>({
    pfCapital,pfMinWeight,pfMaxWeight,pfMaxPos,pfRiskFree,
    pfCorFilter,pfCorThresh,pfMode,pfSims,
    pfStopType,pfStopATRMult,pfStopATRPeriod,pfStopPctVal,
    pfUniverseSource,pfManualTickers,pfPreset,
  }), [pfCapital,pfMinWeight,pfMaxWeight,pfMaxPos,pfRiskFree,pfCorFilter,pfCorThresh,pfMode,pfSims,pfStopType,pfStopATRMult,pfStopATRPeriod,pfStopPctVal,pfUniverseSource,pfManualTickers,pfPreset]);

  const applyPortfolioPresetConfig = useCallback((cfg={})=>{
    if(cfg.pfCapital!=null) setPfCapital(Number(cfg.pfCapital)||PF_DEFAULTS.capital);
    if(cfg.pfMinWeight!=null) setPfMinWeight(Number(cfg.pfMinWeight)||PF_DEFAULTS.minWeight);
    if(cfg.pfMaxWeight!=null) setPfMaxWeight(Number(cfg.pfMaxWeight)||PF_DEFAULTS.maxWeight);
    if(cfg.pfMaxPos!=null) setPfMaxPos(Number(cfg.pfMaxPos)||PF_DEFAULTS.maxPos);
    if(cfg.pfRiskFree!=null) setPfRiskFree(Number(cfg.pfRiskFree)||PF_DEFAULTS.riskFree);
    if(cfg.pfCorFilter!=null) setPfCorFilter(!!cfg.pfCorFilter);
    if(cfg.pfCorThresh!=null) setPfCorThresh(Number(cfg.pfCorThresh)||PF_DEFAULTS.corThresh);
    if(cfg.pfMode) setPfMode(cfg.pfMode);
    if(cfg.pfSims!=null) setPfSims(Number(cfg.pfSims)||PF_DEFAULTS.sims);
    if(cfg.pfStopType) setPfStopType(cfg.pfStopType);
    if(cfg.pfStopATRMult!=null) setPfStopATRMult(Number(cfg.pfStopATRMult)||PF_DEFAULTS.stopATRMult);
    if(cfg.pfStopATRPeriod!=null) setPfStopATRPeriod(Number(cfg.pfStopATRPeriod)||PF_DEFAULTS.stopATRPeriod);
    if(cfg.pfStopPctVal!=null) setPfStopPctVal(Number(cfg.pfStopPctVal)||PF_DEFAULTS.stopPctVal);
    if(cfg.pfUniverseSource) setPfUniverseSource(cfg.pfUniverseSource);
    if(cfg.pfManualTickers!=null) setPfManualTickers(String(cfg.pfManualTickers||''));
    if(cfg.pfPreset) setPfPreset(cfg.pfPreset);
    setPortfolio(null);
  }, [PF_DEFAULTS]);

  const savePortfolioPreset = useCallback(()=>{
    const name=(pfPresetName||'').trim();
    if(!name) return notify({type:'warning',title:'Preset Portafolio',message:'Escribe un nombre para guardar el preset.'});
    const item={id:selectedPfPresetId||String(Date.now()),name,updatedAt:Date.now(),config:collectPortfolioPreset()};
    setSavedPfPresets(prev=>{
      const arr=Array.isArray(prev)?prev:[];
      const idx=arr.findIndex(x=>x.id===item.id);
      const next=[...arr];
      if(idx>=0) next[idx]=item; else next.unshift(item);
      return next.slice(0,40);
    });
    setSelectedPfPresetId(item.id);
    notify({type:'success',title:'Preset guardado',message:'La configuración del portafolio quedó guardada.'});
  }, [pfPresetName,selectedPfPresetId,collectPortfolioPreset,notify]);

  const loadPortfolioPreset = useCallback(()=>{
    const item=(savedPfPresets||[]).find(x=>x.id===selectedPfPresetId);
    if(!item) return notify({type:'warning',title:'Preset Portafolio',message:'Selecciona un preset para cargar.'});
    applyPortfolioPresetConfig(item.config||{});
    setPfPresetName(item.name||'');
    notify({type:'success',title:'Preset cargado',message:'La configuración del portafolio fue aplicada.'});
  }, [savedPfPresets,selectedPfPresetId,applyPortfolioPresetConfig,notify]);

  const deletePortfolioPreset = useCallback(()=>{
    if(!selectedPfPresetId) return notify({type:'warning',title:'Preset Portafolio',message:'Selecciona un preset para eliminar.'});
    setSavedPfPresets(prev=>(Array.isArray(prev)?prev:[]).filter(x=>x.id!==selectedPfPresetId));
    setSelectedPfPresetId('');
    setPfPresetName('');
    notify({type:'success',title:'Preset eliminado',message:'El preset de portafolio fue eliminado.'});
  }, [selectedPfPresetId,notify]);

  const exportPortfolioPresets = useCallback(()=>{
    const items=Array.isArray(savedPfPresets)?savedPfPresets:[];
    if(!items.length) return notify({type:'warning',title:'Presets Portafolio',message:'No hay presets guardados para exportar.'});
    const payload={type:'radar-onix-portfolio-presets',version:1,exportedAt:new Date().toISOString(),presets:items};
    const b=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(b);
    a.download='radar_onix_portfolio_presets_'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }, [savedPfPresets,notify]);

  const importPortfolioPresets = useCallback(async(file)=>{
    if(!file) return;
    try{
      const txt=await file.text();
      const json=JSON.parse(txt);
      const incoming=Array.isArray(json) ? json : Array.isArray(json?.presets) ? json.presets : json?.config ? [json] : [];
      const clean=incoming.filter(p=>p&&p.config&&typeof p.config==='object').map((p,i)=>({
        id:String(p.id||Date.now()+'_'+i),
        name:String(p.name||('Preset importado '+(i+1))).trim(),
        updatedAt:Number(p.updatedAt)||Date.now(),
        config:p.config,
      }));
      if(!clean.length) return notify({type:'warning',title:'Importar presets',message:'El archivo no contiene presets validos.'});
      setSavedPfPresets(prev=>{
        const map=new Map((Array.isArray(prev)?prev:[]).map(p=>[p.id,p]));
        clean.forEach(p=>map.set(p.id,p));
        return Array.from(map.values()).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,40);
      });
      notify({type:'success',title:'Presets importados',message:'Se importaron '+clean.length+' preset(s) de Portafolio.'});
    }catch(e){ notify({type:'error',title:'Error importando presets',message:e?.message||'Archivo invalido'}); }
  }, [notify]);

  const collectBacktestPreset = useCallback(()=>({
    btWeeks,btCapital,btBenchmark,btDirection,
    entryRules,exitRules,shortEntryRules,shortExitRules,
    stopATR,stopATRMult,stopPct,stopPctVal,
    btCommission,btSlippage,
    btUniverseSource,btCustomTickers,btUniverseLimit,
    btAllocationMode,
    pfMaxPos,pfRiskFree,pfStopATRPeriod,pfMinWeight,pfMaxWeight,pfMode,
    mktFilterEnabled,mktFilterTicker,mktFilterTf,mktFilterInd,mktFilterPeriod,mktFilterOp,mktFilterVal,mktFilterRules,
  }), [btWeeks,btCapital,btBenchmark,btDirection,entryRules,exitRules,shortEntryRules,shortExitRules,stopATR,stopATRMult,stopPct,stopPctVal,btCommission,btSlippage,btUniverseSource,btCustomTickers,btUniverseLimit,btAllocationMode,pfMaxPos,pfRiskFree,pfStopATRPeriod,pfMinWeight,pfMaxWeight,pfMode,mktFilterEnabled,mktFilterTicker,mktFilterTf,mktFilterInd,mktFilterPeriod,mktFilterOp,mktFilterVal,mktFilterRules]);

  const saveBacktestPreset = useCallback(()=>{
    const name=(btPresetName||'').trim();
    if(!name) return notify({type:'warning',title:'Preset Backtest',message:'Escribe un nombre para guardar el preset.'});
    const item={id:selectedBtPresetId||String(Date.now()),name,updatedAt:Date.now(),config:collectBacktestPreset()};
    setSavedBtPresets(prev=>{
      const arr=Array.isArray(prev)?prev:[];
      const idx=arr.findIndex(x=>x.id===item.id);
      const next=[...arr];
      if(idx>=0) next[idx]=item; else next.unshift(item);
      return next.slice(0,40);
    });
    setSelectedBtPresetId(item.id);
    notify({type:'success',title:'Preset guardado',message:'La configuración del backtest quedó guardada.'});
  }, [btPresetName,selectedBtPresetId,collectBacktestPreset,notify]);

  const applyBacktestPresetConfig = useCallback((cfg={})=>{
    if(cfg.btWeeks!=null) setBtWeeks(Number(cfg.btWeeks)||208);
    if(cfg.btCapital!=null) setBtCapital(Number(cfg.btCapital)||1000000);
    if(cfg.btBenchmark) setBtBenchmark(cfg.btBenchmark);
    if(cfg.btDirection) setBtDirection(cfg.btDirection);
    if(Array.isArray(cfg.entryRules)) setEntryRules(cfg.entryRules);
    if(Array.isArray(cfg.exitRules)) setExitRules(cfg.exitRules);
    if(Array.isArray(cfg.shortEntryRules)) setShortEntryRules(cfg.shortEntryRules);
    if(Array.isArray(cfg.shortExitRules)) setShortExitRules(cfg.shortExitRules);
    if(cfg.stopATR!=null) setStopATR(!!cfg.stopATR);
    if(cfg.stopATRMult!=null) setStopATRMult(Number(cfg.stopATRMult)||2);
    if(cfg.stopPct!=null) setStopPct(!!cfg.stopPct);
    if(cfg.stopPctVal!=null) setStopPctVal(Number(cfg.stopPctVal)||8);
    if(cfg.btCommission!=null) setBtCommission(Number(cfg.btCommission)||0);
    if(cfg.btSlippage!=null) setBtSlippage(Number(cfg.btSlippage)||0);
    if(cfg.btUniverseSource) setBtUniverseSource(cfg.btUniverseSource);
    if(cfg.btCustomTickers!=null) setBtCustomTickers(String(cfg.btCustomTickers||''));
    if(cfg.btUniverseLimit!=null) setBtUniverseLimit(Number(cfg.btUniverseLimit)||0);
    if(cfg.btAllocationMode) setBtAllocationMode(cfg.btAllocationMode);
    if(cfg.pfMaxPos!=null) setPfMaxPos(Number(cfg.pfMaxPos)||20);
    if(cfg.pfRiskFree!=null) setPfRiskFree(Number(cfg.pfRiskFree)||5);
    if(cfg.pfStopATRPeriod!=null) setPfStopATRPeriod(Number(cfg.pfStopATRPeriod)||14);
    if(cfg.pfMinWeight!=null) setPfMinWeight(Number(cfg.pfMinWeight)||1);
    if(cfg.pfMaxWeight!=null) setPfMaxWeight(Number(cfg.pfMaxWeight)||25);
    if(cfg.pfMode) setPfMode(cfg.pfMode);
    if(cfg.mktFilterEnabled!=null) setMktFilterEnabled(!!cfg.mktFilterEnabled);
    if(cfg.mktFilterTicker) setMktFilterTicker(cfg.mktFilterTicker);
    if(cfg.mktFilterTf) setMktFilterTf(cfg.mktFilterTf);
    if(cfg.mktFilterInd) setMktFilterInd(cfg.mktFilterInd);
    if(cfg.mktFilterPeriod!=null) setMktFilterPeriod(Number(cfg.mktFilterPeriod)||30);
    if(cfg.mktFilterOp) setMktFilterOp(cfg.mktFilterOp);
    if(cfg.mktFilterVal!=null) setMktFilterVal(Number(cfg.mktFilterVal)||50);
    if(Array.isArray(cfg.mktFilterRules)) setMktFilterRules(cfg.mktFilterRules);
    setBacktest(null);
  }, []);

  const loadBacktestPreset = useCallback(()=>{
    const item=(savedBtPresets||[]).find(x=>x.id===selectedBtPresetId);
    if(!item) return notify({type:'warning',title:'Preset Backtest',message:'Selecciona un preset para cargar.'});
    applyBacktestPresetConfig(item.config||{});
    setBtPresetName(item.name||'');
    notify({type:'success',title:'Preset cargado',message:'La configuración del backtest fue aplicada.'});
  }, [savedBtPresets,selectedBtPresetId,applyBacktestPresetConfig,notify]);

  const deleteBacktestPreset = useCallback(()=>{
    if(!selectedBtPresetId) return notify({type:'warning',title:'Preset Backtest',message:'Selecciona un preset para eliminar.'});
    setSavedBtPresets(prev=>(Array.isArray(prev)?prev:[]).filter(x=>x.id!==selectedBtPresetId));
    setSelectedBtPresetId('');
    setBtPresetName('');
    notify({type:'success',title:'Preset eliminado',message:'El preset de backtest fue eliminado.'});
  }, [selectedBtPresetId,notify]);

  // Main workflow callbacks
  const runScan = useCallback(async()=>{
    return runScanWorkflow({
      scanning,tickers,filters,shortFilters,scanDirection,conc,minHistoryYears,
      abortRef,setScanning,setResults,setSearch,setOnlyPass,setProg,setTab,
      dataCacheRef,addLog,fetchSectors,fetchQuotes,setSectorData,
    });
  }, [scanning,tickers,filters,shortFilters,scanDirection,conc,minHistoryYears,fetchSectors,addLog]);

  const buildPortfolio = useCallback(async()=>{
    try{
      const out=await buildPortfolioWorkflow({
        results,filters,shortFilters,pfCapital,pfMinWeight,pfMaxWeight,pfMaxPos,pfRiskFree,
        pfCorFilter,pfCorThresh,pfMode,pfSims,pfStopType,pfStopATRMult,pfStopATRPeriod,pfStopPctVal,
        sectorData,scanDirection,pfUniverseSource,pfManualTickers,
        fetchSectors,dataCacheRef,setPfBuilding,setTab,setPortfolio,
      });
      if(out&&out.ok===false&&out.message){
        console.warn('buildPortfolio rejected:', out.message);
        notify({type:'warning',title:'Portafolio',message:out.message});
      }
      else if(out?.ok) notify({type:'success',title:'Portafolio listo',message:'La optimizacion termino correctamente.'});
      return out;
    }catch(e){ console.error('buildPortfolio fatal',e); notify({type:'error',title:'Error construyendo portafolio',message:e?.message||String(e)}); setPfBuilding(false); }
  }, [results,filters,shortFilters,pfCapital,pfMinWeight,pfMaxWeight,pfMaxPos,pfRiskFree,pfCorFilter,pfCorThresh,pfMode,pfSims,pfStopType,pfStopATRMult,pfStopATRPeriod,pfStopPctVal,sectorData,scanDirection,pfUniverseSource,pfManualTickers,fetchSectors,notify]);

  const refreshDataCacheStatus = useCallback(async({silent=false}={})=>{
    setDataCacheBusy(true);
    try{
      const stats=await fetch('/api/charts/cache/stats').then(r=>{
        if(!r.ok) throw new Error('HTTP '+r.status);
        return r.json();
      });
      setDataCacheStatus({...stats, ts:Date.now()});
      if(!silent) notify({type:'info',title:'Estado de datos',message:'Cache actualizado: '+(stats.disk?.files||0)+' archivos.'});
      return stats;
    }catch(e){
      if(!silent) notify({type:'error',title:'Error leyendo cache',message:e?.message||String(e)});
      return null;
    }finally{
      setDataCacheBusy(false);
    }
  }, [notify]);

  const pruneDataCache = useCallback(async()=>{
    setDataCacheBusy(true);
    try{
      const out=await fetch('/api/charts/cache/prune',{method:'POST'}).then(r=>{
        if(!r.ok) throw new Error('HTTP '+r.status);
        return r.json();
      });
      const stats={ok:true,memory:dataCacheStatus?.memory||{},disk:out.disk,pruned:out.pruned,ts:Date.now()};
      setDataCacheStatus(stats);
      notify({type:'success',title:'Cache limpiado',message:'Expirados eliminados: '+(out.pruned?.removed||0)+'.'});
      return out;
    }catch(e){
      notify({type:'error',title:'Error limpiando cache',message:e?.message||String(e)});
      return null;
    }finally{
      setDataCacheBusy(false);
    }
  }, [dataCacheStatus,notify]);

  const resolveBacktestUniverseTickers = useCallback(async()=>{
    const normalize = (list=[]) => [...new Set((list||[])
      .map(t=>String(t||'').trim().toUpperCase())
      .filter(t=>t&&/^[A-Z0-9.^=\-]+$/.test(t))
    )];
    let rawTickers = [];
    if(btUniverseSource === 'scan'){
      rawTickers = Object.keys(dataCacheRef.current||{}).filter(t=>!t.startsWith('__'));
    }else if(btUniverseSource === 'custom'){
      rawTickers = String(btCustomTickers||'').split(/[\s,;]+/);
    }else if(String(btUniverseSource||'').startsWith('LIST_')){
      const id=String(btUniverseSource).slice(5);
      rawTickers = (savedUniverseLists||[]).find(l=>l.id===id)?.tickers || [];
    }else{
      const presets=window.StockScannerConfig?.UNIVERSE_PRESETS || {};
      rawTickers = presets[btUniverseSource]?.tickers || [];
      if(btUniverseSource === 'GLOBAL_FULL_UNIVERSE'){
        try{
          const resp=await fetch('/api/tickers');
          const json=await resp.json();
          const allUs=Array.isArray(json?.tickers) ? json.tickers : [];
          rawTickers=[...rawTickers, ...allUs];
        }catch(e){}
      }
    }
    rawTickers = normalize(rawTickers);
    const limit=Math.max(0,Math.round(Number(btUniverseLimit)||0));
    if(limit>0&&rawTickers.length>limit) rawTickers=rawTickers.slice(0,limit);
    return rawTickers;
  }, [btUniverseSource,btCustomTickers,btUniverseLimit,savedUniverseLists]);

  const getBacktestRuleTimeframes = useCallback(()=>{
    const tfs=[...new Set([
      ...entryRules.flatMap(g=>g.conditions?.map(c=>c.tf)||[]),
      ...exitRules.flatMap(g=>g.conditions?.map(c=>c.tf)||[]),
      ...shortEntryRules.flatMap(g=>g.conditions?.map(c=>c.tf)||[]),
      ...shortExitRules.flatMap(g=>g.conditions?.map(c=>c.tf)||[]),
      ...(mktFilterRules||[]).flatMap(g=>g.conditions?.map(c=>c.tf)||[]),
      '1wk',
    ])].filter(Boolean);
    return tfs.length ? tfs : ['1wk'];
  }, [entryRules,exitRules,shortEntryRules,shortExitRules,mktFilterRules]);

  const estimateBacktestDataCache = useCallback(async({silent=false}={})=>{
    const startedAt=performance.now();
    try{
      const tickers=await resolveBacktestUniverseTickers();
      const tfs=getBacktestRuleTimeframes();
      const tfDefs=window.StockScannerConfig?.TIMEFRAMES || TIMEFRAMES;
      const tfMeta=Object.fromEntries((tfDefs||[]).map(tf=>[tf.id,tf]));
      const symbols=[...new Set([...tickers, btBenchmark].filter(Boolean))];
      const cacheKey=[btUniverseSource,btUniverseLimit||0,symbols.length,tfs.join(',')].join('|');
      if(!symbols.length){
        const empty={ok:false,tickers:0,tfs,total:0,cached:0,missing:0,checks:[],elapsedMs:Math.round(performance.now()-startedAt),cacheKey};
        setBtWarmEstimate(empty);
        if(!silent) notify({type:'warning',title:'Estimar datos',message:'No hay símbolos en el universo seleccionado.'});
        return empty;
      }
      const checks=[];
      for(const tf of tfs){
        const meta=tfMeta[tf]||tfMeta['1wk']||{};
        const resp=await fetch('/api/charts/cache/check',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({symbols,interval:meta.yahooInterval||'1wk',range:meta.yahooRange||'2y'}),
        });
        if(!resp.ok) throw new Error('HTTP '+resp.status);
        const json=await resp.json();
        checks.push({tf,interval:json.interval,range:json.range,count:json.count,cached:json.cached,memory:json.memory,disk:json.disk,missing:json.missing,missingSymbols:json.missingSymbols||[]});
      }
      const total=checks.reduce((a,c)=>a+c.count,0);
      const cached=checks.reduce((a,c)=>a+c.cached,0);
      const missing=checks.reduce((a,c)=>a+c.missing,0);
      const estimate={ok:true,tickers:symbols.length,tfs,total,cached,missing,memory:checks.reduce((a,c)=>a+c.memory,0),disk:checks.reduce((a,c)=>a+c.disk,0),checks,elapsedMs:Math.round(performance.now()-startedAt),estimatedRequests:checks.reduce((a,c)=>a+Math.ceil((c.missing||0)/(symbols.length>3000?400:symbols.length>900?350:250)),0),cacheKey};
      setBtWarmEstimate(estimate);
      if(!silent) notify({type:'info',title:'Estimacion de cache',message:'Cache: '+cached+'/'+total+'. Faltan: '+missing+'.'});
      return estimate;
    }catch(e){
      const estimate={ok:false,error:e?.message||String(e),elapsedMs:Math.round(performance.now()-startedAt)};
      setBtWarmEstimate(estimate);
      if(!silent) notify({type:'error',title:'Error estimando cache',message:estimate.error});
      return estimate;
    }
  }, [resolveBacktestUniverseTickers,getBacktestRuleTimeframes,btBenchmark,notify]);

  const warmBacktestData = useCallback(async()=>{
    if(btWarming) return;
    const ac=typeof AbortController!=='undefined'?new AbortController():null;
    btWarmAbortRef.current=ac;
    setBtWarming(true);
    const startedAt=performance.now();
    try{
      const tickers=await resolveBacktestUniverseTickers();
      if(tickers.length<1){
        notify({type:'warning',title:'Preparar datos',message:'No hay tickers en el universo seleccionado.'});
        return {ok:false,message:'Sin tickers'};
      }
      const tfs=getBacktestRuleTimeframes();
      const tfDefs=window.StockScannerConfig?.TIMEFRAMES || TIMEFRAMES;
      const tfMeta=Object.fromEntries((tfDefs||[]).map(tf=>[tf.id,tf]));
      const symbols=[...new Set([...tickers, btBenchmark].filter(Boolean))];
      const estimate=await estimateBacktestDataCache({silent:true});
      const missingByTf=new Map((estimate?.checks||[]).map(c=>[c.tf,c.missingSymbols||[]]));
      const chunkSize=symbols.length>3000?400:symbols.length>900?350:250;
      const totalSteps=Math.max(0,estimate?.ok ? estimate.missing : symbols.length*tfs.length);
      let done=0;
      let failed=0;
      let requests=0;
      let skipped=estimate?.ok ? estimate.cached : 0;
      setBtWarmProgress({phase:totalSteps?'Preparando faltantes':'Cache ya listo',stage:totalSteps?'warm':'done',done:0,total:totalSteps,pct:totalSteps?0:100,tickers:symbols.length,tfs,failed,requests,skipped,elapsedMs:0,estimate});
      if(totalSteps<=0){
        const elapsedMs=Math.round(performance.now()-startedAt);
        setBtWarmProgress({phase:'Cache ya listo',stage:'done',done:0,total:0,pct:100,tickers:symbols.length,tfs,failed,requests,skipped,elapsedMs,estimate});
        notify({type:'success',title:'Datos preparados',message:'Todo el universo ya estaba en cache: '+symbols.length+' símbolos.'});
        return {ok:true,tickers:symbols.length,tfs,failed,requests,skipped,elapsedMs,estimate};
      }
      for(const tf of tfs){
        const meta=tfMeta[tf]||tfMeta['1wk']||{};
        const tfSymbols=(missingByTf.get(tf)||symbols);
        for(let i=0;i<tfSymbols.length;i+=chunkSize){
          if(ac?.signal?.aborted) throw Object.assign(new Error('Preparacion cancelada'),{name:'AbortError'});
          const batch=tfSymbols.slice(i,i+chunkSize);
          if(!batch.length) continue;
          const resp=await fetch('/api/charts',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({symbols:batch,interval:meta.yahooInterval||'1wk',range:meta.yahooRange||'2y',concurrency:tfs.length>2?18:34}),
            signal:ac?.signal||undefined,
          });
          if(!resp.ok) throw new Error('HTTP '+resp.status);
          const json=await resp.json();
          requests++;
          const results=json?.results||{};
          failed+=Object.values(results).filter(v=>v?.ok===false||v?.error).length;
          done+=batch.length;
          const pct=Math.round((done/Math.max(1,totalSteps))*100);
          setBtWarmProgress({phase:'Preparando faltantes '+tf,stage:'warm',done,total:totalSteps,pct,tickers:symbols.length,tfs,failed,requests,skipped,current:batch[batch.length-1],elapsedMs:Math.round(performance.now()-startedAt),estimate});
          await new Promise(resolve=>setTimeout(resolve,0));
        }
      }
      let stats=null;
      try{ stats=await fetch('/api/charts/cache/stats').then(r=>r.json()); }catch(e){}
      if(stats?.ok) setDataCacheStatus({...stats, ts:Date.now()});
      const elapsedMs=Math.round(performance.now()-startedAt);
      const finalEstimate=await estimateBacktestDataCache({silent:true});
      setBtWarmProgress({phase:'Cache listo',stage:'done',done:totalSteps,total:totalSteps,pct:100,tickers:symbols.length,tfs,failed,requests,skipped,elapsedMs,stats,estimate:finalEstimate});
      notify({type:'success',title:'Datos preparados',message:'Cache listo para '+symbols.length+' símbolos en '+(elapsedMs/1000).toFixed(1)+'s. Faltantes descargados: '+totalSteps+'. Fallos: '+failed+'.'});
      return {ok:true,tickers:symbols.length,tfs,failed,requests,skipped,elapsedMs,stats,estimate:finalEstimate};
    }catch(e){
      if(e?.name==='AbortError'){
        setBtWarmProgress(prev=>({...prev,phase:'Preparacion cancelada',cancelled:true}));
        notify({type:'warning',title:'Preparar datos',message:'Se cancelo el calentamiento de cache.'});
        return {ok:false,cancelled:true};
      }
      console.error('warmBacktestData fatal',e);
      setBtWarmProgress(prev=>({...prev,phase:'Error preparando cache',error:true,message:e?.message||String(e)}));
      notify({type:'error',title:'Error preparando datos',message:e?.message||String(e)});
      return {ok:false,message:e?.message||String(e)};
    }finally{
      setBtWarming(false);
      if(btWarmAbortRef.current===ac) btWarmAbortRef.current=null;
    }
  }, [btWarming,resolveBacktestUniverseTickers,getBacktestRuleTimeframes,estimateBacktestDataCache,btBenchmark,notify]);

  const cancelBtWarmData = useCallback(()=>{
    if(btWarmAbortRef.current){
      btWarmAbortRef.current.abort();
      setBtWarmProgress(prev=>({...prev,phase:'Cancelando preparacion',cancelled:true}));
    }
  }, []);

  const runBacktest = useCallback(async()=>{
    const guardUniverse=await resolveBacktestUniverseTickers();
    const guardTfs=getBacktestRuleTimeframes();
    const guardSymbolsCount=Math.max(guardUniverse.length, btBenchmark ? guardUniverse.includes(btBenchmark) ? guardUniverse.length : guardUniverse.length+1 : guardUniverse.length);
    const guardKey=[btUniverseSource,btUniverseLimit||0,guardSymbolsCount,guardTfs.join(',')].join('|');
    const estOk=btWarmEstimate?.ok && btWarmEstimate.cacheKey===guardKey;
    const totalWork=(estOk ? btWarmEstimate.total : guardUniverse.length*guardTfs.length);
    const missingWork=estOk ? btWarmEstimate.missing : totalWork;
    const cachePct=totalWork>0 ? 1-(missingWork/totalWork) : 1;
    const needsGuard=guardUniverse.length>=1500 && cachePct<0.7 && btRunGuardDismissedKey!==guardKey;
    if(needsGuard){
      const est=estOk ? btWarmEstimate : await estimateBacktestDataCache({silent:true});
      const t=est?.total||totalWork;
      const m=est?.missing ?? missingWork;
      const pct=t>0 ? Math.round(((t-m)/t)*100) : 0;
      setBtRunGuardDismissedKey(guardKey);
      notify({
        type:'warning',
        title:'Prepara datos antes',
        message:'Este universo tiene '+guardUniverse.length+' símbolos y el cache esta al '+pct+'%. Pulsa Preparar datos para evitar esperas largas. Si quieres lanzarlo igual, vuelve a pulsar Ejecutar Backtest.',
        timeout:11000,
      });
      return {ok:false,guarded:true,message:'Cache incompleto para universo grande'};
    }
    const ac=typeof AbortController!=='undefined'?new AbortController():null;
    btAbortRef.current=ac;
    try{
      const out=await runBacktestWorkflow({
        entryRules,exitRules,shortEntryRules,shortExitRules,btDirection,
        stopATR,stopATRMult,stopPct,stopPctVal,
        btWeeks,btCapital,pfMaxPos,pfRiskFree,btBenchmark,btCommission,btSlippage,
        pfStopATRPeriod,pfMinWeight,pfMaxWeight,pfMode,btAllocationMode,
        btUniverseSource,btCustomTickers,btUniverseLimit,
        savedUniverseLists,
        mktFilterEnabled,mktFilterTicker,mktFilterTf,
        mktFilterInd,mktFilterPeriod,mktFilterOp,mktFilterVal,mktFilterRules,
        savedStrategiesLength:savedStrategies.length, dataCacheRef,
        abortSignal:ac?.signal||null,
        setBtRunning,setBtProgress,setTab,setBacktest,
      });
      if(out&&out.ok===false&&out.message) notify({type:'warning',title:'Backtest',message:out.message});
      else if(out?.ok) {
        const secs = out.perf?.totalMs ? (out.perf.totalMs/1000).toFixed(1) : null;
        const ls = out.perf?.loadStats;
        const loadLine = ls ? ' Cargadas: '+ls.loaded+'/'+ls.unique+', sin datos: '+ls.failed+', insuficientes: '+ls.insufficient+'.' : '';
        const memoryLine = out.perf?.lightMemory ? ' Modo memoria ligera activo.' : '';
        if((out.perf?.validTrades||0)===0){
          notify({type:'warning',title:'Backtest sin operaciones',message:(secs ? 'La simulación termino en '+secs+'s, pero no ejecutó trades.' : 'La simulación termino, pero no ejecutó trades.')+loadLine});
        }else{
          notify({type:'success',title:'Backtest listo',message:(secs ? 'La simulación termino correctamente en '+secs+'s.' : 'La simulación termino correctamente.')+loadLine+memoryLine});
        }
      }
      return out;
    }catch(e){
      if(e?.name==='AbortError'){
        setBacktest(prev=>({
          ...(prev||{}),
          status:'cancelled',
          message:'La simulación fue cancelada por el usuario.',
          equityCurve:prev?.equityCurve||[],
          weeklyLog:prev?.weeklyLog||[],
          allTrades:prev?.allTrades||[],
          timestamp:Date.now(),
        }));
        notify({type:'warning',title:'Backtest cancelado',message:'La simulación se detuvo sin bloquear la app.'});
        setBtRunning(false); setBtProgress({phase:'Cancelado',done:0,total:0,pct:0,cancelled:true});
        return {ok:false,cancelled:true,message:'Backtest cancelado'};
      }
      console.error('runBacktest fatal',e);
      setBacktest(prev=>({
        ...(prev||{}),
        status:'error',
        message:e?.message||String(e),
        equityCurve:prev?.equityCurve||[],
        weeklyLog:prev?.weeklyLog||[],
        allTrades:prev?.allTrades||[],
        timestamp:Date.now(),
      }));
      notify({type:'error',title:'Error ejecutando backtest',message:e?.message||String(e)}); setBtRunning(false); setBtProgress({phase:'Error',done:0,total:0,pct:0,error:true});
    }finally{
      if(btAbortRef.current===ac) btAbortRef.current=null;
    }
  }, [entryRules,exitRules,shortEntryRules,shortExitRules,btDirection,stopATR,stopATRMult,stopPct,stopPctVal,btWeeks,btCapital,pfMaxPos,pfRiskFree,btBenchmark,btCommission,btSlippage,pfStopATRPeriod,pfMinWeight,pfMaxWeight,pfMode,btAllocationMode,btUniverseSource,btCustomTickers,btUniverseLimit,savedUniverseLists,mktFilterEnabled,mktFilterTicker,mktFilterTf,mktFilterInd,mktFilterPeriod,mktFilterOp,mktFilterVal,mktFilterRules,savedStrategies.length,notify,resolveBacktestUniverseTickers,getBacktestRuleTimeframes,btWarmEstimate,btRunGuardDismissedKey,estimateBacktestDataCache]);

  const cancelBacktest = useCallback(()=>{
    if(btAbortRef.current){
      btAbortRef.current.abort();
      setBtProgress(prev=>({...prev,phase:'Cancelando backtest',cancelled:true}));
      notify({type:'warning',title:'Backtest',message:'Cancelando backtest...'});
    }
  }, [notify]);

  // ── Single context object passed to all tab renderers ─────────────────────
  // Each tab destructures only the props it needs — no duplication, no useMemo
  // overhead for simple object construction.
  const appCtx = {
    // UI shared
    tab, S, tfColor, INDICATORS, TIMEFRAMES, DIR_OPTIONS, fmt, indLbl,
    newFilter, newCond, newGroup, setSelectedChart, serverOk,
    notify,
    // Scanner state
    preset, setPreset, universeIds, setUniverseIds, tText, setTText, scanDirection, setScanDirection,
    filters, setFilters, shortFilters, setShortFilters,
    results, scanning, prog, sortK, setSortK, sortD, setSortD,
    onlyPass, setOnlyPass, search, setSearch, logLines, visRows, setVisRows,
    conc, setConc, fetchingAll, sectorData, minHistoryYears, setMinHistoryYears,
    savedFilterSets, setSavedFilterSets,
    savedScanPresets, setSavedScanPresets,
    scanPresetName, setScanPresetName, selectedScanPresetId, setSelectedScanPresetId,
    savedUniverseLists, setSavedUniverseLists,
    universeListName, setUniverseListName, selectedUniverseListId, setSelectedUniverseListId,
    filterSetName, setFilterSetName, selectedFilterSetId, setSelectedFilterSetId,
    // Scanner derived
    tickers, tCount, passN, errN, sorted, shown, doSort, exportCSV,
    // Scanner actions
    pickPreset, fetchAllTickers, upF, rmF, stopScan, runScan, addLog,
    saveFilterSetAction, loadFilterSetAction, deleteFilterSetAction,
    saveScannerPreset, loadScannerPreset, deleteScannerPreset,
    exportScannerPresets, importScannerPresets,
    requestNotificationPermission,
    // Portfolio state
    portfolio, pfCapital, setPfCapital, pfMinWeight, setPfMinWeight, pfMaxWeight, setPfMaxWeight,
    pfMaxPos, setPfMaxPos, pfRiskFree, setPfRiskFree,
    pfCorFilter, setPfCorFilter, pfCorThresh, setPfCorThresh,
    pfMode, setPfMode, pfSims, setPfSims,
    pfStopType, setPfStopType, pfStopATRMult, setPfStopATRMult, pfStopATRPeriod, setPfStopATRPeriod, pfStopPctVal, setPfStopPctVal,
    pfUniverseSource, setPfUniverseSource, pfManualTickers, setPfManualTickers,
    pfWatchlists, pfWatchlistName, setPfWatchlistName,
    pfSelectedWatchlistId, setPfSelectedWatchlistId, pfBuilding, pfConfigOpen, setPfConfigOpen, pfManualOpen, setPfManualOpen,
    pfPreset, setPfPreset,
    savedPfPresets, setSavedPfPresets,
    pfPresetName, setPfPresetName,
    selectedPfPresetId, setSelectedPfPresetId,
    PF_DEFAULTS, pfCsvInputRef,
    pfManualList,
    // Portfolio actions
    buildPortfolio, saveCurrentManualWatchlist, loadSelectedManualWatchlist,
    deleteSelectedManualWatchlist, importPortfolioCsvFile, exportCurrentManualCsv,
    savePortfolioPreset, loadPortfolioPreset, deletePortfolioPreset,
    exportPortfolioPresets, importPortfolioPresets,
    portfolioWatchlistActions,
    // Backtest state
    backtest, btRunning, btProgress, btWeeks, setBtWeeks, btCapital, setBtCapital,
    btBenchmark, setBtBenchmark, btDirection, setBtDirection,
    stopATR, setStopATR, stopATRMult, setStopATRMult,
    stopPct, setStopPct, stopPctVal, setStopPctVal,
        btCommission, setBtCommission, btSlippage, setBtSlippage,
        btUniverseSource, setBtUniverseSource, btCustomTickers, setBtCustomTickers,
        btUniverseLimit, setBtUniverseLimit,
        btUniverseListName, setBtUniverseListName,
        btEditingListId, setBtEditingListId,
        btOptionsOpen, setBtOptionsOpen, btUniverseOpen, setBtUniverseOpen,
        btAllocationMode, setBtAllocationMode,
        mktFilterEnabled, setMktFilterEnabled,
    mktFilterTicker, setMktFilterTicker,
    mktFilterTf, setMktFilterTf,
    mktFilterInd, setMktFilterInd,
    mktFilterPeriod, setMktFilterPeriod,
    mktFilterOp, setMktFilterOp,
    mktFilterVal, setMktFilterVal,
    mktFilterRules, setMktFilterRules,
    savedBtPresets, setSavedBtPresets,
    btPresetName, setBtPresetName,
    selectedBtPresetId, setSelectedBtPresetId,
    entryRules, setEntryRules, exitRules, setExitRules,
    shortEntryRules, setShortEntryRules, shortExitRules, setShortExitRules,
    savedStrategies, scanMeta, dataCacheRef,
    // Backtest actions
    runBacktest, cancelBacktest, warmBacktestData, cancelBtWarmData, estimateBacktestDataCache,
    refreshDataCacheStatus, pruneDataCache, dataCacheStatus, dataCacheBusy,
    btWarming, btWarmProgress, btWarmEstimate,
    saveBacktestPreset, loadBacktestPreset, deleteBacktestPreset,
    savedStrategies, setSavedStrategies,
  };

  return (
    <div className="app-root workspace-shell">
      <SelectedChartLayer
        selectedChart={selectedChart} dataCacheRef={dataCacheRef}
        filters={filters} shortFilters={shortFilters}
        entryRules={entryRules} exitRules={exitRules}
        shortEntryRules={shortEntryRules} shortExitRules={shortExitRules}
        backtest={backtest} results={results} sectorData={sectorData}
        portfolio={portfolio}
        onClose={()=>setSelectedChart(null)}
      />
      <AppNotifications notices={notices} dismissNotice={dismissNotice} />
      <AppTabNav APP_TABS={APP_TABS} tab={tab} setTab={setTab} passN={passN} portfolio={portfolio} />
      <div className="workspace-body">
        <AppHeader tab={tab} />
        <main className="workspace-main" id="workspace-main">
          {renderScannerTabs(appCtx)}
          {renderPortfolioTab(appCtx)}
          {renderBacktestTab(appCtx)}
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
