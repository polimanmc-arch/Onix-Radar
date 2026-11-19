// El evaluador rápido (backtest, alertas) y el del scanner deben dar el mismo valor en la última vela cerrada.
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
function daily(ticker,L=300,shift=0){
  const now=Math.floor(Date.UTC(2026,10,17,14,30)/1000);
  const closes=Array.from({length:L},(_,i)=>100+10*Math.sin((i+shift)*0.37)+3*Math.cos((i+shift)*1.3));
  const opens=closes.map((c,i)=>c*(1+0.004*Math.sin(i*2.1)));
  return {ticker,tf:'1d',ok:true,closes,opens,highs:closes.map((c,i)=>Math.max(c,opens[i])*1.01),lows:closes.map((c,i)=>Math.min(c,opens[i])*0.99),
    volumes:closes.map((_,i)=>1e6+1e4*i),times:closes.map((_,i)=>now-i*86400),price:closes[0],prevClose:closes[1]};
}

test('fast evaluator agrees with the scanner engine on the last closed candle for every indicator',()=>{
  const core=load();
  const d=daily('A',320);
  const ev=core.createRuleEvaluator();
  const cases=[['WMA',{p:30}],['SMA',{p:20}],['EMA',{p:20}],['RSI',{p:14}],['RSI',{p:4}],['STOCH',{p:14,ks:3,dp:3}],['MACD',{p:12,sl:26,sg:9}],['ATR',{p:14}],
    ['PRICE',{}],['CHG',{}],['GAP',{}],['DIST_HIGH',{p:20}],['DIST_LOW',{p:20}],['ADR_PCT',{p:20}],['AVG_VOL',{p:20}],['RVOL',{p:20}],['GREEN_COUNT',{p:10}],['EXT_EMA_PCT',{p:20}]];
  const slice=core.buildSignalSliceFromIndex(d,1);
  for(const [ind,params] of cases){
    const f={ind,tf:'1d',op:'>',cmpType:'prev',params};
    const fast=ev.testFilterAt(f,{'1d':d},{'1d':1});
    const scan=core.testFilterAligned(f,{'1d':slice,_meta:{}});
    assert.ok(fast.val!=null&&scan.val!=null,ind+' has values');
    assert.ok(Math.abs(fast.val-scan.val)<=1e-9*Math.max(1,Math.abs(scan.val)),`${ind}: fast ${fast.val} vs scanner ${scan.val}`);
    assert.equal(fast.pass,scan.pass,ind+' pass');
  }
});
