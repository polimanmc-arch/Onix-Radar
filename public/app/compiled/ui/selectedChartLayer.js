"use strict";
window.StockScannerUI = window.StockScannerUI || {};
class ChartErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, message: "" };
    }
    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            message: (error === null || error === void 0 ? void 0 : error.message) || "Error renderizando grafico",
        };
    }
    componentDidCatch(error) {
        console.error("Chart modal error", error);
    }
    render() {
        if (this.state.hasError) {
            return (React.createElement("div", { className: "chart-modal", onClick: (e) => {
                    var _a, _b;
                    if (e.target === e.currentTarget)
                        (_b = (_a = this.props).onClose) === null || _b === void 0 ? void 0 : _b.call(_a);
                } },
                React.createElement("div", { style: {
                        maxWidth: 560,
                        margin: "8vh auto",
                        background: "var(--card-bg)",
                        border: "1px solid var(--card-border)",
                        borderRadius: "var(--radius)",
                        padding: 20,
                        color: "var(--text-1)",
                        boxShadow: "var(--shadow-elevated)",
                        backdropFilter: "var(--glass)",
                    } },
                    React.createElement("div", { style: {
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 12,
                            marginBottom: 10,
                        } },
                        React.createElement("strong", { style: { color: "var(--text-0)" } }, "No pude renderizar este grafico"),
                        React.createElement("button", { className: "chart-close", onClick: () => { var _a, _b; return (_b = (_a = this.props).onClose) === null || _b === void 0 ? void 0 : _b.call(_a); } }, "Cerrar")),
                    React.createElement("div", { style: { color: "var(--red)", fontSize: 12 } }, this.state.message))));
        }
        return this.props.children;
    }
}
window.StockScannerUI.SelectedChartLayer = function SelectedChartLayer({ selectedChart, dataCacheRef, filters, shortFilters, entryRules, exitRules, shortEntryRules, shortExitRules, backtest, results, sectorData, portfolio, onClose, }) {
    var _a;
    if (!selectedChart)
        return null;
    const showExitInfo = (selectedChart === null || selectedChart === void 0 ? void 0 : selectedChart.source) === "Backtest";
    const trades = showExitInfo
        ? (((_a = backtest === null || backtest === void 0 ? void 0 : backtest.allTrades) === null || _a === void 0 ? void 0 : _a.filter((t) => t.ticker === selectedChart.ticker &&
            (selectedChart.side
                ? (t.dir || t.direction || "").toLowerCase() === selectedChart.side
                : true))) || [])
        : [];
    const allocation = (selectedChart === null || selectedChart === void 0 ? void 0 : selectedChart.source) === "Portafolio" && (portfolio === null || portfolio === void 0 ? void 0 : portfolio.allocations)
        ? portfolio.allocations.find((a) => a.ticker === selectedChart.ticker)
        : null;
    const modalContextLabel = (selectedChart === null || selectedChart === void 0 ? void 0 : selectedChart.source) === "Resultados" ? "Scanner" : (selectedChart === null || selectedChart === void 0 ? void 0 : selectedChart.source) || "";
    return (React.createElement(ChartErrorBoundary, { onClose: onClose },
        React.createElement(window.StockScannerUI.ChartModal, { ticker: selectedChart.ticker, viewSide: selectedChart.side, contextLabel: modalContextLabel, dataCache: dataCacheRef, filters: filters, shortFilters: shortFilters, entryRules: entryRules, exitRules: exitRules, shortEntryRules: shortEntryRules, shortExitRules: shortExitRules, backtestTrades: trades, showExitInfo: showExitInfo, results: results, sectorData: sectorData, allocation: allocation, onClose: onClose })));
};
