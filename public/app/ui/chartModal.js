// chartModal.js - React wrapper around ChartRenderer with the redesigned
// header, indicator-pill toggles, "Evaluar reglas" switch, and bottom
// KPI cards for each filter indicator at the current timeframe. Candles +
// volume + oscillator rendering is delegated to ChartRenderer.
(function () {
  const { useState, useRef, useEffect, useLayoutEffect, useMemo } = React;
  const { TIMEFRAMES } = window.StockScannerConfig;
  const { fetchTicker, evalInd } = window.StockScannerCore;

  // Colors used by the indicator pills - one per filter, cycled if there are more
  // filters than colors. Keeps the pill dot visually distinct from its neighbors.
  const PILL_COLORS = [
    "var(--chart-pill-1)",
    "var(--chart-pill-2)",
    "var(--chart-pill-3)",
    "var(--chart-pill-4)",
    "var(--chart-pill-5)",
    "var(--chart-pill-6)",
    "var(--chart-pill-7)",
    "var(--chart-pill-8)",
  ];

  // indLbl - same as elsewhere in the app, kept local so the modal has no
  //    cross-file dependency beyond ChartRenderer.
  const INDICATORS = [
    { id: "WMA", label: "WMA (Ponderada)", param: 30 },
    { id: "SMA", label: "SMA (Simple)", param: 20 },
    { id: "EMA", label: "EMA (Exponencial)", param: 20 },
    { id: "RSI", label: "RSI", param: 14 },
    { id: "STOCH", label: "Estocastico %K", param: 14 },
    { id: "MACD", label: "MACD Histograma", param: 12 },
    { id: "ATR", label: "ATR", param: 14 },
    { id: "PRICE", label: "Precio", param: null },
    { id: "VOL", label: "Volumen", param: null },
    { id: "CHG", label: "Cambio %", param: null },
  ];
  function indLbl(id, p) {
    if (id === "STOCH")
      return "Stoch(" + p.p + "," + (p.ks || 1) + "," + (p.dp || 3) + ")";
    if (id === "MACD")
      return "MACD(" + p.p + "," + (p.sl || 26) + "," + (p.sg || 9) + ")";
    const def = INDICATORS.find((x) => x.id === id);
    return def && def.param != null
      ? id + "(" + p.p + ")"
      : def
        ? def.label
        : id;
  }
  // Short pill label - no parentheses, cleaner for the header chips.
  function pillLabel(f) {
    if (f.ind === "STOCH") return "STOCH " + f.params.p;
    if (f.ind === "MACD")
      return "MACD " + f.params.p + "/" + (f.params.sl || 26);
    if (f.params?.p != null) return f.ind + " " + f.params.p;
    return f.ind;
  }

  // Timeframe color mirrors the rest of the app.
  const TF_COLOR = { "1mo": "var(--amber)", "1wk": "var(--accent)", "1d": "var(--green)", "4h": "var(--purple)" };

  // Helper: find the matching scanner result for this ticker so we can show
  // score + pass/fail. Falls back to nulls when the ticker didn't come from
  // the scanner (e.g. opened from Portfolio or Backtest).
  function findResult(results, ticker, side) {
    if (!Array.isArray(results)) return null;
    return results.find((r) => r.ticker === ticker) || null;
  }

  // Build a pretty rule summary for display (same format as scannerTab uses).
  function formatRule(f) {
    const opMap = {
      ">": ">",
      "<": "<",
      ">=": ">=",
      "<=": "<=",
      x_up: "cruza arriba",
      x_dn: "cruza abajo",
    };
    const op = opMap[f.op] || f.op;
    if (f.cmpType === "val") return op + " " + f.cmpVal;
    if (f.cmpType === "prev") return op + " previo";
    if (f.cmpType === "ind") return op + " " + indLbl(f.cmpInd, f.cmpParams);
    return op;
  }

  // Current-value computation for a filter. Uses scan data cache or the
  // freshly-fetched chartData if the filter's timeframe matches. For other
  // timeframes we rely on the scan cache (already populated when the scanner
  // ran this ticker). Returns { value, pass } or nulls.
  function computeFilterStatus(f, dataCache, ticker, chartData, chartTf) {
    let tfData = null;
    if (f.tf === chartTf && chartData?.ok) tfData = chartData;
    else tfData = dataCache.current?.[ticker]?.[f.tf];
    if (!tfData || !tfData.ok) return { value: null, pass: null };
    const res = evalInd(f.ind, f.params, tfData);
    const value = Array.isArray(res) ? res[0] : null;
    // Build a mini data slice used for comparison-against-previous or indicator.
    let cmp = null;
    if (f.cmpType === "val") cmp = f.cmpVal;
    else if (f.cmpType === "prev") {
      const arr = Array.isArray(res) ? res : [];
      cmp = arr[1] ?? null;
    } else if (f.cmpType === "ind") {
      const r2 = evalInd(f.cmpInd, f.cmpParams, tfData);
      cmp = Array.isArray(r2) ? r2[0] : null;
    }
    let pass = null;
    if (value != null && cmp != null) {
      if (f.op === ">") pass = value > cmp;
      else if (f.op === "<") pass = value < cmp;
      else if (f.op === ">=") pass = value >= cmp;
      else if (f.op === "<=") pass = value <= cmp;
      else if (f.op === "x_up" || f.op === "x_dn") {
        const arr = Array.isArray(res) ? res : [];
        const prev = arr[1];
        if (f.op === "x_up") pass = prev != null && prev <= cmp && value > cmp;
        else pass = prev != null && prev >= cmp && value < cmp;
      }
    }
    return { value, pass };
  }

  function flattenRuleConditions(groups, prefix) {
    return (groups || []).flatMap((grp, gi) =>
      (grp.conditions || []).map((c, ci) => ({
        ...c,
        _id: c._id || prefix + "-" + gi + "-" + ci,
        _ruleKind: prefix,
        _ruleGroup: gi,
      })),
    );
  }

  // Preferencia del resumen del cursor: flotante arriba-izquierda o acoplado abajo.
  const SUMMARY_DOCK_KEY = "probus_chart_summary_dock_v2";
  function normalizeSummaryDock(v) {
    return v === "floating" || v === "bottom" || v === "both"
      ? v
      : "floating";
  }
  function loadSummaryDock() {
    try {
      return normalizeSummaryDock(localStorage.getItem(SUMMARY_DOCK_KEY));
    } catch {
      return "floating";
    }
  }
  function saveSummaryDock(v) {
    try {
      localStorage.setItem(SUMMARY_DOCK_KEY, normalizeSummaryDock(v));
    } catch {}
  }


  const CHART_TF_KEY = 'onix_chart_modal_tf_v1';

  function loadStoredChartTf(allFilters){
    const fallback = allFilters?.[0]?.tf || '1wk';
    try{
      const raw = localStorage.getItem(CHART_TF_KEY);
      if(raw && (allFilters||[]).some(f => f.tf === raw)) return raw;
    }catch{}
    return fallback;
  }

  function saveStoredChartTf(tf){
    try{ localStorage.setItem(CHART_TF_KEY, tf); }catch{}
  }

  function segmentedWrapStyle() {
    return {
      display: "inline-flex",
      gap: 3,
      padding: 3,
      background: "var(--panel-soft-bg)",
      border: "1px solid var(--panel-soft-border)",
      borderRadius: "var(--radius-sm)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,.03)",
    };
  }

  function segmentedButtonStyle(active, color) {
    return {
      padding: "5px 10px",
      minHeight: 26,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: 0.35,
      border: "1px solid " + (active ? color || "var(--accent)" : "transparent"),
      borderRadius: "var(--radius-sm)",
      cursor: "pointer",
      background: active ? "var(--accent-dim)" : "transparent",
      color: active ? color || "var(--accent)" : "var(--text-2)",
      fontFamily: "var(--font-mono)",
      whiteSpace: "nowrap",
      opacity: active ? 1 : 0.78,
    };
  }

  function chartStateBox(kind) {
    const isError = kind === "error";
    return {
      margin: 16,
      padding: "18px 20px",
      textAlign: "center",
      color: isError ? "var(--red)" : "var(--text-2)",
      background: isError ? "var(--status-fail-bg)" : "var(--panel-soft-bg)",
      border: "1px solid " + (isError ? "var(--status-fail-border)" : "var(--panel-soft-border)"),
      borderRadius: "var(--radius)",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
    };
  }

  function miniStatusStyle(pass, colorOverride) {
    const ok = !!pass;
    const color = colorOverride || (ok ? "var(--green)" : "var(--red)");
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "2px 7px",
      borderRadius: 999,
      border: "1px solid " + (ok ? "var(--status-pass-border)" : "var(--status-fail-border)"),
      background: ok ? "var(--status-pass-bg)" : "var(--status-fail-bg)",
      color,
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: 0.45,
      whiteSpace: "nowrap",
    };
  }

  function ohlcValue(v) {
    return Number.isFinite(Number(v)) ? "$" + Number(v).toFixed(2) : "-";
  }

  // ── Technical metrics derived from price history (client-side only) ───────
  // We compute these from whatever daily data we have in the cache so they
  // match what the user sees in the chart. Returns nulls for missing data so
  // the summary can render "-" gracefully.
  function computeTechnicalStats(d1) {
    if (!d1 || !d1.ok || !Array.isArray(d1.closes) || d1.closes.length < 20) {
      return {};
    }
    // closes arrive newest-first; last = latest bar
    const closes = d1.closes;
    const highs = d1.highs || [];
    const lows = d1.lows || [];
    const last = closes[0];
    const prev = closes[1];

    const retAt = (bars) => {
      if (closes.length <= bars) return null;
      const then = closes[bars];
      return then > 0 ? (last - then) / then : null;
    };
    // ~21 trading days per month
    const ret1m = retAt(21);
    const ret3m = retAt(63);
    const ret6m = retAt(126);
    const ret1y = retAt(252);

    // Annualized historical volatility from daily log returns (up to ~1y)
    const windowLen = Math.min(252, closes.length - 1);
    const dailyRets = [];
    for (let i = 0; i < windowLen; i++) {
      const a = closes[i],
        b = closes[i + 1];
      if (a > 0 && b > 0) dailyRets.push(Math.log(a / b));
    }
    let vol = null;
    if (dailyRets.length > 10) {
      const mean = dailyRets.reduce((s, x) => s + x, 0) / dailyRets.length;
      const variance =
        dailyRets.reduce((s, x) => s + (x - mean) * (x - mean), 0) /
        (dailyRets.length - 1);
      vol = Math.sqrt(variance) * Math.sqrt(252);
    }

    // RSI 14 at latest bar
    let rsi14 = null;
    if (closes.length >= 15) {
      let gains = 0,
        losses = 0;
      for (let i = 0; i < 14; i++) {
        const diff = closes[i] - closes[i + 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
      }
      const avgG = gains / 14,
        avgL = losses / 14;
      if (avgL === 0) rsi14 = 100;
      else {
        const rs = avgG / avgL;
        rsi14 = 100 - 100 / (1 + rs);
      }
    }

    // ATR 14 (Wilder, misma definición que filtros y gráfico)
    const atr14 = window.StockScannerCore.calcATR(highs, lows, closes, 14)[0];

    // SMA50, SMA200 and distance from price to each
    const sma = (n) => {
      if (closes.length < n) return null;
      let s = 0;
      for (let i = 0; i < n; i++) s += closes[i];
      return s / n;
    };
    const sma50 = sma(50);
    const sma200 = sma(200);
    const distSma50 = sma50 ? (last - sma50) / sma50 : null;
    const distSma200 = sma200 ? (last - sma200) / sma200 : null;

    return {
      ret1m,
      ret3m,
      ret6m,
      ret1y,
      vol,
      rsi14,
      atr14,
      sma50,
      sma200,
      distSma50,
      distSma200,
      last,
      prev,
    };
  }

  // Number formatters local to the summary panel.
  const fmtPct = (v, digits = 1) =>
    v == null ? "-" : (v >= 0 ? "+" : "") + (v * 100).toFixed(digits) + "%";
  const fmtPctRaw = (v, digits = 2) =>
    v == null ? "-" : (v * 100).toFixed(digits) + "%";
  const fmtNum = (v, digits = 2) =>
    v == null || !isFinite(v) ? "-" : v.toFixed(digits);
  const fmtMoney = (v) => (v == null ? "-" : "$" + v.toFixed(2));
  const fmtBig = (v) => {
    if (v == null) return "-";
    if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    return "$" + v.toFixed(0);
  };
  const fmtVolBig = (v) => {
    if (v == null) return "-";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return String(v);
  };

  const summaryRow = (label, value, opts = {}) => {
    const missing = value == null || value === "-" || value === "No disponible";
    return {
      label,
      value: missing ? "No disponible" : value,
      missing,
      ...(opts || {}),
    };
  };

  // Small group card used inside the summary panel. Each group has a title
  // and an array of { label, value, color? } rows.
  function SummaryGroup({ title, rows }) {
    return (
      <div
        style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "var(--radius-sm)",
          padding: "12px 14px",
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            color: "var(--text-3)",
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            marginBottom: 10,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "6px 12px",
          }}
        >
          {rows.map((r, i) => (
            <React.Fragment key={i}>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  fontFamily: "var(--font-body)",
                }}
              >
                {r.label}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: r.missing ? "var(--text-3)" : (r.color || "var(--text-0)"),
                  fontWeight: r.missing ? 500 : 600,
                  fontFamily: "var(--font-mono)",
                  textAlign: "right",
                  fontStyle: r.missing ? 'italic' : 'normal',
                }}
                title={r.missing ? 'Yahoo no devolvió este dato para este ticker' : undefined}
              >
                {r.missing ? 'No disponible' : r.value}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  // ── Component ─────────────────────────────────────────────────────────────

  function ChartModal({
    ticker,
    dataCache,
    filters,
    shortFilters,
    entryRules,
    exitRules,
    shortEntryRules,
    shortExitRules,
    backtestTrades,
    showExitInfo = false,
    viewSide = "long",
    contextLabel = "",
    results,
    sectorData,
    allocation,
    onClose,
  }) {
    const { ChartRenderer } = window.StockScannerUI;
    const priceRef = useRef(null);
    const oscRef = useRef(null);
    const chartsRef = useRef([]);

    const activeSide = viewSide === "short" ? "short" : "long";
    const displayContext =
      contextLabel === "Resultados" ? "Scanner" : contextLabel || "Grafico";
    const contextColor =
      displayContext === "Backtest"
        ? "var(--purple)"
        : displayContext === "Portafolio"
          ? "var(--amber)"
          : "var(--accent)";
    const activeEntryRules =
      activeSide === "short" ? shortEntryRules || [] : entryRules || [];
    const activeExitRulesRaw =
      activeSide === "short" ? shortExitRules || [] : exitRules || [];
    const activeExitRules = showExitInfo ? activeExitRulesRaw : [];
    const scannerFilters =
      activeSide === "short" ? shortFilters || [] : filters || [];
    const ruleFilters = [
      ...flattenRuleConditions(activeEntryRules, activeSide === "short" ? "short-entry" : "entry"),
      ...flattenRuleConditions(activeExitRules, activeSide === "short" ? "short-exit" : "exit"),
    ];
    const allFilters = contextLabel === "Backtest" ? ruleFilters : scannerFilters;

    const initialTf = loadStoredChartTf(allFilters);
    const [chartTf, setChartTf] = useState(initialTf);
    const [loading, setLoading] = useState(false);
    const [chartData, setChartData] = useState(null);
    const [crossInfo, setCrossInfo] = useState(null);

    // Pills: visible filters - default every filter is on. Stored as a Set of
    // filter _id values (fallback to index for pre-refactor filters w/o _id).
    const [visibleIds, setVisibleIds] = useState(
      () => new Set(allFilters.map((f, i) => f._id ?? i)),
    );
    const evalRules = true;
    // Resumen del cursor: flotante (overlay) o abajo (en la fila de tarjetas).
    const [summaryDock, setSummaryDock] = useState(() => loadSummaryDock());
    useEffect(() => {
      saveSummaryDock(summaryDock);
    }, [summaryDock]);

    useEffect(() => {
      saveStoredChartTf(chartTf);
    }, [chartTf]);

    // Reset visibility whenever the ticker or side changes, and keep the
    // timeframe aligned with the user's persisted choice if that TF exists.
    useEffect(() => {
      setChartTf(loadStoredChartTf(allFilters));
      setVisibleIds(new Set(allFilters.map((f, i) => f._id ?? i)));
      setCrossInfo(null);
    }, [ticker, activeSide]);

    // ── DATA FETCH ─────────────────────────────────────────────────────────
    useEffect(() => {
      if (!ticker) return;
      const cached = dataCache.current?.[ticker]?.[chartTf];
      if (cached && cached.ok) {
        setChartData(cached);
        setCrossInfo(null);
        return;
      }
      setLoading(true);
      const ac = new AbortController();
      fetchTicker(ticker, chartTf, ac.signal)
        .then((d) => {
          setCrossInfo(null);
          setChartData(d);
          // Populate the cache so filter status cards for this TF work too.
          if (d?.ok) {
            dataCache.current[ticker] = {
              ...(dataCache.current[ticker] || {}),
              [chartTf]: d,
            };
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
      return () => ac.abort();
    }, [ticker, chartTf]);

    // ── CHART RENDER ───────────────────────────────────────────────────────
    // Only render the filters the user has toggled on - this is what the
    // indicator pills control. Pre-filter so both the MA overlays and the
    // oscillator pane get a consistent view.
    const activeFilters = useMemo(
      () => allFilters.filter((f, i) => visibleIds.has(f._id ?? i)),
      [allFilters, visibleIds],
    );

    useLayoutEffect(() => {
      [...chartsRef.current].reverse().forEach((c) => {
        try {
          ChartRenderer.disposeChart ? ChartRenderer.disposeChart(c) : c.remove();
        } catch {}
      });
      chartsRef.current = [];
      if (!chartData || !chartData.ok || !priceRef.current) return;

      const d = chartData;
      const times = [...d.times].reverse();
      const closes = [...d.closes].reverse();
      const highs = [...d.highs].reverse();
      const lows = [...d.lows].reverse();
      const candles = times.map((t, i) => ({
        time: t,
        open: i > 0 ? closes[i - 1] : closes[i],
        high: highs[i],
        low: lows[i],
        close: closes[i],
      }));

      const renderOpts = {
        activeFilters,
        activeEntryRules: evalRules ? activeEntryRules : [],
        activeExitRules: evalRules ? activeExitRules : [],
        activeSide,
        chartTf,
        backtestTrades,
        showExitInfo,
        setCrossInfo,
        showVolume: true,
        showStopLine:
          contextLabel === "Portafolio" && allocation?.activeStop != null,
        stopPrice: allocation?.activeStop ?? null,
      };

      const priceChart = ChartRenderer.buildPriceChart(
        priceRef.current,
        d,
        times,
        candles,
        renderOpts,
      );
      chartsRef.current.push(priceChart);

      const oscChart = ChartRenderer.buildOscChart(
        oscRef.current,
        priceChart,
        d,
        times,
        chartTf,
        renderOpts,
      );
      if (oscChart) chartsRef.current.push(oscChart);

      const handleResize = () => {
        if (priceRef.current)
          priceChart.applyOptions({ width: priceRef.current.clientWidth });
        if (oscChart && oscRef.current)
          oscChart.applyOptions({ width: oscRef.current.clientWidth });
      };
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
        [...chartsRef.current].reverse().forEach((c) => {
          try {
            ChartRenderer.disposeChart ? ChartRenderer.disposeChart(c) : c.remove();
          } catch {}
        });
        chartsRef.current = [];
      };
    }, [
      chartData,
      activeFilters,
      activeEntryRules,
      activeExitRules,
      backtestTrades,
      activeSide,
      evalRules,
    ]);

    if (!ticker) return null;

    // ── DERIVED HEADER DATA ────────────────────────────────────────────────
    const tfs = [...new Set(allFilters.map((f) => f.tf))];
    const hasOsc = activeFilters.some(
      (f) =>
        f.tf === chartTf && ["RSI", "STOCH", "MACD", "ATR"].includes(f.ind),
    );

    const result = findResult(results, ticker, activeSide);
    const sectorEntry = sectorData?.[ticker];
    const scannerMeta = result?.meta || dataCache.current?.[ticker]?._meta || {};
    const fundamentals = allocation || scannerMeta || {};
    // Priority for the display name: allocation.shortName (from Portfolio) →
    // chartData.name (from Yahoo fetch) → result.name → ticker. This is how
    // the portfolio chart gets a proper company name even when the scanner
    // didn't participate in building the universe.
    const name =
      fundamentals?.shortName ||
      fundamentals?.longName ||
      chartData?.name ||
      result?.name ||
      ticker;
    const longName = fundamentals?.longName || fundamentals?.shortName || name;
    const sector = fundamentals?.sector || sectorEntry?.sector || "";
    const price =
      chartData?.price ?? fundamentals?.price ?? result?.price ?? null;
    // Prefer allocation.dayChangePct (live from quotes endpoint); fall back to
    // the scan's last-bar change.
    const dayChg = fundamentals?.dayChangePct ?? result?.chg ?? null;
    // Use the side-specific pass flag so when you open a LONG chart you see
    // the LONG status, even if the scan also evaluated the short side.
    const passed =
      activeSide === "short" ? result?.shortPassed : result?.longPassed;
    const showStatus =
      passed !== undefined && result != null && allFilters.length > 0;

    const toggleFilter = (id) =>
      setVisibleIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });

    // ── Bottom KPI cards: one per visible filter at current TF ─────────────
    // Each card shows: indicator pill color, label, last value, pass/fail dot.
    const kpiFilters = activeFilters.filter((f) => f.tf === chartTf);
    const filterKey = (f) => f._id ?? [f.tf, f.ind, f.op, f.cmpType, f.params?.p, f.params?.ks, f.params?.dp, f.params?.sl, f.params?.sg, f.cmpInd, f.cmpParams?.p, f.cmpParams?.ks, f.cmpParams?.dp, f.cmpParams?.sl, f.cmpParams?.sg, f.cmpVal].join('|');
    const filterStatuses = kpiFilters.map((f, idx) => {
      const filterId = filterKey(f);
      const crossSt = crossInfo?.filterValues?.[filterId] || null;
      const st =
        crossSt ||
        computeFilterStatus(f, dataCache, ticker, chartData, chartTf);
      return { f, ...st };
    });

    const hasFundamentalSummary = contextLabel !== "Portafolio" && !!(
      fundamentals &&
      (fundamentals.marketCap != null ||
        fundamentals.week52High != null ||
        fundamentals.avgVolume != null ||
        fundamentals.beta != null ||
        fundamentals.sector != null ||
        fundamentals.industry != null)
    );
    const dailySeriesForSummary = dataCache.current?.[ticker]?.["1d"];
    const techSummary = hasFundamentalSummary
      ? computeTechnicalStats(dailySeriesForSummary)
      : null;
    const week52HighDist =
      hasFundamentalSummary && fundamentals?.week52High != null && price != null
        ? (price - fundamentals.week52High) / fundamentals.week52High
        : null;
    const week52LowDist =
      hasFundamentalSummary && fundamentals?.week52Low != null && price != null
        ? (price - fundamentals.week52Low) / fundamentals.week52Low
        : null;
    const colorPct = (v) =>
      v == null ? "var(--text-3)" : v >= 0 ? "var(--green)" : "var(--red)";
    const rsiColor = (r) =>
      r == null
        ? "var(--text-3)"
        : r >= 70
          ? "var(--red)"
          : r <= 30
            ? "var(--green)"
            : "var(--text-0)";

    // ── RENDER ─────────────────────────────────────────────────────────────
    return (
      <div
        className="chart-modal"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="chart-modal-header"
          style={{ gap: 12, padding: "10px 16px", flexWrap: "wrap" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minWidth: 0,
            }}
          >
            <a
              href={
                "https://www.tradingview.com/chart/?symbol=" +
                encodeURIComponent(ticker)
              }
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir en TradingView"
              style={{
                fontSize: 22,
                fontWeight: 700,
                color:
                  activeSide === "short" ? "var(--purple)" : "var(--accent)",
                fontFamily: "var(--font-body)",
                letterSpacing: 0.3,
                textDecoration: "none",
                cursor: "pointer",
                borderBottom: "1px dashed transparent",
                transition: "border-color .15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderBottomColor =
                  activeSide === "short" ? "var(--purple)" : "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderBottomColor = "transparent";
              }}
            >
              {ticker}
            </a>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                minWidth: 0,
              }}
            >
              <div
                title={longName}
                style={{
                  fontSize: 13,
                  color: "var(--text-0)",
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 320,
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "var(--text-3)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: 0.5,
                }}
              >
                {sector
                  ? sector.toUpperCase()
                  : activeSide === "short"
                    ? "SHORT"
                    : "LONG"}
                {displayContext ? " - " + displayContext : ""}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 9px",
              borderRadius: 999,
              background: "var(--panel-accent-bg)",
              border: "1px solid var(--panel-accent-border)",
              color: contextColor,
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
            title={"Origen: " + displayContext}
          >
            <span>{displayContext}</span>
            <span style={{ color: "var(--text-3)" }}>
              {activeSide === "short" ? "SHORT" : "LONG"}
            </span>
          </div>

          {price != null && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--text-0)",
                  fontFamily: "var(--font-body)",
                }}
              >
                ${price.toFixed(2)}
              </div>
              {dayChg != null && (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: dayChg >= 0 ? "var(--green)" : "var(--red)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {dayChg >= 0 ? "+" : ""}
                  {dayChg.toFixed(2)}%
                </div>
              )}
            </div>
          )}

          {showStatus && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 6,
                background: passed
                  ? "var(--status-pass-bg)"
                  : "var(--status-fail-bg)",
                border:
                  "1px solid " +
                  (passed ? "var(--status-pass-border)" : "var(--status-fail-border)"),
                color: passed ? "var(--green)" : "var(--red)",
                fontWeight: 700,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              <span>{passed ? "OK" : "NO"}</span>
              <span>{passed ? "Cumple" : "No cumple"}</span>
            </div>
          )}

          {contextLabel === "Portafolio" && allocation?.activeStop != null && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 6,
                background: "var(--status-fail-bg)",
                border: "1px solid var(--status-fail-border)",
                color: "var(--red)",
                fontWeight: 700,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              <span>Stop</span>
              <span>${allocation.activeStop.toFixed(2)}</span>
            </div>
          )}

          <div style={{ flex: 1 }} />

          <div
            style={segmentedWrapStyle()}
          >
            {TIMEFRAMES.map((tf) => {
              const used = tfs.includes(tf.id);
              const active = chartTf === tf.id;
              return (
                <button
                  key={tf.id}
                  onClick={() => setChartTf(tf.id)}
                  title={used ? "Usado por filtros" : "Timeframe adicional"}
                  style={{
                    ...segmentedButtonStyle(active, TF_COLOR[tf.id] || "var(--accent)"),
                    padding: "5px 12px",
                    color: active
                      ? TF_COLOR[tf.id] || "var(--accent)"
                      : used
                        ? "var(--text-2)"
                        : "var(--text-3)",
                    opacity: used || active ? 1 : 0.55,
                  }}
                >
                  {tf.id === "1mo"
                    ? "1M"
                    : tf.id === "1wk"
                      ? "1W"
                      : tf.id === "1d"
                        ? "1D"
                        : tf.id.toUpperCase()}
                </button>
              );
            })}
          </div>

          <div
            style={segmentedWrapStyle()}
          >
            <button
              onClick={() => setSummaryDock("floating")}
              title="Mostrar solo el resumen flotante junto al cursor"
              style={segmentedButtonStyle(summaryDock === "floating", "var(--accent)")}
            >
              Resumen flotante
            </button>
            <button
              onClick={() => setSummaryDock("bottom")}
              title="Mostrar solo las tarjetas inferiores usando la vela bajo el cursor"
              style={segmentedButtonStyle(summaryDock === "bottom", "var(--accent)")}
            >
              Tarjetas inferiores
            </button>
            <button
              onClick={() => setSummaryDock("both")}
              title="Mostrar el resumen flotante y las tarjetas inferiores al mismo tiempo"
              style={segmentedButtonStyle(summaryDock === "both", "var(--accent)")}
            >
              Ambos
            </button>
          </div>

          <button className="chart-close" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {allFilters.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px",
              borderBottom: "1px solid var(--card-border)",
              flexWrap: "wrap",
              background: "var(--panel-soft-bg)",
            }}
          >
            <span
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: 1.2,
                color: "var(--text-3)",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
              }}
            >
              Indicadores:
            </span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                flex: 1,
                minWidth: 180,
              }}
            >
              {allFilters.map((f, i) => {
                const id = f._id ?? i;
                const on = visibleIds.has(id);
                const color = PILL_COLORS[i % PILL_COLORS.length];
                return (
                  <button
                    key={id}
                    onClick={() => toggleFilter(id)}
                    title={
                      indLbl(f.ind, f.params) +
                      " " +
                      formatRule(f) +
                      " [" +
                      f.tf +
                      "]"
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      borderRadius: 999,
                      cursor: "pointer",
                      background: on ? "var(--panel-accent-bg)" : "transparent",
                      border: "1px solid " + (on ? color : "var(--border)"),
                      color: on ? "var(--text-0)" : "var(--text-3)",
                      fontSize: 10,
                      fontWeight: 600,
                      fontFamily: "var(--font-mono)",
                      opacity: on ? 1 : 0.55,
                      transition: "all .15s",
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: color,
                        display: "inline-block",
                        opacity: on ? 1 : 0.45,
                      }}
                    />
                    <span>{pillLabel(f)}</span>
                    <span
                      style={{
                        color: TF_COLOR[f.tf] || "var(--text-3)",
                        fontSize: 9,
                      }}
                    >
                      [{f.tf}]
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="chart-container" style={{ position: "relative" }}>
          {loading && (
            <div
              style={chartStateBox("loading")}
            >
              Cargando datos...
            </div>
          )}
          {chartData && !chartData.ok && (
            <div
              style={chartStateBox("error")}
            >
              {chartData.error}
            </div>
          )}

          {crossInfo && (summaryDock === "floating" || summaryDock === "both") && (
            <div
              className="chart-floating-summary"
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                zIndex: 20,
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "var(--radius)",
                padding: "10px 14px",
                fontSize: 10,
                color: "var(--text-0)",
                minWidth: 200,
                maxWidth: 320,
                pointerEvents: "none",
                backdropFilter: "var(--glass)",
                boxShadow: "var(--shadow-elevated)",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: "var(--text-3)",
                  marginBottom: 6,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {ticker} -{" "}
                {(crossInfo?.date instanceof Date ? crossInfo.date : new Date(crossInfo?.date || Date.now())).toLocaleDateString("es", {
                  day: "numeric",
                  month: "short",
                  year: "2-digit",
                })}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "2px 14px",
                  marginBottom: 6,
                }}
              >
                <span style={{ color: "var(--text-3)" }}>O</span>
                <span style={{ fontWeight: 600 }}>
                  {ohlcValue(crossInfo.O)}
                </span>
                <span style={{ color: "var(--text-3)" }}>H</span>
                <span style={{ fontWeight: 600, color: "var(--green)" }}>
                  {ohlcValue(crossInfo.H)}
                </span>
                <span style={{ color: "var(--text-3)" }}>L</span>
                <span style={{ fontWeight: 600, color: "var(--red)" }}>
                  {ohlcValue(crossInfo.L)}
                </span>
                <span style={{ color: "var(--text-3)" }}>C</span>
                <span style={{ fontWeight: 600 }}>
                  {ohlcValue(crossInfo.C)}
                </span>
                {crossInfo.chg != null && (
                  <React.Fragment>
                    <span style={{ color: "var(--text-3)" }}>Chg</span>
                    <span
                      style={{
                        fontWeight: 600,
                        color:
                          crossInfo.chg > 0 ? "var(--green)" : "var(--red)",
                      }}
                    >
                      {crossInfo.chg > 0 ? "+" : ""}
                      {crossInfo.chg.toFixed(2)}%
                    </span>
                  </React.Fragment>
                )}
              </div>
              {Object.keys(crossInfo.inds || {}).length > 0 && (
                <div
                  style={{
                    borderTop: "1px solid var(--section-divider)",
                    paddingTop: 5,
                    marginBottom: evalRules ? 5 : 0,
                  }}
                >
                  {Object.entries(crossInfo.inds || {}).map(([k, v], i) => (
                    <div
                      key={k}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        marginBottom: 1,
                      }}
                    >
                      <span
                        style={{
                          color: PILL_COLORS[i % PILL_COLORS.length],
                          fontSize: 9,
                        }}
                      >
                        {k}
                      </span>
                      <span style={{ fontWeight: 600, color: "var(--text-1)" }}>
                        {v != null ? v.toFixed(2) : "-"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {evalRules && (
                <div
                  style={{
                    borderTop: "1px solid var(--section-divider)",
                    paddingTop: 7,
                    display: "flex",
                    gap: 7,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={miniStatusStyle(crossInfo.entryPass, activeSide === "short" ? "var(--purple)" : "var(--green)")}>
                    <span>{activeSide === "short" ? "Short" : "Entrada"}</span>
                    <span>{crossInfo.entryPass ? "SI" : "NO"}</span>
                  </span>
                  {showExitInfo && (
                    <span style={miniStatusStyle(crossInfo.exitPass, activeSide === "short" ? "var(--amber)" : "var(--red)")}>
                      <span>{activeSide === "short" ? "Cover" : "Salida"}</span>
                      <span>{crossInfo.exitPass ? "SI" : "NO"}</span>
                    </span>
                  )}
                </div>
              )}
              {crossInfo?.tradeEvent && (
                <div
                  style={{
                    borderTop: "1px solid var(--section-divider)",
                    paddingTop: 7,
                    marginTop: 7,
                    fontSize: 9,
                    lineHeight: 1.45,
                  }}
                >
                  <div
                    style={{
                      ...miniStatusStyle(true, crossInfo.tradeEvent.color),
                      borderColor: crossInfo.tradeEvent.color,
                      background: "var(--panel-accent-bg)",
                      marginBottom: crossInfo.tradeEvent.detail ? 5 : 0,
                      width: "fit-content",
                    }}
                  >
                    <span>{crossInfo.tradeEvent.type}</span>
                    <span>{crossInfo.tradeEvent.price != null ? `$${crossInfo.tradeEvent.price.toFixed(2)}` : ""}</span>
                  </div>
                  {crossInfo.tradeEvent.detail && (
                    <div style={{ color: "var(--text-2)", marginTop: 2 }}>
                      {crossInfo.tradeEvent.detail}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div
            className="chart-pane"
            style={{ flex: hasOsc ? 3 : 1 }}
            ref={priceRef}
          >
            <div className="chart-pane-label">
              PRECIO + VOLUMEN [{chartTf.toUpperCase()}]
            </div>
          </div>
          {hasOsc && (
            <div
              className="chart-pane"
              style={{ flex: 1, minHeight: 180 }}
              ref={oscRef}
            >
              <div className="chart-pane-label">
                OSCILADORES [{chartTf.toUpperCase()}]
              </div>
            </div>
          )}
        </div>

        {filterStatuses.length > 0 && (
          <div
            className="chart-bottom-summary"
            style={{
              borderTop: "1px solid var(--card-border)",
              background: "var(--panel-soft-bg)",
            }}
          >
            {(summaryDock === "bottom" || summaryDock === "both") && (
              <div
                style={{
                  padding: "8px 16px 0",
                  fontSize: 10,
                  color: "var(--text-3)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {crossInfo
                  ? `Cursor: ${(crossInfo?.date instanceof Date ? crossInfo.date : new Date(crossInfo?.date || Date.now())).toLocaleDateString("es", { day: "numeric", month: "short", year: "2-digit" })}`
                  : "Mueve el cursor sobre una vela para ver los valores de esa vela aqui abajo."}
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(filterStatuses.length, 6)}, minmax(170px,1fr))`,
                gap: 8,
                padding: "10px 16px",
                background: "var(--panel-soft-bg)",
                overflowX: "auto",
              }}
            >
              {filterStatuses.map(({ f, value, pass }, i) => {
                const color =
                  PILL_COLORS[allFilters.indexOf(f) % PILL_COLORS.length];
                const passColor = pass == null ? "var(--text-3)" : pass ? "var(--green)" : "var(--red)";
                const passLabel = pass == null ? "Sin dato" : pass ? "Pasa" : "No pasa";
                return (
                  <div
                    className="chart-rule-card"
                    key={f._id ?? i}
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid " + (pass == null ? "var(--card-border)" : pass ? "var(--status-pass-border)" : "var(--status-fail-border)"),
                      borderRadius: "var(--radius)",
                      padding: "8px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      boxShadow: pass == null ? "var(--shadow-card)" : pass ? "inset 0 0 0 999px var(--status-pass-bg), var(--shadow-card)" : "inset 0 0 0 999px var(--status-fail-bg), var(--shadow-card)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: color,
                            flex: "0 0 auto",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: 0.4,
                            color: "var(--text-2)",
                            fontFamily: "var(--font-mono)",
                            textTransform: "uppercase",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {pillLabel(f)}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 8,
                          color: TF_COLOR[f.tf] || "var(--text-3)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        [{f.tf}]
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: "var(--text-0)",
                          fontFamily: "var(--font-body)",
                        }}
                      >
                        {value != null
                          ? Math.abs(value) > 999
                            ? value.toFixed(0)
                            : value.toFixed(2)
                          : "-"}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          fontFamily: "var(--font-mono)",
                          color: passColor,
                          border: "1px solid " + (pass == null ? "var(--card-border)" : pass ? "var(--status-pass-border)" : "var(--status-fail-border)"),
                          background: pass == null ? "var(--panel-soft-bg)" : pass ? "var(--status-pass-bg)" : "var(--status-fail-bg)",
                          borderRadius: 999,
                          padding: "2px 6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {passLabel}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 8,
                        color: "var(--text-3)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {formatRule(f)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {hasFundamentalSummary && (
          <div
            style={{
              borderTop: "1px solid var(--card-border)",
              background: "var(--panel-soft-bg)",
              padding: "12px 16px",
              maxHeight: "32vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: 1.5,
                color: "var(--text-3)",
                fontWeight: 600,
                fontFamily: "var(--font-mono)",
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span>Resumen técnico y de mercado</span>
              <span
                style={{ flex: 1, height: 1, background: "var(--card-border)" }}
              />
              <a
                href={
                  "https://www.tradingview.com/chart/?symbol=" +
                  encodeURIComponent(ticker)
                }
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--accent)",
                  textDecoration: "none",
                  fontSize: 9,
                  letterSpacing: 0.4,
                }}
              >
                Ver en TradingView
              </a>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 10,
              }}
            >

              <SummaryGroup
                title="Mercado y rango"
                rows={[
                  summaryRow("52W Alto", fmtMoney(fundamentals.week52High)),
                  summaryRow("52W Bajo", fmtMoney(fundamentals.week52Low)),
                  summaryRow("Dist. al 52W Alto", fmtPct(week52HighDist, 1), { color: colorPct(week52HighDist) }),
                  summaryRow("Dist. al 52W Bajo", fmtPct(week52LowDist, 1), { color: colorPct(week52LowDist) }),
                  summaryRow("Volumen", fmtVolBig(fundamentals.volume)),
                  summaryRow("Volumen promedio", fmtVolBig(fundamentals.avgVolume)),
                ]}
              />

              <SummaryGroup
                title="Análisis técnico"
                rows={[
                  {
                    label: "Retorno 1M",
                    value: fmtPct(techSummary?.ret1m, 2),
                    color: colorPct(techSummary?.ret1m),
                  },
                  {
                    label: "Retorno 3M",
                    value: fmtPct(techSummary?.ret3m, 2),
                    color: colorPct(techSummary?.ret3m),
                  },
                  {
                    label: "Retorno 6M",
                    value: fmtPct(techSummary?.ret6m, 2),
                    color: colorPct(techSummary?.ret6m),
                  },
                  {
                    label: "Retorno 1Y",
                    value: fmtPct(techSummary?.ret1y, 2),
                    color: colorPct(techSummary?.ret1y),
                  },
                  {
                    label: "Volatilidad anual",
                    value: fmtPctRaw(techSummary?.vol, 1),
                  },
                  {
                    label: "RSI 14",
                    value: fmtNum(techSummary?.rsi14, 1),
                    color: rsiColor(techSummary?.rsi14),
                  },
                  { label: "ATR 14", value: fmtNum(techSummary?.atr14, 2) },
                  {
                    label: "Dist. SMA 50",
                    value: fmtPct(techSummary?.distSma50, 2),
                    color: colorPct(techSummary?.distSma50),
                  },
                  {
                    label: "Dist. SMA 200",
                    value: fmtPct(techSummary?.distSma200, 2),
                    color: colorPct(techSummary?.distSma200),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  const InspectorSummary = React.memo(function InspectorSummary({ticker,data,dataCache,filters,crossInfo,signalTimes}){
    const statuses=React.useMemo(()=>filters.filter(f=>f.tf===data?.tf).map(f=>{
      const key=f._id ?? [f.tf,f.ind,f.op,f.cmpType,f.params?.p,f.params?.ks,f.params?.dp,f.params?.sl,f.params?.sg,f.cmpInd,f.cmpParams?.p,f.cmpParams?.ks,f.cmpParams?.dp,f.cmpParams?.sl,f.cmpParams?.sg,f.cmpVal].join('|');
      const signalTime=signalTimes?.[f.tf];
      const index=signalTime==null?1:data.times?.indexOf(signalTime);
      const closedData=window.StockScannerCore.buildSignalSliceFromIndex(data,index>=0?index:1);
      const latest=closedData.ok?computeFilterStatus(f,dataCache,ticker,closedData,data.tf):{value:null,pass:null};
      return {f,...(crossInfo?.filterValues?.[key] || latest)};
    }),[filters,data,ticker,dataCache,crossInfo,signalTimes]);
    if(!statuses.length)return null;
    return <div className="inspector-cards">
      {crossInfo?.date&&<div className="inspector-cursor-date">Cursor: {crossInfo.date.toLocaleDateString('es',{day:'2-digit',month:'short',year:'2-digit'})}</div>}
      {!crossInfo&&<div className="inspector-cursor-date">Última vela cerrada</div>}
      <div className="inspector-indicator-cards">{statuses.map(({f,value,pass},i)=><div key={f._id??i} className="inspector-indicator-card" data-pass={pass==null?'unknown':pass?'yes':'no'}>
        <span>{pillLabel(f)} <small>[{f.tf}]</small></span>
        <strong>{typeof value==='number'?fmtNum(value,2):value??'?'}</strong>
        <small style={{color:pass==null?'var(--text-2)':pass?'var(--green)':'var(--red)'}}>{formatRule(f)} ? {pass==null?'Sin dato':pass?'Pasa':'No pasa'}</small>
      </div>)}</div>
    </div>;
  });

  window.StockScannerUI = Object.assign(window.StockScannerUI || {}, {
    ChartModal, InspectorSummary,
  });
})();
