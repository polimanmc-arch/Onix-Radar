const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const root = path.resolve(__dirname,'..');
const noop = ()=>{};
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms));
const plain = value=>JSON.parse(JSON.stringify(value));

function harness(workflow, fetchTicker, baseline=false){
  let seed=12345;
  const math=Object.create(Math);
  math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const ctx=vm.createContext({window:{},console,setTimeout,AbortController,Date,Math:math});
  for(const file of ['config/timeframes.js','core/indicators.js','core/engine.js']){
    vm.runInContext(fs.readFileSync(path.join(root,'public/app',file),'utf8'),ctx);
  }
  ctx.window.StockScannerCore.fetchTicker=fetchTicker;
  const file=baseline?path.join(process.env.ONIX_PERF_BASELINE,workflow+'.js'):path.join(root,'public/app/core',workflow+'.js');
  vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
  return ctx.window.StockScannerCore;
}

function series(ticker,tf){
  const offset=Number(ticker.replace(/\D/g,''))||0;
  const closes=Array.from({length:125},(_,i)=>100+offset*.5-i*.13+Math.sin(i*.4+offset)*3);
  return {ticker,name:'Company '+ticker,tf,ok:true,closes,opens:closes,
    highs:closes.map(x=>x+1),lows:closes.map(x=>x-1),volumes:closes.map(()=>10000),
    times:closes.map((_,i)=>1800000000-i*604800),price:closes[0]};
}
const rules=[{ind:'PRICE',tf:'1d',op:'>',cmpType:'val',cmpVal:0,params:{}}];
function scanOptions(tickers){
  const state={results:[],progress:null,publishes:0,logs:[],sectors:0};
  const opts={scanning:false,tickers,filters:rules,shortFilters:[],scanDirection:'long',conc:2,minHistoryYears:0,
    abortRef:{current:null},dataCacheRef:{current:{}},setScanning:noop,setSearch:noop,setOnlyPass:noop,setTab:noop,
    setResults:rows=>{state.results=plain(rows);state.publishes++;},setProg:p=>{state.progress=p;},
    addLog:msg=>state.logs.push(msg),fetchSectors:async()=>{state.sectors++;return {};},setSectorData:noop};
  return {opts,state};
}

test('scanner keeps free slots working when another ticker is slow; preserves input order',{timeout:5000},async()=>{
  const starts=[], finishes=[];
  let releaseSlow;
  const slow=new Promise(resolve=>{releaseSlow=resolve;});
  let active=0,peak=0;
  const core=harness('scannerWorkflow',async(t,tf)=>{
    starts.push(t);active++;peak=Math.max(peak,active);
    if(t==='T0')await slow;else await sleep(4);
    active--;finishes.push(t);
    if(t==='T3')releaseSlow();
    return series(t,tf);
  });
  const {opts,state}=scanOptions(['T0','T1','T2','T3']);
  await core.runScanWorkflow(opts);
  assert.equal(peak,2);
  assert.ok(finishes.indexOf('T3')<finishes.indexOf('T0'));
  assert.deepEqual(state.results.map(r=>r.ticker),opts.tickers);
  assert.equal(state.progress.done,4);
  assert.ok(state.results.every(r=>r.passed));
});

test('scanner cancellation publishes completed rows and starts no more requests',async()=>{
  let requests=0;
  const {opts,state}=scanOptions(Array.from({length:40},(_,i)=>'T'+i));
  const core=harness('scannerWorkflow',async(t,tf,signal)=>{
    requests++;
    if(t==='T0') return series(t,tf);
    await sleep(10);
    opts.abortRef.current.abort();
    return {ticker:t,tf,ok:false,error:signal.aborted?'aborted':'error'};
  });
  await core.runScanWorkflow(opts);
  assert.ok(requests<=3);
  assert.deepEqual(state.results.map(r=>r.ticker),['T0']);
  assert.equal(state.progress.done,1);
  assert.equal(state.sectors,0);
  assert.ok(state.logs.some(s=>s.includes('Cancelado')));
});

test('scanner handles failed symbols and throttles cached-result publications',async()=>{
  const {opts,state}=scanOptions(Array.from({length:300},(_,i)=>'T'+i));
  opts.conc=8;
  const core=harness('scannerWorkflow',async(t,tf)=>{
    if(t==='T2') throw Error('unavailable');
    return series(t,tf);
  });
  await core.runScanWorkflow(opts);
  assert.equal(state.results.length,300);
  assert.equal(state.progress.errors,1);
  assert.equal(state.results[2].ticker,'T2');
  assert.ok(state.results[2].err);
  assert.ok(state.publishes<15,'cached results should not publish once per symbol');
});

test('scanner uses available history when the optional daily series fails',async()=>{
  const {opts,state}=scanOptions(['T0']);
  opts.filters=[{...rules[0],tf:'1wk'}];
  opts.minHistoryYears=1;
  const core=harness('scannerWorkflow',async(t,tf)=>{
    if(tf==='1d') throw Error('daily unavailable');
    return series(t,tf);
  });
  await core.runScanWorkflow(opts);
  assert.equal(state.results[0].passed,true);
  assert.ok(state.results[0].historyYears>1);
});

