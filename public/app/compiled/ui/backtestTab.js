"use strict";
// backtestTab.js - Backtest UI split into named render functions.
window.StockScannerTabs = window.StockScannerTabs || {};
(function () {
    // ── Market Regime Filter Panel ────────────────────────────────────────────
    function renderMktFilterPanel(ctx) {
        const { S, INDICATORS, TIMEFRAMES, mktFilterEnabled, setMktFilterEnabled, mktFilterTicker, setMktFilterTicker, mktFilterTf, setMktFilterTf, mktFilterInd, setMktFilterInd, mktFilterPeriod, setMktFilterPeriod, mktFilterOp, setMktFilterOp, mktFilterVal, setMktFilterVal, } = ctx;
        const needsVal = mktFilterOp === 'ind_above_val' || mktFilterOp === 'ind_below_val';
        const needsInd = mktFilterOp === 'price_above_ind' || mktFilterOp === 'price_below_ind';
        const indOpts = INDICATORS.filter(i => ['WMA', 'SMA', 'EMA', 'RSI'].includes(i.id));
        // Human-readable summary of the current filter
        const opLabel = {
            price_above_ind: 'Precio  >  indicador',
            price_below_ind: 'Precio  <  indicador',
            ind_above_val: 'Indicador  >  valor',
            ind_below_val: 'Indicador  <  valor',
        }[mktFilterOp] || '';
        const summary = mktFilterEnabled
            ? `${mktFilterTicker} [${mktFilterTf}] - ${mktFilterInd}(${mktFilterPeriod}) - ${opLabel}${needsVal ? ' ' + mktFilterVal : ''}`
            : 'Desactivado - no se aplica ningun filtro de mercado';
        return (React.createElement("div", { style: { ...S.cd, padding: 10, marginBottom: 8, borderColor: mktFilterEnabled ? 'rgba(0,180,255,.3)' : 'var(--card-border)' } },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: mktFilterEnabled ? 10 : 0 } },
                React.createElement("button", { onClick: () => setMktFilterEnabled(v => !v), style: { ...S.btnG(mktFilterEnabled), padding: '4px 12px', fontSize: 9,
                        borderColor: mktFilterEnabled ? 'var(--accent)' : 'var(--border)',
                        color: mktFilterEnabled ? 'var(--accent)' : 'var(--text-2)' } }, mktFilterEnabled ? 'Activo' : 'Desactivado'),
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: 'var(--text-2)' } }, "Filtro de R\u00E9gimen de Mercado"),
                    React.createElement("div", { style: { fontSize: 8, color: 'var(--text-3)', marginTop: 1 } }, summary))),
            mktFilterEnabled && (React.createElement("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '8px 10px', background: 'var(--panel-accent-bg)', border: '1px solid var(--panel-accent-border)', borderRadius: 6 } },
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 8, color: 'var(--text-3)', marginBottom: 3 } }, "Ticker"),
                    React.createElement("div", { style: { display: 'flex', gap: 4 } },
                        ['SPY', 'QQQ', 'IWM', 'DIA'].map(t => (React.createElement("button", { key: t, onClick: () => setMktFilterTicker(t), style: { ...S.btnG(mktFilterTicker === t), padding: '3px 8px', fontSize: 9 } }, t))),
                        React.createElement("input", { value: ['SPY', 'QQQ', 'IWM', 'DIA'].includes(mktFilterTicker) ? '' : mktFilterTicker, onChange: e => setMktFilterTicker(e.target.value.toUpperCase()), placeholder: "Otro...", style: { ...S.inp, width: 60, fontSize: 9 } }))),
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 8, color: 'var(--text-3)', marginBottom: 3 } }, "Temporalidad"),
                    React.createElement("div", { style: { display: 'flex', gap: 4 } }, TIMEFRAMES.filter(t => ['1wk', '1d'].includes(t.id)).map(t => (React.createElement("button", { key: t.id, onClick: () => setMktFilterTf(t.id), style: { ...S.btnG(mktFilterTf === t.id), padding: '3px 8px', fontSize: 9 } }, t.label))))),
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 8, color: 'var(--text-3)', marginBottom: 3 } }, "Indicador"),
                    React.createElement("div", { style: { display: 'flex', gap: 4, alignItems: 'center' } },
                        React.createElement("select", { value: mktFilterInd, onChange: e => setMktFilterInd(e.target.value), style: { ...S.inp, width: 70, fontSize: 9 } }, indOpts.map(i => React.createElement("option", { key: i.id, value: i.id }, i.id))),
                        React.createElement("span", { style: { fontSize: 8, color: 'var(--text-3)' } }, "("),
                        React.createElement("input", { type: "number", className: "numeric-value-input", min: 2, max: 200, value: mktFilterPeriod, onChange: e => setMktFilterPeriod(+e.target.value || 14), style: { ...S.inp, width: 42, textAlign: 'center', fontSize: 9 } }),
                        React.createElement("span", { style: { fontSize: 8, color: 'var(--text-3)' } }, ")"))),
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 8, color: 'var(--text-3)', marginBottom: 3 } }, "Condicion"),
                    React.createElement("div", { style: { display: 'flex', gap: 4, alignItems: 'center' } },
                        React.createElement("select", { value: mktFilterOp, onChange: e => setMktFilterOp(e.target.value), style: { ...S.inp, width: 155, fontSize: 9 } },
                            React.createElement("option", { value: "price_above_ind" }, "Precio  >  indicador (MA)"),
                            React.createElement("option", { value: "price_below_ind" }, "Precio  <  indicador (MA)"),
                            React.createElement("option", { value: "ind_above_val" }, "Indicador  >  valor"),
                            React.createElement("option", { value: "ind_below_val" }, "Indicador  <  valor")),
                        needsVal && (React.createElement("input", { type: "number", className: "numeric-value-input", step: "0.5", value: mktFilterVal, onChange: e => setMktFilterVal(+e.target.value || 50), style: { ...S.inp, width: 50, textAlign: 'center', fontSize: 9 } })))),
                React.createElement("div", { style: { flex: '1 1 100%', fontSize: 8, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.6 } },
                    mktFilterOp === 'price_above_ind' && React.createElement("span", null,
                        "Solo entra en posiciones cuando el precio de ",
                        React.createElement("b", { style: { color: 'var(--accent)' } }, mktFilterTicker),
                        " este ",
                        React.createElement("b", null, "por encima"),
                        " de su ",
                        mktFilterInd,
                        "(",
                        mktFilterPeriod,
                        ") - regimen alcista."),
                    mktFilterOp === 'price_below_ind' && React.createElement("span", null,
                        "Solo entra cuando el precio de ",
                        React.createElement("b", { style: { color: 'var(--accent)' } }, mktFilterTicker),
                        " este ",
                        React.createElement("b", null, "por debajo"),
                        " de su ",
                        mktFilterInd,
                        "(",
                        mktFilterPeriod,
                        ") - regimen bajista."),
                    mktFilterOp === 'ind_above_val' && React.createElement("span", null,
                        "Solo entra cuando el ",
                        mktFilterInd,
                        "(",
                        mktFilterPeriod,
                        ") de ",
                        React.createElement("b", { style: { color: 'var(--accent)' } }, mktFilterTicker),
                        " este ",
                        React.createElement("b", null, "por encima"),
                        " de ",
                        mktFilterVal,
                        "."),
                    mktFilterOp === 'ind_below_val' && React.createElement("span", null,
                        "Solo entra cuando el ",
                        mktFilterInd,
                        "(",
                        mktFilterPeriod,
                        ") de ",
                        React.createElement("b", { style: { color: 'var(--accent)' } }, mktFilterTicker),
                        " este ",
                        React.createElement("b", null, "por debajo"),
                        " de ",
                        mktFilterVal,
                        "."),
                    React.createElement("span", { style: { marginLeft: 8, color: 'var(--text-3)' } }, "Los stops y salidas activos no se ven afectados."))))));
    }
    function renderMktFilterPanelRules(ctx) {
        const { S, mktFilterEnabled, setMktFilterEnabled, btBenchmark, mktFilterRules, setMktFilterRules, newGroup } = ctx;
        const summary = mktFilterEnabled
            ? `${btBenchmark} - ${(mktFilterRules === null || mktFilterRules === void 0 ? void 0 : mktFilterRules.length) || 0} grupo(s) de reglas`
            : 'Desactivado - no se aplica ningun filtro de mercado';
        return (React.createElement("div", { style: { ...S.cd, padding: 10, marginBottom: 8, borderColor: mktFilterEnabled ? 'rgba(0,180,255,.3)' : 'var(--card-border)' } },
            React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: mktFilterEnabled ? 10 : 0 } },
                React.createElement("button", { onClick: () => setMktFilterEnabled(v => !v), style: { ...S.btnG(mktFilterEnabled), padding: '4px 12px', fontSize: 9, borderColor: mktFilterEnabled ? 'var(--accent)' : 'var(--border)', color: mktFilterEnabled ? 'var(--accent)' : 'var(--text-2)' } }, mktFilterEnabled ? 'Activo' : 'Desactivado'),
                React.createElement("div", { style: { flex: 1 } },
                    React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: 'var(--text-2)' } }, "Filtro de R\u00E9gimen de Mercado"),
                    React.createElement("div", { style: { fontSize: 8, color: 'var(--text-3)', marginTop: 1 } }, summary))),
            mktFilterEnabled && (React.createElement("div", { style: { padding: '8px 10px', background: 'var(--panel-accent-bg)', border: '1px solid var(--panel-accent-border)', borderRadius: 6 } },
                React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 } },
                    React.createElement("div", { style: { fontSize: 8, color: 'var(--text-3)', lineHeight: 1.5 } },
                        "Se evalua sobre ",
                        React.createElement("b", { style: { color: 'var(--accent)' } }, btBenchmark),
                        ". Si el regimen falla, el backtest sale de todas las operaciones y no abre nuevas entradas esa semana."),
                    React.createElement("button", { onClick: () => setMktFilterRules(r => [...r, newGroup()]), style: { ...S.btn, background: "var(--bg-3)", border: "1px solid rgba(0,180,255,.3)", color: "var(--accent)", padding: "3px 8px", fontSize: 9, whiteSpace: 'nowrap' } }, "+ Grupo OR")),
                (mktFilterRules || []).map((grp, gi) => renderRuleGroup(grp, gi, mktFilterRules, setMktFilterRules, "var(--accent)", ctx))))));
    }
    function renderBtConfigBar(ctx) {
        const { S, DIR_OPTIONS, btCapital, setBtCapital, btWeeks, setBtWeeks, pfMaxPos, setPfMaxPos, pfStopATRPeriod, setPfStopATRPeriod, pfMode, btBenchmark, setBtBenchmark, btCommission, setBtCommission, btSlippage, setBtSlippage, stopATR, setStopATR, stopATRMult, setStopATRMult, stopPct, setStopPct, stopPctVal, setStopPctVal, btDirection, setBtDirection, btRunning, dataCacheRef, runBacktest, btUniverseSource, btOptionsOpen, setBtOptionsOpen, btAllocationMode, setBtAllocationMode, btUniverseLimit, setBtUniverseLimit, cancelBacktest, savedBtPresets, btPresetName, setBtPresetName, selectedBtPresetId, setSelectedBtPresetId, setSavedBtPresets, saveBacktestPreset, loadBacktestPreset, deleteBacktestPreset, notify } = ctx;
        const cacheCount = Object.keys(dataCacheRef.current).length;
        const canRunBacktest = !btRunning && (btUniverseSource !== "scan" || cacheCount > 0);
        const disabledReason = btUniverseSource === "scan" && cacheCount === 0
            ? "Haz un scan primero o cambia a Tickers propios."
            : "";
        const allocationLabel = ({
            equal: 'Equal weight',
            maxsharpe: 'Max Sharpe',
            minvol: 'Inversa a la volatilidad',
            maxret: 'Max Return (momentum)',
            portfolio: "Criterio del Portafolio (" + (pfMode || "maxsharpe") + ")",
        })[btAllocationMode || 'equal'] || 'Equal weight';
        const exportBtPresets = () => {
            const items = Array.isArray(savedBtPresets) ? savedBtPresets : [];
            if (!items.length)
                return notify === null || notify === void 0 ? void 0 : notify({ type: 'warning', title: 'Presets Backtest', message: 'No hay presets guardados para exportar.' });
            const payload = { type: 'radar-onix-backtest-presets', version: 1, exportedAt: new Date().toISOString(), presets: items };
            const b = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = 'radar_onix_backtest_presets_' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        };
        const importBtPresets = async (file) => {
            if (!file)
                return;
            try {
                const txt = await file.text();
                const json = JSON.parse(txt);
                const incoming = Array.isArray(json) ? json : Array.isArray(json === null || json === void 0 ? void 0 : json.presets) ? json.presets : (json === null || json === void 0 ? void 0 : json.config) ? [json] : [];
                const clean = incoming.filter(p => p && p.config && typeof p.config === 'object').map((p, i) => ({
                    id: String(p.id || Date.now() + '_' + i),
                    name: String(p.name || ('Preset importado ' + (i + 1))).trim(),
                    updatedAt: Number(p.updatedAt) || Date.now(),
                    config: p.config,
                }));
                if (!clean.length)
                    return notify === null || notify === void 0 ? void 0 : notify({ type: 'warning', title: 'Importar presets', message: 'El archivo no contiene presets validos.' });
                setSavedBtPresets === null || setSavedBtPresets === void 0 ? void 0 : setSavedBtPresets(prev => {
                    const map = new Map((Array.isArray(prev) ? prev : []).map(p => [p.id, p]));
                    clean.forEach(p => map.set(p.id, p));
                    return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 40);
                });
                notify === null || notify === void 0 ? void 0 : notify({ type: 'success', title: 'Presets importados', message: 'Se importaron ' + clean.length + ' preset(s) de Backtest.' });
            }
            catch (e) {
                notify === null || notify === void 0 ? void 0 : notify({ type: 'error', title: 'Error importando presets', message: (e === null || e === void 0 ? void 0 : e.message) || 'Archivo invalido' });
            }
        };
        return (React.createElement("div", { className: "bt-settings-panel", style: { ...S.panel, marginBottom: 10 } },
            React.createElement("div", { className: "bt-settings-header" },
                React.createElement("div", null,
                    React.createElement("h2", null, "Par\u00E1metros del backtest"),
                    React.createElement("p", null,
                        btWeeks,
                        " semanas \u00B7 ",
                        pfMaxPos,
                        " posiciones \u00B7 ",
                        allocationLabel)),
                React.createElement("div", { className: "bt-settings-actions" },
                    React.createElement("button", { type: "button", "aria-expanded": btOptionsOpen, "aria-controls": "bt-settings-fields", onClick: () => setBtOptionsOpen(v => !v), style: S.ghostBtn }, btOptionsOpen ? 'Ocultar opciones' : 'Editar opciones'),
                    React.createElement("button", { type: "button", onClick: runBacktest, disabled: !canRunBacktest, style: { ...S.primaryBtn, padding: '9px 18px', fontSize: 12 } }, btRunning ? 'Simulando…' : 'Ejecutar Backtest'),
                    btRunning && React.createElement("button", { type: "button", onClick: cancelBacktest, style: S.dangerBtn }, "Cancelar"))),
            disabledReason && React.createElement("div", { className: "bt-settings-note" }, disabledReason),
            btOptionsOpen && React.createElement("div", { id: "bt-settings-fields" },
                React.createElement("div", { className: "bt-settings-sections" },
                    React.createElement("section", { className: "bt-settings-section", "aria-label": "Simulaci\u00F3n" },
                        React.createElement("h3", null, "Simulaci\u00F3n"),
                        React.createElement("div", { className: "bt-setting-fields" },
                            React.createElement("div", null,
                                React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginBottom: 7 } }, "Capital ($)"),
                                React.createElement("input", { type: "number", className: "numeric-value-input", value: btCapital, onChange: e => setBtCapital(+e.target.value || 10000), style: { ...S.inp, width: 100, textAlign: "right" } })),
                            React.createElement("div", null,
                                React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginBottom: 7 } }, "Semanas"),
                                React.createElement("select", { value: btWeeks, onChange: e => setBtWeeks(+e.target.value), style: { ...S.inp, width: 85 } },
                                    React.createElement("option", { value: 26 }, "26 \u00B7 6 meses"),
                                    React.createElement("option", { value: 52 }, "52 \u00B7 1 a\u00F1o"),
                                    React.createElement("option", { value: 104 }, "104 \u00B7 2 a\u00F1os"),
                                    React.createElement("option", { value: 156 }, "156 \u00B7 3 a\u00F1os"),
                                    React.createElement("option", { value: 208 }, "208 \u00B7 4 a\u00F1os"))),
                            React.createElement("div", null,
                                React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginBottom: 7 } }, "Benchmark"),
                                React.createElement("select", { value: btBenchmark, onChange: e => setBtBenchmark(e.target.value), style: { ...S.inp, width: 70 } },
                                    React.createElement("option", { value: "SPY" }, "SPY"),
                                    React.createElement("option", { value: "QQQ" }, "QQQ"),
                                    React.createElement("option", { value: "IWM" }, "IWM"),
                                    React.createElement("option", { value: "DIA" }, "DIA"))),
                            React.createElement("div", null,
                                React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginBottom: 7 } }, "Direcci\u00F3n"),
                                React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } }, DIR_OPTIONS.map(opt => (React.createElement("button", { key: opt.id, onClick: () => setBtDirection(opt.id), style: { ...S.btnG(btDirection === opt.id), padding: "3px 8px", fontSize: 9,
                                        borderColor: btDirection === opt.id ? (opt.id === "short" ? "var(--purple)" : "var(--accent)") : "var(--border)",
                                        color: btDirection === opt.id ? (opt.id === "short" ? "var(--purple)" : "var(--accent)") : "var(--text-2)" } }, opt.id === "long" ? "Long" : "Short"))))))),
                    React.createElement("section", { className: "bt-settings-section", "aria-label": "Asignaci\u00F3n" },
                        React.createElement("h3", null, "Asignaci\u00F3n"),
                        React.createElement("div", { className: "bt-setting-fields" },
                            React.createElement("div", null,
                                React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginBottom: 7 } }, "Distribuci\u00F3n"),
                                React.createElement("select", { value: btAllocationMode || "equal", onChange: e => setBtAllocationMode(e.target.value), style: { ...S.inp, width: 150 }, title: "Pesos por se\u00F1al con las 12 semanas previas. Respetan Min/Max peso; si no cabe el 100%, el resto queda en efectivo. No usan la matriz de covarianza del Portafolio." },
                                    React.createElement("option", { value: "equal" }, "Equal weight"),
                                    React.createElement("option", { value: "maxsharpe" }, "Max Sharpe (Sharpe 12s)"),
                                    React.createElement("option", { value: "minvol" }, "Inversa a la volatilidad"),
                                    React.createElement("option", { value: "maxret" }, "Max Return (momentum 12s)"),
                                    React.createElement("option", { value: "portfolio" }, "Criterio del Portafolio"))),
                            React.createElement("div", null,
                                React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginBottom: 7 } }, "M\u00E1x. posiciones"),
                                React.createElement("input", { type: "number", className: "numeric-value-input", min: 2, max: 50, value: pfMaxPos, onChange: e => setPfMaxPos(+e.target.value || 20), style: { ...S.inp, width: 50, textAlign: "center" } })),
                            React.createElement("div", null,
                                React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginBottom: 7 } }, "L\u00EDmite del universo"),
                                React.createElement("select", { value: btUniverseLimit !== null && btUniverseLimit !== void 0 ? btUniverseLimit : 1000, onChange: e => setBtUniverseLimit(+e.target.value), style: { ...S.inp, width: 95 } },
                                    React.createElement("option", { value: 500 }, "500"),
                                    React.createElement("option", { value: 1000 }, "1000"),
                                    React.createElement("option", { value: 2000 }, "2000"),
                                    React.createElement("option", { value: 5000 }, "5000"),
                                    React.createElement("option", { value: 0 }, "Todos"))))),
                    React.createElement("section", { className: "bt-settings-section", "aria-label": "Riesgo y costos" },
                        React.createElement("h3", null, "Riesgo y costos"),
                        React.createElement("div", { className: "bt-setting-fields" },
                            React.createElement("div", null,
                                React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginBottom: 7 } }, "Comisi\u00F3n % \u00B7 por lado"),
                                React.createElement("div", { style: { display: "flex", gap: 3, alignItems: "center" } },
                                    React.createElement("input", { type: "number", className: "numeric-value-input", step: 0.05, min: 0, max: 2, value: btCommission, onChange: e => setBtCommission(+e.target.value || 0), style: { ...S.inp, width: 50, textAlign: "center" } }))),
                            React.createElement("div", null,
                                React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginBottom: 7 } }, "Slippage %"),
                                React.createElement("input", { type: "number", className: "numeric-value-input", step: 0.01, min: 0, max: 5, value: btSlippage, onChange: e => setBtSlippage(+e.target.value || 0), style: { ...S.inp, width: 58, textAlign: "center" } }))),
                        React.createElement("div", { className: "bt-stop-fields" },
                            React.createElement("div", null,
                                React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginBottom: 7 } }, "Stop ATR"),
                                React.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } },
                                    React.createElement("button", { onClick: () => setStopATR(!stopATR), style: { ...S.btnG(stopATR), padding: "3px 8px", fontSize: 9 } }, stopATR ? "On" : "Off"),
                                    stopATR && React.createElement("span", { style: { fontSize: 9, color: "var(--text-2)" } }, "x"),
                                    stopATR && React.createElement("input", { type: "number", className: "numeric-value-input", step: 0.5, min: 0.5, max: 5, value: stopATRMult, onChange: e => setStopATRMult(+e.target.value || 2), style: { ...S.inp, width: 40, textAlign: "center" } }),
                                    stopATR && React.createElement("span", { style: { fontSize: 8, color: "var(--text-2)" } }, "p"),
                                    stopATR && React.createElement("input", { type: "number", className: "numeric-value-input", min: 1, max: 200, value: pfStopATRPeriod, onChange: e => setPfStopATRPeriod(+e.target.value || 14), style: { ...S.inp, width: 42, textAlign: "center" }, title: "Periodo ATR compartido con Portafolio" }))),
                            React.createElement("div", null,
                                React.createElement("div", { style: { fontSize: 10, color: "var(--text-2)", marginBottom: 7 } }, "Stop %"),
                                React.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } },
                                    React.createElement("button", { onClick: () => setStopPct(!stopPct), style: { ...S.btnG(stopPct), padding: "3px 8px", fontSize: 9 } }, stopPct ? "On" : "Off"),
                                    stopPct && React.createElement("input", { type: "number", className: "numeric-value-input", step: 1, min: 1, max: 50, value: stopPctVal, onChange: e => setStopPctVal(+e.target.value || 8), style: { ...S.inp, width: 40, textAlign: "center" } }),
                                    stopPct && React.createElement("span", { style: { fontSize: 8, color: "var(--text-2)" } }, "%")))))),
                React.createElement("details", { className: "bt-preset-disclosure" },
                    React.createElement("summary", null, "Presets guardados e importaci\u00F3n"),
                    React.createElement("div", { className: "bt-presets-body" },
                        React.createElement("input", { value: btPresetName || "", onChange: e => setBtPresetName(e.target.value), placeholder: "Nombre del preset", style: { ...S.inp, width: 180 } }),
                        React.createElement("button", { onClick: saveBacktestPreset, style: { ...S.btnG(true), fontSize: 9, borderColor: "rgba(0,160,255,.4)", color: "var(--accent)" } }, selectedBtPresetId ? "Actualizar" : "Guardar"),
                        React.createElement("select", { value: selectedBtPresetId || "", onChange: e => {
                                const id = e.target.value;
                                setSelectedBtPresetId(id);
                                const item = (savedBtPresets || []).find(x => x.id === id);
                                if (item)
                                    setBtPresetName(item.name || "");
                            }, style: { ...S.inp, width: 190 } },
                            React.createElement("option", { value: "" }, "Seleccionar preset..."),
                            (savedBtPresets || []).map(p => React.createElement("option", { key: p.id, value: p.id }, p.name))),
                        React.createElement("button", { onClick: loadBacktestPreset, style: { ...S.btnG(false), fontSize: 9 } }, "Cargar"),
                        React.createElement("button", { onClick: deleteBacktestPreset, style: { ...S.btnG(false), fontSize: 9, color: "var(--red)", borderColor: "rgba(220,50,50,.28)" } }, "Eliminar"),
                        selectedBtPresetId && React.createElement("button", { onClick: () => { setSelectedBtPresetId(""); setBtPresetName(""); }, style: { ...S.btnG(false), fontSize: 9 } }, "Nuevo"),
                        React.createElement("button", { onClick: exportBtPresets, style: { ...S.btnG(false), fontSize: 9, marginLeft: "auto" } }, "Exportar JSON"),
                        React.createElement("label", { style: { ...S.btnG(false), fontSize: 9, cursor: "pointer", display: "inline-flex", alignItems: "center" } },
                            "Importar JSON",
                            React.createElement("input", { type: "file", accept: "application/json,.json", onChange: e => { var _a; importBtPresets((_a = e.target.files) === null || _a === void 0 ? void 0 : _a[0]); e.target.value = ''; }, style: { display: "none" } })))))));
    }
    function renderBtProgress(ctx) {
        var _a;
        const { S, btRunning, btProgress, btWeeks } = ctx;
        if (!btRunning)
            return null;
        const p = btProgress || { phase: 'Simulando', done: 0, total: btWeeks, pct: 0 };
        const pct = Math.max(0, Math.min(100, Number(p.pct) || 0));
        const phasePct = Math.max(0, Math.min(100, Number((_a = p.phasePct) !== null && _a !== void 0 ? _a : p.pct) || 0));
        const elapsed = p.elapsedMs != null ? (p.elapsedMs / 1000).toFixed(1) + "s" : "";
        const doneLabel = Number.isFinite(Number(p.done)) ? Math.round(Number(p.done)) : p.done;
        const detail = p.total ? `${doneLabel}/${p.total}` : '';
        const loadDetail = [p.loaded != null && `ok ${p.loaded}`, p.failed != null && `sin datos ${p.failed}`, p.insufficient != null && `insuf ${p.insufficient}`, p.trimmedSeriesCount ? `recortadas ${p.trimmedSeriesCount}` : null, p.sourceTotal && p.limit ? `limite ${p.total}/${p.sourceTotal}` : null].filter(Boolean).join(' - ');
        const stages = [["data", "Datos"], ["benchmark", "Benchmark"], ["regime", "Régimen"], ["simulation", "Simulación"], ["results", "Resultados"]];
        return (React.createElement("div", { style: { ...S.panel, padding: 12, marginBottom: 8 } },
            React.createElement("div", { style: { ...S.sectionHeader, alignItems: "center", marginBottom: 8 } },
                React.createElement("div", null,
                    React.createElement("div", { style: { ...S.sectionTitle, color: p.cancelled ? "var(--amber)" : "var(--text-1)" } }, p.phase || "Simulando backtest"),
                    React.createElement("div", { style: { ...S.sectionMeta, marginTop: 2 } },
                        "Fase: ",
                        p.stageLabel || "-",
                        " ",
                        phasePct,
                        "% ",
                        elapsed && `- ${elapsed}`)),
                React.createElement("div", { style: S.statusBadge(p.cancelled ? "warning" : "info") },
                    detail,
                    " - global ",
                    pct,
                    "%")),
            React.createElement("div", { style: S.progressBar },
                React.createElement("span", { style: { ...S.progressFill(pct), background: "linear-gradient(90deg,var(--purple),var(--accent))", transition: "width .18s ease" } })),
            React.createElement("div", { className: "ro-metric-grid", style: { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 4, marginTop: 7 } }, stages.map(([id, label]) => (React.createElement("div", { key: id, style: { height: 4, borderRadius: 999, background: id === p.stage ? "var(--accent)" : stages.findIndex(s => s[0] === id) < stages.findIndex(s => s[0] === p.stage) ? "rgba(34,201,138,.55)" : "rgba(80,104,128,.18)" }, title: label })))),
            (loadDetail || p.current) && (React.createElement("div", { style: { display: "flex", justifyContent: "space-between", gap: 10, marginTop: 6, fontSize: 8, color: "var(--text-3)", fontFamily: "var(--font-mono)" } },
                React.createElement("span", null, loadDetail),
                p.current && React.createElement("span", null,
                    "ultimo: ",
                    p.current)))));
    }
    // ── Universe Selector ──────────────────────────────────────────────────────
    function renderBtUniverseSelector(ctx) {
        var _a;
        const { S, btUniverseSource, setBtUniverseSource, btCustomTickers, setBtCustomTickers, btUniverseListName, setBtUniverseListName, btEditingListId, setBtEditingListId, dataCacheRef, btUniverseOpen, setBtUniverseOpen, savedUniverseLists, setSavedUniverseLists, btUniverseLimit, notify, warmBacktestData, cancelBtWarmData, estimateBacktestDataCache, btWarming, btWarmProgress, btWarmEstimate, btRunning, refreshDataCacheStatus, pruneDataCache, dataCacheStatus, dataCacheBusy } = ctx;
        const presets = window.StockScannerConfig.UNIVERSE_PRESETS || {};
        const groups = window.StockScannerConfig.UNIVERSE_GROUPS || [{ id: 'us', label: 'EE. UU.' }];
        const parseCustom = txt => [...new Set(String(txt || '').split(/[\s,;]+/).map(t => t.trim().toUpperCase()).filter(Boolean))];
        const customLists = savedUniverseLists || [];
        const selectedList = (btUniverseSource === null || btUniverseSource === void 0 ? void 0 : btUniverseSource.startsWith('LIST_')) ? customLists.find(l => 'LIST_' + l.id === btUniverseSource) : null;
        const selectedPreset = presets[btUniverseSource];
        const selectedLabel = btUniverseSource === "scan"
            ? "Ultimo Scan"
            : btUniverseSource === "custom"
                ? "Tickers propios"
                : (selectedList === null || selectedList === void 0 ? void 0 : selectedList.name) || (selectedPreset === null || selectedPreset === void 0 ? void 0 : selectedPreset.label) || btUniverseSource;
        const selectedCount = btUniverseSource === "scan"
            ? Object.keys(dataCacheRef.current).filter(t => !t.startsWith('__')).length
            : btUniverseSource === "custom"
                ? parseCustom(btCustomTickers).length
                : selectedList
                    ? (selectedList.tickers || []).length
                    : ((selectedPreset === null || selectedPreset === void 0 ? void 0 : selectedPreset.tickers) || []).length;
        const limit = Math.max(0, Math.round(Number(btUniverseLimit) || 0));
        const effectiveCount = limit > 0 ? Math.min(selectedCount, limit) : selectedCount;
        const countLabel = limit > 0 && selectedCount > limit ? `${effectiveCount}/${selectedCount} tickers` : `${selectedCount} tickers`;
        const sourceLabel = btUniverseSource === "scan" ? "Ultimo scan" : btUniverseSource === "custom" ? "Lista escrita" : selectedList ? "Lista guardada" : selectedPreset ? "Indice/activo predefinido" : "Universo";
        const limitLabel = limit > 0 ? `${effectiveCount} max` : "sin limite";
        const loadHint = effectiveCount >= 5000 ? "Muy pesado: puede tardar varios minutos y usar bastante memoria." : effectiveCount >= 1500 ? "Modo pesado: conviene empezar con 1000-2000 para validar reglas." : effectiveCount >= 500 ? "Tamano medio: buena prueba antes de correr todo." : "Ligero: ideal para probar reglas rapido.";
        const warmPct = Math.max(0, Math.min(100, Number(btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.pct) || 0));
        const warmSecs = (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.elapsedMs) ? (btWarmProgress.elapsedMs / 1000).toFixed(1) + 's' : '';
        const est = (btWarmEstimate === null || btWarmEstimate === void 0 ? void 0 : btWarmEstimate.ok) ? btWarmEstimate : ((_a = btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.estimate) === null || _a === void 0 ? void 0 : _a.ok) ? btWarmProgress.estimate : null;
        const estPct = (est === null || est === void 0 ? void 0 : est.total) ? Math.round((est.cached / est.total) * 100) : 0;
        const isHugeUniverse = effectiveCount >= 5000;
        const isLargeUniverse = effectiveCount >= 1500;
        const cacheIncomplete = est ? estPct < 70 : isLargeUniverse;
        const guardTone = isHugeUniverse && cacheIncomplete ? "danger" : isLargeUniverse && cacheIncomplete ? "warning" : "info";
        const guardMessage = isHugeUniverse
            ? (est
                ? `Universo enorme: ${effectiveCount} símbolos. Cache ${estPct}% listo; faltan ${est.missing}. Prepara datos antes de ejecutar.`
                : `Universo enorme: ${effectiveCount} símbolos. Estima cache y prepara datos antes de ejecutar.`)
            : isLargeUniverse
                ? (est
                    ? `Universo grande: cache ${estPct}% listo. Si falta mucho, prepara datos primero.`
                    : `Universo grande: conviene estimar cache antes de lanzar el backtest.`)
                : "";
        const fmtBytes = (bytes = 0) => {
            const n = Number(bytes) || 0;
            if (n >= 1024 * 1024 * 1024)
                return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
            if (n >= 1024 * 1024)
                return (n / (1024 * 1024)).toFixed(1) + " MB";
            if (n >= 1024)
                return (n / 1024).toFixed(1) + " KB";
            return n + " B";
        };
        const cacheMem = (dataCacheStatus === null || dataCacheStatus === void 0 ? void 0 : dataCacheStatus.memory) || {};
        const cacheDisk = (dataCacheStatus === null || dataCacheStatus === void 0 ? void 0 : dataCacheStatus.disk) || {};
        const cacheUpdated = (dataCacheStatus === null || dataCacheStatus === void 0 ? void 0 : dataCacheStatus.ts) ? new Date(dataCacheStatus.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
        const saveList = () => {
            const name = (btUniverseListName || '').trim();
            const tickers = parseCustom(btCustomTickers);
            if (!name)
                return notify === null || notify === void 0 ? void 0 : notify({ type: 'warning', title: 'Mis listas', message: 'Escribe un nombre para la lista.' });
            if (!tickers.length)
                return notify === null || notify === void 0 ? void 0 : notify({ type: 'warning', title: 'Mis listas', message: 'Agrega tickers propios antes de guardar.' });
            const item = { id: btEditingListId || String(Date.now()), name, tickers };
            setSavedUniverseLists === null || setSavedUniverseLists === void 0 ? void 0 : setSavedUniverseLists(prev => {
                const arr = Array.isArray(prev) ? prev : [];
                const idx = arr.findIndex(x => x.id === item.id);
                const next = [...arr];
                if (idx >= 0)
                    next[idx] = item;
                else
                    next.unshift(item);
                return next.slice(0, 40);
            });
            setBtEditingListId(item.id);
            setBtUniverseSource('LIST_' + item.id);
            notify === null || notify === void 0 ? void 0 : notify({ type: 'success', title: 'Lista guardada', message: 'Tu lista quedó disponible para Scanner y Backtest.' });
        };
        const editList = (list) => {
            setBtEditingListId(list.id);
            setBtUniverseListName(list.name || '');
            setBtCustomTickers((list.tickers || []).join(', '));
            setBtUniverseSource('custom');
        };
        const deleteList = (list) => {
            setSavedUniverseLists === null || setSavedUniverseLists === void 0 ? void 0 : setSavedUniverseLists(prev => (Array.isArray(prev) ? prev : []).filter(x => x.id !== list.id));
            if (btUniverseSource === 'LIST_' + list.id)
                setBtUniverseSource('custom');
            if (btEditingListId === list.id) {
                setBtEditingListId('');
                setBtUniverseListName('');
            }
            notify === null || notify === void 0 ? void 0 : notify({ type: 'success', title: 'Lista eliminada', message: 'La lista propia fue eliminada.' });
        };
        return (React.createElement("div", { style: { ...S.panel, padding: "10px 12px", marginBottom: 8 } },
            React.createElement("div", { className: "ro-mobile-wrap", style: { ...S.toolbar, marginBottom: btUniverseOpen ? 8 : 0 } },
                React.createElement("button", { onClick: () => setBtUniverseOpen(v => !v), style: { ...S.btnG(btUniverseOpen), padding: "3px 10px", fontSize: 9 } },
                    btUniverseOpen ? "Ocultar" : "Mostrar",
                    " universo"),
                React.createElement("div", { style: { ...S.sectionTitle, fontSize: 9 } }, "Universo del Backtest"),
                React.createElement("span", { style: S.statusBadge("neutral") },
                    selectedLabel,
                    " - ",
                    countLabel),
                React.createElement("button", { onClick: () => estimateBacktestDataCache === null || estimateBacktestDataCache === void 0 ? void 0 : estimateBacktestDataCache(), disabled: btWarming || effectiveCount < 1, title: "Revisa cuantos charts ya estan en cache antes de descargar", style: { ...S.btnG(false), padding: "4px 10px", fontSize: 9, marginLeft: "auto", opacity: (btWarming || effectiveCount < 1) ? 0.45 : 1 } }, "Estimar"),
                React.createElement("button", { onClick: warmBacktestData, disabled: btWarming || btRunning || effectiveCount < 1, title: "Descarga y guarda OHLC en cache de disco para acelerar el backtest", style: { ...S.btnG(true), padding: "4px 10px", fontSize: 9, opacity: (btWarming || btRunning || effectiveCount < 1) ? 0.45 : 1, borderColor: "rgba(0,180,255,.35)", color: "var(--accent)" } }, btWarming ? "Preparando..." : "Preparar datos"),
                btWarming && (React.createElement("button", { onClick: cancelBtWarmData, style: { ...S.btnG(false), padding: "4px 10px", fontSize: 9, color: "var(--amber)", borderColor: "rgba(245,158,11,.35)" } }, "Cancelar"))),
            (btWarming || btWarmProgress) && (React.createElement("div", { style: { ...S.panelSoft, marginBottom: btUniverseOpen ? 8 : 0, padding: "8px 10px" } },
                React.createElement("div", { style: { ...S.sectionHeader, alignItems: "center", marginBottom: 6 } },
                    React.createElement("span", { style: { fontSize: 9, color: (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.error) ? "var(--red)" : (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.cancelled) ? "var(--amber)" : "var(--text-2)", fontWeight: 700 } }, (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.phase) || "Preparando cache"),
                    React.createElement("span", { style: S.statusBadge((btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.error) ? "danger" : (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.cancelled) ? "warning" : "info") },
                        (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.done) || 0,
                        "/",
                        (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.total) || 0,
                        " - ",
                        warmPct,
                        "% ",
                        warmSecs && `- ${warmSecs}`)),
                React.createElement("div", { style: S.progressBar },
                    React.createElement("span", { style: { ...S.progressFill(warmPct), transition: "width .18s ease", background: (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.error) ? "var(--red)" : (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.cancelled) ? "var(--amber)" : "linear-gradient(90deg,var(--accent),var(--green))" } })),
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", gap: 8, marginTop: 5, fontSize: 8, color: "var(--text-3)", fontFamily: "var(--font-mono)", flexWrap: "wrap" } },
                    React.createElement("span", null,
                        (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.tickers) || effectiveCount,
                        " s\u00EDmbolos - ",
                        ((btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.tfs) || ["1wk"]).join(", ")),
                    React.createElement("span", null,
                        "Requests: ",
                        (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.requests) || 0,
                        " - saltados: ",
                        (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.skipped) || 0,
                        " - fallos: ",
                        (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.failed) || 0,
                        (btWarmProgress === null || btWarmProgress === void 0 ? void 0 : btWarmProgress.current) ? ` - ${btWarmProgress.current}` : "")))),
            est && (React.createElement("div", { style: { ...S.panelSoft, marginBottom: btUniverseOpen ? 8 : 0, padding: "8px 10px", borderColor: "rgba(0,180,255,.22)", background: "var(--panel-accent-bg)" } },
                React.createElement("div", { style: { ...S.sectionHeader, alignItems: "center", marginBottom: 6 } },
                    React.createElement("span", { style: { ...S.sectionTitle, color: "var(--accent)", fontSize: 9 } }, "Estimacion cache"),
                    React.createElement("span", { style: S.statusBadge("info") },
                        est.cached,
                        "/",
                        est.total,
                        " cacheados - faltan ",
                        est.missing,
                        " - ",
                        estPct,
                        "%")),
                React.createElement("div", { style: S.progressBar },
                    React.createElement("span", { style: { ...S.progressFill(estPct), background: "linear-gradient(90deg,var(--green),var(--accent))" } })),
                React.createElement("div", { style: { display: "flex", gap: 10, marginTop: 5, fontSize: 8, color: "var(--text-3)", fontFamily: "var(--font-mono)", flexWrap: "wrap" } },
                    React.createElement("span", null,
                        "Memoria: ",
                        est.memory || 0),
                    React.createElement("span", null,
                        "Disco: ",
                        est.disk || 0),
                    React.createElement("span", null,
                        "Requests estimados: ",
                        est.estimatedRequests || 0),
                    React.createElement("span", null,
                        est.tickers || 0,
                        " s\u00EDmbolos x ",
                        (est.tfs || []).length,
                        " tf")))),
            React.createElement("div", { style: { ...S.panelSoft, marginBottom: btUniverseOpen ? 8 : 0, padding: "8px 10px" } },
                React.createElement("div", { style: { ...S.sectionHeader, alignItems: "center", marginBottom: 6 } },
                    React.createElement("div", null,
                        React.createElement("div", { style: { ...S.sectionTitle, fontSize: 9 } }, "Estado de datos"),
                        React.createElement("div", { style: { ...S.sectionMeta, marginTop: 2 } }, dataCacheStatus ? `${cacheDisk.files || 0} archivos - ${fmtBytes(cacheDisk.bytes || 0)}${cacheUpdated ? ` - ${cacheUpdated}` : ""}` : "Sin refrescar")),
                    React.createElement("div", { style: S.toolbar },
                        React.createElement("button", { onClick: () => refreshDataCacheStatus === null || refreshDataCacheStatus === void 0 ? void 0 : refreshDataCacheStatus(), disabled: dataCacheBusy, style: { ...S.btnG(false), padding: "4px 9px", fontSize: 9, opacity: dataCacheBusy ? 0.5 : 1 } }, dataCacheBusy ? "Leyendo..." : "Refrescar"),
                        React.createElement("button", { onClick: pruneDataCache, disabled: dataCacheBusy, style: { ...S.btnG(false), padding: "4px 9px", fontSize: 9, color: "var(--amber)", borderColor: "rgba(245,158,11,.32)", opacity: dataCacheBusy ? 0.5 : 1 } }, "Limpiar expirados"))),
                dataCacheStatus && (React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 6 } }, [
                    ["Mem hits", cacheMem.memoryHits || 0],
                    ["Disco hits", cacheMem.diskHits || 0],
                    ["Red", cacheMem.networkHits || 0],
                    ["Fallos", cacheMem.failures || 0],
                    ["En vuelo", cacheMem.inflight || 0],
                    ["TTL disco", cacheMem.diskTtlMs ? Math.round(cacheMem.diskTtlMs / 3600000) + "h" : "-"],
                ].map(([label, value]) => (React.createElement("div", { key: label, style: { ...S.metricCard, padding: "6px 8px", minHeight: 48 } },
                    React.createElement("div", { style: { fontSize: 7, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: .5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, label),
                    React.createElement("div", { style: { fontSize: 10, color: "var(--text-0)", fontWeight: 800, marginTop: 2, fontFamily: "var(--font-mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, value)))))),
                (dataCacheStatus === null || dataCacheStatus === void 0 ? void 0 : dataCacheStatus.pruned) && (React.createElement("div", { style: { marginTop: 5, fontSize: 8, color: "var(--text-3)", fontFamily: "var(--font-mono)" } },
                    "Ultima limpieza: ",
                    dataCacheStatus.pruned.checked || 0,
                    " revisados, ",
                    dataCacheStatus.pruned.removed || 0,
                    " eliminados."))),
            btUniverseOpen && (React.createElement(React.Fragment, null,
                React.createElement("div", { className: "ro-metric-grid", style: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 6, marginBottom: 8 } }, [
                    ["Fuente", sourceLabel],
                    ["Seleccionados", selectedCount],
                    ["A ejecutar", effectiveCount],
                    ["Limite", limitLabel],
                ].map(([label, value]) => (React.createElement("div", { key: label, style: { background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", minWidth: 0 } },
                    React.createElement("div", { style: { fontSize: 7, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: .6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, label),
                    React.createElement("div", { style: { fontSize: 11, color: "var(--text-0)", fontWeight: 700, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, value))))),
                React.createElement("div", { style: { marginBottom: 8, padding: "7px 9px", borderRadius: 6, border: "1px solid rgba(245,158,11,.22)", background: "var(--panel-warning-bg)", fontSize: 9, color: "var(--text-2)", lineHeight: 1.4 } }, loadHint),
                guardMessage && (React.createElement("div", { style: { marginBottom: 8, padding: "8px 10px", borderRadius: 6,
                        border: "1px solid " + (guardTone === "danger" ? "rgba(220,50,50,.38)" : guardTone === "warning" ? "rgba(245,158,11,.38)" : "rgba(0,180,255,.25)"),
                        background: guardTone === "danger" ? "rgba(220,50,50,.08)" : guardTone === "warning" ? "var(--panel-warning-bg)" : "var(--panel-accent-bg)",
                        color: guardTone === "danger" ? "var(--red)" : guardTone === "warning" ? "var(--amber)" : "var(--accent)",
                        fontSize: 9, lineHeight: 1.45, fontWeight: 700 } }, guardMessage)),
                React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6, alignItems: "stretch" } },
                    React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" } }, [["scan", "Ultimo Scan"], ["custom", "Tickers propios"]].map(([id, label]) => (React.createElement("button", { key: id, onClick: () => setBtUniverseSource(id), style: { ...S.btnG(btUniverseSource === id), padding: "3px 10px", fontSize: 9 } }, label)))),
                    customLists.length > 0 && (React.createElement("div", null,
                        React.createElement("div", { style: { fontSize: 8, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: .8, marginBottom: 4 } }, "Mis listas"),
                        React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" } }, customLists.map(list => (React.createElement("span", { key: list.id, style: { display: "inline-flex", alignItems: "center", gap: 4 } },
                            React.createElement("button", { onClick: () => setBtUniverseSource('LIST_' + list.id), style: { ...S.btnG(btUniverseSource === 'LIST_' + list.id), padding: "3px 10px", fontSize: 9 } },
                                list.name,
                                " (",
                                (list.tickers || []).length,
                                ")"),
                            React.createElement("button", { onClick: () => editList(list), title: "Editar lista", style: { ...S.btnG(false), padding: "3px 7px", fontSize: 8 } }, "Editar"),
                            React.createElement("button", { onClick: () => deleteList(list), title: "Eliminar lista", style: { ...S.btnG(false), padding: "3px 7px", fontSize: 8, color: "var(--red)", borderColor: "rgba(220,50,50,.28)" } }, "Eliminar"))))))),
                    (groups.map(g => (React.createElement("div", { key: g.id },
                        React.createElement("div", { style: { fontSize: 8, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: .8, marginBottom: 4 } }, g.label),
                        React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" } }, Object.entries(presets).filter(([, v]) => v.group === g.id).map(([id, v]) => (React.createElement("button", { key: id, onClick: () => setBtUniverseSource(id), title: (v.tickers || []).length + " tickers", style: { ...S.btnG(btUniverseSource === id), padding: "3px 10px", fontSize: 9 } },
                            v.label,
                            " (",
                            (v.tickers || []).length,
                            ")"))))))))),
                btUniverseSource === "custom" && (React.createElement(React.Fragment, null,
                    React.createElement("textarea", { rows: 2, value: btCustomTickers, onChange: e => setBtCustomTickers(e.target.value.toUpperCase()), placeholder: "AAPL, MSFT, NVDA, TSLA...", spellCheck: false, style: { ...S.inp, marginTop: 6, width: "100%", padding: "6px 8px", fontFamily: "var(--font-mono)", fontSize: 10, resize: "vertical" } }),
                    React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 6, padding: "7px 8px", border: "1px solid var(--panel-soft-border)", borderRadius: 6, background: "var(--panel-accent-bg)" } },
                        React.createElement("input", { value: btUniverseListName, onChange: e => setBtUniverseListName(e.target.value), placeholder: "Nombre de lista propia", style: { ...S.inp, width: 180 } }),
                        React.createElement("button", { onClick: saveList, style: { ...S.btnG(true), fontSize: 9, borderColor: "rgba(0,160,255,.4)", color: "var(--accent)" } }, btEditingListId ? "Actualizar lista" : "Guardar lista"),
                        btEditingListId && React.createElement("button", { onClick: () => { setBtEditingListId(''); setBtUniverseListName(''); }, style: { ...S.btnG(false), fontSize: 9 } }, "Nueva lista")))),
                btUniverseSource === "scan" && React.createElement("span", { style: { fontSize: 8, color: "var(--text-2)", marginLeft: 6 } },
                    selectedCount,
                    " tickers en cache del ultimo scan"),
                btUniverseSource === "custom" && React.createElement("span", { style: { fontSize: 8, color: "var(--text-2)", marginLeft: 6 } },
                    selectedCount,
                    " tickers propios detectados")))));
    }
    // ── Stale Data Banner ──────────────────────────────────────────────────────
    function renderDataBanner(ctx) {
        const { S, dataCacheRef, scanMeta, btDirection, btUniverseSource } = ctx;
        if (btUniverseSource !== "scan")
            return null;
        const cacheCount = Object.keys(dataCacheRef.current).length;
        if (cacheCount === 0)
            return (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", marginBottom: 8, borderRadius: "var(--radius)", border: "1px solid rgba(220,100,30,.35)", background: "rgba(220,100,30,.08)", fontSize: 10, color: "var(--amber)" } },
                React.createElement("span", null, "!"),
                React.createElement("span", null,
                    React.createElement("b", null, "Sin datos de scan."),
                    " Ejecuta un scan en la pestana Scanner antes de correr el backtest.")));
        const dirMismatch = scanMeta && scanMeta.direction !== btDirection;
        const elapsed = scanMeta ? Math.round((Date.now() - scanMeta.ts) / 60000) : null;
        const timeLabel = elapsed === null ? '' : elapsed < 1 ? ' - hace menos de 1 min' : elapsed < 60 ? ` - hace ${elapsed} min` : ` - hace ${Math.round(elapsed / 60)}h`;
        return (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", marginBottom: 8, borderRadius: "var(--radius)", border: "1px solid " + (dirMismatch ? "rgba(220,100,30,.35)" : "rgba(28,82,52,.35)"), background: dirMismatch ? "rgba(220,100,30,.07)" : "rgba(0,180,80,.05)", fontSize: 10, color: dirMismatch ? "var(--amber)" : "var(--green)", flexWrap: "wrap" } },
            React.createElement("span", null, dirMismatch ? "!" : "OK"),
            React.createElement("span", null,
                "Datos del ultimo scan: ",
                React.createElement("b", null,
                    cacheCount,
                    " tickers"),
                scanMeta ? ` - ${scanMeta.passed} pasan - modo ${scanMeta.direction.toUpperCase()}` : '',
                timeLabel),
            dirMismatch && React.createElement("span", { style: { color: "var(--amber)" } },
                "- el scan fue en modo ",
                React.createElement("b", null, scanMeta.direction.toUpperCase()),
                " pero el backtest esta en ",
                React.createElement("b", null, btDirection.toUpperCase()),
                ". Considera volver a escanear.")));
    }
    // ── One Rule Group (entry or exit, long or short) ─────────────────────────
    function renderRuleGroup(grp, gi, rules, setRules, accent, ctx) {
        const { S, INDICATORS, TIMEFRAMES, tfColor, newCond } = ctx;
        return (React.createElement("div", { key: grp._id, style: { border: "1px solid " + (accent === "var(--green)" ? "rgba(0,200,100,.15)" : "rgba(220,50,50,.15)"), borderRadius: 5, padding: 8, marginBottom: 6, background: "var(--panel-soft-bg)" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 } },
                React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: accent } },
                    "Grupo ",
                    gi + 1,
                    " ",
                    React.createElement("span", { style: { color: "var(--text-2)", fontWeight: 400 } }, "(AND)")),
                React.createElement("div", { style: { display: "flex", gap: 4 } },
                    React.createElement("button", { onClick: () => setRules(r => r.map(g => g._id === grp._id ? { ...g, conditions: [...g.conditions, newCond()] } : g)), style: { background: "none", border: "1px solid var(--panel-soft-border)", color: "var(--accent)", cursor: "pointer", padding: "2px 6px", borderRadius: 3, fontSize: 8, fontFamily: "var(--font-body)" } }, "+ Condicion"),
                    rules.length > 1 && React.createElement("button", { onClick: () => setRules(r => r.filter(g => g._id !== grp._id)), style: { background: "none", border: "1px solid rgba(220,50,50,.2)", color: "var(--red)", cursor: "pointer", padding: "2px 6px", borderRadius: 3, fontSize: 8, fontFamily: "var(--font-body)" } }, "x"))),
            grp.conditions.map((c, ci) => {
                var _a;
                const indDef = INDICATORS.find(x => x.id === c.ind);
                const upC = (patch) => setRules(r => r.map(g => g._id === grp._id ? { ...g, conditions: g.conditions.map((cc, ii) => ii === ci ? { ...cc, ...patch } : cc) } : g));
                const rmC = () => setRules(r => r.map(g => g._id === grp._id ? { ...g, conditions: g.conditions.filter((_, ii) => ii !== ci) } : g));
                return (React.createElement("div", { key: ci, style: { display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 4, paddingBottom: 4, borderBottom: ci < grp.conditions.length - 1 ? "1px solid var(--panel-soft-border)" : "none" } },
                    React.createElement("select", { value: c.tf, onChange: e => upC({ tf: e.target.value }), style: { ...S.inp, width: 80, fontSize: 8, fontWeight: 600, color: tfColor[c.tf] || "var(--accent)", borderColor: tfColor[c.tf] || "var(--border-light)" } }, TIMEFRAMES.map(t => React.createElement("option", { key: t.id, value: t.id }, t.id.toUpperCase()))),
                    React.createElement("select", { value: c.ind, onChange: e => { const def = INDICATORS.find(x => x.id === e.target.value); upC({ ind: e.target.value, params: { p: (def === null || def === void 0 ? void 0 : def.param) || 14, ...(e.target.value === "STOCH" ? { ks: 1, dp: 3 } : {}), ...(e.target.value === "MACD" ? { sl: 26, sg: 9 } : {}) } }); }, style: { ...S.inp, fontSize: 8, maxWidth: 130 } }, INDICATORS.map(i => React.createElement("option", { key: i.id, value: i.id }, i.label))),
                    ['STOCH', 'MACD'].includes(c.ind) && React.createElement(window.StockScannerUI.IndicatorParameters, { indicator: c.ind, params: c.params, onChange: params => upC({ params }) }),
                    (indDef === null || indDef === void 0 ? void 0 : indDef.param) != null && c.ind !== "STOCH" && c.ind !== "MACD" && (React.createElement("input", { type: "number", className: "numeric-value-input", min: 1, max: 500, value: c.params.p, onChange: e => upC({ params: { ...c.params, p: +e.target.value || 1 } }), style: { ...S.inp, width: 45, textAlign: "center", fontSize: 8 }, title: "Periodo" })),
                    React.createElement("select", { value: c.op, onChange: e => upC({ op: e.target.value }), style: { ...S.inp, width: 58, fontSize: 8 } },
                        React.createElement("option", { value: ">" }, ">"),
                        React.createElement("option", { value: "<" }, "<"),
                        React.createElement("option", { value: ">=" }, ">="),
                        React.createElement("option", { value: "<=" }, "<="),
                        React.createElement("option", { value: "x_up" }, "Cruza arriba"),
                        React.createElement("option", { value: "x_dn" }, "Cruza abajo")),
                    React.createElement("select", { value: c.cmpType, onChange: e => upC({ cmpType: e.target.value }), style: { ...S.inp, maxWidth: 100, fontSize: 8 } },
                        React.createElement("option", { value: "val" }, "Valor"),
                        React.createElement("option", { value: "prev" }, "Anterior"),
                        React.createElement("option", { value: "ind" }, "Indicador")),
                    c.cmpType === "val" && React.createElement("input", { type: "number", className: "numeric-value-input", step: "any", value: c.cmpVal, onChange: e => upC({ cmpVal: +e.target.value || 0 }), style: { ...S.inp, width: 60, textAlign: "center", fontSize: 8 } }),
                    c.cmpType === "ind" && (React.createElement(React.Fragment, null,
                        React.createElement("select", { value: c.cmpInd, onChange: e => { const def = INDICATORS.find(x => x.id === e.target.value); upC({ cmpInd: e.target.value, cmpParams: { p: (def === null || def === void 0 ? void 0 : def.param) || 14 } }); }, style: { ...S.inp, maxWidth: 100, fontSize: 8 } }, INDICATORS.map(i => React.createElement("option", { key: i.id, value: i.id }, i.label))),
                        ((_a = INDICATORS.find(x => x.id === c.cmpInd)) === null || _a === void 0 ? void 0 : _a.param) != null && (React.createElement("input", { type: "number", className: "numeric-value-input", min: 1, max: 500, value: c.cmpParams.p, onChange: e => upC({ cmpParams: { ...c.cmpParams, p: +e.target.value || 1 } }), style: { ...S.inp, width: 40, textAlign: "center", fontSize: 8 } })))),
                    grp.conditions.length > 1 && React.createElement("button", { onClick: rmC, style: { background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12, padding: "0 4px" } }, "x")));
            })));
    }
    // ── Rules Panel (entry + exit for one side) ────────────────────────────────
    function renderRulesPanel(entryRules, setEntryRules, exitRules, setExitRules, entryLabel, exitLabel, entryAccent, exitAccent, ctx) {
        const { S, newGroup } = ctx;
        return (React.createElement("div", { className: "ro-stack-mobile", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 } }, [[entryLabel, entryRules, setEntryRules, entryAccent], [exitLabel, exitRules, setExitRules, exitAccent]].map(([title, rules, setRules, accent]) => (React.createElement("div", { key: title, style: { ...S.cd, padding: 10 } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } },
                React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: accent } }, title),
                React.createElement("button", { onClick: () => setRules(r => [...r, newGroup()]), style: { ...S.btn, background: "var(--bg-3)", border: "1px solid " + accent + "40", color: accent, padding: "3px 8px", fontSize: 9 } }, "+ Grupo OR")),
            React.createElement("div", { style: { fontSize: 8, color: "var(--text-2)", marginBottom: 6 } }, "Entra/Sale si ALGUN grupo se cumple (OR entre grupos, AND dentro)"),
            rules.map((grp, gi) => renderRuleGroup(grp, gi, rules, setRules, accent, ctx)))))));
    }
    // ── Backtest Stats ─────────────────────────────────────────────────────────
    // ── Monthly P&L chart - proper React component so useState is legal ────────
    function MonthlyPnlChart({ backtest, S }) {
        const [open, setOpen] = React.useState(true);
        const isNum = v => Number.isFinite(Number(v));
        const monthlyPnl = (() => {
            const map = {};
            (backtest.allTrades || []).forEach(t => {
                if (!t.exitTime || !isNum(t.pnl))
                    return;
                const key = new Date(t.exitTime * 1000).getUTCMonth();
                if (!map[key])
                    map[key] = { wins: 0, losses: 0 };
                if (t.pnl > 0)
                    map[key].wins += t.pnl;
                else
                    map[key].losses += t.pnl;
            });
            return Array.from({ length: 12 }, (_, i) => { var _a, _b; return ({ month: i, wins: ((_a = map[i]) === null || _a === void 0 ? void 0 : _a.wins) || 0, losses: ((_b = map[i]) === null || _b === void 0 ? void 0 : _b.losses) || 0 }); });
        })();
        const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const maxBar = Math.max(...monthlyPnl.map(m => Math.max(m.wins, Math.abs(m.losses))), 1);
        const fmtK = v => Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
        const gridColor = "var(--row-divider)", gridColorMid = "var(--panel-soft-border)";
        const ls = { fontSize: 7, fill: "var(--text-2)", fontFamily: "var(--font-mono)" };
        const H2 = 180, padL = 42, svgW = 440, svgH = H2 + 28;
        const barW = (svgW - padL) / 12;
        const yZero = H2 / 2;
        const yPos = v => yZero - ((v / maxBar) * (yZero * 0.9));
        const hPos = v => (v / maxBar) * (yZero * 0.9);
        const hNeg = v => Math.abs(v / maxBar) * (yZero * 0.9);
        return (React.createElement("div", { style: { ...S.cd, marginBottom: 8 } },
            React.createElement("button", { onClick: () => setOpen(v => !v), style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" } },
                React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 1 } }, "Ganancias y perdidas por mes"),
                React.createElement("span", { style: { fontSize: 10, color: "var(--text-2)" } }, open ? "Ocultar" : "Mostrar")),
            open && (React.createElement("div", { style: { padding: "0 12px 12px" } },
                React.createElement("svg", { className: "bt-analysis-chart", role: "img", "aria-label": "Distribuci\u00F3n de ganancias y p\u00E9rdidas por mes", viewBox: "0 0 " + (svgW + 4) + " " + svgH, style: { width: "100%" }, preserveAspectRatio: "xMidYMid meet" },
                    [0, .25, .5, .75, 1].map(f => React.createElement("line", { key: f, x1: padL, y1: yZero - f * (yZero * .9), x2: svgW, y2: yZero - f * (yZero * .9), stroke: f === 0 ? gridColorMid : gridColor, strokeWidth: f === 0 ? ".5" : ".3" })),
                    [.25, .5, .75].map(f => React.createElement("line", { key: "n" + f, x1: padL, y1: yZero + f * (yZero * .9), x2: svgW, y2: yZero + f * (yZero * .9), stroke: gridColor, strokeWidth: ".3" })),
                    [[maxBar, yZero - (yZero * .9)], [0, yZero], [-maxBar, yZero + (yZero * .9)]].map(([v, y]) => (React.createElement("text", { key: v, x: padL - 2, y: y + 3, textAnchor: "end", ...ls }, fmtK(v)))),
                    monthlyPnl.map((m, i) => {
                        const xBase = padL + i * barW + barW * .08, bW = barW * .4;
                        return (React.createElement("g", { key: i },
                            m.wins > 0 && React.createElement("rect", { x: xBase, y: yPos(m.wins), width: bW, height: hPos(m.wins), fill: "var(--accent)", rx: ".5" }),
                            m.losses < 0 && React.createElement("rect", { x: xBase + bW + barW * .05, y: yZero, width: bW, height: hNeg(m.losses), fill: "var(--red)", rx: ".5" }),
                            React.createElement("text", { x: xBase + bW, y: svgH - 2, textAnchor: "middle", ...ls }, MONTHS[i])));
                    }),
                    React.createElement("line", { x1: padL, y1: 0, x2: padL, y2: H2, stroke: gridColorMid, strokeWidth: ".5" })),
                React.createElement("div", { style: { display: "flex", gap: 12, fontSize: 8, color: "var(--text-2)", marginTop: 4 } },
                    React.createElement("span", null,
                        React.createElement("span", { style: { display: "inline-block", width: 10, height: 8, background: "var(--accent)", borderRadius: 2, marginRight: 4, verticalAlign: "middle" } }),
                        "Ganancias"),
                    React.createElement("span", null,
                        React.createElement("span", { style: { display: "inline-block", width: 10, height: 8, background: "var(--red)", borderRadius: 2, marginRight: 4, verticalAlign: "middle" } }),
                        "Perdidas"))))));
    }
    // ── MFE/MAE scatter - proper React component so useState is legal ──────────
    function ScatterChart({ backtest, S }) {
        const [open, setOpen] = React.useState(true);
        const isNum = v => Number.isFinite(Number(v));
        const trades = (backtest.allTrades || []).filter(t => isNum(t.pnl) && isNum(t.returnPct));
        const winners = trades.filter(t => t.pnl > 0);
        const losers = trades.filter(t => t.pnl <= 0);
        const maxPnl = Math.max(...trades.map(t => Math.abs(t.pnl)), 1);
        const maxRet = Math.max(...trades.map(t => Math.abs(t.returnPct)), 1);
        const fmtK = v => Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
        const gridColor = "var(--row-divider)", gridColorMid = "var(--panel-soft-border)";
        const ls = { fontSize: 7, fill: "var(--text-2)", fontFamily: "var(--font-mono)" };
        const padL = 30, padB = 20, padT = 4, svgW = 320, svgH = 180;
        const plotW = svgW - padL, plotH = svgH - padB - padT;
        const cx = ret => padL + ((ret + maxRet) / (maxRet * 2)) * plotW;
        const cy = pnl => padT + ((maxPnl - pnl) / (maxPnl * 2)) * plotH;
        const xLabels = [-maxRet, -maxRet / 2, 0, maxRet / 2, maxRet];
        const yLabels = [maxPnl, maxPnl / 2, 0, -maxPnl / 2, -maxPnl];
        return (React.createElement("div", { style: { ...S.cd, marginBottom: 8 } },
            React.createElement("button", { onClick: () => setOpen(v => !v), style: { display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "10px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" } },
                React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 1 } }, "MFE / MAE por trade"),
                React.createElement("span", { style: { fontSize: 10, color: "var(--text-2)" } }, open ? "Ocultar" : "Mostrar")),
            open && trades.length > 0 && (React.createElement("div", { style: { padding: "0 12px 12px" } },
                React.createElement("svg", { className: "bt-analysis-chart", role: "img", "aria-label": "Distribuci\u00F3n de retornos y PnL por operaci\u00F3n", viewBox: "0 0 " + svgW + " " + svgH, style: { width: "100%" }, preserveAspectRatio: "xMidYMid meet" },
                    [0, .25, .5, .75, 1].map((f, i) => React.createElement("line", { key: "xg" + i, x1: padL + f * plotW, y1: padT, x2: padL + f * plotW, y2: padT + plotH, stroke: i === 2 ? gridColorMid : gridColor, strokeWidth: i === 2 ? ".6" : ".3" })),
                    [0, .25, .5, .75, 1].map((f, i) => React.createElement("line", { key: "yg" + i, x1: padL, y1: padT + f * plotH, x2: padL + plotW, y2: padT + f * plotH, stroke: i === 2 ? gridColorMid : gridColor, strokeWidth: i === 2 ? ".6" : ".3" })),
                    xLabels.map((v, i) => React.createElement("text", { key: "xl" + i, x: padL + (i / 4) * plotW, y: svgH - 4, textAnchor: "middle", ...ls },
                        v.toFixed(1),
                        "%")),
                    yLabels.map((v, i) => React.createElement("text", { key: "yl" + i, x: padL - 3, y: padT + (i / 4) * plotH + 3, textAnchor: "end", ...ls }, fmtK(v))),
                    winners.map((t, i) => (React.createElement("circle", { key: "w" + i, cx: Math.min(padL + plotW - 1, Math.max(padL + 1, cx(t.returnPct))), cy: Math.min(padT + plotH - 1, Math.max(padT + 1, cy(t.pnl))), r: "1.4", fill: "var(--accent)" },
                        React.createElement("title", null,
                            "+",
                            t.returnPct.toFixed(1),
                            "% | $",
                            t.pnl.toFixed(0))))),
                    losers.map((t, i) => (React.createElement("circle", { key: "l" + i, cx: Math.min(padL + plotW - 1, Math.max(padL + 1, cx(t.returnPct))), cy: Math.min(padT + plotH - 1, Math.max(padT + 1, cy(t.pnl))), r: "1.4", fill: "var(--red)" },
                        React.createElement("title", null,
                            t.returnPct.toFixed(1),
                            "% | $",
                            t.pnl.toFixed(0))))),
                    React.createElement("rect", { x: padL, y: padT, width: plotW, height: plotH, fill: "none", stroke: gridColorMid, strokeWidth: ".5" }),
                    React.createElement("text", { x: padL + plotW / 2, y: svgH, textAnchor: "middle", style: { fontSize: 7.5, fill: "var(--text-2)", fontFamily: "var(--font-mono)" } }, "Retorno % (MAE - 0 - MFE)")),
                React.createElement("div", { style: { display: "flex", gap: 12, fontSize: 8, color: "var(--text-2)", marginTop: 2 } },
                    React.createElement("span", null,
                        React.createElement("span", { style: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", marginRight: 4, verticalAlign: "middle" } }),
                        "Ganadores (",
                        winners.length,
                        ")"),
                    React.createElement("span", null,
                        React.createElement("span", { style: { display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--red)", marginRight: 4, verticalAlign: "middle" } }),
                        "Perdedores (",
                        losers.length,
                        ")")))),
            open && trades.length === 0 && React.createElement("div", { style: { padding: "8px 12px 12px", fontSize: 9, color: "var(--text-2)" } }, "Sin trades para mostrar")));
    }
    // ── Equity + Drawdown + collapsible charts ────────────────────────────────
    function renderBtCharts(backtest, ctx) {
        var _a;
        return ((_a = backtest === null || backtest === void 0 ? void 0 : backtest.equityCurve) === null || _a === void 0 ? void 0 : _a.length) > 1 ? React.createElement(BacktestCharts, { backtest: backtest, ctx: ctx }) : null;
    }
    function BacktestCharts({ backtest, ctx }) {
        var _a, _b, _c, _d, _e, _f, _g;
        const [hover, setHover] = React.useState(null);
        const { S, btCapital, savedStrategies } = ctx;
        const data = backtest.equityCurve;
        if (!data || data.length < 2)
            return null;
        const allV = [...data.map(d => d.value)];
        if (backtest.benchCurve)
            allV.push(...backtest.benchCurve.map(d => d.value));
        savedStrategies.forEach(s => { if (s.equityCurve)
            allV.push(...s.equityCurve.map(d => d.value)); });
        const minV = Math.min(...allV) * 0.97, maxV = Math.max(...allV) * 1.03;
        const W = 100, H = 50;
        const mp = v => H - ((v - minV) / (maxV - minV)) * H;
        const pts = data.map((d, i) => (i / (data.length - 1) * W).toFixed(2) + "," + mp(d.value).toFixed(2)).join(" ");
        const fill = pts + " " + W + "," + H + " 0," + H;
        const pos = data.map(d => d.holdings), mxP = Math.max(...pos, 1);
        const sCol = ["var(--chart-pill-3)", "var(--amber)", "var(--chart-pill-6)", "var(--chart-pill-5)", "var(--chart-pill-7)"];
        let bPts = "";
        if (((_a = backtest.benchCurve) === null || _a === void 0 ? void 0 : _a.length) > 1)
            bPts = backtest.benchCurve.map((d, i) => (i / (backtest.benchCurve.length - 1) * W).toFixed(2) + "," + mp(d.value).toFixed(2)).join(" ");
        const sPts = savedStrategies.map(s => { var _a; return ((_a = s.equityCurve) === null || _a === void 0 ? void 0 : _a.length) > 1 ? s.equityCurve.map((d, i) => (i / (s.equityCurve.length - 1) * W).toFixed(2) + "," + mp(d.value).toFixed(2)).join(" ") : ""; });
        let pk = Number(backtest.startVal) || Number(backtest.capital) || 0;
        const dd = data.map(d => { if (d.value > pk)
            pk = d.value; return { v: pk > 0 ? -((pk - d.value) / pk) * 100 : 0 }; });
        const mn = Math.min(...dd.map(d => d.v));
        const rg = 0 - mn || 1;
        const ddPts = dd.map((d, i) => (i / (dd.length - 1) * W).toFixed(2) + "," + (25 - ((d.v - mn) / rg) * 25).toFixed(2)).join(" ");
        const avgPos = data.reduce((a, d) => a + (d.holdings || 0), 0) / data.length;
        const fmtPct = (v, dec = 1) => (v >= 0 ? "+" : "") + v.toFixed(dec) + "%";
        const metricCards = [
            ["Rentabilidad", fmtPct(backtest.totalReturn * 100), backtest.totalReturn >= 0 ? "var(--green)" : "var(--red)"],
            ["Max Drawdown", "-" + (backtest.maxDrawdown * 100).toFixed(1) + "%", "var(--red)"],
            ["Posiciones", `${((_b = data[data.length - 1]) === null || _b === void 0 ? void 0 : _b.holdings) || 0} / ${ctx.pfMaxPos || "-"}`, "var(--accent)"],
            ["Prom. pos", avgPos.toFixed(1), "var(--text-1)"],
            ["CAGR", fmtPct(backtest.annReturn * 100), backtest.annReturn >= 0 ? "var(--green)" : "var(--red)"],
            ["Winrate", (backtest.winRate * 100).toFixed(1) + "%", backtest.winRate >= .5 ? "var(--green)" : "var(--amber)"],
            ["Sharpe", backtest.sharpe.toFixed(2), backtest.sharpe > 1 ? "var(--green)" : backtest.sharpe > .5 ? "var(--amber)" : "var(--red)"],
        ];
        const equityGraphic = React.useMemo(() => (React.createElement("svg", { className: "bt-equity-chart", viewBox: "0 0 " + W + " " + (H + 8), style: { width: "100%" }, preserveAspectRatio: "none" },
            React.createElement("defs", null,
                React.createElement("linearGradient", { id: "btF", x1: "0", y1: "0", x2: "0", y2: "1" },
                    React.createElement("stop", { offset: "0%", stopColor: backtest.totalReturn > 0 ? "var(--green)" : "var(--red)", stopOpacity: ".15" }),
                    React.createElement("stop", { offset: "100%", stopColor: backtest.totalReturn > 0 ? "var(--green)" : "var(--red)", stopOpacity: "0" }))),
            [.25, .5, .75].map(f => React.createElement("line", { key: f, x1: "0", y1: H * f, x2: W, y2: H * f, stroke: "var(--panel-soft-border)", strokeWidth: ".3" })),
            React.createElement("line", { x1: "0", y1: mp(btCapital), x2: W, y2: mp(btCapital), stroke: "var(--chart-level)", strokeWidth: ".3", strokeDasharray: "1,1" }),
            data.map((d, i) => d.mktBlocked ? (React.createElement("rect", { key: "mf" + i, x: ((i / (data.length - 1)) * W - .3).toFixed(2), y: "0", width: "1.0", height: H + 8, fill: "var(--panel-warning-bg)" })) : null),
            sPts.map((p, i) => p ? React.createElement("polyline", { key: "s" + i, points: p, fill: "none", stroke: sCol[i % sCol.length], strokeWidth: ".5", opacity: ".6", vectorEffect: "non-scaling-stroke" }) : null),
            bPts && React.createElement("polyline", { points: bPts, fill: "none", stroke: "var(--text-3)", strokeWidth: ".5", strokeDasharray: "1,.5", vectorEffect: "non-scaling-stroke" }),
            React.createElement("polygon", { points: fill, fill: "url(#btF)" }),
            React.createElement("polyline", { points: pts, fill: "none", stroke: backtest.totalReturn > 0 ? "var(--green)" : "var(--red)", strokeWidth: ".6", vectorEffect: "non-scaling-stroke" }),
            data.map((d, i) => React.createElement("rect", { key: i, x: (i / (data.length - 1)) * W - .2, y: H + 1, width: ".4", height: (d.holdings / mxP) * 7, fill: "var(--accent)", opacity: ".35" })))), [backtest, savedStrategies, btCapital]);
        const drawdownGraphic = React.useMemo(() => (React.createElement("svg", { className: "bt-drawdown-chart", viewBox: "0 0 " + W + " 25", style: { width: "100%" }, preserveAspectRatio: "none" },
            React.createElement("defs", null,
                React.createElement("linearGradient", { id: "ddF", x1: "0", y1: "1", x2: "0", y2: "0" },
                    React.createElement("stop", { offset: "0%", stopColor: "var(--red)", stopOpacity: ".3" }),
                    React.createElement("stop", { offset: "100%", stopColor: "var(--red)", stopOpacity: ".02" }))),
            React.createElement("polygon", { points: ddPts + " " + W + ",0 0,0", fill: "url(#ddF)" }),
            React.createElement("polyline", { points: ddPts, fill: "none", stroke: "var(--red)", strokeWidth: "1.4", vectorEffect: "non-scaling-stroke" }))), [ddPts]);
        const index = Math.min((_c = hover === null || hover === void 0 ? void 0 : hover.index) !== null && _c !== void 0 ? _c : 0, data.length - 1);
        const x = index / (data.length - 1) * 100;
        const point = data[index];
        const money = value => Number.isFinite(value) ? new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value) : '—';
        const date = point.time ? new Date(point.time * 1000).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Semana ' + (index + 1);
        // Follow the same fractional X position used by each displayed polyline.
        const valueAtX = curve => {
            if (!(curve === null || curve === void 0 ? void 0 : curve.length))
                return null;
            const at = index / (data.length - 1) * (curve.length - 1), lo = Math.floor(at), hi = Math.ceil(at);
            return curve[lo].value + (curve[hi].value - curve[lo].value) * (at - lo);
        };
        const move = (event, kind) => {
            const box = event.currentTarget.getBoundingClientRect();
            if (!box.width)
                return;
            const position = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
            const next = Math.round(position * (data.length - 1));
            setHover(prev => (prev === null || prev === void 0 ? void 0 : prev.index) === next && prev.kind === kind ? prev : { index: next, kind });
        };
        const interaction = kind => ({
            onPointerMove: event => move(event, kind), onPointerDown: event => move(event, kind), onPointerLeave: () => setHover(null),
            onFocus: () => setHover({ index: data.length - 1, kind }), onBlur: () => setHover(null),
            onKeyDown: event => {
                var _a;
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key))
                    return;
                event.preventDefault();
                if (event.key === 'Escape') {
                    setHover(null);
                    return;
                }
                const current = (_a = hover === null || hover === void 0 ? void 0 : hover.index) !== null && _a !== void 0 ? _a : data.length - 1;
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? data.length - 1 : Math.max(0, Math.min(data.length - 1, current + (event.key === 'ArrowLeft' ? -1 : 1)));
                setHover({ index: next, kind });
            }
        });
        const cursor = kind => {
            var _a, _b;
            return hover && React.createElement(React.Fragment, null,
                React.createElement("div", { className: "bt-plot-crosshair", style: { left: x + '%' } }),
                hover.kind === kind && React.createElement("div", { className: "bt-plot-tooltip", role: "tooltip", style: { left: Math.max(2, Math.min(98, x)) + '%', transform: x > 50 ? 'translateX(-100%)' : undefined } },
                    React.createElement("strong", null, date),
                    React.createElement("div", null,
                        React.createElement("span", null, "Capital"),
                        React.createElement("b", null, money(point.value))),
                    React.createElement("div", null,
                        React.createElement("span", null, "Rentabilidad"),
                        React.createElement("b", null, fmtPct((point.value / backtest.startVal - 1) * 100, 2))),
                    ((_a = backtest.benchCurve) === null || _a === void 0 ? void 0 : _a.length) > 0 && React.createElement("div", null,
                        React.createElement("span", null, backtest.benchSymbol || 'Benchmark'),
                        React.createElement("b", null, money(valueAtX(backtest.benchCurve)))),
                    savedStrategies.map((strategy, i) => React.createElement("div", { key: i },
                        React.createElement("span", null, strategy.label),
                        React.createElement("b", null, money(valueAtX(strategy.equityCurve))))),
                    React.createElement("div", null,
                        React.createElement("span", null, "Drawdown"),
                        React.createElement("b", { style: { color: 'var(--red)' } },
                            dd[index].v.toFixed(2),
                            "%")),
                    React.createElement("div", null,
                        React.createElement("span", null, "Posiciones"),
                        React.createElement("b", null, (_b = point.holdings) !== null && _b !== void 0 ? _b : 0)),
                    point.mktBlocked && React.createElement("small", null, "Filtro de mercado: entradas bloqueadas")));
        };
        return (React.createElement("div", { style: { marginBottom: 8 } },
            React.createElement("div", { style: { ...S.cd, padding: 12, marginBottom: 8 } },
                React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 } }, "Equity Curve"),
                React.createElement("div", { className: "ro-metric-grid", style: { display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 6, marginBottom: 8 } }, metricCards.map(([label, value, color]) => (React.createElement("div", { key: label, style: { background: "var(--panel-soft-bg)", border: "1px solid var(--panel-soft-border)", borderRadius: "var(--radius-sm)", padding: "7px 8px", minWidth: 0, boxShadow: "var(--shadow-card)" } },
                    React.createElement("div", { style: { fontSize: 7, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: .6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, label),
                    React.createElement("div", { style: { fontSize: 12, color, fontWeight: 700, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, value))))),
                React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-2)", marginBottom: 3 } },
                    React.createElement("span", null,
                        "$",
                        backtest.startVal.toLocaleString()),
                    React.createElement("span", { style: { color: backtest.totalReturn > 0 ? "var(--green)" : "var(--red)", fontWeight: 700 } },
                        backtest.totalReturn > 0 ? "+" : "",
                        (backtest.totalReturn * 100).toFixed(1),
                        "% - $",
                        backtest.endVal.toFixed(0)),
                    React.createElement("span", null,
                        backtest.weeks,
                        "w")),
                React.createElement("div", { style: { display: "flex", gap: 10, fontSize: 8, color: "var(--text-2)", marginBottom: 6, flexWrap: "wrap", alignItems: "center" } },
                    React.createElement("span", null,
                        React.createElement("span", { style: { display: "inline-block", width: 10, height: 2, background: backtest.totalReturn > 0 ? "var(--green)" : "var(--red)", verticalAlign: "middle", marginRight: 3 } }),
                        "Estrategia"),
                    bPts && React.createElement("span", null,
                        React.createElement("span", { style: { display: "inline-block", width: 10, height: 2, background: "var(--text-3)", verticalAlign: "middle", marginRight: 3 } }),
                        backtest.benchSymbol),
                    savedStrategies.map((s, i) => React.createElement("span", { key: i },
                        React.createElement("span", { style: { display: "inline-block", width: 10, height: 2, background: sCol[i % sCol.length], verticalAlign: "middle", marginRight: 3, opacity: .7 } }),
                        s.label)),
                    backtest.benchReturn != null && (React.createElement("span", null,
                        backtest.benchSymbol,
                        ": ",
                        React.createElement("b", { style: { color: backtest.benchReturn > 0 ? "var(--green)" : "var(--red)" } },
                            (backtest.benchReturn * 100).toFixed(1),
                            "%"),
                        React.createElement("span", { style: { color: "var(--text-2)", marginLeft: 6 } },
                            "Alpha: ",
                            React.createElement("b", { style: { color: (backtest.totalReturn - backtest.benchReturn) > 0 ? "var(--green)" : "var(--red)" } },
                                ((backtest.totalReturn - backtest.benchReturn) * 100).toFixed(1),
                                "%")))),
                    ((_d = backtest.mktFilter) === null || _d === void 0 ? void 0 : _d.enabled) && (React.createElement("span", { style: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, background: "var(--panel-warning-bg)", border: "1px solid var(--panel-warning-border)", color: "var(--amber)", fontSize: 8 } },
                        React.createElement("span", { style: { display: "inline-block", width: 8, height: 8, background: "var(--amber)", opacity: .42, verticalAlign: "middle", borderRadius: 1 } }),
                        backtest.mktFilter.label || ('Filtro ' + backtest.mktFilter.ticker),
                        ": ",
                        backtest.mktFilter.blockedWeeks,
                        "w/",
                        backtest.mktFilter.totalWeeks,
                        "w bloqueadas"))),
                React.createElement("div", { className: "bt-interactive-plot", role: "group", "aria-label": "Curva de capital interactiva", tabIndex: 0, ...interaction('equity') },
                    equityGraphic,
                    cursor('equity')),
                React.createElement("div", { style: { display: "none", gap: 10, fontSize: 8, color: "var(--text-2)", marginTop: 2, flexWrap: "wrap", alignItems: "center" } },
                    React.createElement("span", null,
                        React.createElement("span", { style: { display: "inline-block", width: 10, height: 2, background: backtest.totalReturn > 0 ? "var(--green)" : "var(--red)", verticalAlign: "middle", marginRight: 3 } }),
                        "Estrategia"),
                    bPts && React.createElement("span", null,
                        React.createElement("span", { style: { display: "inline-block", width: 10, height: 2, background: "var(--text-3)", verticalAlign: "middle", marginRight: 3 } }),
                        backtest.benchSymbol),
                    savedStrategies.map((s, i) => React.createElement("span", { key: i },
                        React.createElement("span", { style: { display: "inline-block", width: 10, height: 2, background: sCol[i % sCol.length], verticalAlign: "middle", marginRight: 3, opacity: .7 } }),
                        s.label)),
                    ((_e = backtest.mktFilter) === null || _e === void 0 ? void 0 : _e.enabled) && (React.createElement("span", { style: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, background: "rgba(255,160,0,.12)", border: "1px solid rgba(255,160,0,.3)", color: "var(--amber)", fontSize: 8 } },
                        React.createElement("span", { style: { display: "inline-block", width: 8, height: 8, background: "rgba(255,160,0,.4)", verticalAlign: "middle", borderRadius: 1 } }),
                        backtest.mktFilter.label || ('Filtro ' + backtest.mktFilter.ticker),
                        ": ",
                        backtest.mktFilter.blockedWeeks,
                        "w bloqueadas de ",
                        backtest.mktFilter.totalWeeks))),
                (backtest.benchReturn != null || ((_f = backtest.mktFilter) === null || _f === void 0 ? void 0 : _f.enabled)) && (React.createElement("div", { style: { display: "none", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 6, fontSize: 9, color: "var(--text-2)" } },
                    backtest.benchReturn != null && (React.createElement("span", null,
                        backtest.benchSymbol,
                        ": ",
                        React.createElement("b", { style: { color: backtest.benchReturn > 0 ? "var(--green)" : "var(--red)" } },
                            (backtest.benchReturn * 100).toFixed(1),
                            "%"),
                        React.createElement("span", { style: { color: "var(--text-2)", marginLeft: 6 } },
                            "Alpha: ",
                            React.createElement("b", { style: { color: (backtest.totalReturn - backtest.benchReturn) > 0 ? "var(--green)" : "var(--red)" } },
                                ((backtest.totalReturn - backtest.benchReturn) * 100).toFixed(1),
                                "%")))),
                    ((_g = backtest.mktFilter) === null || _g === void 0 ? void 0 : _g.enabled) && (React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, background: "rgba(255,160,0,.1)", border: "1px solid rgba(255,160,0,.25)", color: "var(--amber)", fontSize: 8 } },
                        backtest.mktFilter.label || ('Filtro ' + backtest.mktFilter.ticker),
                        ": ",
                        backtest.mktFilter.blockedWeeks,
                        "w/",
                        backtest.mktFilter.totalWeeks,
                        "w bloqueadas")))),
                React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 } },
                    React.createElement("button", { onClick: () => {
                            const label = 'Estrategia ' + (ctx.savedStrategies.length + 1);
                            ctx.setSavedStrategies(prev => [...prev, { ...backtest, label }].slice(-5));
                        }, style: { ...S.btnG(true), borderColor: "rgba(168,85,247,.4)", color: "var(--purple)", fontSize: 9 } },
                        "Guardar estrategia #",
                        ctx.savedStrategies.length + 1),
                    ctx.savedStrategies.length > 0 && ctx.savedStrategies.map((s, i) => (React.createElement("span", { key: i, style: { fontSize: 9, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 4 } },
                        React.createElement("span", { style: { display: "inline-block", width: 10, height: 2, background: ["var(--chart-pill-3)", "var(--amber)", "var(--chart-pill-6)", "var(--chart-pill-5)", "var(--chart-pill-7)"][i % 5], verticalAlign: "middle" } }),
                        s.label,
                        ": ",
                        React.createElement("b", { style: { color: s.totalReturn > 0 ? "var(--green)" : "var(--red)" } },
                            s.totalReturn > 0 ? "+" : "",
                            (s.totalReturn * 100).toFixed(1),
                            "%"),
                        React.createElement("button", { onClick: () => ctx.setSavedStrategies(prev => prev.filter((_, j) => j !== i)), style: { background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 10, padding: "0 2px" } }, "x"))))),
                React.createElement("div", { style: { marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--row-divider)" } },
                    React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 8, color: "var(--text-2)", marginBottom: 4 } },
                        React.createElement("span", { style: { display: "none", fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: .8 } }, "Drawdown"),
                        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" } },
                            React.createElement("span", { style: { color: "var(--red)", fontWeight: 600 } },
                                "Max: ",
                                (backtest.maxDrawdown * 100).toFixed(1),
                                "%"),
                            React.createElement("span", null,
                                mn.toFixed(1),
                                "%"))),
                    React.createElement("div", { style: { position: "relative" } },
                        React.createElement("div", { className: "bt-interactive-plot", role: "group", "aria-label": "Drawdown interactivo", tabIndex: 0, ...interaction('drawdown') },
                            drawdownGraphic,
                            cursor('drawdown')),
                        React.createElement("div", { style: { position: "absolute", right: 8, bottom: 6, fontSize: 8, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: .8, pointerEvents: "none" } }, "Drawdown"))))));
    }
    // ── Shared metric row for analysis tables ─────────────────────────────────
    function MetricRow({ label, value, sub, color }) {
        return (React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--row-divider)' } },
            React.createElement("span", { style: { fontSize: 11, color: 'var(--text-2)' } }, label),
            React.createElement("div", { style: { textAlign: 'right', minWidth: 55 } },
                React.createElement("span", { style: { fontSize: 12, fontWeight: 600, color: color || 'var(--text-0)' } }, value),
                sub && React.createElement("div", { style: { fontSize: 10, color: 'var(--text-3)' } }, sub))));
    }
    // ── Full strategy analysis - proper React component (uses useState) ────────
    function StrategyAnalysis({ backtest, S }) {
        var _a, _b, _c, _d, _e;
        const [open, setOpen] = React.useState(true);
        const trades = backtest.allTrades || [];
        const wins = trades.filter(t => t.pnl > 0);
        const losses = trades.filter(t => t.pnl < 0);
        const be = trades.filter(t => t.pnl === 0);
        const total = trades.length;
        const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
        const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
        const netPnl = backtest.endVal - backtest.startVal;
        const expectedPayoff = total ? netPnl / total : 0;
        const avgWinPnl = wins.length ? wins.reduce((a, t) => a + t.pnl, 0) / wins.length : 0;
        const avgLossPnl = losses.length ? losses.reduce((a, t) => a + t.pnl, 0) / losses.length : 0;
        const avgWinPct = wins.length ? wins.reduce((a, t) => a + t.returnPct, 0) / wins.length : 0;
        const avgLossPct = losses.length ? losses.reduce((a, t) => a + t.returnPct, 0) / losses.length : 0;
        const ratioWinLoss = avgLossPnl !== 0 ? Math.abs(avgWinPnl / avgLossPnl) : (wins.length > 0 ? Infinity : 0);
        const largestWin = wins.length ? Math.max(...wins.map(t => t.pnl)) : 0;
        const largestWinPct = wins.length ? Math.max(...wins.map(t => t.returnPct)) : 0;
        const largestLoss = losses.length ? Math.min(...losses.map(t => t.pnl)) : 0;
        const largestLossPct = losses.length ? Math.min(...losses.map(t => t.returnPct)) : 0;
        const largestWinOfGross = grossProfit > 0 ? (largestWin / grossProfit) * 100 : 0;
        const largestLossOfGross = grossLoss > 0 ? (Math.abs(largestLoss) / grossLoss) * 100 : 0;
        const avgDurAll = total ? trades.reduce((a, t) => a + Math.abs(t.duration), 0) / total : 0;
        const avgDurWin = wins.length ? wins.reduce((a, t) => a + Math.abs(t.duration), 0) / wins.length : 0;
        const avgDurLoss = losses.length ? losses.reduce((a, t) => a + Math.abs(t.duration), 0) / losses.length : 0;
        // Max run-up from equity curve
        let maxRunUp = 0, runUpTrough = ((_b = (_a = backtest.equityCurve) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.value) || backtest.startVal;
        for (const p of (backtest.equityCurve || [])) {
            if (p.value < runUpTrough)
                runUpTrough = p.value;
            if (runUpTrough > 0)
                maxRunUp = Math.max(maxRunUp, (p.value - runUpTrough) / runUpTrough);
        }
        const fmtPct = (v, dec = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(dec)}%`;
        const colorPN = v => v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--text-2)';
        // ── Donut chart ──
        const r = 42, cx = 60, cy = 60, sw = 15;
        const circ = 2 * Math.PI * r;
        const donutGroups = [
            { count: wins.length, color: 'var(--green)', label: 'Ganadoras' },
            { count: losses.length, color: 'var(--red)', label: 'Perdedoras' },
            { count: be.length, color: 'var(--amber)', label: 'Break even' },
        ];
        const activeDonut = donutGroups.filter(g => g.count > 0);
        const gapDeg = activeDonut.length > 1 ? 4 : 0;
        const totalGapDeg = gapDeg * activeDonut.length;
        let cumDeg = -90; // start from 12 o'clock
        return (React.createElement("div", { className: "bt-analysis", style: { ...S.cd, marginBottom: 8 } },
            React.createElement("button", { onClick: () => setOpen(v => !v), style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' } },
                React.createElement("span", { style: { fontSize: 9, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1 } }, "An\u00E1lisis Detallado de Estrategia"),
                React.createElement("span", { style: { fontSize: 10, color: 'var(--text-3)' } }, open ? 'Ocultar' : 'Mostrar')),
            open && (React.createElement("div", { style: { padding: '0 12px 12px' } },
                React.createElement("div", { className: "bt-analysis-top", style: { gap: 14, marginBottom: 14 } },
                    React.createElement("div", { style: { ...S.cd, padding: 12 } },
                        React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 16 } }, "Distribuci\u00F3n de operaciones"),
                        total > 0 ? (React.createElement("div", { className: "bt-distribution-layout" },
                            React.createElement("svg", { className: "bt-distribution-donut", role: "img", "aria-label": `Distribución de ${total} operaciones: ${wins.length} ganadoras, ${losses.length} perdedoras y ${be.length} en equilibrio`, viewBox: "0 0 120 120" },
                                React.createElement("circle", { cx: cx, cy: cy, r: r, fill: "none", stroke: "var(--panel-soft-border)", strokeWidth: sw }),
                                activeDonut.map((seg, i) => {
                                    const segDeg = (seg.count / total) * (360 - totalGapDeg);
                                    const startDeg = cumDeg;
                                    cumDeg += segDeg + gapDeg;
                                    const len = (segDeg / 360) * circ;
                                    return (React.createElement("circle", { key: i, cx: cx, cy: cy, r: r, fill: "none", stroke: seg.color, strokeWidth: sw, strokeDasharray: `${len} ${circ - len}`, strokeDashoffset: 0, transform: `rotate(${startDeg} ${cx} ${cy})` },
                                        React.createElement("title", null,
                                            seg.label,
                                            ": ",
                                            seg.count,
                                            " (",
                                            (seg.count / total * 100).toFixed(1),
                                            "%)")));
                                }),
                                React.createElement("text", { x: cx, y: cy - 4, textAnchor: "middle", fill: "var(--text-0)", fontSize: "17", fontWeight: "700", fontFamily: "var(--font-body)" }, total),
                                React.createElement("text", { x: cx, y: cy + 11, textAnchor: "middle", fill: "var(--text-3)", fontSize: "7.5", fontFamily: "var(--font-body)" }, "operaciones")),
                            React.createElement("div", { style: { flex: 1, minWidth: 0 } }, donutGroups.map((g, i) => (React.createElement("div", { key: i, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, gap: 6 } },
                                React.createElement("div", { style: { display: 'flex', alignItems: 'center', gap: 5 } },
                                    React.createElement("span", { style: { display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: g.color, flexShrink: 0 } }),
                                    React.createElement("span", { style: { fontSize: 12, color: 'var(--text-1)' } }, g.label)),
                                React.createElement("div", { style: { textAlign: 'right', fontSize: 12 } },
                                    React.createElement("span", { style: { color: g.count > 0 ? g.color : 'var(--text-3)', fontWeight: 600 } },
                                        g.count,
                                        " operaciones"),
                                    React.createElement("div", { style: { color: 'var(--text-3)' } }, total > 0 ? ((g.count / total) * 100).toFixed(2) + '%' : '0.00%')))))))) : React.createElement("div", { style: { textAlign: 'center', color: 'var(--text-3)', fontSize: 9, padding: 20 } }, "Sin operaciones")),
                    React.createElement("div", { style: { ...S.cd, padding: 12 } },
                        React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 } }, "Retornos"),
                        React.createElement(MetricRow, { label: "Capital inicial", value: `$${backtest.capital.toLocaleString()}` }),
                        React.createElement(MetricRow, { label: "P&L Neto", value: `${netPnl >= 0 ? '+' : ''}$${Math.abs(netPnl).toFixed(0)}`, sub: fmtPct(backtest.totalReturn * 100), color: colorPN(netPnl) }),
                        React.createElement(MetricRow, { label: "Ganancia bruta", value: `$${grossProfit.toFixed(0)}`, color: "var(--green)" }),
                        React.createElement(MetricRow, { label: "Perdida bruta", value: `-$${grossLoss.toFixed(0)}`, color: grossLoss > 0 ? 'var(--red)' : 'var(--text-2)' }),
                        React.createElement(MetricRow, { label: "Factor de ganancia", value: backtest.profitFactor === Infinity ? 'Inf' : backtest.profitFactor.toFixed(2), color: backtest.profitFactor > 1.5 ? 'var(--green)' : backtest.profitFactor > 1 ? 'var(--amber)' : 'var(--red)' }),
                        React.createElement(MetricRow, { label: "Comisiones", value: `$${(backtest.totalCommissionPaid || 0).toFixed(0)}`, color: "var(--text-3)" }),
                        React.createElement(MetricRow, { label: "Payoff esperado", value: `${expectedPayoff >= 0 ? '+' : ''}$${Math.abs(expectedPayoff).toFixed(0)}`, sub: "por trade", color: colorPN(expectedPayoff) })),
                    React.createElement("div", { style: { ...S.cd, padding: 12 } },
                        React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 } }, "Rendimiento"),
                        React.createElement(MetricRow, { label: "Retorno anualizado", value: fmtPct(backtest.annReturn * 100), color: colorPN(backtest.annReturn) }),
                        React.createElement(MetricRow, { label: "Volatilidad anual", value: `${(backtest.annVol * 100).toFixed(1)}%`, color: "var(--amber)" }),
                        React.createElement(MetricRow, { label: "Sharpe", value: backtest.sharpe.toFixed(2), color: backtest.sharpe > 1 ? 'var(--green)' : backtest.sharpe > 0.5 ? 'var(--amber)' : 'var(--red)' }),
                        React.createElement(MetricRow, { label: "Sortino", value: ((_c = backtest.sortino) === null || _c === void 0 ? void 0 : _c.toFixed(2)) || '-', color: backtest.sortino > 1 ? 'var(--green)' : backtest.sortino > 0.5 ? 'var(--amber)' : 'var(--red)' }),
                        React.createElement(MetricRow, { label: "Calmar", value: ((_d = backtest.calmar) === null || _d === void 0 ? void 0 : _d.toFixed(2)) || '-', color: backtest.calmar > 1 ? 'var(--green)' : backtest.calmar > 0.5 ? 'var(--amber)' : 'var(--red)' }),
                        React.createElement(MetricRow, { label: "Max Drawdown", value: `-${(backtest.maxDrawdown * 100).toFixed(1)}%`, color: "var(--red)" }),
                        React.createElement(MetricRow, { label: "Max Run-up", value: fmtPct(maxRunUp * 100), color: "var(--green)" }))),
                React.createElement("div", { style: { ...S.cd, padding: 12, marginBottom: 10 } },
                    React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 } }, "Detalles de Operaciones"),
                    React.createElement("div", { className: "ro-stack-mobile", style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 } },
                        React.createElement("div", null,
                            React.createElement(MetricRow, { label: "Total trades", value: total }),
                            React.createElement(MetricRow, { label: "Ganadoras", value: wins.length, sub: total ? ((wins.length / total) * 100).toFixed(1) + '%' : '0%', color: "var(--green)" }),
                            React.createElement(MetricRow, { label: "Perdedoras", value: losses.length, sub: total ? ((losses.length / total) * 100).toFixed(1) + '%' : '0%', color: "var(--red)" }),
                            React.createElement(MetricRow, { label: "Break even", value: be.length, sub: total ? ((be.length / total) * 100).toFixed(1) + '%' : '0%', color: "var(--amber)" }),
                            React.createElement(MetricRow, { label: "Ratio win/loss", value: ratioWinLoss === Infinity ? 'Inf' : ratioWinLoss.toFixed(2), color: ratioWinLoss >= 2 ? 'var(--green)' : ratioWinLoss >= 1 ? 'var(--amber)' : 'var(--red)' })),
                        React.createElement("div", null,
                            React.createElement(MetricRow, { label: "Avg P&L", value: `${expectedPayoff >= 0 ? '+' : ''}$${Math.abs(expectedPayoff).toFixed(0)}`, color: colorPN(expectedPayoff) }),
                            React.createElement(MetricRow, { label: "Avg ganadora", value: `+$${Math.abs(avgWinPnl).toFixed(0)}`, sub: `+${avgWinPct.toFixed(1)}%`, color: "var(--green)" }),
                            React.createElement(MetricRow, { label: "Avg perdedora", value: `-$${Math.abs(avgLossPnl).toFixed(0)}`, sub: `${avgLossPct.toFixed(1)}%`, color: "var(--red)" }),
                            React.createElement(MetricRow, { label: "Dur. promedio", value: `${avgDurAll.toFixed(0)}w` }),
                            React.createElement(MetricRow, { label: "Dur. ganadoras", value: `${avgDurWin.toFixed(0)}w`, color: "var(--green)" })),
                        React.createElement("div", null,
                            React.createElement(MetricRow, { label: "Mayor ganancia", value: `+$${largestWin.toFixed(0)}`, sub: `+${largestWinPct.toFixed(1)}% - ${largestWinOfGross.toFixed(1)}% del bruto`, color: "var(--green)" }),
                            React.createElement(MetricRow, { label: "Mayor perdida", value: `-$${Math.abs(largestLoss).toFixed(0)}`, sub: `${largestLossPct.toFixed(1)}% - ${largestLossOfGross.toFixed(1)}% del bruto`, color: "var(--red)" }),
                            React.createElement(MetricRow, { label: "Dur. perdedoras", value: `${avgDurLoss.toFixed(0)}w`, color: "var(--red)" }),
                            ((_e = backtest.mktFilter) === null || _e === void 0 ? void 0 : _e.enabled) && React.createElement(MetricRow, { label: "Semanas bloqueadas", value: `${backtest.mktFilter.blockedWeeks}w`, sub: `${((backtest.mktFilter.blockedWeeks / backtest.mktFilter.totalWeeks) * 100).toFixed(0)}% del periodo`, color: "var(--amber)" })))),
                React.createElement("div", { className: "ro-stack-mobile", style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
                    React.createElement(MonthlyPnlChart, { backtest: backtest, S: S }),
                    React.createElement(ScatterChart, { backtest: backtest, S: S }))))));
    }
    // ── Informe de rendimiento (tearsheet): mapa mensual, drawdowns, Sharpe móvil y benchmark ──
    const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    function heatCellStyle(ret, maxAbs) {
        if (ret == null)
            return { color: 'var(--text-3)' };
        const strength = Math.min(1, Math.abs(ret) / (maxAbs || 1));
        const pct = Math.round(12 + strength * 58);
        const base = ret >= 0 ? 'var(--green)' : 'var(--red)';
        return { background: `color-mix(in srgb, ${base} ${pct}%, transparent)`, color: 'var(--text-0)' };
    }
    function PerformanceReport({ backtest, S, riskFreePct }) {
        var _a;
        const computeTearsheet = (_a = window.StockScannerCore) === null || _a === void 0 ? void 0 : _a.computeTearsheet;
        const ts = React.useMemo(() => computeTearsheet ? computeTearsheet({
            equityCurve: backtest.equityCurve, startVal: backtest.startVal, benchCurve: backtest.benchCurve, riskFreePct,
        }) : null, [backtest, riskFreePct, computeTearsheet]);
        if (!ts || !ts.monthly.length)
            return null;
        const pct = (v, d = 1) => v == null || !Number.isFinite(v) ? '-' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(d)}%`;
        const fmtDate = t => t ? new Date(t * 1000).toISOString().slice(0, 10) : '-';
        const maxAbs = Math.max(...ts.monthly.map(m => Math.abs(m.ret)), 0.01);
        const th = { fontSize: 10, color: 'var(--text-3)', fontWeight: 600, padding: '5px 4px', textAlign: 'right' };
        const td = { fontSize: 11, padding: '5px 4px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
        const bench = ts.benchmark;
        const rs = ts.rollingSharpe;
        const rsMin = Math.min(0, ...rs.map(p => p.value)), rsMax = Math.max(0, ...rs.map(p => p.value));
        const rsRange = (rsMax - rsMin) || 1;
        const W = 100, H = 30;
        const rsY = v => H - ((v - rsMin) / rsRange) * H;
        const rsPts = rs.map((p, i) => ((rs.length > 1 ? i / (rs.length - 1) : 0) * W).toFixed(2) + ',' + rsY(p.value).toFixed(2)).join(' ');
        return (React.createElement("div", { className: "bt-tearsheet", style: { ...S.cd, marginBottom: 8, padding: 12 } },
            React.createElement("div", { style: { fontSize: 9, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 } }, "Informe de rendimiento"),
            React.createElement("div", { style: { overflowX: 'auto', marginBottom: 14 } },
                React.createElement("table", { "aria-label": "Retornos mensuales", style: { width: '100%', borderCollapse: 'separate', borderSpacing: 2, minWidth: 560 } },
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", { style: { ...th, textAlign: 'left' } }, "A\u00F1o"),
                            MONTHS_SHORT.map(m => React.createElement("th", { key: m, style: th }, m)),
                            React.createElement("th", { style: th }, "A\u00F1o"))),
                    React.createElement("tbody", null, ts.yearly.map(y => {
                        const byMonth = Object.fromEntries(y.months.map(m => [m.month, m.ret]));
                        return (React.createElement("tr", { key: y.year },
                            React.createElement("td", { style: { ...td, textAlign: 'left', color: 'var(--text-2)' } }, y.year),
                            MONTHS_SHORT.map((_, mi) => React.createElement("td", { key: mi, style: { ...td, borderRadius: 3, ...heatCellStyle(byMonth[mi], maxAbs) } }, byMonth[mi] == null ? '' : pct(byMonth[mi]))),
                            React.createElement("td", { style: { ...td, fontWeight: 700, color: y.ret >= 0 ? 'var(--green)' : 'var(--red)' } }, pct(y.ret))));
                    })))),
            React.createElement("div", { className: "ro-stack-mobile", style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 14 } },
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 } }, "Periodos"),
                    React.createElement(MetricRow, { label: "Mejor semana", value: pct(ts.weekly.best), color: "var(--green)" }),
                    React.createElement(MetricRow, { label: "Peor semana", value: pct(ts.weekly.worst), color: "var(--red)" }),
                    React.createElement(MetricRow, { label: "Semanas positivas", value: (ts.weekly.positivePct * 100).toFixed(0) + '%', sub: ts.weekly.count + ' semanas' }),
                    React.createElement(MetricRow, { label: "Mejor mes", value: pct(ts.months.best), color: "var(--green)" }),
                    React.createElement(MetricRow, { label: "Peor mes", value: pct(ts.months.worst), color: "var(--red)" }),
                    React.createElement(MetricRow, { label: "Meses positivos", value: (ts.months.positivePct * 100).toFixed(0) + '%' })),
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 } }, `Frente a ${backtest.benchSymbol || 'benchmark'}`),
                    bench ? (React.createElement(React.Fragment, null,
                        React.createElement(MetricRow, { label: "Beta", value: bench.beta.toFixed(2) }),
                        React.createElement(MetricRow, { label: "Alfa anual", value: pct(bench.alpha), color: bench.alpha >= 0 ? 'var(--green)' : 'var(--red)', sub: "Jensen, semanal" }),
                        React.createElement(MetricRow, { label: "Correlaci\u00F3n", value: bench.correlation.toFixed(2) }),
                        React.createElement(MetricRow, { label: "Tracking error", value: (bench.trackingError * 100).toFixed(1) + '%' }),
                        React.createElement(MetricRow, { label: "Information ratio", value: bench.informationRatio.toFixed(2), sub: bench.weeks + ' semanas emparejadas' }))) : React.createElement("div", { style: { fontSize: 11, color: 'var(--text-3)', padding: '8px 0' } }, "Sin datos suficientes del benchmark.")),
                React.createElement("div", null,
                    React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 } },
                        "Sharpe m\u00F3vil (",
                        ts.rollingWindow,
                        " semanas)"),
                    rs.length > 1 ? (React.createElement(React.Fragment, null,
                        React.createElement("svg", { role: "img", "aria-label": `Sharpe móvil de ${ts.rollingWindow} semanas`, viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", style: { width: '100%', height: 110 } },
                            React.createElement("line", { x1: "0", x2: W, y1: rsY(0), y2: rsY(0), stroke: "var(--panel-soft-border)", strokeWidth: ".4", vectorEffect: "non-scaling-stroke" }),
                            React.createElement("polyline", { points: rsPts, fill: "none", stroke: "var(--accent)", strokeWidth: "1.5", vectorEffect: "non-scaling-stroke" })),
                        React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)' } },
                            React.createElement("span", null, fmtDate(rs[0].time)),
                            React.createElement("span", null,
                                "Actual ",
                                rs[rs.length - 1].value.toFixed(2)),
                            React.createElement("span", null, fmtDate(rs[rs.length - 1].time))))) : React.createElement("div", { style: { fontSize: 11, color: 'var(--text-3)', padding: '8px 0' } },
                        "Hacen falta al menos ",
                        ts.rollingWindow,
                        " semanas."))),
            React.createElement("div", { style: { fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 } }, "Peores drawdowns"),
            ts.drawdowns.length ? (React.createElement("div", { style: { overflowX: 'auto' } },
                React.createElement("table", { "aria-label": "Peores drawdowns", style: { width: '100%', borderCollapse: 'collapse', minWidth: 480 } },
                    React.createElement("thead", null,
                        React.createElement("tr", null, ['Inicio', 'Mínimo', 'Recuperación', 'Caída', 'Semanas'].map(h => React.createElement("th", { key: h, style: { ...th, textAlign: h === 'Caída' || h === 'Semanas' ? 'right' : 'left', borderBottom: '1px solid var(--row-divider)' } }, h)))),
                    React.createElement("tbody", null, ts.drawdowns.map((d, i) => (React.createElement("tr", { key: i, style: { borderBottom: '1px solid var(--row-divider)' } },
                        React.createElement("td", { style: { ...td, textAlign: 'left' } }, fmtDate(d.start)),
                        React.createElement("td", { style: { ...td, textAlign: 'left' } }, fmtDate(d.trough)),
                        React.createElement("td", { style: { ...td, textAlign: 'left', color: d.recovered ? 'var(--text-1)' : 'var(--amber)' } }, d.recovered ? fmtDate(d.end) : 'Sin recuperar'),
                        React.createElement("td", { style: { ...td, color: 'var(--red)', fontWeight: 600 } },
                            "-",
                            (d.depth * 100).toFixed(1),
                            "%"),
                        React.createElement("td", { style: td }, d.weeks)))))))) : React.createElement("div", { style: { fontSize: 11, color: 'var(--text-3)' } }, "Sin drawdowns en el periodo.")));
    }
    function renderTradesTable(backtest, setSelectedChart, S) {
        var _a;
        return ((_a = backtest.allTrades) === null || _a === void 0 ? void 0 : _a.length) ? React.createElement(BacktestTradesTable, { backtest: backtest, setSelectedChart: setSelectedChart, S: S }) : null;
    }
    const TRADE_COLUMNS = [
        ['ticker', 'Ticker', 'text'], ['dir', 'Dirección', 'text'], ['entryTime', 'Entrada', 'number'], ['exitTime', 'Salida', 'number'],
        ['entryPrice', 'P. entrada', 'number'], ['exitPrice', 'P. salida', 'number'], ['returnPct', 'Retorno %', 'number'],
        ['pnl', 'P&L $', 'number'], ['duration', 'Duración', 'number'], ['entryReason', 'Razón de entrada', 'text'], ['reason', 'Razón de salida', 'text'],
    ];
    function BacktestTradesTable({ backtest, setSelectedChart, S }) {
        const [sort, setSort] = React.useState(null);
        const rows = React.useMemo(() => {
            const indexed = backtest.allTrades.map((trade, index) => ({ trade, index }));
            if (!sort)
                return indexed;
            const [key, , type] = TRADE_COLUMNS[sort.column];
            const value = trade => {
                const raw = key === 'dir' ? (trade.dir || 'long') : trade[key];
                if (raw == null || raw === '')
                    return null;
                if (type === 'number')
                    return Number.isFinite(Number(raw)) ? Number(raw) : null;
                return String(raw);
            };
            return indexed.sort((a, b) => {
                const av = value(a.trade), bv = value(b.trade);
                if (av == null)
                    return bv == null ? a.index - b.index : 1;
                if (bv == null)
                    return -1;
                const cmp = type === 'number' ? av - bv : av.localeCompare(bv, 'es', { numeric: true, sensitivity: 'base' });
                return cmp * sort.direction || a.index - b.index;
            });
        }, [backtest.allTrades, sort]);
        const isNum = v => v != null && v !== '' && Number.isFinite(Number(v));
        const money = v => isNum(v) ? "$" + Number(v).toFixed(2) : "-";
        const pct = v => isNum(v) ? (Number(v) > 0 ? "+" : "") + Number(v).toFixed(1) + "%" : "-";
        const pnlMoney = v => isNum(v) ? "$" + Number(v).toFixed(0) : "-";
        const validTrades = backtest.allTrades.filter(t => isNum(t.pnl) && isNum(t.returnPct) && isNum(t.entryPrice) && isNum(t.exitPrice));
        const wins = validTrades.filter(t => t.pnl > 0).length;
        const losses = validTrades.filter(t => t.pnl <= 0).length;
        const th = (i) => ({ ...S.th, textAlign: i >= 4 && i <= 8 ? "right" : "left", padding: "7px 9px" });
        const td = (extra = {}) => ({ ...S.td, padding: "7px 9px", ...extra });
        return (React.createElement("div", { className: "bt-trades-table", style: { ...S.tableWrap, marginBottom: 8 } },
            React.createElement("div", { style: { ...S.sectionHeader, alignItems: "center", marginBottom: 0, padding: "8px 10px", borderBottom: "1px solid var(--panel-soft-border)", background: "var(--bg-1)" } },
                React.createElement("div", { style: S.sectionTitle },
                    "Trades (",
                    backtest.allTrades.length,
                    ")"),
                React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } },
                    React.createElement("span", { style: S.statusBadge("success") },
                        "Win ",
                        wins),
                    React.createElement("span", { style: S.statusBadge("danger") },
                        "Loss ",
                        losses))),
            React.createElement("table", { className: "ui-table", style: S.table },
                React.createElement("thead", null,
                    React.createElement("tr", null, TRADE_COLUMNS.map(([key, label], i) => (React.createElement("th", { key: key, scope: "col", style: th(i), "aria-sort": (sort === null || sort === void 0 ? void 0 : sort.column) === i ? (sort.direction === 1 ? 'ascending' : 'descending') : 'none' },
                        React.createElement("button", { type: "button", className: "bt-sort-heading", onClick: () => setSort(prev => ({ column: i, direction: (prev === null || prev === void 0 ? void 0 : prev.column) === i ? -prev.direction : 1 })) },
                            label,
                            React.createElement("span", { "aria-hidden": "true" }, (sort === null || sort === void 0 ? void 0 : sort.column) === i ? (sort.direction === 1 ? '↑' : '↓') : '↕'))))))),
                React.createElement("tbody", null, rows.map(({ trade: t, index }) => (React.createElement("tr", { key: index, title: "Abrir grafico de este trade", style: { cursor: "pointer" }, onClick: () => setSelectedChart({ ticker: t.ticker, side: (t.dir || "long"), source: "Backtest" }) },
                    React.createElement("td", { style: td({ fontWeight: 800, color: "var(--accent)" }) }, t.ticker),
                    React.createElement("td", { style: td({ fontSize: 8, fontWeight: 800, color: t.dir === "short" ? "var(--purple)" : "var(--green)" }) }, t.dir === "short" ? "SHORT" : "LONG"),
                    React.createElement("td", { style: td({ fontSize: 8, color: "var(--text-2)" }) }, t.entryTime ? new Date(t.entryTime * 1000).toLocaleDateString("es", { month: "short", day: "numeric", year: "2-digit" }) : ""),
                    React.createElement("td", { style: td({ fontSize: 8, color: "var(--text-2)" }) }, t.exitTime ? new Date(t.exitTime * 1000).toLocaleDateString("es", { month: "short", day: "numeric", year: "2-digit" }) : ""),
                    React.createElement("td", { className: "ui-num", style: td({ textAlign: "right" }) }, money(t.entryPrice)),
                    React.createElement("td", { className: "ui-num", style: td({ textAlign: "right" }) }, money(t.exitPrice)),
                    React.createElement("td", { className: "ui-num", style: td({ textAlign: "right", fontWeight: 800, color: t.returnPct > 0 ? "var(--green)" : "var(--red)" }) }, pct(t.returnPct)),
                    React.createElement("td", { className: "ui-num", style: td({ textAlign: "right", fontWeight: 700, color: t.pnl > 0 ? "var(--green)" : "var(--red)" }) }, pnlMoney(t.pnl)),
                    React.createElement("td", { className: "ui-num", style: td({ textAlign: "right", color: "var(--text-2)" }) },
                        t.duration,
                        "w"),
                    React.createElement("td", { className: "ui-truncate", style: td({ fontSize: 8, color: "var(--green)", maxWidth: 180 }), title: t.entryReason || "" }, t.entryReason || "-"),
                    React.createElement("td", { className: "ui-truncate", style: td({ fontSize: 8, color: (t.reason || "").startsWith("Stop") ? "var(--amber)" : "var(--red)", maxWidth: 180 }), title: t.reason }, t.reason))))))));
    }
    // ── Weekly Log ─────────────────────────────────────────────────────────────
    function renderWeeklyLog(backtest, btCapital, S) {
        var _a;
        const hasMktFilter = (_a = backtest.mktFilter) === null || _a === void 0 ? void 0 : _a.enabled;
        const headers = ["Sem", "Fecha", "Senal", "Cartera", "Compra", "Venta", "Razon", "Valor $"];
        if (hasMktFilter)
            headers.push("Filtro");
        const th = (i) => ({ ...S.th, textAlign: i >= 2 ? "right" : "left", padding: "7px 9px" });
        const td = (extra = {}) => ({ ...S.td, padding: "7px 9px", ...extra });
        return (React.createElement("details", { style: { marginBottom: 8 } },
            React.createElement("summary", { style: { ...S.panel, padding: "8px 12px", cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 } },
                React.createElement("span", { style: S.sectionTitle },
                    "Log Semanal (",
                    backtest.weeklyLog.length,
                    " semanas con actividad)"),
                hasMktFilter && React.createElement("span", { style: S.statusBadge("warning") }, "bloqueado = filtro")),
            React.createElement("div", { className: "bt-weekly-table", style: { ...S.tableWrap, borderTop: "none", borderTopLeftRadius: 0, borderTopRightRadius: 0 } },
                React.createElement("table", { className: "ui-table", style: S.table },
                    React.createElement("thead", null,
                        React.createElement("tr", null, headers.map((h, i) => (React.createElement("th", { key: i, style: th(i) }, h))))),
                    React.createElement("tbody", null, backtest.weeklyLog.map((w, i) => {
                        var _a;
                        return (React.createElement("tr", { key: i, style: { background: w.mktBlocked ? "var(--panel-warning-bg)" : "transparent" } },
                            React.createElement("td", { style: td({ color: "var(--text-2)" }) }, w.week),
                            React.createElement("td", { style: td({ fontSize: 8, color: "var(--text-2)" }) }, w.time ? new Date(w.time * 1000).toLocaleDateString("es", { month: "short", day: "numeric", year: "2-digit" }) : ""),
                            React.createElement("td", { className: "ui-num", style: td({ textAlign: "right", color: "var(--accent)", fontWeight: 700 }) }, w.passing),
                            React.createElement("td", { className: "ui-num", style: td({ textAlign: "right" }) }, w.held),
                            React.createElement("td", { className: "ui-num", style: td({ textAlign: "right", color: w.bought > 0 ? "var(--green)" : "var(--text-2)", fontWeight: w.bought > 0 ? 800 : 400 }) }, w.bought > 0 ? "+" + w.bought : "-"),
                            React.createElement("td", { className: "ui-num", style: td({ textAlign: "right", color: w.sold > 0 ? "var(--red)" : "var(--text-2)", fontWeight: w.sold > 0 ? 800 : 400 }) }, w.sold > 0 ? "-" + w.sold : "-"),
                            React.createElement("td", { className: "ui-truncate", style: td({ fontSize: 8, textAlign: "right", color: "var(--text-2)", maxWidth: 360 }), title: (w.reasons || []).join(", ") }, ((_a = w.reasons) === null || _a === void 0 ? void 0 : _a.join(",")) || "-"),
                            React.createElement("td", { className: "ui-num", style: td({ textAlign: "right", fontWeight: 800, color: w.value >= btCapital ? "var(--green)" : "var(--red)" }) },
                                "$",
                                w.value.toFixed(0)),
                            hasMktFilter && React.createElement("td", { style: td({ textAlign: "center" }) }, w.mktBlocked ? React.createElement("span", { style: S.statusBadge("warning"), title: "Filtro bloqueo nuevas entradas esta semana" }, "bloqueado") : React.createElement("span", { style: S.statusBadge("neutral") }, "ok"))));
                    }))))));
    }
    function renderBacktestDiagnostics(backtest, ctx) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (!backtest || (backtest.allTrades || []).length > 0 || ["cancelled", "error", "config_error"].includes(backtest.status))
            return null;
        const { S, runBacktest, btRunning } = ctx;
        const ls = ((_a = backtest.diagnostics) === null || _a === void 0 ? void 0 : _a.loadStats) || ((_b = backtest.perf) === null || _b === void 0 ? void 0 : _b.loadStats) || {};
        const ss = ((_c = backtest.diagnostics) === null || _c === void 0 ? void 0 : _c.signalStats) || ((_d = backtest.perf) === null || _d === void 0 ? void 0 : _d.signalStats) || {};
        const totalSignals = (ss.longEntries || 0) + (ss.shortEntries || 0);
        const reason = (ls.loaded || 0) < 3
            ? "Muy pocos tickers tuvieron datos suficientes para simular."
            : totalSignals === 0
                ? "Las reglas no generaron entradas durante el periodo seleccionado."
                : "Hubo señales, pero ninguna se ejecutó como trade cerrado dentro del periodo.";
        const rows = [
            ["Tickers validos", (_h = (_f = (_e = backtest.diagnostics) === null || _e === void 0 ? void 0 : _e.validTickers) !== null && _f !== void 0 ? _f : (_g = backtest.perf) === null || _g === void 0 ? void 0 : _g.tickers) !== null && _h !== void 0 ? _h : "-"],
            ["Datos cargados", `${ls.loaded || 0}/${ls.unique || 0}`],
            ["Sin datos", ls.failed || 0],
            ["Datos insuficientes", ls.insufficient || 0],
            ["Entradas Long", ss.longEntries || 0],
            ["Entradas Short", ss.shortEntries || 0],
            ["Salidas", ss.exitSignals || 0],
            ["Semanas bloqueadas", ss.weeksBlocked || 0],
            ["Cargas 4H", ((_j = backtest.perf) === null || _j === void 0 ? void 0 : _j.intrabarFetches) || 0],
        ];
        return (React.createElement("div", { style: { ...S.panel, padding: 14, marginBottom: 8, borderColor: "rgba(245,158,11,.35)", background: "var(--panel-warning-bg)" } },
            React.createElement("div", { style: { ...S.sectionHeader, marginBottom: 10 } },
                React.createElement("div", null,
                    React.createElement("div", { style: { ...S.sectionTitle, color: "var(--amber)" } }, "Sin operaciones ejecutadas"),
                    React.createElement("div", { style: { ...S.sectionMeta, marginTop: 4 } }, reason)),
                React.createElement("button", { onClick: runBacktest, disabled: btRunning, style: { ...S.btnG(false), fontSize: 9, padding: "6px 12px", opacity: btRunning ? .7 : 1 } }, "Reintentar")),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 6 } }, rows.map(([label, value]) => (React.createElement("div", { key: label, style: S.metricCard },
                React.createElement("div", { style: { fontSize: 7, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: .6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, label),
                React.createElement("div", { style: { fontSize: 12, color: "var(--text-0)", fontWeight: 700, marginTop: 2 } }, value)))))));
    }
    function renderBacktestRunState(backtest, ctx) {
        var _a, _b;
        if (!backtest || !["cancelled", "error", "config_error", "data_error"].includes(backtest.status))
            return null;
        const { S, runBacktest, btRunning } = ctx;
        const statusMap = {
            cancelled: { title: "Backtest cancelado", tone: "var(--amber)", hint: "La simulación se detuvo antes de terminar. Puedes reintentar con la misma configuración." },
            error: { title: "Error en backtest", tone: "var(--red)", hint: "La simulación fallo antes de completar. Revisa el mensaje y vuelve a intentar." },
            config_error: { title: "Configuración incompleta", tone: "var(--amber)", hint: "Falta ajustar una configuración antes de ejecutar el backtest." },
            data_error: { title: "Datos insuficientes", tone: "var(--amber)", hint: "No hubo suficientes tickers validos para simular. Revisa el universo o baja el periodo." },
        };
        const info = statusMap[backtest.status] || statusMap.error;
        const ls = ((_a = backtest.diagnostics) === null || _a === void 0 ? void 0 : _a.loadStats) || ((_b = backtest.perf) === null || _b === void 0 ? void 0 : _b.loadStats) || {};
        return (React.createElement("div", { style: { ...S.panel, padding: 14, marginBottom: 8, borderColor: "var(--panel-warning-border)", background: "rgba(245,158,11,.055)" } },
            React.createElement("div", { style: { ...S.sectionHeader, marginBottom: 0 } },
                React.createElement("div", { style: { minWidth: 220 } },
                    React.createElement("div", { style: { ...S.sectionTitle, color: info.tone } }, info.title),
                    React.createElement("div", { style: { ...S.sectionMeta, marginTop: 4 } }, backtest.message || info.hint),
                    React.createElement("div", { style: { ...S.sectionMeta, marginTop: 6 } },
                        "Tickers: ",
                        ls.loaded || 0,
                        "/",
                        ls.unique || 0,
                        ". Sin datos: ",
                        ls.failed || 0,
                        ". Insuficientes: ",
                        ls.insufficient || 0,
                        ".")),
                React.createElement("button", { onClick: runBacktest, disabled: btRunning, style: { ...S.btnG(false), fontSize: 9, padding: "6px 12px", opacity: btRunning ? .7 : 1 } }, "Reintentar"))));
    }
    // ── Public entry point ─────────────────────────────────────────────────────
    function renderBacktestDataQuality(backtest, ctx) {
        var _a, _b, _c;
        if (!backtest || !(backtest.allTrades || []).length)
            return null;
        const { S } = ctx;
        const ls = ((_a = backtest.diagnostics) === null || _a === void 0 ? void 0 : _a.loadStats) || ((_b = backtest.perf) === null || _b === void 0 ? void 0 : _b.loadStats) || {};
        const failed = Number(ls.failed) || 0;
        const insufficient = Number(ls.insufficient) || 0;
        if (!failed && !insufficient)
            return null;
        const total = Number(ls.unique) || 0;
        const loaded = Number(ls.loaded) || 0;
        return (React.createElement("div", { style: { ...S.panel, padding: 10, marginBottom: 8, borderColor: "var(--panel-warning-border)", background: "var(--panel-warning-bg)" } },
            React.createElement("div", { style: { ...S.sectionHeader, alignItems: "center", marginBottom: 0 } },
                React.createElement("div", null,
                    React.createElement("div", { style: { ...S.sectionTitle, color: "var(--amber)", fontSize: 9 } }, "Datos incompletos"),
                    React.createElement("div", { style: { ...S.sectionMeta, marginTop: 3 } },
                        "El backtest corrio con ",
                        loaded,
                        "/",
                        total,
                        " tickers validos. Sin datos: ",
                        failed,
                        ". Insuficientes: ",
                        insufficient,
                        ". Cargas 4H: ",
                        ((_c = backtest.perf) === null || _c === void 0 ? void 0 : _c.intrabarFetches) || 0,
                        ".")),
                React.createElement("div", { style: S.statusBadge("warning") }, "Revisa s\u00EDmbolos o baja el universo si ves demasiados faltantes."))));
    }
    function renderBacktestPerformance(backtest, ctx) {
        if (!(backtest === null || backtest === void 0 ? void 0 : backtest.perf))
            return null;
        const { S } = ctx;
        const perf = backtest.perf;
        const stages = perf.stages || {
            dataMs: perf.dataMs || 0,
            benchmarkMs: Math.max(0, (perf.benchmarkMs || 0) - (perf.dataMs || 0)),
            regimeMs: Math.max(0, (perf.regimeMs || 0) - (perf.benchmarkMs || perf.dataMs || 0)),
            simulationMs: Math.max(0, (perf.simulationMs || 0) - (perf.regimeMs || perf.benchmarkMs || perf.dataMs || 0)),
            resultsMs: 0,
        };
        const fmt = ms => ms != null ? (Number(ms) / 1000).toFixed(1) + "s" : "-";
        const rows = [
            ["Datos", stages.dataMs],
            ["Benchmark", stages.benchmarkMs],
            ["Régimen", stages.regimeMs],
            ["Simulación", stages.simulationMs],
            ["Resultados", stages.resultsMs],
        ];
        return (React.createElement("details", { style: { ...S.panel, padding: 10, marginBottom: 8 } },
            React.createElement("summary", { style: { cursor: "pointer", listStyle: "none", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" } },
                React.createElement("span", { style: { fontSize: 9, fontWeight: 800, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: .8 } }, "Rendimiento del backtest"),
                React.createElement("span", { style: { fontSize: 9, color: "var(--text-3)", fontFamily: "var(--font-mono)" } },
                    "Total ",
                    fmt(perf.totalMs),
                    " - ",
                    perf.tickers || 0,
                    " tickers - ",
                    perf.validTrades || 0,
                    " trades")),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 6, marginTop: 9 } }, rows.map(([label, ms]) => (React.createElement("div", { key: label, style: S.metricCard },
                React.createElement("div", { style: { fontSize: 7, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: .6 } }, label),
                React.createElement("div", { style: { fontSize: 12, color: "var(--text-0)", fontWeight: 800, marginTop: 2 } }, fmt(ms)))))),
            React.createElement("div", { style: { marginTop: 8, fontSize: 8, color: "var(--text-3)", fontFamily: "var(--font-mono)" } },
                "Cache alineado max: ",
                perf.alignedCacheSize || 0,
                ". Eval. reglas: ",
                perf.fastRuleEvalCount || 0,
                ". Fallbacks: ",
                perf.fastRuleFallbackCount || 0,
                ". Chunks: ",
                perf.simulationChunks || 0,
                " x ",
                perf.simulationChunkSize || 0,
                ". Pausas UI: ",
                perf.simulationYieldCount || 0,
                ". Cesiones: ",
                perf.cooperativeYieldCount || 0,
                ". Lotes datos: ",
                perf.batchChartRequests || 0,
                " / ",
                perf.batchChartSymbols || 0,
                " c",
                perf.batchFetchConcurrency || "-",
                ". Cache transitorio: ",
                perf.transientCacheWrites || 0,
                " escritos, ",
                perf.transientCacheReleased || 0,
                " liberados. Cargas 4H: ",
                perf.intrabarFetches || 0,
                ". Series recortadas: ",
                perf.trimmedSeriesCount || 0,
                ". Barras evitadas: ",
                perf.trimmedBarsSaved || 0,
                ". Cache liberado: ",
                perf.cacheTickersReleased || 0,
                ". Memoria ligera: ",
                perf.lightMemory ? "si" : "no",
                ".")));
    }
    function TickerIssuesPanel({ backtest, S }) {
        var _a, _b;
        const [filter, setFilter] = React.useState("all");
        const issues = ((_a = backtest.diagnostics) === null || _a === void 0 ? void 0 : _a.tickerIssues) || ((_b = backtest.perf) === null || _b === void 0 ? void 0 : _b.tickerIssues) || [];
        if (!issues.length)
            return null;
        const failed = issues.filter(x => x.reason === "failed").length;
        const insufficient = issues.filter(x => x.reason === "insufficient").length;
        const filtered = filter === "all" ? issues : issues.filter(x => x.reason === filter);
        const shown = filtered.slice(0, 200);
        const exportCsv = () => {
            const esc = v => '"' + String(v !== null && v !== void 0 ? v : "").replace(/"/g, '""') + '"';
            const rows = [["Ticker", "Tipo", "Detalle"].map(esc).join(",")];
            filtered.forEach(x => rows.push([x.ticker || "", x.reason === "insufficient" ? "insuficiente" : "sin datos", x.detail || ""].map(esc).join(",")));
            const b = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(b);
            a.download = "backtest_tickers_" + filter + "_" + new Date().toISOString().slice(0, 10) + ".csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        };
        const chip = (id, label, count, color) => (React.createElement("button", { onClick: () => setFilter(id), style: { ...S.btnG(filter === id), fontSize: 8, padding: "5px 9px", borderColor: filter === id ? color : "var(--border)", color: filter === id ? color : "var(--text-2)" } },
            label,
            " (",
            count,
            ")"));
        return (React.createElement("div", { style: { ...S.panel, padding: 10, marginBottom: 8, borderColor: "rgba(59,130,246,.24)" } },
            React.createElement("div", { style: { ...S.sectionHeader, alignItems: "center", marginBottom: 8 } },
                React.createElement("div", null,
                    React.createElement("div", { style: { ...S.sectionTitle, color: "var(--accent)" } }, "Tickers con problemas"),
                    React.createElement("div", { style: { ...S.sectionMeta, marginTop: 3 } },
                        issues.length,
                        " s\u00EDmbolos no entraron al backtest. Sin datos: ",
                        failed,
                        ". Historial insuficiente: ",
                        insufficient,
                        ".")),
                React.createElement("button", { onClick: exportCsv, style: { ...S.btnG(false), fontSize: 8, padding: "6px 10px" } }, "Exportar CSV")),
            React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 } },
                chip("all", "Todos", issues.length, "var(--accent)"),
                chip("failed", "Sin datos", failed, "var(--red)"),
                chip("insufficient", "Insuficientes", insufficient, "var(--amber)")),
            React.createElement("details", null,
                React.createElement("summary", { style: { cursor: "pointer", fontSize: 9, color: "var(--text-2)", fontWeight: 700, letterSpacing: .4, listStyle: "none" } },
                    "Ver detalle (",
                    shown.length,
                    filtered.length > shown.length ? " de " + filtered.length : "",
                    ")"),
                React.createElement("div", { style: { ...S.tableWrap, maxHeight: "24vh", marginTop: 8 } },
                    React.createElement("table", { className: "ui-table", style: S.table },
                        React.createElement("thead", null,
                            React.createElement("tr", null, ["Ticker", "Tipo", "Detalle"].map((h, i) => (React.createElement("th", { key: h, style: { ...S.th, textAlign: i === 2 ? "left" : "center" } }, h))))),
                        React.createElement("tbody", null, shown.map((x, i) => (React.createElement("tr", { key: (x.ticker || "") + "-" + i },
                            React.createElement("td", { style: { ...S.td, fontWeight: 800, color: "var(--accent)", textAlign: "center" } }, x.ticker || "-"),
                            React.createElement("td", { style: { ...S.td, fontSize: 8, fontWeight: 800, color: x.reason === "insufficient" ? "var(--amber)" : "var(--red)", textAlign: "center" } }, x.reason === "insufficient" ? "insuficiente" : "sin datos"),
                            React.createElement("td", { className: "ui-truncate", title: x.detail || "", style: { ...S.td, fontSize: 8, color: "var(--text-2)", maxWidth: 520 } }, x.detail || "-"))))))))));
    }
    function renderTickerIssues(backtest, ctx) {
        if (!backtest)
            return null;
        return React.createElement(TickerIssuesPanel, { backtest: backtest, S: ctx.S });
    }
    function BacktestWorkspace({ ctx }) {
        var _a, _b, _c;
        const [view, setView] = React.useState('overview');
        const [configOpen, setConfigOpen] = React.useState(!ctx.backtest);
        React.useEffect(() => { if (ctx.backtest) {
            setConfigOpen(false);
            setView('overview');
            ctx.setBtOptionsOpen(false);
        } }, [ctx.backtest, ctx.setBtOptionsOpen]);
        const { tab, S, btDirection, backtest, btRunning, btWeeks, btCapital, setSelectedChart, entryRules, setEntryRules, exitRules, setExitRules, shortEntryRules, setShortEntryRules, shortExitRules, setShortExitRules, savedStrategies } = ctx;
        if (tab !== "backtest")
            return null;
        return (React.createElement("div", null,
            React.createElement("div", { className: "workspace-toolbar" },
                React.createElement("div", null,
                    React.createElement("h1", null, "Backtest"),
                    React.createElement("p", null, "Valida tus reglas y compara el comportamiento de la estrategia.")),
                React.createElement("button", { type: "button", style: S.ghostBtn, "aria-expanded": configOpen, onClick: () => setConfigOpen(v => !v) }, "Configurar estrategia")),
            renderBtConfigBar(ctx),
            renderBtProgress(ctx),
            configOpen && React.createElement("div", null,
                renderMktFilterPanelRules(ctx),
                renderBtUniverseSelector(ctx),
                renderDataBanner(ctx),
                btDirection !== "short" && renderRulesPanel(entryRules, setEntryRules, exitRules, setExitRules, "Entrada Long", "Salida Long", "var(--green)", "var(--red)", ctx),
                btDirection !== "long" && renderRulesPanel(shortEntryRules, setShortEntryRules, shortExitRules, setShortExitRules, "Entrada Short", "Salida Short", "var(--purple)", "var(--amber)", ctx)),
            backtest && (React.createElement("div", null,
                React.createElement("nav", { className: "workspace-subnav", "aria-label": "Vistas del backtest" }, [['overview', 'Resumen'], ['trades', 'Operaciones'], ['analysis', 'Análisis'], ['data', 'Datos y diagnóstico']].map(([key, label]) => React.createElement("button", { type: "button", key: key, "aria-current": view === key ? 'page' : undefined, onClick: () => setView(key) }, label))),
                view === 'data' && React.createElement(React.Fragment, null,
                    renderBacktestRunState(backtest, ctx),
                    renderBacktestDiagnostics(backtest, ctx),
                    renderBacktestDataQuality(backtest, ctx),
                    renderTickerIssues(backtest, ctx),
                    renderBacktestPerformance(backtest, ctx),
                    renderWeeklyLog(backtest, btCapital, S)),
                view === 'overview' && renderBtCharts(backtest, ctx),
                view === 'analysis' && React.createElement(React.Fragment, null,
                    React.createElement(StrategyAnalysis, { backtest: backtest, S: S }),
                    React.createElement(PerformanceReport, { backtest: backtest, S: S, riskFreePct: (_b = (_a = backtest.riskFreePct) !== null && _a !== void 0 ? _a : ctx.pfRiskFree) !== null && _b !== void 0 ? _b : 0 })),
                view === 'trades' && renderTradesTable(backtest, setSelectedChart, S),
                view === 'trades' && ((_c = backtest.allTrades) === null || _c === void 0 ? void 0 : _c.length) > 0 && (React.createElement("div", { style: { marginBottom: 8 } },
                    React.createElement("button", { onClick: () => {
                            const hdr = ["Ticker", "Direccion", "F.Entrada", "F.Salida", "P.Entrada", "P.Salida", "Ret%", "PnL$", "Comision$", "Duracion(w)", "Razon Entrada", "Razon Salida"];
                            const rows = [hdr.join(",")];
                            backtest.allTrades.forEach(t => {
                                const fDate = ts => ts ? new Date(ts * 1000).toLocaleDateString("es", { year: "numeric", month: "2-digit", day: "2-digit" }) : "";
                                rows.push([t.ticker, t.dir === "short" ? "SHORT" : "LONG", fDate(t.entryTime), fDate(t.exitTime), t.entryPrice.toFixed(2), t.exitPrice.toFixed(2), t.returnPct.toFixed(2), t.pnl.toFixed(2), (t.commission || 0).toFixed(2), t.duration, '"' + (t.entryReason || "") + '"', '"' + (t.reason || "") + '"'].join(","));
                            });
                            rows.push([], ["Capital", "$" + backtest.capital, "Retorno Total", (backtest.totalReturn * 100).toFixed(2) + "%", "Anualizado", (backtest.annReturn * 100).toFixed(2) + "%", "Sharpe", backtest.sharpe.toFixed(3), "MaxDD", (backtest.maxDrawdown * 100).toFixed(2) + "%", "WinRate", (backtest.winRate * 100).toFixed(1) + "%", "ProfitFactor", backtest.profitFactor === Infinity ? "Inf" : backtest.profitFactor.toFixed(2), "CostosTot", "$" + (backtest.totalCommissionPaid || 0).toFixed(0)].join(","));
                            const b = new Blob([rows.join("\n")], { type: "text/csv" });
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(b);
                            a.download = "backtest_" + new Date().toISOString().slice(0, 10) + ".csv";
                            a.click();
                        }, style: { ...S.btnG(false), fontSize: 9 } }, "Exportar Trades CSV"))))),
            !backtest && !btRunning && (React.createElement("div", { style: S.emptyState }, "Configura reglas de entrada/salida, stops, y ejecuta el backtest.")),
            btRunning && (React.createElement("div", { style: { ...S.panel, padding: 24, textAlign: "center" } },
                React.createElement("div", { style: { ...S.progressBar, maxWidth: 320, margin: "0 auto 12px" } },
                    React.createElement("span", { style: { ...S.progressFill(45), background: "linear-gradient(90deg,var(--purple),var(--accent))" } })),
                React.createElement("div", { style: { ...S.sectionMeta, color: "var(--text-2)" } },
                    "Simulando ",
                    btWeeks,
                    " semanas...")))));
    }
    window.StockScannerTabs.renderBacktestTab = function (ctx) {
        return ctx.tab === 'backtest' ? React.createElement(BacktestWorkspace, { ctx: ctx }) : null;
    };
})();
