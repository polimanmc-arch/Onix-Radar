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
