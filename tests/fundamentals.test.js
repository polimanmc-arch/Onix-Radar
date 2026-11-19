const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const noop=()=>{};
const plain=v=>JSON.parse(JSON.stringify(v));
function load(fetchTicker){
  const ctx=vm.createContext({window:{},console,setTimeout,clearTimeout,AbortController,Date,Math});
  const run=f=>vm.runInContext(fs.readFileSync(path.join(root,'public/app',f),'utf8'),ctx);
  for(const f of ['config/timeframes.js','config/indicators.js','core/indicators.js','core/engine.js','core/ruleEvaluator.js']) run(f);
  // scannerWorkflow.js toma fetchTicker al cargarse: se sustituye antes.
  if(fetchTicker) ctx.window.StockScannerCore.fetchTicker=fetchTicker;
  run('core/scannerWorkflow.js');
  return ctx.window;
}
const meta={marketCap:2.5e12,peRatio:28,roe:0.31,sector:'Technology'};

test('every fundamental filter the engine supports is selectable in the catalog',()=>{
  const w=load();
  const ids=new Set(w.StockScannerConfig.INDICATORS.filter(i=>i.meta).map(i=>i.id));
  for(const id of ['SECTOR','INDUSTRY','COUNTRY','EXCHANGE','MARKET_CAP','FLOAT','SHARES_OUT','SHORT_INT_PCT','INST_OWN_PCT','INSIDER_OWN_PCT','BETA','PE','FWD_PE','PS','PB','EV_EBITDA','DEBT_EQUITY','CURRENT_RATIO','ROE','ROA','GROSS_MARGIN','OPER_MARGIN','REV_GROWTH','EPS_GROWTH','FCF_YIELD'])
    assert.ok(ids.has(id),id);
});

test('fundamentals: market cap in millions, percentages, text and "ignore missing" in both engines',()=>{
  const core=load().StockScannerCore;
  const d={ok:true,closes:[10,9,8],highs:[10,9,8],lows:[10,9,8],opens:[10,9,8],_meta:meta};
  const f=(ind,op,cmpVal,extra={})=>({ind,tf:'1d',op,cmpType:'val',cmpVal,params:{},...extra});
  const ev=core.createRuleEvaluator();
  const both=filter=>[plain(core.testFilter(filter,d)),plain(ev.testFilterAt(filter,{'1d':d,_meta:meta},{'1d':0}))];
  for(const r of both(f('MARKET_CAP','>',1e6))){ assert.equal(r.val,2.5e6); assert.equal(r.pass,true); }
  for(const r of both(f('ROE','>',30))){ assert.ok(Math.abs(r.val-31)<1e-9); assert.equal(r.pass,true); }
  for(const r of both(f('SECTOR','>','technology'))) assert.equal(r.pass,true);
  for(const r of both(f('SECTOR','<','Technology'))) assert.equal(r.pass,false);
  for(const r of both(f('FWD_PE','<',20))) assert.equal(r.pass,false,'missing value fails by default');
  for(const r of both(f('FWD_PE','<',20,{ignoreMissing:true}))) assert.equal(r.pass,true,'ignored when asked');
});

test('the scanner fetches fundamentals only when a filter needs them and applies them',async()=>{
  const series=t=>{ const closes=Array.from({length:120},(_,i)=>100-i*0.1); return {ticker:t,ok:true,closes,opens:closes,highs:closes,lows:closes,volumes:closes.map(()=>1),times:closes.map((_,i)=>1800000000-i*86400),price:closes[0]}; };
  const w=load(async(t,tf)=>({...series(t),tf}));
  let quoteCalls=0;
  const fetchQuotes=async(tickers,details)=>{ quoteCalls++; assert.equal(details,true); return {CHEAP:{peRatio:12,sector:'Energy'},PRICEY:{peRatio:60,sector:'Technology'}}; };
  const run=async filters=>{
    let rows=[];
    await w.StockScannerCore.runScanWorkflow({scanning:false,tickers:['CHEAP','PRICEY','NODATA'],filters,shortFilters:[],scanDirection:'long',conc:2,minHistoryYears:0,
      abortRef:{current:null},dataCacheRef:{current:{}},setScanning:noop,setSearch:noop,setOnlyPass:noop,setTab:noop,setResults:r=>{rows=plain(r);},setProg:noop,
      addLog:noop,fetchSectors:async()=>({}),fetchQuotes,setSectorData:noop});
    return rows.filter(r=>r.passed).map(r=>r.ticker);
  };
  assert.deepEqual(await run([{ind:'PRICE',tf:'1d',op:'>',cmpType:'val',cmpVal:0,params:{}}]),['CHEAP','PRICEY','NODATA']);
  assert.equal(quoteCalls,0,'technical-only scans do not download fundamentals');
  assert.deepEqual(await run([{ind:'PE',tf:'1d',op:'<',cmpType:'val',cmpVal:20,params:{}}]),['CHEAP']);
  assert.deepEqual(await run([{ind:'PE',tf:'1d',op:'<',cmpType:'val',cmpVal:20,params:{},ignoreMissing:true}]),['CHEAP','NODATA']);
  assert.equal(quoteCalls,2);
});
