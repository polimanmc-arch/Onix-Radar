const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const noop=()=>{};
const sec=iso=>Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))/1000;

function load(extra=[]){
  const ctx=vm.createContext({window:{},console,setTimeout,clearTimeout,AbortController,Date,Math});
  for(const f of ['config/timeframes.js','config/sp500History.js','config/universes.js','core/indexMembership.js','core/indicators.js','core/engine.js',...extra])
    vm.runInContext(fs.readFileSync(path.join(root,'public/app',f),'utf8'),ctx);
  return ctx.window;
}

test('S&P 500 history: renames, removals, Yahoo symbols and index size',()=>{
  const w=load();
  const m=w.StockScannerConfig.INDEX_MEMBERSHIP.SP500_PIT;
  // META entró como FB en 2013: el ticker actual se extiende hacia atrás, FB sigue en su tramo.
  assert.equal(m.isMember('META',sec('2015-06-01')),true);
  assert.equal(m.isMember('FB',sec('2015-06-01')),true);
  assert.equal(m.isMember('META',sec('2012-06-01')),false);
  // Formato Yahoo y salidas.
  assert.equal(m.isMember('BRK-B',sec('2015-06-01')),true);
  assert.equal(m.isMember('AAL',sec('2020-06-01')),true);
  assert.equal(m.isMember('AAL',sec('2025-06-01')),false);
  // Tamaño real del índice sin duplicar renombres.
  for(const d of ['2018-03-01','2021-05-05','2026-01-05']){
    const n=m.size(sec(d));
    assert.ok(n>=495&&n<=510,d+': '+n);
  }
  const preset=w.StockScannerConfig.UNIVERSE_PRESETS.SP500_PIT;
  assert.equal(preset.backtestOnly,true);
  assert.ok(preset.tickers.length>550&&preset.tickers.includes('AAL')&&preset.tickers.includes('META'));
});

test('the build script parses quoted CSV fields and converts symbols to Yahoo format',()=>{
  const {parseCsv,build,yahoo}=require(path.join(root,'scripts/build-sp500-history.js'));
  const rows=parseCsv('Symbol,Security,Date added\nBRK.B,"Berkshire Hathaway, Inc.",2010-02-16\r\nMETA,Meta,2013-12-23\n');
  assert.equal(rows[0].Security,'Berkshire Hathaway, Inc.');
  assert.equal(yahoo('BF.B'),'BF-B');
  const startEnd='ticker,start_date,end_date\n'+Array.from({length:500},(_,i)=>`T${i},2000-01-03,`).join('\n')+'\nFB,2013-12-23,2022-06-09\nMETA,2022-06-09,\n';
  const out=build({startEndCsv:startEnd,currentCsv:'Symbol,Date added\nMETA,2013-12-23\n',licenseText:'MIT'});
  assert.deepEqual(out.intervals.META,[['2022-06-09',null]]);
  assert.equal(out.currentAdded.META,'2013-12-23');
  assert.throws(()=>build({startEndCsv:'ticker,start_date,end_date\nA,2000-01-03,\n',currentCsv:'Symbol,Date added\n',licenseText:''}),/Miembros actuales/);
});

test('point-in-time backtest buys only current members and sells when a stock leaves the index',async()=>{
  const w=load(['core/ruleEvaluator.js','core/backtestWorkflow.js']);
  const core=w.StockScannerCore;
  core.fetchTicker=async(t,tf)=>({ticker:t,tf,ok:false,error:'sin datos'});
  const now=Math.floor(Date.now()/1000);
  const L=80, times=Array.from({length:L},(_,i)=>now-i*7*86400);
  const iso=t=>new Date(t*1000).toISOString().slice(0,10);
  const old=iso(times[L-1]-400*86400), mid=iso(times[30]);
  w.StockScannerConfig.INDEX_MEMBERSHIP.TEST=core.createIndexMembership({intervals:{
    A:[[old,null]], B:[[old,null]], C:[[old,mid]], D:[[mid,null]],
  }});
  w.StockScannerConfig.UNIVERSE_PRESETS.TEST_PIT={label:'Test',tickers:['A','B','C','D'],group:'us',pointInTime:'TEST'};
  const series=t=>{ const closes=times.map((_,i)=>100+i*0.2+(t.charCodeAt(0)%3)); return {ticker:t,ok:true,closes,opens:closes,highs:closes.map(c=>c+1),lows:closes.map(c=>c-1),volumes:closes.map(()=>1e6),times}; };
  const cache=Object.fromEntries(['A','B','C','D'].map(t=>[t,{'1wk':series(t)}]));
  let r;
  const cond={ind:'PRICE',tf:'1wk',op:'>',cmpType:'val',cmpVal:0,params:{}};
  await core.runBacktestWorkflow({entryRules:[{conditions:[cond]}],exitRules:[{conditions:[]}],shortEntryRules:[],shortExitRules:[],btDirection:'long',
    stopATR:false,stopPct:false,btWeeks:60,btCapital:100000,pfMaxPos:4,pfRiskFree:0,btBenchmark:'ZZ',btCommission:0,btSlippage:0,pfStopATRPeriod:14,
    pfMinWeight:1,pfMaxWeight:25,btAllocationMode:'equal',btUniverseSource:'TEST_PIT',btUniverseLimit:0,savedUniverseLists:[],mktFilterRules:[],
    savedStrategiesLength:0,dataCacheRef:{current:cache},setBtRunning:noop,setBtProgress:noop,setTab:noop,setBacktest:x=>{r=x;}});
  const midSec=sec(mid);
  const byTicker=t=>r.allTrades.filter(x=>x.ticker===t);
  assert.ok(byTicker('C').length===1,'C was bought while it was a member');
  const c=byTicker('C')[0];
  assert.match(c.reason,/Salida del índice/);
  assert.ok(c.exitTime>=midSec&&c.exitTime<=midSec+14*86400,'C sold right after leaving: '+iso(c.exitTime));
  // D sólo es elegible desde su alta: ninguna compra antes de esa fecha (las abiertas no salen en allTrades).
  assert.equal(byTicker('D').length,0);
  assert.equal(r.pointInTime.removalExits,1);
  assert.equal(r.pointInTime.avgCoverage,1);
  const dEntryWeeks=r.weeklyLog.filter(x=>x.time<midSec&&x.bought>0).length;
  assert.ok(dEntryWeeks>=1,'initial purchases happen before mid');
  // Al final hay 3 posiciones abiertas (A, B y D): D entró después de su alta.
  assert.equal(r.equityCurve.at(-1).holdings,3);
});

