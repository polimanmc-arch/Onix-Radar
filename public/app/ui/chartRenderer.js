// chartRenderer.js - pure LightweightCharts rendering functions.
// No React. Consumed by ChartModal via window.StockScannerUI.ChartRenderer.
(function(){
  const { seriesWMA, seriesSMA, seriesEMA, seriesRSI, seriesStoch, seriesMACD, evalInd, evalRuleGroups } = window.StockScannerCore;

  // LightweightCharts can emit a late ResizeObserver callback while a modal is
  // being torn down. The chart is already gone, so this specific library error
  // is harmless but noisy and can trip React error boundaries in production.
  if(!window.__onixLwcDisposeGuard){
    window.__onixLwcDisposeGuard = true;
    window.addEventListener('error', (event)=>{
      const msg = String(event?.message||'');
      const stack = String(event?.error?.stack||'');
      const fromLwc = String(event?.filename||'').includes('lightweight-charts') || stack.includes('lightweight-charts');
      if(msg === 'Object is disposed' && (fromLwc || !event?.filename)){
        event.preventDefault();
        event.stopImmediatePropagation?.();
      }
    }, true);
  }
  if(!window.__onixResizeObserverGuard && window.ResizeObserver){
    window.__onixResizeObserverGuard = true;
    const NativeResizeObserver = window.ResizeObserver;
    window.ResizeObserver = class OnixResizeObserver extends NativeResizeObserver {
      constructor(callback){
        super((entries, observer)=>{
          try{
            callback(entries, observer);
          }catch(error){
            if(String(error?.message||error) === 'Object is disposed') return;
            throw error;
          }
        });
      }
    };
  }

  // ─── INDICATOR SERIES CACHE ─────────────────────────────────────────────────
  // Keyed by ticker:tf:ind:params - fingerprinted by closes.length + closes[0]
  // so stale data is never served after a fresh fetch.
  // Capped at MAX_ENTRIES to prevent unbounded memory growth.
  const _seriesCache = new Map();
  const MAX_ENTRIES  = 300;

  function _cacheKey(d, ind, params){
    const fp = (d.closes.length) + ':' + (d.closes[0]?.toFixed(4)||'0');
    return `${d.ticker||'?'}:${d.tf||'?'}:${ind}:${JSON.stringify(params)}:${fp}`;
  }

  function _getCachedSeries(d, ind, params, compute){
    const key = _cacheKey(d, ind, params);
    if(_seriesCache.has(key)) return _seriesCache.get(key);
    const result = compute();
    if(_seriesCache.size >= MAX_ENTRIES){
      // Evict oldest entry (Map preserves insertion order)
      _seriesCache.delete(_seriesCache.keys().next().value);
    }
    _seriesCache.set(key, result);
    return result;
  }

  // Convenience wrappers - same signature as the raw series functions but cached
  const cachedWMA   = (d,p)  => _getCachedSeries(d,'WMA',{p},   ()=>seriesWMA(d.closes,p));
  const cachedSMA   = (d,p)  => _getCachedSeries(d,'SMA',{p},   ()=>seriesSMA(d.closes,p));
  const cachedEMA   = (d,p)  => _getCachedSeries(d,'EMA',{p},   ()=>seriesEMA(d.closes,p));
  const cachedRSI   = (d,p)  => _getCachedSeries(d,'RSI',{p},   ()=>seriesRSI(d.closes,p));
  const cachedSTOCH = (d,p,ks)=> _getCachedSeries(d,'STOCH',{p,ks},()=>seriesStoch(d.highs,d.lows,d.closes,p,ks));
  const cachedMACD  = (d,p,sl,sg)=>_getCachedSeries(d,'MACD',{p,sl,sg},()=>seriesMACD(d.closes,p,sl,sg));
  const cachedATR = (d,p)=>_getCachedSeries(d,'ATR',{p},()=>{
    if(d.closes.length<p+2)return [];
    // Misma serie que calcATR en cada vela (Wilder desde la vela más antigua), de antigua a reciente.
    const s=window.StockScannerCore.seriesATRNewestFirst(d.highs,d.lows,d.closes,p);
    return s.slice(0,d.closes.length-1-p).reverse();
  });

  // ─── THEME-AWARE CHART COLORS ───────────────────────────────────────────
  // Called at render time so it always reads the current data-theme variables.
  function cssVar(name, fallback){
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function getChartColors(){
    return {
      bg:       cssVar('--chart-bg', '#0a0e16'),
      text:     cssVar('--chart-axis', '#5a7898'),
      grid:     cssVar('--chart-grid', 'rgba(28,52,82,.15)'),
      border:   cssVar('--chart-border', 'rgba(28,52,82,.3)'),
      upColor:  cssVar('--chart-up', '#00cc66'),
      dnColor:  cssVar('--chart-down', '#dd3333'),
      volumeUp: cssVar('--chart-volume-up', 'rgba(0,204,102,.35)'),
      volumeDn: cssVar('--chart-volume-down', 'rgba(221,51,51,.35)'),
      stopLine: cssVar('--chart-stop', 'rgba(220,40,50,.72)'),
      longLine: cssVar('--chart-long', 'rgba(0,214,143,.55)'),
      shortLine:cssVar('--chart-short', 'rgba(168,85,247,.58)'),
      exitLine: cssVar('--chart-exit', 'rgba(221,51,51,.82)'),
      coverLine:cssVar('--chart-cover', 'rgba(245,158,11,.88)'),
      levelLine:cssVar('--chart-level', 'rgba(148,168,196,.34)'),
      exitLevel:cssVar('--chart-exit-level', 'rgba(255,71,87,.55)'),
      mutedLine:cssVar('--chart-muted-line', '#6b7890'),
      purple:   cssVar('--purple', '#a855f7'),
      green:    cssVar('--green', '#00d68f'),
      red:      cssVar('--red', '#ff4757'),
      amber:    cssVar('--amber', '#ffb340'),
      ma: {
        WMA: cssVar('--amber', '#f80'),
        SMA: cssVar('--accent', '#09f'),
        EMA: cssVar('--purple', '#c6f'),
      },
      osc: [
        cssVar('--amber', '#f80'),
        cssVar('--accent', '#09f'),
        cssVar('--purple', '#c6f'),
        cssVar('--green', '#0c6'),
      ],
      fontFamily: cssVar('--font-mono', "'IBM Plex Mono','Menlo',monospace"),
    };
  }

  function makeChartTheme(colors, height){
    return {
      layout:{ background:{type:'solid',color:colors.bg}, textColor:colors.text, fontSize:10, fontFamily:colors.fontFamily },
      crosshair:{
        mode:0,
        vertLine:{ color:colors.mutedLine, width:1, style:2, labelBackgroundColor:colors.border },
        horzLine:{ color:colors.mutedLine, width:1, style:2, labelBackgroundColor:colors.border },
      },
      timeScale:{ timeVisible:true, borderColor:colors.border },
      rightPriceScale:{ borderColor:colors.border },
      grid:{ vertLines:{color:colors.grid}, horzLines:{color:colors.grid} },
    };
  }
  // ─── MA OVERLAYS ────────────────────────────────────────────────────────────
  function quietResizeObservers(root){
    const seen = new Set();
    const walk = (obj, depth) => {
      if(!obj || typeof obj !== 'object' || seen.has(obj) || depth > 5) return;
      seen.add(obj);
      try{
        if(Object.prototype.hasOwnProperty.call(obj, '_allowResizeObserver')) obj._allowResizeObserver = false;
        const ro = obj._canvasElementResizeObserver;
        if(ro && typeof ro.disconnect === 'function') ro.disconnect();
      }catch{}
      Object.getOwnPropertyNames(obj).forEach((key)=>{
        let value;
        try{ value = obj[key]; }catch{ return; }
        if(value && typeof value === 'object') walk(value, depth + 1);
      });
    };
    walk(root, 0);
  }

  function disposeChart(chart){
    if(!chart) return;
    quietResizeObservers(chart);
    try{ chart.remove(); }catch{}
  }

  function applyMaOverlays(priceChart, d, times, activeFilters, chartTf){
    const colors = getChartColors();
    const drawn=new Set();
    const draw=(f,comparison=false)=>{
      if(!['WMA','SMA','EMA'].includes(f.ind)) return;
      const key=f.ind+':'+f.params.p;
      if(drawn.has(key))return;
      drawn.add(key);
      const series = f.ind==='WMA' ? cachedWMA(d,f.params.p)
                   : f.ind==='SMA' ? cachedSMA(d,f.params.p)
                                   : cachedEMA(d,f.params.p);
      if(!series.length) return;
      const offset=times.length-series.length;
      const lineData=series.map((v,i)=>({time:times[i+offset],value:v}));
      priceChart.addLineSeries({color:comparison?colors.mutedLine:colors.ma[f.ind]||colors.ma.WMA,lineWidth:comparison?1:2,lineStyle:comparison?2:0,title:f.ind+'('+f.params.p+')'}).setData(lineData);
    };
    const tfFilters=(activeFilters||[]).filter(f=>f.tf===chartTf);
    tfFilters.forEach(f=>draw(f));
    tfFilters.forEach(f=>{
      if(f.cmpType==='ind')draw({ind:f.cmpInd,params:f.cmpParams},true);
    });
  }

  // ─── STOP-LOSS LINE ─────────────────────────────────────────────────────────
  function applyStopLine(priceChart, candles, stopPrice, stopColor){
    if(stopPrice==null || !isFinite(stopPrice) || stopPrice<=0 || !candles?.length) return;
    priceChart.addLineSeries({color:stopColor||getChartColors().stopLine,lineWidth:2,lineStyle:0,
      title:'',crosshairMarkerVisible:false,lastValueVisible:false,priceLineVisible:false})
      .setData(candles.map(c=>({time:c.time,value:stopPrice})));
  }

  // ─── BACKTEST TRADE MARKERS ─────────────────────────────────────────────────
  function applyTradeMarkers(priceChart, candleSeries, candles, backtestTrades){
    if(!Array.isArray(backtestTrades)||!backtestTrades.length) return;
    const colors = getChartColors();
    const timeSet=new Set(candles.map(c=>c.time));
    const findClosest=t=>{ if(t==null)return null; if(timeSet.has(t))return t; const n=candles.find(c=>c.time>=t); return n?.time??candles[candles.length-1]?.time??null; };
    const markers=backtestTrades.flatMap(trade=>{
      const entryTime=findClosest(trade.entryTime), exitTime=findClosest(trade.exitTime);
      const isShort=(trade.dir||trade.direction||'').toLowerCase()==='short';
      if(entryTime&&exitTime&&trade.entryPrice!=null&&trade.exitPrice!=null){
        priceChart.addLineSeries({color:isShort?colors.shortLine:colors.longLine,lineWidth:1,lineStyle:1,
          lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
          .setData([{time:entryTime,value:trade.entryPrice},{time:exitTime,value:trade.exitPrice}]);
      }
      if(Array.isArray(trade.stopSeries)&&trade.stopSeries.length>1){
        const firstStop=trade.stopSeries.find(p=>p?.value>0);
        if(firstStop&&entryTime&&exitTime){
          priceChart.addLineSeries({color:colors.stopLine,lineWidth:2,lineStyle:0,
            title:'',lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false})
            .setData([{time:entryTime,value:firstStop.value},{time:exitTime,value:firstStop.value}]);
        }
      }
      const out=[];
      if(entryTime) out.push({time:entryTime,position:isShort?'aboveBar':'belowBar',color:isShort?colors.purple:colors.green,shape:isShort?'arrowDown':'arrowUp',text:''});
      if(exitTime)  out.push({time:exitTime, position:isShort?'belowBar':'aboveBar',color:isShort?colors.coverLine:colors.exitLine,shape:isShort?'arrowUp':'arrowDown',text:''});
      return out;
    });
    if(markers.length){ markers.sort((a,b)=>a.time-b.time); candleSeries.setMarkers(markers); }
  }

  // ─── CROSSHAIR DATA HANDLER ─────────────────────────────────────────────────
  function attachCrosshairHandler(priceChart, d, times, { activeFilters, activeEntryRules, activeExitRules, chartTf, showExitInfo, backtestTrades, setCrossInfo }){
    const filterKey = (f) => f._id ?? [f.tf, f.ind, f.op, f.cmpType, f.params?.p, f.params?.ks, f.params?.dp, f.params?.sl, f.params?.sg, f.cmpInd, f.cmpParams?.p, f.cmpParams?.ks, f.cmpParams?.dp, f.cmpParams?.sl, f.cmpParams?.sg, f.cmpVal].join('|');
    const timeToIdx={}; times.forEach((t,i)=>{ timeToIdx[t]=i; });
    const tradeEvents={};
    if(Array.isArray(backtestTrades)){
      const timeSet=new Set(times);
      const findClosest=t=>{ if(t==null)return null; if(timeSet.has(t))return t; const n=times.find(x=>x>=t); return n??times[times.length-1]??null; };
      backtestTrades.forEach(trade=>{
        const isShort=(trade.dir||trade.direction||'').toLowerCase()==='short';
        const entryTime=findClosest(trade.entryTime), exitTime=findClosest(trade.exitTime);
        if(entryTime) tradeEvents[entryTime]={type:isShort?'SHORT':'Entrada',price:trade.entryPrice,detail:trade.entryReason||'',color:isShort?'var(--purple)':'var(--green)'};
        if(exitTime) tradeEvents[exitTime]={type:isShort?'Cover':'Salida',price:trade.exitPrice,detail:trade.reason||'',color:isShort?'var(--amber)':'var(--red)'};
      });
    }
    priceChart.subscribeCrosshairMove(param=>{
      try{
        if(!param.time||!param.point){ setCrossInfo(null); return; }
        const idx=timeToIdx[param.time]; if(idx==null){ setCrossInfo(null); return; }
        const ri=d.closes.length-1-idx;
        if(ri<1||ri>=d.closes.length-2){ setCrossInfo(null); return; }
        const C=d.closes[ri], H=d.highs[ri], L=d.lows[ri];
        const O=d.opens?d.opens[ri]:C;
        const miniD={ok:true,closes:d.closes.slice(ri),highs:d.highs.slice(ri),lows:d.lows.slice(ri),opens:d.opens?.slice(ri)||d.closes.slice(ri),volumes:d.volumes?.slice(ri)||[],price:C,prevClose:d.closes[ri+1]};
        const inds={};
        const filterValues={};
        (activeFilters||[]).filter(f=>f.tf===chartTf).forEach((f)=>{
          const key=f.ind+'('+(f.params?.p??'-')+')';
          const id=filterKey(f);
          const res=evalInd(f.ind,f.params,miniD)||[];
          const value=Array.isArray(res)?res[0]:null;
          inds[key]=value;

          let cmp=null;
          if(f.cmpType==='val') cmp=f.cmpVal;
          else if(f.cmpType==='prev') cmp=Array.isArray(res)?(res[1] ?? null):null;
          else if(f.cmpType==='ind'){
            const res2=evalInd(f.cmpInd,f.cmpParams,miniD)||[];
            cmp=Array.isArray(res2)?(res2[0] ?? null):null;
          }

          let pass=null;
          if(value!=null && cmp!=null){
            if(f.op==='>') pass=value>cmp;
            else if(f.op==='<') pass=value<cmp;
            else if(f.op==='>=') pass=value>=cmp;
            else if(f.op==='<=') pass=value<=cmp;
            else if(f.op==='x_up' || f.op==='x_dn'){
              const prev=Array.isArray(res)?res[1]:null;
              if(prev!=null){
                pass=f.op==='x_up' ? (prev<=cmp && value>cmp) : (prev>=cmp && value<cmp);
              }
            }
          }

          filterValues[id]={value,pass};
        });
        (activeEntryRules||[]).forEach(grp=>grp.conditions?.forEach(c=>{
          const k=c.ind+'('+(c.params?.p??'-')+')';
          if(!(k in inds)){ const res=evalInd(c.ind,c.params,miniD)||[]; inds[k]=Array.isArray(res)?res[0]:null; }
        }));
        if(showExitInfo&&activeExitRules) activeExitRules.forEach(grp=>grp.conditions?.forEach(c=>{
          const k=c.ind+'('+(c.params?.p??'-')+') exit';
          if(!(k in inds)){ const res=evalInd(c.ind,c.params,miniD)||[]; inds[k]=Array.isArray(res)?res[0]:null; }
        }));
        const entryPass=!!(activeEntryRules?.length&&evalRuleGroups(activeEntryRules,miniD));
        const exitPass=!!(showExitInfo&&activeExitRules?.length&&evalRuleGroups(activeExitRules,miniD));
        setCrossInfo({date:new Date(param.time*1000),O,H,L,C,inds,filterValues,entryPass,exitPass,tradeEvent:tradeEvents[param.time]||null,chg:d.closes[ri+1]?((C-d.closes[ri+1])/d.closes[ri+1]*100):null});
      }catch{ setCrossInfo(null); }
    });
  }

  // ─── OSCILLATOR CHART ───────────────────────────────────────────────────────
  function buildOscChart(container, priceChart, d, times, chartTf, { activeFilters, activeExitRules, showExitInfo, oscHeight=180 }){
    const tfFilters=(activeFilters||[]).filter(f=>f.tf===chartTf);
    const oscFilters=tfFilters.filter(f=>['RSI','STOCH','MACD','ATR'].includes(f.ind));
    if(!oscFilters.length||!container) return null;

    const colors = getChartColors();
    const oscChart=LightweightCharts.createChart(container,{
      width:container.clientWidth,height:oscHeight,
      ...makeChartTheme(colors),
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
    });

    oscFilters.forEach((f,fi)=>{
      let series=[];
      if(f.ind==='RSI')   series=cachedRSI(d,f.params.p);
      else if(f.ind==='STOCH') series=cachedSTOCH(d,f.params.p,f.params.ks||1);
      else if(f.ind==='MACD'){ const m=cachedMACD(d,f.params.p,f.params.sl||26,f.params.sg||9); series=m.hist||[]; }
      else if(f.ind==='ATR') series=cachedATR(d,f.params.p);
      if(!series.length) return;
      const offset=times.length-series.length;
      const lineData=series.map((v,i)=>({time:times[i+offset],value:v})).filter(p=>p.time);
      const color=colors.osc[fi%colors.osc.length];
      oscChart.addLineSeries({color,lineWidth:2,title:f.ind+'('+f.params.p+')'}).setData(lineData);
      if(f.cmpType==='val'&&lineData.length>1)
        oscChart.addLineSeries({color:colors.levelLine,lineWidth:1,lineStyle:2,title:'Nivel '+f.cmpVal,crosshairMarkerVisible:false}).setData(lineData.map(p=>({time:p.time,value:f.cmpVal})));
    });

    // Exit rule level lines
    if(showExitInfo&&activeExitRules){
      const drawnLevels=new Set();
      activeExitRules.forEach(grp=>{
        grp.conditions?.forEach(c=>{
          if(c.tf!==chartTf||!['RSI','STOCH','MACD'].includes(c.ind)||c.cmpType!=='val') return;
          const key=c.ind+':'+c.cmpVal; if(drawnLevels.has(key)) return; drawnLevels.add(key);
          let series=[];
          if(c.ind==='RSI')   series=cachedRSI(d,c.params.p);
          else if(c.ind==='STOCH') series=cachedSTOCH(d,c.params.p,c.params.ks||1);
          else if(c.ind==='MACD'){ const m=cachedMACD(d,c.params.p,c.params.sl||26,c.params.sg||9); series=m.hist||[]; }
          if(!series.length) return;
          const offset=times.length-series.length;
          const lineData=series.map((v,i)=>({time:times[i+offset],value:v})).filter(p=>p.time);
          if(lineData.length>1){
            oscChart.addLineSeries({color:colors.exitLevel,lineWidth:1,lineStyle:2,title:'Exit '+c.cmpVal,crosshairMarkerVisible:false}).setData(lineData.map(p=>({time:p.time,value:c.cmpVal})));
            if(!oscFilters.some(f=>f.ind===c.ind&&f.params.p===c.params.p))
              oscChart.addLineSeries({color:colors.exitLine,lineWidth:1,lineStyle:1,title:c.ind+'('+c.params.p+') exit'}).setData(lineData);
          }
        });
      });
    }

    // Sync time scales bidirectionally. During modal teardown LightweightCharts
    // can emit one last range update after one side is already disposed.
    const safeSetRange = (chart, range) => {
      if(!range) return;
      try{ chart.timeScale().setVisibleLogicalRange(range); }catch{}
    };
    priceChart.timeScale().subscribeVisibleLogicalRangeChange(range=>safeSetRange(oscChart, range));
    oscChart.timeScale().subscribeVisibleLogicalRangeChange(range=>safeSetRange(priceChart, range));
    oscChart.timeScale().fitContent();
    return oscChart;
  }

  // ─── PUBLIC API ─────────────────────────────────────────────────────────────
  // buildPriceChart - creates the price chart, overlays, stop line, markers, and crosshair handler.
  // Returns the LightweightCharts chart instance.
  function buildPriceChart(container, d, times, candles, opts){
    const colors = getChartColors();
    const priceChart=LightweightCharts.createChart(container,{
      width:container.clientWidth,height:opts.priceHeight??Math.max(350,container.clientHeight),
      ...makeChartTheme(colors),
      // Enable full pan + zoom behavior. LightweightCharts defaults are
      // permissive but we set them explicitly so the price chart behaves the
      // same way as the standalone charts in the backtest tab - user can
      // click-drag left/right to pan through history, pinch/wheel to zoom.
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
      timeScale: {
        ...(makeChartTheme(colors).timeScale || {}),
        rightOffset: 12,     // small gap at the right edge so candles aren't flush
        barSpacing: 8,
        shiftVisibleRangeOnNewBar: false,
        fixLeftEdge: false,  // allow scrolling past the oldest loaded candle
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: false,
      },
    });
    const candleSeries=priceChart.addCandlestickSeries({
      upColor:colors.upColor, downColor:colors.dnColor,
      borderUpColor:colors.upColor, borderDownColor:colors.dnColor,
      wickUpColor:colors.upColor, wickDownColor:colors.dnColor,
      priceLineColor:colors.mutedLine,
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.22 }});
    candleSeries.setData(candles);

    // Volume histogram occupying the bottom ~18% of the price pane. Uses its
    // own invisible price scale so it doesn't distort the candle axis.
    if(opts.showVolume !== false && Array.isArray(d.volumes) && d.volumes.length){
      const vols = [...d.volumes].reverse();
      const volData = times.map((t,i)=>{
        const v = vols[i];
        if(v == null) return null;
        const c = candles[i];
        const up = c && c.close >= c.open;
        return {
          time: t,
          value: v,
          color: up ? colors.volumeUp : colors.volumeDn,
        };
      }).filter(Boolean);
      const volSeries = priceChart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }});
      volSeries.setData(volData);
    }

    if(opts.showIndicators !== false) applyMaOverlays(priceChart, d, times, opts.activeFilters, opts.chartTf);
    if(opts.showStopLine) applyStopLine(priceChart, candles, opts.stopPrice, colors.stopLine);
    applyTradeMarkers(priceChart, candleSeries, candles, opts.backtestTrades);
    attachCrosshairHandler(priceChart, d, times, opts);
    priceChart.timeScale().fitContent();
    return priceChart;
  }

  window.StockScannerUI = Object.assign(window.StockScannerUI||{}, {
    ChartRenderer:{ buildPriceChart, buildOscChart, disposeChart, clearSeriesCache: ()=>_seriesCache.clear() }
  });
})();
