// Regresiones de los hallazgos de docs/analisis-radar-onix.md (comisiones, pesos, drawdown,
// agregación 4H, alineación de retornos y semilla del portafolio).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const noop = ()=>{};
const plain = v=>JSON.parse(JSON.stringify(v));

function load(files, extra={}){
  const ctx=vm.createContext({window:{},console,setTimeout,clearTimeout,AbortController,Date,Math,...extra});
  for(const f of ['config/timeframes.js','core/indicators.js','core/engine.js','core/ruleEvaluator.js',...files]){
    vm.runInContext(fs.readFileSync(path.join(root,'public/app',f),'utf8'),ctx);
  }
  return ctx.window.StockScannerCore;
}

test('boundWeights keeps every weight within [min,max] and redistributes the excess',()=>{
  const {boundWeights}=load([]);
  const w=boundWeights([100,1,1,1],0.01,0.4);
  assert.ok(Math.max(...w)<=0.4+1e-12, 'max weight respected: '+w);
  assert.ok(Math.min(...w)>=0.01-1e-12);
  assert.ok(Math.abs(w.reduce((a,b)=>a+b,0)-1)<1e-9);
  // Infeasible to invest 100% (3 × 25%): each at the cap, the rest stays in cash.
  assert.deepEqual(plain(boundWeights([5,1,1],0,0.25)),[0.25,0.25,0.25]);
  // Signs are preserved for short positions and the minimum is applied.
  const s=boundWeights([-0.9,0.05,0.05],0.1,0.6);
  assert.ok(s[0]<0 && Math.abs(s[0])<=0.6+1e-12);
  assert.ok(Math.abs(s[1])>=0.1-1e-12 && Math.abs(s[2])>=0.1-1e-12);
});

test('4H aggregation keeps the partial last block of each session',()=>{
  const core=load([]);
  // 7 hourly bars of one US session, newest first.
  const times=Array.from({length:7},(_,i)=>Date.UTC(2026,0,5,14+i,30)/1000).reverse();
  const highs=[10,11,12,13,14,15,16].reverse(), lows=[1,2,3,4,5,6,7].reverse();
  const vols=[1,1,1,1,1,1,1];
  const agg=core.aggregateCandles(highs,highs,lows,highs,vols,times,4);
  assert.equal(agg.times.length,2);
  assert.equal(agg.volumes.reduce((a,b)=>a+b,0),7,'no hourly bar is dropped');
  assert.equal(Math.max(...agg.highs),16);
  assert.equal(Math.min(...agg.lows),1);
});

// Universo sintético: entra a 100, la primera semana cierra en 90 y las últimas semanas caen a 40
// (regla de salida PRICE < 50). Sin re-entrada porque la entrada exige PRICE > 60.
function weekly(ticker){
  const n=60, closes=[], opens=[];
  for(let i=0;i<n;i++){
    if(i<5){ closes.push(40); opens.push(40); }
    else if(i<20){ closes.push(90); opens.push(i===19?100:90); }
    else { closes.push(100); opens.push(100); }
  }
  return {ticker,name:ticker,tf:'1wk',ok:true,closes,opens,highs:closes.map((c,i)=>Math.max(c,opens[i])),lows:closes.map((c,i)=>Math.min(c,opens[i])),
    volumes:closes.map(()=>1e6),times:closes.map((_,i)=>1800000000-i*604800),price:closes[0],prevClose:closes[1]};
}
async function runBacktest(overrides={}){
  const core=load(['core/backtestWorkflow.js']);
  core.fetchTicker=async(t,tf)=>({ticker:t,tf,ok:false,error:'sin datos'});
  const cache={A:{'1wk':weekly('A')},B:{'1wk':weekly('B')},C:{'1wk':weekly('C')}};
  let result;
  const cond=(op,val)=>({ind:'PRICE',tf:'1wk',op,cmpType:'val',cmpVal:val,params:{}});
  const out=await core.runBacktestWorkflow({
    entryRules:[{conditions:[cond('>',60)]}],exitRules:[{conditions:[cond('<',50)]}],
    shortEntryRules:[],shortExitRules:[],btDirection:'long',
    stopATR:false,stopATRMult:2,stopPct:false,stopPctVal:8,
    btWeeks:20,btCapital:100000,pfMaxPos:3,pfRiskFree:0,btBenchmark:'ZZBENCH',btCommission:0.1,btSlippage:0,
    pfStopATRPeriod:14,pfMinWeight:1,pfMaxWeight:25,pfMode:'maxsharpe',btAllocationMode:'equal',
    btUniverseSource:'scan',btCustomTickers:'',btUniverseLimit:0,savedUniverseLists:[],
    mktFilterEnabled:false,mktFilterRules:[],savedStrategiesLength:0,dataCacheRef:{current:cache},abortSignal:null,
    setBtRunning:noop,setBtProgress:noop,setTab:noop,setBacktest:r=>{result=r;},
    ...overrides,
  });
  assert.notEqual(out?.ok,false,out?.message);
  return result;
}

