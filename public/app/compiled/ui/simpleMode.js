"use strict";
// Modo simple: simulador de estrategias en 3 pasos, pensado para quien ve la app por primera vez.
// Reutiliza el backtest y el scanner del modo experto con configuraciones predefinidas.
window.StockScannerUI = window.StockScannerUI || {};
(function () {
    const { useState, useRef, useEffect } = React;
    const GAMES_KEY = 'onix_simple_games_v1';
    const core = () => window.StockScannerCore;
    const money = (v, cur) => (Number.isFinite(v) ? Math.round(v).toLocaleString('es-ES') : '—') + ' ' + cur;
    const pct = (v, d = 1) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + (v * 100).toFixed(d).replace('.', ',') + ' %' : '—');
    const year = t => (t ? new Date(t * 1000).getFullYear() : '');
    const monthYear = t => (t ? new Date(t * 1000).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : '');
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
    // Gráfico de dos líneas: estrategia frente al índice.
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
            React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Evolución de ${currency === '€' ? '10.000 €' : '10.000 $'}: estrategia frente al ${marketName}` },
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
                    "Tu estrategia"),
                React.createElement("span", null,
                    React.createElement("i", { className: "dashed" }),
                    `Comprar el ${marketName} y esperar`))));
    }
    function SimpleMode({ notify }) {
        const C = core();
        const markets = C.SIMPLE_MARKETS, strategies = C.SIMPLE_STRATEGIES, periods = C.SIMPLE_PERIODS;
        const [marketId, setMarketId] = useState(markets[0].id);
        const [strategyId, setStrategyId] = useState(null);
        const [years, setYears] = useState(3);
        const [running, setRunning] = useState(false);
        const [progress, setProgress] = useState(null);
        const [outcome, setOutcome] = useState(null);
        const [error, setError] = useState(null);
        const [games, setGames] = useState(loadGames);
        const [howOpen, setHowOpen] = useState(false);
        const cacheRef = useRef({});
        const abortRef = useRef(null);
        const resultRef = useRef(null);
        const strategyRef = useRef(null);
        useEffect(() => () => { var _a; return (_a = abortRef.current) === null || _a === void 0 ? void 0 : _a.abort(); }, []);
        const market = markets.find(m => m.id === marketId);
        const strategy = strategies.find(s => s.id === strategyId);
        const period = periods.find(p => p.years === years) || periods[periods.length - 1];
        const ready = market && strategy && !running;
        const simulate = async () => {
            var _a;
            if (!ready)
                return;
            const ac = new AbortController();
            abortRef.current = ac;
            setRunning(true);
            setError(null);
            setOutcome(null);
            setProgress({ pct: 2, label: 'Preparando' });
            try {
                let raw = null;
                const out = await C.runBacktestWorkflow({
                    ...C.buildSimpleBacktestOptions({ market, strategy, period }),
                    dataCacheRef: cacheRef, abortSignal: ac.signal,
                    setBtRunning: () => { }, setTab: () => { }, setBacktest: r => { raw = r; },
                    setBtProgress: p => setProgress({ pct: Math.max(2, Math.min(96, (p === null || p === void 0 ? void 0 : p.pct) || 0)), label: ({ data: 'Descargando precios', benchmark: 'Preparando el índice', simulation: 'Simulando semana a semana', results: 'Calculando resultados' })[p === null || p === void 0 ? void 0 : p.stage] || 'Preparando' }),
                });
                const summary = raw && C.summarizeSimpleResult(raw);
                if (!summary) {
                    setError((out === null || out === void 0 ? void 0 : out.message) || 'No hubo datos suficientes para simular. Prueba con otro mercado.');
                    return;
                }
                setProgress({ pct: 97, label: 'Buscando señales de hoy' });
                let rows = [];
                const scanRef = { current: {} };
                const tickers = (((_a = window.StockScannerConfig.UNIVERSE_PRESETS[market.preset]) === null || _a === void 0 ? void 0 : _a.tickers) || []);
                await C.runScanWorkflow({
                    scanning: false, tickers, filters: C.buildSimpleBacktestOptions({ market, strategy, period }).entryRules[0].conditions, shortFilters: [],
                    scanDirection: 'long', conc: 12, minHistoryYears: 0, abortRef: { current: null }, dataCacheRef: scanRef,
                    setScanning: () => { }, setSearch: () => { }, setOnlyPass: () => { }, setTab: () => { }, setProg: () => { },
                    setResults: r => { rows = r; }, addLog: () => { }, fetchSectors: async () => ({}), fetchQuotes: async () => ({}), setSectorData: () => { },
                }).catch(() => { });
                const signals = rows.filter(r => r.passed && !r.err).map(r => ({ ticker: r.ticker, price: r.price, chg: r.chg })).slice(0, 18);
                setOutcome({ summary, signals, market, strategy, period });
                const game = { id: Date.now(), market: market.name, flag: market.flag, strategy: strategy.name, icon: strategy.icon, period: period.label, ret: summary.ret, benchRet: summary.benchRet, stars: summary.stars, currency: market.currency };
                setGames(prev => { const next = [game, ...prev].slice(0, 30); saveGames(next); return next; });
                setTimeout(() => { var _a, _b; return (_b = (_a = resultRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView) === null || _b === void 0 ? void 0 : _b.call(_a, { behavior: 'smooth', block: 'start' }); }, 60);
            }
            catch (e) {
                if ((e === null || e === void 0 ? void 0 : e.name) === 'AbortError')
                    setError('Simulación cancelada.');
                else
                    setError((e === null || e === void 0 ? void 0 : e.message) || 'Algo salió mal. Inténtalo de nuevo.');
            }
            finally {
                setRunning(false);
                setProgress(null);
                abortRef.current = null;
            }
        };
        const tryAnother = () => { setOutcome(null); setStrategyId(null); setTimeout(() => { var _a, _b; return (_b = (_a = strategyRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView) === null || _b === void 0 ? void 0 : _b.call(_a, { behavior: 'smooth', block: 'start' }); }, 30); };
        const ranking = [...games].sort((a, b) => b.ret - a.ret).slice(0, 8);
        const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        const s = outcome === null || outcome === void 0 ? void 0 : outcome.summary, cur = outcome === null || outcome === void 0 ? void 0 : outcome.market.currency;
        return (React.createElement("div", { className: "simple-mode" },
            React.createElement("section", { className: "simple-hero" },
                React.createElement("h1", null, "\uD83C\uDFAE Simulador de estrategias"),
                React.createElement("p", null,
                    "Elige un mercado y una estrategia y descubre qu\u00E9 habr\u00EDa pasado con ",
                    React.createElement("b", null, "10.000"),
                    " invertidos. \u00BFLe ganar\u00E1s al mercado?")),
            React.createElement("section", { className: "simple-step", "aria-labelledby": "simple-step-1" },
                React.createElement("h2", { id: "simple-step-1" },
                    React.createElement("span", { className: "simple-step-n" }, "1"),
                    "Elige tu mercado"),
                React.createElement("div", { className: "simple-grid simple-grid-4" }, markets.map(m => (React.createElement("button", { type: "button", key: m.id, className: "simple-card", "aria-pressed": m.id === marketId, onClick: () => setMarketId(m.id), disabled: running },
                    React.createElement("span", { className: "simple-card-icon" }, m.flag),
                    React.createElement("strong", null, m.name),
                    React.createElement("span", null, m.blurb)))))),
            React.createElement("section", { className: "simple-step", "aria-labelledby": "simple-step-2", ref: strategyRef },
                React.createElement("h2", { id: "simple-step-2" },
                    React.createElement("span", { className: "simple-step-n" }, "2"),
                    "Elige tu estrategia"),
                React.createElement("div", { className: "simple-grid simple-grid-3" }, strategies.map(st => (React.createElement("button", { type: "button", key: st.id, className: "simple-card simple-card-strategy", "aria-pressed": st.id === strategyId, onClick: () => setStrategyId(st.id), disabled: running },
                    React.createElement("span", { className: "simple-card-icon" }, st.icon),
                    React.createElement("strong", null, st.name),
                    React.createElement("span", null, st.pitch),
                    React.createElement("em", { className: "simple-badge" }, st.level)))))),
            React.createElement("section", { className: "simple-step", "aria-labelledby": "simple-step-3" },
                React.createElement("h2", { id: "simple-step-3" },
                    React.createElement("span", { className: "simple-step-n" }, "3"),
                    "\u00A1A simular!"),
                React.createElement("div", { className: "simple-launch" },
                    React.createElement("div", { className: "simple-periods", role: "group", "aria-label": "Periodo" },
                        React.createElement("span", null, "Periodo:"),
                        periods.map(p => React.createElement("button", { type: "button", key: p.years, "aria-pressed": p.years === years, onClick: () => setYears(p.years), disabled: running }, p.label))),
                    !running && React.createElement("button", { type: "button", className: "simple-play", onClick: simulate, disabled: !ready }, strategy ? `▶  Simular con 10.000 ${market.currency}` : 'Elige una estrategia para empezar'),
                    running && React.createElement("div", { className: "simple-progress", role: "status", "aria-live": "polite" },
                        React.createElement("div", { className: "simple-progress-bar" },
                            React.createElement("span", { style: { width: ((progress === null || progress === void 0 ? void 0 : progress.pct) || 2) + '%' } })),
                        React.createElement("div", { className: "simple-progress-label" },
                            (progress === null || progress === void 0 ? void 0 : progress.label) || 'Preparando',
                            "\u2026 ",
                            (progress === null || progress === void 0 ? void 0 : progress.pct) ? Math.round(progress.pct) + ' %' : ''),
                        React.createElement("button", { type: "button", className: "simple-link", onClick: () => { var _a; return (_a = abortRef.current) === null || _a === void 0 ? void 0 : _a.abort(); } }, "Cancelar"))),
                error && React.createElement("div", { className: "simple-error", role: "alert" }, error)),
            s && React.createElement("section", { className: "simple-result", ref: resultRef, "aria-label": "Resultado de la simulaci\u00F3n" },
                React.createElement("div", { className: "simple-result-head" },
                    React.createElement("div", null,
                        React.createElement("div", { className: "simple-result-title" }, s.headline),
                        React.createElement("div", { className: "simple-result-sub" }, `${outcome.strategy.icon} ${outcome.strategy.name} · ${outcome.market.flag} ${outcome.market.name} · desde ${monthYear(s.start)}`)),
                    React.createElement(Stars, { n: s.stars })),
                React.createElement("div", { className: "simple-scores" },
                    React.createElement("div", { className: "simple-score main" },
                        React.createElement("span", null, "Tu estrategia"),
                        React.createElement("strong", null, money(s.final, cur)),
                        React.createElement("em", { className: s.ret >= 0 ? 'up' : 'down' }, pct(s.ret))),
                    React.createElement("div", { className: "simple-vs" }, "VS"),
                    React.createElement("div", { className: "simple-score" },
                        React.createElement("span", null, `Comprar el ${outcome.market.name} y esperar`),
                        React.createElement("strong", null, money(s.benchFinal, cur)),
                        React.createElement("em", { className: (s.benchRet || 0) >= 0 ? 'up' : 'down' }, pct(s.benchRet)))),
                React.createElement(SimpleChart, { summary: s, currency: cur, marketName: outcome.market.name }),
                React.createElement("div", { className: "simple-facts" },
                    React.createElement("div", null,
                        React.createElement("span", null, "Operaciones"),
                        React.createElement("strong", null, s.trades)),
                    React.createElement("div", null,
                        React.createElement("span", null, "Operaciones ganadoras"),
                        React.createElement("strong", null, s.winRate != null ? Math.round(s.winRate * 100) + ' %' : '—')),
                    React.createElement("div", null,
                        React.createElement("span", null, "Peor ca\u00EDda"),
                        React.createElement("strong", null, pct(-s.dd)),
                        React.createElement("small", null, s.benchDd != null ? `mercado ${pct(-s.benchDd)}` : ''))),
                React.createElement("div", { className: "simple-stars-help" },
                    React.createElement("span", null, "\u2B50 ganar dinero"),
                    React.createElement("span", null, "\u2B50 ganar al mercado"),
                    React.createElement("span", null, "\u2B50 sufrir menos ca\u00EDda que el mercado")),
                React.createElement("div", { className: "simple-signals" },
                    React.createElement("h3", null, `📡 Hoy esta estrategia elegiría (${outcome.signals.length})`),
                    outcome.signals.length
                        ? React.createElement("div", { className: "simple-chips" }, outcome.signals.map(x => React.createElement("span", { key: x.ticker, className: "simple-chip" },
                            React.createElement("b", null, x.ticker),
                            Number.isFinite(x.price) ? ` ${x.price.toFixed(2)}` : '')))
                        : React.createElement("p", null, "Hoy ninguna acci\u00F3n de este mercado cumple las condiciones: la estrategia esperar\u00EDa.")),
                React.createElement("button", { type: "button", className: "simple-link", "aria-expanded": howOpen, onClick: () => setHowOpen(v => !v) }, howOpen ? 'Ocultar cómo decide' : '¿Cómo decide esta estrategia?'),
                howOpen && React.createElement("div", { className: "simple-how" },
                    React.createElement("p", null,
                        React.createElement("b", null, "Compra cuando:"),
                        " ",
                        outcome.strategy.buy),
                    React.createElement("p", null,
                        React.createElement("b", null, "Vende cuando:"),
                        " ",
                        outcome.strategy.sell),
                    React.createElement("p", null, "Revisa el mercado cada semana, reparte el dinero entre hasta 10 acciones a la vez y descuenta comisiones.")),
                React.createElement("div", { className: "simple-actions" },
                    React.createElement("button", { type: "button", className: "simple-play small", onClick: tryAnother }, "\uD83D\uDD01 Probar otra estrategia"))),
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
                            React.createElement("th", null, "Mercado"),
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
            React.createElement("p", { className: "simple-disclaimer" }, "Simulaci\u00F3n con precios hist\u00F3ricos reales (Yahoo Finance). Rentabilidades pasadas no garantizan resultados futuros; no es una recomendaci\u00F3n de inversi\u00F3n.")));
    }
    window.StockScannerUI.SimpleMode = SimpleMode;
})();
