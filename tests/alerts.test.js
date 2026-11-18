const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const H=3600, D=86400;
const utc=(y,m,d,h=0,mi=0)=>Date.UTC(y,m-1,d,h,mi)/1000;
const plain=v=>JSON.parse(JSON.stringify(v));

function load(){
  const ctx=vm.createContext({window:{},console,setTimeout,clearTimeout,AbortController,Date,Math});
  for(const f of ['config/timeframes.js','config/indicators.js','config/sp500History.js','config/universes.js','core/indicators.js','core/engine.js','core/ruleEvaluator.js','core/alerts.js'])
    vm.runInContext(fs.readFileSync(path.join(root,'public/app',f),'utf8'),ctx);
  return ctx.window;
}
// Velas diarias de lunes a viernes a las 14:30 UTC, de la más reciente a la más antigua.
function dailySeries(lastDay, closesOldestFirst){
  const times=[]; let t=lastDay;
  while(times.length<closesOldestFirst.length){ const dow=new Date(t*1000).getUTCDay(); if(dow!==0&&dow!==6) times.push(t); t-=D; }
  const closes=[...closesOldestFirst].reverse();
  return {ok:true,closes,opens:closes,highs:closes,lows:closes,volumes:closes.map(()=>1),times};
}
const priceAbove=v=>({ind:'PRICE',tf:'1d',op:'>',cmpType:'val',cmpVal:v,params:{}});

test('candles are closed by session time; weekly candles close on Friday and monthly on the last weekday',()=>{
  const {candleCloseTime}=load().StockScannerCore;
  const tue=utc(2026,11,17,14,30);
  assert.equal(candleCloseTime('1d',tue),utc(2026,11,17,21));
  assert.equal(candleCloseTime('1d',utc(2026,11,17,8)),utc(2026,11,17,21),'European session, same day');
  assert.equal(candleCloseTime('1wk',utc(2026,11,16,5)),utc(2026,11,20,21),'week starting Monday closes Friday');
  assert.equal(candleCloseTime('1mo',utc(2026,10,1,4)),utc(2026,10,30,21),'Oct 31 2026 is Saturday → Friday 30');
  assert.equal(candleCloseTime('4h',tue),tue+4*H);
});

test('only signals on a candle closed since the last run that did not pass on the previous candle are new',()=>{
  const core=load().StockScannerCore;
  const lastDay=utc(2026,11,17,14,30); // martes
  const after=utc(2026,11,17,21,30), during=utc(2026,11,17,18);
  const data={
    NEW:{'1d':dailySeries(lastDay,[90,90,90,110])},     // cruza hoy
    OLD:{'1d':dailySeries(lastDay,[90,110,110,110])},   // ya pasaba ayer
    NONE:{'1d':dailySeries(lastDay,[110,110,110,90])},
    BAD:{'1d':{ok:false}},
  };
  const alert={id:'a',filters:[priceAbove(100)]};
  const res=core.evaluateAlert({alert,dataByTicker:data,now:after,windowSeconds:26*H});
  assert.deepEqual(plain(res.all.map(r=>r.ticker).sort()),['NEW','OLD']);
  assert.deepEqual(plain(res.fresh.map(r=>r.ticker)),['NEW']);
  assert.deepEqual(plain(res.errors),['BAD']);
  // Durante la sesión la vela de hoy no está cerrada: se evalúa la de ayer.
  const mid=core.evaluateAlert({alert,dataByTicker:data,now:during,windowSeconds:26*H});
  assert.deepEqual(plain(mid.all.map(r=>r.ticker).sort()),['NONE','OLD'],'Monday is the last closed candle');
  assert.equal(mid.fresh.length,0,'both already passed on Friday');
  // Dos días después la señal ya no es nueva.
  const later=core.evaluateAlert({alert,dataByTicker:data,now:after+2*D,windowSeconds:26*H});
  assert.equal(later.fresh.length,0);
});