test('series that stop before the others are excluded instead of being shifted in time',async()=>{
  const w=load(['core/ruleEvaluator.js','core/backtestWorkflow.js']);
  const core=w.StockScannerCore;
  core.fetchTicker=async(t,tf)=>({ticker:t,tf,ok:false});
  const now=1800000000, L=80;
  const mk=(t,lagWeeks)=>{ const times=Array.from({length:L},(_,i)=>now-(i+lagWeeks)*7*86400); const closes=times.map((_,i)=>100+i); return {ticker:t,ok:true,closes,opens:closes,highs:closes,lows:closes,volumes:closes.map(()=>1),times}; };
  const cache={A:{'1wk':mk('A',0)},B:{'1wk':mk('B',0)},C:{'1wk':mk('C',0)},STALE:{'1wk':mk('STALE',6)}};
  let r;
  await core.runBacktestWorkflow({entryRules:[{conditions:[{ind:'PRICE',tf:'1wk',op:'>',cmpType:'val',cmpVal:0,params:{}}]}],exitRules:[],shortEntryRules:[],shortExitRules:[],
    btDirection:'long',stopATR:false,stopPct:false,btWeeks:40,btCapital:1e5,pfMaxPos:4,pfRiskFree:0,btBenchmark:'ZZ',btCommission:0,btSlippage:0,pfStopATRPeriod:14,
    pfMinWeight:1,pfMaxWeight:25,btAllocationMode:'equal',btUniverseSource:'scan',mktFilterRules:[],savedStrategiesLength:0,dataCacheRef:{current:cache},
    setBtRunning:noop,setBtProgress:noop,setTab:noop,setBacktest:x=>{r=x;}});
  assert.equal(r.diagnostics.validTickers,3);
  assert.equal(r.equityCurve.at(-1).holdings,3);
});

test('scanner S&P 500 list is the current composition from the history file',()=>{
  const cfg=load().StockScannerConfig;
  assert.deepEqual([...cfg.SP500],[...cfg.SP500_HISTORY.currentMembers]);
  assert.equal(cfg.UNIVERSE_PRESETS.SP500.tickers,cfg.SP500);
  for(const t of ['PLTR','UBER','BRK-B','BNY']) assert.ok(cfg.SP500.includes(t),t);
  for(const t of ['ANSS','PXD','DFS','BK']) assert.ok(!cfg.SP500.includes(t),t);
  assert.ok(cfg.US_INDEX_COMPONENTS.includes('PLTR'),'derived universes use the new list');
});

test('stocks listed during the backtest take part from their first weeks of data instead of being dropped',async()=>{
  const w=load(['core/ruleEvaluator.js','core/backtestWorkflow.js']);
  const core=w.StockScannerCore;
  core.fetchTicker=async(t,tf)=>({ticker:t,tf,ok:false});
  const now=1800000000;
  const mk=len=>{ const times=Array.from({length:len},(_,i)=>now-i*7*86400); const closes=times.map((_,i)=>100+i*0.1); return {ok:true,closes,opens:closes,highs:closes,lows:closes,volumes:closes.map(()=>1),times}; };
  const cache={A:{'1wk':mk(220)},B:{'1wk':mk(220)},IPO:{'1wk':mk(40)},TINY:{'1wk':mk(12)}};
  let r;
  await core.runBacktestWorkflow({entryRules:[{conditions:[{ind:'PRICE',tf:'1wk',op:'>',cmpType:'val',cmpVal:0,params:{}}]}],exitRules:[],shortEntryRules:[],shortExitRules:[],
    btDirection:'long',stopATR:false,stopPct:false,btWeeks:100,btCapital:1e5,pfMaxPos:4,pfRiskFree:0,btBenchmark:'ZZ',btCommission:0,btSlippage:0,pfStopATRPeriod:14,
    pfMinWeight:1,pfMaxWeight:25,btAllocationMode:'equal',btUniverseSource:'scan',mktFilterRules:[],savedStrategiesLength:0,dataCacheRef:{current:cache},
    setBtRunning:noop,setBtProgress:noop,setTab:noop,setBacktest:x=>{r=x;}});
  assert.equal(r.diagnostics.validTickers,3,'TINY has fewer than 30 weeks');
  assert.equal(r.diagnostics.partialHistoryTickers,1);
  assert.equal(r.equityCurve.length,99,'the timeline comes from the longest series');
  assert.equal(r.equityCurve[0].holdings,2,'IPO has no data yet at the start');
  assert.equal(r.equityCurve.at(-1).holdings,3,'IPO is bought once it has data');
  const ipoStart=cache.IPO['1wk'].times.at(-1);
  const firstWith3=r.equityCurve.find(p=>p.holdings===3);
  assert.ok(firstWith3.time>ipoStart,'never before its first candle');
});
