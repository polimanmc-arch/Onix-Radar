const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const React=require('react');
const Renderer=require('react-test-renderer');
const root=path.resolve(__dirname,'..');

async function mountApp(){
  const storage=new Map([['onix_scanner_config_open_v1','false']]);
  let element;
  const charts=[];
  const window={addEventListener(){},removeEventListener(){},LightweightCharts:{createChart(host,options){
    const record={removed:false,candles:[],lines:[],options};charts.push(record);
    const scale={applyOptions(){}};
    return {addCandlestickSeries:()=>({setData:rows=>{record.candles=rows;},priceScale:()=>scale}),
      addHistogramSeries:()=>({setData(){},priceScale:()=>scale}),
      addLineSeries:opts=>{const line={...opts};record.lines.push(line);return {setData:rows=>{line.data=rows;},priceScale:()=>scale};},
      subscribeCrosshairMove:callback=>{record.crosshair=callback;},
      priceScale:()=>scale,timeScale:()=>({fitContent(){},setVisibleLogicalRange(){},subscribeVisibleLogicalRangeChange(){}}),applyOptions(){},remove(){record.removed=true;}};
  }}};
  const document={getElementById:()=>({}),documentElement:{getAttribute:()=>null,setAttribute(){},removeAttribute(){}}};
  const ctx=vm.createContext({window,document,React,ReactDOM:{createRoot:()=>({render:e=>{element=e;}})},console,
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    fetch:async()=>({ok:true,json:async()=>({chart:{result:[{timestamp:[1]}]},sectors:{},results:{}})}),
    setTimeout,clearTimeout,AbortController,Date,performance,URL,Blob,navigator:{},
    LightweightCharts:window.LightweightCharts,ResizeObserver:class{observe(){} disconnect(){}},
    getComputedStyle:()=>({getPropertyValue:()=> '#171820'}),MutationObserver:class{observe(){} disconnect(){}}});
  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  for(const [,src] of html.matchAll(/<script src="(\/app\/[^"?]+)"/g)){
    if(src==='/app/compiled/main.js'){
      const hook=window.StockScannerDomainState.useScannerState;
      window.StockScannerDomainState.useScannerState=(...args)=>{window.scannerState=hook(...args);return window.scannerState;};
      const btHook=window.StockScannerDomainState.useBacktestState;
      window.StockScannerDomainState.useBacktestState=(...args)=>{window.backtestState=btHook(...args);return window.backtestState;};
      const pfHook=window.StockScannerDomainState.usePortfolioState;
      window.StockScannerDomainState.usePortfolioState=(...args)=>{window.portfolioState=pfHook(...args);return window.portfolioState;};
    }
    vm.runInContext(fs.readFileSync(path.join(root,'public',src),'utf8'),ctx,{filename:src});
  }
  let tree;
  await Renderer.act(async()=>{tree=Renderer.create(element,{createNodeMock:()=>({})});});
  return {tree,ctx,window,charts};
}

test('workspace renders empty state, functional navigation, and accessible theme control',async()=>{
  const {tree,window,charts}=await mountApp();
  assert.equal(tree.root.findAllByProps({className:'workspace-rail'}).length,1);
  assert.equal(tree.root.findAllByProps({className:'scanner-workspace'}).length,1);
  assert.equal(tree.root.findAllByProps({'aria-label':'Cambiar a tema claro'}).length,1);
  await Renderer.act(async()=>tree.root.findByProps({'aria-label':'Backtest'}).props.onClick());
  assert.equal(tree.root.findByProps({'aria-label':'Backtest'}).props['aria-current'],'page');
  assert.equal(tree.root.findAllByProps({className:'scanner-workspace'}).length,0);
  assert.ok(JSON.stringify(tree.toJSON()).includes('Configurar estrategia'));
  await Renderer.act(async()=>tree.root.findByProps({'aria-label':'Portafolio'}).props.onClick());
  assert.ok(JSON.stringify(tree.toJSON()).includes('Configuración y universo'));
  await Renderer.act(async()=>tree.unmount());
});

