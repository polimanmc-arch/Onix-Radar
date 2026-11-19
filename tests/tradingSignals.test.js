// Comprobación cruzada con la librería trading-signals (MIT, validada contra Tulip Indicators).
// SMA, WMA y estocástico deben coincidir exactamente. EMA, RSI, ATR y MACD pueden sembrarse de
// otra forma en la librería: tras 300 velas la diferencia inicial se desvanece, así que se
// comparan en la última vela con una tolerancia relativa pequeña.
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
function series(L,seed){
  let s=seed; const rnd=()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);
  const c=[]; let p=100; for(let i=0;i<L;i++){ p*=1+(rnd()-0.48)*0.04+0.01*Math.sin(i/9); c.push(+p.toFixed(4)); }
  return {c,h:c.map(v=>v*(1+rnd()*0.02)),l:c.map(v=>v*(1-rnd()*0.02))};
}
function feed(ind,values){ let r=null; for(const v of values) r=ind.update(v,false); return r; }

test('indicators match the trading-signals library',async()=>{
  const ts=await import('trading-signals');
  const core=load();
  const ev=core.createRuleEvaluator();
  for(const seed of [5,13]){
    const {c,h,l}=series(300,seed);
    const candles=c.map((close,i)=>({close,high:h[i],low:l[i]}));
    const d={ok:true,closes:[...c].reverse(),highs:[...h].reverse(),lows:[...l].reverse(),opens:[...c].reverse()};
    const ours=(ind,params)=>ev.getSeries(d,ind,params)[0];
    const checks=[
      ['SMA(20)',ours('SMA',{p:20}),feed(new ts.SMA(20),c),1e-10],
      ['WMA(30)',ours('WMA',{p:30}),feed(new ts.WMA(30),c),1e-10],
      ['EMA(20)',ours('EMA',{p:20}),feed(new ts.EMA(20),c),1e-6],
      ['RSI(14)',ours('RSI',{p:14}),feed(new ts.RSI(14),c),1e-6],
      ['ATR(14)',ours('ATR',{p:14}),feed(new ts.ATR(14),candles),1e-6],
      ['MACD(12,26,9)',ours('MACD',{p:12,sl:26,sg:9}),feed(new ts.MACD(new ts.EMA(12),new ts.EMA(26),new ts.EMA(9)),c)?.histogram,1e-6],
      ['STOCH(14,3)',ours('STOCH',{p:14,ks:3}),feed(new ts.StochasticOscillator({kPeriod:14,kSlowingPeriod:3,dPeriod:3}),candles)?.stochK,1e-8],
    ];
    for(const [name,a,b,tol] of checks){
      assert.ok(Number.isFinite(a)&&Number.isFinite(Number(b)),`${name}: ${a} / ${b}`);
      const rel=Math.abs(a-Number(b))/Math.max(1,Math.abs(Number(b)));
      assert.ok(rel<=tol,`${name} seed ${seed}: Radar Onix ${a} vs trading-signals ${b} (rel ${rel.toExponential(2)})`);
    }
  }
});
