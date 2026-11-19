const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function load(){
  const ctx=vm.createContext({window:{},console});
  vm.runInContext(fs.readFileSync(path.join(root,'public/app/core/simpleSimulator.js'),'utf8'),ctx);
  return ctx.window.StockScannerCore;
}

test('simple mode options: markets, plain-language strategies and a long-only weekly backtest without stops',()=>{
  const c=load();
  assert.ok(c.SIMPLE_MARKETS.length>=4 && c.SIMPLE_STRATEGIES.length>=3);
  for(const s of c.SIMPLE_STRATEGIES){ assert.ok(s.name&&s.pitch&&s.buy&&s.sell); }
  const o=c.buildSimpleBacktestOptions({market:c.SIMPLE_MARKETS.find(m=>m.id==='DOW30'),strategy:c.SIMPLE_STRATEGIES[1],period:{weeks:52}});
  assert.equal(c.SIMPLE_MARKETS.find(m=>m.id==='SP500').benchmark,'SPY');
  assert.equal(o.btDirection,'long'); assert.equal(o.stopATR,false); assert.equal(o.stopPct,false);
  assert.equal(o.btWeeks,52); assert.equal(o.btCapital,10000); assert.equal(o.btUniverseSource,'DOW30');
  assert.ok(o.entryRules[0].conditions.every(x=>x.tf==='1wk'&&x._id));
});

test('stars: earn money, beat the market, fall less than the market',()=>{
  const c=load();
  const curve=vals=>vals.map((value,i)=>({time:1700000000+i*604800,value}));
  const all=c.summarizeSimpleResult({equityCurve:curve([10500,11000,12000]),benchCurve:curve([9000,10000,11000]),allTrades:[{},{}],winRate:.5});
  assert.equal(all.stars,3); assert.equal(all.beat,true); assert.match(all.headline,/ganado al mercado/);
  assert.ok(Math.abs(all.ret-0.2)<1e-12); assert.equal(all.trades,2);
  const none=c.summarizeSimpleResult({equityCurve:curve([9000,8000,9500]),benchCurve:curve([10200,10500,11000])});
  assert.equal(none.stars,0); assert.match(none.headline,/ganó el mercado/);
  assert.equal(c.summarizeSimpleResult({equityCurve:[]}),null);
});

test('today signals use the cached weekly data of the chosen market only',()=>{
  const ctx=vm.createContext({window:{},console,setTimeout,clearTimeout,AbortController,Date,Math});
  for(const f of ['config/timeframes.js','core/indicators.js','core/engine.js','core/simpleSimulator.js'])
    vm.runInContext(fs.readFileSync(path.join(root,'public/app',f),'utf8'),ctx);
  const c=ctx.window.StockScannerCore;
  const wk=(trendUp)=>{ const closes=Array.from({length:120},(_,i)=>trendUp?200-i:50+i*0.1); return {ok:true,closes,opens:closes,highs:closes,lows:closes,volumes:closes.map(()=>1),times:closes.map((_,i)=>1800000000-i*604800)}; };
  const trend=c.SIMPLE_STRATEGIES.find(s=>s.id==='trend');
  const cache={UP:{'1wk':wk(true)},DOWN:{'1wk':wk(false)},OTHER:{'1wk':wk(true)},SPY:{'1wk':wk(true)}};
  const out=c.todaySimpleSignals({dataByTicker:cache,tickers:['UP','DOWN'],strategy:trend});
  assert.deepEqual(JSON.parse(JSON.stringify(out.list.map(x=>x.ticker))),['UP'],'other markets and the benchmark are ignored');
  assert.equal(out.total,1);
});


test('market groups: every option resolves to a universe; yields are excluded and big or filtered universes are explicit',()=>{
  const ctx=vm.createContext({window:{},console});
  for(const f of ['config/sp500History.js','config/universes.js','core/simpleSimulator.js'])
    vm.runInContext(fs.readFileSync(path.join(root,'public/app',f),'utf8'),ctx);
  const c=ctx.window.StockScannerCore;
  assert.deepEqual(JSON.parse(JSON.stringify(c.SIMPLE_MARKET_GROUPS.map(g=>g.id))),['us','eu','assets','global']);
  for(const m of c.SIMPLE_MARKETS){ assert.ok(c.simpleUniverseTickers(m).length>=8,m.id); assert.ok(m.benchmark&&m.holdLabel,m.id); }
  const bonds=c.SIMPLE_MARKETS.find(m=>m.id==='BONDS_TREASURIES');
  assert.ok(!c.simpleUniverseTickers(bonds).some(t=>['^TNX','^TYX','^FVX','^IRX'].includes(t)));
  const base=c.SIMPLE_STRATEGIES[0];
  assert.equal(base.id,'base'); assert.ok(base.isBase);
  assert.deepEqual(JSON.parse(JSON.stringify(base.entry.map(x=>x.ind))),['WMA','RSI','STOCH']);
  const period={weeks:52};
  const global=c.buildSimpleBacktestOptions({market:c.SIMPLE_MARKETS.find(m=>m.id==='GLOBAL_FULL_UNIVERSE'),strategy:base,period});
  assert.equal(global.btUniverseSource,'custom','the expert preset would add every US stock');
  assert.equal(global.btCustomTickers.split(', ').length,c.simpleUniverseTickers(c.SIMPLE_MARKETS.find(m=>m.id==='GLOBAL_FULL_UNIVERSE')).length);
  assert.equal(global.btLightMemory,false);
  assert.equal(c.buildSimpleBacktestOptions({market:c.SIMPLE_MARKETS.find(m=>m.id==='SP500'),strategy:base,period}).btUniverseSource,'SP500');
});

test('"Todo el mercado" downloads every US stock once and adds Europe, indices, commodities and bonds',async()=>{
  const ctx=vm.createContext({window:{},console});
  for(const f of ['config/sp500History.js','config/universes.js','core/simpleSimulator.js'])
    vm.runInContext(fs.readFileSync(path.join(root,'public/app',f),'utf8'),ctx);
  const c=ctx.window.StockScannerCore, cfg=ctx.window.StockScannerConfig;
  const market=c.SIMPLE_MARKETS.find(m=>m.id==='MARKET_ALL');
  assert.ok(market&&market.group==='global'&&market.heavy);
  assert.equal(c.simpleUniverseReady(market),false);
  let calls=0;
  const fetchImpl=async url=>{ calls++; assert.equal(url,'/api/tickers'); return {json:async()=>({tickers:['zzzz','AAPL','YYYY']})}; };
  const list=await c.resolveSimpleUniverse(market,fetchImpl);
  await c.resolveSimpleUniverse(market,fetchImpl);
  assert.equal(calls,1,'the list is downloaded once');
  assert.ok(c.simpleUniverseReady(market));
  assert.ok(list.includes('ZZZZ')&&list.includes('YYYY')&&list.includes(cfg.EUROPE_MAJOR_INDICES_COMPONENTS[0])&&list.includes('GLD'));
  assert.ok(!list.includes('^TNX'),'yields are not investable');
  assert.equal(new Set(list).size,list.length);
  const o=c.buildSimpleBacktestOptions({market,strategy:c.SIMPLE_STRATEGIES[0],period:{weeks:52}});
  assert.equal(o.btUniverseSource,'custom'); assert.equal(o.btCustomTickers.split(', ').length,list.length);
  await assert.rejects(c.resolveSimpleUniverse({...market,id:'OTHER'},async()=>({json:async()=>({})})),/lista/);
});