test('backtest only mounts the selected report view and folds strategy settings after a result',async()=>{
  const {tree,window}=await mountApp();
  const trade={ticker:'AAPL',dir:'long',entryPrice:100,exitPrice:110,returnPct:10,pnl:100,duration:2,reason:'Salida por regla'};
  await Renderer.act(async()=>{
    window.backtestState.setBacktest({equityCurve:[{value:10000,holdings:0},{value:11000,holdings:1}],
      startVal:10000,endVal:11000,capital:10000,totalReturn:.1,maxDrawdown:.02,annReturn:.03,annVol:.1,profitFactor:Infinity,winRate:1,sharpe:.6,weeks:208,
      allTrades:[trade],trades:{buys:1,sells:1}});
  });
  await Renderer.act(async()=>tree.root.findByProps({'aria-label':'Backtest'}).props.onClick());
  assert.ok(JSON.stringify(tree.toJSON()).includes('Equity Curve'));
  assert.equal(tree.root.find(n=>n.type==='button'&&n.children.includes('Configurar estrategia')).props['aria-expanded'],false);
  const reportNav=tree.root.findByProps({'aria-label':'Vistas del backtest'});
  await Renderer.act(async()=>reportNav.findAllByType('button')[1].props.onClick());
  assert.ok(!JSON.stringify(tree.toJSON()).includes('Equity Curve'));
  assert.ok(JSON.stringify(tree.toJSON()).includes('Salida por regla'));
  const tradePanel=tree.root.findByProps({className:'bt-trades-table'});
  assert.equal(tradePanel.props.style.maxHeight,undefined,'height comes from the full report viewport styles');
  await Renderer.act(async()=>reportNav.findAllByType('button')[2].props.onClick());
  assert.equal(tree.root.findAllByProps({className:'bt-distribution-donut'}).length,1);
  assert.equal(tree.root.findByProps({className:'bt-distribution-donut'}).props.role,'img');
  assert.equal(tree.root.findAllByProps({className:'bt-analysis-chart'}).length,2);
  assert.equal(tree.root.findAllByProps({className:'bt-trades-table'}).length,0);
  await Renderer.act(async()=>reportNav.findAllByType('button')[0].props.onClick());
  assert.ok(JSON.stringify(tree.toJSON()).includes('Equity Curve'));
  assert.ok(!JSON.stringify(tree.toJSON()).includes('Salida por regla'));
  await Renderer.act(async()=>tree.unmount());
});

test('scanner row selection uses the inspector; advanced chart stays opt-in',async()=>{
  const {tree,window,charts}=await mountApp();
  const scanner=tree.root.find(n=>n.type?.name==='ScannerTab');
  const app=scanner.props.ctx;
  const rows=['AAPL','MSFT'].map(ticker=>({ticker,name:ticker,passed:true,price:100,chg:1,fRes:[],shortFRes:[],spark:[],mainTf:'1d'}));
  const closes=[105,103,104];
  rows.forEach(r=>{app.dataCacheRef.current[r.ticker]={'1d':{ok:true,times:[300,200,100],closes,opens:closes,highs:closes,lows:closes,volumes:[30,20,10]}};});
  await Renderer.act(async()=>window.scannerState.setResults(rows));
  let tableRows=tree.root.findAll(n=>n.type==='tr'&&n.props.tabIndex===0);
  assert.equal(tableRows.length,2);
  await Renderer.act(async()=>tableRows[1].props.onClick());
  assert.equal(tree.root.findByProps({className:'inspector-heading'}).findByType('strong').children[0],'MSFT');
  assert.equal(tree.root.findAllByProps({className:'chart-modal'}).length,0);
  await Renderer.act(async()=>app.addLog('Mensaje de prueba'));
  assert.ok(!JSON.stringify(tree.toJSON()).includes('Mensaje de prueba'));
  await Renderer.act(async()=>tree.root.find(n=>n.type==='button'&&n.children.join('')==='Actividad +').props.onClick());
  assert.ok(JSON.stringify(tree.toJSON()).includes('Mensaje de prueba'));
  assert.equal(charts.length,2,'one chart per selected ticker, never per log update');
  assert.deepEqual(Array.from(charts[1].candles,r=>r.time),[100,200,300]);
  await Renderer.act(async()=>tree.unmount());
  assert.ok(charts.every(c=>c.removed),'dispose charts on selection change and unmount');
});

