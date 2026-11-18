// Evaluador rápido de reglas compartido por Backtest y Rendimiento de señales.
// Calcula cada indicador una vez por serie (caché por objeto de datos) y evalúa reglas en
// cualquier índice histórico. Las series están ordenadas de reciente a antigua (índice 0 = actual).
(function(){
  // Instante en que una barra queda cerrada (times = inicio de barra, en segundos).
  // Mensual: inicio del mes siguiente (calendario); resto: inicio + duración nominal.
  const TF_SECONDS={'4h':4*3600,'1d':86400,'1wk':7*86400};
  const barCloseTime=(tf,start)=>{
    if(start==null) return null;
    if(tf==='1mo'){
      const d=new Date((start+43200)*1000); // +12 h: medianoche local europea/asiática cae en su mes
      return Math.floor(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)/1000);
    }
    return start+(TF_SECONDS[tf]||86400);
  };
  // Índice (más reciente primero) de la última barra de `tf` ya cerrada en `decisionTime`.
  // Evita usar el cierre de una vela que todavía está formándose (sesgo de futuro).
  const findClosedIndexAt=(d,tf,decisionTime)=>{
    const times=d?.times;
    if(!times?.length||decisionTime==null) return -1;
    let lo=0, hi=times.length-1, ans=-1;
    while(lo<=hi){
      const mid=(lo+hi)>>1;
      if(barCloseTime(tf,times[mid])<=decisionTime){ ans=mid; hi=mid-1; }
      else lo=mid+1;
    }
    return ans;
  };

  function createRuleEvaluator(){
    const stats={evalCount:0,fallbackCount:0};
      const indicatorSeriesCache = new WeakMap();
      const getSeriesCache = (d) => {
        let m=indicatorSeriesCache.get(d);
        if(!m){ m=new Map(); indicatorSeriesCache.set(d,m); }
        return m;
      };
      const paramsKey = (p={}) => [p.p||'',p.ks||'',p.dp||'',p.sl||'',p.sg||''].join(':');
      const buildSeries = (d, ind, params={}) => {
        const L=d?.closes?.length||0;
        const out=Array(L).fill(null);
        if(!d?.ok || L<2) return out;
        const p=Math.max(1,Number(params.p)||20);
        if(ind==='PRICE') return d.closes.slice();
        if(ind==='VOL') return (d.volumes||[]).slice();
        if(ind==='CHG'){
          for(let i=0;i<L-1;i++) if(d.closes[i+1]) out[i]=((d.closes[i]-d.closes[i+1])/d.closes[i+1])*100;
          return out;
        }
        if(ind==='GAP'){
          for(let i=0;i<L-1;i++) if(d.closes[i+1]&&d.opens?.[i]!=null) out[i]=((d.opens[i]-d.closes[i+1])/d.closes[i+1])*100;
          return out;
        }
        if(ind==='SMA'){
          let sum=0;
          for(let i=L-1;i>=0;i--){
            sum+=Number(d.closes[i])||0;
            if(i+p<L) sum-=Number(d.closes[i+p])||0;
            if(i+p<=L) out[i]=sum/p;
          }
          return out;
        }
        if(ind==='WMA'){
          const denom=p*(p+1)/2;
          for(let i=0;i+p<=L;i++){
            let s=0;
            for(let j=0;j<p;j++) s+=(Number(d.closes[i+j])||0)*(p-j);
            out[i]=s/denom;
          }
          return out;
        }
        if(ind==='EMA'){
          if(L<p) return out;
          const k=2/(p+1);
          let ema=0;
          for(let i=L-1;i>=L-p;i--) ema+=Number(d.closes[i])||0;
          ema/=p;
          out[L-p]=ema;
          for(let i=L-p-1;i>=0;i--){
            ema=(Number(d.closes[i])||0)*k+ema*(1-k);
            out[i]=ema;
          }
          return out;
        }
        if(ind==='RSI'){
          if(L<p+1) return out;
          let gains=0,losses=0;
          for(let i=L-1;i>=L-p;i--){
            const diff=(Number(d.closes[i-1])||0)-(Number(d.closes[i])||0);
            if(diff>0) gains+=diff; else losses-=diff;
          }
          let avgG=gains/p, avgL=losses/p;
          out[L-p-1]=avgL===0&&avgG===0?50:avgL===0?100:100-100/(1+avgG/avgL);
          for(let i=L-p-2;i>=0;i--){
            const diff=(Number(d.closes[i])||0)-(Number(d.closes[i+1])||0);
            avgG=(avgG*(p-1)+(diff>0?diff:0))/p;
            avgL=(avgL*(p-1)+(diff<0?-diff:0))/p;
            out[i]=avgL===0&&avgG===0?50:avgL===0?100:100-100/(1+avgG/avgL);
          }
          return out;
        }
        if(ind==='STOCH'){
          const kS=Math.max(1,Number(params.ks)||1);
          const raw=Array(L).fill(null);
          for(let i=0;i+p<=L;i++){
            let hh=-Infinity,ll=Infinity;
            for(let j=0;j<p;j++){ hh=Math.max(hh,Number(d.highs?.[i+j])||-Infinity); ll=Math.min(ll,Number(d.lows?.[i+j])||Infinity); }
            raw[i]=hh===ll?50:(((Number(d.closes[i])||0)-ll)/(hh-ll))*100;
          }
          for(let i=0;i+kS<=L;i++){
            let sum=0,ok=true;
            for(let j=0;j<kS;j++){ if(raw[i+j]==null){ ok=false; break; } sum+=raw[i+j]; }
            if(ok) out[i]=sum/kS;
          }
          return out;
        }
        if(ind==='MACD'){
          const fast=Math.max(1,Number(params.p)||12), slow=Math.max(fast+1,Number(params.sl)||26), sig=Math.max(1,Number(params.sg)||9);
          const emaOldest=(arr,n)=>{
            if(arr.length<n) return [];
            const k=2/(n+1), res=[];
            let ema=0;
            for(let i=0;i<n;i++) ema+=arr[i]||0;
            ema/=n; res.push(ema);
            for(let i=n;i<arr.length;i++){ ema=(arr[i]||0)*k+ema*(1-k); res.push(ema); }
            return res;
          };
          const oldest=[...d.closes].reverse();
          const ef=emaOldest(oldest,fast), es=emaOldest(oldest,slow);
          if(!ef.length||!es.length) return out;
          const off=slow-fast, line=[];
          for(let i=0;i<es.length;i++) line.push(ef[i+off]-es[i]);
          const signal=emaOldest(line,sig);
          if(!signal.length) return out;
          const startLine=line.length-signal.length;
          for(let i=0;i<signal.length;i++){
            const oldestIdx=slow+sig-2+i;
            const newestIdx=L-1-oldestIdx;
            if(newestIdx>=0&&newestIdx<L) out[newestIdx]=line[i+startLine]-signal[i];
          }
          return out;
        }
        if(ind==='ATR') return window.StockScannerCore.seriesATRNewestFirst(d.highs,d.lows,d.closes,p);
        return null;
      };
      const getSeries = (d, ind, params={}) => {
        const key=ind+'|'+paramsKey(params);
        const cache=getSeriesCache(d);
        if(cache.has(key)) return cache.get(key);
        const series=buildSeries(d,ind,params);
        if(series) cache.set(key,series);
        return series;
      };
      const avgRangeAt=(d,idx,n)=>{
        let sum=0,count=0;
        for(let i=idx;i<Math.min(idx+n,d.closes.length);i++){
          const c=d.closes[i]; if(!c) continue;
          sum+=((d.highs[i]-d.lows[i])/c)*100; count++;
        }
        return count?sum/count:null;
      };
      const avgAt=(arr,idx,n)=>{
        let sum=0,count=0;
        for(let i=idx;i<Math.min(idx+n,arr?.length||0);i++){ if(arr[i]!=null){ sum+=Number(arr[i])||0; count++; } }
        return count?sum/count:null;
      };
      const highestAt=(arr,idx,n)=>{
        let v=-Infinity,count=0;
        for(let i=idx;i<Math.min(idx+n,arr?.length||0);i++){ if(arr[i]!=null){ v=Math.max(v,arr[i]); count++; } }
        return count?v:null;
      };
      const lowestAt=(arr,idx,n)=>{
        let v=Infinity,count=0;
        for(let i=idx;i<Math.min(idx+n,arr?.length||0);i++){ if(arr[i]!=null){ v=Math.min(v,arr[i]); count++; } }
        return count?v:null;
      };
      const countDirAt=(opens,closes,idx,n,dir)=>{
        let count=0;
        for(let i=idx;i<Math.min(idx+n,opens?.length||0,closes?.length||0);i++){
          if(dir==='up' ? closes[i]>opens[i] : closes[i]<opens[i]) count++;
        }
        return count;
      };
      const consecDirAt=(opens,closes,idx,dir)=>{
        let count=0;
        for(let i=idx;i<Math.min(opens?.length||0,closes?.length||0);i++){
          const ok=dir==='up' ? closes[i]>opens[i] : closes[i]<opens[i];
          if(!ok) break; count++;
        }
        return count;
      };
      const currentVwapAt=(d,idx)=>{
        let pv=0,vol=0;
        for(let i=(d.closes?.length||0)-1;i>=idx;i--){
          const v=d.volumes?.[i]||0;
          if(!v) continue;
          pv+=(((d.highs?.[i]||0)+(d.lows?.[i]||0)+(d.closes?.[i]||0))/3)*v;
          vol+=v;
        }
        return vol>0?pv/vol:null;
      };
      const metaValueFast=(id, meta={})=>{
        const pctVal=v=>{ const n=Number(v); return Number.isFinite(n)?(Math.abs(n)<=1?n*100:n):null; };
        const numVal=v=>{ const n=Number(v); return Number.isFinite(n)?n:null; };
        const txtVal=v=>v==null?null:String(v).trim()||null;
        switch(id){
          case 'SECTOR': return txtVal(meta.sector);
          case 'INDUSTRY': return txtVal(meta.industry);
          case 'COUNTRY': return txtVal(meta.country);
          case 'EXCHANGE': return txtVal(meta.exchange);
          case 'MARKET_CAP': return numVal(meta.marketCap);
          case 'FLOAT': return numVal(meta.floatShares);
          case 'SHARES_OUT': return numVal(meta.sharesOutstanding);
          case 'SHORT_INT_PCT': return pctVal(meta.shortInterestPct);
          case 'INST_OWN_PCT': return pctVal(meta.institutionalOwnershipPct);
          case 'INSIDER_OWN_PCT': return pctVal(meta.insiderOwnershipPct);
          case 'BETA': return numVal(meta.beta);
          case 'PE': return numVal(meta.peRatio);
          case 'FWD_PE': return numVal(meta.forwardPE);
          case 'PS': return numVal(meta.priceToSales);
          case 'PB': return numVal(meta.priceToBook);
          case 'EV_EBITDA': return numVal(meta.evToEbitda);
          case 'DEBT_EQUITY': return numVal(meta.debtToEquity);
          case 'CURRENT_RATIO': return numVal(meta.currentRatio);
          case 'ROE': return pctVal(meta.roe);
          case 'ROA': return pctVal(meta.roa);
          case 'GROSS_MARGIN': return pctVal(meta.grossMargin);
          case 'OPER_MARGIN': return pctVal(meta.operatingMargin);
          case 'REV_GROWTH': return pctVal(meta.revenueGrowth);
          case 'EPS_GROWTH': return pctVal(meta.epsGrowth);
          case 'FCF_YIELD': return pctVal(meta.freeCashFlowYield);
          default: return null;
        }
      };
      const evalIndAt=(id,params,d,idx,meta={})=>{
        if(idx==null||idx<0) return [null,null];
        const p=Math.max(1,Number(params?.p)||20);
        if(['SECTOR','INDUSTRY','COUNTRY','EXCHANGE','MARKET_CAP','FLOAT','SHARES_OUT','SHORT_INT_PCT','INST_OWN_PCT','INSIDER_OWN_PCT','BETA','PE','FWD_PE','PS','PB','EV_EBITDA','DEBT_EQUITY','CURRENT_RATIO','ROE','ROA','GROSS_MARGIN','OPER_MARGIN','REV_GROWTH','EPS_GROWTH','FCF_YIELD'].includes(id)){
          const v=metaValueFast(id,meta); return [v,v];
        }
        const series=getSeries(d,id,params);
        if(series) return [series[idx] ?? null, series[idx+1] ?? null];
        stats.fallbackCount++;
        if(id==='DIST_HIGH'){
          const hh0=highestAt(d.highs,idx,p), hh1=highestAt(d.highs,idx+1,p);
          return [hh0&&d.closes[idx]!=null?((d.closes[idx]/hh0)-1)*100:null, hh1&&d.closes[idx+1]!=null?((d.closes[idx+1]/hh1)-1)*100:null];
        }
        if(id==='DIST_LOW'){
          const ll0=lowestAt(d.lows,idx,p), ll1=lowestAt(d.lows,idx+1,p);
          return [ll0&&d.closes[idx]!=null?((d.closes[idx]/ll0)-1)*100:null, ll1&&d.closes[idx+1]!=null?((d.closes[idx+1]/ll1)-1)*100:null];
        }
        if(id==='ADR_PCT') return [avgRangeAt(d,idx,p), avgRangeAt(d,idx+1,p)];
        if(id==='AVG_VOL') return [avgAt(d.volumes,idx,p), avgAt(d.volumes,idx+1,p)];
        if(id==='RVOL'){
          const avg0=avgAt(d.volumes,idx+1,p), avg1=avgAt(d.volumes,idx+2,p);
          return [avg0?(d.volumes?.[idx]||0)/avg0:null, avg1?(d.volumes?.[idx+1]||0)/avg1:null];
        }
        if(id==='DOLLAR_VOL') return [d.closes?.[idx]!=null&&d.volumes?.[idx]!=null?d.closes[idx]*d.volumes[idx]:null, d.closes?.[idx+1]!=null&&d.volumes?.[idx+1]!=null?d.closes[idx+1]*d.volumes[idx+1]:null];
        if(id==='GREEN_COUNT') return [countDirAt(d.opens,d.closes,idx,p,'up'), countDirAt(d.opens,d.closes,idx+1,p,'up')];
        if(id==='RED_COUNT') return [countDirAt(d.opens,d.closes,idx,p,'dn'), countDirAt(d.opens,d.closes,idx+1,p,'dn')];
        if(id==='CONSEC_UP') return [consecDirAt(d.opens,d.closes,idx,'up'), consecDirAt(d.opens,d.closes,idx+1,'up')];
        if(id==='CONSEC_DN') return [consecDirAt(d.opens,d.closes,idx,'dn'), consecDirAt(d.opens,d.closes,idx+1,'dn')];
        if(id==='EXT_EMA_PCT'){
          const ema=getSeries(d,'EMA',params);
          return [ema?.[idx]&&d.closes?.[idx]!=null?((d.closes[idx]/ema[idx])-1)*100:null, ema?.[idx+1]&&d.closes?.[idx+1]!=null?((d.closes[idx+1]/ema[idx+1])-1)*100:null];
        }
        if(id==='EXT_VWAP_PCT'){
          const v0=currentVwapAt(d,idx), v1=currentVwapAt(d,idx+1);
          return [v0&&d.closes?.[idx]!=null?((d.closes[idx]/v0)-1)*100:null, v1&&d.closes?.[idx+1]!=null?((d.closes[idx+1]/v1)-1)*100:null];
        }
        return [null,null];
      };
      const compareFast=(cur,cmp,op)=>{
        if(op==='>') return cur>cmp;
        if(op==='<') return cur<cmp;
        if(op==='>=') return cur>=cmp;
        if(op==='<=') return cur<=cmp;
        return false;
      };
      const testFilterAt=(f,dataByTf,idxByTf)=>{
        const d=dataByTf?.[f.tf];
        const idx=idxByTf?.[f.tf];
        const meta=dataByTf?._meta||{};
        if(!d?.ok && !meta) return {pass:false,val:null,cmp:null};
        const [cur,prev]=evalIndAt(f.ind,f.params,d||{ok:false},idx,meta);
        if(cur==null) return {pass:false,val:null,cmp:null};
        if(['SECTOR','INDUSTRY','COUNTRY','EXCHANGE'].includes(f.ind)){
          const left=String(cur||'').trim().toLowerCase();
          const right=String(f.cmpVal??'').trim().toLowerCase();
          return {pass:f.op==='<'?left!==right:left===right,val:cur,cmp:f.cmpVal??''};
        }
        let cmp=null, cmpPrev=null;
        if(f.cmpType==='val'){ cmp=f.cmpVal; cmpPrev=f.cmpVal; }
        else if(f.cmpType==='prev'){ cmp=prev; cmpPrev=null; }
        else{
          const [iv,ip]=evalIndAt(f.cmpInd,f.cmpParams,d||{ok:false},idx,meta);
          cmp=iv; cmpPrev=ip;
        }
        if(cmp==null) return {pass:false,val:cur,cmp:null};
        let pass=false;
        if(['>','<','>=','<='].includes(f.op)) pass=compareFast(cur,cmp,f.op);
        else if(f.op==='x_up') pass=cur>cmp&&prev!=null&&cmpPrev!=null&&prev<=cmpPrev;
        else if(f.op==='x_dn') pass=cur<cmp&&prev!=null&&cmpPrev!=null&&prev>=cmpPrev;
        return {pass,val:cur,cmp};
      };
      const evalRuleGroupsDetailedFast=(groups,dataByTf,idxByTf)=>{
        stats.evalCount++;
        for(let gi=0;gi<(groups||[]).length;gi++){
          const grp=groups[gi]; let gp=true; const vals=[];
          for(const c of (grp.conditions||[])){
            const r=testFilterAt(c,dataByTf,idxByTf);
            const lbl=c.ind+(c.params?.p?'('+c.params.p+')':'')+' ['+(c.tf||'?')+'] '+c.op+' '+(c.cmpType==='val'?c.cmpVal:c.cmpType==='prev'?'prev':c.cmpInd);
            vals.push({lbl,pass:r.pass,val:r.val,cmp:r.cmp});
            if(!r.pass){ gp=false; break; }
          }
          if(gp) return {matched:true,groupIdx:gi+1,conditions:vals};
        }
        return {matched:false,groupIdx:0,conditions:[]};
      };
    return { stats, getSeries, evalIndAt, testFilterAt, evalRuleGroupsAt: evalRuleGroupsDetailedFast };
  }

  window.StockScannerCore = Object.assign(window.StockScannerCore||{}, { createRuleEvaluator, barCloseTime, findClosedIndexAt });
})();
