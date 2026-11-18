// A no-op in the regular Node app. In Community Cloud, relay API calls through
// Streamlit's component protocol: the user's browser never needs a localhost API.
(function(){
  if(!window.parent || window.parent===window || !location.pathname.includes('/component/'))return;
  const originalFetch=window.fetch.bind(window);
  const parentUrl=new URLSearchParams(location.search).get('streamlitUrl');
  const parentOrigin=parentUrl?new URL(parentUrl).origin:location.origin;
  const pending=new Map();
  let queue=[],inFlight=null,timer=null,sequence=0,lastHeight=0;
  const session=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  const send=(type,extra={})=>window.parent.postMessage({isStreamlitMessage:true,type,...extra},parentOrigin);
  // Streamlit disables scrolling on its iframe. Give #root its own scroll area
  // so long panels stay reachable regardless of the host's overflow settings.
  const document=window.document;
  function viewportHeight(){
    try{return window.parent.innerHeight||window.innerHeight||800;}
    catch{return window.innerHeight||800;}
  }
  const resize=()=>{
    const viewport=viewportHeight();
    document?.documentElement.style.setProperty('--embed-viewport-height',viewport+'px');
    const height=Math.ceil(viewport);
    if(height!==lastHeight){lastHeight=height;send('streamlit:setFrameHeight',{height});}
  };
  if(document){
    const style=document.createElement('style');
    style.textContent=`html,body{height:100%!important;min-height:0!important;margin:0!important;overflow:hidden!important}
      #root{height:var(--embed-viewport-height)!important;min-height:0!important;margin:0!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior-y:contain;scrollbar-gutter:stable}
      .app-root.workspace-shell{min-height:var(--embed-viewport-height)!important}
      .workspace-main{padding-bottom:96px!important}
      .inspector-panel{position:static!important}
      .inspector-chart{height:clamp(240px,36vh,360px)!important;min-height:0!important}
      .workspace-rail{height:var(--embed-viewport-height)!important}
      @media(max-width:600px){.workspace-rail{height:auto!important}}`;
    document.head.appendChild(style);
    const observe=()=>{
      resize();
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});
    else observe();
    try{window.parent.addEventListener('resize',resize);}catch{}
  }
  function schedule(){if(!timer)timer=setTimeout(()=>{timer=null;flush();},25);}
  function flush(){
    if(inFlight)return;
    const requests=queue.filter(item=>pending.has(item.id)).slice(0,128);
    queue=queue.filter(item=>pending.has(item.id)&&!requests.some(r=>r.id===item.id));
    if(!requests.length)return;
    inFlight={batch_id:session+'-batch-'+(++sequence),requests};
    send('streamlit:setComponentValue',{value:inFlight,dataType:'json'});
  }
  window.fetch=function(input,options={}){
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.origin!==location.origin || !url.pathname.startsWith('/api/'))return originalFetch(input,options);
    const signal=options.signal||input?.signal;
    if(signal?.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
    return new Promise((resolve,reject)=>{
      const id=session+'-request-'+(++sequence);
      const abort=()=>{pending.delete(id);reject(new DOMException('Aborted','AbortError'));};
      pending.set(id,{resolve,reject,signal,abort});
      signal?.addEventListener('abort',abort,{once:true});
      queue.push({id,url:url.pathname+url.search,method:options.method||input?.method||'GET',body:options.body??null});
      schedule();
    });
  };
  window.addEventListener('message',event=>{
    if(event.source!==window.parent || event.origin!==parentOrigin || event.data?.type!=='streamlit:render')return;
    resize();
    const response=event.data.args?.response;
    if(!inFlight || response?.batch_id!==inFlight.batch_id)return;
    const requests=inFlight.requests;
    inFlight=null;
    const results=new Map((response.results||[]).map(item=>[item.id,item]));
    for(const item of requests){
      const waiter=pending.get(item.id);
      if(!waiter)continue;
      pending.delete(item.id);
      waiter.signal?.removeEventListener('abort',waiter.abort);
      const result=results.get(item.id);
      if(!result){waiter.reject(new Error('Streamlit no devolvió la respuesta.'));continue;}
      waiter.resolve(new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
    }
    schedule();
  });
  window.addEventListener('resize',resize);
  send('streamlit:componentReady',{apiVersion:1});
  resize();
})();