test('backtest counts each commission once',async()=>{
  const r=await runBacktest();
  assert.equal(r.allTrades.length,3);
  const perTrade=r.allTrades.reduce((a,t)=>a+t.commission,0);
  assert.ok(perTrade>0);
  assert.ok(Math.abs(r.totalCommissionPaid-perTrade)<1e-6, r.totalCommissionPaid+' vs '+perTrade);
});

test('backtest drawdown is measured from the initial capital',async()=>{
  const r=await runBacktest();
  const minValue=Math.min(...r.equityCurve.map(p=>p.value));
  const fromStart=(r.startVal-minValue)/r.startVal;
  assert.ok(r.equityCurve[0].value<r.startVal,'first week already below the initial capital');
  assert.ok(Math.abs(r.maxDrawdown-fromStart)<1e-9, r.maxDrawdown+' vs '+fromStart);
});

test('weighted allocation never exceeds the maximum weight per position',async()=>{
  const r=await runBacktest({btAllocationMode:'maxsharpe',pfMaxWeight:25,btCommission:0});
  assert.equal(r.allTrades.length,3);
  for(const t of r.allTrades) assert.ok(t.shares*t.entryPrice<=0.25*100000+1e-6, t.ticker+' '+t.shares*t.entryPrice);
});

test('portfolio equal-weight mode under Como Portafolio allocates equally',async()=>{
  const r=await runBacktest({btAllocationMode:'portfolio',pfMode:'equalweight',pfMaxWeight:40,btCommission:0});
  const notionals=r.allTrades.map(t=>t.shares*t.entryPrice);
  assert.ok(Math.max(...notionals)-Math.min(...notionals)<=100, notionals.join(','));
});

test('backtest never reads the close of a monthly candle that is still forming',async()=>{
  const DAY=86400, base=Math.floor(Date.UTC(2026,10,16,5)/1000);
  const monthStart=(y,m)=>Math.floor(Date.UTC(y,m,1,4)/1000);
  const spike={y:2026,m:4}; // mayo 2026 cierra en 200; el resto de meses en 100
  const mk=(ticker,tf,times,closes)=>({ticker,name:ticker,tf,ok:true,closes,opens:closes.slice(),highs:closes.slice(),lows:closes.slice(),
    volumes:closes.map(()=>1e6),times,price:closes[0],prevClose:closes[1]});
  const cache={};
  for(const t of ['A','B','C']){
    const wTimes=Array.from({length:70},(_,i)=>base-i*7*DAY);
    const mTimes=Array.from({length:30},(_,j)=>monthStart(2026,10-j));
    const mCloses=mTimes.map(ts=>{ const d=new Date(ts*1000); return d.getUTCFullYear()===spike.y&&d.getUTCMonth()===spike.m?200:100; });
    cache[t]={'1wk':mk(t,'1wk',wTimes,wTimes.map(()=>100)),'1mo':mk(t,'1mo',mTimes,mCloses)};
  }
  const core=load(['core/backtestWorkflow.js']);
  core.fetchTicker=async(t,tf)=>({ticker:t,tf,ok:false,error:'sin datos'});
  let r;
  const cond=(op)=>({ind:'PRICE',tf:'1mo',op,cmpType:'val',cmpVal:150,params:{}});
  await core.runBacktestWorkflow({
    entryRules:[{conditions:[cond('>')]}],exitRules:[{conditions:[cond('<')]}],shortEntryRules:[],shortExitRules:[],btDirection:'long',
    stopATR:false,stopATRMult:2,stopPct:false,stopPctVal:8,btWeeks:45,btCapital:100000,pfMaxPos:3,pfRiskFree:0,btBenchmark:'ZZBENCH',
    btCommission:0,btSlippage:0,pfStopATRPeriod:14,pfMinWeight:1,pfMaxWeight:25,pfMode:'maxsharpe',btAllocationMode:'equal',
    btUniverseSource:'scan',btUniverseLimit:0,savedUniverseLists:[],mktFilterEnabled:false,mktFilterRules:[],savedStrategiesLength:0,
    dataCacheRef:{current:cache},abortSignal:null,setBtRunning:noop,setBtProgress:noop,setTab:noop,setBacktest:x=>{r=x;},
  });
  assert.ok(r.allTrades.length>=3,'the closed May candle must trigger entries');
  const mayCloses=monthStart(spike.y,spike.m+1);
  // Ni antes (sesgo de futuro) ni con meses de retraso (vela mensual desfasada).
  const firstEntry=Math.min(...r.allTrades.map(t=>t.entryTime));
  assert.ok(firstEntry<monthStart(spike.y,spike.m+2),'entry should happen in June, got '+new Date(firstEntry*1000).toISOString());
  for(const t of r.allTrades){
    assert.ok(t.entryTime>=mayCloses,'entry before May closed: '+new Date(t.entryTime*1000).toISOString());
    assert.ok(t.exitTime>=monthStart(spike.y,spike.m+2),'exit only after June closed');
  }
});

