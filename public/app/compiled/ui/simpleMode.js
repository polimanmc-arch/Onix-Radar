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
    function SimpleChart({ summary, currency, holdLabel }) {
        const W = 640, H = 230, padL = 58, padR = 14, padT = 12, padB = 26;
        const a = summary.curve, b = summary.bench;
        const all = [summary.capital, ...a.map(p => p.value), ...b.map(p => p.value)];
        const lo = Math.min(...all) * 0.97, hi = Math.max(...all) * 1.03, rg = hi - lo || 1;
        const t0 = a[0].time, t1 = a[a.length - 1].time, tr = (t1 - t0) || 1;
        const x = t => padL + ((t - t0) / tr) * (W - padL - padR);
        const y = v => padT + (1 - (v - lo) / rg) * (H - padT - padB);
        const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + x(p.time).toFixed(1) + ',' + y(p.value).toFixed(1)).join(' ');
        const area = path(a) + ` L${x(t1).toFixed(1)},${(H - padB).toFixed(1)} L${x(t0).toFixed(1)},${(H - padB).toFixed(1)} Z`;
        const ticks = [summary.capital, ...[lo + rg * 0.1, hi - rg * 0.1].filter(v => Math.abs(v - summary.capital) > rg * 0.12)];
        return (React.createElement("figure", { className: "simple-chart" },
            React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Evolución de 10.000 ${currency}: estrategia frente a comprar ${holdLabel}` },
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
                    `Comprar ${holdLabel} y esperar`))));
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
    // Gráfico de velas semanales del valor seleccionado en el escáner (mismo motor que el inspector experto).
    function SimpleCandles({ ticker, data, strategy, row, currency }) {
        const host = useRef(null);
        const [ok, setOk] = useState(true);
        useEffect(() => {
            var _a;
            const renderer = (_a = window.StockScannerUI) === null || _a === void 0 ? void 0 : _a.ChartRenderer;
            if (!host.current || !(data === null || data === void 0 ? void 0 : data.ok) || !window.LightweightCharts || !renderer) {
                setOk(false);
                return;
            }
            let chart = null, ro = null;
            try {
                const times = [...data.times].reverse();
                const candles = times.map((time, i) => {
                    var _a, _b;
                    const k = times.length - 1 - i;
                    return { time, open: (_b = (_a = data.opens) === null || _a === void 0 ? void 0 : _a[k]) !== null && _b !== void 0 ? _b : data.closes[k], high: data.highs[k], low: data.lows[k], close: data.closes[k] };
                });
                chart = renderer.buildPriceChart(host.current, data, times, candles, {
                    activeFilters: strategy.entry, activeEntryRules: [], activeExitRules: [], chartTf: '1wk', backtestTrades: [],
                    showExitInfo: false, showVolume: true, showIndicators: true, setCrossInfo: () => { }, priceHeight: host.current.clientHeight || 340,
                });
                if (times.length > 104)
                    chart.timeScale().setVisibleLogicalRange({ from: times.length - 104, to: times.length + 2 });
                ro = new ResizeObserver(() => host.current && chart.applyOptions({ width: host.current.clientWidth, height: host.current.clientHeight || 340 }));
                ro.observe(host.current);
                setOk(true);
            }
            catch (e) {
                console.warn('Onix modo simple:', e);
                setOk(false);
            }
            return () => { ro === null || ro === void 0 ? void 0 : ro.disconnect(); renderer.disposeChart(chart); };
        }, [ticker, data, strategy]);
        const lines = (strategy.entry || []).flatMap(f => [f, f.cmpType === 'ind' ? { ind: f.cmpInd, params: f.cmpParams } : null])
            .filter(f => f && ['WMA', 'SMA', 'EMA'].includes(f.ind)).map(f => `${f.ind}(${f.params.p})`);
        return (React.createElement("figure", { className: "simple-candles" },
            React.createElement("figcaption", { className: "simple-candles-head" },
                React.createElement("div", null,
                    React.createElement("strong", null, ticker),
                    row && React.createElement("span", null, `${num(row.price)} ${currency}`),
                    row && React.createElement("em", { className: row.chg >= 0 ? 'up' : 'down' }, pct(row.chg))),
                React.createElement("small", null, `Velas semanales · últimos 2 años${lines.length ? ' · ' + [...new Set(lines)].join(', ') : ''}`)),
            React.createElement("div", { ref: host, className: "simple-candles-chart", role: "img", "aria-label": `Gráfico de velas semanales de ${ticker}` }),
            !ok && React.createElement("p", { className: "simple-note" }, "No hay gr\u00E1fico disponible para este valor.")));
    }
    // Gráfico de dona con leyenda: reparto del dinero por acción o por sector.
    const DONUT_COLORS = ['#5b8cff', '#2ec4a6', '#f5a623', '#e8577c', '#9b6dff', '#3fb8e6', '#8bc34a', '#ff7a45', '#d4b106', '#c06fd6', '#4dd0a0', '#ef6461'];
    function Donut({ items, title, center, currency }) {
        const R = 70, SW = 26, CIRC = 2 * Math.PI * R;
        const total = items.reduce((t, i) => t + i.weight, 0) || 1;
        let acc = 0;
        const slices = items.map((it, i) => { const frac = it.weight / total, sl = { ...it, frac, off: acc, color: it.color || DONUT_COLORS[i % DONUT_COLORS.length] }; acc += frac; return sl; });
        return (React.createElement("figure", { className: "simple-donut" },
            React.createElement("div", { className: "simple-donut-body" },
                React.createElement("svg", { viewBox: "0 0 200 200", role: "img", "aria-label": `${title}: ` + slices.map(sl => `${sl.label} ${pct(sl.weight, 1, false)}`).join(', ') },
                    React.createElement("circle", { cx: "100", cy: "100", r: R, fill: "none", stroke: "var(--bg-3)", strokeWidth: SW }),
                    slices.map(sl => React.createElement("circle", { key: sl.key, cx: "100", cy: "100", r: R, fill: "none", stroke: sl.color, strokeWidth: SW, strokeDasharray: `${Math.max(0, sl.frac * CIRC - (slices.length > 1 ? 1.5 : 0))} ${CIRC}`, strokeDashoffset: -sl.off * CIRC, transform: "rotate(-90 100 100)" },
                        React.createElement("title", null, `${sl.label}: ${pct(sl.weight, 1, false)}`))),
                    React.createElement("text", { x: "100", y: "98", textAnchor: "middle", fontSize: "30", fontWeight: "800", fill: "var(--text-0)" }, center.value),
                    React.createElement("text", { x: "100", y: "120", textAnchor: "middle", fontSize: "13", fill: "var(--text-2)" }, center.label)),
                React.createElement("ul", { className: "simple-donut-legend" }, slices.map(sl => (React.createElement("li", { key: sl.key },
                    React.createElement("i", { style: { background: sl.color } }),
                    React.createElement("span", null,
                        React.createElement("b", null, sl.label),
                        sl.sub && React.createElement("small", null, sl.sub)),
                    React.createElement("strong", null,
                        pct(sl.weight, 1, false),
                        currency && React.createElement("small", null, money(sl.weight * 10000, currency))))))))));
    }
    const STAGES = [{ id: 'scan', label: 'Escáner' }, { id: 'portfolio', label: 'Portafolio Markowitz' }, { id: 'backtest', label: 'Backtest' }];
    function SimpleMode() {
        var _a, _b, _c;
        const C = core();
        const markets = C.SIMPLE_MARKETS, groups = C.SIMPLE_MARKET_GROUPS, strategies = C.SIMPLE_STRATEGIES, periods = C.SIMPLE_PERIODS;
        const [marketId, setMarketId] = useState('DOW30');
        const [strategyId, setStrategyId] = useState('base');
        const [tipOpen, setTipOpen] = useState(null);
        const [selTicker, setSelTicker] = useState(null);
        const [weightView, setWeightView] = useState('stock');
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
        const group = groups.find(g => g.id === (market === null || market === void 0 ? void 0 : market.group)) || groups[0];
        const countOf = m => C.simpleUniverseReady(m) ? C.simpleUniverseTickers(m).length.toLocaleString('es-ES') : '≈' + (m.approx || 0).toLocaleString('es-ES');
        const strategy = strategies.find(s => s.id === strategyId);
        const period = periods.find(p => p.years === years) || periods[periods.length - 1];
        const running = stage !== 'idle' && stage !== 'done';
        const ready = market && strategy && !running;
        const execute = async () => {
            if (!ready)
                return;
            const ac = new AbortController();
            abortRef.current = ac;
            const cfg = { market, strategy, period };
            setError(null);
            setRun({ ...cfg });
            setSelTicker(null);
            setTimeout(() => { var _a, _b; return (_b = (_a = sectionRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView) === null || _b === void 0 ? void 0 : _b.call(_a, { behavior: 'smooth', block: 'start' }); }, 60);
            try {
                // 1. Escáner
                setStage('scan');
                setProgress('Descargando precios semanales');
                if (!C.simpleUniverseReady(market))
                    setProgress('Descargando la lista de todas las acciones del mercado');
                const tickers = await C.resolveSimpleUniverse(market);
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
                    const game = { id: Date.now(), market: market.name, flag: market.icon, strategy: strategy.name, icon: strategy.icon, period: period.label, ret: summary.ret, benchRet: summary.benchRet, stars: summary.stars };
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
            if (run === null || run === void 0 ? void 0 : run[id + 'Error'])
                return 'error';
            if (stage === 'done' || stage === 'idle')
                return (run === null || run === void 0 ? void 0 : run[id]) ? 'done' : 'todo';
            return order.indexOf(id) < cur ? 'done' : order.indexOf(id) === cur ? 'active' : 'todo';
        };
        const ranking = [...games].sort((a, b) => b.ret - a.ret).slice(0, 8);
        const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        const cur = (_a = run === null || run === void 0 ? void 0 : run.market) === null || _a === void 0 ? void 0 : _a.currency;
        const scan = run === null || run === void 0 ? void 0 : run.scan, pf = run === null || run === void 0 ? void 0 : run.portfolio, bt = run === null || run === void 0 ? void 0 : run.backtest;
        const inPortfolio = new Set(((pf === null || pf === void 0 ? void 0 : pf.allocations) || []).map(a => a.ticker));
        const selected = (scan === null || scan === void 0 ? void 0 : scan.passing.some(r => r.ticker === selTicker)) ? selTicker : (_b = scan === null || scan === void 0 ? void 0 : scan.passing[0]) === null || _b === void 0 ? void 0 : _b.ticker;
        const goTo = id => { var _a, _b; return (_b = (_a = document.getElementById(id)) === null || _a === void 0 ? void 0 : _a.scrollIntoView) === null || _b === void 0 ? void 0 : _b.call(_a, { behavior: 'smooth', block: 'start' }); };
        const done = id => stageState(id) === 'done';
        const path = [
            { id: 'market', n: 1, label: 'Mercado', state: market ? 'done' : 'todo', detail: market && `${market.icon} ${market.name}`, target: 'simple-step-market' },
            { id: 'strategy', n: 2, label: 'Estrategia', state: strategy ? 'done' : 'todo', detail: strategy && `${strategy.icon} ${strategy.name}`, target: 'simple-step-strategy' },
            { id: 'scan', n: 3, label: 'Escáner', state: stageState('scan'), detail: scan && `${scan.passing.length} de ${scan.analyzed} cumplen`, target: scan && 'simple-panel-scan' },
            { id: 'portfolio', n: 4, label: 'Portafolio Markowitz', state: stageState('portfolio'), detail: pf ? `${pf.allocations.length} acciones` : (run === null || run === void 0 ? void 0 : run.portfolioError) && 'Sin portafolio', target: (pf || (run === null || run === void 0 ? void 0 : run.portfolioError)) && 'simple-panel-portfolio' },
            { id: 'backtest', n: 5, label: 'Backtest', state: stageState('backtest'), detail: bt ? `${pct(bt.summary.ret)} · ${'★'.repeat(bt.summary.stars) || 'sin estrellas'}` : (run === null || run === void 0 ? void 0 : run.backtestError) && 'Sin resultado', target: (bt || (run === null || run === void 0 ? void 0 : run.backtestError)) && 'simple-panel-backtest' },
        ];
        const fmtCol = (v, fmt) => fmt === 'pct' ? pct(v) : fmt === 'num' ? num(v, 1) : (v !== null && v !== void 0 ? v : '—');
        return (React.createElement("div", { className: "simple-mode" },
            React.createElement("section", { className: "simple-hero" },
                React.createElement("h1", null, "Radar Onix \u00B7 Simulador de inversi\u00F3n"),
                React.createElement("p", null, "Del esc\u00E1ner al portafolio: elige un mercado y una estrategia y sigue el proceso completo con datos reales.")),
            React.createElement("ol", { className: "simple-pipeline simple-path", "aria-label": "Camino del an\u00E1lisis" }, path.map(s => (React.createElement("li", { key: s.id, "data-state": s.state },
                React.createElement("button", { type: "button", onClick: () => goTo(s.target), disabled: !s.target, "aria-label": `Paso ${s.n}: ${s.label}` },
                    React.createElement("span", { className: "dot" }, s.n),
                    React.createElement("span", null,
                        React.createElement("b", null, s.label),
                        s.state === 'active'
                            ? React.createElement("small", { role: "status" }, progress || 'Trabajando…')
                            : s.detail && React.createElement("small", null, s.detail))))))),
            React.createElement("div", { className: "simple-setup" },
                React.createElement("section", { className: "simple-step", "aria-labelledby": "simple-step-market" },
                    React.createElement("h2", { id: "simple-step-market" },
                        React.createElement("span", { className: 'simple-step-n' + (market ? ' done' : '') }, "1"),
                        "Mercado"),
                    React.createElement("div", { className: "simple-grid simple-grid-groups" }, groups.map(g => (React.createElement("button", { type: "button", key: g.id, className: "simple-card compact", "aria-pressed": g.id === group.id, disabled: running, onClick: () => { if (g.id !== group.id)
                            setMarketId(g.options[0].id); } },
                        React.createElement("span", { className: "simple-card-icon" }, g.icon),
                        React.createElement("strong", null, g.name),
                        React.createElement("span", null, g.blurb))))),
                    React.createElement("div", { className: "simple-options", role: "group", "aria-label": `Universo de ${group.name}` }, group.options.map(o => (React.createElement("button", { type: "button", key: o.id, "aria-pressed": o.id === marketId, disabled: running, onClick: () => setMarketId(o.id), title: o.heavy ? 'Más de 1.000 activos: la primera carga puede tardar 1-2 minutos' : undefined },
                        o.name,
                        React.createElement("small", null, countOf(o)))))),
                    React.createElement("p", { className: "simple-note" }, `Universo: ${countOf(market)} activos · comparado con comprar ${market.holdLabel}${market.heavy ? ' · la primera carga puede tardar 1-2 minutos' : ''}${market.note ? ' · ' + market.note : ''}`)),
                React.createElement("section", { className: "simple-step", "aria-labelledby": "simple-step-strategy" },
                    React.createElement("h2", { id: "simple-step-strategy" },
                        React.createElement("span", { className: 'simple-step-n' + (strategy ? ' done' : '') }, "2"),
                        "Estrategia"),
                    React.createElement("div", { className: "simple-grid simple-grid-3" }, strategies.map(st => (React.createElement("div", { key: st.id, className: "simple-card-wrap" },
                        React.createElement("button", { type: "button", className: "simple-card simple-card-strategy", "aria-pressed": st.id === strategyId, onClick: () => setStrategyId(st.id), disabled: running },
                            React.createElement("span", { className: "simple-card-icon" }, st.icon),
                            React.createElement("strong", null, st.name),
                            React.createElement("span", null, st.pitch),
                            React.createElement("span", { className: "simple-ind-list", "aria-label": "Indicadores" },
                                st.indicators.map(i => React.createElement("i", { key: i.name }, i.name)),
                                React.createElement("i", { className: "tf" }, "Velas semanales")),
                            React.createElement("em", { className: "simple-badge" }, st.isBase ? '★ Base · ' + st.level : st.level)),
                        React.createElement("div", { className: 'simple-tip' + (tipOpen === st.id ? ' open' : ''), onMouseLeave: () => setTipOpen(t => t === st.id ? null : t) },
                            React.createElement("button", { type: "button", className: "simple-tip-btn", "aria-label": `Ver el detalle de ${st.name}`, "aria-expanded": tipOpen === st.id, onClick: () => setTipOpen(t => t === st.id ? null : st.id) }, "i"),
                            React.createElement("div", { className: "simple-tip-pop", role: "tooltip" },
                                React.createElement("strong", null, `${st.icon} ${st.name}`),
                                React.createElement("div", { className: "simple-tip-sec simple-tip-plain" },
                                    React.createElement("p", null,
                                        React.createElement("b", null, "Compra:"),
                                        " ",
                                        st.buy),
                                    React.createElement("p", null,
                                        React.createElement("b", null, "Vende:"),
                                        " ",
                                        st.sell)),
                                React.createElement("div", { className: "simple-tip-sec" },
                                    React.createElement("b", null, "Compra cuando se cumplen todas:"),
                                    React.createElement("ul", null, st.rulesBuy.map(r => React.createElement("li", { key: r }, r)))),
                                React.createElement("div", { className: "simple-tip-sec" },
                                    React.createElement("b", null, "Vende cuando:"),
                                    React.createElement("ul", null, st.rulesSell.map(r => React.createElement("li", { key: r }, r)))),
                                React.createElement("div", { className: "simple-tip-sec" },
                                    React.createElement("b", null, "Indicadores (velas semanales):"),
                                    React.createElement("ul", null, st.indicators.map(i => React.createElement("li", { key: i.name },
                                        React.createElement("b", null,
                                            i.name,
                                            ":"),
                                        " ",
                                        i.what)))),
                                React.createElement("div", { className: "simple-tip-sec" },
                                    React.createElement("b", null, "C\u00F3mo se eval\u00FAa:"),
                                    React.createElement("ul", null, C.SIMPLE_PROCESS_METRICS.map(m => React.createElement("li", { key: m }, m))))))))))),
                React.createElement("div", { className: "simple-launch" },
                    React.createElement("div", { className: "simple-periods", role: "group", "aria-label": "Periodo del backtest" },
                        React.createElement("span", null, "Backtest:"),
                        periods.map(p => React.createElement("button", { type: "button", key: p.years, "aria-pressed": p.years === years, onClick: () => setYears(p.years), disabled: running }, p.label))),
                    !running && React.createElement("button", { type: "button", className: "simple-play", onClick: execute, disabled: !ready }, strategy ? '▶  Ejecutar análisis' : 'Elige una estrategia para empezar'),
                    running && React.createElement("button", { type: "button", className: "simple-link", onClick: () => { var _a; return (_a = abortRef.current) === null || _a === void 0 ? void 0 : _a.abort(); } }, "Cancelar")),
                error && React.createElement("div", { className: "simple-error", role: "alert" }, error)),
            run && React.createElement("div", { ref: sectionRef },
                scan && React.createElement("section", { id: "simple-panel-scan", className: "simple-panel", "aria-label": "Esc\u00E1ner" },
                    React.createElement("header", null,
                        React.createElement("span", { className: 'simple-panel-n' + (done('scan') ? ' done' : '') }, "3"),
                        React.createElement("div", null,
                            React.createElement("h2", null, "Esc\u00E1ner \u00B7 \u00BFqu\u00E9 acciones cumplen hoy la estrategia?"),
                            React.createElement("p", null, "Se revisan todas las acciones del mercado con la \u00FAltima vela semanal cerrada y se quedan las que cumplen las reglas de compra."),
                            React.createElement("p", { className: "simple-applied" },
                                React.createElement("b", null, `${run.strategy.icon} ${run.strategy.name}:`),
                                " ",
                                run.strategy.rulesBuy.join(' · ')))),
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
                    scan.passing.length ? React.createElement("div", { className: "simple-scan-grid" },
                        React.createElement("div", { className: "simple-table-wrap" },
                            React.createElement("table", { className: "simple-table simple-table-pick" },
                                React.createElement("thead", null,
                                    React.createElement("tr", null,
                                        React.createElement("th", null, "#"),
                                        React.createElement("th", null, "Acci\u00F3n"),
                                        React.createElement("th", null, "Precio"),
                                        React.createElement("th", null, "Semana"),
                                        run.strategy.columns.map(col => React.createElement("th", { key: col.label, title: col.hint }, col.label)),
                                        React.createElement("th", { title: "Rentabilidad por unidad de riesgo en el \u00FAltimo a\u00F1o" }, "Sharpe 1a"),
                                        React.createElement("th", null))),
                                React.createElement("tbody", null, scan.passing.slice(0, 12).map((r, i) => (React.createElement("tr", { key: r.ticker, tabIndex: 0, "aria-selected": r.ticker === selected, className: r.ticker === selected ? 'sel' : '', onClick: () => setSelTicker(r.ticker), onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelTicker(r.ticker);
                                    } } },
                                    React.createElement("td", null, i + 1),
                                    React.createElement("td", null,
                                        React.createElement("b", null, r.ticker)),
                                    React.createElement("td", null, num(r.price)),
                                    React.createElement("td", { className: r.chg >= 0 ? 'up' : 'down' }, pct(r.chg)),
                                    r.values.map((v, k) => React.createElement("td", { key: k }, fmtCol(v, run.strategy.columns[k].fmt))),
                                    React.createElement("td", null, num(r.sharpe1y)),
                                    React.createElement("td", null, inPortfolio.has(r.ticker) && React.createElement("span", { className: "simple-tag" }, "En cartera"))))))),
                            React.createElement("p", { className: "simple-note" }, `Haz clic en una fila para ver su gráfico.${scan.passing.length > 12 ? ` Y ${scan.passing.length - 12} acciones más.` : ''} Las ${Math.min(scan.passing.length, C.SIMPLE_CANDIDATES)} con mejor Sharpe del último año pasan al optimizador.`)),
                        selected && React.createElement(SimpleCandles, { ticker: selected, data: (_c = cacheRef.current[selected]) === null || _c === void 0 ? void 0 : _c['1wk'], strategy: run.strategy, currency: cur, row: scan.passing.find(r => r.ticker === selected) }))
                        : React.createElement("p", { className: "simple-note" }, "Hoy ninguna acci\u00F3n del mercado cumple las reglas: la estrategia esperar\u00EDa.")),
                run.portfolioError && React.createElement("section", { id: "simple-panel-portfolio", className: "simple-panel", "aria-label": "Portafolio" },
                    React.createElement("header", null,
                        React.createElement("span", { className: "simple-panel-n error" }, "4"),
                        React.createElement("div", null,
                            React.createElement("h2", null, "Portafolio de Markowitz"),
                            React.createElement("p", null, run.portfolioError)))),
                pf && React.createElement("section", { id: "simple-panel-portfolio", className: "simple-panel", "aria-label": "Portafolio de Markowitz" },
                    React.createElement("header", null,
                        React.createElement("span", { className: 'simple-panel-n' + (done('portfolio') ? ' done' : '') }, "4"),
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
                        React.createElement("div", { className: "simple-weights" },
                            React.createElement("div", { className: "simple-weights-head" },
                                React.createElement("h3", null, "Reparto del dinero"),
                                React.createElement("div", { className: "simple-switch", role: "group", "aria-label": "Ver el reparto" },
                                    React.createElement("button", { type: "button", "aria-pressed": weightView === 'stock', onClick: () => setWeightView('stock') }, "Por acci\u00F3n"),
                                    React.createElement("button", { type: "button", "aria-pressed": weightView === 'sector', onClick: () => setWeightView('sector') }, "Por sector"))),
                            weightView === 'stock'
                                ? React.createElement(Donut, { key: "stock", title: "Peso por acci\u00F3n", currency: cur, center: { value: String(pf.allocations.length), label: 'acciones' }, items: (() => {
                                        const items = pf.allocations.map(a => ({ key: a.ticker, label: a.ticker, sub: a.shortName && a.shortName !== a.ticker ? a.shortName : sectorEs(a.sector), weight: Math.abs(a.weight) }));
                                        const cash = 1 - items.reduce((t, i) => t + i.weight, 0);
                                        // Con pocas acciones, el límite de 25 % por acción deja parte en efectivo.
                                        if (cash > 0.01)
                                            items.push({ key: 'cash', label: 'Efectivo', sub: 'límite de 25 % por acción', weight: cash, color: 'var(--text-3)' });
                                        return items;
                                    })() })
                                : React.createElement(Donut, { key: "sector", title: "Peso por sector", currency: cur, center: { value: String((pf.sectors || []).length), label: 'sectores' }, items: (pf.sectors || []).map(sc => ({ key: sc.name, label: sectorEs(sc.name), sub: `${sc.count} acción${sc.count > 1 ? 'es' : ''}`, weight: sc.weight })) })))),
                run.backtestError && React.createElement("section", { id: "simple-panel-backtest", className: "simple-panel", "aria-label": "Backtest" },
                    React.createElement("header", null,
                        React.createElement("span", { className: "simple-panel-n error" }, "5"),
                        React.createElement("div", null,
                            React.createElement("h2", null, "Backtest"),
                            React.createElement("p", null, run.backtestError)))),
                bt && React.createElement("section", { id: "simple-panel-backtest", className: "simple-panel simple-result", "aria-label": "Resultado del backtest" },
                    React.createElement("header", null,
                        React.createElement("span", { className: 'simple-panel-n' + (done('backtest') ? ' done' : '') }, "5"),
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
                            React.createElement("span", null, `Comprar ${run.market.holdLabel} y esperar`),
                            React.createElement("strong", null, money(bt.summary.benchFinal, cur)),
                            React.createElement("em", { className: (bt.summary.benchRet || 0) >= 0 ? 'up' : 'down' }, pct(bt.summary.benchRet)))),
                    React.createElement(SimpleChart, { summary: bt.summary, currency: cur, holdLabel: run.market.holdLabel }),
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