test('portfolio shows only the requested result panel',async()=>{
  const {tree,window}=await mountApp();
  await Renderer.act(async()=>window.portfolioState.setPortfolio({allocations:[],sectors:[],frontier:[],
    portReturn:.04,portVol:.12,portSharpe:.5,cash:10000,capital:10000,mode:'maxsharpe',source:'scan'}));
  await Renderer.act(async()=>tree.root.findByProps({'aria-label':'Portafolio'}).props.onClick());
  assert.ok(tree.root.findAll(n=>n.type?.name==='EfficientFrontierCard').length===1);
  assert.equal(tree.root.findAll(n=>n.type?.name==='AllocationsTable').length,0);
  const nav=tree.root.findByProps({'aria-label':'Vistas del portafolio'});
  await Renderer.act(async()=>nav.findAllByType('button')[1].props.onClick());
  assert.equal(tree.root.findAll(n=>n.type?.name==='EfficientFrontierCard').length,0);
  assert.equal(tree.root.findAll(n=>n.type?.name==='AllocationsTable').length,1);
  await Renderer.act(async()=>nav.findAllByType('button')[2].props.onClick());
  assert.equal(tree.root.findAll(n=>n.type?.name==='AllocationsTable').length,0);
  assert.equal(tree.root.findAll(n=>n.type?.name==='CorrelationHeatmapCard').length,1);
  await Renderer.act(async()=>tree.unmount());
});

test('mini chart keeps indicators in cards; expanded renderer retains overlays and oscillators',async()=>{
  const {tree,window,charts}=await mountApp();
  const app=tree.root.find(n=>n.type?.name==='ScannerTab').props.ctx;
  const closes=Array.from({length:65},(_,i)=>150-i+Math.sin(i));
  const data={ticker:'AAPL',ok:true,closes,opens:closes,highs:closes.map(x=>x+1),lows:closes.map(x=>x-1),volumes:closes.map(()=>1000),times:closes.map((_,i)=>1800000000-i*86400)};
  app.dataCacheRef.current.AAPL={'1d':{...data,tf:'1d'},'1wk':{...data,tf:'1wk'}};
  const filters=[
    {_id:'p',ind:'PRICE',params:{},tf:'1d',op:'>',cmpType:'ind',cmpInd:'WMA',cmpParams:{p:5}},
    {_id:'r',ind:'RSI',params:{p:14},tf:'1d',op:'>',cmpType:'val',cmpVal:50},
    {_id:'w',ind:'WMA',params:{p:10},tf:'1wk',op:'>',cmpType:'prev'},
    {_id:'a',ind:'ATR',params:{p:14},tf:'1d',op:'>',cmpType:'val',cmpVal:0},
  ];
  await Renderer.act(async()=>{
    window.scannerState.setFilters(filters);
    window.scannerState.setResults([{ticker:'AAPL',name:'Apple',price:150,chg:1,passed:true,mainTf:'1d',fRes:[],spark:[]}]);
  });
  assert.equal(charts.length,1,'mini chart never creates an oscillator pane');
  assert.equal(charts[0].lines.length,0,'mini chart never draws indicator overlays');
  assert.equal(tree.root.findAllByProps({className:'inspector-oscillator'}).length,0);
  const chartRenderer=window.StockScannerUI.ChartRenderer;
  const host={clientWidth:800,clientHeight:350};
  const times=[...data.times].reverse();
  const candles=times.map((time,i)=>({time,open:closes[closes.length-i-1],high:data.highs[closes.length-i-1],low:data.lows[closes.length-i-1],close:closes[closes.length-i-1]}));
  const opts={activeFilters:filters,chartTf:'1d',setCrossInfo:()=>{}};
  const fullPrice=chartRenderer.buildPriceChart(host,data,times,candles,opts);
  const fullOsc=chartRenderer.buildOscChart(host,fullPrice,data,times,'1d',opts);
  assert.ok(charts[1].lines.some(l=>l.title==='WMA(5)'&&l.data.length>0));
  assert.ok(charts[2].lines.some(l=>l.title==='RSI(14)'&&l.data.length>0));
  const atr=charts[2].lines.find(l=>l.title==='ATR(14)');
  for(let i=0;i<atr.data.length;i++){
    const offset=atr.data.length-1-i;
    const expected=window.StockScannerCore.calcATR(data.highs.slice(offset),data.lows.slice(offset),data.closes.slice(offset),14)[0];
    assert.ok(Math.abs(atr.data[i].value-expected)<1e-8,'ATR history matches the core calculation');
  }
  assert.equal(tree.root.findAllByProps({className:'inspector-indicator-card'}).length,3);
  assert.equal(tree.root.findAllByProps({className:'inspector-indicator-card'})[0].findByType('strong').children[0],data.closes[1].toFixed(2),'default cards use the same closed candle as the scanner');
  assert.ok(!JSON.stringify(tree.toJSON()).includes('Mercado y rango'));
  assert.ok(!JSON.stringify(tree.toJSON()).includes('Análisis técnico'));
  assert.equal(tree.root.findAllByProps({'aria-label':'Indicadores visibles'}).length,0);
  await Renderer.act(async()=>charts[0].crosshair({time:data.times[5],point:{x:10,y:10}}));
  assert.equal(tree.root.findAllByProps({className:'inspector-cursor-date'}).length,1);
  const priceCard=tree.root.findAllByProps({className:'inspector-indicator-card'})[0];
  assert.equal(priceCard.findByType('strong').children[0],data.closes[5].toFixed(2));
  assert.equal(charts.length,3,'cursor changes update values without rebuilding charts');
  await Renderer.act(async()=>tree.root.findByProps({'aria-label':'Temporalidad del inspector'}).props.onChange({target:{value:'1wk'}}));
  assert.ok(charts[0].removed);
  assert.equal(tree.root.findAllByProps({className:'inspector-indicator-card'}).length,1);
  assert.equal(charts.at(-1).lines.length,0,'changing mini-chart timeframe keeps overlays hidden');
  chartRenderer.disposeChart(fullOsc);
  chartRenderer.disposeChart(fullPrice);
  await Renderer.act(async()=>tree.unmount());
  assert.ok(charts.every(c=>c.removed));
});