test('scanner evaluates the latest closed candle separately for daily, weekly and monthly filters',async()=>{
  const now=1800000000;
  const datasets={};
  for(const [tf,step] of [['1d',86400],['1wk',7*86400],['1mo',30*86400]]){
    const d=series('T0',tf);
    d.times=d.times.map((_,i)=>now-i*step);
    d.closes=d.closes.map(()=>20);d.closes[0]=100;d.closes[1]=10;
    datasets[tf]=d;
  }
  const core=harness('scannerWorkflow',async(t,tf)=>datasets[tf]);
  const {opts,state}=scanOptions(['T0']);
  // Older candles pass; the current closed daily candle must veto the scan.
  opts.filters=[{...rules[0],tf:'1mo'}, {...rules[0],tf:'1wk'}, {...rules[0],tf:'1d',cmpVal:15}];
  await core.runScanWorkflow(opts);
  assert.equal(state.results[0].passed,false);
  assert.deepEqual(state.results[0].fRes.map(f=>f.val),[10,10,10]);
  assert.equal(state.results[0].price,10);
  assert.deepEqual(state.results[0].signalTimes,{'1mo':now-30*86400,'1wk':now-7*86400,'1d':now-86400});
  // A weekly condition cannot inherit a monthly anchor either.
  opts.filters=[{...rules[0],tf:'1mo'}, {...rules[0],tf:'1wk',cmpVal:15}];
  await core.runScanWorkflow(opts);
  assert.equal(state.results[0].passed,false);
  assert.equal(state.results[0].fRes[1].val,10);
});

test('scanner accepts a crossing only on the last closed bar, never an older or forming bar',async()=>{
  for(const direction of ['long','short']){
    const descending=direction==='short';
    const prices=descending?{NEW:[30,10,20],OLD:[30,10,10,20],LIVE:[10,20,20]}:{NEW:[10,20,10],OLD:[10,20,20,10],LIVE:[20,10,10]};
    const core=harness('scannerWorkflow',async(t,tf)=>{
      const d=series(t,tf);d.closes=d.closes.map((_,i)=>prices[t][i]??prices[t].at(-1));return d;
    });
    const {opts,state}=scanOptions(['NEW','OLD','LIVE']);
    const crossing={...rules[0],tf:'1wk',op:descending?'x_dn':'x_up',cmpVal:15};
    opts.scanDirection=direction;
    if(descending)opts.shortFilters=[crossing];else opts.filters=[crossing];
    await core.runScanWorkflow(opts);
    assert.deepEqual(state.results.filter(r=>r.passed).map(r=>r.ticker),['NEW']);
    assert.equal(state.results[0].price,descending?10:20);
  }
});

async function portfolioRun(baseline=false,corFilter=true,count=50,sims=8000){
  const tickers=Array.from({length:count},(_,i)=>'T'+i);
  const cache=Object.fromEntries(tickers.map(t=>[t,{'1d':series(t,'1d')} ]));
  const core=harness('portfolioWorkflow',async(t,tf)=>series(t,tf),baseline);
  let result,beats=0;
  const timer=setInterval(()=>beats++,1);
  const start=performance.now();
  try {
    const outcome=await core.buildPortfolioWorkflow({
      results:tickers.map(t=>({ticker:t,passed:true,direction:'LONG'})),filters:rules,shortFilters:[],
      pfCapital:100000,pfMinWeight:1,pfMaxWeight:25,pfMaxPos:20,pfRiskFree:3,
      pfCorFilter:corFilter,pfCorThresh:.95,pfMode:'maxsharpe',pfSims:sims,
      pfStopType:'none',pfStopATRMult:2,pfStopATRPeriod:14,pfStopPctVal:8,
      sectorData:{},scanDirection:'long',pfUniverseSource:'scan',pfManualTickers:'',
      fetchSectors:async()=>({}),dataCacheRef:{current:cache},setPfBuilding:noop,setTab:noop,
      setPortfolio:r=>{result=plain(r);}
    });
    assert.equal(outcome.ok,true);
    return {result,beats,ms:performance.now()-start};
  } finally { clearInterval(timer); }
}

test('portfolio yields to UI events and remains deterministic with the same random stream',async()=>{
  const a=await portfolioRun(),b=await portfolioRun();
  assert.ok(a.beats>1,'UI events must run during computation');
  assert.deepEqual(a.result,b.result);
  assert.ok(a.result.allocations.length>=2);
});

if(process.env.ONIX_PERF_BASELINE){
  test('before/after: same scanner results, bounded concurrency, slow-ticker timing',async(t)=>{
    async function run(baseline){
      const {opts,state}=scanOptions(Array.from({length:24},(_,i)=>'T'+i));
      opts.conc=4;
      const core=harness('scannerWorkflow',async(t,tf)=>{
        await sleep(Number(t.slice(1))%4===0?45:3);return series(t,tf);
      },baseline);
      const start=performance.now();await core.runScanWorkflow(opts);
      return {...state,ms:performance.now()-start};
    }
    const before=await run(true),after=await run(false);
    assert.deepEqual(after.results,before.results);
    t.diagnostic(JSON.stringify({scanner:{beforeMs:before.ms,afterMs:after.ms,beforePublishes:before.publishes,afterPublishes:after.publishes}}));
  });
  test('before/after: identical portfolio outputs and event-loop responsiveness',async(t)=>{
    for(const filter of [true,false]){
      const before=await portfolioRun(true,filter),after=await portfolioRun(false,filter);
      assert.deepEqual(after.result,before.result);
      t.diagnostic(JSON.stringify({portfolio:{filter,beforeMs:before.ms,afterMs:after.ms,beforeUiTicks:before.beats,afterUiTicks:after.beats}}));
    }
  });
  test('before/after: large universe avoids computing the entire correlation matrix',async(t)=>{
    const before=await portfolioRun(true,false,1000,200),after=await portfolioRun(false,false,1000,200);
    assert.deepEqual(after.result,before.result);
    t.diagnostic(JSON.stringify({largePortfolio:{symbols:1000,beforeMs:before.ms,afterMs:after.ms}}));
  });
}
