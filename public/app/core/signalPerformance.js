// Rendimiento histórico de la señal del scanner (idea tomada de PKScreener / backtest rápido).
// Para cada símbolo del universo escaneado recorre su historial y, en cada vela cerrada de la
// temporalidad base, evalúa los mismos filtros con el evaluador del backtest y con velas ya
// cerradas en las demás temporalidades. Cuando la señal se cumple mide el retorno a varios
// horizontes: entrada en la apertura siguiente (como el backtest) y salida al cierre de la vela h.
// Base de comparación: el mismo retorno en todas las velas evaluables del universo.
(function(){
  const TF_ORDER = ['4h','1d','1wk','1mo'];
  const HORIZONS = {
    '4h':  [{bars:2,label:'1 día'},{bars:10,label:'5 días'},{bars:20,label:'10 días'}],
    '1d':  [{bars:5,label:'5 días'},{bars:10,label:'10 días'},{bars:20,label:'20 días'}],
    '1wk': [{bars:1,label:'1 semana'},{bars:4,label:'4 semanas'},{bars:13,label:'13 semanas'}],
    '1mo': [{bars:1,label:'1 mes'},{bars:3,label:'3 meses'},{bars:6,label:'6 meses'}],
  };
  const META_IDS = new Set(['SECTOR','INDUSTRY','COUNTRY','EXCHANGE','MARKET_CAP','FLOAT','SHARES_OUT','SHORT_INT_PCT','INST_OWN_PCT','INSIDER_OWN_PCT','BETA','PE','FWD_PE','PS','PB','EV_EBITDA','DEBT_EQUITY','CURRENT_RATIO','ROE','ROA','GROSS_MARGIN','OPER_MARGIN','REV_GROWTH','EPS_GROWTH','FCF_YIELD']);

  function median(arr){
    if(!arr.length) return null;
    const s=Float64Array.from(arr).sort();
    const m=s.length>>1;
    return s.length%2?s[m]:(s[m-1]+s[m])/2;
  }
  function summarize(rets){
    const n=rets.length;
    if(!n) return {n:0,mean:null,median:null,hitRate:null};
    let sum=0,hits=0;
    for(const r of rets){ sum+=r; if(r>0) hits++; }
    return {n,mean:sum/n,median:median(rets),hitRate:hits/n};
  }

  async function computeSignalPerformance(opts={}){
    const { dataByTicker={}, filters=[], direction='long', yieldToUi, isCancelled, onProgress } = opts;
    const { createRuleEvaluator, barCloseTime, findClosedIndexAt } = window.StockScannerCore;
    const active=(filters||[]).filter(f=>f&&f.ind);
    if(!active.length) return {ok:false,message:'No hay filtros activos.'};
    const tfs=[...new Set(active.map(f=>f.tf).filter(Boolean))];
    const baseTf=TF_ORDER.find(tf=>tfs.includes(tf))||tfs[0];
    const horizons=HORIZONS[baseTf]||HORIZONS['1d'];
    const sign=direction==='short'?-1:1;
    const usesMeta=active.some(f=>META_IDS.has(f.ind)||(f.cmpType==='ind'&&META_IDS.has(f.cmpInd)));
    const groups=[{conditions:active}];
    const evaluator=createRuleEvaluator();
    const tickers=Object.keys(dataByTicker).filter(t=>!t.startsWith('__'));

    const sig=horizons.map(()=>[]), base=horizons.map(()=>[]);
    const byTicker={};
    let tickersUsed=0, episodes=0, firstTime=null, lastTime=null;
    let lastYield=Date.now();

    for(let ti=0;ti<tickers.length;ti++){
      if(isCancelled?.()) return {ok:false,cancelled:true};
      const ticker=tickers[ti];
      const dataByTf=dataByTicker[ticker];
      const d=dataByTf?.[baseTf];
      if(!d?.ok||!tfs.every(tf=>dataByTf[tf]?.ok)) continue;
      tickersUsed++;
      const L=d.closes.length;
      const tSig=horizons.map(()=>[]);
      let prevMatched=false, tEpisodes=0, tSignals=0;
      // De antigua a reciente para contar episodios (primera vela de cada racha de señales).
      for(let i=L-2;i>=1;i--){
        const decision=barCloseTime(baseTf,d.times[i]);
        const idxByTf={};
        for(const tf of tfs) idxByTf[tf]= tf===baseTf ? i : findClosedIndexAt(dataByTf[tf],tf,decision);
        let evaluable=true, matched=true;
        for(const f of active){
          const r=evaluator.testFilterAt(f,dataByTf,idxByTf);
          if(r.val==null||r.cmp==null){ evaluable=false; matched=false; break; }
          if(!r.pass) matched=false;
        }
        if(!evaluable){ prevMatched=false; continue; }
        const entry=Number(d.opens?.[i-1])>0?Number(d.opens[i-1]):Number(d.closes[i]);
        if(matched){
          tSignals++;
          if(!prevMatched){ tEpisodes++; }
          const t=d.times[i];
          if(firstTime==null||t<firstTime) firstTime=t;
          if(lastTime==null||t>lastTime) lastTime=t;
        }
        prevMatched=matched;
        if(!(entry>0)) continue;
        horizons.forEach((h,hi)=>{
          const exitIdx=i-h.bars;
          if(exitIdx<1) return; // la vela de salida debe estar cerrada (índice 0 = vela en formación)
          const exit=Number(d.closes[exitIdx]);
          if(!(exit>0)) return;
          const ret=sign*(exit/entry-1);
          base[hi].push(ret);
          if(matched){ sig[hi].push(ret); tSig[hi].push(ret); }
        });
      }
      episodes+=tEpisodes;
      if(tSignals>0){
        byTicker[ticker]={signals:tSignals,episodes:tEpisodes,horizons:tSig.map(summarize)};
      }
      if(typeof onProgress==='function'&&(ti%25===0)) onProgress({done:ti+1,total:tickers.length});
      if(yieldToUi&&Date.now()-lastYield>=16){ await yieldToUi(); lastYield=Date.now(); }
    }
    if(typeof onProgress==='function') onProgress({done:tickers.length,total:tickers.length});

    const aggregate=horizons.map((h,hi)=>{
      const s=summarize(sig[hi]), b=summarize(base[hi]);
      return {...h, ...s, baseMean:b.mean, baseHitRate:b.hitRate, baseN:b.n,
        edge:s.mean!=null&&b.mean!=null?s.mean-b.mean:null};
    });
    return {
      ok:true, baseTf, direction, horizons, aggregate, byTicker,
      tickersScanned:tickers.length, tickersUsed, tickersWithSignals:Object.keys(byTicker).length,
      signals:Object.values(byTicker).reduce((a,t)=>a+t.signals,0), episodes,
      firstTime, lastTime, usesMeta, computedAt:Date.now(),
    };
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore||{}, { computeSignalPerformance });
})();
