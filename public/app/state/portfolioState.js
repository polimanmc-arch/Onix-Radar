(function(){
  function usePortfolioState(ReactRef){
    const { useState, useRef, useEffect } = ReactRef;
    const { DEFAULT_PORTFOLIO_MANUAL_TICKERS } = window.StockScannerState;
    const { loadPortfolioWatchlists } = window.StockScannerPortfolioIO;
    const PF_PRESETS_KEY = 'onix_portfolio_presets_v1';

    const PF_DEFAULTS = {
      capital: 1000000,
      minWeight: 1,
      maxWeight: 25,
      maxPos: 10,
      riskFree: 5,
      corFilter: true,
      corThresh: 0.80,
      mode: 'maxsharpe',
      sims: 30000,
      seed: 42,
      stopType: 'none',
      stopATRMult: 2,
      stopATRPeriod: 14,
      stopPctVal: 8,
      universeSource: 'scan',
      configOpen: true,
      manualOpen: true,
      preset: 'custom',
    };
    if (localStorage.getItem('onix_pf_risk_free_pct') === '4.5') localStorage.setItem('onix_pf_risk_free_pct', String(PF_DEFAULTS.riskFree));
    if (localStorage.getItem('onix_pf_mode') === 'minvol') localStorage.setItem('onix_pf_mode', PF_DEFAULTS.mode);
    const getNum = (key, fallback, opts = {}) => {
      const { min = null, max = null, disallowZero = false } = opts;
      const raw = localStorage.getItem(key);
      const v = Number(raw);
      if (!Number.isFinite(v)) return fallback;
      if (disallowZero && v === 0) return fallback;
      if (min != null && v < min) return fallback;
      if (max != null && v > max) return fallback;
      return v;
    };
    const getBool = (key, fallback) => { const v = localStorage.getItem(key); return v == null ? fallback : v === '1'; };
    const getStr = (key, fallback) => { const v = localStorage.getItem(key); return v == null || v === '' ? fallback : v; };
    const loadPfPresets = () => {
      try{
        const raw = localStorage.getItem(PF_PRESETS_KEY);
        const items = JSON.parse(raw || '[]');
        return Array.isArray(items) ? items : [];
      }catch{ return []; }
    };

    const [portfolio,setPortfolio] = useState(null);
    const [pfCapital,setPfCapital] = useState(() => getNum('onix_pf_capital', PF_DEFAULTS.capital, { min: 1, disallowZero: true }));
    const [pfMaxWeight,setPfMaxWeight] = useState(() => getNum('onix_pf_max_weight_pct', PF_DEFAULTS.maxWeight, { min: 1, max: 100, disallowZero: true }));
    const [pfMaxPos,setPfMaxPos] = useState(() => getNum('onix_pf_max_pos', PF_DEFAULTS.maxPos, { min: 2, max: 50, disallowZero: true }));
    const [pfRiskFree,setPfRiskFree] = useState(() => getNum('onix_pf_risk_free_pct', PF_DEFAULTS.riskFree, { min: 0, max: 100 }));
    const [pfCorFilter,setPfCorFilter] = useState(() => getBool('onix_pf_cor_filter', PF_DEFAULTS.corFilter));
    const [pfCorThresh,setPfCorThresh] = useState(() => getNum('onix_pf_cor_thresh', PF_DEFAULTS.corThresh, { min: 0.5, max: 0.99 }));
    const [pfMode,setPfMode] = useState(() => getStr('onix_pf_mode', PF_DEFAULTS.mode));
    const [pfSims,setPfSims] = useState(() => getNum('onix_pf_sims', PF_DEFAULTS.sims, { min: 1, max: 250000, disallowZero: true }));
    const [pfSeed,setPfSeed] = useState(() => getNum('onix_pf_seed', PF_DEFAULTS.seed, { min: 0, max: 2147483647 }));
    const [pfStopType,setPfStopType] = useState(() => getStr('onix_pf_stop_type', PF_DEFAULTS.stopType));
    const [pfStopATRMult,setPfStopATRMult] = useState(() => getNum('onix_pf_stop_atr_mult', PF_DEFAULTS.stopATRMult, { min: 0.5, max: 5 }));
    const [pfStopATRPeriod,setPfStopATRPeriod] = useState(() => getNum('onix_pf_stop_atr_period', PF_DEFAULTS.stopATRPeriod, { min: 1, max: 200, disallowZero: true }));
    const [pfStopPctVal,setPfStopPctVal] = useState(() => getNum('onix_pf_stop_pct_val', PF_DEFAULTS.stopPctVal, { min: 1, max: 50, disallowZero: true }));
    const [pfUniverseSource,setPfUniverseSource] = useState(() => getStr('onix_pf_universe_source', PF_DEFAULTS.universeSource));
    const [pfManualTickers,setPfManualTickers] = useState(DEFAULT_PORTFOLIO_MANUAL_TICKERS);
    const [pfWatchlists,setPfWatchlists] = useState(() => loadPortfolioWatchlists());
    const [pfWatchlistName,setPfWatchlistName] = useState('');
    const [pfSelectedWatchlistId,setPfSelectedWatchlistId] = useState('');
    const [pfBuilding,setPfBuilding] = useState(false);
    const [pfMinWeight,setPfMinWeight] = useState(() => getNum('onix_pf_min_weight_pct', PF_DEFAULTS.minWeight, { min: 0.5, max: 100, disallowZero: true }));
    const [pfConfigOpen,setPfConfigOpen] = useState(() => getBool('onix_pf_config_open', PF_DEFAULTS.configOpen));
    const [pfManualOpen,setPfManualOpen] = useState(() => getBool('onix_pf_manual_open', PF_DEFAULTS.manualOpen));
    const [pfPreset,setPfPreset] = useState(() => getStr('onix_pf_preset', PF_DEFAULTS.preset));
    const [savedPfPresets,setSavedPfPresets] = useState(() => loadPfPresets());
    const [pfPresetName,setPfPresetName] = useState('');
    const [selectedPfPresetId,setSelectedPfPresetId] = useState('');
    const pfCsvInputRef = useRef(null);

    useEffect(() => { localStorage.setItem('onix_pf_capital', String(pfCapital ?? PF_DEFAULTS.capital)); }, [pfCapital]);
    useEffect(() => { localStorage.setItem('onix_pf_min_weight_pct', String(pfMinWeight ?? PF_DEFAULTS.minWeight)); }, [pfMinWeight]);
    useEffect(() => { localStorage.setItem('onix_pf_max_weight_pct', String(pfMaxWeight ?? PF_DEFAULTS.maxWeight)); }, [pfMaxWeight]);
    useEffect(() => { localStorage.setItem('onix_pf_max_pos', String(pfMaxPos ?? PF_DEFAULTS.maxPos)); }, [pfMaxPos]);
    useEffect(() => { localStorage.setItem('onix_pf_risk_free_pct', String(pfRiskFree ?? PF_DEFAULTS.riskFree)); }, [pfRiskFree]);
    useEffect(() => { localStorage.setItem('onix_pf_cor_filter', pfCorFilter ? '1' : '0'); }, [pfCorFilter]);
    useEffect(() => { localStorage.setItem('onix_pf_cor_thresh', String(pfCorThresh ?? PF_DEFAULTS.corThresh)); }, [pfCorThresh]);
    useEffect(() => { localStorage.setItem('onix_pf_mode', pfMode || PF_DEFAULTS.mode); }, [pfMode]);
    useEffect(() => { localStorage.setItem('onix_pf_sims', String(pfSims ?? PF_DEFAULTS.sims)); }, [pfSims]);
    useEffect(() => { localStorage.setItem('onix_pf_seed', String(pfSeed ?? PF_DEFAULTS.seed)); }, [pfSeed]);
    useEffect(() => { localStorage.setItem('onix_pf_stop_type', pfStopType || PF_DEFAULTS.stopType); }, [pfStopType]);
    useEffect(() => { localStorage.setItem('onix_pf_stop_atr_mult', String(pfStopATRMult ?? PF_DEFAULTS.stopATRMult)); }, [pfStopATRMult]);
    useEffect(() => { localStorage.setItem('onix_pf_stop_atr_period', String(pfStopATRPeriod ?? PF_DEFAULTS.stopATRPeriod)); }, [pfStopATRPeriod]);
    useEffect(() => { localStorage.setItem('onix_pf_stop_pct_val', String(pfStopPctVal ?? PF_DEFAULTS.stopPctVal)); }, [pfStopPctVal]);
    useEffect(() => { localStorage.setItem('onix_pf_universe_source', pfUniverseSource || PF_DEFAULTS.universeSource); }, [pfUniverseSource]);
    useEffect(() => { localStorage.setItem('onix_pf_config_open', pfConfigOpen ? '1' : '0'); }, [pfConfigOpen]);
    useEffect(() => { localStorage.setItem('onix_pf_manual_open', pfManualOpen ? '1' : '0'); }, [pfManualOpen]);
    useEffect(() => { localStorage.setItem('onix_pf_preset', pfPreset || PF_DEFAULTS.preset); }, [pfPreset]);
    useEffect(() => { try{ localStorage.setItem(PF_PRESETS_KEY, JSON.stringify(savedPfPresets)); }catch{} }, [savedPfPresets]);
    useEffect(() => {
      if (!Number.isFinite(pfCapital) || pfCapital <= 0) setPfCapital(PF_DEFAULTS.capital);
      if (!Number.isFinite(pfMinWeight) || pfMinWeight <= 0) setPfMinWeight(PF_DEFAULTS.minWeight);
      if (!Number.isFinite(pfMaxWeight) || pfMaxWeight <= 0) setPfMaxWeight(PF_DEFAULTS.maxWeight);
      if (!Number.isFinite(pfMaxPos) || pfMaxPos < 2) setPfMaxPos(PF_DEFAULTS.maxPos);
      if (!Number.isFinite(pfRiskFree) || pfRiskFree < 0) setPfRiskFree(PF_DEFAULTS.riskFree);
      if (!Number.isFinite(pfCorThresh) || pfCorThresh < 0.5 || pfCorThresh > 0.99) setPfCorThresh(PF_DEFAULTS.corThresh);
      if (!Number.isFinite(pfSims) || pfSims < 1) setPfSims(PF_DEFAULTS.sims);
      if (!Number.isFinite(pfSeed) || pfSeed < 0) setPfSeed(PF_DEFAULTS.seed);
      if (!Number.isFinite(pfStopATRMult) || pfStopATRMult < 0.5) setPfStopATRMult(PF_DEFAULTS.stopATRMult);
      if (!Number.isFinite(pfStopATRPeriod) || pfStopATRPeriod < 1) setPfStopATRPeriod(PF_DEFAULTS.stopATRPeriod);
      if (!Number.isFinite(pfStopPctVal) || pfStopPctVal < 1) setPfStopPctVal(PF_DEFAULTS.stopPctVal);
    }, []);

    return {
      portfolio,setPortfolio,
      pfCapital,setPfCapital,
      pfMaxWeight,setPfMaxWeight,
      pfMaxPos,setPfMaxPos,
      pfRiskFree,setPfRiskFree,
      pfCorFilter,setPfCorFilter,
      pfCorThresh,setPfCorThresh,
      pfMode,setPfMode,
      pfSims,setPfSims,
      pfSeed,setPfSeed,
      pfStopType,setPfStopType,
      pfStopATRMult,setPfStopATRMult,
      pfStopATRPeriod,setPfStopATRPeriod,
      pfStopPctVal,setPfStopPctVal,
      pfUniverseSource,setPfUniverseSource,
      pfManualTickers,setPfManualTickers,
      pfWatchlists,setPfWatchlists,
      pfWatchlistName,setPfWatchlistName,
      pfSelectedWatchlistId,setPfSelectedWatchlistId,
      pfBuilding,setPfBuilding,
      pfMinWeight,setPfMinWeight,
      pfConfigOpen,setPfConfigOpen,
      pfManualOpen,setPfManualOpen,
      pfPreset,setPfPreset,
      savedPfPresets,setSavedPfPresets,
      pfPresetName,setPfPresetName,
      selectedPfPresetId,setSelectedPfPresetId,
      PF_DEFAULTS,
      pfCsvInputRef,
    };
  }

  window.StockScannerDomainState = Object.assign(window.StockScannerDomainState||{}, { usePortfolioState });
})();
