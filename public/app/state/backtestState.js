(function(){
  function useBacktestState(ReactRef){
    const { useEffect, useMemo, useState } = ReactRef;
    const {
      defaultEntryRules, defaultExitRules,
      defaultShortEntryRules, defaultShortExitRules,
      newCond,
    } = window.StockScannerState;

    const BT_CONFIG_KEY='onix_backtest_config_v1';
    const BT_PRESETS_KEY='onix_backtest_presets_v1';
    const loadConfig=()=>{
      try{
        const raw=localStorage.getItem(BT_CONFIG_KEY);
        const cfg=JSON.parse(raw||'null');
        return cfg&&typeof cfg==='object'?cfg:null;
      }catch{ return null; }
    };
    const clampNum=(v,fallback,min,max)=>{
      const n=Number(v);
      if(!Number.isFinite(n)) return fallback;
      return Math.max(min,Math.min(max,n));
    };
    const validRules=(rules,fallbackFn)=>Array.isArray(rules)&&rules.length?rules:fallbackFn();
    const loadPresets=()=>{
      try{
        const raw=localStorage.getItem(BT_PRESETS_KEY);
        const items=JSON.parse(raw||'[]');
        return Array.isArray(items)?items:[];
      }catch{ return []; }
    };
    const cfg=useMemo(loadConfig,[]);

    const [backtest,setBacktest] = useState(null);
    const [btRunning,setBtRunning] = useState(false);
    const [btProgress,setBtProgress] = useState({phase:'Listo',done:0,total:0,pct:0});
    const [btWeeks,setBtWeeks] = useState(() => clampNum(cfg?.btWeeks,208,4,520));
    const [btCapital,setBtCapital] = useState(() => clampNum(cfg?.btCapital,1000000,100,1000000000));
    const [btBenchmark,setBtBenchmark] = useState(() => cfg?.btBenchmark || 'SPY');
    const [savedStrategies, setSavedStrategies] = useState([]);
    const [entryRules,setEntryRules] = useState(() => validRules(cfg?.entryRules,defaultEntryRules));
    const [exitRules,setExitRules] = useState(() => validRules(cfg?.exitRules,defaultExitRules));
    const [stopATR,setStopATR] = useState(() => cfg?.stopATR == null ? true : !!cfg.stopATR);
    const [stopATRMult,setStopATRMult] = useState(() => clampNum(cfg?.stopATRMult,2,.1,20));
    const [stopPct,setStopPct] = useState(() => cfg?.stopPct == null ? false : !!cfg.stopPct);
    const [stopPctVal,setStopPctVal] = useState(() => clampNum(cfg?.stopPctVal,8,.1,95));
    const [btDirection,setBtDirection] = useState(() => ['long','short','both'].includes(cfg?.btDirection) ? cfg.btDirection : 'long');
    const [shortEntryRules,setShortEntryRules] = useState(() => validRules(cfg?.shortEntryRules,defaultShortEntryRules));
    const [shortExitRules,setShortExitRules] = useState(() => validRules(cfg?.shortExitRules,defaultShortExitRules));
    const [btCommission,setBtCommission] = useState(() => clampNum(cfg?.btCommission,0.1,0,10));
    const [btSlippage,setBtSlippage] = useState(() => clampNum(cfg?.btSlippage,0.05,0,20));
    const [btUniverseSource,setBtUniverseSource] = useState(() => cfg?.btUniverseSource || 'scan');
    const [btCustomTickers,setBtCustomTickers] = useState(() => cfg?.btCustomTickers || '');
    const [btUniverseLimit,setBtUniverseLimit] = useState(() => clampNum(cfg?.btUniverseLimit,1000,0,100000));
    const [btUniverseListName,setBtUniverseListName] = useState('');
    const [btEditingListId,setBtEditingListId] = useState('');
    const [btOptionsOpen,setBtOptionsOpen] = useState(() => cfg?.btOptionsOpen == null ? true : !!cfg.btOptionsOpen);
    const [btUniverseOpen,setBtUniverseOpen] = useState(() => cfg?.btUniverseOpen == null ? true : !!cfg.btUniverseOpen);
    const [btAllocationMode,setBtAllocationMode] = useState(() => ['equal','maxsharpe','minvol','maxret','portfolio'].includes(cfg?.btAllocationMode) ? cfg.btAllocationMode : 'equal'); // equal | maxsharpe | minvol | maxret | portfolio
    // ── Market regime filter ──────────────────────────────────────────────
    const [mktFilterEnabled,setMktFilterEnabled] = useState(() => !!cfg?.mktFilterEnabled);
    const [mktFilterTicker,setMktFilterTicker] = useState(() => cfg?.mktFilterTicker || 'SPY');
    const [mktFilterTf,setMktFilterTf] = useState(() => cfg?.mktFilterTf || '1wk');
    const [mktFilterInd,setMktFilterInd] = useState(() => cfg?.mktFilterInd || 'WMA');
    const [mktFilterPeriod,setMktFilterPeriod] = useState(() => clampNum(cfg?.mktFilterPeriod,30,1,500));
    const [mktFilterOp,setMktFilterOp] = useState(() => cfg?.mktFilterOp || 'price_above_ind'); // price_above_ind | price_below_ind | ind_above_val | ind_below_val
    const [mktFilterVal,setMktFilterVal] = useState(() => clampNum(cfg?.mktFilterVal,50,-1000000,1000000));
    const defaultMktFilterRules=() => [{
      _id:'mkt-regime-default',
      conditions:[{...newCond(),ind:'WMA',params:{p:30},tf:'1wk',op:'>',cmpType:'prev'}]
    }];
    const [mktFilterRules,setMktFilterRules] = useState(() => validRules(cfg?.mktFilterRules,defaultMktFilterRules));
    const [savedBtPresets,setSavedBtPresets] = useState(() => loadPresets());
    const [btPresetName,setBtPresetName] = useState('');
    const [selectedBtPresetId,setSelectedBtPresetId] = useState('');

    useEffect(()=>{
      const payload={
        btWeeks,btCapital,btBenchmark,
        entryRules,exitRules,shortEntryRules,shortExitRules,
        stopATR,stopATRMult,stopPct,stopPctVal,
        btDirection,btCommission,btSlippage,
        btUniverseSource,btCustomTickers,btUniverseLimit,
        btOptionsOpen,btUniverseOpen,btAllocationMode,
        mktFilterEnabled,mktFilterTicker,mktFilterTf,mktFilterInd,mktFilterPeriod,mktFilterOp,mktFilterVal,mktFilterRules,
      };
      try{ localStorage.setItem(BT_CONFIG_KEY,JSON.stringify(payload)); }catch{}
    }, [btWeeks,btCapital,btBenchmark,entryRules,exitRules,shortEntryRules,shortExitRules,stopATR,stopATRMult,stopPct,stopPctVal,btDirection,btCommission,btSlippage,btUniverseSource,btCustomTickers,btUniverseLimit,btOptionsOpen,btUniverseOpen,btAllocationMode,mktFilterEnabled,mktFilterTicker,mktFilterTf,mktFilterInd,mktFilterPeriod,mktFilterOp,mktFilterVal,mktFilterRules]);

    useEffect(()=>{
      try{ localStorage.setItem(BT_PRESETS_KEY,JSON.stringify(savedBtPresets)); }catch{}
    }, [savedBtPresets]);

    return {
      backtest,setBacktest,
      btRunning,setBtRunning,
      btProgress,setBtProgress,
      btWeeks,setBtWeeks,
      btCapital,setBtCapital,
      btBenchmark,setBtBenchmark,
      savedStrategies, setSavedStrategies,
      entryRules,setEntryRules,
      exitRules,setExitRules,
      stopATR,setStopATR,
      stopATRMult,setStopATRMult,
      stopPct,setStopPct,
      stopPctVal,setStopPctVal,
      btDirection,setBtDirection,
      shortEntryRules,setShortEntryRules,
      shortExitRules,setShortExitRules,
      btCommission,setBtCommission,
      btSlippage,setBtSlippage,
      btUniverseSource,setBtUniverseSource,
      btCustomTickers,setBtCustomTickers,
      btUniverseLimit,setBtUniverseLimit,
      btUniverseListName,setBtUniverseListName,
      btEditingListId,setBtEditingListId,
      btOptionsOpen,setBtOptionsOpen,
      btUniverseOpen,setBtUniverseOpen,
      btAllocationMode,setBtAllocationMode,
      mktFilterEnabled,setMktFilterEnabled,
      mktFilterTicker,setMktFilterTicker,
      mktFilterTf,setMktFilterTf,
      mktFilterInd,setMktFilterInd,
      mktFilterPeriod,setMktFilterPeriod,
      mktFilterOp,setMktFilterOp,
      mktFilterVal,setMktFilterVal,
      mktFilterRules,setMktFilterRules,
      savedBtPresets,setSavedBtPresets,
      btPresetName,setBtPresetName,
      selectedBtPresetId,setSelectedBtPresetId,
    };
  }

  window.StockScannerDomainState = Object.assign(window.StockScannerDomainState||{}, { useBacktestState });
})();
