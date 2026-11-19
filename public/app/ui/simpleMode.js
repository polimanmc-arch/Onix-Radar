// Modo simple: simulador de estrategias en 3 pasos, pensado para quien ve la app por primera vez.
// Reutiliza el backtest y el scanner del modo experto con configuraciones predefinidas.
window.StockScannerUI = window.StockScannerUI || {};
(function(){
  const { useState, useRef, useEffect } = React;
  const GAMES_KEY = 'onix_simple_games_v1';
  const core = () => window.StockScannerCore;

  const money = (v, cur) => (Number.isFinite(v) ? Math.round(v).toLocaleString('es-ES') : '—') + ' ' + cur;
  const pct = (v, d = 1) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + (v * 100).toFixed(d).replace('.', ',') + ' %' : '—');
  const year = t => (t ? new Date(t * 1000).getFullYear() : '');
  const monthYear = t => (t ? new Date(t * 1000).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : '');

  function loadGames(){ try{ const v = JSON.parse(localStorage.getItem(GAMES_KEY) || '[]'); return Array.isArray(v) ? v : []; }catch{ return []; } }
  function saveGames(list){ try{ localStorage.setItem(GAMES_KEY, JSON.stringify(list.slice(0, 30))); }catch{} }

  function Stars({ n, size = 26 }){
    return <span className="simple-stars" aria-label={`${n} de 3 estrellas`} style={{ fontSize: size }}>
      {[0, 1, 2].map(i => <span key={i} aria-hidden="true" className={i < n ? 'on' : 'off'}>★</span>)}
    </span>;
  }

  // Gráfico de dos líneas: estrategia frente al índice.
  function SimpleChart({ summary, currency, marketName }){
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
    return (
      <figure className="simple-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolución de ${currency === '€' ? '10.000 €' : '10.000 $'}: estrategia frente al ${marketName}`}>
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
          <span><i style={{ background: 'var(--accent)' }}/>Tu estrategia</span>
          <span><i className="dashed"/>{`Comprar el ${marketName} y esperar`}</span>
        </figcaption>
      </figure>
    );
  }

  function SimpleMode({ notify }){
    const C = core();
    const markets = C.SIMPLE_MARKETS, strategies = C.SIMPLE_STRATEGIES, periods = C.SIMPLE_PERIODS;
    const [marketId, setMarketId] = useState('DOW30');
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
    useEffect(() => () => abortRef.current?.abort(), []);

    const market = markets.find(m => m.id === marketId);
    const strategy = strategies.find(s => s.id === strategyId);
    const period = periods.find(p => p.years === years) || periods[periods.length - 1];
    const ready = market && strategy && !running;

    const simulate = async () => {
      if(!ready) return;
      const ac = new AbortController(); abortRef.current = ac;
      setRunning(true); setError(null); setOutcome(null); setProgress({ pct: 2, label: 'Preparando' });
      try{
        let raw = null;
        const out = await C.runBacktestWorkflow({
          ...C.buildSimpleBacktestOptions({ market, strategy, period }),
          dataCacheRef: cacheRef, abortSignal: ac.signal,
          setBtRunning: () => {}, setTab: () => {}, setBacktest: r => { raw = r; },
          setBtProgress: p => setProgress({ pct: Math.max(2, Math.min(96, p?.pct || 0)), label: ({ data: 'Descargando precios', benchmark: 'Preparando el índice', simulation: 'Simulando semana a semana', results: 'Calculando resultados' })[p?.stage] || 'Preparando' }),
        });
        const summary = raw && C.summarizeSimpleResult(raw);
        if(!summary){ setError(out?.message || 'No hubo datos suficientes para simular. Prueba con otro mercado.'); return; }
        // Señales de hoy con los precios semanales ya descargados (sin otra descarga).
        const tickers = window.StockScannerConfig.UNIVERSE_PRESETS[market.preset]?.tickers || [];
        const today = C.todaySimpleSignals({ dataByTicker: cacheRef.current, tickers, strategy });
        const signals = today.list, signalsTotal = today.total;
        setOutcome({ summary, signals, signalsTotal, market, strategy, period });
        const game = { id: Date.now(), market: market.name, flag: market.flag, strategy: strategy.name, icon: strategy.icon, period: period.label, ret: summary.ret, benchRet: summary.benchRet, stars: summary.stars, currency: market.currency };
        setGames(prev => { const next = [game, ...prev].slice(0, 30); saveGames(next); return next; });
        setTimeout(() => resultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 60);
      }catch(e){
        if(e?.name === 'AbortError') setError('Simulación cancelada.');
        else setError(e?.message || 'Algo salió mal. Inténtalo de nuevo.');
      }finally{
        setRunning(false); setProgress(null); abortRef.current = null;
      }
    };

    const tryAnother = () => { setOutcome(null); setStrategyId(null); setTimeout(() => strategyRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 30); };
    const ranking = [...games].sort((a, b) => b.ret - a.ret).slice(0, 8);
    const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    const s = outcome?.summary, cur = outcome?.market.currency;

    return (
      <div className="simple-mode">
        <section className="simple-hero">
          <h1>🎮 Simulador de estrategias</h1>
          <p>Elige un mercado y una estrategia y descubre qué habría pasado con <b>10.000</b> invertidos. ¿Le ganarás al mercado?</p>
        </section>

        <section className="simple-step" aria-labelledby="simple-step-1">
          <h2 id="simple-step-1"><span className="simple-step-n">1</span>Elige tu mercado</h2>
          <div className="simple-grid simple-grid-markets">
            {markets.map(m => (
              <button type="button" key={m.id} className="simple-card" aria-pressed={m.id === marketId} onClick={() => setMarketId(m.id)} disabled={running}>
                <span className="simple-card-icon">{m.flag}</span>
                <strong>{m.name}</strong>
                <span>{m.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="simple-step" aria-labelledby="simple-step-2" ref={strategyRef}>
          <h2 id="simple-step-2"><span className="simple-step-n">2</span>Elige tu estrategia</h2>
          <div className="simple-grid simple-grid-3">
            {strategies.map(st => (
              <button type="button" key={st.id} className="simple-card simple-card-strategy" aria-pressed={st.id === strategyId} onClick={() => setStrategyId(st.id)} disabled={running}>
                <span className="simple-card-icon">{st.icon}</span>
                <strong>{st.name}</strong>
                <span>{st.pitch}</span>
                <em className="simple-badge">{st.level}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="simple-step" aria-labelledby="simple-step-3">
          <h2 id="simple-step-3"><span className="simple-step-n">3</span>¡A simular!</h2>
          <div className="simple-launch">
            <div className="simple-periods" role="group" aria-label="Periodo">
              <span>Periodo:</span>
              {periods.map(p => <button type="button" key={p.years} aria-pressed={p.years === years} onClick={() => setYears(p.years)} disabled={running}>{p.label}</button>)}
            </div>
            {!running && <button type="button" className="simple-play" onClick={simulate} disabled={!ready}>
              {strategy ? `▶  Simular con 10.000 ${market.currency}` : 'Elige una estrategia para empezar'}
            </button>}
            {running && <div className="simple-progress" role="status" aria-live="polite">
              <div className="simple-progress-bar"><span style={{ width: (progress?.pct || 2) + '%' }}/></div>
              <div className="simple-progress-label">{progress?.label || 'Preparando'}… {progress?.pct ? Math.round(progress.pct) + ' %' : ''}</div>
              <button type="button" className="simple-link" onClick={() => abortRef.current?.abort()}>Cancelar</button>
            </div>}
          </div>
          {error && <div className="simple-error" role="alert">{error}</div>}
        </section>

        {s && <section className="simple-result" ref={resultRef} aria-label="Resultado de la simulación">
          <div className="simple-result-head">
            <div>
              <div className="simple-result-title">{s.headline}</div>
              <div className="simple-result-sub">{`${outcome.strategy.icon} ${outcome.strategy.name} · ${outcome.market.flag} ${outcome.market.name} · desde ${monthYear(s.start)}`}</div>
            </div>
            <Stars n={s.stars}/>
          </div>
          <div className="simple-scores">
            <div className="simple-score main">
              <span>Tu estrategia</span>
              <strong>{money(s.final, cur)}</strong>
              <em className={s.ret >= 0 ? 'up' : 'down'}>{pct(s.ret)}</em>
            </div>
            <div className="simple-vs">VS</div>
            <div className="simple-score">
              <span>{`Comprar el ${outcome.market.name} y esperar`}</span>
              <strong>{money(s.benchFinal, cur)}</strong>
              <em className={(s.benchRet || 0) >= 0 ? 'up' : 'down'}>{pct(s.benchRet)}</em>
            </div>
          </div>
          <SimpleChart summary={s} currency={cur} marketName={outcome.market.name}/>
          <div className="simple-facts">
            <div><span>Operaciones</span><strong>{s.trades}</strong></div>
            <div><span>Operaciones ganadoras</span><strong>{s.winRate != null ? Math.round(s.winRate * 100) + ' %' : '—'}</strong></div>
            <div><span>Peor caída</span><strong>{pct(-s.dd)}</strong><small>{s.benchDd != null ? `mercado ${pct(-s.benchDd)}` : ''}</small></div>
          </div>
          <div className="simple-stars-help">
            <span>⭐ ganar dinero</span><span>⭐ ganar al mercado</span><span>⭐ sufrir menos caída que el mercado</span>
          </div>

          <div className="simple-signals">
            <h3>{`📡 Hoy esta estrategia elegiría (${outcome.signalsTotal})`}</h3>
            {outcome.signals.length
              ? <div className="simple-chips">{outcome.signals.map(x => <span key={x.ticker} className="simple-chip"><b>{x.ticker}</b>{Number.isFinite(x.price) ? ` ${x.price.toFixed(2)}` : ''}</span>)}{outcome.signalsTotal > outcome.signals.length && <span className="simple-chip">{`y ${outcome.signalsTotal - outcome.signals.length} más`}</span>}</div>
              : <p>Hoy ninguna acción de este mercado cumple las condiciones: la estrategia esperaría.</p>}
          </div>

          <button type="button" className="simple-link" aria-expanded={howOpen} onClick={() => setHowOpen(v => !v)}>{howOpen ? 'Ocultar cómo decide' : '¿Cómo decide esta estrategia?'}</button>
          {howOpen && <div className="simple-how">
            <p><b>Compra cuando:</b> {outcome.strategy.buy}</p>
            <p><b>Vende cuando:</b> {outcome.strategy.sell}</p>
            <p>Revisa el mercado cada semana, reparte el dinero entre hasta 10 acciones a la vez y descuenta comisiones.</p>
          </div>}

          <div className="simple-actions">
            <button type="button" className="simple-play small" onClick={tryAnother}>🔁 Probar otra estrategia</button>
          </div>
        </section>}

        {ranking.length > 0 && <section className="simple-ranking" aria-label="Tus partidas">
          <div className="simple-ranking-head">
            <h2>🏁 Tus partidas</h2>
            <button type="button" className="simple-link" onClick={() => { setGames([]); saveGames([]); }}>Borrar</button>
          </div>
          <table>
            <thead><tr><th/><th>Estrategia</th><th>Mercado</th><th>Periodo</th><th>Resultado</th><th>Mercado</th><th>Estrellas</th></tr></thead>
            <tbody>{ranking.map((g, i) => (
              <tr key={g.id}>
                <td>{medal(i)}</td>
                <td>{`${g.icon} ${g.strategy}`}</td>
                <td>{`${g.flag} ${g.market}`}</td>
                <td>{g.period}</td>
                <td className={g.ret >= 0 ? 'up' : 'down'}>{pct(g.ret)}</td>
                <td>{pct(g.benchRet)}</td>
                <td><Stars n={g.stars} size={15}/></td>
              </tr>
            ))}</tbody>
          </table>
        </section>}

        <p className="simple-disclaimer">Simulación con precios históricos reales (Yahoo Finance). Rentabilidades pasadas no garantizan resultados futuros; no es una recomendación de inversión.</p>
      </div>
    );
  }

  window.StockScannerUI.SimpleMode = SimpleMode;
})();