test('stochastic rule parameters have visible values and edit independently',async()=>{
  const {tree,window}=await mountApp();
  await Renderer.act(async()=>window.backtestState.setEntryRules([{_id:'stoch-group',conditions:[{
    ind:'STOCH',tf:'1wk',params:{p:14,ks:1,dp:3},op:'<',cmpType:'val',cmpVal:20,
  }]}]));
  await Renderer.act(async()=>tree.root.findByProps({'aria-label':'Backtest'}).props.onClick());
  const k=tree.root.findAllByProps({'aria-label':'Estocástico: K'})[0];
  const smooth=tree.root.findAllByProps({'aria-label':'Estocástico: Suavizado'})[0];
  const d=tree.root.findAllByProps({'aria-label':'Estocástico: D'})[0];
  assert.deepEqual([k.props.value,smooth.props.value,d.props.value],[14,1,3]);
  assert.equal(k.props.style.minWidth,76);
  await Renderer.act(async()=>smooth.props.onChange({target:{value:'5'}}));
  assert.deepEqual(JSON.parse(JSON.stringify(window.backtestState.entryRules[0].conditions[0].params)),{p:14,ks:5,dp:3});
  await Renderer.act(async()=>tree.unmount());
});

function reportFixture(extra={}){
  return {equityCurve:[{value:10000,holdings:0},{value:8500,holdings:2,mktBlocked:true},{value:11000,holdings:1}],
    startVal:10000,endVal:11000,capital:10000,totalReturn:.1,maxDrawdown:.15,annReturn:.03,annVol:.1,
    profitFactor:1.1,winRate:.5,sharpe:.6,weeks:208,allTrades:[],trades:{buys:0,sells:0},...extra};
}

