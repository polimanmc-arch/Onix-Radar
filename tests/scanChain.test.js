const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const plain=v=>JSON.parse(JSON.stringify(v));
function load(){
  const ctx=vm.createContext({window:{},console});
  vm.runInContext(fs.readFileSync(path.join(root,'public/app/core/scanChain.js'),'utf8'),ctx);
  return ctx.window.StockScannerCore;
}
const rows=(passed,all)=>all.map(t=>({ticker:t,passed:passed.includes(t)}));
const f=v=>[{ind:'PRICE',tf:'1wk',op:'>',cmpType:'val',cmpVal:v,params:{}}];

test('chain steps: start, continue, restart on a different universe and reject duplicates',()=>{
  const c=load();
  const s1=c.scanSnapshot({id:1,filters:f(100),shortFilters:[],direction:'long',tickers:['A','B','C']});
  const one=c.appendChainStep(null,{snapshot:s1,results:rows(['A','B'],['A','B','C']),origin:{label:'Lista',universeIds:[],tText:'A, B, C'}});
  assert.deepEqual(plain(one.nextTickers),['A','B']);
  assert.deepEqual(plain(one.chain.origin.tickers),['A','B','C']);
  assert.throws(()=>c.appendChainStep(one.chain,{snapshot:s1,results:rows(['A'],['A','B'])}),/ya está/);
  const s2=c.scanSnapshot({id:2,filters:[],shortFilters:f(5),direction:'short',tickers:['B','A']});
  const two=c.appendChainStep(one.chain,{snapshot:s2,results:rows(['A'],['A','B']),origin:{label:'x'}});
  assert.equal(two.chain.steps.length,2);
  assert.equal(two.chain.steps[1].direction,'short');
  assert.equal(two.restarted,false);
  const s3=c.scanSnapshot({id:3,filters:f(1),shortFilters:[],direction:'long',tickers:['X','Y']});
  const fresh=c.appendChainStep(two.chain,{snapshot:s3,results:rows(['X'],['X','Y']),origin:{label:'Otro',universeIds:['DOW30'],tText:'X, Y'}});
  assert.equal(fresh.restarted,true);
  assert.equal(fresh.chain.steps.length,1);
  assert.equal(fresh.chain.origin.label,'Otro');
  assert.throws(()=>c.appendChainStep(null,{snapshot:s3,results:rows([],['X','Y'])}),/no tiene señales/);
});

test('rerun applies each step to the previous step output and stops when a step is empty',async()=>{
  const c=load();
  const chain={origin:{tickers:['A','B','C','D']},steps:[{scanId:1,direction:'long',filters:f(1),inputCount:4,passed:['A','B']},{scanId:2,direction:'long',filters:f(2),inputCount:2,passed:['A']}]};
  const calls=[];
  const scan=async({tickers,filters})=>{ calls.push([tickers,filters[0].cmpVal]); return filters[0].cmpVal===1?['B','C','D']:['D']; };
  const out=await c.rerunScanChain(chain,scan);
  assert.deepEqual(plain(calls),[[['A','B','C','D'],1],[['B','C','D'],2]]);
  assert.deepEqual(plain(out.nextTickers),['D']);
  assert.deepEqual(plain(out.chain.steps.map(s=>[s.inputCount,s.passed.length])),[[4,3],[3,1]]);
  const empty=await c.rerunScanChain(chain,async()=>[]);
  assert.equal(empty.stoppedEarly,true);
  assert.equal(empty.chain.steps.length,1);
  const cancelled=await c.rerunScanChain(chain,async()=>null);
  assert.equal(cancelled.cancelled,true);
});
