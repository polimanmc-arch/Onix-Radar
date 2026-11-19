// Modo simple: recorrido guiado por el proceso completo, pensado para presentar la app.
// Mercado + estrategia → 1. Escáner → 2. Portafolio de Markowitz → 3. Backtest.
// Reutiliza el escáner, el optimizador de portafolios y el backtest del modo experto.
window.StockScannerUI = window.StockScannerUI || {};
(function(){
  const { useState, useRef, useEffect, useMemo, memo } = React;
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

  function loadGames(){ try{ const v = JSON.parse(localStorage.getItem(GAMES_KEY) || '[]'); return Array.isArray(v) ? v : []; }catch{ return []; } }
  function saveGames(list){ try{ localStorage.setItem(GAMES_KEY, JSON.stringify(list.slice(0, 30))); }catch{} }

  // Partidas completas (escáner, Markowitz, backtest y velas de la tabla) en IndexedDB del navegador,
  // para volver a verlas en cualquier momento sin descargar nada.
  const SNAP_DB = 'onix_simple_snapshots', SNAP_STORE = 'games';
  function snapTx(mode, fn){
    return new Promise((resolve, reject) => {
      if(typeof indexedDB === 'undefined'){ reject(new Error('Sin almacenamiento')); return; }
      const open = indexedDB.open(SNAP_DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(SNAP_STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        try{
          const tx = db.transaction(SNAP_STORE, mode); const req = fn(tx.objectStore(SNAP_STORE));
          tx.oncomplete = () => { db.close(); resolve(req?.result); };
          tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
        }catch(e){ db.close(); reject(e); }
      };
    });
  }
  const saveSnapshot = (id, snap) => snapTx('readwrite', st => st.put(snap, id));
  const loadSnapshot = id => snapTx('readonly', st => st.get(id));
  const clearSnapshots = () => snapTx('readwrite', st => st.clear());
  const pruneSnapshots = keep => snapTx('readwrite', st => { const r = st.getAllKeys(); r.onsuccess = () => r.result.forEach(k => { if(!keep.includes(k)) st.delete(k); }); return r; });

  function brokerOrder(allocations, capital){
    const rows = (allocations || []).filter(a => a.price > 0).map(a => {
      const target = Math.abs(a.weight) * capital;
      return { ticker: a.ticker, name: a.shortName && a.shortName !== a.ticker ? a.shortName : '', price: a.price, target, shares: Math.floor(target / a.price) };
    });
    const spent = () => rows.reduce((t, r) => t + r.shares * r.price, 0);
    let budget = rows.reduce((t, r) => t + r.target, 0) - spent();
    for(let guard = 0; guard < 500; guard++){
      const pick = rows.filter(r => r.price <= budget + 1e-9).sort((a, b) => (b.target - b.shares * b.price) - (a.target - a.shares * a.price))[0];
      if(!pick || pick.target - pick.shares * pick.price <= 0) break;
      pick.shares += 1; budget -= pick.price;
    }
    rows.forEach(r => { r.amount = r.shares * r.price; });
    const invested = spent();
    return { rows, invested, cash: capital - invested };
  }

  // Recuadro para escribir el dinero a invertir (con puntos de miles).
  function CapitalInput({ value, onChange, cur, label = 'Dinero a invertir:' }){
    return <label className="simple-capital">
      <span>{label}</span>
      <input type="text" inputMode="numeric" aria-label={`Dinero a invertir en ${cur}`} placeholder="10.000"
        value={value ? value.toLocaleString('es-ES') : ''}
        onChange={e => { const v = Number(e.target.value.replace(/\D/g, '').slice(0, 12)); onChange(Number.isFinite(v) ? v : 0); }}/>
      <em>{cur}</em>
    </label>;
  }

  function Stars({ n, size = 26 }){
    return <span className="simple-stars" aria-label={`${n} de 3 estrellas`} style={{ fontSize: size }}>
      {[0, 1, 2].map(i => <span key={i} aria-hidden="true" className={i < n ? 'on' : 'off'}>★</span>)}
    </span>;
  }

  // Estrategia frente al índice.
  const SimpleChart = memo(function SimpleChart({ summary, currency, holdLabel }){
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
    return (
      <figure className="simple-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolución de ${money(summary.capital, currency)}: estrategia frente a comprar ${holdLabel}`}>
          {ticks.map(v => <g key={v}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeDasharray={v === summary.capital ? '4 4' : '0'} strokeWidth="1"/>
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-2)">{Math.round(v).toLocaleString('es-ES')}</text>
          </g>)}
          <path d={area} fill="var(--accent)" opacity="0.10"/>
          {b.length > 1 && <path d={path(b)} fill="none" stroke="var(--text-2)" strokeWidth="2" strokeDasharray="6 4"/>}
          <path d={path(a)} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round"/>
          <text x={padL} y={H - 6} fontSize="11" fill="var(--text-2)">{year(t0)}</text>
          <text x={W - padR} y={H - 6} fontSize="11" fill="var(--text-2)" textAnchor="end">{year(t1)}</text>
        </svg>
        <figcaption className="simple-legend">
          <span><i style={{ background: 'var(--accent)' }}/>Estrategia</span>
          <span><i className="dashed"/>{`Comprar ${holdLabel} y esperar`}</span>
        </figcaption>
      </figure>
    );
  });

  // Frontera eficiente: miles de combinaciones de pesos (riesgo, rentabilidad) y el portafolio elegido.
  const FrontierChart = memo(function FrontierChart({ portfolio }){
    // Como mucho ~900 puntos: el dibujo es igual y el SVG pesa mucho menos.
    const all = (portfolio.frontier || []).filter(p => Number.isFinite(p.vol) && Number.isFinite(p.ret));
    const step = Math.max(1, Math.ceil(all.length / 900));
    const pts = step > 1 ? all.filter((_, i) => i % step === 0) : all;
    const chosen = portfolio.chosenPoint, ew = portfolio.altEqualWeightPoint;
    if(pts.length < 5 || !chosen) return null;
    const W = 460, H = 280, padL = 46, padR = 12, padT = 12, padB = 36;
    const xs = [...pts.map(p => p.vol), chosen.vol], ys = [...pts.map(p => p.ret), chosen.ret];
    const x0 = Math.min(...xs) * 0.95, x1 = Math.max(...xs) * 1.05, y0 = Math.min(...ys), y1 = Math.max(...ys);
    const yr = (y1 - y0) || 1, ylo = y0 - yr * 0.08, yhi = y1 + yr * 0.08;
    const x = v => padL + (v - x0) / ((x1 - x0) || 1) * (W - padL - padR);
    const y = v => padT + (1 - (v - ylo) / ((yhi - ylo) || 1)) * (H - padT - padB);
    const sh = pts.map(p => p.sharpe).filter(Number.isFinite), smin = Math.min(...sh), smax = Math.max(...sh);
    const op = s => (Number.isFinite(s) && smax > smin ? 0.15 + 0.65 * (s - smin) / (smax - smin) : 0.3);
    const ticks = n => Array.from({ length: n }, (_, i) => i / (n - 1));
    return (
      <figure className="simple-frontier">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Frontera eficiente de Markowitz con el portafolio elegido">
          {ticks(4).map(f => { const v = ylo + (yhi - ylo) * f; return <g key={'y' + f}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1"/>
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--text-2)">{Math.round(v) + '%'}</text></g>; })}
          {ticks(4).map(f => { const v = x0 + (x1 - x0) * f; return <text key={'x' + f} x={x(v)} y={H - padB + 14} textAnchor="middle" fontSize="10" fill="var(--text-2)">{Math.round(v) + '%'}</text>; })}
          {pts.map((p, i) => <circle key={i} cx={x(p.vol)} cy={y(p.ret)} r="2.4" fill="var(--accent)" opacity={op(p.sharpe)}/>)}
          {ew && <g><circle cx={x(ew.vol)} cy={y(ew.ret)} r="6" fill="var(--bg-1)" stroke="var(--text-2)" strokeWidth="2"/></g>}
          <g><circle cx={x(chosen.vol)} cy={y(chosen.ret)} r="9" fill="#f5c542" stroke="var(--bg-1)" strokeWidth="2"/>
            <text x={x(chosen.vol)} y={y(chosen.ret) + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#1d1f29">★</text></g>
          <text x={(padL + W - padR) / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--text-2)">Riesgo (volatilidad anual)</text>
          <text x={12} y={(padT + H - padB) / 2} textAnchor="middle" fontSize="11" fill="var(--text-2)" transform={`rotate(-90 12 ${(padT + H - padB) / 2})`}>Rentabilidad esperada</text>
        </svg>
        <figcaption className="simple-legend">
          <span><i style={{ background: 'var(--accent)', opacity: .6 }}/>Combinaciones probadas</span>
          <span><b style={{ color: '#f5c542' }}>★</b> Máximo Sharpe (elegido)</span>
          {ew && <span><i className="ring"/>Mismo peso en todas</span>}
        </figcaption>
      </figure>
    );
  });

  // Gráfico de velas semanales del valor seleccionado en el escáner (mismo motor que el inspector experto).
  // Colores de los osciladores (distintos del amarillo de la media móvil).
  // Moneda por el sufijo del ticker (universos mixtos como "Todo el mercado"); si no, la del mercado.
  const SUFFIX_CCY = { CO: 'DKK', ST: 'SEK', OL: 'NOK', HE: '€', DE: '€', F: '€', PA: '€', MI: '€', AS: '€', MC: '€', BR: '€', LS: '€', VI: '€', IR: '€',
    L: 'p', SW: 'CHF', T: '¥', HK: 'HK$', TO: 'C$', V: 'C$', AX: 'A$', SA: 'R$', MX: 'MX$', KS: '₩', NS: '₹', BO: '₹' };
  const currencyOf = (ticker, fallback) => {
    if(/^\^|=/.test(ticker || '')) return fallback === '$' ? '' : fallback; // índices, divisas y futuros: sin símbolo
    const m = /\.([A-Z]{1,2})$/.exec(ticker || '');
    return (m && SUFFIX_CCY[m[1]]) || fallback;
  };
  const MA_COLORS = { WMA: 'var(--amber, #f80)', SMA: 'var(--accent, #09f)', EMA: 'var(--purple, #c6f)' };
  const OSC_COLORS = ['#4cc9f0', '#f472b6', '#a3e635'];
  const SimpleCandles = memo(function SimpleCandles({ ticker, data, strategy, row, currency }){
    const host = useRef(null);
    const oscRefs = useRef([]);
    const [ok, setOk] = useState(true);
    const oscFilters = useMemo(() => (strategy.entry || []).filter(f => ['RSI', 'STOCH'].includes(f.ind)), [strategy]);
    useEffect(() => {
      const renderer = window.StockScannerUI?.ChartRenderer;
      if(!host.current || !data?.ok || !window.LightweightCharts || !renderer){ setOk(false); return; }
      let chart = null, ro = null; const oscCharts = [];
      try{
        const times = [...data.times].reverse();
        const candles = times.map((time, i) => { const k = times.length - 1 - i;
          return { time, open: data.opens?.[k] ?? data.closes[k], high: data.highs[k], low: data.lows[k], close: data.closes[k] }; });
        chart = renderer.buildPriceChart(host.current, data, times, candles, {
          activeFilters: strategy.entry, activeEntryRules: [], activeExitRules: [], chartTf: '1wk', backtestTrades: [],
          showExitInfo: false, showVolume: true, showIndicators: true, quietLabels: true, setCrossInfo: () => {}, priceHeight: host.current.clientHeight || 300,
        });
        // Un solo panel con todos los osciladores (líneas finas), con el nivel de compra de cada uno y los de venta.
        const el = oscRefs.current[0];
        if(el && oscFilters.length){
          const exits = (strategy.exit || []).flat().filter(x => oscFilters.some(f => f.ind === x.ind && f.params.p === x.params.p) && x.cmpType === 'val');
          const oc = renderer.buildOscChart(el, chart, data, times, '1wk', { activeFilters: oscFilters, activeExitRules: [{ conditions: exits }], showExitInfo: true,
            oscHeight: el.clientHeight || 130, lineWidth: 1, lineColors: OSC_COLORS, quietLabels: true });
          if(oc) oscCharts.push(oc);
        }
        // Misma anchura de escala en todos los paneles para que las fechas queden alineadas; sólo el último muestra el eje de fechas.
        [chart, ...oscCharts].forEach((ch, i, arr) => ch.applyOptions({ rightPriceScale: { minimumWidth: 78 }, timeScale: { visible: i === arr.length - 1 } }));
        if(times.length > 104) chart.timeScale().setVisibleLogicalRange({ from: times.length - 104, to: times.length + 2 });
        ro = new ResizeObserver(() => {
          if(!host.current) return;
          const w = host.current.clientWidth;
          chart.applyOptions({ width: w, height: host.current.clientHeight || 300 });
          oscCharts.forEach(oc => oc.applyOptions({ width: w }));
        });
        ro.observe(host.current);
        setOk(true);
      }catch(e){ console.warn('Onix modo simple:', e); setOk(false); }
      return () => { ro?.disconnect(); oscCharts.forEach(oc => renderer.disposeChart(oc)); renderer.disposeChart(chart); };
    }, [ticker, data, strategy, oscFilters]);
    // Medias dibujadas sobre las velas (mismo orden y color que en el gráfico): las de la regla
    // en su color y las de comparación en gris discontinuo.
    const isMa = f => f && ['WMA', 'SMA', 'EMA'].includes(f.ind);
    const maLegend = [];
    const addMa = (f, cmp) => { const label = `${f.ind} ${f.params.p}`; if(!maLegend.some(m => m.label === label)) maLegend.push({ label, cmp, color: cmp ? 'var(--chart-muted-line, #6b7890)' : MA_COLORS[f.ind] }); };
    (strategy.entry || []).filter(isMa).forEach(f => addMa(f, false));
    (strategy.entry || []).filter(f => f.cmpType === 'ind').map(f => ({ ind: f.cmpInd, params: f.cmpParams })).filter(isMa).forEach(f => addMa(f, true));
    const lines = maLegend.map(m => m.label);
    return (
      <figure className="simple-candles">
        <figcaption className="simple-candles-head">
          <div><strong>{ticker}</strong>{row && <span>{`${num(row.price)} ${currencyOf(ticker, currency)}`.trim()}</span>}{row && <em className={row.chg >= 0 ? 'up' : 'down'}>{pct(row.chg)}</em>}</div>
          <small>Velas semanales · últimos 2 años</small>
        </figcaption>
        <div className="simple-candles-wrap">
          {maLegend.length > 0 && <span className="simple-osc-label simple-ma-label">{maLegend.map(m => <span key={m.label}><i className={m.cmp ? 'cmp' : ''} style={{ background: m.color }}/>{m.label}</span>)}</span>}
          <div ref={host} className="simple-candles-chart" role="img" aria-label={`Gráfico de velas semanales de ${ticker}${lines.length ? ' con ' + lines.join(' y ') : ''}`}/>
        </div>
        {oscFilters.length > 0 && <div className="simple-osc">
          <span className="simple-osc-label">{oscFilters.map((f, i) => <span key={f.ind + f.params.p}><i style={{ background: OSC_COLORS[i % OSC_COLORS.length] }}/>{f.ind === 'RSI' ? `RSI ${f.params.p}` : `Stoch ${f.params.p}`}</span>)}</span>
          <div ref={el => { oscRefs.current[0] = el; }} className="simple-osc-chart" role="img" aria-label={`${oscFilters.map(f => f.ind === 'RSI' ? 'RSI' : 'Estocástico').join(' y ')} de ${ticker}`}/>
        </div>}
        {!ok && <p className="simple-note">No hay gráfico disponible para este valor.</p>}
      </figure>
    );
  });

  // Gráfico de dona: reparto del dinero por acción o por sector. Cada color lleva su ticker o sector
  // encima; al pasar el ratón (o tocar) el centro muestra el nombre, el % y el dinero.
  const DONUT_COLORS = ['#5b8cff', '#2ec4a6', '#f5a623', '#e8577c', '#9b6dff', '#3fb8e6', '#8bc34a', '#ff7a45', '#d4b106', '#c06fd6', '#4dd0a0', '#ef6461'];
  const cut = (t, n) => (t && t.length > n ? t.slice(0, n - 1) + '…' : t || '');
  const Donut = memo(function Donut({ items, title, center, currency, capital = 10000 }){
    const [hover, setHover] = useState(null);
    const C0 = 160, R = 112, SW = 60, CIRC = 2 * Math.PI * R;
    const total = items.reduce((t, i) => t + i.weight, 0) || 1;
    let acc = 0;
    const slices = items.map((it, i) => { const frac = it.weight / total, sl = { ...it, frac, off: acc, color: it.color || DONUT_COLORS[i % DONUT_COLORS.length] }; acc += frac; return sl; });
    const hs = hover != null ? slices.find(sl => sl.key === hover) : null;
    return (
      <figure className="simple-donut big">
        <svg viewBox="0 0 320 320" role="img" aria-label={`${title}: ` + slices.map(sl => `${sl.label} ${pct(sl.weight, 1, false)}`).join(', ')}
          onMouseLeave={() => setHover(null)}>
          <circle cx={C0} cy={C0} r={R} fill="none" stroke="var(--bg-3)" strokeWidth={SW}/>
          {slices.map(sl => (
            <circle key={sl.key} cx={C0} cy={C0} r={R} fill="none" stroke={sl.color} strokeWidth={hover === sl.key ? SW + 10 : SW}
              strokeDasharray={`${Math.max(0, sl.frac * CIRC - (slices.length > 1 ? 2 : 0))} ${CIRC}`} strokeDashoffset={-sl.off * CIRC}
              transform={`rotate(-90 ${C0} ${C0})`} opacity={hover != null && hover !== sl.key ? 0.45 : 1} className="simple-donut-slice"
              tabIndex={0} onMouseEnter={() => setHover(sl.key)} onFocus={() => setHover(sl.key)} onBlur={() => setHover(null)}
              onClick={() => setHover(h => h === sl.key ? null : sl.key)}>
              <title>{`${sl.label}${sl.sub ? ' · ' + sl.sub : ''}: ${pct(sl.weight, 1, false)}${currency ? ' · ' + money(sl.weight * capital, currency) : ''}${sl.shares != null ? ` · comprar ${sl.shares} acciones` : ''}`}</title>
            </circle>))}
          {slices.filter(sl => sl.frac >= 0.035).map(sl => {
            const a = (sl.off + sl.frac / 2) * 2 * Math.PI - Math.PI / 2;
            const fs = sl.frac >= 0.15 ? 15 : sl.frac >= 0.07 ? 13 : 11;
            return <text key={sl.key} x={C0 + R * Math.cos(a)} y={C0 + R * Math.sin(a)} textAnchor="middle" dominantBaseline="central"
              fontSize={fs} fontWeight="800" className="simple-donut-tag" aria-hidden="true">{cut(sl.label, sl.frac >= 0.12 ? 14 : 9)}</text>;
          })}
          {hs ? <g aria-hidden="true">
            <text x={C0} y={C0 - 30} textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--text-0)">{cut(hs.label, 16)}</text>
            {hs.sub && <text x={C0} y={C0 - 10} textAnchor="middle" fontSize="11.5" fill="var(--text-2)">{cut(hs.sub, 26)}</text>}
            <text x={C0} y={C0 + 18} textAnchor="middle" fontSize="24" fontWeight="800" fill={hs.color}>{pct(hs.weight, 1, false)}</text>
            {currency && <text x={C0} y={C0 + 40} textAnchor="middle" fontSize="12.5" fill="var(--text-1)">{hs.shares != null
              ? `${hs.shares.toLocaleString('es-ES')} acci${hs.shares === 1 ? 'ón' : 'ones'} · ${money(hs.shares * hs.price, currency)}`
              : money(hs.weight * capital, currency)}</text>}
          </g> : <g aria-hidden="true">
            <text x={C0} y={C0 + 2} textAnchor="middle" fontSize="40" fontWeight="800" fill="var(--text-0)">{center.value}</text>
            <text x={C0} y={C0 + 26} textAnchor="middle" fontSize="14" fill="var(--text-2)">{center.label}</text>
            <text x={C0} y={C0 + 46} textAnchor="middle" fontSize="11" fill="var(--text-3)">pasa el ratón por un color</text>
          </g>}
        </svg>
      </figure>
    );
  });

  const STAGES = [ { id: 'scan', label: 'Escáner' }, { id: 'portfolio', label: 'Portafolio Markowitz' }, { id: 'backtest', label: 'Backtest' } ];

  function SimpleMode(){
    const C = core();
    const markets = C.SIMPLE_MARKETS, groups = C.SIMPLE_MARKET_GROUPS, strategies = C.SIMPLE_STRATEGIES, periods = C.SIMPLE_PERIODS;
    const [marketId, setMarketId] = useState('SP500');
    const [strategyId, setStrategyId] = useState(null); // nada elegido al entrar: se explica paso a paso
    const [tipOpen, setTipOpen] = useState(null);
    const [selTicker, setSelTicker] = useState(null);
    const [weightView, setWeightView] = useState('stock');
    const [years, setYears] = useState(3);
    const [stage, setStage] = useState('idle');
    const [progress, setProgress] = useState('');
    const [progressPct, setProgressPct] = useState(null);
    const [startedAt, setStartedAt] = useState(null);
    const [, setTick] = useState(0);
    const [run, setRun] = useState(null);
    const [error, setError] = useState(null);
    const [games, setGames] = useState(loadGames);
    const [capital, setCapital] = useState(10000); // dinero a invertir (paso 4), también el del backtest
    const [rankMsg, setRankMsg] = useState(null);
    const cacheRef = useRef({});
    const abortRef = useRef(null);
    useEffect(() => () => abortRef.current?.abort(), []);
    // Cronómetro visible mientras corre el análisis (para ver que sigue trabajando).
    useEffect(() => {
      if(!startedAt || typeof setInterval !== 'function') return undefined;
      const id = setInterval(() => setTick(t => t + 1), 1000);
      return () => clearInterval(id);
    }, [startedAt]);

    const market = markets.find(m => m.id === marketId);
    const group = groups.find(g => g.id === market?.group) || groups[0];
    const countOf = m => C.simpleUniverseReady(m) ? C.simpleUniverseTickers(m).length.toLocaleString('es-ES') : '≈' + (m.approx || 0).toLocaleString('es-ES');
    // Filtro del S&P 500: activado de serie en la estrategia base; se puede poner o quitar en cualquiera.
    const [mktFilter, setMktFilter] = useState({});
    const mktOnOf = st => !!st && (mktFilter[st.id] ?? !!st.marketDefault);
    const effOf = st => C.simpleWithMarketFilter(st, mktOnOf(st));
    const tagOf = st => st && mktOnOf(st) !== !!st.marketDefault ? (mktOnOf(st) ? ' + filtro S&P' : ' sin filtro S&P') : '';
    const baseStrategy = strategies.find(s => s.id === strategyId);
    const strategy = useMemo(() => effOf(baseStrategy), [baseStrategy, mktFilter]);
    const period = periods.find(p => p.years === years) || periods[periods.length - 1];

    const running = stage !== 'idle';
    const ready = market && strategy && !running;
    // Si cambian mercado, estrategia o filtro, los resultados anteriores ya no corresponden.
    useEffect(() => {
      if(run && !abortRef.current && (run.market?.id !== marketId || run.strategy?.id !== strategyId || !!run.mktOn !== mktOnOf(baseStrategy))){ setRun(null); setError(null); }
    }, [marketId, strategyId, mktFilter]);

    const n = x => Number(x).toLocaleString('es-ES');
    const scrollSoon = id => setTimeout(() => { if(typeof document !== 'undefined') document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, 80);
    // Cada paso (3, 4 y 5) se lanza con su propio botón, para poder explicarlo uno a uno.
    const runStep = async (id, fn) => {
      const ac = new AbortController(); abortRef.current = ac;
      setError(null); setStage(id); setStartedAt(Date.now()); setProgressPct(null);
      scrollSoon('simple-loading');
      try{ await fn(ac); scrollSoon('simple-panel-' + id); }
      catch(e){ setError(e?.name === 'AbortError' ? 'Paso cancelado.' : (e?.message || 'Algo salió mal. Inténtalo de nuevo.')); }
      finally{ abortRef.current = null; setStage('idle'); setProgress(''); setProgressPct(null); setStartedAt(null); }
    };

    // Paso 3: escáner
    const runScan = () => {
      if(!ready) return undefined;
      const cfg = { market, strategy, tag: tagOf(baseStrategy), mktOn: mktOnOf(baseStrategy) };
      setRun({ ...cfg }); setSelTicker(null);
      return runStep('scan', async ac => {
        setProgress('Preparando la descarga de precios');
        if(!C.simpleUniverseReady(market)) setProgress('Descargando la lista de todas las acciones del mercado');
        const tickers = await C.resolveSimpleUniverse(market);
        // También el S&P 500 si la estrategia usa el filtro de mercado.
        const toLoad = strategy.market ? [...new Set([...tickers, strategy.market.ticker])] : tickers;
        setProgress(`Descargando precios semanales de ${n(toLoad.length)} activos`); setProgressPct(0);
        await C.loadSimpleWeekly({ tickers: toLoad, cacheRef, signal: ac.signal, onProgress: (d, t) => { setProgress(`Descargando precios ${n(d)} de ${n(t)}`); setProgressPct(d / t * 100); } });
        setProgressPct(null);
        const scan = C.scanSimpleMarket({ tickers, dataByTicker: cacheRef.current, strategy });
        setRun(r => ({ ...r, scan: { ...scan, total: tickers.length } }));
      });
    };

    // Paso 4: portafolio de Markowitz con las mejores candidatas del escáner
    const runPortfolio = () => {
      if(!run?.scan || running) return undefined;
      if(!(capital > 0)) return undefined;
      const { strategy: st, scan: sc } = run;
      const cap = capital;
      return runStep('portfolio', async () => {
        setProgress('Probando 10.000 combinaciones de pesos');
        let portfolio = null, portfolioError = null;
        if(sc.passing.length >= 2){
          const fetchSectors = async list => { try{ const r = await fetch('/api/sectors?symbols=' + encodeURIComponent(list.join(','))); return r.ok ? r.json() : {}; }catch{ return {}; } };
          const out = await C.buildPortfolioWorkflow({ ...C.buildSimplePortfolioOptions({ strategy: st, candidates: sc.passing, cacheRef, fetchSectors, capital: cap }), setPortfolio: p => { portfolio = p; } });
          if(!out?.ok) portfolioError = out?.message || 'No se pudo construir el portafolio.';
        }else portfolioError = 'Hoy no hay suficientes acciones que cumplan la estrategia para construir un portafolio (hacen falta al menos 2).';
        setRun(r => ({ ...r, capital: cap, portfolio, portfolioError }));
      });
    };

    // Paso 5: backtest de la estrategia
    const runBacktest = () => {
      if(!run?.scan || running) return undefined;
      const cfg = { market: run.market, strategy: run.strategy, period, capital: run.capital || capital };
      return runStep('backtest', async ac => {
        setProgress('Preparando el backtest');
        let raw = null;
        const out = await C.runBacktestWorkflow({
          ...C.buildSimpleBacktestOptions(cfg), dataCacheRef: cacheRef, abortSignal: ac.signal,
          setBtRunning: () => {}, setTab: () => {}, setBacktest: r => { raw = r; },
          setBtProgress: p => {
            if(p?.stage === 'simulation'){ setProgress('Simulando semana a semana'); setProgressPct(p.phasePct || 0); }
            else if(p?.stage === 'data' && p.total > 1){ setProgress(`Preparando los datos ${n(p.done)} de ${n(p.total)}`); setProgressPct(p.done / p.total * 100); }
          },
        });
        const summary = raw && C.summarizeSimpleResult(raw, { capital: cfg.capital });
        const backtest = summary ? { summary, annReturn: raw.annReturn, sharpe: raw.sharpe, commissions: raw.totalCommissionPaid } : null;
        setRun(r => ({ ...r, period, backtest, backtestError: backtest ? null : (out?.message || 'No hubo datos suficientes para el backtest.') }));
        if(summary){
          const game = { id: Date.now(), market: cfg.market.name, flag: cfg.market.icon, strategy: cfg.strategy.name + (run.tag || ''), icon: cfg.strategy.icon, period: period.label, capital: cfg.capital, ret: summary.ret, benchRet: summary.benchRet, stars: summary.stars, saved: false };
          // Foto completa de la partida: resultados + velas de las acciones de la tabla.
          try{
            const prices = {};
            run.scan.passing.slice(0, 12).forEach(r => { const d = cacheRef.current[r.ticker]?.['1wk'];
              if(d?.ok) prices[r.ticker] = { ticker: r.ticker, tf: '1wk', ok: true, opens: d.opens, highs: d.highs, lows: d.lows, closes: d.closes, volumes: d.volumes, times: d.times, price: d.price, prevClose: d.prevClose }; });
            const pfSnap = run.portfolio ? { ...run.portfolio, correlationMatrix: null, equityCurve: null,
              frontier: (run.portfolio.frontier || []).filter((_, i, a) => i % Math.max(1, Math.ceil(a.length / 900)) === 0) } : null;
            const snap = JSON.parse(JSON.stringify({ v: 1, savedAt: game.id, marketId: cfg.market.id, strategyId: cfg.strategy.id, mktOn: !!run.mktOn, tag: run.tag || '',
              period, capital: cfg.capital, scan: run.scan, portfolio: pfSnap, portfolioError: run.portfolioError || null, backtest, prices }));
            await saveSnapshot(game.id, snap); game.saved = true;
          }catch(e){ console.warn('Onix modo simple: no se pudo guardar la partida completa', e); }
          setGames(prev => { const next = [game, ...prev].slice(0, 30); saveGames(next); pruneSnapshots(next.map(g => g.id)).catch(() => {}); return next; });
          setRun(r => ({ ...r, gameId: game.id }));
        }
      });
    };

    const openGame = async g => {
      if(running) return;
      let snap = null;
      try{ snap = await loadSnapshot(g.id); }catch{}
      const mk = snap && markets.find(m => m.id === snap.marketId), base = snap && strategies.find(x => x.id === snap.strategyId);
      if(!snap || !mk || !base){ setRankMsg('Esta partida no tiene los detalles guardados (es anterior a esta opción o se borraron los datos del navegador).'); return; }
      setRankMsg(null); setError(null); setSelTicker(null);
      setMarketId(mk.id); setStrategyId(base.id); setMktFilter(m => ({ ...m, [base.id]: snap.mktOn }));
      if(snap.period?.years) setYears(snap.period.years);
      if(snap.capital) setCapital(snap.capital);
      setRun({ market: mk, strategy: C.simpleWithMarketFilter(base, snap.mktOn), tag: snap.tag, mktOn: snap.mktOn, period: snap.period, capital: snap.capital,
        scan: snap.scan, portfolio: snap.portfolio, portfolioError: snap.portfolioError, backtest: snap.backtest, backtestError: null,
        prices: snap.prices, savedAt: snap.savedAt, gameId: g.id });
      scrollSoon('simple-panel-scan');
    };

    const stageState = id => run?.[id + 'Error'] ? 'error' : run?.[id] ? 'done' : stage === id ? 'active' : 'todo';
    const ranking = [...games].sort((a, b) => b.ret - a.ret).slice(0, 10);
    const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    const cur = run?.market?.currency;
    const scan = run?.scan, pf = run?.portfolio, bt = run?.backtest;
    const inPortfolio = new Set((pf?.allocations || []).map(a => a.ticker));
    const selected = scan?.passing.some(r => r.ticker === selTicker) ? selTicker : scan?.passing[0]?.ticker;
    const order = useMemo(() => (pf ? brokerOrder(pf.allocations, run?.capital || 10000) : null), [pf, run?.capital]);
    const stockItems = useMemo(() => {
      if(!pf) return [];
      const sharesOf = Object.fromEntries((order?.rows || []).map(r => [r.ticker, r]));
      const items = pf.allocations.map(a => ({ key: a.ticker, label: a.ticker, sub: a.shortName && a.shortName !== a.ticker ? a.shortName : sectorEs(a.sector), weight: Math.abs(a.weight),
        shares: sharesOf[a.ticker]?.shares, price: sharesOf[a.ticker]?.price }));
      const cash = 1 - items.reduce((t, i) => t + i.weight, 0);
      // Con pocas acciones, el límite de 25 % por acción deja parte en efectivo.
      if(cash > 0.01) items.push({ key: 'cash', label: 'Efectivo', sub: 'límite de 25 % por acción', weight: cash, color: 'var(--text-3)' });
      return items;
    }, [pf, order]);
    const sectorItems = useMemo(() => (pf?.sectors || []).map(sc => ({ key: sc.name, label: sectorEs(sc.name), sub: `${sc.count} acción${sc.count > 1 ? 'es' : ''}`, weight: sc.weight })), [pf]);
    const stockCenter = useMemo(() => ({ value: String(pf?.allocations.length || 0), label: 'acciones' }), [pf]);
    const sectorCenter = useMemo(() => ({ value: String((pf?.sectors || []).length), label: 'sectores' }), [pf]);
    const goTo = id => document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    const done = id => stageState(id) === 'done';
    const path = [
      { id: 'market', n: 1, label: 'Mercado', state: market ? 'done' : 'todo', detail: market && `${market.icon} ${market.name}`, target: 'simple-step-market' },
      { id: 'strategy', n: 2, label: 'Estrategia', state: strategy ? 'done' : 'todo', detail: strategy && `${strategy.icon} ${strategy.name}${tagOf(baseStrategy)}`, target: 'simple-step-strategy' },
      { id: 'scan', n: 3, label: 'Escáner', state: stageState('scan'), detail: scan && `${scan.passing.length} de ${scan.analyzed} cumplen`, target: scan && 'simple-panel-scan' },
      { id: 'portfolio', n: 4, label: 'Portafolio Markowitz', state: stageState('portfolio'), detail: pf ? `${pf.allocations.length} acciones` : run?.portfolioError && 'Sin portafolio', target: (pf || run?.portfolioError) && 'simple-panel-portfolio' },
      { id: 'backtest', n: 5, label: 'Backtest', state: stageState('backtest'), detail: bt ? `${pct(bt.summary.ret)} · ${'★'.repeat(bt.summary.stars) || 'sin estrellas'}` : run?.backtestError && 'Sin resultado', target: (bt || run?.backtestError) && 'simple-panel-backtest' },
    ];
    const fmtCol = (v, fmt) => fmt === 'pct' ? pct(v) : fmt === 'num' ? num(v, 1) : (v ?? '—');

    return (
      <div className="simple-mode">
        <section className="simple-hero">
          <h1>Radar Onix · Simulador de inversión</h1>
          <p>Del escáner al portafolio: elige un mercado y una estrategia y sigue el proceso completo con datos reales.</p>
        </section>

        <ol className="simple-pipeline simple-path" aria-label="Camino del análisis">
          {path.map(s => (
            <li key={s.id} data-state={s.state}>
              <button type="button" onClick={() => goTo(s.target)} disabled={!s.target} aria-label={`Paso ${s.n}: ${s.label}`}>
                <span className="dot">{s.n}</span>
                <span><b>{s.label}</b>{s.state === 'active'
                  ? <small role="status">{progress || 'Trabajando…'}</small>
                  : s.detail && <small>{s.detail}</small>}</span>
                {s.state === 'active' && <i className={'simple-path-bar' + (progressPct == null ? ' indeterminate' : '')} aria-hidden="true"><i style={progressPct == null ? undefined : { width: Math.max(3, progressPct) + '%' }}/></i>}
              </button>
            </li>))}
        </ol>

        <div className="simple-setup">
          <section className="simple-step" aria-labelledby="simple-step-market">
            <h2 id="simple-step-market"><span className={'simple-step-n' + (market ? ' done' : '')}>1</span>Mercado</h2>
            <div className="simple-grid simple-grid-groups">
              {groups.map(g => (
                <button type="button" key={g.id} className="simple-card compact" aria-pressed={g.id === group.id} disabled={running}
                  onClick={() => { if(g.id !== group.id) setMarketId(g.options[0].id); }}>
                  <span className="simple-card-icon">{g.icon}</span><strong>{g.name}</strong><span>{g.blurb}</span>
                </button>
              ))}
            </div>
            <div className="simple-options" role="group" aria-label={`Universo de ${group.name}`}>
              {group.options.map(o => (
                <button type="button" key={o.id} aria-pressed={o.id === marketId} disabled={running} onClick={() => setMarketId(o.id)}
                  title={o.heavy ? 'Más de 1.000 activos: la primera carga puede tardar 1-2 minutos' : undefined}>
                  {o.name}<small>{countOf(o)}</small>
                </button>
              ))}
            </div>
            <p className="simple-note">{`Universo: ${countOf(market)} activos · comparado con comprar ${market.holdLabel}${market.heavy ? ' · la primera carga puede tardar 1-2 minutos' : ''}${market.note ? ' · ' + market.note : ''}`}</p>
          </section>
          <section className="simple-step" aria-labelledby="simple-step-strategy">
            <h2 id="simple-step-strategy"><span className={'simple-step-n' + (strategy ? ' done' : '')}>2</span>Estrategia</h2>
            <div className="simple-grid simple-grid-3">
              {strategies.map(effOf).map(st => (
                <div key={st.id} className="simple-card-wrap">
                  <button type="button" className="simple-card simple-card-strategy" aria-pressed={st.id === strategyId} onClick={() => setStrategyId(st.id)} disabled={running}>
                    <span className="simple-card-icon">{st.icon}</span><strong>{st.name}</strong><span>{st.pitch}</span>
                    <span className="simple-ind-list" aria-label="Indicadores">{st.indicators.map(i => <i key={i.name}>{i.name}</i>)}<i className="tf">Velas semanales</i></span>
                    <em className="simple-badge">{st.isBase ? '★ Base · ' + st.level : st.level}</em>
                  </button>
                  <div className={'simple-tip' + (tipOpen === st.id ? ' open' : '')} onMouseLeave={() => setTipOpen(t => t === st.id ? null : t)}>
                    <button type="button" className="simple-tip-btn" aria-label={`Ver el detalle de ${st.name}`} aria-expanded={tipOpen === st.id}
                      onClick={() => setTipOpen(t => t === st.id ? null : st.id)}>i</button>
                    <div className="simple-tip-pop" role="tooltip">
                      <strong>{`${st.icon} ${st.name}`}</strong>
                      <div className="simple-tip-sec simple-tip-plain"><p><b>Compra:</b> {st.buy}</p><p><b>Vende:</b> {st.sell}</p></div>
                      <div className="simple-tip-sec"><b>Compra cuando se cumplen todas:</b><ul>{st.rulesBuy.map(r => <li key={r}>{r}</li>)}</ul></div>
                      <div className="simple-tip-sec"><b>Vende cuando:</b><ul>{st.rulesSell.map(r => <li key={r}>{r}</li>)}</ul></div>
                      <div className="simple-tip-sec"><b>Indicadores (velas semanales):</b><ul>{st.indicators.map(i => <li key={i.name}><b>{i.name}:</b> {i.what}</li>)}</ul></div>
                      <div className="simple-tip-sec"><b>Cómo se evalúa:</b><ul>{C.SIMPLE_PROCESS_METRICS.map(m => <li key={m}>{m}</li>)}</ul></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="simple-launch">
            {strategy && <div className="simple-periods simple-mkt-toggle" role="group" aria-label="Filtro de mercado del S&P 500"
              title="Si está activado, la estrategia sólo compra cuando la WMA(30) semanal del S&P 500 sube; si baja, vende todo y espera.">
              <span>Filtro S&P 500:</span>
              {[true, false].map(on => <button type="button" key={String(on)} aria-pressed={mktOnOf(baseStrategy) === on} disabled={running}
                onClick={() => setMktFilter(m => ({ ...m, [baseStrategy.id]: on }))}>{on ? 'Activado' : 'Quitado'}</button>)}
            </div>}
            <button type="button" className="simple-play" onClick={runScan} disabled={!ready}>
              {!strategy ? 'Elige una estrategia para empezar' : run?.scan ? '↻  Paso 3 · Volver a escanear' : '▶  Paso 3 · Ejecutar el escáner'}
            </button>
          </div>
          {error && !run && <div className="simple-error" role="alert">{error}</div>}
        </div>

        {run && <div>
          {run.savedAt && <div className="simple-saved" role="status">
            <span aria-hidden="true">📂</span>
            <div><b>{`Partida guardada · ${new Date(run.savedAt).toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`}</b>
              <small>Resultados y precios de ese día. Pulsa «Volver a escanear» para repetirla con datos de hoy.</small></div>
            <button type="button" className="simple-link" onClick={() => setRun(null)}>Cerrar</button>
          </div>}
          {scan && <section id="simple-panel-scan" className="simple-panel" aria-label="Escáner">
            <header><span className={'simple-panel-n' + (done('scan') ? ' done' : '')}>3</span><div>
              <h2>Escáner</h2>
              <p>Acciones que hoy cumplen las reglas de compra (última vela semanal).</p>
            </div></header>
            <div className="simple-scan-rules" aria-label={`Reglas de ${run.strategy.name}`}>
              {scan.market && <span className={'simple-market-filter ' + (scan.market.ok ? 'ok' : scan.market.ok === false ? 'off' : 'na')}
                title={scan.market.ok ? `${scan.market.on}: la estrategia puede comprar esta semana.` : scan.market.ok === false ? `${scan.market.off}: esta semana no compraría y vendería lo que tenga. La tabla muestra igualmente las acciones que cumplen las demás reglas.` : 'No se pudo comprobar el filtro de mercado.'}>
                <i aria-hidden="true"/>{`${scan.market.name} ${scan.market.ok ? 'alcista: puede comprar' : scan.market.ok === false ? 'bajista: no compra esta semana' : 'sin datos'}`}</span>}
              {run.strategy.rulesBuy.filter(r => !r.startsWith('Filtro de mercado')).map(r => <span key={r} className="simple-rule-chip">{r}</span>)}
            </div>
            <div className="simple-kpis">
              <div><span>Acciones analizadas</span><strong>{scan.analyzed}</strong></div>
              <div><span>Cumplen la estrategia</span><strong>{scan.passing.length}</strong></div>
              <div><span>Del mercado</span><strong>{scan.analyzed ? pct(scan.passing.length / scan.analyzed, 0, false) : '—'}</strong></div>
            </div>
            {scan.passing.length ? <div className="simple-scan-grid">
              <div className="simple-table-wrap"><table className="simple-table simple-table-pick">
                <thead><tr><th>Acción</th><th>Precio</th><th>Semana</th>
                  {run.strategy.columns.map(col => <th key={col.label} title={col.hint}>{col.label}</th>)}
                  <th title="Rentabilidad por unidad de riesgo en el último año">Sharpe 1a</th><th title="Elegida por el optimizador de Markowitz">Cartera</th></tr></thead>
                <tbody>{scan.passing.slice(0, 12).map((r, i) => (
                  <tr key={r.ticker} tabIndex={0} aria-selected={r.ticker === selected} className={r.ticker === selected ? 'sel' : ''}
                    onClick={() => setSelTicker(r.ticker)} onKeyDown={e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); setSelTicker(r.ticker); } }}>
                    <td className="tk" title={r.ticker}><b>{r.ticker}</b></td><td>{r.price >= 1000 ? Math.round(r.price).toLocaleString('es-ES') : num(r.price)}</td>
                    <td className={r.chg >= 0 ? 'up' : 'down'}>{pct(r.chg)}</td>
                    {r.values.map((v, k) => <td key={k}>{fmtCol(v, run.strategy.columns[k].fmt)}</td>)}
                    <td>{num(r.sharpe1y)}</td>
                    <td>{inPortfolio.has(r.ticker) && <span className="simple-tag" title="En cartera" aria-label="En cartera">✓</span>}</td>
                  </tr>))}</tbody>
              </table>
              <p className="simple-note">{`Haz clic en una fila para ver su gráfico.${scan.passing.length > 12 ? ` Y ${scan.passing.length - 12} acciones más.` : ''} Las ${Math.min(scan.passing.length, C.SIMPLE_CANDIDATES)} con mejor Sharpe del último año pasan al optimizador.`}</p></div>
              {selected && <SimpleCandles ticker={selected} data={run.prices ? run.prices[selected] : cacheRef.current[selected]?.['1wk']} strategy={run.strategy} currency={cur}
                row={scan.passing.find(r => r.ticker === selected)}/>}
            </div>
              : <p className="simple-note">Hoy ninguna acción del mercado cumple las reglas: la estrategia esperaría.</p>}
          </section>}
          {scan && !pf && !run.portfolioError && !running && <div className="simple-next">
            <p><b>Siguiente:</b> con las mejores acciones del escáner, Markowitz busca el reparto del dinero con la mejor rentabilidad por unidad de riesgo.</p>
            <CapitalInput value={capital} onChange={setCapital} cur={cur}/>
            <button type="button" className="simple-play" onClick={runPortfolio} disabled={!(capital > 0)}>▶  Paso 4 · Construir el portafolio</button>
          </div>}

          {run.portfolioError && <section id="simple-panel-portfolio" className="simple-panel" aria-label="Portafolio"><header><span className="simple-panel-n error">4</span><div><h2>Portafolio de Markowitz</h2><p>{run.portfolioError}</p></div></header></section>}
          {pf && <section id="simple-panel-portfolio" className="simple-panel" aria-label="Portafolio de Markowitz">
            <header><span className={'simple-panel-n' + (done('portfolio') ? ' done' : '')}>4</span><div>
              <h2>Portafolio de Markowitz · ¿cuánto invertir en cada acción?</h2>
              <p>El optimizador prueba miles de combinaciones de pesos con las rentabilidades y correlaciones históricas y elige la de máximo Sharpe: la mejor rentabilidad por unidad de riesgo. Máximo 10 acciones y 25 % por acción.</p>
            </div></header>
            <div className="simple-kpis">
              <div><span>Rentabilidad esperada</span><strong>{pct(pf.chosenPoint.ret / 100)}</strong><small>anual, histórica</small></div>
              <div><span>Volatilidad (riesgo)</span><strong>{pct(pf.chosenPoint.vol / 100, 1, false)}</strong><small>anual</small></div>
              <div><span>Ratio de Sharpe</span><strong>{num((pf.chosenPoint.ret - 3) / pf.chosenPoint.vol)}</strong><small>tasa libre de riesgo 3 %</small></div>
              <div><span>Acciones</span><strong>{pf.allocations.length}</strong><small>{`de ${Math.min(scan?.passing.length || 0, C.SIMPLE_CANDIDATES)} candidatas`}</small></div>
            </div>
            <div className="simple-portfolio-grid">
              <FrontierChart portfolio={pf}/>
              <div className="simple-weights">
                <div className="simple-weights-head">
                  <h3>Reparto del dinero</h3>
                  <CapitalInput label="" value={run.capital} cur={cur} onChange={v => { setCapital(v); setRun(r => ({ ...r, capital: v })); }}/>
                  <div className="simple-switch" role="group" aria-label="Ver el reparto">
                    <button type="button" aria-pressed={weightView === 'stock'} onClick={() => setWeightView('stock')}>Por acción</button>
                    <button type="button" aria-pressed={weightView === 'sector'} onClick={() => setWeightView('sector')}>Por sector</button>
                  </div>
                </div>
                {weightView === 'stock'
                  ? <Donut key="stock" title="Peso por acción" currency={cur} capital={run.capital || 0} center={stockCenter} items={stockItems}/>
                  : <Donut key="sector" title="Peso por sector" currency={cur} capital={run.capital || 0} center={sectorCenter} items={sectorItems}/>}
              </div>
            </div>
          </section>}

          {(pf || run.portfolioError) && !bt && !run.backtestError && !running && <div className="simple-next">
            <p><b>Siguiente:</b> {`simular la estrategia en el pasado, semana a semana, y compararla con comprar ${run.market.holdLabel} y esperar.`}</p>
            <div className="simple-periods" role="group" aria-label="Periodo del backtest">
              <span>Periodo:</span>
              {periods.map(p => <button type="button" key={p.years} aria-pressed={p.years === years} onClick={() => setYears(p.years)}>{p.label}</button>)}
            </div>
            <button type="button" className="simple-play" onClick={runBacktest}>▶  Paso 5 · Ejecutar el backtest</button>
          </div>}
          {run.backtestError && <section id="simple-panel-backtest" className="simple-panel" aria-label="Backtest"><header><span className="simple-panel-n error">5</span><div><h2>Backtest</h2><p>{run.backtestError}</p></div></header></section>}
          {bt && <section id="simple-panel-backtest" className="simple-panel simple-result" aria-label="Resultado del backtest">
            <header><span className={'simple-panel-n' + (done('backtest') ? ' done' : '')}>5</span><div>
              <h2>Backtest · ¿habría funcionado en el pasado?</h2>
              <p>{`${run.period?.label ? 'Periodo: ' + run.period.label + '. ' : ''}La estrategia se aplica semana a semana desde ${monthYear(bt.summary.start)} con ${money(bt.summary.capital, cur)}: compra cuando se cumplen las reglas, vende cuando se cumplen las de salida, reparte el dinero según rentabilidad/riesgo y descuenta comisiones.`}</p>
            </div></header>
            {run.capital > 0 && run.capital !== bt.summary.capital && !running && <div className="simple-rerun">
              <span>{`Has cambiado el dinero a ${money(run.capital, cur)}; este backtest se hizo con ${money(bt.summary.capital, cur)}.`}</span>
              <button type="button" className="simple-view" onClick={runBacktest}>{`↻ Repetir con ${money(run.capital, cur)}`}</button>
            </div>}
            <div className="simple-result-head">
              <div className="simple-result-title">{bt.summary.headline}</div>
              <Stars n={bt.summary.stars}/>
            </div>
            <div className="simple-scores">
              <div className="simple-score main"><span>Estrategia</span><strong>{money(bt.summary.final, cur)}</strong><em className={bt.summary.ret >= 0 ? 'up' : 'down'}>{pct(bt.summary.ret)}</em></div>
              <div className="simple-vs">VS</div>
              <div className="simple-score"><span>{`Comprar ${run.market.holdLabel} y esperar`}</span><strong>{money(bt.summary.benchFinal, cur)}</strong><em className={(bt.summary.benchRet || 0) >= 0 ? 'up' : 'down'}>{pct(bt.summary.benchRet)}</em></div>
            </div>
            <SimpleChart summary={bt.summary} currency={cur} holdLabel={run.market.holdLabel}/>
            <div className="simple-facts simple-facts-6">
              <div><span>Rentabilidad anual</span><strong>{pct(bt.annReturn)}</strong></div>
              <div><span>Ratio de Sharpe</span><strong>{num(bt.sharpe)}</strong></div>
              <div><span>Máxima caída</span><strong>{pct(-bt.summary.dd)}</strong><small>{bt.summary.benchDd != null ? `índice ${pct(-bt.summary.benchDd)}` : ''}</small></div>
              <div><span>Operaciones</span><strong>{bt.summary.trades}</strong></div>
              <div><span>Operaciones ganadoras</span><strong>{bt.summary.winRate != null ? Math.round(bt.summary.winRate * 100) + ' %' : '—'}</strong></div>
              <div><span>Comisiones pagadas</span><strong>{money(bt.commissions, cur)}</strong></div>
            </div>
            <div className="simple-stars-help"><span>⭐ ganar dinero</span><span>⭐ ganar al mercado</span><span>⭐ caer menos que el mercado</span></div>
          </section>}
          {running && <div id="simple-loading" className="simple-loading" role="status" aria-live="polite">
            <span className="simple-spinner" aria-hidden="true"/>
            <div className="simple-loading-body">
              <div className="simple-loading-top">
                <b>{`Paso ${{ scan: 3, portfolio: 4, backtest: 5 }[stage]} de 5 · ${(STAGES.find(x => x.id === stage) || {}).label || ''}`}</b>
                <span>{`${progressPct != null ? Math.round(progressPct) + ' % · ' : ''}${startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0} s`}</span>
              </div>
              <div className="simple-loading-text">{progress || 'Trabajando…'}</div>
              <div className={'simple-loading-bar' + (progressPct == null ? ' indeterminate' : '')}><i style={progressPct == null ? undefined : { width: Math.max(2, progressPct) + '%' }}/></div>
              {stage === 'scan' && run.market?.heavy && <small>Universo muy grande: la primera descarga puede tardar 1-2 minutos. Después queda en memoria y las siguientes partidas son mucho más rápidas.</small>}
            </div>
            <button type="button" className="simple-link" onClick={() => abortRef.current?.abort()}>Cancelar</button>
          </div>}
          {error && <div className="simple-error" role="alert">{error}</div>}
        </div>}

        {ranking.length > 0 && <section className="simple-ranking" aria-label="Tus partidas">
          <div className="simple-ranking-head">
            <h2>🏁 Tus partidas</h2>
            <button type="button" className="simple-link" onClick={() => { setGames([]); saveGames([]); clearSnapshots().catch(() => {}); setRankMsg(null); }}>Borrar</button>
          </div>
          <table>
            <thead><tr><th/><th>Estrategia</th><th>Mercado</th><th>Periodo</th><th>Resultado</th><th>Índice</th><th>Estrellas</th><th/></tr></thead>
            <tbody>{ranking.map((g, i) => (
              <tr key={g.id} className={run?.gameId === g.id ? 'sel' : ''}>
                <td>{medal(i)}</td><td>{`${g.icon} ${g.strategy}`}</td><td>{`${g.flag} ${g.market}`}</td><td>{g.period}</td>
                <td className={g.ret >= 0 ? 'up' : 'down'}>{pct(g.ret)}</td><td>{pct(g.benchRet)}</td><td><Stars n={g.stars} size={15}/></td>
                <td>{g.saved
                  ? <button type="button" className="simple-view" onClick={() => openGame(g)} disabled={running} aria-label={`Ver la partida ${g.strategy} en ${g.market}`}>Ver ▸</button>
                  : <span className="simple-view-na" title="Partida anterior a esta opción: no se guardaron los detalles">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
          {rankMsg && <p className="simple-note" role="status">{rankMsg}</p>}
        </section>}

        <p className="simple-disclaimer">Datos reales de Yahoo Finance. Rentabilidades pasadas no garantizan resultados futuros; es una herramienta educativa, no una recomendación de inversión.</p>
      </div>
    );
  }

  window.StockScannerUI.SimpleMode = SimpleMode;
})();
