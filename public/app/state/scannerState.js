(function(){
  const SCAN_CONFIG_KEY = 'probus_scan_config_v1';
  const FILTER_SETS_KEY = 'probus_filter_sets_v1';
  const SCAN_RESULTS_PREFS_KEY = 'onix_scanner_results_prefs_v1';
  const SCAN_FILTERSET_PREFS_KEY = 'onix_scanner_filterset_prefs_v1';
  const SCAN_UNIVERSE_LISTS_KEY = 'onix_scanner_universe_lists_v1';
  const SCAN_PRESETS_KEY = 'onix_scanner_presets_v1';

  // Migrate from old key names if they exist
  (function migrate(){
    try{
      if(!localStorage.getItem(SCAN_CONFIG_KEY) && localStorage.getItem('stock_scanner_scan_config_v1'))
        localStorage.setItem(SCAN_CONFIG_KEY, localStorage.getItem('stock_scanner_scan_config_v1'));
      if(!localStorage.getItem(FILTER_SETS_KEY) && localStorage.getItem('stock_scanner_filter_sets_v1'))
        localStorage.setItem(FILTER_SETS_KEY, localStorage.getItem('stock_scanner_filter_sets_v1'));
    }catch{}
  })();

  function loadScanConfig(){
    try{ const raw=localStorage.getItem(SCAN_CONFIG_KEY); return JSON.parse(raw||'null'); }catch{ return null; }
  }

  function saveScanConfig(cfg){
    try{ localStorage.setItem(SCAN_CONFIG_KEY, JSON.stringify(cfg)); }catch{}
  }

  function loadFilterSets(){
    try{ const raw=localStorage.getItem(FILTER_SETS_KEY); const p=JSON.parse(raw||'[]'); return Array.isArray(p)?p:[]; }catch{ return []; }
  }

  function loadScannerUniverseLists(){
    try{ const raw=localStorage.getItem(SCAN_UNIVERSE_LISTS_KEY); const p=JSON.parse(raw||'[]'); return Array.isArray(p)?p:[]; }catch{ return []; }
  }

  function loadScannerPresets(){
    try{ const raw=localStorage.getItem(SCAN_PRESETS_KEY); const p=JSON.parse(raw||'[]'); return Array.isArray(p)?p:[]; }catch{ return []; }
  }

  function saveScannerUniverseLists(sets){
    try{ localStorage.setItem(SCAN_UNIVERSE_LISTS_KEY, JSON.stringify(sets)); }catch{}
  }

  function saveScannerPresets(sets){
    try{ localStorage.setItem(SCAN_PRESETS_KEY, JSON.stringify(sets)); }catch{}
  }

  function loadScanResultsPrefs(){
    try{ const raw=localStorage.getItem(SCAN_RESULTS_PREFS_KEY); return JSON.parse(raw||'null'); }catch{ return null; }
  }

  function saveScanResultsPrefs(prefs){
    try{ localStorage.setItem(SCAN_RESULTS_PREFS_KEY, JSON.stringify(prefs)); }catch{}
  }


  function loadScanFilterSetPrefs(){
    try{ const raw=localStorage.getItem(SCAN_FILTERSET_PREFS_KEY); return JSON.parse(raw||'null'); }catch{ return null; }
  }

  function saveScanFilterSetPrefs(prefs){
    try{ localStorage.setItem(SCAN_FILTERSET_PREFS_KEY, JSON.stringify(prefs)); }catch{}
  }

  function saveFilterSetsToStorage(sets){
    try{ localStorage.setItem(FILTER_SETS_KEY, JSON.stringify(sets)); }catch{}
  }

  function useScannerState(ReactRef){
    const { useState, useRef, useEffect } = ReactRef;
    const { SP500 } = window.StockScannerConfig;
    const { defaultLongFilters, defaultShortFilters } = window.StockScannerState;

    // Load persisted config once on mount; fall back to defaults for each field
    // so a partial or corrupt save doesn't break the app.
    const saved = loadScanConfig();
    const savedPrefs = loadScanResultsPrefs();
    const savedFilterSetPrefs = loadScanFilterSetPrefs();
    const filtersOk  = Array.isArray(saved?.filters)      && saved.filters.length > 0;
    const sFiltersOk = Array.isArray(saved?.shortFilters) && saved.shortFilters.length > 0;

    const initialUniverseIds = Array.isArray(saved?.universeIds) && saved.universeIds.length ? saved.universeIds : [saved?.preset || 'SP500'];
    const [preset,setPreset]               = useState(saved?.preset || initialUniverseIds[0] || 'SP500');
    const [universeIds,setUniverseIds]     = useState(initialUniverseIds);
    const [tText,setTText]                 = useState(saved?.tText  || SP500.join(', '));
    const [scanDirection,setScanDirection] = useState(saved?.scanDirection || 'long');
    const [filters,setFilters]             = useState(() => filtersOk  ? saved.filters      : defaultLongFilters());
    const [shortFilters,setShortFilters]   = useState(() => sFiltersOk ? saved.shortFilters : defaultShortFilters());
    const [conc,setConc]                   = useState(saved?.conc            || 16);
    const [minHistoryYears,setMinHistoryYears] = useState(saved?.minHistoryYears ?? 0);

    // Persist config whenever any of these values change
    useEffect(()=>{
      saveScanConfig({ preset, universeIds, tText, scanDirection, filters, shortFilters, conc, minHistoryYears });
    }, [preset, universeIds, tText, scanDirection, filters, shortFilters, conc, minHistoryYears]);

    const [results,setResults]       = useState([]);
    const [scanning,setScanning]     = useState(false);
    const [prog,setProg]             = useState({done:0,total:0,tick:'',errors:0});
    const [sortK,setSortK]           = useState(savedPrefs?.sortK || 'ticker');
    const [sortD,setSortD]           = useState(savedPrefs?.sortD === -1 ? -1 : 1);
    const [onlyPass,setOnlyPass]     = useState(savedPrefs?.onlyPass ?? true);
    const [search,setSearch]         = useState(savedPrefs?.search || '');
    const [logLines,setLogLines]     = useState([]);
    const [visRows,setVisRows]       = useState(Number.isFinite(savedPrefs?.visRows) && savedPrefs.visRows > 0 ? savedPrefs.visRows : 50);
    const [fetchingAll,setFetchingAll] = useState(false);
    const [sectorData,setSectorData] = useState({});
    const [savedFilterSets,setSavedFilterSets] = useState(() => loadFilterSets());
    const [savedUniverseLists,setSavedUniverseLists] = useState(() => loadScannerUniverseLists());
    const [savedScanPresets,setSavedScanPresets] = useState(() => loadScannerPresets());
    const [scanPresetName,setScanPresetName] = useState('');
    const [selectedScanPresetId,setSelectedScanPresetId] = useState('');
    const [universeListName,setUniverseListName] = useState('');
    const [selectedUniverseListId,setSelectedUniverseListId] = useState('');
    const [filterSetName,setFilterSetName]           = useState(savedFilterSetPrefs?.filterSetName || '');
    const [selectedFilterSetId,setSelectedFilterSetId] = useState(savedFilterSetPrefs?.selectedFilterSetId || '');
    const abortRef = useRef(null);
    const logRef   = useRef([]);

    // Persist filter sets whenever they change
    useEffect(()=>{ saveFilterSetsToStorage(savedFilterSets); }, [savedFilterSets]);
    useEffect(()=>{ saveScannerUniverseLists(savedUniverseLists); }, [savedUniverseLists]);
    useEffect(()=>{ saveScannerPresets(savedScanPresets); }, [savedScanPresets]);

    // Persist scanner result-view preferences
    useEffect(()=>{
      saveScanResultsPrefs({ sortK, sortD, onlyPass, search, visRows });
    }, [sortK, sortD, onlyPass, search, visRows]);

    useEffect(()=>{
      saveScanFilterSetPrefs({ filterSetName, selectedFilterSetId });
    }, [filterSetName, selectedFilterSetId]);

    return {
      preset,setPreset,
      universeIds,setUniverseIds,
      tText,setTText,
      scanDirection,setScanDirection,
      filters,setFilters,
      shortFilters,setShortFilters,
      conc,setConc,
      minHistoryYears,setMinHistoryYears,
      results,setResults,
      scanning,setScanning,
      prog,setProg,
      sortK,setSortK,
      sortD,setSortD,
      onlyPass,setOnlyPass,
      search,setSearch,
      logLines,setLogLines,
      visRows,setVisRows,
      fetchingAll,setFetchingAll,
      sectorData,setSectorData,
      savedFilterSets,setSavedFilterSets,
      savedUniverseLists,setSavedUniverseLists,
      savedScanPresets,setSavedScanPresets,
      scanPresetName,setScanPresetName,
      selectedScanPresetId,setSelectedScanPresetId,
      universeListName,setUniverseListName,
      selectedUniverseListId,setSelectedUniverseListId,
      filterSetName,setFilterSetName,
      selectedFilterSetId,setSelectedFilterSetId,
      abortRef,logRef,
    };
  }

  window.StockScannerDomainState = Object.assign(window.StockScannerDomainState||{}, { useScannerState });
})();