test('each trade column sorts both ways using numbers, dates and stable text ordering',async()=>{
  const {tree,window}=await mountApp();
  const trades=[
    {ticker:'MSFT',dir:'short',entryTime:30,exitTime:70,entryPrice:20,exitPrice:30,returnPct:2,pnl:100,duration:10,entryReason:'beta',reason:'zeta'},
    {ticker:'AAPL',dir:'long',entryTime:10,exitTime:30,entryPrice:100,exitPrice:5,returnPct:10,pnl:-9,duration:2,entryReason:'gamma',reason:'beta'},
    {ticker:'NVDA',dir:'long',entryTime:20,exitTime:50,entryPrice:9,exitPrice:100,returnPct:-3,pnl:50,duration:5,entryReason:'alpha',reason:'alpha'},
  ];
  const original=JSON.stringify(trades);
  const result=reportFixture({allTrades:trades});
  await Renderer.act(async()=>window.backtestState.setBacktest(result));
  await Renderer.act(async()=>tree.root.findByProps({'aria-label':'Backtest'}).props.onClick());
  const nav=tree.root.findByProps({'aria-label':'Vistas del backtest'});
  await Renderer.act(async()=>nav.findAllByType('button')[1].props.onClick());
  const table=()=>tree.root.findByProps({className:'bt-trades-table'});
  const order=()=>table().findByType('tbody').findAllByType('tr').map(row=>row.findAllByType('td')[0].children.join(''));
  const expectedAsc=[['AAPL','MSFT','NVDA'],['AAPL','NVDA','MSFT'],['AAPL','NVDA','MSFT'],['AAPL','NVDA','MSFT'],['NVDA','MSFT','AAPL'],['AAPL','MSFT','NVDA'],['NVDA','MSFT','AAPL'],['AAPL','NVDA','MSFT'],['AAPL','NVDA','MSFT'],['NVDA','MSFT','AAPL'],['NVDA','AAPL','MSFT']];
  for(let i=0;i<11;i++){
    const header=()=>table().findAllByType('th')[i];
    await Renderer.act(async()=>header().findByType('button').props.onClick());
    assert.deepEqual(order(),expectedAsc[i],'ascending column '+i);
    assert.equal(header().props['aria-sort'],'ascending');
    await Renderer.act(async()=>header().findByType('button').props.onClick());
    assert.deepEqual(order(),i===1?['MSFT','AAPL','NVDA']:[...expectedAsc[i]].reverse(),'descending column '+i);
    assert.equal(header().props['aria-sort'],'descending');
  }
  assert.equal(JSON.stringify(trades),original,'sorting does not mutate exported or calculated trade data');
  await Renderer.act(async()=>window.backtestState.setBacktest({...result,allTrades:[...trades,{...trades[0],ticker:'MISSING',entryPrice:null}]}));
  await Renderer.act(async()=>tree.root.findByProps({'aria-label':'Vistas del backtest'}).findAllByType('button')[1].props.onClick());
  const priceHeader=()=>table().findAllByType('th')[4].findByType('button');
  await Renderer.act(async()=>priceHeader().props.onClick());
  assert.equal(order().at(-1),'MISSING');
  await Renderer.act(async()=>priceHeader().props.onClick());
  assert.equal(order().at(-1),'MISSING','missing values remain last in either direction');
  await Renderer.act(async()=>tree.unmount());
});

test('equity and line-only drawdown expose pointer and keyboard tooltips without remounting the SVG',async()=>{
  const {tree,window}=await mountApp();
  await Renderer.act(async()=>window.backtestState.setBacktest(reportFixture({benchSymbol:'SPY',benchReturn:.1,
    benchCurve:[{value:10000},{value:9000},{value:11000}]})));
  await Renderer.act(async()=>tree.root.findByProps({'aria-label':'Backtest'}).props.onClick());
  const equity=()=>tree.root.findByProps({'aria-label':'Curva de capital interactiva'});
  const svg=tree.root.findByProps({className:'bt-equity-chart'});
  const drawdown=()=>tree.root.findByProps({'aria-label':'Drawdown interactivo'});
  const event={currentTarget:{getBoundingClientRect:()=>({left:10,width:200})},clientX:110};
  await Renderer.act(async()=>equity().props.onPointerMove(event));
  const flatten=node=>typeof node==='string'?node:(node.children||[]).map(flatten).join(' ');
  const text=()=>flatten(tree.root.findByProps({role:'tooltip'}));
  assert.ok(text().includes('8,500.00'));
  assert.ok(text().includes('9,000.00'));
  assert.ok(text().includes('-15.00%'));
  assert.ok(text().includes('entradas bloqueadas'));
  assert.equal(tree.root.findByProps({className:'bt-equity-chart'}),svg);
  await Renderer.act(async()=>equity().props.onPointerLeave());
  assert.equal(tree.root.findAllByProps({role:'tooltip'}).length,0);
  await Renderer.act(async()=>drawdown().props.onPointerDown(event));
  assert.ok(text().includes('-15.00%'));
  assert.equal(tree.root.findByProps({className:'bt-drawdown-chart'}).findAllByType('rect').length,0);
  assert.equal(tree.root.findByProps({className:'bt-drawdown-chart'}).findAllByType('polyline').length,1);
  await Renderer.act(async()=>drawdown().props.onKeyDown({key:'End',preventDefault(){}}));
  assert.ok(text().includes('11,000.00'));
  await Renderer.act(async()=>drawdown().props.onKeyDown({key:'Home',preventDefault(){}}));
  assert.ok(text().includes('10,000.00'));
  await Renderer.act(async()=>drawdown().props.onKeyDown({key:'Escape',preventDefault(){}}));
  assert.equal(tree.root.findAllByProps({role:'tooltip'}).length,0);
  await Renderer.act(async()=>tree.unmount());
});