// Portafolio: dos series con los mismos retornos por fecha, pero B tiene una semana que A no tiene.
function pfSeries(ticker,skip){
  const n=130, rows=[];
  let p=100;
  for(let i=n-1;i>=0;i--){ p*=1+0.03*Math.sin(i*1.7)+0.01*Math.cos(i*0.3); rows.push({i,p}); }
  rows.reverse(); // newest first
  const kept=rows.filter(r=>r.i!==skip);
  const closes=kept.map(r=>r.p);
  return {ticker,name:ticker,tf:'1wk',ok:true,closes,opens:closes,highs:closes.map(x=>x*1.01),lows:closes.map(x=>x*0.99),
    volumes:closes.map(()=>1e5),times:kept.map(r=>1800000000-r.i*604800),price:closes[0]};
}
async function runPortfolio(overrides={}){
  const core=load(['core/portfolioWorkflow.js']);
  const data={A:pfSeries('A',3),B:pfSeries('B',-1),C:pfSeries('C',-1)};
  data.C.closes=data.C.closes.map((c,i)=>c*(1+0.02*Math.sin(i*0.9)));
  core.fetchTicker=async(t)=>data[t];
  const cache=Object.fromEntries(Object.entries(data).map(([t,d])=>[t,{'1wk':d}]));
  let result;
  const out=await core.buildPortfolioWorkflow({
    results:Object.keys(data).map(t=>({ticker:t,passed:true,direction:'LONG'})),
    filters:[{ind:'PRICE',tf:'1wk',op:'>',cmpType:'val',cmpVal:0,params:{}}],shortFilters:[],
    pfCapital:100000,pfMinWeight:5,pfMaxWeight:60,pfMaxPos:10,pfRiskFree:0,pfCorFilter:false,pfCorThresh:.95,
    pfMode:'maxsharpe',pfSims:3000,pfSeed:7,pfStopType:'none',pfStopATRMult:2,pfStopATRPeriod:14,pfStopPctVal:8,
    sectorData:{},scanDirection:'long',pfUniverseSource:'scan',pfManualTickers:'',
    fetchSectors:async()=>({}),dataCacheRef:{current:cache},setPfBuilding:noop,setTab:noop,setPortfolio:r=>{result=plain(r);},
    ...overrides,
  });
  assert.equal(out.ok,true,out.message);
  return result;
}

test('portfolio correlation pairs returns by date, not by position',async()=>{
  const r=await runPortfolio();
  const rowA=r.correlationMatrix.find(x=>x.ticker==='A').row;
  const idxB=r.correlationMatrix.findIndex(x=>x.ticker==='B');
  assert.ok(rowA[idxB]>0.9,'A and B share the same dated returns: '+rowA[idxB]);
});

test('portfolio sampling is reproducible by seed and respects the minimum weight',async()=>{
  const a=await runPortfolio(), b=await runPortfolio(), c=await runPortfolio({pfSeed:8});
  assert.deepEqual(a.allocations.map(x=>x.weight),b.allocations.map(x=>x.weight));
  assert.equal(a.seed,7);
  assert.notDeepEqual(a.frontier,c.frontier);
  for(const al of a.allocations){ assert.ok(al.weight>=0.05-1e-9 && al.weight<=0.6+1e-9, al.ticker+' '+al.weight); }
});

test('tearsheet: monthly returns compound to the total, drawdowns start at the initial capital, benchmark beta',()=>{
  const {computeTearsheet}=load(['core/performance.js']);
  const start=Math.floor(Date.UTC(2025,0,6,5)/1000), W=7*86400;
  const values=[], bench=[];
  let v=100000, b=400;
  for(let i=0;i<60;i++){
    const r=0.01*Math.sin(i*0.7)+0.002;
    v*=1+2*r; b*=1+r; // estrategia = 2 × benchmark
    values.push({time:start+i*W,value:v});
    bench.push({time:start+i*W,value:b});
  }
  const ts=computeTearsheet({equityCurve:values,startVal:100000,benchCurve:[{time:start-W,value:400},...bench],riskFreePct:0});
  const compounded=ts.monthly.reduce((a,m)=>a*(1+m.ret),1)-1;
  assert.ok(Math.abs(compounded-(v/100000-1))<1e-9);
  assert.ok(Math.abs(ts.benchmark.beta-2)<0.05, 'beta '+ts.benchmark.beta);
  assert.ok(ts.benchmark.correlation>0.99);
  const dd=computeTearsheet({equityCurve:[{time:start,value:90000},{time:start+W,value:95000},{time:start+2*W,value:101000}],startVal:100000});
  assert.equal(dd.drawdowns.length,1);
  assert.ok(Math.abs(dd.drawdowns[0].depth-0.1)<1e-12);
  assert.equal(dd.drawdowns[0].recovered,true);
  assert.equal(dd.drawdowns[0].weeks,3);
});
