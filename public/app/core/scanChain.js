// Escáneres encadenados (idea de PKScreener, "piped scanners"): las señales de un escaneo pasan a ser
// el universo del siguiente. Cada paso guarda los filtros y la dirección con que se escaneó, de modo
// que la cadena completa se puede repetir desde el universo original con un clic.
(function(){
  const clone = v => JSON.parse(JSON.stringify(v));

  // Foto de un escaneo en el momento de lanzarlo (los filtros pueden cambiar después).
  function scanSnapshot({ id, filters, shortFilters, direction, tickers }){
    const active = direction === 'short' ? shortFilters : filters;
    return { id, direction: direction === 'short' ? 'short' : 'long', filters: clone(active || []), tickers: [...(tickers || [])], inputCount: (tickers || []).length };
  }

  const sameSet = (a, b) => a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;

  // Añade a la cadena el escaneo cuyos resultados se están viendo. Devuelve la cadena nueva y el
  // universo (tickers) para el siguiente paso. Si el escaneo no se hizo sobre las señales del último
  // paso (p. ej. se cambió de universo), empieza una cadena nueva con `origin` como universo.
  function appendStep(chain, { snapshot, results, origin }){
    if(!snapshot) throw new Error('No hay un escaneo que encadenar.');
    const passed = (results || []).filter(r => r.passed && !r.err).map(r => r.ticker);
    if(!passed.length) throw new Error('El escaneo no tiene señales que encadenar.');
    if(chain?.steps?.some(s => s.scanId === snapshot.id)) throw new Error('Este escaneo ya está en la cadena.');
    const last = chain?.steps?.[chain.steps.length - 1];
    const continues = !!last && sameSet(snapshot.tickers || [], last.passed);
    const base = continues ? chain : { origin: { ...clone(origin), tickers: [...(snapshot.tickers || [])] }, steps: [] };
    const step = { scanId: snapshot.id, direction: snapshot.direction, filters: clone(snapshot.filters), inputCount: snapshot.inputCount, passed };
    return { chain: { ...base, steps: [...base.steps, step] }, nextTickers: passed, restarted: !!chain && !continues };
  }

  // Repite todos los pasos desde el universo original. `scan({tickers, filters, direction})` debe
  // devolver la lista de tickers que pasan. Se detiene si un paso se queda sin señales.
  async function rerunChain(chain, scan, onStep){
    let tickers = [...(chain?.origin?.tickers || [])];
    const steps = [];
    for(let i = 0; i < (chain?.steps || []).length; i++){
      const s = chain.steps[i];
      const passed = await scan({ tickers, filters: s.filters, direction: s.direction, index: i });
      if(passed == null) return { cancelled: true, chain };
      steps.push({ ...s, inputCount: tickers.length, passed: [...passed] });
      if(typeof onStep === 'function') onStep(i, passed.length);
      tickers = passed;
      if(!tickers.length) break;
    }
    return { chain: { ...chain, steps }, nextTickers: tickers, stoppedEarly: steps.length < (chain?.steps || []).length };
  }

  function describeStep(step, indicators = []){
    const label = f => {
      const def = indicators.find(x => x.id === f.ind);
      const p = def?.param != null && f.params?.p ? `(${f.params.p})` : '';
      const op = { '>':'>', '<':'<', '>=':'≥', '<=':'≤', x_up:'↑', x_dn:'↓' }[f.op] || f.op;
      const cmp = f.cmpType === 'val' ? f.cmpVal : f.cmpType === 'prev' ? 'ant.' : `${f.cmpInd}${f.cmpParams?.p ? '(' + f.cmpParams.p + ')' : ''}`;
      return `${f.ind}${p} ${op} ${cmp}`;
    };
    return (step.filters || []).map(label).join(' · ');
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore || {}, { scanSnapshot, appendChainStep: appendStep, rerunScanChain: rerunChain, describeChainStep: describeStep });
})();
