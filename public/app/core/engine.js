(function(){
  const { TIMEFRAMES } = window.StockScannerConfig;
  const { calcWMA, calcSMA, calcEMA, calcRSI, calcStoch, calcMACD, calcATR } = window.StockScannerCore;

  function aggregateCandles(o,h,l,c,v,t,factor){
    if(!factor||factor<=1)return{opens:o,highs:h,lows:l,closes:c,volumes:v,times:t};
    const candles=[];
    for(let i=0;i<c.length;i++)candles.push({time:t[i],open:o[i],high:h[i],low:l[i],close:c[i],volume:v[i]||0});
    const oldestFirst=[...candles].reverse();
    const grouped=[];
    let dayKey=null,buffer=[];
    // Agrupa por sesión (día UTC) en bloques de `factor` barras alineados al inicio de la sesión.
    // El último bloque de la sesión puede ser parcial (p. ej. 7 barras 1H → 4H + 3H), como hacen
    // las plataformas habituales; así no se pierden barras ni sus máximos/mínimos.
    const flushBuffer=()=>{
      for(let i=0;i<buffer.length;i+=factor){
        const chunk=buffer.slice(i,i+factor);
        grouped.push({time:chunk[chunk.length-1].time,open:chunk[0].open,high:Math.max(...chunk.map(x=>x.high)),low:Math.min(...chunk.map(x=>x.low)),close:chunk[chunk.length-1].close,volume:chunk.reduce((a,x)=>a+(x.volume||0),0)});
      }
      buffer=[];
    };
    oldestFirst.forEach(cd=>{
      const d=new Date(cd.time*1000);
      const key=d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0");
      if(dayKey!==null&&key!==dayKey)flushBuffer();
      dayKey=key; buffer.push(cd);
    });
    flushBuffer();
    const newestFirst=grouped.reverse();
    return{opens:newestFirst.map(x=>x.open),highs:newestFirst.map(x=>x.high),lows:newestFirst.map(x=>x.low),closes:newestFirst.map(x=>x.close),volumes:newestFirst.map(x=>x.volume),times:newestFirst.map(x=>x.time)};
  }
  function findClosedIndexAtOrBeforeTime(times,anchorTime,startIdx=1){ if(!times||anchorTime==null)return-1; for(let i=startIdx;i<times.length;i++)if(times[i]<=anchorTime)return i; return-1; }
  function buildSignalSliceFromIndex(d,idx){ if(!d||!d.ok||idx<0||idx+2>=d.closes.length)return{ok:false}; return{ok:true,closes:d.closes.slice(idx),highs:d.highs.slice(idx),lows:d.lows.slice(idx),opens:(d.opens||d.closes).slice(idx),volumes:d.volumes?.slice(idx)||[],times:d.times?.slice(idx)||[],price:d.closes[idx],prevClose:d.closes[idx+1]}; }
  function buildAlignedSignalSlice(d,anchorTime,startIdx=1){ const idx=findClosedIndexAtOrBeforeTime(d?.times,anchorTime,startIdx); return buildSignalSliceFromIndex(d,idx); }
  function buildAlignedSignalMap(dataByTf,anchorTime,startIdx=1){ const out={}; Object.entries(dataByTf||{}).forEach(([tf,d])=>{ if(tf !== '_meta') out[tf]=buildAlignedSignalSlice(d,anchorTime,startIdx); }); if(dataByTf?._meta) out._meta=dataByTf._meta; return out; }

  function num(v){ if(v==null||v===''||v==='-') return null; const n=Number(v); return Number.isFinite(n)?n:null; }
  function txt(v){ if(v==null) return null; const s=String(v).trim(); return s||null; }
  function pct(v){ const n=num(v); return n==null ? null : (Math.abs(n) <= 1 ? n*100 : n); }
  function avg(arr){return arr?.length?arr.reduce((a,b)=>a+b,0)/arr.length:null}
  function sliceN(arr,n){ return (arr||[]).slice(0,Math.max(0,n)).filter(v=>v!=null); }
  function highest(arr,n){ const s=sliceN(arr,n); return s.length?Math.max(...s):null; }
  function lowest(arr,n){ const s=sliceN(arr,n); return s.length?Math.min(...s):null; }
  function sum(arr){ return (arr||[]).reduce((a,b)=>a+(+b||0),0); }
  function avgRangePct(highs,lows,closes,n){
    const len=Math.min(n||0, highs?.length||0, lows?.length||0, closes?.length||0);
    if(len<=0) return null;
    const vals=[];
    for(let i=0;i<len;i++){
      const c=closes[i]; if(!c) continue;
      vals.push(((highs[i]-lows[i])/c)*100);
    }
    return avg(vals);
  }
  function countGreen(opens,closes,n){ let cnt=0; for(let i=0;i<Math.min(n||0, opens?.length||0, closes?.length||0);i++) if(closes[i]>opens[i]) cnt++; return cnt; }
  function countRed(opens,closes,n){ let cnt=0; for(let i=0;i<Math.min(n||0, opens?.length||0, closes?.length||0);i++) if(closes[i]<opens[i]) cnt++; return cnt; }
  function consecDir(opens,closes,dir){ let cnt=0; for(let i=0;i<Math.min(opens?.length||0, closes?.length||0);i++){ const up=closes[i]>opens[i], dn=closes[i]<opens[i]; if((dir==='up'&&up)||(dir==='dn'&&dn)) cnt++; else break; } return cnt; }
  function currentVwap(d){
    const len=Math.min(d?.closes?.length||0,d?.highs?.length||0,d?.lows?.length||0,d?.volumes?.length||0);
    if(len<1) return null;
    let pv=0, vol=0;
    for(let i=len-1;i>=0;i--){ const typical=((d.highs[i]+d.lows[i]+d.closes[i])/3); const v=d.volumes[i]||0; pv += typical*v; vol += v; }
    return vol>0 ? pv/vol : null;
  }
  function metaValue(id, meta={}){
    switch(id){
      case 'SECTOR': return txt(meta.sector);
      case 'INDUSTRY': return txt(meta.industry);
      case 'COUNTRY': return txt(meta.country);
      case 'EXCHANGE': return txt(meta.exchange);
      case 'MARKET_CAP': return num(meta.marketCap);
      case 'FLOAT': return num(meta.floatShares);
      case 'SHARES_OUT': return num(meta.sharesOutstanding);
      case 'SHORT_INT_PCT': return pct(meta.shortInterestPct);
      case 'INST_OWN_PCT': return pct(meta.institutionalOwnershipPct);
      case 'INSIDER_OWN_PCT': return pct(meta.insiderOwnershipPct);
      case 'BETA': return num(meta.beta);
      case 'PE': return num(meta.peRatio);
      case 'FWD_PE': return num(meta.forwardPE);
      case 'PS': return num(meta.priceToSales);
      case 'PB': return num(meta.priceToBook);
      case 'EV_EBITDA': return num(meta.evToEbitda);
      case 'DEBT_EQUITY': return num(meta.debtToEquity);
      case 'CURRENT_RATIO': return num(meta.currentRatio);
      case 'ROE': return pct(meta.roe);
      case 'ROA': return pct(meta.roa);
      case 'GROSS_MARGIN': return pct(meta.grossMargin);
      case 'OPER_MARGIN': return pct(meta.operatingMargin);
      case 'REV_GROWTH': return pct(meta.revenueGrowth);
      case 'EPS_GROWTH': return pct(meta.epsGrowth);
      case 'FCF_YIELD': return pct(meta.freeCashFlowYield);
      default: return null;
    }
  }
  function evalInd(id,params,d){
    if(!d?.ok && !d?._meta) return [null,null];
    const p=params?.p||20;
    switch(id){
      case 'WMA': return calcWMA(d.closes,p);
      case 'SMA': return calcSMA(d.closes,p);
      case 'EMA': return calcEMA(d.closes,p);
      case 'RSI': return calcRSI(d.closes,p);
      case 'STOCH': return calcStoch(d.highs,d.lows,d.closes,p,params.ks||1,params.dp||3);
      case 'MACD': return calcMACD(d.closes,p,params.sl||26,params.sg||9);
      case 'ATR': return calcATR(d.highs,d.lows,d.closes,p);
      case 'PRICE': return [d.closes?.[0] ?? null, d.closes?.[1] ?? null];
      case 'VOL': return [d.volumes?.[0] ?? null, d.volumes?.[1] ?? null];
      case 'CHG': {
        const c1=d.prevClose?((d.closes[0]-d.prevClose)/d.prevClose)*100:null;
        const c2=d.closes?.[2]?((d.closes[1]-d.closes[2])/d.closes[2]*100):null;
        return [c1,c2];
      }
      case 'GAP': {
        const cur=d.prevClose&&d.opens?.[0]!=null?((d.opens[0]-d.prevClose)/d.prevClose)*100:null;
        const prev=d.closes?.[2]&&d.opens?.[1]!=null?((d.opens[1]-d.closes[2])/d.closes[2]*100):null;
        return [cur,prev];
      }
      case 'DIST_HIGH': {
        const hh0=highest(d.highs,p), hh1=highest((d.highs||[]).slice(1),p);
        return [hh0&&d.closes?.[0]!=null?((d.closes[0]/hh0)-1)*100:null, hh1&&d.closes?.[1]!=null?((d.closes[1]/hh1)-1)*100:null];
      }
      case 'DIST_LOW': {
        const ll0=lowest(d.lows,p), ll1=lowest((d.lows||[]).slice(1),p);
        return [ll0&&d.closes?.[0]!=null?((d.closes[0]/ll0)-1)*100:null, ll1&&d.closes?.[1]!=null?((d.closes[1]/ll1)-1)*100:null];
      }
      case 'ADR_PCT': return [avgRangePct(d.highs,d.lows,d.closes,p), avgRangePct((d.highs||[]).slice(1),(d.lows||[]).slice(1),(d.closes||[]).slice(1),p)];
      case 'AVG_VOL': return [avg(sliceN(d.volumes,p)), avg(sliceN((d.volumes||[]).slice(1),p))];
      case 'RVOL': {
        const avg0=avg(sliceN((d.volumes||[]).slice(1),p));
        const avg1=avg(sliceN((d.volumes||[]).slice(2),p));
        return [avg0?((d.volumes?.[0]||0)/avg0):null, avg1?((d.volumes?.[1]||0)/avg1):null];
      }
      case 'DOLLAR_VOL': return [d.closes?.[0]!=null&&d.volumes?.[0]!=null?d.closes[0]*d.volumes[0]:null, d.closes?.[1]!=null&&d.volumes?.[1]!=null?d.closes[1]*d.volumes[1]:null];
      case 'GREEN_COUNT': return [countGreen(d.opens,d.closes,p), countGreen((d.opens||[]).slice(1),(d.closes||[]).slice(1),p)];
      case 'RED_COUNT': return [countRed(d.opens,d.closes,p), countRed((d.opens||[]).slice(1),(d.closes||[]).slice(1),p)];
      case 'CONSEC_UP': return [consecDir(d.opens,d.closes,'up'), consecDir((d.opens||[]).slice(1),(d.closes||[]).slice(1),'up')];
      case 'CONSEC_DN': return [consecDir(d.opens,d.closes,'dn'), consecDir((d.opens||[]).slice(1),(d.closes||[]).slice(1),'dn')];
      case 'EXT_EMA_PCT': {
        const [ema0, ema1] = calcEMA(d.closes,p);
        return [ema0&&d.closes?.[0]!=null?((d.closes[0]/ema0)-1)*100:null, ema1&&d.closes?.[1]!=null?((d.closes[1]/ema1)-1)*100:null];
      }
      case 'EXT_VWAP_PCT': {
        const vwap0=currentVwap(d), vwap1=currentVwap({ ...d, highs:(d.highs||[]).slice(1), lows:(d.lows||[]).slice(1), closes:(d.closes||[]).slice(1), volumes:(d.volumes||[]).slice(1) });
        return [vwap0&&d.closes?.[0]!=null?((d.closes[0]/vwap0)-1)*100:null, vwap1&&d.closes?.[1]!=null?((d.closes[1]/vwap1)-1)*100:null];
      }
      default: {
        const metaCur = metaValue(id, d._meta || {});
        return [metaCur, metaCur];
      }
    }
  }

  function compareValues(cur, cmp, op){
    switch(op){
      case '>': return cur>cmp;
      case '<': return cur<cmp;
      case '>=': return cur>=cmp;
      case '<=': return cur<=cmp;
      default: return false;
    }
  }

  function testFilter(f,d){
    const [cur,prev]=evalInd(f.ind,f.params,d);
    if(cur==null) return {pass:false,val:null,cmp:null};

    // textual metadata filters accept = and != semantics through >/< disabled; use cmpVal text.
    const textMode = ['SECTOR','INDUSTRY','COUNTRY','EXCHANGE'].includes(f.ind);
    if(textMode){
      const left=String(cur||'').trim().toLowerCase();
      const right=String(f.cmpVal ?? '').trim().toLowerCase();
      const pass = f.op === '<' ? left !== right : left === right;
      return { pass, val: cur, cmp: f.cmpVal ?? '' };
    }

    let cmp,cmpPrev;
    if(f.cmpType==='val'){ cmp=f.cmpVal; cmpPrev=f.cmpVal; }
    else if(f.cmpType==='prev'){ cmp=prev; cmpPrev=null; }
    else { const [iv,ip]=evalInd(f.cmpInd,f.cmpParams,d); cmp=iv; cmpPrev=ip; }
    if(cmp==null) return {pass:false,val:cur,cmp:null};
    let pass=false;
    switch(f.op){
      case '>': case '<': case '>=': case '<=': pass=compareValues(cur,cmp,f.op); break;
      case 'x_up': pass=cur>cmp&&prev!=null&&cmpPrev!=null&&prev<=cmpPrev; break;
      case 'x_dn': pass=cur<cmp&&prev!=null&&cmpPrev!=null&&prev>=cmpPrev; break;
    }
    return {pass,val:cur,cmp};
  }
  function evalRuleGroups(groups,miniD){for(const grp of groups){let gp=true;for(const c of grp.conditions){if(!testFilter(c,miniD).pass){gp=false;break}}if(gp)return true}return false}
  function evalRuleGroupsDetailed(groups,miniD){ for(let gi=0;gi<groups.length;gi++){ const grp=groups[gi]; let gp=true; const vals=[]; for(const c of grp.conditions){ const r=testFilter(c,miniD); const lbl=c.ind+(c.params?.p?"("+c.params.p+")":"")+" ["+(c.tf||"?")+"] "+c.op+" "+(c.cmpType==="val"?c.cmpVal:c.cmpType==="prev"?"prev":c.cmpInd); vals.push({lbl,pass:r.pass,val:r.val,cmp:r.cmp}); if(!r.pass){gp=false;break} } if(gp)return{matched:true,groupIdx:gi+1,conditions:vals}; } return{matched:false,groupIdx:0,conditions:[]}; }
  function testFilterAligned(f,dataByTf){ const d={...(dataByTf?.[f.tf]||{ok:false}), _meta:dataByTf?._meta||{}}; return testFilter(f,d); }
  function evalRuleGroupsDetailedAligned(groups,dataByTf){ for(let gi=0;gi<groups.length;gi++){ const grp=groups[gi]; let gp=true; const vals=[]; for(const c of grp.conditions){ const r=testFilterAligned(c,dataByTf); const lbl=c.ind+(c.params?.p?"("+c.params.p+")":"")+" ["+(c.tf||"?")+" ] "+c.op+" "+(c.cmpType==="val"?c.cmpVal:c.cmpType==="prev"?"prev":c.cmpInd); vals.push({lbl,pass:r.pass,val:r.val,cmp:r.cmp}); if(!r.pass){gp=false;break} } if(gp)return{matched:true,groupIdx:gi+1,conditions:vals}; } return{matched:false,groupIdx:0,conditions:[]}; }
  async function fetchTicker(ticker,tf,signal){ const tfDef=TIMEFRAMES.find(t=>t.id===tf)||TIMEFRAMES[1]; const url="/api/chart/"+encodeURIComponent(ticker)+"?interval="+tfDef.yahooInterval+"&range="+tfDef.yahooRange; try{ const resp=await fetch(url,{signal}); if(!resp.ok){const err=await resp.json().catch(()=>({}));return{ticker,ok:false,error:err.error||("HTTP "+resp.status)}} const json=await resp.json(); const result=json?.chart?.result?.[0]; if(!result?.timestamp)return{ticker,ok:false,error:"Sin datos"}; const q=result.indicators?.quote?.[0]||{}; let opens=(q.open||[]),highs=(q.high||[]),lows=(q.low||[]),closes=(q.close||[]),volumes=(q.volume||[]),times=(result.timestamp||[]); let rows=[]; for(let i=0;i<times.length;i++){ const o=opens[i],h=highs[i],l=lows[i],c=closes[i]; if([o,h,l,c].some(x=>x==null))continue; rows.push({time:times[i],open:+o,high:+h,low:+l,close:+c,volume:+(volumes[i]||0)}); } rows.sort((a,b)=>b.time-a.time); opens=rows.map(r=>r.open);highs=rows.map(r=>r.high);lows=rows.map(r=>r.low);closes=rows.map(r=>r.close);volumes=rows.map(r=>r.volume);times=rows.map(r=>r.time); if(tfDef.aggregateFactor&&tfDef.aggregateFactor>1){ const agg=aggregateCandles(opens,highs,lows,closes,volumes,times,tfDef.aggregateFactor); opens=agg.opens;highs=agg.highs;lows=agg.lows;closes=agg.closes;volumes=agg.volumes;times=agg.times; } return{ticker,tf,ok:closes.length>5,error:closes.length>5?null:"Muy pocos datos",opens,highs,lows,closes,volumes,times,price:closes[0],prevClose:closes[1]}; }catch(e){ return{ticker,tf,ok:false,error:e.message||"Error"}; } }
  function calcVolatility(closes,ppy){if(!closes||closes.length<10)return null;const rets=[];const n=Math.min(closes.length-1,52);for(let i=0;i<n;i++){if(closes[i+1]!==0)rets.push(Math.log(closes[i]/closes[i+1]))}if(rets.length<5)return null;const mean=rets.reduce((a,b)=>a+b,0)/rets.length;const variance=rets.reduce((a,r)=>a+(r-mean)**2,0)/(rets.length-1);return Math.sqrt(variance)*Math.sqrt(ppy)*100}
  function calcSignalScore(fResults){
    if(!fResults||!fResults.length) return 0;
    if(fResults.some(r=>!r.pass)) return 0;
    let total=0;
    fResults.forEach(r=>{
      if(r.val==null||r.cmp==null||typeof r.val==='string'||typeof r.cmp==='string'){total+=1;return;}
      const diff=Math.abs(r.val-r.cmp);
      const base=Math.abs(r.cmp)||Math.abs(r.val)||1;
      total+=Math.min(1,diff/base);
    });
    return Math.round((total/fResults.length)*100);
  }
  function std(arr){if(!arr||arr.length<2)return 0;const m=avg(arr);return Math.sqrt(arr.reduce((a,x)=>a+(x-m)**2,0)/(arr.length-1))}
  function clamp(x,min,max){return Math.max(min,Math.min(max,x))}

  // Pesos proporcionales a `raw` con cada |peso| dentro de [minW, maxW].
  // Busca lambda tal que sum(clamp(lambda*base_i, minW, maxW)) = 1, así el exceso de una
  // posición topada se reparte entre las que aún tienen capacidad sin volver a romper el máximo.
  // Si n*maxW < 1 no se puede invertir todo: cada posición queda en maxW y el resto es efectivo.
  function boundWeights(raw, minAbs, maxAbs){
    const n = Array.isArray(raw) ? raw.length : 0;
    if(!n) return [];
    const signs = raw.map(w => Number(w) < 0 ? -1 : 1);
    let maxW = Number(maxAbs); if(!(maxW > 0)) maxW = 1; maxW = Math.min(1, maxW);
    let minW = Math.max(0, Number(minAbs) || 0);
    minW = Math.min(minW, maxW, 1/n);
    if(n * maxW <= 1 + 1e-12) return signs.map(s => s * maxW);
    const abs = raw.map(w => Math.abs(Number(w)) || 0);
    const total = abs.reduce((a,b)=>a+b,0);
    const base = total > 0 ? abs.map(v => Math.max(v/total, 1e-12)) : abs.map(() => 1/n);
    // S(lambda) es lineal a trozos y no decreciente: se ordenan los puntos de quiebre
    // (minW/b, maxW/b), se localiza el tramo donde S cruza 1 y se interpola. Coste O(n log n).
    const sumAt = lambda => { let s=0; for(let i=0;i<n;i++){ const x=lambda*base[i]; s+=x<minW?minW:(x>maxW?maxW:x); } return s; };
    const pts = [];
    for(let i=0;i<n;i++) pts.push(minW/base[i], maxW/base[i]);
    pts.sort((a,b)=>a-b);
    let lambda;
    if(sumAt(pts[0]) >= 1) lambda = pts[0];
    else {
      let lo = 0, hi = pts.length-1; // S(pts[lo]) < 1 <= S(pts[hi])
      while(hi-lo > 1){ const mid=(lo+hi)>>1; if(sumAt(pts[mid]) < 1) lo=mid; else hi=mid; }
      const sLo = sumAt(pts[lo]), sHi = sumAt(pts[hi]);
      lambda = sHi > sLo ? pts[lo] + (1-sLo)*(pts[hi]-pts[lo])/(sHi-sLo) : pts[hi];
    }
    const w = base.map(b => Math.min(maxW, Math.max(minW, lambda*b)));
    const s = w.reduce((a,b)=>a+b,0) || 1;
    // Corrección numérica mínima sin superar el máximo.
    return w.map((x,i) => signs[i] * Math.min(maxW, x/s));
  }

  // Generador pseudoaleatorio reproducible (mulberry32). Una misma semilla da la misma secuencia.
  function seededRandom(seed){
    let a = (Number(seed) >>> 0) || 0x9e3779b9;
    return function(){
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore||{}, { aggregateCandles, findClosedIndexAtOrBeforeTime, buildSignalSliceFromIndex, buildAlignedSignalSlice, buildAlignedSignalMap, evalInd, testFilter, evalRuleGroups, evalRuleGroupsDetailed, testFilterAligned, evalRuleGroupsDetailedAligned, fetchTicker, calcVolatility, calcSignalScore, avg:(arr)=>avg(arr)||0, std, clamp, boundWeights, seededRandom });
})();
