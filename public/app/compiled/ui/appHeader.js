"use strict";
window.StockScannerUI = window.StockScannerUI || {};
const { UI_STYLES: __S } = window.StockScannerUI;
(function () {
    try {
        const saved = localStorage.getItem('onix_theme');
        if (!saved && localStorage.getItem('probus_theme'))
            localStorage.setItem('onix_theme', localStorage.getItem('probus_theme'));
        if (localStorage.getItem('onix_theme') === 'light')
            document.documentElement.setAttribute('data-theme', 'light');
    }
    catch { }
})();
window.StockScannerUI.AppHeader = function AppHeader({ tab, uiMode, setUiMode }) {
    const { useState } = React;
    const [isLight, setIsLight] = useState(() => {
        try {
            return localStorage.getItem('onix_theme') === 'light';
        }
        catch {
            return false;
        }
    });
    function toggleTheme() {
        const next = !isLight;
        setIsLight(next);
        if (next) {
            document.documentElement.setAttribute('data-theme', 'light');
            try {
                localStorage.setItem('onix_theme', 'light');
            }
            catch { }
        }
        else {
            document.documentElement.removeAttribute('data-theme');
            try {
                localStorage.removeItem('onix_theme');
            }
            catch { }
        }
    }
    return (React.createElement("header", { className: "workspace-header" },
        React.createElement("div", { className: "workspace-title" },
            React.createElement("strong", null,
                "RADAR ",
                React.createElement("span", null, "ONIX")),
            React.createElement("span", { className: "workspace-divider" }),
            React.createElement("span", null, uiMode === 'simple' ? 'Simulador de estrategias' : (({ scanner: 'Scanner de mercado', portfolio: 'Portafolio', backtest: 'Laboratorio de estrategias' })[tab] || 'Workspace'))),
        React.createElement("div", { className: "workspace-header-actions" },
            setUiMode && React.createElement("div", { className: "mode-switch", role: "group", "aria-label": "Modo de la app" },
                React.createElement("button", { type: "button", "aria-pressed": uiMode === 'simple', onClick: () => setUiMode('simple'), title: "Simulador sencillo en 3 pasos" }, "Simple"),
                React.createElement("button", { type: "button", "aria-pressed": uiMode !== 'simple', onClick: () => setUiMode('pro'), title: "Scanner, backtest y portafolio completos" }, "Experto")),
            React.createElement("button", { type: "button", className: "theme-button", onClick: toggleTheme, title: isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro', "aria-label": isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro' },
                React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", "aria-hidden": "true" }, isLight ? React.createElement("path", { d: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" }) : React.createElement(React.Fragment, null,
                    React.createElement("circle", { cx: "12", cy: "12", r: "4" }),
                    React.createElement("path", { d: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2" })))))));
};
window.StockScannerUI.AppNotifications = function AppNotifications({ notices, dismissNotice }) {
    if (!(notices === null || notices === void 0 ? void 0 : notices.length))
        return null;
    const tone = {
        info: { border: 'rgba(0,180,255,.32)', bg: 'rgba(0,180,255,.08)', fg: 'var(--accent)' },
        success: { border: 'rgba(0,214,143,.32)', bg: 'rgba(0,214,143,.08)', fg: 'var(--green)' },
        warning: { border: 'rgba(255,179,64,.34)', bg: 'rgba(255,179,64,.09)', fg: 'var(--amber)' },
        error: { border: 'rgba(220,50,50,.36)', bg: 'rgba(220,50,50,.10)', fg: 'var(--red)' },
    };
    return (React.createElement("div", { style: { position: 'fixed', right: 18, top: 18, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, width: 'min(390px, calc(100vw - 36px))', pointerEvents: 'none' } }, notices.map(n => {
        const t = tone[n.type] || tone.info;
        return (React.createElement("div", { key: n.id, style: { ...((__S === null || __S === void 0 ? void 0 : __S.cd) || {}), padding: '10px 12px', borderColor: t.border, background: t.bg, boxShadow: '0 12px 32px rgba(0,0,0,.22)', pointerEvents: 'auto' } },
            React.createElement("div", { style: { display: 'flex', gap: 10, alignItems: 'flex-start' } },
                React.createElement("div", { style: { width: 8, height: 8, borderRadius: '50%', background: t.fg, marginTop: 4, flex: '0 0 auto' } }),
                React.createElement("div", { style: { minWidth: 0, flex: 1 } },
                    n.title && React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: 'var(--text-0)', marginBottom: 2 } }, n.title),
                    React.createElement("div", { style: { fontSize: 10, lineHeight: 1.45, color: 'var(--text-2)', whiteSpace: 'pre-wrap' } }, n.message)),
                React.createElement("button", { onClick: () => dismissNotice(n.id), title: "Cerrar", style: { border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 14, lineHeight: 1, cursor: 'pointer', padding: 0 } }, "x"))));
    })));
};
