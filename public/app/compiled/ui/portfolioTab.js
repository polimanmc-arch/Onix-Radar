"use strict";
// portfolioTab.js - Portfolio tab.
//   Layout:
//     ▸ Config card + Manual tickers card + full-width Build button
//     ▸ KPIs row + info bar
//     ▸ Nivel 1: Efficient Frontier + Unified Donut (segmented by "Accion/Sector")
//       - both cards share the same height on a 1fr/1fr grid
//     ▸ Nivel 2: Allocations table full width - enriched with day change,
//       volume, market cap, P/E and a 3-month sparkline
//     ▸ Export CSV
window.StockScannerTabs = window.StockScannerTabs || {};
(function () {
    const { useState, useMemo } = React;
    // ── Palette used by both donuts, legend dots and row markers ───────────────
    const CHART_COLORS = [
        "#3da5ff", // blue
        "#22c98a", // green
        "#ef4c5a", // red
        "#f5a524", // amber
        "#a97cf8", // purple
        "#4cd6ff", // cyan
        "#ff7bb0", // pink
        "#9bd34d", // lime
        "#ffd15c", // yellow
        "#6b83f7", // indigo
    ];
    // ── Small building blocks ──────────────────────────────────────────────────
    function FieldLabel({ children }) {
        return (React.createElement("div", { style: { fontSize: 9, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-3)", marginBottom: 5, fontWeight: 600, fontFamily: "var(--font-mono)" } }, children));
    }
    function Field({ label, children, style }) {
        return (React.createElement("div", { style: { display: "flex", flexDirection: "column", ...(style || {}) } },
            React.createElement(FieldLabel, null, label),
            children));
    }
    // Compact number formatters for the enriched table.
    const fmtVol = (v) => {
        if (v == null)
            return "-";
        if (v >= 1e9)
            return (v / 1e9).toFixed(2) + "B";
        if (v >= 1e6)
            return (v / 1e6).toFixed(2) + "M";
        if (v >= 1e3)
            return (v / 1e3).toFixed(1) + "K";
        return String(v);
    };
    const fmtMktCap = (v) => {
        if (v == null)
            return "-";
        if (v >= 1e12)
            return "$" + (v / 1e12).toFixed(2) + "T";
        if (v >= 1e9)
            return "$" + (v / 1e9).toFixed(2) + "B";
        if (v >= 1e6)
            return "$" + (v / 1e6).toFixed(1) + "M";
        return "$" + v.toFixed(0);
    };
    const fmtPE = (v) => (v == null || !isFinite(v)) ? "-" : v.toFixed(1);
    // 3-month sparkline - same contract as the scanner's. Accepts newest-first
    // closes. Color by OLS slope sign.
    function Sparkline({ closes, width = 88, height = 30 }) {
        if (!closes || closes.length < 10) {
            return React.createElement("span", { style: { color: "var(--text-3)", fontSize: 9 } }, "-");
        }
        const slice = closes.slice(0, 63).filter(v => v != null).reverse();
        if (slice.length < 10)
            return React.createElement("span", { style: { color: "var(--text-3)", fontSize: 9 } }, "-");
        const min = Math.min(...slice);
        const max = Math.max(...slice);
        const range = max - min || 1;
        const xStep = width / (slice.length - 1);
        const pts = slice.map((v, i) => (i * xStep).toFixed(1) + "," + (height - ((v - min) / range) * height).toFixed(1)).join(" ");
        const meanX = (slice.length - 1) / 2;
        const meanY = slice.reduce((a, b) => a + b, 0) / slice.length;
        let num = 0, den = 0;
        slice.forEach((y, i) => { const dx = i - meanX; num += dx * (y - meanY); den += dx * dx; });
        const slope = den ? num / den : 0;
        const color = slope >= 0 ? "var(--green)" : "var(--red)";
        return (React.createElement("svg", { width: width, height: height, viewBox: "0 0 " + width + " " + height, preserveAspectRatio: "none", style: { display: "block" } },
            React.createElement("polyline", { points: pts, fill: "none", stroke: color, strokeWidth: 1.3, strokeLinejoin: "round", strokeLinecap: "round" })));
    }
    // Donut chart with a hole and a single centered value + tiny label. Previous
    // versions stacked three pieces of text that overlapped on tight viewports;
    // we now render one number with exact vertical anchoring and a small caption
    // below it so it always reads cleanly regardless of size.
    function DonutChart({ slices, centerValue, centerLabel, size = 260 }) {
        const cx = size / 2, cy = size / 2;
        const outerR = size * 0.44;
        const innerR = size * 0.28;
        let start = -Math.PI / 2;
        const paths = slices.map((s, i) => {
            const sweep = s.weight * 2 * Math.PI;
            if (sweep < 1e-4)
                return null;
            const end = start + sweep;
            const x1 = cx + outerR * Math.cos(start);
            const y1 = cy + outerR * Math.sin(start);
            const x2 = cx + outerR * Math.cos(end);
            const y2 = cy + outerR * Math.sin(end);
            const xi2 = cx + innerR * Math.cos(end);
            const yi2 = cy + innerR * Math.sin(end);
            const xi1 = cx + innerR * Math.cos(start);
            const yi1 = cy + innerR * Math.sin(start);
            const largeArc = sweep > Math.PI ? 1 : 0;
            const d = [
                "M", x1.toFixed(2), y1.toFixed(2),
                "A", outerR, outerR, 0, largeArc, 1, x2.toFixed(2), y2.toFixed(2),
                "L", xi2.toFixed(2), yi2.toFixed(2),
                "A", innerR, innerR, 0, largeArc, 0, xi1.toFixed(2), yi1.toFixed(2),
                "Z"
            ].join(" ");
            const midAng = start + sweep / 2;
            const labelR = outerR * 0.78;
            const lx = cx + labelR * Math.cos(midAng);
            const ly = cy + labelR * Math.sin(midAng);
            start = end;
            return { d, color: s.color, label: s.label, weight: s.weight, lx, ly };
        }).filter(Boolean);
        // Only show a label on slices big enough to host readable text. The small
        // slices are covered in the legend, so skipping them here keeps the donut
        // clean.
        const LABEL_MIN = 0.06;
        return (React.createElement("svg", { viewBox: "0 0 " + size + " " + size, width: "100%", height: size, style: { display: "block", maxWidth: size } },
            paths.map((p, i) => (React.createElement("path", { key: i, d: p.d, fill: p.color, stroke: "var(--bg-0)", strokeWidth: "1.5" },
                React.createElement("title", null,
                    p.label,
                    ": ",
                    (p.weight * 100).toFixed(1),
                    "%")))),
            paths.map((p, i) => p.weight > LABEL_MIN && (React.createElement("text", { key: "t" + i, x: p.lx, y: p.ly, fill: "var(--bg-0)", fontSize: "11", fontWeight: "700", textAnchor: "middle", dominantBaseline: "central", style: { pointerEvents: "none", fontFamily: "var(--font-body)" } },
                (p.weight * 100).toFixed(1),
                "%"))),
            centerValue != null && (React.createElement("text", { x: cx, y: cy - 4, fill: "var(--text-0)", fontSize: "34", fontWeight: "700", textAnchor: "middle", dominantBaseline: "central", style: { fontFamily: "var(--font-body)", letterSpacing: ".5px" } }, centerValue)),
            centerLabel && (React.createElement("text", { x: cx, y: cy + 20, fill: "var(--text-3)", fontSize: "9", textAnchor: "middle", dominantBaseline: "central", style: { letterSpacing: 1.5, fontFamily: "var(--font-mono)", textTransform: "uppercase" } }, centerLabel))));
    }
    function DonutLegend({ slices, columns = 1 }) {
        return (React.createElement("div", { className: "ro-stack-mobile", style: { display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: "8px 20px", alignContent: "center" } }, slices.map((s, i) => (React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, minWidth: 0 } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } },
                React.createElement("span", { style: { display: "inline-block", width: 10, height: 10, borderRadius: 2, background: s.color, flex: "0 0 auto" } }),
                React.createElement("span", { style: { fontSize: 11, color: "var(--text-1)", fontWeight: 600, fontFamily: "var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.label)),
            React.createElement("span", { style: { fontSize: 11, color: "var(--text-2)", fontFamily: "var(--font-mono)", flex: "0 0 auto" } },
                (s.weight * 100).toFixed(1),
                "%"))))));
    }
    function ConfigBadge({ pfMode, pfSims, allocCount }) {
        const text = pfMode === 'equalweight'
            ? "EQUAL WEIGHT - " + (allocCount || "N") + " POS"
            : pfMode === 'hrp'
                ? "HRP - " + (allocCount || "N") + " POS"
                : "MARKOWITZ - " + (pfSims || 0).toLocaleString() + " ITER.";
        return (React.createElement("div", { style: { fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--text-3)", fontWeight: 600, fontFamily: "var(--font-mono)" } }, text));
    }
    function formatPct(v) {
        const n = Number(v || 0);
        return Number.isFinite(n) ? n.toFixed(n % 1 === 0 ? 0 : 1) + '%' : '-';
    }
    function portfolioPresetValues(preset, current = {}) {
        switch (preset) {
            case 'conservative':
                return { pfMinWeight: 2, pfMaxWeight: 12, pfMaxPos: 15, pfMode: 'minvol', pfCorFilter: true, pfCorThresh: 0.80 };
            case 'balanced':
                return { pfMinWeight: 3, pfMaxWeight: 18, pfMaxPos: 10, pfMode: 'maxsharpe', pfCorFilter: true, pfCorThresh: 0.80 };
            case 'concentrated':
                return { pfMinWeight: 5, pfMaxWeight: 30, pfMaxPos: 6, pfMode: 'maxret', pfCorFilter: false, pfCorThresh: 0.80 };
            case 'equalweight':
                return { pfMinWeight: Math.max(0, Math.min(100, 100 / Math.max(2, Number(current.pfMaxPos) || 10))), pfMaxWeight: 25, pfMaxPos: 10, pfMode: 'equalweight', pfCorFilter: true, pfCorThresh: 0.80 };
            default:
                return null;
        }
    }
    function SectionCard({ S, title, subtitle, isOpen, onToggle, children }) {
        return (React.createElement("div", { style: { ...S.panel, padding: "18px 20px", marginBottom: 12 } },
            React.createElement("button", { type: "button", onClick: onToggle, style: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", marginBottom: isOpen ? 14 : 0 } },
                React.createElement("div", { style: { textAlign: "left" } },
                    React.createElement("div", { style: S.sectionTitle }, title),
                    subtitle && React.createElement("div", { style: { ...S.sectionMeta, marginTop: 6 } }, subtitle)),
                React.createElement("div", { style: S.statusBadge(isOpen ? "info" : "neutral") }, isOpen ? 'Ocultar' : 'Mostrar')),
            isOpen && children));
    }
    // ── Config card (unchanged behavior, kept here for clarity) ────────────────
    function ConfigCard(ctx) {
        var _a, _b, _c;
        const { S, pfCapital, setPfCapital, pfMinWeight, setPfMinWeight, pfMaxWeight, setPfMaxWeight, pfMaxPos, setPfMaxPos, pfRiskFree, setPfRiskFree, pfUniverseSource, setPfUniverseSource, pfSims, setPfSims, pfSeed, setPfSeed, pfMode, setPfMode, pfStopType, setPfStopType, pfStopATRMult, setPfStopATRMult, pfStopATRPeriod, setPfStopATRPeriod, pfStopPctVal, setPfStopPctVal, pfCorFilter, setPfCorFilter, pfCorThresh, setPfCorThresh, portfolio, pfConfigOpen, setPfConfigOpen, pfPreset, setPfPreset, savedPfPresets, pfPresetName, setPfPresetName, selectedPfPresetId, setSelectedPfPresetId, savePortfolioPreset, loadPortfolioPreset, deletePortfolioPreset, exportPortfolioPresets, importPortfolioPresets, PF_DEFAULTS } = ctx;
        const inp = { ...S.inp, width: "100%", height: 38, minHeight: 38, padding: "7px 12px", fontSize: 12, lineHeight: "20px", background: "var(--bg-2)" };
        const selStyle = { ...inp, minWidth: 0 };
        const [minWeightDraft, setMinWeightDraft] = useState(String((_a = pfMinWeight !== null && pfMinWeight !== void 0 ? pfMinWeight : PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.minWeight) !== null && _a !== void 0 ? _a : 1));
        const [corThreshDraft, setCorThreshDraft] = useState(Number((_b = pfCorThresh !== null && pfCorThresh !== void 0 ? pfCorThresh : PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.corThresh) !== null && _b !== void 0 ? _b : 0.8).toFixed(2));
        React.useEffect(() => {
            var _a;
            setMinWeightDraft(String((_a = pfMinWeight !== null && pfMinWeight !== void 0 ? pfMinWeight : PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.minWeight) !== null && _a !== void 0 ? _a : 1));
        }, [pfMinWeight, PF_DEFAULTS]);
        React.useEffect(() => {
            var _a;
            setCorThreshDraft(Number((_a = pfCorThresh !== null && pfCorThresh !== void 0 ? pfCorThresh : PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.corThresh) !== null && _a !== void 0 ? _a : 0.8).toFixed(2));
        }, [pfCorThresh, PF_DEFAULTS]);
        const sideStopBtn = (active) => ({
            ...S.btn, padding: "7px 14px", fontSize: 11, fontWeight: 600,
            background: active ? "var(--accent-dim)" : "transparent",
            border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
            color: active ? "var(--accent)" : "var(--text-2)",
        });
        const recommendedMin = Math.max(0, +(100 / Math.max(2, Number(pfMaxPos) || 10)).toFixed(1));
        const minTooHigh = Number(pfMinWeight || 0) > Number(pfMaxWeight || 0);
        const impossibleByCount = (Number(pfMinWeight || 0) * Math.max(2, Number(pfMaxPos) || 0)) > 100;
        const maxTooLowForCount = (Number(pfMaxWeight || 0) * Math.max(2, Number(pfMaxPos) || 0)) < 100;
        const warnings = [];
        if (minTooHigh)
            warnings.push('El mínimo por acción no puede ser mayor que el peso máximo.');
        if (impossibleByCount)
            warnings.push('El mínimo por acción × el máximo de posiciones supera 100%.');
        if (maxTooLowForCount)
            warnings.push('Con este máximo de peso y cantidad de posiciones, no se puede invertir 100% del capital.');
        if (Number(pfMinWeight || 0) > recommendedMin)
            warnings.push('El mínimo por acción esta por encima del nivel sugerido para este número de posiciones.');
        const applyPreset = (preset) => {
            setPfPreset(preset);
            const next = portfolioPresetValues(preset, { pfMaxPos });
            if (!next)
                return;
            setPfMinWeight(next.pfMinWeight);
            setPfMaxWeight(next.pfMaxWeight);
            setPfMaxPos(next.pfMaxPos);
            setPfMode(next.pfMode);
            setPfCorFilter(next.pfCorFilter);
            setPfCorThresh(next.pfCorThresh);
        };
        const resetDefaults = () => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
            setPfPreset('custom');
            setPfCapital((_a = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.capital) !== null && _a !== void 0 ? _a : 1000000);
            setPfMinWeight((_b = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.minWeight) !== null && _b !== void 0 ? _b : 1);
            setPfMaxWeight((_c = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.maxWeight) !== null && _c !== void 0 ? _c : 25);
            setPfMaxPos((_d = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.maxPos) !== null && _d !== void 0 ? _d : 10);
            setPfRiskFree((_e = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.riskFree) !== null && _e !== void 0 ? _e : 5);
            setPfCorFilter((_f = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.corFilter) !== null && _f !== void 0 ? _f : true);
            setPfCorThresh((_g = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.corThresh) !== null && _g !== void 0 ? _g : 0.8);
            setPfMode((_h = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.mode) !== null && _h !== void 0 ? _h : 'maxsharpe');
            setPfSims((_j = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.sims) !== null && _j !== void 0 ? _j : 30000);
            setPfStopType((_k = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.stopType) !== null && _k !== void 0 ? _k : 'none');
            setPfStopATRMult((_l = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.stopATRMult) !== null && _l !== void 0 ? _l : 2);
            setPfStopATRPeriod((_m = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.stopATRPeriod) !== null && _m !== void 0 ? _m : 14);
            setPfStopPctVal((_o = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.stopPctVal) !== null && _o !== void 0 ? _o : 8);
            setPfUniverseSource((_p = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.universeSource) !== null && _p !== void 0 ? _p : 'scan');
        };
        return (React.createElement(SectionCard, { S: S, title: "Configuraci\u00F3n de optimizacion", subtitle: "Capital, pesos, riesgo y construccion del portafolio", isOpen: pfConfigOpen, onToggle: () => setPfConfigOpen(v => !v) },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 } },
                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                    React.createElement("div", { style: { fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--text-3)", fontWeight: 600, fontFamily: "var(--font-mono)" } }, "Preset"),
                    React.createElement("select", { value: pfPreset || 'custom', onChange: e => applyPreset(e.target.value), style: { ...selStyle, width: 180, padding: '7px 10px', fontSize: 11 } },
                        React.createElement("option", { value: "custom" }, "Custom"),
                        React.createElement("option", { value: "conservative" }, "Conservador"),
                        React.createElement("option", { value: "balanced" }, "Balanceado"),
                        React.createElement("option", { value: "concentrated" }, "Concentrado"),
                        React.createElement("option", { value: "equalweight" }, "Equal Weight")),
                    React.createElement("button", { onClick: resetDefaults, style: { ...S.btn, padding: '7px 12px', fontSize: 11 } }, "Reset")),
                React.createElement(ConfigBadge, { pfMode: pfMode, pfSims: pfSims, allocCount: (_c = portfolio === null || portfolio === void 0 ? void 0 : portfolio.allocations) === null || _c === void 0 ? void 0 : _c.length })),
            React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 14, padding: "8px 10px", border: "1px solid var(--panel-soft-border)", borderRadius: 8, background: "var(--panel-accent-bg)" } },
                React.createElement("div", { style: { fontSize: 8, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: .8, fontWeight: 700 } }, "Mis presets"),
                React.createElement("input", { value: pfPresetName || "", onChange: e => setPfPresetName(e.target.value), placeholder: "Nombre del preset", style: { ...S.inp, width: 180 } }),
                React.createElement("button", { onClick: savePortfolioPreset, style: { ...S.btnG(true), fontSize: 9, borderColor: "rgba(0,160,255,.4)", color: "var(--accent)" } }, selectedPfPresetId ? "Actualizar" : "Guardar"),
                React.createElement("select", { value: selectedPfPresetId || "", onChange: e => {
                        const id = e.target.value;
                        setSelectedPfPresetId(id);
                        const item = (savedPfPresets || []).find(x => x.id === id);
                        if (item)
                            setPfPresetName(item.name || "");
                    }, style: { ...S.inp, width: 190 } },
                    React.createElement("option", { value: "" }, "Seleccionar preset..."),
                    (savedPfPresets || []).map(p => React.createElement("option", { key: p.id, value: p.id }, p.name))),
                React.createElement("button", { onClick: loadPortfolioPreset, style: { ...S.btnG(false), fontSize: 9 } }, "Cargar"),
                React.createElement("button", { onClick: deletePortfolioPreset, style: { ...S.btnG(false), fontSize: 9, color: "var(--red)", borderColor: "rgba(220,50,50,.28)" } }, "Eliminar"),
                selectedPfPresetId && React.createElement("button", { onClick: () => { setSelectedPfPresetId(""); setPfPresetName(""); }, style: { ...S.btnG(false), fontSize: 9 } }, "Nuevo"),
                React.createElement("button", { onClick: exportPortfolioPresets, style: { ...S.btnG(false), fontSize: 9, marginLeft: "auto" } }, "Exportar JSON"),
                React.createElement("label", { style: { ...S.btnG(false), fontSize: 9, cursor: "pointer", display: "inline-flex", alignItems: "center" } },
                    "Importar JSON",
                    React.createElement("input", { type: "file", accept: "application/json,.json", onChange: e => { var _a; importPortfolioPresets((_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0]); e.target.value = ''; }, style: { display: "none" } }))),
            warnings.length > 0 && (React.createElement("div", { style: { marginBottom: 14, padding: '10px 12px', border: '1px solid var(--panel-warning-border)', borderRadius: 10, background: 'var(--panel-warning-bg)' } },
                React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: 'var(--amber)', marginBottom: 6 } }, "Advertencias de configuraci\u00F3n"),
                React.createElement("ul", { style: { margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 11, lineHeight: 1.45 } }, warnings.map((w, i) => React.createElement("li", { key: i }, w))))),
            React.createElement("div", { className: "ro-stack-mobile", style: { display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14, marginBottom: 14 } },
                React.createElement(Field, { label: "Capital ($)" },
                    React.createElement("input", { type: "number", min: 1, step: 1000, value: pfCapital !== null && pfCapital !== void 0 ? pfCapital : '', onChange: e => { var _a; const raw = e.target.value; setPfPreset('custom'); if (raw === '')
                            return setPfCapital((_a = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.capital) !== null && _a !== void 0 ? _a : 1000000); const n = Number(raw); if (Number.isFinite(n))
                            setPfCapital(Math.max(1, n)); }, style: inp })),
                React.createElement(Field, { label: "Min por acci\u00F3n %" },
                    React.createElement("input", { type: "text", inputMode: "decimal", value: minWeightDraft, onFocus: e => e.target.select(), onChange: e => { const raw = e.target.value.replace(',', '.'); if (!/^\d*\.?\d*$/.test(raw))
                            return; setPfPreset('custom'); setMinWeightDraft(raw); }, onBlur: () => { var _a; const fallback = (_a = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.minWeight) !== null && _a !== void 0 ? _a : 1; const raw = String(minWeightDraft !== null && minWeightDraft !== void 0 ? minWeightDraft : '').trim(); if (raw === '') {
                            setPfMinWeight(fallback);
                            setMinWeightDraft(String(fallback));
                            return;
                        } const n = Number(raw); const next = Number.isFinite(n) ? Math.min(100, Math.max(0.5, n)) : fallback; setPfMinWeight(next); setMinWeightDraft(String(next)); }, placeholder: "1", style: inp })),
                React.createElement(Field, { label: "Max peso %" },
                    React.createElement("input", { type: "number", min: 1, max: 100, step: 0.5, value: pfMaxWeight !== null && pfMaxWeight !== void 0 ? pfMaxWeight : '', onChange: e => { var _a; const raw = e.target.value; setPfPreset('custom'); if (raw === '')
                            return setPfMaxWeight((_a = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.maxWeight) !== null && _a !== void 0 ? _a : 25); const n = Number(raw); if (Number.isFinite(n))
                            setPfMaxWeight(Math.min(100, Math.max(1, n))); }, style: inp })),
                React.createElement(Field, { label: "Max posiciones" },
                    React.createElement("input", { type: "number", min: 2, max: 50, step: 1, value: pfMaxPos !== null && pfMaxPos !== void 0 ? pfMaxPos : '', onChange: e => { var _a; const raw = e.target.value; setPfPreset('custom'); if (raw === '')
                            return setPfMaxPos((_a = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.maxPos) !== null && _a !== void 0 ? _a : 10); const n = Number(raw); if (Number.isFinite(n))
                            setPfMaxPos(Math.min(50, Math.max(2, Math.round(n)))); }, style: inp })),
                React.createElement(Field, { label: "Risk-Free %" },
                    React.createElement("input", { type: "number", min: 0, max: 100, step: 0.1, value: pfRiskFree !== null && pfRiskFree !== void 0 ? pfRiskFree : '', onChange: e => { const raw = e.target.value; setPfPreset('custom'); if (raw === '')
                            return setPfRiskFree(0); const n = Number(raw); if (Number.isFinite(n))
                            setPfRiskFree(Math.min(100, Math.max(0, n))); }, style: inp }))),
            React.createElement("div", { className: "ro-stack-mobile", style: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 14, alignItems: "flex-start" } },
                React.createElement(Field, { label: "Origen universo" },
                    React.createElement("select", { value: pfUniverseSource, onChange: e => setPfUniverseSource(e.target.value), style: selStyle },
                        React.createElement("option", { value: "scan" }, "Scanner"),
                        React.createElement("option", { value: "manual" }, "Manual"))),
                React.createElement(Field, { label: "Iteraciones" },
                    React.createElement("select", { value: pfSims, onChange: e => { setPfPreset('custom'); setPfSims(+e.target.value); }, style: selStyle, disabled: pfMode === 'equalweight', title: pfMode === 'equalweight' ? "Equal weight no requiere iteraciones" : "" },
                        React.createElement("option", { value: 5000 }, "5,000"),
                        React.createElement("option", { value: 10000 }, "10,000"),
                        React.createElement("option", { value: 25000 }, "25,000"),
                        React.createElement("option", { value: 50000 }, "50,000"),
                        React.createElement("option", { value: 100000 }, "100,000"))),
                React.createElement(Field, { label: "Semilla" },
                    React.createElement("input", { type: "number", min: 0, step: 1, value: pfSeed !== null && pfSeed !== void 0 ? pfSeed : '', disabled: pfMode === 'equalweight', title: "Misma semilla y configuraci\u00F3n producen el mismo portafolio. C\u00E1mbiala para explorar otras muestras.", onChange: e => { const raw = e.target.value; setPfPreset('custom'); if (raw === '')
                            return setPfSeed(42); const n = Number(raw); if (Number.isFinite(n))
                            setPfSeed(Math.max(0, Math.round(n))); }, style: inp })),
                React.createElement(Field, { label: "Optimizaci\u00F3n" },
                    React.createElement("select", { value: pfMode, onChange: e => { setPfPreset('custom'); setPfMode(e.target.value); }, style: selStyle },
                        React.createElement("option", { value: "maxsharpe" }, "Max Sharpe"),
                        React.createElement("option", { value: "minvol" }, "Min Varianza"),
                        React.createElement("option", { value: "maxret" }, "Max Return"),
                        React.createElement("option", { value: "equalweight" }, "Equal Weight"),
                        React.createElement("option", { value: "hrp" }, "HRP (paridad de riesgo jer\u00E1rquica)"))),
                React.createElement(Field, { label: "Stop-Loss" },
                    React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" } },
                        React.createElement("button", { onClick: () => { setPfPreset('custom'); setPfStopType("none"); }, style: sideStopBtn(pfStopType === "none") }, "Sin stop"),
                        React.createElement("button", { onClick: () => { setPfPreset('custom'); setPfStopType("pct"); }, style: sideStopBtn(pfStopType === "pct") }, "% Fijo"),
                        React.createElement("button", { onClick: () => { setPfPreset('custom'); setPfStopType("atr"); }, style: sideStopBtn(pfStopType === "atr") }, "ATR")),
                    pfStopType === "atr" && (React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", marginTop: 10, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" } },
                        React.createElement("span", null, "ATR("),
                        React.createElement("input", { type: "number", min: 1, max: 200, value: pfStopATRPeriod, onChange: e => { setPfPreset('custom'); setPfStopATRPeriod(+e.target.value || 14); }, style: { ...S.inp, width: 56, padding: "5px 8px", textAlign: "center" } }),
                        React.createElement("span", null, ") x"),
                        React.createElement("input", { type: "number", step: 0.1, min: 0.5, max: 5, value: pfStopATRMult, onChange: e => { setPfPreset('custom'); setPfStopATRMult(+e.target.value || 2); }, style: { ...S.inp, width: 56, padding: "5px 8px", textAlign: "center" } }))),
                    pfStopType === "pct" && (React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-2)" } },
                        React.createElement("input", { type: "number", step: 1, min: 1, max: 50, value: pfStopPctVal, onChange: e => { setPfPreset('custom'); setPfStopPctVal(+e.target.value || 8); }, style: { ...S.inp, width: 64, padding: "5px 8px", textAlign: "center" } }),
                        React.createElement("span", null, "%"))))),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid var(--card-border)", marginTop: 4 } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                    React.createElement("button", { type: "button", className: "ui-switch", onClick: () => { setPfPreset('custom'); setPfCorFilter(!pfCorFilter); }, role: "switch", "aria-label": "Filtro de correlaci\u00F3n", "aria-checked": pfCorFilter },
                        React.createElement("span", { className: "ui-switch-thumb" })),
                    React.createElement("span", { style: { fontSize: 11, color: pfCorFilter ? "var(--accent)" : "var(--text-2)", fontWeight: 600 } }, "Filtro de correlaci\u00F3n")),
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                    React.createElement("label", { htmlFor: "portfolio-correlation-threshold", style: { fontSize: 10, color: "var(--text-2)", fontFamily: "var(--font-body)" } }, "Umbral"),
                    React.createElement("input", { id: "portfolio-correlation-threshold", type: "text", inputMode: "decimal", value: corThreshDraft, onFocus: e => e.target.select(), onChange: e => { const raw = e.target.value.replace(',', '.'); if (!/^\d*\.?\d*$/.test(raw))
                            return; setPfPreset('custom'); setCorThreshDraft(raw); }, onBlur: () => { var _a; const fallback = (_a = PF_DEFAULTS === null || PF_DEFAULTS === void 0 ? void 0 : PF_DEFAULTS.corThresh) !== null && _a !== void 0 ? _a : 0.8; const raw = String(corThreshDraft !== null && corThreshDraft !== void 0 ? corThreshDraft : '').trim(); if (raw === '') {
                            setPfCorThresh(fallback);
                            setCorThreshDraft(Number(fallback).toFixed(2));
                            return;
                        } const n = Number(raw); const next = Number.isFinite(n) ? Math.min(0.99, Math.max(0.5, n)) : fallback; setPfCorThresh(next); setCorThreshDraft(Number(next).toFixed(2)); }, disabled: !pfCorFilter, style: { ...S.inp, width: 70, padding: "7px 10px", textAlign: "center", opacity: pfCorFilter ? 1 : .4 } })))));
    }
    // ── Manual tickers card (watchlist chips) ──────────────────────────────────
    function ManualTickersCard(ctx) {
        const { S, pfManualTickers, setPfManualTickers, pfWatchlistName, setPfWatchlistName, pfWatchlists, pfSelectedWatchlistId, setPfSelectedWatchlistId, pfCsvInputRef, saveCurrentManualWatchlist, exportCurrentManualCsv, importPortfolioCsvFile, pfManualList, portfolioWatchlistActions, setPfUniverseSource, pfManualOpen, setPfManualOpen } = ctx;
        const countInWatchlist = (wl) => {
            if (!(wl === null || wl === void 0 ? void 0 : wl.tickers))
                return 0;
            return wl.tickers.split(/[\s,]+/).filter(Boolean).length;
        };
        const loadChip = (wl) => {
            setPfSelectedWatchlistId(wl.id);
            setPfManualTickers(wl.tickers || '');
            setPfWatchlistName(wl.name || '');
            setPfUniverseSource('manual');
        };
        const deleteChip = (wl, e) => {
            e.stopPropagation();
            if (!confirm("Eliminar la watchlist \"" + wl.name + "\"?"))
                return;
            if (pfSelectedWatchlistId === wl.id)
                setPfSelectedWatchlistId('');
            portfolioWatchlistActions && portfolioWatchlistActions.deleteSelectedManualWatchlist(wl.id);
        };
        return (React.createElement(SectionCard, { S: S, title: "Tickers manuales y watchlists", subtitle: "Crea tu universo propio para el portafolio", isOpen: pfManualOpen, onToggle: () => setPfManualOpen(v => !v) },
            React.createElement("div", { className: "ro-stack-mobile", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" } },
                React.createElement("div", null,
                    React.createElement(FieldLabel, null, "Tickers (separar por coma)"),
                    React.createElement("textarea", { value: pfManualTickers, onChange: e => setPfManualTickers(e.target.value.toUpperCase()), rows: 4, placeholder: "NVDA, MSFT, JPM, LLY, XOM, COST, CAT, V", style: { ...S.inp, width: "100%", minHeight: 110, resize: "vertical", fontFamily: "var(--font-mono)", lineHeight: 1.5, padding: "10px 12px", fontSize: 12 } }),
                    React.createElement("div", { style: { fontSize: 9, color: "var(--text-3)", marginTop: 6, fontFamily: "var(--font-mono)" } },
                        pfManualList.length,
                        " tickers detectados")),
                React.createElement("div", null,
                    React.createElement(FieldLabel, null, "Watchlists guardadas"),
                    React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 10 } },
                        React.createElement("input", { value: pfWatchlistName, onChange: e => setPfWatchlistName(e.target.value), placeholder: "nombre watchlist", style: { ...S.inp, flex: 1, padding: "9px 12px", fontSize: 12, background: "var(--bg-2)" } }),
                        React.createElement("button", { onClick: saveCurrentManualWatchlist, style: { ...S.btnG(true), padding: "8px 16px" } }, "Guardar")),
                    React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, minHeight: 32 } },
                        pfWatchlists.length === 0 && (React.createElement("div", { style: { fontSize: 10, color: "var(--text-3)", fontStyle: "italic", padding: "6px 0" } }, "Aun no hay watchlists guardadas.")),
                        pfWatchlists.map(wl => {
                            const active = pfSelectedWatchlistId === wl.id;
                            return (React.createElement("button", { key: wl.id, onClick: () => loadChip(wl), title: "Cargar \"" + wl.name + "\" (" + countInWatchlist(wl) + " tickers)", style: { display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px 6px 12px", borderRadius: 999,
                                    background: active ? "var(--accent-dim)" : "var(--bg-3)",
                                    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
                                    color: active ? "var(--accent)" : "var(--text-1)",
                                    fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 600, cursor: "pointer", transition: "all .15s" } },
                                React.createElement("span", null, wl.name),
                                React.createElement("span", { style: { fontSize: 10, opacity: .7 } }, countInWatchlist(wl)),
                                React.createElement("span", { onClick: (e) => deleteChip(wl, e), style: { opacity: .55, padding: "0 2px", borderRadius: 4, cursor: "pointer", transition: "opacity .15s" }, onMouseEnter: e => e.currentTarget.style.opacity = 1, onMouseLeave: e => e.currentTarget.style.opacity = .55 }, "\u00D7")));
                        })),
                    React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
                        React.createElement("button", { onClick: () => { var _a; return (_a = pfCsvInputRef.current) === null || _a === void 0 ? void 0 : _a.click(); }, style: { ...S.btnG(false), padding: "6px 12px" } }, "Importar CSV"),
                        React.createElement("button", { onClick: exportCurrentManualCsv, style: { ...S.btnG(false), padding: "6px 12px" } }, "Exportar CSV"),
                        React.createElement("input", { ref: pfCsvInputRef, type: "file", accept: ".csv,text/csv", style: { display: "none" }, onChange: e => { var _a; const f = (_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0]; importPortfolioCsvFile(f); e.target.value = ""; } }))))));
    }
    // ── Results: KPIs / info bar ───────────────────────────────────────────────
    function KpiRow({ portfolio, pfRiskFree, S }) {
        const retColor = portfolio.portReturn >= 0 ? "var(--green)" : "var(--red)";
        const sharpe = portfolio.portSharpe;
        const sharpeCol = sharpe > 1 ? "var(--accent)" : sharpe > 0.5 ? "var(--amber)" : "var(--red)";
        const kpis = [
            { label: "Retorno Esperado", value: (portfolio.portReturn >= 0 ? "+" : "") + (portfolio.portReturn * 100).toFixed(1) + "%", sub: "anualizado", color: retColor },
            { label: "Volatilidad", value: (portfolio.portVol * 100).toFixed(1) + "%", sub: "σ anual", color: "var(--text-0)" },
            { label: "Sharpe Ratio", value: sharpe.toFixed(2), sub: "vs rf " + pfRiskFree + "%", color: sharpeCol },
            { label: "Posiciones", value: portfolio.allocations.length, sub: "optimizadas", color: "var(--accent)" },
        ];
        return (React.createElement("div", { className: "ro-metric-grid", style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 12 } }, kpis.map((k, i) => (React.createElement("div", { key: i, style: { ...S.metricCard, padding: "14px 18px" } },
            React.createElement("div", { style: { ...S.sectionTitle, marginBottom: 8 } }, k.label),
            React.createElement("div", { style: { fontSize: 28, fontWeight: 700, color: k.color, fontFamily: "var(--font-body)", lineHeight: 1.1 } }, k.value),
            React.createElement("div", { style: { fontSize: 10, color: "var(--text-3)", marginTop: 4 } }, k.sub))))));
    }
    function InfoBar({ portfolio, pfSims, pfStopType, scanDirection, S }) {
        const modeLabel = portfolio.mode === 'maxsharpe' ? 'Max Sharpe'
            : portfolio.mode === 'minvol' ? 'Min Varianza'
                : portfolio.mode === 'maxret' ? 'Max Return'
                    : portfolio.mode === 'equalweight' ? 'Equal Weight'
                        : portfolio.mode === 'hrp' ? 'HRP'
                            : portfolio.mode;
        const side = (portfolio.scanDirection || scanDirection || 'long').toLowerCase();
        const sideLabel = side === 'short' ? 'SHORT' : 'LONG';
        const sideColor = side === 'short' ? 'var(--purple)' : 'var(--green)';
        const riskTotal = portfolio.allocations.reduce((a, x) => a + (x.riskAmount || 0), 0);
        return (React.createElement("div", { style: { ...S.panel, padding: "10px 14px", marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },
            React.createElement("span", { style: { ...S.statusBadge("neutral"), color: sideColor } },
                "Lado ",
                sideLabel),
            React.createElement("span", { style: S.statusBadge("info") }, modeLabel),
            React.createElement("span", { style: S.statusBadge("neutral") },
                (portfolio.simsUsed || pfSims).toLocaleString(),
                " muestras"),
            portfolio.seed != null && React.createElement("span", { style: S.statusBadge("neutral"), title: "Semilla del muestreo" },
                "Semilla ",
                portfolio.seed),
            React.createElement("span", { style: S.statusBadge("neutral") }, portfolio.source === "manual" ? "Manual" : "Scanner"),
            portfolio.removedByCor > 0 && React.createElement("span", { style: S.statusBadge("warning") },
                "Corr removidas ",
                portfolio.removedByCor),
            React.createElement("span", { style: S.statusBadge("neutral") },
                "Caja $",
                portfolio.cash.toFixed(0)),
            pfStopType !== "none" && (React.createElement("span", { style: S.statusBadge("danger") },
                "Riesgo ",
                pfStopType.toUpperCase(),
                " $",
                riskTotal.toFixed(0),
                " (",
                (riskTotal / portfolio.capital * 100).toFixed(1),
                "%)"))));
    }
    // ── Nivel 1: Efficient Frontier card ───────────────────────────────────────
    function EfficientFrontierCard({ portfolio, S }) {
        const pts = portfolio.frontier || [];
        if (pts.length < 3) {
            return (React.createElement("div", { style: { ...S.cd, padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 11 } }, "No hay datos suficientes para la frontera eficiente."));
        }
        const vols = pts.map(p => p.vol), rets = pts.map(p => p.ret);
        const minVol = Math.min(...vols) * 0.9, maxVol = Math.max(...vols) * 1.05;
        const minRet = Math.min(...rets) * 1.1, maxRet = Math.max(...rets) * 1.1;
        const rangeV = (maxVol - minVol) || 1, rangeR = (maxRet - minRet) || 1;
        // Generous padding so axis labels don't crowd the plot. Matches the
        // reference mock where titles sit well outside the gridline area.
        const W = 560, H = 360;
        const padL = 70, padR = 30, padT = 26, padB = 64;
        const plotW = W - padL - padR, plotH = H - padT - padB;
        const px = v => padL + ((v - minVol) / rangeV) * plotW;
        const py = r => padT + plotH - ((r - minRet) / rangeR) * plotH;
        // Marker for the chosen optimal point - a small green circle, matching the
        // legend entry. Kept subtle so it doesn't dominate the cloud.
        const markChosen = (p) => p && isFinite(p.vol) && isFinite(p.ret) && (React.createElement("circle", { cx: px(p.vol), cy: py(p.ret), r: 5, fill: "var(--green)", stroke: "var(--bg-0)", strokeWidth: "1.5" },
            React.createElement("title", null,
                "Optimo: ret ",
                p.ret.toFixed(1),
                "% vol ",
                p.vol.toFixed(1),
                "%")));
        // Dashed gridlines - 3 horizontal + 3 vertical, subtle.
        const vGrid = [0.25, 0.5, 0.75].map(f => padL + f * plotW);
        const hGrid = [0.25, 0.5, 0.75].map(f => padT + f * plotH);
        // Text coordinates for axis titles (rotated Y label + centered X label).
        const yLabelX = padL - 50;
        const yLabelY = padT + plotH / 2;
        const xLabelX = padL + plotW / 2;
        const xLabelY = H - 34;
        return (React.createElement("div", { style: { ...S.cd, padding: "14px 18px 14px", display: "flex", flexDirection: "column", height: "100%" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } },
                React.createElement("div", { style: { fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--text-3)", fontWeight: 600, fontFamily: "var(--font-mono)" } }, "Frontera eficiente"),
                React.createElement("div", { style: { fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--text-3)", fontWeight: 600, fontFamily: "var(--font-mono)" } },
                    pts.length.toLocaleString(),
                    " simulaciones")),
            React.createElement("div", { style: { flex: 1, display: "flex", alignItems: "center" } },
                React.createElement("svg", { viewBox: "0 0 " + W + " " + H, style: { width: "100%", height: "auto", display: "block" }, preserveAspectRatio: "xMidYMid meet" },
                    vGrid.map((x, i) => (React.createElement("line", { key: "v" + i, x1: x, y1: padT, x2: x, y2: padT + plotH, stroke: "var(--chart-grid)", strokeWidth: ".5", strokeDasharray: "2,3" }))),
                    hGrid.map((y, i) => (React.createElement("line", { key: "h" + i, x1: padL, y1: y, x2: padL + plotW, y2: y, stroke: "var(--chart-grid)", strokeWidth: ".5", strokeDasharray: "2,3" }))),
                    React.createElement("line", { x1: padL, y1: padT + plotH, x2: padL + plotW, y2: padT + plotH, stroke: "var(--chart-border)", strokeWidth: ".7" }),
                    React.createElement("line", { x1: padL, y1: padT, x2: padL, y2: padT + plotH, stroke: "var(--chart-border)", strokeWidth: ".7" }),
                    pts.map((p, i) => (React.createElement("circle", { key: i, cx: px(p.vol), cy: py(p.ret), r: "2.3", fill: "var(--chart-pill-1)", opacity: ".55" }))),
                    markChosen(portfolio.chosenPoint),
                    React.createElement("text", { x: yLabelX, y: yLabelY, fill: "var(--text-3)", fontSize: "10", textAnchor: "middle", dominantBaseline: "central", transform: `rotate(-90, ${yLabelX}, ${yLabelY})`, style: { fontFamily: "var(--font-mono)", letterSpacing: 1.2, textTransform: "uppercase" } }, "Retorno esperado (%)"),
                    React.createElement("text", { x: xLabelX, y: xLabelY, fill: "var(--text-3)", fontSize: "10", textAnchor: "middle", style: { fontFamily: "var(--font-mono)", letterSpacing: 1.2, textTransform: "uppercase" } }, "Volatilidad (sigma %)"))),
            React.createElement("div", { style: { display: "flex", gap: 24, alignItems: "center", marginTop: 10, paddingTop: 8,
                    borderTop: "1px solid var(--card-border)",
                    fontSize: 10, color: "var(--text-2)", flexWrap: "wrap", fontFamily: "var(--font-mono)" } },
                React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 8 } },
                    React.createElement("span", { style: { width: 16, height: 2, background: "var(--chart-pill-1)", display: "inline-block", borderRadius: 1 } }),
                    "Carteras simuladas"),
                React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 8 } },
                    React.createElement("span", { style: { width: 16, height: 2, background: "var(--green)", display: "inline-block", borderRadius: 1 } }),
                    "Optimo - Sharpe ",
                    portfolio.portSharpe.toFixed(2)))));
    }
    // ── Nivel 1: Unified Donut with segmented "Accion / Sector" ────────────────
    function UnifiedDonutCard({ portfolio, S }) {
        const [mode, setMode] = useState('ticker'); // 'ticker' | 'sector'
        // Build slices based on current mode.
        const slices = useMemo(() => {
            if (mode === 'sector') {
                const secs = (portfolio.sectors || []).filter(s => s.weight > 0);
                const total = secs.reduce((a, b) => a + b.weight, 0) || 1;
                return secs.map((s, i) => ({
                    label: s.name,
                    weight: s.weight / total,
                    color: CHART_COLORS[i % CHART_COLORS.length],
                }));
            }
            const allocs = portfolio.allocations;
            const total = allocs.reduce((a, b) => a + Math.abs(b.signedWeight || b.weight), 0) || 1;
            return allocs.map((a, i) => ({
                label: a.ticker,
                weight: Math.abs(a.signedWeight || a.weight) / total,
                color: CHART_COLORS[i % CHART_COLORS.length],
            }));
        }, [mode, portfolio]);
        const centerValue = slices.length;
        const centerLabel = mode === 'sector' ? 'sectores' : 'posiciones';
        const segBtn = (active) => ({
            padding: "6px 14px",
            fontSize: 11,
            fontWeight: 600,
            fontFamily: "var(--font-body)",
            background: active ? "var(--accent-dim)" : "transparent",
            color: active ? "var(--accent)" : "var(--text-2)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            transition: "all .15s",
        });
        return (React.createElement("div", { style: { ...S.cd, padding: "14px 16px 14px", display: "flex", flexDirection: "column", height: "100%" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 } },
                React.createElement("div", { style: { fontSize: 9, textTransform: "uppercase", letterSpacing: 1.5, color: "var(--text-3)", fontWeight: 600, fontFamily: "var(--font-mono)" } }, "Composicion"),
                React.createElement("div", { style: { display: "inline-flex", gap: 2, padding: 3, background: "var(--bg-2)", border: "1px solid var(--card-border)", borderRadius: "var(--radius)" } },
                    React.createElement("button", { onClick: () => setMode('ticker'), style: segBtn(mode === 'ticker') }, "Por acci\u00F3n"),
                    React.createElement("button", { onClick: () => setMode('sector'), style: segBtn(mode === 'sector') }, "Por sector"))),
            React.createElement("div", { className: "ro-stack-mobile", style: { flex: 1, display: "grid", gridTemplateColumns: "minmax(220px,1fr) minmax(180px,1fr)", gap: 18, alignItems: "center" } },
                React.createElement("div", { style: { display: "flex", justifyContent: "center", alignItems: "center" } },
                    React.createElement(DonutChart, { slices: slices, centerValue: centerValue, centerLabel: centerLabel, size: 260 })),
                React.createElement("div", { style: { maxHeight: 300, overflowY: "auto", paddingRight: 4 } },
                    React.createElement(DonutLegend, { slices: slices, columns: 1 })))));
    }
    // ── Nivel 2: Allocations table (enriched) ──────────────────────────────────
    function CorrelationHeatmapCard({ portfolio, S }) {
        const matrix = (portfolio === null || portfolio === void 0 ? void 0 : portfolio.correlationMatrix) || [];
        if (matrix.length < 2)
            return null;
        const cellStyle = (v) => {
            const x = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
            const alpha = Math.min(0.95, 0.18 + Math.abs(x) * 0.62);
            return {
                background: x >= 0 ? `rgba(239,76,90,${alpha})` : `rgba(34,201,138,${alpha})`,
                color: Math.abs(x) > 0.55 ? "#fff" : "var(--text-0)",
            };
        };
        return (React.createElement("div", { style: { ...S.panel, padding: "14px 16px", marginBottom: 12, overflow: "auto" } },
            React.createElement("div", { style: { ...S.sectionHeader, alignItems: "center", marginBottom: 12 } },
                React.createElement("div", { style: S.sectionTitle }, "Correlacion entre posiciones"),
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 9, color: "var(--text-3)", fontFamily: "var(--font-mono)" } },
                    React.createElement("span", { style: { display: "inline-block", width: 18, height: 8, background: "rgba(34,201,138,.72)", borderRadius: 2 } }),
                    React.createElement("span", null, "Negativa"),
                    React.createElement("span", { style: { display: "inline-block", width: 18, height: 8, background: "rgba(239,76,90,.72)", borderRadius: 2, marginLeft: 8 } }),
                    React.createElement("span", null, "Positiva"))),
            React.createElement("div", { className: "ro-scroll-x" },
                React.createElement("div", { style: { display: "grid", gridTemplateColumns: `88px repeat(${matrix.length}, minmax(46px, 1fr))`, minWidth: Math.max(520, 88 + matrix.length * 54), gap: 2 } },
                    React.createElement("div", null),
                    matrix.map(r => (React.createElement("div", { key: "h" + r.ticker, title: r.ticker, style: { fontSize: 9, color: "var(--text-3)", fontFamily: "var(--font-mono)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.ticker))),
                    matrix.map((r, ri) => (React.createElement(React.Fragment, { key: r.ticker },
                        React.createElement("div", { style: { fontSize: 9, color: "var(--text-2)", fontFamily: "var(--font-mono)", fontWeight: 700, padding: "8px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.ticker),
                        r.row.map((v, ci) => {
                            var _a;
                            return (React.createElement("div", { key: r.ticker + "-" + ci, title: `${r.ticker} / ${(_a = matrix[ci]) === null || _a === void 0 ? void 0 : _a.ticker}: ${Number(v || 0).toFixed(2)}`, style: { ...cellStyle(v), height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700, borderRadius: 3, border: ri === ci ? "1px solid var(--card-border)" : "1px solid var(--row-divider)" } }, Number(v || 0).toFixed(2)));
                        }))))))));
    }
    function AllocationsTable({ portfolio, pfStopType, pfMaxWeight, setSelectedChart, S }) {
        const allocs = portfolio.allocations;
        const fmtPct = v => (v != null ? (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%" : "-");
        const thBase = { ...S.th, padding: "10px 12px" };
        const tdBase = { ...S.td, padding: "9px 12px", fontSize: 11, fontFamily: "var(--font-body)" };
        const barColors = CHART_COLORS;
        return (React.createElement("div", { style: { ...S.tableWrap, maxHeight: "58vh", marginBottom: 12 } },
            React.createElement("div", { style: { ...S.sectionHeader, alignItems: "center", marginBottom: 0, padding: "14px 16px 10px", borderBottom: "1px solid var(--panel-soft-border)", background: "var(--bg-1)" } },
                React.createElement("div", { style: S.sectionTitle }, "Posiciones optimas"),
                React.createElement("span", { style: S.statusBadge("info") },
                    allocs.length,
                    " posiciones")),
            React.createElement("table", { className: "ui-table", style: S.table },
                React.createElement("thead", null,
                    React.createElement("tr", null,
                        React.createElement("th", { style: { ...thBase, textAlign: "left" } }, "Ticker"),
                        React.createElement("th", { style: { ...thBase, textAlign: "left" } }, "Empresa"),
                        React.createElement("th", { style: { ...thBase, textAlign: "left" } }, "Peso %"),
                        React.createElement("th", { style: { ...thBase, textAlign: "right" } }, "Monto"),
                        React.createElement("th", { style: { ...thBase, textAlign: "right" } }, "Acciones"),
                        React.createElement("th", { style: { ...thBase, textAlign: "right" } }, "Precio"),
                        React.createElement("th", { style: { ...thBase, textAlign: "right" } }, "Stop"),
                        React.createElement("th", { style: { ...thBase, textAlign: "right" } }, "Retorno An."),
                        React.createElement("th", { style: { ...thBase, textAlign: "right" } }, "Volatilidad"),
                        React.createElement("th", { style: { ...thBase, textAlign: "right" } }, "Sharpe"),
                        React.createElement("th", { style: { ...thBase, textAlign: "center" } }, "Grafico"))),
                React.createElement("tbody", null,
                    allocs.map((a, i) => {
                        const color = barColors[i % barColors.length];
                        const wPct = a.weight * 100;
                        const retColor = a.annRet >= 0 ? "var(--green)" : "var(--red)";
                        const sharpeCol = a.sharpe > 1 ? "var(--green)" : a.sharpe > 0 ? "var(--amber)" : "var(--red)";
                        return (React.createElement("tr", { key: a.ticker, style: { cursor: "pointer" }, onClick: () => setSelectedChart({ ticker: a.ticker, side: a.side || "long", source: "Portafolio" }) },
                            React.createElement("td", { style: { ...tdBase, fontWeight: 700 } },
                                React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 8 } },
                                    React.createElement("span", { style: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color } }),
                                    React.createElement("span", { style: { color: "var(--accent)" } }, a.ticker))),
                            React.createElement("td", { className: "ui-truncate", style: { ...tdBase, color: "var(--text-2)", fontWeight: 400, maxWidth: 220 }, title: a.longName || a.shortName || a.name }, a.shortName || a.name || "-"),
                            React.createElement("td", { style: { ...tdBase } },
                                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
                                    React.createElement("div", { style: { width: 70, height: 6, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden", flex: "0 0 auto" } },
                                        React.createElement("div", { style: { width: Math.min(100, wPct * 4) + "%", height: "100%", background: color, borderRadius: 3, opacity: wPct >= pfMaxWeight - 1 ? .7 : 1 } })),
                                    React.createElement("span", { style: { fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--text-1)", minWidth: 44 } },
                                        wPct.toFixed(1),
                                        "%"))),
                            React.createElement("td", { style: { ...tdBase, textAlign: "right", color: "var(--text-1)" } },
                                "$",
                                a.amount.toFixed(0)),
                            React.createElement("td", { style: { ...tdBase, textAlign: "right", color: "var(--text-3)" } }, a.shares),
                            React.createElement("td", { style: { ...tdBase, textAlign: "right", color: "var(--text-1)" } },
                                "$",
                                a.price.toFixed(2)),
                            React.createElement("td", { style: { ...tdBase, textAlign: "right", color: "var(--text-3)" } }, a.activeStop ? "$" + a.activeStop.toFixed(2) : "-"),
                            React.createElement("td", { style: { ...tdBase, textAlign: "right", color: retColor, fontWeight: 600 } }, fmtPct(a.annRet)),
                            React.createElement("td", { style: { ...tdBase, textAlign: "right", color: "var(--text-1)" } },
                                (a.annVol * 100).toFixed(2),
                                "%"),
                            React.createElement("td", { style: { ...tdBase, textAlign: "right", color: sharpeCol, fontWeight: 600 } }, a.sharpe.toFixed(2)),
                            React.createElement("td", { title: "Abrir grafico", style: { ...tdBase, textAlign: "center", padding: "6px 10px" } },
                                React.createElement("div", { style: { display: "flex", justifyContent: "center" } },
                                    React.createElement(Sparkline, { closes: a.spark })))));
                    }),
                    React.createElement("tr", { style: { background: "rgba(0,160,255,.03)" } },
                        React.createElement("td", { style: { ...tdBase, fontWeight: 700, color: "var(--accent)", borderTop: "2px solid var(--panel-soft-border)", borderBottom: "none" } }, "TOTAL"),
                        React.createElement("td", { style: { ...tdBase, borderTop: "2px solid var(--panel-soft-border)", borderBottom: "none" } }),
                        React.createElement("td", { style: { ...tdBase, fontWeight: 700, color: "var(--accent)", borderTop: "2px solid var(--panel-soft-border)", borderBottom: "none" } },
                            (allocs.reduce((a, x) => a + x.weight, 0) * 100).toFixed(1),
                            "%"),
                        React.createElement("td", { style: { ...tdBase, fontWeight: 700, textAlign: "right", color: "var(--accent)", borderTop: "2px solid var(--panel-soft-border)", borderBottom: "none" } },
                            "$",
                            allocs.reduce((a, x) => a + x.amount, 0).toFixed(0)),
                        React.createElement("td", { style: { ...tdBase, textAlign: "right", color: "var(--text-3)", borderTop: "2px solid var(--panel-soft-border)", borderBottom: "none" } }, allocs.reduce((a, x) => a + x.shares, 0)),
                        React.createElement("td", { colSpan: 6, style: { borderTop: "2px solid var(--panel-soft-border)", borderBottom: "none" } }))))));
    }
    function ExportBar({ portfolio, S }) {
        const doExport = () => {
            const hdr = ["Ticker", "Empresa", "Sector", "Industria", "Peso%", "Monto", "Acciones", "Precio", "StopLoss", "Riesgo$", "RetAnual%", "VolAnual%", "Sharpe"];
            const rows = [hdr.join(",")];
            portfolio.allocations.forEach(a => {
                rows.push([
                    a.ticker, '"' + (a.name || "") + '"', '"' + (a.sector || "") + '"', '"' + (a.industry || "") + '"',
                    (a.weight * 100).toFixed(2), a.amount.toFixed(0), a.shares, a.price.toFixed(2),
                    a.activeStop ? a.activeStop.toFixed(2) : "", a.riskAmount ? a.riskAmount.toFixed(0) : "",
                    (a.annRet * 100).toFixed(2), (a.annVol * 100).toFixed(2), a.sharpe.toFixed(3),
                ].join(","));
            });
            rows.push("", ["Retorno Portafolio", (portfolio.portReturn * 100).toFixed(2) + "%"].join(","), ["Volatilidad", (portfolio.portVol * 100).toFixed(2) + "%"].join(","), ["Sharpe", portfolio.portSharpe.toFixed(3)].join(","), ["Capital", "$" + portfolio.capital].join(","));
            const b = new Blob([rows.join("\n")], { type: "text/csv" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(b);
            a.download = "portfolio_" + new Date().toISOString().slice(0, 10) + ".csv";
            a.click();
        };
        return (React.createElement("div", { style: { marginTop: 12, display: "flex", gap: 6 } },
            React.createElement("button", { onClick: doExport, style: S.ghostBtn }, "Exportar CSV")));
    }
    // ── X-ray: avisos de concentración y diversificación ─────────────────────────
    function XrayCard({ portfolio, S }) {
        const checks = React.useMemo(() => window.StockScannerCore.portfolioXray(portfolio), [portfolio]);
        if (!checks.length)
            return null;
        const warns = checks.filter(c => c.level === 'warn').length;
        const tone = { warn: 'var(--amber)', ok: 'var(--green)', info: 'var(--text-2)' };
        const icon = { warn: '!', ok: '✓', info: 'i' };
        return (React.createElement("section", { "aria-label": "X-ray del portafolio", style: { ...S.panel, padding: 14, marginBottom: 12 } },
            React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' } },
                React.createElement("strong", { style: { fontSize: 13 } }, "X-ray"),
                React.createElement("span", { style: { fontSize: 11, color: warns ? 'var(--amber)' : 'var(--green)' } }, warns ? `${warns} aviso${warns > 1 ? 's' : ''}` : 'Sin avisos')),
            React.createElement("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 8 } }, checks.map(c => (React.createElement("div", { key: c.id, style: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid var(--panel-soft-border)', borderRadius: 6 } },
                React.createElement("span", { "aria-hidden": "true", style: { width: 18, height: 18, flex: '0 0 18px', borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: tone[c.level], border: `1px solid ${tone[c.level]}` } }, icon[c.level]),
                React.createElement("div", { style: { minWidth: 0 } },
                    React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: 'var(--text-1)' } }, c.title),
                    React.createElement("div", { style: { fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 } }, c.detail))))))));
    }
    function PortfolioResults({ ctx }) {
        const [view, setView] = React.useState('overview');
        const { S, portfolio, pfSims, pfStopType, pfMaxWeight, pfRiskFree, scanDirection, setSelectedChart } = ctx;
        return (React.createElement("div", null,
            React.createElement("nav", { className: "workspace-subnav", "aria-label": "Vistas del portafolio" }, [['overview', 'Resumen'], ['positions', 'Posiciones'], ['correlation', 'Correlación']].map(([key, label]) => React.createElement("button", { type: "button", key: key, "aria-current": view === key ? 'page' : undefined, onClick: () => setView(key) }, label))),
            React.createElement(KpiRow, { portfolio: portfolio, pfRiskFree: pfRiskFree, S: S }),
            view === 'overview' && React.createElement(InfoBar, { portfolio: portfolio, pfSims: pfSims, pfStopType: pfStopType, scanDirection: scanDirection, S: S }),
            view === 'overview' && React.createElement(XrayCard, { portfolio: portfolio, S: S }),
            view === 'overview' && React.createElement("div", { className: "ro-stack-mobile", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 } },
                React.createElement(EfficientFrontierCard, { portfolio: portfolio, S: S }),
                React.createElement(UnifiedDonutCard, { portfolio: portfolio, S: S })),
            view === 'correlation' && React.createElement(CorrelationHeatmapCard, { portfolio: portfolio, S: S }),
            view === 'positions' && React.createElement(AllocationsTable, { portfolio: portfolio, pfStopType: pfStopType, pfMaxWeight: pfMaxWeight, setSelectedChart: setSelectedChart, S: S }),
            React.createElement(ExportBar, { portfolio: portfolio, S: S })));
    }
    // ── Entry point ────────────────────────────────────────────────────────────
    function PortfolioWorkspace({ ctx }) {
        const [settingsOpen, setSettingsOpen] = React.useState(!ctx.portfolio);
        React.useEffect(() => { if (ctx.portfolio)
            setSettingsOpen(false); }, [ctx.portfolio]);
        const { tab, S, pfUniverseSource, pfBuilding, pfSims, portfolio, passN, pfManualList, buildPortfolio, pfMinWeight, pfMaxWeight, pfMaxPos, pfCapital, pfMode } = ctx;
        if (tab !== "portfolio")
            return null;
        const canBuild = pfUniverseSource === "manual" ? pfManualList.length >= 2 : passN >= 2;
        const portfolioWarnings = [];
        if (Number(pfMinWeight || 0) > Number(pfMaxWeight || 0))
            portfolioWarnings.push('Min por acción % no puede superar Max peso %.');
        if ((Number(pfMinWeight || 0) * Math.max(2, Number(pfMaxPos) || 0)) > 100)
            portfolioWarnings.push('La combinación entre mínimo por acción y máximo de posiciones es inviable.');
        if ((Number(pfMaxWeight || 0) * Math.max(2, Number(pfMaxPos) || 0)) < 100)
            portfolioWarnings.push('No podrás asignar el 100% del capital con el máximo de peso actual.');
        if (Number(pfCapital || 0) <= 0)
            portfolioWarnings.push('El capital debe ser mayor que 0.');
        if (pfMode === 'equalweight' && Number(pfMinWeight || 0) > 100 / Math.max(2, Number(pfMaxPos) || 10))
            portfolioWarnings.push('Equal Weight funciona mejor con un mínimo por acción menor o igual al peso equiponderado.');
        const canActuallyBuild = canBuild && portfolioWarnings.length === 0;
        return (React.createElement("div", null,
            React.createElement("div", { style: { ...S.panel, padding: '12px 14px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' } },
                React.createElement("div", null,
                    React.createElement("div", { style: S.sectionTitle }, "Optimizar portafolio"),
                    React.createElement("div", { style: { ...S.sectionMeta, marginTop: 4 } }, pfUniverseSource === "manual" ? `${pfManualList.length} tickers manuales` : `${passN} acciones desde scanner`)),
                React.createElement("button", { onClick: buildPortfolio, disabled: pfBuilding || !canActuallyBuild, style: { ...S.warningBtn,
                        minHeight: "var(--control-h)",
                        padding: "7px 16px",
                        fontSize: 11,
                        background: canActuallyBuild && !pfBuilding ? "var(--accent)" : "var(--bg-3)",
                        color: canActuallyBuild && !pfBuilding ? "#fff" : "var(--text-3)",
                        cursor: (pfBuilding || !canActuallyBuild) ? "not-allowed" : "pointer",
                        boxShadow: canActuallyBuild && !pfBuilding ? "0 2px 12px rgba(255,179,64,.2)" : "none",
                    } }, pfBuilding ? "Optimizando..." : "Construir Portafolio")),
            React.createElement("div", { className: "workspace-toolbar" },
                React.createElement("button", { type: "button", style: S.ghostBtn, "aria-expanded": settingsOpen, onClick: () => setSettingsOpen(v => !v) }, "Configuraci\u00F3n y universo")),
            settingsOpen && React.createElement(React.Fragment, null,
                React.createElement(ConfigCard, { ...ctx }),
                ManualTickersCard(ctx)),
            portfolioWarnings.length > 0 && (React.createElement("div", { style: { ...S.panel, padding: '12px 14px', marginBottom: 12, border: '1px solid var(--panel-warning-border)', background: 'var(--panel-warning-bg)' } },
                React.createElement("div", { style: { ...S.sectionTitle, color: 'var(--amber)', marginBottom: 6 } }, "Revisa estas restricciones antes de construir"),
                React.createElement("ul", { style: { margin: 0, paddingLeft: 18, color: 'var(--text-2)', fontSize: 11, lineHeight: 1.45 } }, portfolioWarnings.map((w, i) => React.createElement("li", { key: i }, w))))),
            React.createElement("div", { style: { ...S.cd, padding: '10px 14px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' } },
                React.createElement("div", { style: { fontSize: 10, color: 'var(--text-2)' } },
                    "Capital: ",
                    React.createElement("b", { style: { color: 'var(--text-1)' } },
                        "$",
                        Number(pfCapital || 0).toLocaleString())),
                React.createElement("div", { style: { fontSize: 10, color: 'var(--text-2)' } },
                    "Min por acci\u00F3n: ",
                    React.createElement("b", { style: { color: 'var(--text-1)' } }, formatPct(pfMinWeight))),
                React.createElement("div", { style: { fontSize: 10, color: 'var(--text-2)' } },
                    "Max peso: ",
                    React.createElement("b", { style: { color: 'var(--text-1)' } }, formatPct(pfMaxWeight))),
                React.createElement("div", { style: { fontSize: 10, color: 'var(--text-2)' } },
                    "Max posiciones: ",
                    React.createElement("b", { style: { color: 'var(--text-1)' } }, pfMaxPos)),
                React.createElement("div", { style: { fontSize: 10, color: 'var(--text-2)' } },
                    "Modo: ",
                    React.createElement("b", { style: { color: 'var(--text-1)' } }, pfMode === 'minvol' ? 'Min Varianza' : pfMode === 'maxsharpe' ? 'Max Sharpe' : pfMode === 'maxret' ? 'Max Return' : pfMode === 'hrp' ? 'HRP' : 'Equal Weight'))),
            false && React.createElement("button", { onClick: buildPortfolio, disabled: pfBuilding || !canActuallyBuild, style: {
                    width: "100%", padding: "16px 24px", marginBottom: 14,
                    border: "1px solid " + (canActuallyBuild && !pfBuilding ? "var(--accent)" : "var(--border)"),
                    borderRadius: "var(--radius)",
                    background: canActuallyBuild && !pfBuilding ? "var(--accent-dim)" : "var(--bg-3)",
                    color: canActuallyBuild && !pfBuilding ? "var(--accent)" : "var(--text-3)",
                    fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 700, letterSpacing: .4,
                    cursor: (pfBuilding || !canActuallyBuild) ? "not-allowed" : "pointer",
                    transition: "all .2s",
                    boxShadow: canActuallyBuild && !pfBuilding ? "0 0 16px rgba(0,180,255,.08)" : "none",
                } }, pfBuilding ? "Optimizando..." : "Construir Portafolio"),
            portfolio && !pfBuilding && React.createElement(PortfolioResults, { ctx: ctx }),
            !portfolio && !pfBuilding && (React.createElement("div", { style: S.emptyState }, canActuallyBuild
                ? "Listo para optimizar. Ajusta la configuración y construye el portafolio."
                : (pfUniverseSource === "manual"
                    ? "Agrega al menos 2 tickers manuales."
                    : "Escanea primero con al menos 2 acciones que pasen los filtros."))),
            pfBuilding && (React.createElement("div", { style: { ...S.panel, padding: 24, textAlign: "center" } },
                React.createElement("div", { style: { ...S.progressBar, maxWidth: 320, margin: "0 auto 12px" } },
                    React.createElement("span", { style: { ...S.progressFill(65), background: "linear-gradient(90deg,var(--amber),var(--accent))" } })),
                React.createElement("div", { style: { ...S.sectionMeta, color: "var(--text-2)" } },
                    "Mapeando frontera eficiente (",
                    pfSims.toLocaleString(),
                    " portafolios aleatorios)...")))));
    }
    window.StockScannerTabs.renderPortfolioTab = function (ctx) {
        return ctx.tab === 'portfolio' ? React.createElement(PortfolioWorkspace, { ctx: ctx }) : null;
    };
})();