test('weekly filters alert on Friday after the close and are not repeated on Monday',()=>{
  const core=load().StockScannerCore;
  const mondays=Array.from({length:40},(_,i)=>utc(2026,11,16,5)-i*7*D);
  const closes=mondays.map((_,i)=>i===0?120:90);
  const wk={ok:true,closes,opens:closes,highs:closes,lows:closes,volumes:closes.map(()=>1),times:mondays};
  const alert={id:'w',filters:[{ind:'PRICE',tf:'1wk',op:'>',cmpType:'val',cmpVal:100,params:{}}]};
  const friday=core.evaluateAlert({alert,dataByTicker:{X:{'1wk':wk}},now:utc(2026,11,20,21,30)});
  assert.deepEqual(plain(friday.fresh.map(r=>r.ticker)),['X']);
  const thursday=core.evaluateAlert({alert,dataByTicker:{X:{'1wk':wk}},now:utc(2026,11,19,21,30)});
  assert.equal(thursday.all.length,0,'the week is still forming on Thursday');
  const monday=core.evaluateAlert({alert,dataByTicker:{X:{'1wk':{...wk,times:[utc(2026,11,23,5),...wk.times],closes:[100,...wk.closes],opens:[100,...wk.opens],highs:[100,...wk.highs],lows:[100,...wk.lows],volumes:[1,...wk.volumes]}}},now:utc(2026,11,23,21,30)});
  assert.equal(monday.fresh.length,0);
});

test('Telegram messages escape HTML and split under the size limit',()=>{
  const {formatAlertMessages}=load().StockScannerCore;
  const rows=Array.from({length:300},(_,i)=>({ticker:'T'+i,price:10+i,chg:1.5}));
  const msgs=formatAlertMessages({title:'S&P <500>',subtitle:'hoy',rows,filters:[priceAbove(100)],maxRows:300,limit:1500});
  assert.ok(msgs.length>1);
  assert.ok(msgs.every(m=>m.length<=1600));
  assert.ok(msgs[0].includes('S&amp;P &lt;500&gt;'));
  assert.ok(msgs.at(-1).includes('PRICE [1D] &gt; 100'));
  assert.equal(msgs.join('\n').match(/<code>T\d+<\/code>/g).length,300);
  assert.match(formatAlertMessages({title:'x',rows:[]})[0],/Sin señales nuevas/);
});

test('Telegram route: status, validation, server-side formatting, rate limit and no token leaks',async()=>{
  const express=require('express');
  const {createTelegramRouter}=require(path.join(root,'server/routes/telegram.routes'));
  const calls=[];
  let clock=1_000_000;
  const fetchImpl=async(url,opts)=>{ calls.push({url,body:JSON.parse(opts.body)}); return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:calls.length}})}; };
  const make=async env=>{ const app=express(); app.use(express.json()); app.use('/api',createTelegramRouter({env,fetchImpl,now:()=>clock})); const srv=app.listen(0,'127.0.0.1'); await new Promise(r=>srv.once('listening',r)); return srv; };
  const call=async(server,method,url,body)=>{ const r=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method,headers:{'Content-Type':'application/json'},body:body&&JSON.stringify(body)}); return {status:r.status,json:await r.json()}; };
  const off=await make({});
  try{
    assert.deepEqual((await call(off,'GET','/api/telegram/status')).json,{ok:true,configured:false});
    assert.equal((await call(off,'POST','/api/telegram/send',{rows:[{ticker:'AAPL'}]})).status,503);
  } finally { off.close(); }
  const on=await make({TELEGRAM_BOT_TOKEN:'123:SECRET',TELEGRAM_CHAT_ID:'42'});
  try{
    assert.equal((await call(on,'GET','/api/telegram/status')).json.configured,true);
    assert.equal((await call(on,'POST','/api/telegram/send',{rows:[{ticker:'<script>'}]})).status,400,'invalid tickers are dropped');
    const ok=await call(on,'POST','/api/telegram/send',{title:'Test <b>',rows:[{ticker:'AAPL',price:200,chg:1}],filters:[priceAbove(100)],text:'texto libre ignorado'});
    assert.equal(ok.status,200);
    assert.equal(calls.length,1);
    assert.equal(calls[0].body.chat_id,'42');
    assert.equal(calls[0].body.parse_mode,'HTML');
    assert.ok(calls[0].body.text.includes('<code>AAPL</code>')&&calls[0].body.text.includes('Test &lt;b&gt;'));
    assert.ok(!calls[0].body.text.includes('texto libre'));
    assert.ok(calls[0].url.endsWith('/bot123:SECRET/sendMessage'));
    const limited=await call(on,'POST','/api/telegram/send',{rows:[{ticker:'MSFT'}]});
    assert.equal(limited.status,429);
    assert.ok(!JSON.stringify(limited.json).includes('SECRET'));
    clock+=20000;
    assert.equal((await call(on,'POST','/api/telegram/send',{rows:[{ticker:'MSFT'}]})).status,200);
  } finally { on.close(); }
});

