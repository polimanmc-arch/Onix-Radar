window.StockScannerUI = window.StockScannerUI || {};

class ChartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "Error renderizando grafico",
    };
  }

  componentDidCatch(error) {
    console.error("Chart modal error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="chart-modal"
          onClick={(e) => {
            if (e.target === e.currentTarget) this.props.onClose?.();
          }}
        >
          <div
            style={{
              maxWidth: 560,
              margin: "8vh auto",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius)",
              padding: 20,
              color: "var(--text-1)",
              boxShadow: "var(--shadow-elevated)",
              backdropFilter: "var(--glass)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                marginBottom: 10,
              }}
            >
              <strong style={{ color: "var(--text-0)" }}>
                No pude renderizar este grafico
              </strong>
              <button className="chart-close" onClick={() => this.props.onClose?.()}>
                Cerrar
              </button>
            </div>
            <div style={{ color: "var(--red)", fontSize: 12 }}>
              {this.state.message}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

window.StockScannerUI.SelectedChartLayer = function SelectedChartLayer({
  selectedChart,
  dataCacheRef,
  filters,
  shortFilters,
  entryRules,
  exitRules,
  shortEntryRules,
  shortExitRules,
  backtest,
  results,
  sectorData,
  portfolio,
  onClose,
}) {
  if (!selectedChart) return null;
  const showExitInfo = selectedChart?.source === "Backtest";
  const trades = showExitInfo
    ? (backtest?.allTrades?.filter(
        (t) =>
          t.ticker === selectedChart.ticker &&
          (selectedChart.side
            ? (t.dir || t.direction || "").toLowerCase() === selectedChart.side
            : true),
      ) || [])
    : [];

  const allocation =
    selectedChart?.source === "Portafolio" && portfolio?.allocations
      ? portfolio.allocations.find((a) => a.ticker === selectedChart.ticker)
      : null;
  const modalContextLabel =
    selectedChart?.source === "Resultados" ? "Scanner" : selectedChart?.source || "";

  return (
    <ChartErrorBoundary onClose={onClose}>
      <window.StockScannerUI.ChartModal
        ticker={selectedChart.ticker}
        viewSide={selectedChart.side}
        contextLabel={modalContextLabel}
        dataCache={dataCacheRef}
        filters={filters}
        shortFilters={shortFilters}
        entryRules={entryRules}
        exitRules={exitRules}
        shortEntryRules={shortEntryRules}
        shortExitRules={shortExitRules}
        backtestTrades={trades}
        showExitInfo={showExitInfo}
        results={results}
        sectorData={sectorData}
        allocation={allocation}
        onClose={onClose}
      />
    </ChartErrorBoundary>
  );
};
