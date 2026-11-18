"use strict";
window.StockScannerUI = window.StockScannerUI || {};
window.StockScannerUI.AppTabNav = function AppTabNav({ APP_TABS, tab, setTab, passN, portfolio }) {
    const paths = { scanner: 'M4 5h16M4 12h10M4 19h6M17 10v9m-3-3 3 3 3-3',
        backtest: 'M4 4v16h16M7 15l4-5 4 3 5-7', portfolio: 'M12 3v9h9A9 9 0 1 1 12 3m3 0a9 9 0 0 1 6 6h-6z' };
    return (React.createElement("nav", { className: "workspace-rail", "aria-label": "Secciones principales" },
        React.createElement("a", { href: "#workspace-main", className: "rail-brand", title: "Radar Onix \u00B7 Ir al contenido" },
            React.createElement("img", { src: "/assets/radar-onix-mark.svg?v=2", alt: "Radar Onix", width: "32", height: "32" })),
        APP_TABS.map(([key, label]) => {
            var _a;
            const count = key === 'scanner' ? passN : key === 'portfolio' ? (_a = portfolio === null || portfolio === void 0 ? void 0 : portfolio.allocations) === null || _a === void 0 ? void 0 : _a.length : 0;
            return React.createElement("button", { type: "button", key: key, className: "rail-link", title: label, "aria-label": label, "aria-current": tab === key ? 'page' : undefined, onClick: () => setTab(key) },
                React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" },
                    React.createElement("path", { d: paths[key] })),
                React.createElement("span", { className: "rail-label" }, label),
                count > 0 && React.createElement("span", { className: "rail-count", "aria-label": `${count} elementos` }, count));
        }),
        React.createElement("span", { className: "rail-footer" }, "ONIX")));
};
