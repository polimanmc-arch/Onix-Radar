// startup-check.js
// Runs after all non-Babel scripts load. Validates that every namespace and
// key symbol expected by the UI layer is present. If something is missing it
// means the script load order in index.html is wrong — this surfaces the
// error explicitly instead of letting it fail silently at runtime.
(function(){
  const checks = [
    // Layer 1 — Config
    ['StockScannerConfig.TIMEFRAMES',    window.StockScannerConfig?.TIMEFRAMES],
    ['StockScannerConfig.INDICATORS',    window.StockScannerConfig?.INDICATORS],
    ['StockScannerConfig.SP500',         window.StockScannerConfig?.SP500],

    // Layer 2 — API
    ['StockScannerApi.fetchMissingSectors', window.StockScannerApi?.fetchMissingSectors],

    // Layer 3 — Core indicators (must precede engine)
    ['StockScannerCore.calcWMA',         window.StockScannerCore?.calcWMA],
    ['StockScannerCore.calcEMA',         window.StockScannerCore?.calcEMA],
    ['StockScannerCore.seriesRSI',       window.StockScannerCore?.seriesRSI],

    // Layer 3 — Core engine (must follow indicators)
    ['StockScannerCore.fetchTicker',               window.StockScannerCore?.fetchTicker],
    ['StockScannerCore.buildAlignedSignalMap',      window.StockScannerCore?.buildAlignedSignalMap],
    ['StockScannerCore.evalRuleGroupsDetailedAligned', window.StockScannerCore?.evalRuleGroupsDetailedAligned],

    // Layer 3 — Workflows (must follow engine)
    ['StockScannerCore.createRuleEvaluator',    window.StockScannerCore?.createRuleEvaluator],
    ['StockScannerCore.computeSignalPerformance', window.StockScannerCore?.computeSignalPerformance],
    ['StockScannerCore.evaluateAlert',          window.StockScannerCore?.evaluateAlert],
    ['StockScannerCore.runScanWorkflow',        window.StockScannerCore?.runScanWorkflow],
    ['StockScannerCore.runBacktestWorkflow',    window.StockScannerCore?.runBacktestWorkflow],
    ['StockScannerCore.buildPortfolioWorkflow', window.StockScannerCore?.buildPortfolioWorkflow],
    ['StockScannerCore.runWalkForward',         window.StockScannerCore?.runWalkForward],
    ['StockScannerCore.computeTearsheet',       window.StockScannerCore?.computeTearsheet],

    // Layer 4 — State (defaults.js must precede state hooks)
    ['StockScannerState.newFilter',              window.StockScannerState?.newFilter],
    ['StockScannerState.defaultLongFilters',     window.StockScannerState?.defaultLongFilters],
    ['StockScannerDomainState.useScannerState',  window.StockScannerDomainState?.useScannerState],
    ['StockScannerDomainState.usePortfolioState',window.StockScannerDomainState?.usePortfolioState],
    ['StockScannerDomainState.useBacktestState', window.StockScannerDomainState?.useBacktestState],

    // Layer 5 — Utils
    ['StockScannerPortfolioIO.parsePortfolioManualTickers', window.StockScannerPortfolioIO?.parsePortfolioManualTickers],
    ['StockScannerAppActions.parseTickersText',             window.StockScannerAppActions?.parseTickersText],
    ['StockScannerFormatters.fmt',                          window.StockScannerFormatters?.fmt],

    // Layer 6 — Controllers
    ['StockScannerControllers.createScannerSortHandler',   window.StockScannerControllers?.createScannerSortHandler],
    ['StockScannerControllers.createPortfolioWatchlistActions', window.StockScannerControllers?.createPortfolioWatchlistActions],

    // Layer 7 — UI shell + chart renderer (no JSX)
    ['StockScannerUI.UI_STYLES',     window.StockScannerUI?.UI_STYLES],
    ['StockScannerUI.TF_COLORS',     window.StockScannerUI?.TF_COLORS],
    ['StockScannerUI.ChartRenderer', window.StockScannerUI?.ChartRenderer],
    // Note: Babel-compiled symbols (AppTabNav, AppHeader, ChartModal, etc.)
    // are intentionally excluded — they load AFTER this check runs.
  ];

  const missing = checks.filter(([, val]) => !val).map(([name]) => name);

  if(missing.length){
    console.error(
      '[StockScanner] ❌ Script load order error — missing symbols:\n  ' + missing.join('\n  ') +
      '\n\nCheck the layer comments in index.html for the required load sequence.'
    );
  } else {
    console.log('[StockScanner] ✅ All core namespaces verified (' + checks.length + ' checks passed).');
  }
})();