test('analysis view shows the performance report with monthly heatmap, drawdowns and benchmark stats',async()=>{
  const {tree,window}=await mountApp();
  const start=Math.floor(Date.UTC(2025,0,6,5)/1000), W=7*86400;
  let v=10000,b=500;
  const equityCurve=[], benchCurve=[{week:0,time:start-W,value:500}];
  for(let i=0;i<40;i++){ const r=0.01*Math.sin(i); v*=1+r; b*=1+r/2; equityCurve.push({time:start+i*W,value:v,holdings:1}); benchCurve.push({week:i+1,time:start+i*W,value:b}); }
  await Renderer.act(async()=>window.backtestState.setBacktest(reportFixture({equityCurve,benchCurve,benchSymbol:'SPY',endVal:v,riskFreePct:0})));
  await Renderer.act(async()=>tree.root.findByProps({'aria-label':'Backtest'}).props.onClick());
  await Renderer.act(async()=>tree.root.findByProps({'aria-label':'Vistas del backtest'}).findAllByType('button')[2].props.onClick());
  assert.equal(tree.root.findAllByProps({'aria-label':'Retornos mensuales'}).length,1);
  assert.equal(tree.root.findAllByProps({'aria-label':'Peores drawdowns'}).length,1);
  const text=JSON.stringify(tree.toJSON());
  assert.ok(text.includes('Frente a SPY'));
  assert.ok(text.includes('Beta'));
  await Renderer.act(async()=>tree.unmount());
});

test('scanner computes historical signal performance on demand from the scanned data',async()=>{
  const {tree,window}=await mountApp();
  const app=tree.root.find(n=>n.type?.name==='ScannerTab').props.ctx;
  const now=1800000000;
  const series=shift=>{
    // Tendencia alcista con caídas cada 9 semanas; cierres cerca del mínimo (estocástico bajo).
    const oldest=[]; let p=50;
    for(let i=0;i<220;i++){ const k=(i+shift)%9; p*= k===7||k===8 ? 0.95 : 1.02; oldest.push(p); }
    const closes=oldest.reverse();
    return {ok:true,closes,opens:closes.map(c=>c*1.002),highs:closes.map(c=>c*1.05),lows:closes.map(c=>c*0.995),volumes:closes.map(()=>1e6),times:closes.map((_,i)=>now-i*7*86400)};
  };
  const rows=['AAPL','MSFT','NVDA'].map((ticker,k)=>{ app.dataCacheRef.current[ticker]={'1wk':series(k*5),'1d':series(k)}; return {ticker,name:ticker,passed:true,price:100,chg:1,fRes:[],shortFRes:[],spark:[],mainTf:'1wk'}; });
  await Renderer.act(async()=>window.scannerState.setResults(rows));
  const panel=()=>tree.root.findByProps({'aria-label':'Rendimiento histórico de la señal'});
  const button=()=>panel().findByType('button');
  assert.equal(button().children.join(''),'Calcular');
  await Renderer.act(async()=>{ await button().props.onClick(); });
  const json=JSON.stringify(tree.toJSON());
  assert.equal(button().children.join(''),'Recalcular');
  assert.equal(panel().findAllByProps({'aria-label':'Retornos tras la señal'}).length,1,'synthetic oscillating prices trigger the default filters');
  assert.ok(json.includes('de 3 símbolos'));
  assert.ok(json.includes('13 semanas'));
  await Renderer.act(async()=>tree.unmount());
});
