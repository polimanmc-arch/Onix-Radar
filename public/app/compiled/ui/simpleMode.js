"use strict";
// Modo simple: recorrido guiado por el proceso completo, pensado para presentar la app.
// Mercado + estrategia → 1. Escáner → 2. Portafolio de Markowitz → 3. Backtest.
// Reutiliza el escáner, el optimizador de portafolios y el backtest del modo experto.
window.StockScannerUI = window.StockScannerUI || {};
(function () {
    const { useState, useRef, useEffect } = React;
    const GAMES_KEY = 'onix_simple_games_v1';
    const core = () => window.StockScannerCore;
    const money = (v, cur) => (Number.isFinite(v) ? Math.round(v).toLocaleString('es-ES') : '—') + ' ' + cur;
    const pct = (v, d = 1, sign = true) => (Number.isFinite(v) ? (sign && v >= 0 ? '+' : '') + (v * 100).toFixed(d).replace('.', ',') + ' %' : '—');
    const num = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
    const year = t => (t ? new Date(t * 1000).getFullYear() : '');
    const monthYear = t => (t ? new Date(t * 1000).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : '');
    const SECTOR_ES = { Technology: 'Tecnología', 'Financial Services': 'Financiero', Healthcare: 'Salud', 'Consumer Cyclical': 'Consumo cíclico',
        'Consumer Defensive': 'Consumo básico', Industrials: 'Industria', Energy: 'Energía', 'Communication Services': 'Comunicaciones',
        'Basic Materials': 'Materiales', 'Real Estate': 'Inmobiliario', Utilities: 'Servicios públicos', Other: 'Otros', 'N/A': 'Otros' };
    const sectorEs = s => SECTOR_ES[s] || s || 'Otros';
    function loadGames() { try {
        const v = JSON.parse(localStorage.getItem(GAMES_KEY) || '[]');
        return Array.isArray(v) ? v : [];
    }
    catch {
        return [];
    } }
    function saveGames(list) { try {
        localStorage.setItem(GAMES_KEY, JSON.stringify(list.slice(0, 30)));
    }
    catch { } }
    function Stars({ n, size = 26 }) {
        return React.createElement("span", { className: "simple-stars", "aria-label": `${n} de 3 estrellas`, style: { fontSize: size } }, [0, 1, 2].map(i => React.createElement("span", { key: i, "aria-hidden": "true", className: i < n ? 'on' : 'off' }, "\u2605")));
    }
    // Estrategia frente al índice.
    function SimpleChart({ summary, currency, marketName }) {
        const W = 640, H = 230, padL = 58, padR = 14, padT = 12, padB = 26;
        const a = summary.curve, b = summary.bench;
        const all = [summary.capital, ...a.map(p => p.value), ...b.map(p => p.value)];
        const lo = Math.min(...all) * 0.97, hi = Math.max(...all) * 1.03, rg = hi - lo || 1;
        const t0 = a[0].time, t1 = a[a.length - 1].time, tr = (t1 - t0) || 1;
        const x = t => padL + ((t - t0) / tr) * (W - padL - padR);
        const y = v => padT + (1 - (v - lo) / rg) * (H - padT - padB);
        const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + x(p.time).toFixed(1) + ',' + y(p.value).toFixed(1)).join(' ');
        const area = path(a) + ` L${x(t1).toFixed(1)},${(H - padB).toFixed(1)} L${x(t0).toFixed(1)},${(H - padB).toFixed(1)} Z`;
        const ticks = [lo + rg * 0.1, summary.capital, hi - rg * 0.1].filter((v, i, arr) => arr.indexOf(v) === i);
        return (React.createElement("figure", { className: "simple-chart" },
            React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Evolución de 10.000 ${currency}: estrategia frente al ${marketName}` },
                ticks.map(v => React.createElement("g", { key: v },
                    React.createElement("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: "var(--border)", strokeDasharray: v === summary.capital ? '4 4' : '0', strokeWidth: "1" }),
                    React.createElement("text", { x: padL - 8, y: y(v) + 4, textAnchor: "end", fontSize: "11", fill: "var(--text-2)" }, Math.round(v).toLocaleString('es-ES')))),
                React.createElement("path", { d: area, fill: "var(--accent)", opacity: "0.10" }),
                b.length > 1 && React.createElement("path", { d: path(b), fill: "none", stroke: "var(--text-2)", strokeWidth: "2", strokeDasharray: "6 4" }),
                React.createElement("path", { d: path(a), fill: "none", stroke: "var(--accent)", strokeWidth: "3", strokeLinejoin: "round" }),
                React.createElement("text", { x: padL, y: H - 6, fontSize: "11", fill: "var(--text-2)" }, year(t0)),
                React.createElement("text", { x: W - padR, y: H - 6, fontSize: "11", fill: "var(--text-2)", textAnchor: "end" }, year(t1))),
            React.createElement("figcaption", { className: "simple-legend" },
                React.createElement("span", null,
                    React.createElement("i", { style: { background: 'var(--accent)' } }),
                    "Estrategia"),
                React.createElement("span", null,
                    React.createElement("i", { className: "dashed" }),
                    `Comprar el ${marketName} y esperar`))));
    }
    // Frontera eficiente: miles de combinaciones de pesos (riesgo, rentabilidad) y el portafolio elegido.
    function FrontierChart({ portfolio }) {
        const pts = (portfolio.frontier || []).filter(p => Number.isFinite(p.vol) && Number.isFinite(p.ret));
        const chosen = portfolio.chosenPoint, ew = portfolio.altEqualWeightPoint;
        if (pts.length < 5 || !chosen)
            return null;
        const W = 460, H = 280, padL = 46, padR = 12, padT = 12, padB = 36;
        const xs = [...pts.map(p => p.vol), chosen.vol], ys = [...pts.map(p => p.ret), chosen.ret];
        const x0 = Math.min(...xs) * 0.95, x1 = Math.max(...xs) * 1.05, y0 = Math.min(...ys), y1 = Math.max(...ys);
        const yr = (y1 - y0) || 1, ylo = y0 - yr * 0.08, yhi = y1 + yr * 0.08;
        const x = v => padL + (v - x0) / ((x1 - x0) || 1) * (W - padL - padR);
        const y = v => padT + (1 - (v - ylo) / ((yhi - ylo) || 1)) * (H - padT - padB);
        const sh = pts.map(p => p.sharpe).filter(Number.isFinite), smin = Math.min(...sh), smax = Math.max(...sh);
        const op = s => (Number.isFinite(s) && smax > smin ? 0.15 + 0.65 * (s - smin) / (smax - smin) : 0.3);
        const ticks = n => Array.from({ length: n }, (_, i) => i / (n - 1));
        return (React.createElement("figure", { className: "simple-frontier" },
            React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Frontera eficiente de Markowitz con el portafolio elegido" },
                ticks(4).map(f => {
                    const v = ylo + (yhi - ylo) * f;
                    return React.createElement("g", { key: 'y' + f },
                        React.createElement("line", { x1: padL, x2: W - padR, y1: y(v), y2: y(v), stroke: "var(--border)", strokeWidth: "1" }),
                        React.createElement("text", { x: padL - 6, y: y(v) + 4, textAnchor: "end", fontSize: "10", fill: "var(--text-2)" }, Math.round(v) + '%'));
                }),
                ticks(4).map(f => { const v = x0 + (x1 - x0) * f; return React.createElement("text", { key: 'x' + f, x: x(v), y: H - padB + 14, textAnchor: "middle", fontSize: "10", fill: "var(--text-2)" }, Math.round(v) + '%'); }),
                pts.map((p, i) => React.createElement("circle", { key: i, cx: x(p.vol), cy: y(p.ret), r: "2.4", fill: "var(--accent)", opacity: op(p.sharpe) })),
                ew && React.createElement("g", null,
                    React.createElement("circle", { cx: x(ew.vol), cy: y(ew.ret), r: "6", fill: "var(--bg-1)", stroke: "var(--text-2)", strokeWidth: "2" })),
                React.createElement("g", null,
                    React.createElement("circle", { cx: x(chosen.vol), cy: y(chosen.ret), r: "9", fill: "#f5c542", stroke: "var(--bg-1)", strokeWidth: "2" }),
                    React.createElement("text", { x: x(chosen.vol), y: y(chosen.ret) + 4, textAnchor: "middle", fontSize: "11", fontWeight: "800", fill: "#1d1f29" }, "\u2605")),
                React.createElement("text", { x: (padL + W - padR) / 2, y: H - 4, textAnchor: "middle", fontSize: "11", fill: "var(--text-2)" }, "Riesgo (volatilidad anual)"),
                React.createElement("text", { x: 12, y: (padT + H - padB) / 2, textAnchor: "middle", fontSize: "11", fill: "var(--text-2)", transform: `rotate(-90 12 ${(padT + H - padB) / 2})` }, "Rentabilidad esperada")),
            React.createElement("figcaption", { className: "simple-legend" },
                React.createElement("span", null,
                    React.createElement("i", { style: { background: 'var(--accent)', opacity: .6 } }),
                    "Combinaciones probadas"),
                React.createElement("span", null,
                    React.createElement("b", { style: { color: '#f5c542' } }, "\u2605"),
                    " M\u00E1ximo Sharpe (elegido)"),
                ew && React.createElement("span", null,
                    React.createElement("i", { className: "ring" }),
                    "Mismo peso en todas"))));
    }
    function Bars({ items, color = 'var(--accent)' }) {
        const max = Math.max(...items.map(i => i.weight), 0.0001);
        return React.createElement("div", { className: "simple-bars" }, items.map(it => (React.createElement("div", { key: it.key, className: "simple-bar-row" },
            React.createElement("div", { className: "simple-bar-label" },
                React.createElement("b", null, it.label),
                it.sub && React.createElement("small", null, it.sub)),
            React.createElement("div", { className: "simple-bar-track" },
                React.createElement("span", { style: { width: (it.weight / max * 100) + '%', background: color } })),
            React.createElement("div", { className: "simple-bar-value" },
                pct(it.weight, 1, false),
                it.extra && React.createElement("small", null, it.extra))))));
    }
    const STAGES = [{ id: 'scan', label: 'Escáner' }, { id: 'portfolio', label: 'Portafolio Markowitz' }, { id: 'backtest', label: 'Backtest' }];
    function SimpleMode() {
        var _a;
        const C = core();
        const markets = C.SIMPLE_MARKETS, strategies = C.SIMPLE_STRATEGIES, periods = C.SIMPLE_PERIODS;
        const [marketId, setMarketId] = useState('DOW30');
        const [strategyId, setStrategyId] = useState(null);
        const [years, setYears] = useState(3);
        const [stage, setStage] = useState('idle');
        const [progress, setProgress] = useState('');
        const [run, setRun] = useState(null);
        const [error, setError] = useState(null);
        const [games, setGames] = useState(loadGames);
        const cacheRef = useRef({});
        const abortRef = useRef(null);
        const sectionRef = useRef(null);
        useEffect(() => () => { var _a; return (_a = abortRef.current) === null || _a === void 0 ? void 0 : _a.abort(); }, []);
        const market = markets.find(m => m.id === marketId);
        const strategy = strategies.find(s => s.id === strategyId);
        const period = periods.find(p => p.years === years) || periods[periods.length - 1];
        const running = stage !== 'idle' && stage !== 'done';
        const ready = market && strategy && !running;
        const execute = async () => {
            var _a;
            if (!ready)
                return;
            const ac = new AbortController();
            abortRef.current = ac;
            const cfg = { market, strategy, period };
            setError(null);
            setRun({ ...cfg });
            setTimeout(() => { var _a, _b; return (_b = (_a = sectionRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView) === null || _b === void 0 ? void 0 : _b.call(_a, { behavior: 'smooth', block: 'start' }); }, 60);
            try {
                // 1. Escáner
                setStage('scan');
                setProgress('Descargando precios semanales');
                const tickers = ((_a = window.StockScannerConfig.UNIVERSE_PRESETS[market.preset]) === null || _a === void 0 ? void 0 : _a.tickers) || [];
                await C.loadSimpleWeekly({ tickers, cacheRef, signal: ac.signal, onProgress: (d, t) => setProgress(`Descargando precios ${d} de ${t}`) });
                const scan = C.scanSimpleMarket({ tickers, dataByTicker: cacheRef.current, strategy });
                setRun(r => ({ ...r, scan: { ...scan, total: tickers.length } }));
                // 2. Portafolio de Markowitz con las mejores candidatas del escáner
                setStage('portfolio');
                setProgress('Probando 10.000 combinaciones de pesos');
                let portfolio = null, portfolioError = null;
                if (scan.passing.length >= 2) {
                    const fetchSectors = async (list) => { try {
                        const r = await fetch('/api/sectors?symbols=' + encodeURIComponent(list.join(',')));
                        return r.ok ? r.json() : {};
                    }
                    catch {
                        return {};
                    } };
                    const out = await C.buildPortfolioWorkflow({ ...C.buildSimplePortfolioOptions({ strategy, candidates: scan.passing, cacheRef, fetchSectors }), setPortfolio: p => { portfolio = p; } });
                    if (!(out === null || out === void 0 ? void 0 : out.ok))
                        portfolioError = (out === null || out === void 0 ? void 0 : out.message) || 'No se pudo construir el portafolio.';
                }
                else
                    portfolioError = 'Hoy no hay suficientes acciones que cumplan la estrategia para construir un portafolio (hacen falta al menos 2).';
                setRun(r => ({ ...r, portfolio, portfolioError }));
                // 3. Backtest de la estrategia
                setStage('backtest');
                setProgress('Simulando semana a semana');
                let raw = null;
                const out = await C.runBacktestWorkflow({
                    ...C.buildSimpleBacktestOptions(cfg), dataCacheRef: cacheRef, abortSignal: ac.signal,
                    setBtRunning: () => { }, setTab: () => { }, setBacktest: r => { raw = r; },
                    setBtProgress: p => (p === null || p === void 0 ? void 0 : p.stage) === 'simulation' && setProgress(`Simulando semana a semana… ${Math.round(p.phasePct || 0)} %`),
                });
                const summary = raw && C.summarizeSimpleResult(raw);
                const backtest = summary ? { summary, annReturn: raw.annReturn, sharpe: raw.sharpe, commissions: raw.totalCommissionPaid } : null;
                setRun(r => ({ ...r, backtest, backtestError: backtest ? null : ((out === null || out === void 0 ? void 0 : out.message) || 'No hubo datos suficientes para el backtest.') }));
                if (summary) {
                    const game = { id: Date.now(), market: market.name, flag: market.flag, strategy: strategy.name, icon: strategy.icon, period: period.label, ret: summary.ret, benchRet: summary.benchRet, stars: summary.stars };
                    setGames(prev => { const next = [game, ...prev].slice(0, 30); saveGames(next); return next; });
                }
                setStage('done');
            }
            catch (e) {
                setStage('idle');
                setError((e === null || e === void 0 ? void 0 : e.name) === 'AbortError' ? 'Análisis cancelado.' : ((e === null || e === void 0 ? void 0 : e.message) || 'Algo salió mal. Inténtalo de nuevo.'));
            }
            finally {
                abortRef.current = null;
                setProgress('');
            }
        };
        const stageState = id => {
            const order = STAGES.map(s => s.id), cur = order.indexOf(stage);
            if (stage === 'done')
                return 'done';
            if (stage === 'idle')
                return run && order.indexOf(id) < order.length ? (run[id] ? 'done' : 'todo') : 'todo';
            return order.indexOf(id) < cur ? 'done' : order.indexOf(id) === cur ? 'active' : 'todo';
        };
        const ranking = [...games].sort((a, b) => b.ret - a.ret).slice(0, 8);
        const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        const cur = (_a = run === null || run === void 0 ? void 0 : run.market) === null || _a === void 0 ? void 0 : _a.currency;
        const scan = run === null || run === void 0 ? void 0 : run.scan, pf = run === null || run === void 0 ? void 0 : run.portfolio, bt = run === null || run === void 0 ? void 0 : run.backtest;
        const inPortfolio = new Set(((pf === null || pf === void 0 ? void 0 : pf.allocations) || []).map(a => a.ticker));
        const fmtCol = (v, fmt) => fmt === 'pct' ? pct(v) : fmt === 'num' ? num(v, 1) : (v !== null && v !== void 0 ? v : '—');
        return (React.createElement("div", { className: "simple-mode" },
            React.createElement("section", { className: "simple-hero" },
                React.createElement("h1", null, "Radar Onix \u00B7 Simulador de inversi\u00F3n"),
                React.createElement("p", null, "Del esc\u00E1ner al portafolio: elige un mercado y una estrategia y sigue el proceso completo con datos reales.")),
            React.createElement("div", { className: "simple-setup" },
                React.createElement("section", { className: "simple-step", "aria-labelledby": "simple-step-market" },
                    React.createElement("h2", { id: "simple-step-market" },
                        React.createElement("span", { className: "simple-step-n" }, "A"),
                        "Mercado"),
                    React.createElement("div", { className: "simple-grid simple-grid-markets" }, markets.map(m => (React.createElement("button", { type: "button", key: m.id, className: "simple-card compact", "aria-pressed": m.id === marketId, onClick: () => setMarketId(m.id), disabled: running },
                        React.createElement("span", { className: "simple-card-icon" }, m.flag),
                        React.createElement("strong", null, m.name),
                        React.createElement("span", null, m.blurb)))))),
                React.createElement("section", { className: "simple-step", "aria-labelledby": "simple-step-strategy" },
                    React.createElement("h2", { id: "simple-step-strategy" },
                        React.createElement("span", { className: "simple-step-n" }, "B"),
                        "Estrategia"),
                    React.createElement("div", { className: "simple-grid simple-grid-3" }, strategies.map(st => (React.createElement("button", { type: "button", key: st.id, className: "simple-card simple-card-strategy", "aria-pressed": st.id === strategyId, onClick: () => setStrategyId(st.id), disabled: running },
                        React.createElement("span", { className: "simple-card-icon" }, st.icon),
                        React.createElement("strong", null, st.name),
                        React.createElement("span", null, st.pitch),
                        React.createElement("span", { className: "simple-rule" },
                            React.createElement("b", null, "Compra:"),
                            " ",
                            st.buy),
                        React.createElement("span", { className: "simple-rule" },
                            React.createElement("b", null, "Vende:"),
                            " ",
                            st.sell),
                        React.createElement("em", { className: "simple-badge" }, st.level)))))),
                React.createElement("div", { className: "simple-launch" },
                    React.createElement("div", { className: "simple-periods", role: "group", "aria-label": "Periodo del backtest" },
                        React.createElement("span", null, "Backtest:"),
                        periods.map(p => React.createElement("button", { type: "button", key: p.years, "aria-pressed": p.years === years, onClick: () => setYears(p.years), disabled: running }, p.label))),
                    !running && React.createElement("button", { type: "button", className: "simple-play", onClick: execute, disabled: !ready }, strategy ? '▶  Ejecutar análisis' : 'Elige una estrategia para empezar'),
                    running && React.createElement("button", { type: "button", className: "simple-link", onClick: () => { var _a; return (_a = abortRef.current) === null || _a === void 0 ? void 0 : _a.abort(); } }, "Cancelar")),
                error && React.createElement("div", { className: "simple-error", role: "alert" }, error)),
            run && React.createElement("div", { ref: sectionRef },
                React.createElement("ol", { className: "simple-pipeline", "aria-label": "Progreso del an\u00E1lisis" }, STAGES.map((s, i) => {
                    const st = stageState(s.id);
                    return (React.createElement("li", { key: s.id, "data-state": st },
                        React.createElement("span", { className: "dot" }, st === 'done' ? '✓' : i + 1),
                        React.createElement("span", null,
                            React.createElement("b", null, s.label),
                            st === 'active' && React.createElement("small", { role: "status" }, progress || 'Trabajando…'))));
                })),
                scan && React.createElement("section", { className: "simple-panel", "aria-label": "Esc\u00E1ner" },
                    React.createElement("header", null,
                        React.createElement("span", { className: "simple-panel-n" }, "1"),
                        React.createElement("div", null,
                            React.createElement("h2", null, "Esc\u00E1ner \u00B7 \u00BFqu\u00E9 acciones cumplen hoy la estrategia?"),
                            React.createElement("p", null, "Se revisan todas las acciones del mercado con la \u00FAltima vela semanal cerrada y se quedan las que cumplen las reglas de compra."))),
                    React.createElement("div", { className: "simple-kpis" },
                        React.createElement("div", null,
                            React.createElement("span", null, "Acciones analizadas"),
                            React.createElement("strong", null, scan.analyzed)),
                        React.createElement("div", null,
                            React.createElement("span", null, "Cumplen la estrategia"),
                            React.createElement("strong", null, scan.passing.length)),
                        React.createElement("div", null,
                            React.createElement("span", null, "Del mercado"),
                            React.createElement("strong", null, scan.analyzed ? pct(scan.passing.length / scan.analyzed, 0, false) : '—'))),
                    scan.passing.length ? React.createElement("div", { className: "simple-table-wrap" },
                        React.createElement("table", { className: "simple-table" },
                            React.createElement("thead", null,
                                React.createElement("tr", null,
                                    React.createElement("th", null, "#"),
                                    React.createElement("th", null, "Acci\u00F3n"),
                                    React.createElement("th", null, "Precio"),
                                    React.createElement("th", null, "\u00DAltima semana"),
                                    run.strategy.columns.map(col => React.createElement("th", { key: col.label, title: col.hint }, col.label)),
                                    React.createElement("th", { title: "Rentabilidad por unidad de riesgo en el \u00FAltimo a\u00F1o" }, "Sharpe 1 a\u00F1o"),
                                    React.createElement("th", null))),
                            React.createElement("tbody", null, scan.passing.slice(0, 12).map((r, i) => (React.createElement("tr", { key: r.ticker },
                                React.createElement("td", null, i + 1),
                                React.createElement("td", null,
                                    React.createElement("b", null, r.ticker)),
                                React.createElement("td", null, num(r.price)),
                                React.createElement("td", { className: r.chg >= 0 ? 'up' : 'down' }, pct(r.chg)),
                                r.values.map((v, k) => React.createElement("td", { key: k }, fmtCol(v, run.strategy.columns[k].fmt))),
                                React.createElement("td", null, num(r.sharpe1y)),
                                React.createElement("td", null, inPortfolio.has(r.ticker) && React.createElement("span", { className: "simple-tag" }, "En cartera"))))))),
                        scan.passing.length > 12 && React.createElement("p", { className: "simple-note" }, `Y ${scan.passing.length - 12} acciones más. Las ${Math.min(scan.passing.length, C.SIMPLE_CANDIDATES)} con mejor Sharpe del último año pasan al optimizador.`))
                        : React.createElement("p", { className: "simple-note" }, "Hoy ninguna acci\u00F3n del mercado cumple las reglas: la estrategia esperar\u00EDa.")),
                run.portfolioError && React.createElement("section", { className: "simple-panel", "aria-label": "Portafolio" },
                    React.createElement("header", null,
                        React.createElement("span", { className: "simple-panel-n" }, "2"),
                        React.createElement("div", null,
                            React.createElement("h2", null, "Portafolio de Markowitz"),
                            React.createElement("p", null, run.portfolioError)))),
                pf && React.createElement("section", { className: "simple-panel", "aria-label": "Portafolio de Markowitz" },
                    React.createElement("header", null,
                        React.createElement("span", { className: "simple-panel-n" }, "2"),
                        React.createElement("div", null,
                            React.createElement("h2", null, "Portafolio de Markowitz \u00B7 \u00BFcu\u00E1nto invertir en cada acci\u00F3n?"),
                            React.createElement("p", null, "El optimizador prueba miles de combinaciones de pesos con las rentabilidades y correlaciones hist\u00F3ricas y elige la de m\u00E1ximo Sharpe: la mejor rentabilidad por unidad de riesgo. M\u00E1ximo 10 acciones y 25 % por acci\u00F3n."))),
                    React.createElement("div", { className: "simple-kpis" },
                        React.createElement("div", null,
                            React.createElement("span", null, "Rentabilidad esperada"),
                            React.createElement("strong", null, pct(pf.chosenPoint.ret / 100)),
                            React.createElement("small", null, "anual, hist\u00F3rica")),
                        React.createElement("div", null,
                            React.createElement("span", null, "Volatilidad (riesgo)"),
                            React.createElement("strong", null, pct(pf.chosenPoint.vol / 100, 1, false)),
                            React.createElement("small", null, "anual")),
                        React.createElement("div", null,
                            React.createElement("span", null, "Ratio de Sharpe"),
                            React.createElement("strong", null, num((pf.chosenPoint.ret - 3) / pf.chosenPoint.vol)),
                            React.createElement("small", null, "tasa libre de riesgo 3 %")),
                        React.createElement("div", null,
                            React.createElement("span", null, "Acciones"),
                            React.createElement("strong", null, pf.allocations.length),
                            React.createElement("small", null, `de ${Math.min((scan === null || scan === void 0 ? void 0 : scan.passing.length) || 0, C.SIMPLE_CANDIDATES)} candidatas`))),
                    React.createElement("div", { className: "simple-portfolio-grid" },
                        React.createElement(FrontierChart, { portfolio: pf }),
                        React.createElement("div", null,
                            React.createElement("h3", null, "Peso por acci\u00F3n"),
                            React.createElement(Bars, { items: pf.allocations.map(a => ({ key: a.ticker, label: a.ticker, sub: a.shortName && a.shortName !== a.ticker ? a.shortName : sectorEs(a.sector), weight: Math.abs(a.weight), extra: money(Math.abs(a.weight) * 10000, cur) })) }),
                            React.createElement("h3", null, "Peso por sector"),
                            React.createElement(Bars, { color: "var(--green)", items: (pf.sectors || []).map(s => ({ key: s.name, label: sectorEs(s.name), sub: `${s.count} acción${s.count > 1 ? 'es' : ''}`, weight: s.weight })) })))),
                run.backtestError && React.createElement("section", { className: "simple-panel", "aria-label": "Backtest" },
                    React.createElement("header", null,
                        React.createElement("span", { className: "simple-panel-n" }, "3"),
                        React.createElement("div", null,
                            React.createElement("h2", null, "Backtest"),
                            React.createElement("p", null, run.backtestError)))),
                bt && React.createElement("section", { className: "simple-panel simple-result", "aria-label": "Resultado del backtest" },
                    React.createElement("header", null,
                        React.createElement("span", { className: "simple-panel-n" }, "3"),
                        React.createElement("div", null,
                            React.createElement("h2", null, "Backtest \u00B7 \u00BFhabr\u00EDa funcionado en el pasado?"),
                            React.createElement("p", null, `La estrategia se aplica semana a semana desde ${monthYear(bt.summary.start)} con 10.000 ${cur}: compra cuando se cumplen las reglas, vende cuando se cumplen las de salida, reparte el dinero según rentabilidad/riesgo y descuenta comisiones.`))),
                    React.createElement("div", { className: "simple-result-head" },
                        React.createElement("div", { className: "simple-result-title" }, bt.summary.headline),
                        React.createElement(Stars, { n: bt.summary.stars })),
                    React.createElement("div", { className: "simple-scores" },
                        React.createElement("div", { className: "simple-score main" },
                            React.createElement("span", null, "Estrategia"),
                            React.createElement("strong", null, money(bt.summary.final, cur)),
                            React.createElement("em", { className: bt.summary.ret >= 0 ? 'up' : 'down' }, pct(bt.summary.ret))),
                        React.createElement("div", { className: "simple-vs" }, "VS"),
                        React.createElement("div", { className: "simple-score" },
                            React.createElement("span", null, `Comprar el ${run.market.name} y esperar`),
                            React.createElement("strong", null, money(bt.summary.benchFinal, cur)),
                            React.createElement("em", { className: (bt.summary.benchRet || 0) >= 0 ? 'up' : 'down' }, pct(bt.summary.benchRet)))),
                    React.createElement(SimpleChart, { summary: bt.summary, currency: cur, marketName: run.market.name }),
                    React.createElement("div", { className: "simple-facts simple-facts-6" },
                        React.createElement("div", null,
                            React.createElement("span", null, "Rentabilidad anual"),
                            React.createElement("strong", null, pct(bt.annReturn))),
                        React.createElement("div", null,
                            React.createElement("span", null, "Ratio de Sharpe"),
                            React.createElement("strong", null, num(bt.sharpe))),
                        React.createElement("div", null,
                            React.createElement("span", null, "M\u00E1xima ca\u00EDda"),
                            React.createElement("strong", null, pct(-bt.summary.dd)),
                            React.createElement("small", null, bt.summary.benchDd != null ? `índice ${pct(-bt.summary.benchDd)}` : '')),
                        React.createElement("div", null,
                            React.createElement("span", null, "Operaciones"),
                            React.createElement("strong", null, bt.summary.trades)),
                        React.createElement("div", null,
                            React.createElement("span", null, "Operaciones ganadoras"),
                            React.createElement("strong", null, bt.summary.winRate != null ? Math.round(bt.summary.winRate * 100) + ' %' : '—')),
                        React.createElement("div", null,
                            React.createElement("span", null, "Comisiones pagadas"),
                            React.createElement("strong", null, money(bt.commissions, cur)))),
                    React.createElement("div", { className: "simple-stars-help" },
                        React.createElement("span", null, "\u2B50 ganar dinero"),
                        React.createElement("span", null, "\u2B50 ganar al mercado"),
                        React.createElement("span", null, "\u2B50 caer menos que el mercado")))),
            ranking.length > 0 && React.createElement("section", { className: "simple-ranking", "aria-label": "Tus partidas" },
                React.createElement("div", { className: "simple-ranking-head" },
                    React.createElement("h2", null, "\uD83C\uDFC1 Tus partidas"),
                    React.createElement("button", { type: "button", className: "simple-link", onClick: () => { setGames([]); saveGames([]); } }, "Borrar")),
                React.createElement("table", null,
                    React.createElement("thead", null,
                        React.createElement("tr", null,
                            React.createElement("th", null),
                            React.createElement("th", null, "Estrategia"),
                            React.createElement("th", null, "Mercado"),
                            React.createElement("th", null, "Periodo"),
                            React.createElement("th", null, "Resultado"),
                            React.createElement("th", null, "\u00CDndice"),
                            React.createElement("th", null, "Estrellas"))),
                    React.createElement("tbody", null, ranking.map((g, i) => (React.createElement("tr", { key: g.id },
                        React.createElement("td", null, medal(i)),
                        React.createElement("td", null, `${g.icon} ${g.strategy}`),
                        React.createElement("td", null, `${g.flag} ${g.market}`),
                        React.createElement("td", null, g.period),
                        React.createElement("td", { className: g.ret >= 0 ? 'up' : 'down' }, pct(g.ret)),
                        React.createElement("td", null, pct(g.benchRet)),
                        React.createElement("td", null,
                            React.createElement(Stars, { n: g.stars, size: 15 })))))))),
            React.createElement("p", { className: "simple-disclaimer" }, "Datos reales de Yahoo Finance. Rentabilidades pasadas no garantizan resultados futuros; es una herramienta educativa, no una recomendaci\u00F3n de inversi\u00F3n.")));
    }
    window.StockScannerUI.SimpleMode = SimpleMode;
})();
