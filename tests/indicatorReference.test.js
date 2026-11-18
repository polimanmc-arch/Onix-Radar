// Comprobación cruzada de indicadores contra implementaciones de referencia independientes,
// escritas con las definiciones estándar (de antigua a reciente, como TA-Lib / Tulip):
//  SMA, WMA lineal, EMA sembrada con SMA, RSI de Wilder, %K estocástico suavizado,
//  histograma MACD (EMAs sembradas con SMA) y ATR de Wilder.
// Se comparan los dos motores de la app: el del scanner (calcX) y el evaluador rápido
// (backtest, rendimiento de señales, alertas), en varias velas del historial.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

function load(){
  const ctx=vm.createContext({window:{},console,setTimeout,clearTimeout,AbortController,Date,Math});
  for(const f of ['config/timeframes.js','core/indicators.js','core/engine.js','core/ruleEvaluator.js'])
    vm.runInContext(fs.readFileSync(path.join(root,'public/app',f),'utf8'),ctx);
  return ctx.window.StockScannerCore;
}

// ── Referencias (series de antigua a reciente; devuelven el valor en la última vela) ──
const sma=(x,n)=>x.slice(-n).reduce((a,b)=>a+b,0)/n;
const wma=(x,n)=>{ const s=x.slice(-n); let num=0,den=0; s.forEach((v,i)=>{ num+=v*(i+1); den+=i+1; }); return num/den; };
function emaSeries(x,n){ const k=2/(n+1); const out=Array(x.length).fill(null); let e=x.slice(0,n).reduce((a,b)=>a+b,0)/n; out[n-1]=e; for(let i=n;i<x.length;i++){ e=x[i]*k+e*(1-k); out[i]=e; } return out; }
function rsi(x,n){ let g=0,l=0; for(let i=1;i<=n;i++){ const d=x[i]-x[i-1]; if(d>0) g+=d; else l-=d; } let ag=g/n,al=l/n;
  for(let i=n+1;i<x.length;i++){ const d=x[i]-x[i-1]; ag=(ag*(n-1)+Math.max(d,0))/n; al=(al*(n-1)+Math.max(-d,0))/n; }
  return al===0?(ag===0?50:100):100-100/(1+ag/al); }
function stochK(h,l,c,n,smooth){ const raw=[]; for(let i=n-1;i<c.length;i++){ const hh=Math.max(...h.slice(i-n+1,i+1)), ll=Math.min(...l.slice(i-n+1,i+1)); raw.push(hh===ll?50:(c[i]-ll)/(hh-ll)*100); } return sma(raw,smooth); }
function macdHist(x,f,s,sig){ const ef=emaSeries(x,f), es=emaSeries(x,s); const line=[]; for(let i=s-1;i<x.length;i++) line.push(ef[i]-es[i]); const sg=emaSeries(line,sig); return line.at(-1)-sg.at(-1); }
function atr(h,l,c,n){ const tr=[]; for(let i=1;i<c.length;i++) tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1]))); let a=tr.slice(0,n).reduce((p,q)=>p+q,0)/n; for(let i=n;i<tr.length;i++) a=(a*(n-1)+tr[i])/n; return a; }

// Serie pseudoaleatoria reproducible con tendencia, ciclos y huecos.
function series(L=300,seed=7){
  let s=seed; const rnd=()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);
  const c=[]; let p=100; for(let i=0;i<L;i++){ p*=1+(rnd()-0.48)*0.04+0.01*Math.sin(i/9); c.push(+p.toFixed(4)); }
  const h=c.map(v=>v*(1+rnd()*0.02)), l=c.map(v=>v*(1-rnd()*0.02));
  return {c,h,l};
}
const close=(a,b,tol=1e-8)=>Math.abs(a-b)<=tol*Math.max(1,Math.abs(b));

test('scanner and fast evaluator match standard reference indicators at several candles',()=>{
  const core=load();
  const ev=core.createRuleEvaluator();
  for(const seed of [3,7,11]){
    const {c,h,l}=series(320,seed);
    // Newest-first, como en la app.
    const C=[...c].reverse(), Hh=[...h].reverse(), Ll=[...l].reverse();
    const d={ok:true,closes:C,highs:Hh,lows:Ll,opens:C};
    const cases=[
      ['SMA',{p:20},(x)=>sma(x.c,20)],
      ['WMA',{p:30},(x)=>wma(x.c,30)],
      ['EMA',{p:20},(x)=>emaSeries(x.c,20).at(-1)],
      ['RSI',{p:14},(x)=>rsi(x.c,14)],
      ['RSI',{p:4},(x)=>rsi(x.c,4)],
      ['STOCH',{p:14,ks:3,dp:3},(x)=>stochK(x.h,x.l,x.c,14,3)],
      ['MACD',{p:12,sl:26,sg:9},(x)=>macdHist(x.c,12,26,9)],
      ['ATR',{p:14},(x)=>atr(x.h,x.l,x.c,14)],
    ];
    for(const offset of [0,1,25]){
      // Referencia sobre el historial hasta la vela `offset` (sin velas posteriores).
      const end=c.length-offset;
      const x={c:c.slice(0,end),h:h.slice(0,end),l:l.slice(0,end)};
      for(const [ind,params,ref] of cases){
        const expected=ref(x);
        const fast=ev.getSeries(d,ind,params)[offset];
        assert.ok(close(fast,expected),`${ind}${JSON.stringify(params)} fast@${offset} seed ${seed}: ${fast} vs ${expected}`);
        const slice={...d,closes:C.slice(offset),highs:Hh.slice(offset),lows:Ll.slice(offset),opens:C.slice(offset)};
        const scan=core.evalInd(ind,params,{...slice,prevClose:slice.closes[1]})[0];
        assert.ok(close(scan,expected),`${ind}${JSON.stringify(params)} scanner@${offset} seed ${seed}: ${scan} vs ${expected}`);
      }
    }
  }
});
