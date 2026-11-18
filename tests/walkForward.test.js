const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const noop=()=>{};

function load(){
  const ctx=vm.createContext({window:{},console,setTimeout,clearTimeout,AbortController,Date,Math});
  for(const f of ['config/timeframes.js','config/indicators.js','core/indicators.js','core/engine.js','core/ruleEvaluator.js','core/backtestWorkflow.js','core/walkForward.js'])
    vm.runInContext(fs.readFileSync(path.join(root,'public/app',f),'utf8'),ctx);
  const core=ctx.window.StockScannerCore;
  core.fetchTicker=async(t,tf)=>({ticker:t,tf,ok:false,error:'sin datos'});
  return core;
}
function weekly(ticker,shift){
  const L=220, now=1800000000;
  const closes=Array.from({length:L},(_,i)=>100+15*Math.sin((i+shift)*0.35)+0.05*(L-i));
  const opens=closes.map((c,i)=>c*(1+0.003*Math.cos(i)));
  return {ticker,name:ticker,tf:'1wk',ok:true,closes,opens,highs:closes.map((c,i)=>Math.max(c,opens[i])*1.01),lows:closes.map((c,i)=>Math.min(c,opens[i])*0.99),
    volumes:closes.map(()=>1e6),times:closes.map((_,i)=>now-i*7*86400),price:closes[0],prevClose:closes[1]};
}
function baseConfig(){
  const cache={};
  ['A','B','C','D'].forEach((t,k)=>{ cache[t]={'1wk':weekly(t,k*3)}; });
  const cond=(ind,op,cmpVal,p)=>({ind,tf:'1wk',op,cmpType:'val',cmpVal,params:{p}});
  return {
    entryRules:[{conditions:[cond('RSI','<',40,4)]}],exitRules:[{conditions:[cond('RSI','>',60,4)]}],shortEntryRules:[],shortExitRules:[],
    btDirection:'long',stopATR:false,stopATRMult:2,stopPct:false,stopPctVal:8,btWeeks:150,btCapital:100000,pfMaxPos:4,pfRiskFree:0,
    btBenchmark:'ZZBENCH',btCommission:0.1,btSlippage:0,pfStopATRPeriod:14,pfMinWeight:1,pfMaxWeight:25,pfMode:'maxsharpe',btAllocationMode:'equal',
    btUniverseSource:'scan',btCustomTickers:'',btUniverseLimit:0,savedUniverseLists:[],mktFilterEnabled:false,mktFilterRules:[],
    dataCacheRef:{current:cache},
  };
}

test('folds are contiguous: each OOS window starts right after its IS window and OOS windows chain without gaps',()=>{
  const core=load();
  for(const anchored of [false,true]){
    const folds=core.buildWalkForwardFolds({totalWeeks:150,isWeeks:52,oosWeeks:13,anchored});
    assert.ok(folds.length>=5);
    folds.forEach((f,k)=>{
      assert.equal(f.oosStart,f.isEnd+1);
      assert.equal(f.isStart-f.isEnd-1,anchored?52+k*13:52,'IS signal weeks');
      assert.equal(f.oosStart-f.oosEnd-1,13,'OOS signal weeks');
      if(k>0) assert.equal(f.oosStart,folds[k-1].oosEnd+1,'OOS windows are contiguous');
      assert.ok(f.oosEnd>=0);
    });
  }
});

test('backtest window simulates exactly the requested weeks',async()=>{
  const core=load();
  const cfg=baseConfig();
  let r;
  await core.runBacktestWorkflow({...cfg,btWeeks:80,btEndOffset:30,savedStrategiesLength:0,abortSignal:null,setBtRunning:noop,setBtProgress:noop,setTab:noop,setBacktest:x=>{r=x;}});
  assert.equal(r.equityCurve.length,80-30-1);
  const times=cfg.dataCacheRef.current.A['1wk'].times;
  assert.equal(r.windowStart,times[79]);
  assert.equal(r.windowEnd,times[31]);
  assert.equal(r.benchCurve,null);
});

test('optimizable parameters come from the active rules and do not mutate the base config',()=>{
  const core=load();
  const cfg=baseConfig();
  const params=core.listOptimizableParams(cfg);
  const ids=params.map(p=>p.id);
  assert.ok(ids.includes('entryRules.0.0.cmpVal') && ids.includes('entryRules.0.0.p') && ids.includes('exitRules.0.0.cmpVal'));
  assert.ok(!ids.some(id=>id.startsWith('short')),'short rules are ignored for a long-only backtest');
  const p=params.find(x=>x.id==='entryRules.0.0.cmpVal');
  const next=core.applyWalkForwardParams(cfg,[p],[25]);
  assert.equal(next.entryRules[0].conditions[0].cmpVal,25);
  assert.equal(cfg.entryRules[0].conditions[0].cmpVal,40);
});

test('walk-forward picks parameters in sample, applies them out of sample and stitches the OOS curve',async()=>{
  const core=load();
  const cfg=baseConfig();
  const all=core.listOptimizableParams(cfg);
  const params=[all.find(x=>x.id==='entryRules.0.0.cmpVal'),all.find(x=>x.id==='exitRules.0.0.cmpVal')];
  const ranges=[{from:30,to:45,step:5},{from:55,to:70,step:15}];
  const progress=[];
  const out=await core.runWalkForward({base:cfg,params,ranges,isWeeks:52,oosWeeks:20,objective:'sharpe',minTrades:1,onProgress:p=>progress.push(p)});
  assert.equal(out.ok,true,out.message);
  assert.equal(out.combos,8);
  assert.equal(out.grid.length,8);
  const folds=core.buildWalkForwardFolds({totalWeeks:150,isWeeks:52,oosWeeks:20});
  assert.equal(out.folds.length,folds.length);
  assert.equal(out.runs,8+folds.length*8+folds.length*2);
  assert.equal(progress.at(-1).done,out.runs);
  // La curva OOS cubre exactamente las semanas de las ventanas OOS.
  assert.equal(out.wf.curve.length,folds.length*20);
  assert.equal(out.baseline.curve.length,folds.length*20);
  for(const f of out.folds){
    assert.ok([30,35,40,45].includes(f.values[0]) && [55,70].includes(f.values[1]));
    // Lo elegido es el máximo dentro de muestra de ese tramo.
    assert.ok(Number.isFinite(f.isScore));
  }
  // Tiempos OOS crecientes y sin solapes.
  const t=out.wf.curve.map(p=>p.time);
  for(let i=1;i<t.length;i++) assert.ok(t[i]>t[i-1]);
});

test('walk-forward can be cancelled',async()=>{
  const core=load();
  const cfg=baseConfig();
  const all=core.listOptimizableParams(cfg);
  const ac=new AbortController();
  const out=await core.runWalkForward({base:cfg,params:[all[0]],ranges:[{from:2,to:6,step:1}],isWeeks:52,oosWeeks:20,abortSignal:ac.signal,
    onProgress:p=>{ if(p.done>=3) ac.abort(); }});
  assert.equal(out.ok,false);
  assert.equal(out.cancelled,true);
});