test('Telegram API errors never expose the bot token',async()=>{
  const {sendTelegramMessages}=require(path.join(root,'server/services/telegram.service'));
  const fetchImpl=async()=>({ok:false,status:401,json:async()=>({ok:false,description:'Unauthorized'})});
  await assert.rejects(sendTelegramMessages(['hola'],{env:{TELEGRAM_BOT_TOKEN:'999:TOPSECRET',TELEGRAM_CHAT_ID:'1'},fetchImpl}),e=>{
    assert.ok(!e.message.includes('TOPSECRET')); assert.match(e.message,/401/); return true; });
});

test('alert runner validates the file, resolves universes and only sends when there is something new',async()=>{
  const {readAlerts,resolveUniverse,runAlerts}=require(path.join(root,'scripts/run-alerts.js'));
  const tmp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'alerts-'));
  const file=path.join(tmp,'alerts.json');
  fs.writeFileSync(file,JSON.stringify({alerts:[{id:'a',filters:[priceAbove(1)]},{id:'a',filters:[priceAbove(1)]}]}));
  assert.throws(()=>readAlerts(file),/repetido/);
  const shipped=readAlerts(path.join(root,'alerts/alerts.json'));
  assert.ok(shipped.length>=1);
  const w=load();
  assert.equal(resolveUniverse({id:'x',universe:'DOW30'},w.StockScannerConfig).tickers.length,30);
  assert.throws(()=>resolveUniverse({id:'x',universe:'NOPE'},w.StockScannerConfig),/desconocido/);
  const lastDay=utc(2026,11,17,14,30);
  const series={NEW:dailySeries(lastDay,[90,90,90,110]),OLD:dailySeries(lastDay,[90,110,110,110])};
  w.StockScannerCore.fetchTicker=async t=>series[t]||{ok:false};
  const logs=[];
  const out=await runAlerts({alerts:[
    {id:'x',name:'X',tickers:['NEW','OLD'],filters:[priceAbove(100)]},
    {id:'y',name:'Y',tickers:['OLD'],filters:[priceAbove(100)]},
    {id:'z',name:'Z',tickers:['NEW','GONE1','GONE2'],filters:[priceAbove(1000)]},
  ],core:w.StockScannerCore,cfg:w.StockScannerConfig,now:utc(2026,11,17,21,30),log:m=>logs.push(m)});
  assert.equal(out[0].shouldSend,true);
  assert.deepEqual(plain(out[0].res.fresh.map(r=>r.ticker)),['NEW']);
  assert.equal(out[1].shouldSend,false,'repeated signals are not sent');
  assert.equal(out[2].dataProblem,true,'most symbols without data triggers a warning message');
  assert.equal(logs.length,3);
});
