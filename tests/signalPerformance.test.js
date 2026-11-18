const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');

function load(){
  const ctx=vm.createContext({window:{},console,setTimeout,clearTimeout,AbortController,Date,Math});
  for(const f of ['config/timeframes.js','core/indicators.js','core/engine.js','core/ruleEvaluator.js','core/signalPerformance.js'])
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

test('signal performance: forward returns enter at next open and exit at the close h bars later',async()=>{
  const core=load();
  const data={A:{'1d':daily('A')},B:{'1d':daily('B',300,7)},__metaCoverage:{}};
  const filters=[{ind:'PRICE',tf:'1d',op:'<',cmpType:'val',cmpVal:97,params:{}}];
  const out=await core.computeSignalPerformance({dataByTicker:data,filters,direction:'long'});
  assert.equal(out.ok,true);
  assert.equal(out.baseTf,'1d');
  assert.equal(out.tickersUsed,2);
  // Cálculo independiente para el horizonte de 5 días.
  const sig=[],base=[];
  for(const t of ['A','B']){
    const d=data[t]['1d'];
    for(let i=d.closes.length-2;i>=1;i--){
      if(i-5<1) continue;
      const r=d.closes[i-5]/d.opens[i-1]-1;
      base.push(r); if(d.closes[i]<97) sig.push(r);
    }
  }
  const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
  const h5=out.aggregate[0];
  assert.equal(h5.bars,5);
  assert.equal(h5.n,sig.length);
  assert.ok(Math.abs(h5.mean-mean(sig))<1e-12);
  assert.ok(Math.abs(h5.baseMean-mean(base))<1e-12);
  assert.ok(Math.abs(h5.edge-(mean(sig)-mean(base)))<1e-12);
  // Shorts invierten el signo del retorno.
  const short=await core.computeSignalPerformance({dataByTicker:data,filters,direction:'short'});
  assert.ok(Math.abs(short.aggregate[0].mean+h5.mean)<1e-12);
  assert.ok(out.byTicker.A.signals>0 && out.byTicker.A.episodes<=out.byTicker.A.signals);
});

test('signal performance never uses a forming weekly candle for a daily base',async()=>{
  const core=load();
  const d=daily('A',400);
  // Semanal: todas las velas a 100 salvo la semana en curso (índice 0), a 1000.
  const wkTimes=Array.from({length:80},(_,i)=>d.times[0]-((new Date(d.times[0]*1000).getUTCDay()+6)%7)*86400-i*7*86400);
  const wk={ticker:'A',tf:'1wk',ok:true,closes:wkTimes.map((_,i)=>i===0?1000:100),opens:wkTimes.map(()=>100),highs:wkTimes.map(()=>1000),lows:wkTimes.map(()=>90),volumes:wkTimes.map(()=>1),times:wkTimes};
  const filters=[{ind:'PRICE',tf:'1wk',op:'>',cmpType:'val',cmpVal:500,params:{}},{ind:'PRICE',tf:'1d',op:'>',cmpType:'val',cmpVal:0,params:{}}];
  const out=await core.computeSignalPerformance({dataByTicker:{A:{'1d':d,'1wk':wk}},filters});
  assert.equal(out.signals,0,'the forming weekly close (1000) must never be visible');
  const control=await core.computeSignalPerformance({dataByTicker:{A:{'1d':d,'1wk':wk}},filters:[{...filters[0],cmpVal:50},filters[1]]});
  assert.ok(control.signals>300,'closed weekly candles are visible: '+control.signals);
});

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
