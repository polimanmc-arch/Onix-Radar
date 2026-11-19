const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');

test('memory cache is bounded, evicts the least recently used entry and sweeps expired ones',()=>{
  // Proceso aparte para fijar ONIX_MEMORY_CACHE_MAX sin afectar al resto de pruebas.
  const script=`
    const c=require(${JSON.stringify(path.join(root,'server/utils/cache'))});
    for(let i=0;i<50;i++) c.setCache('k'+i,i,60000);
    c.getCache('k0');                 // k0 pasa a ser la más reciente
    c.setCache('new',1,60000);        // expulsa la menos usada: k1
    const lru={size:c.cacheSize(),k0:c.getCache('k0'),k1:c.getCache('k1')};
    for(let i=0;i<300;i++) c.setCache('tmp'+i,i,-1); // caducadas: el barrido las elimina
    console.log(JSON.stringify({...lru,afterSweep:c.cacheSize(),max:c.MAX_ENTRIES}));`;
  const out=JSON.parse(spawnSync(process.execPath,['-e',script],{env:{...process.env,ONIX_MEMORY_CACHE_MAX:'50'},encoding:'utf8'}).stdout);
  assert.equal(out.max,50);
  assert.equal(out.size,50);
  assert.equal(out.k0,0);
  assert.equal(out.k1,null);
  assert.ok(out.afterSweep<=50,'never above the limit: '+out.afterSweep);
});
