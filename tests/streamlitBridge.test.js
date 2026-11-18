const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('public/app/streamlitBridge.js','utf8');

test('Streamlit bridge batches fetch, preserves HTTP errors and handles cancellation',async()=>{
  const messages=[],listeners={},timers=[];
  const parent={innerHeight:900,postMessage(message){messages.push(message);}};
  const window={parent,fetch:()=>Promise.resolve('native'),addEventListener(type,fn){listeners[type]=fn;}};
  const location={pathname:'/component/onix/index.html',search:'',origin:'https://app.streamlit.app',href:'https://app.streamlit.app/component/onix/index.html'};
  vm.runInNewContext(source,{window,location,URL,URLSearchParams,Response,DOMException,Date,Math,setTimeout(fn){timers.push(fn);return timers.length;}});
  assert.equal(messages[0].type,'streamlit:componentReady');
  const first=window.fetch('/api/health');
  const second=window.fetch('/api/charts',{method:'POST',body:'{"symbols":[]}'});
  timers.shift()();
  const batch=messages.find(m=>m.type==='streamlit:setComponentValue').value;
  assert.equal(batch.requests.length,2);
  assert.equal(batch.requests[1].method,'POST');
  assert.equal(batch.requests[1].body,'{"symbols":[]}');
  listeners.message({source:parent,origin:location.origin,data:{type:'streamlit:render',args:{response:{batch_id:batch.batch_id,results:batch.requests.map((r,i)=>({id:r.id,status:i?400:200,body:i?'{}':'{"ok":true}'}))}}}});
  assert.deepEqual(await (await first).json(),{ok:true});
  assert.equal((await second).status,400);
  assert.equal(await window.fetch('https://other.example/file'),'native');
  const controller=new AbortController();
  const cancelled=window.fetch('/api/health',{signal:controller.signal});
  controller.abort();
  await assert.rejects(cancelled,{name:'AbortError'});
});

test('component height follows results, shrinks after navigation, and follows the screen',()=>{
  const messages=[],properties={},parentListeners={};
  let contentHeight=1400,observerCallback;
  const root={get scrollHeight(){return contentHeight;},getBoundingClientRect(){return {height:contentHeight};}};
  const document={readyState:'complete',documentElement:{style:{setProperty(name,value){properties[name]=value;}}},
    getElementById(){return root;},createElement(){return {};},head:{appendChild(){}}};
  const parent={innerHeight:900,postMessage(message){messages.push(message);},addEventListener(type,fn){parentListeners[type]=fn;}};
  const window={parent,document,fetch(){},addEventListener(){},ResizeObserver:class{constructor(fn){observerCallback=fn;}observe(target){assert.equal(target,root);}}};
  const location={pathname:'/component/onix/index.html',search:'',origin:'https://app.streamlit.app',href:'https://app.streamlit.app/component/onix/index.html'};
  vm.runInNewContext(source,{window,location,URL,URLSearchParams,Response,DOMException,Date,Math,setTimeout});
  const heights=()=>messages.filter(m=>m.type==='streamlit:setFrameHeight').map(m=>m.height);
  assert.deepEqual(heights(),[1400]);
  contentHeight=2100;observerCallback();
  contentHeight=400;observerCallback();
  parent.innerHeight=750;parentListeners.resize();
  assert.deepEqual(heights(),[1400,2100,900,750]);
  assert.equal(properties['--embed-viewport-height'],'750px');
});
