const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function load(){
  const ctx=vm.createContext({window:{},console,setTimeout,clearTimeout,AbortController,Date,Math});
  for(const f of ['config/timeframes.js','core/indicators.js','core/engine.js','core/portfolioWorkflow.js'])
    vm.runInContext(fs.readFileSync(path.join(root,'public/app',f),'utf8'),ctx);
  return ctx.window.StockScannerCore;
}
const near=(a,b,t=1e-9)=>Math.abs(a-b)<=t;
const covFrom=(sd,rho)=>sd.map((si,i)=>sd.map((sj,j)=>si*sj*(i===j?1:rho[i][j])));

test('HRP: two independent assets get inverse-variance weights',()=>{
  const {hrpWeights}=load();
  const {weights}=hrpWeights(covFrom([0.1,0.2],[[1,0],[0,1]]));
  assert.ok(near(weights[0],0.04/(0.01+0.04)) && near(weights[1],0.01/(0.01+0.04)));
});

test('HRP: an asset duplicated by another does not double its share',()=>{
  const {hrpWeights}=load();
  // A y B idénticos (correlación 1), C independiente, misma volatilidad: C recibe la mitad.
  const {weights,order}=hrpWeights(covFrom([0.2,0.2,0.2],[[1,1,0],[1,1,0],[0,0,1]]));
  assert.ok(near(weights[2],0.5)&&near(weights[0],0.25)&&near(weights[1],0.25),JSON.stringify(weights));
  assert.equal(Math.abs(order.indexOf(0)-order.indexOf(1)),1,'correlated assets end up adjacent');
});

test('HRP: two correlated blocks split the risk between blocks',()=>{
  const {hrpWeights}=load();
  const rho=[[1,.9,0,0],[.9,1,0,0],[0,0,1,.9],[0,0,.9,1]];
  const {weights}=hrpWeights(covFrom([0.2,0.2,0.2,0.2],rho));
  weights.forEach(w=>assert.ok(near(w,0.25,1e-9)));
  const w2=hrpWeights(covFrom([0.1,0.1,0.3,0.3],rho)).weights;
  assert.ok(near(w2.reduce((a,b)=>a+b,0),1));
  assert.ok(w2[0]>w2[2],'the calmer block receives more weight');
});

test('X-ray flags concentration and passes a diversified portfolio',()=>{
  const {portfolioXray}=load();
  const conc={allocations:[{ticker:'A',weight:.4,sector:'Tech'},{ticker:'B',weight:.3,sector:'Tech'},{ticker:'C',weight:.2,sector:'Energy'},{ticker:'D',weight:.05,sector:'Energy'}],
    correlationMatrix:[{ticker:'A',row:[1,.92,.1,.1]},{ticker:'B',row:[.92,1,.1,.1]},{ticker:'C',row:[.1,.1,1,.2]},{ticker:'D',row:[.1,.1,.2,1]}]};
  const c=Object.fromEntries(JSON.parse(JSON.stringify(portfolioXray(conc))).map(x=>[x.id,x]));
  for(const id of ['position','top3','sector','effective','corr']) assert.equal(c[id].level,'warn',id);
  assert.match(c.corr.detail,/A\/B 0\.92/);
  const tickers='ABCDEFGHIJ'.split('');
  const div={allocations:tickers.map((t,i)=>({ticker:t,weight:.1,sector:'S'+(i%5)})),correlationMatrix:tickers.map((t,i)=>({ticker:t,row:tickers.map((_,j)=>i===j?1:.3)}))};
  assert.ok(JSON.parse(JSON.stringify(portfolioXray(div))).every(x=>x.level==='ok'));
  const cash={allocations:[{ticker:'A',weight:.25,sector:'X'},{ticker:'B',weight:.25,sector:'Y'}],correlationMatrix:[]};
  assert.ok(portfolioXray(cash).some(x=>x.id==='cash'&&x.level==='info'));
});
