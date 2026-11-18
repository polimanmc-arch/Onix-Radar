// scannerTab.js - Unified "Scanner" tab that merges what used to be
// Universo + Filtros + Resultados into one view. Universo sits above Filtros
// (both stacked vertically) inside a collapsible config card that auto-closes
// when a scan completes. Results render below in the image-based layout.
window.StockScannerTabs = window.StockScannerTabs || {};
(function(){
const { useState, useEffect, useRef } = React;


const FILTER_CATEGORY_META = {
  "Precio y estructura": { icon:"PX", hint:"Precio, tendencia, rango y volatilidad base.", tint:"rgba(0,180,255,.12)", border:"rgba(0,180,255,.28)" },
  "Volumen y liquidez": { icon:"VOL", hint:"Actividad, participacion y liquidez operable.", tint:"rgba(34,197,94,.10)", border:"rgba(34,197,94,.24)" },
  "Calidad del movimiento": { icon:"MOM", hint:"Contexto del impulso y limpieza del movimiento.", tint:"rgba(245,158,11,.10)", border:"rgba(245,158,11,.24)" },
  "Otros": { icon:"GEN", hint:"Indicadores adicionales.", tint:"rgba(148,163,184,.10)", border:"rgba(148,163,184,.24)" },
};
const FILTER_CATEGORY_ORDER = ["Precio y estructura","Volumen y liquidez","Calidad del movimiento","Otros"];
const QUICK_FILTER_IDS = ["PRICE","CHG","GAP","ATR","RVOL","DOLLAR_VOL","AVG_VOL"];
const FILTER_CATEGORY_COLLAPSE_KEY = 'onix_scanner_filter_category_collapse_v1';
const SCANNER_CONFIG_OPEN_KEY = 'onix_scanner_config_open_v1';
function groupIndicators(items){
  const grouped = items.reduce((acc, item)=>{ const k=item.category||'Otros'; (acc[k]=acc[k]||[]).push(item); return acc; }, {});
  return FILTER_CATEGORY_ORDER.filter(k=>grouped[k]).map(k=>[k, grouped[k]]);
}
function getCategoryMeta(name){ return FILTER_CATEGORY_META[name] || FILTER_CATEGORY_META['Otros']; }
function getFilterCategory(indicators, filter){ return indicators.find(x=>x.id===filter.ind)?.category || 'Otros'; }
function getFilterId(filter){ return filter?.ind || filter?.id || filter?.key || null; }

function buildFilterFromIndicator(indicators, nid){
  const def = indicators.find(x=>x.id===nid);
  return {
    _id: 'f_' + Math.random().toString(36).slice(2,9),
    tf: 'D',
    ind: nid,
    params: { p:(def?.param)||14, ...(nid==='STOCH'?{ks:1,dp:3}:{}), ...(nid==='MACD'?{sl:26,sg:9}:{}) },
    op: def?.metaType==='text' ? '>' : '>',
    cmpType: def?.metaType==='text' ? 'val' : 'val',
    cmpVal: def?.metaType==='text' ? '' : 0,
    cmpInd: 'SMA',
    cmpParams: { p:20 },
    ignoreMissing: !!def?.supportsIgnoreMissing,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

// Human-readable rule summary shown under each filter column header.
function formatRule(f, indLbl){
  const opLabels = {'>':'>','<':'<','>=':'≥','<=':'≤','x_up':'↑ cruza','x_dn':'↓ cruza'};
  const opStr = opLabels[f.op] || f.op;
  if(f.cmpType === 'val')  return opStr + ' ' + f.cmpVal;
  if(f.cmpType === 'prev') return opStr + ' previo';
  if(f.cmpType === 'ind')  return opStr + ' ' + indLbl(f.cmpInd, f.cmpParams);
  return opStr;
}

// 3-month close-price sparkline. Accepts newest-first array of closes.
// Color: green if OLS slope >= 0 over the window, red otherwise.
const Sparkline = React.memo(function Sparkline({ closes, width=72, height=26 }){
  if(!closes || closes.length < 10){
    return <span style={{color:"var(--text-3)",fontSize:9}}>-</span>;
  }
  const slice = closes.slice(0, 63).filter(v => v != null).reverse(); // oldest → newest
  if(slice.length < 10) return <span style={{color:"var(--text-3)",fontSize:9}}>-</span>;
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const range = max - min || 1;
  const xStep = width / (slice.length - 1);
  const pts = slice.map((v,i)=>(i*xStep).toFixed(1)+","+(height-((v-min)/range)*height).toFixed(1)).join(" ");
  // Simple OLS slope - sign only, no need to normalize
  const meanX = (slice.length - 1) / 2;
  const meanY = slice.reduce((a,b)=>a+b,0) / slice.length;
  let num = 0, den = 0;
  slice.forEach((y,i)=>{ const dx=i-meanX; num += dx*(y-meanY); den += dx*dx; });
  const slope = den ? num/den : 0;
  const color = slope >= 0 ? "var(--green)" : "var(--red)";
  return (
    <svg width={width} height={height} viewBox={"0 0 "+width+" "+height} preserveAspectRatio="none" style={{display:"block"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
});

// Blue pass-dot shown next to a value when the rule is satisfied, and next
// to a ticker when every rule is satisfied.
function PassDot({ on, size=7 }){
  if(!on) return null;
  return <span style={{display:"inline-block",width:size,height:size,borderRadius:"50%",background:"var(--accent)",boxShadow:"0 0 6px rgba(0,180,255,.55)",marginLeft:6,verticalAlign:"middle"}}/>;
}

// ── Config sub-panels (Universo / Filtros) ─────────────────────────────────

function ScannerPresetBar(ctx){
  const {S,savedScanPresets,scanPresetName,setScanPresetName,selectedScanPresetId,setSelectedScanPresetId,
    saveScannerPreset,loadScannerPreset,deleteScannerPreset,exportScannerPresets,importScannerPresets} = ctx;
  return (
    <div style={{padding:"10px 14px",borderBottom:"1px solid var(--card-border)",background:"var(--panel-accent-bg)"}}>
      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:9,color:"var(--text-3)",fontWeight:800,textTransform:"uppercase",letterSpacing:.8,minWidth:92}}>Presets scanner</span>
        <input value={scanPresetName||""} onChange={e=>setScanPresetName(e.target.value)} placeholder="Nombre del preset" style={{...S.inp,width:170}}/>
        <button onClick={saveScannerPreset} style={{...S.btnG(true),fontSize:9,borderColor:"rgba(0,160,255,.4)",color:"var(--accent)"}}>
          {selectedScanPresetId ? "Actualizar" : "Guardar"}
        </button>
        <select value={selectedScanPresetId||""} onChange={e=>{
          const id=e.target.value;
          setSelectedScanPresetId(id);
          const item=(savedScanPresets||[]).find(x=>x.id===id);
          if(item) setScanPresetName(item.name||"");
        }} style={{...S.inp,width:190}}>
          <option value="">Seleccionar preset...</option>
          {(savedScanPresets||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={loadScannerPreset} style={{...S.btnG(false),fontSize:9}}>Cargar</button>
        <button onClick={deleteScannerPreset} style={{...S.btnG(false),fontSize:9,color:"var(--red)",borderColor:"rgba(220,50,50,.28)"}}>Eliminar</button>
        {selectedScanPresetId&&<button onClick={()=>{setSelectedScanPresetId("");setScanPresetName("");}} style={{...S.btnG(false),fontSize:9}}>Nuevo</button>}
        <button onClick={exportScannerPresets} style={{...S.btnG(false),fontSize:9,marginLeft:"auto"}}>Exportar JSON</button>
        <label style={{...S.btnG(false),fontSize:9,cursor:"pointer",display:"inline-flex",alignItems:"center"}}>
          Importar JSON
          <input type="file" accept="application/json,.json" onChange={e=>{importScannerPresets(e.target.files?.[0]); e.target.value='';}} style={{display:"none"}}/>
        </label>
        {(savedScanPresets||[]).length>0&&<span style={{fontSize:8,color:"var(--text-2)"}}>{savedScanPresets.length} guardados</span>}
      </div>
      <div style={{fontSize:8,color:"var(--text-3)",marginTop:5}}>
        Guarda universo, tickers propios, dirección, filtros long/short, concurrencia e historial mínimo.
      </div>
    </div>
  );
}

function UniverseSection(ctx){
  const {S,preset,universeIds,setUniverseIds,pickPreset,fetchingAll,tText,setTText,setPreset,tickers,tCount,conc,setConc,minHistoryYears,setMinHistoryYears,requestNotificationPermission,
    savedUniverseLists,setSavedUniverseLists,universeListName,setUniverseListName,selectedUniverseListId,setSelectedUniverseListId,notify} = ctx;
  const activeIds = Array.isArray(universeIds) ? universeIds : (preset ? [preset] : []);
  const chipStyle = (active) => ({
    ...S.btnG(active),
    display:"inline-flex",
    alignItems:"center",
    gap:6,
    padding:"5px 9px",
    borderColor: active ? "var(--accent)" : "var(--border)",
  });
  const saveUniverseList = () => {
    const name = (universeListName||'').trim();
    if(!name) return notify?.({type:'warning',title:'Mis listas',message:'Escribe un nombre para tu lista.'});
    if(!tickers.length) return notify?.({type:'warning',title:'Mis listas',message:'Agrega al menos un ticker para guardar la lista.'});
    const item = { id:selectedUniverseListId || String(Date.now()), name, tickers:[...new Set(tickers)] };
    setSavedUniverseLists(prev=>{
      const idx = prev.findIndex(x=>x.id===item.id);
      const next = [...prev];
      if(idx>=0) next[idx]=item; else next.unshift(item);
      return next.slice(0,40);
    });
    setSelectedUniverseListId(item.id);
    notify?.({type:'success',title:'Lista guardada',message:'Tu universo personalizado quedó guardado.'});
  };
  const deleteUniverseList = (id) => {
    setSavedUniverseLists(prev=>prev.filter(x=>x.id!==id));
    setUniverseIds(prev=>(prev||[]).filter(x=>x!=='LIST_'+id));
    if(selectedUniverseListId===id){ setSelectedUniverseListId(''); setUniverseListName(''); }
  };
  const loadListForEdit = (list) => {
    setSelectedUniverseListId(list.id);
    setUniverseListName(list.name);
    setTText((list.tickers||[]).join(', '));
    setPreset('CUSTOM');
  };
  const exportUniverseLists=()=>{
    const items=Array.isArray(savedUniverseLists)?savedUniverseLists:[];
    if(!items.length) return notify?.({type:'warning',title:'Mis listas',message:'No hay listas guardadas para exportar.'});
    const payload={type:'radar-onix-universe-lists',version:1,exportedAt:new Date().toISOString(),lists:items};
    const b=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(b);
    a.download='radar_onix_universe_lists_'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  const importUniverseLists=async(file)=>{
    if(!file) return;
    try{
      const txt=await file.text();
      const json=JSON.parse(txt);
      const incoming=Array.isArray(json) ? json : Array.isArray(json?.lists) ? json.lists : [];
      const clean=incoming.filter(l=>l&&Array.isArray(l.tickers)).map((l,i)=>({
        id:String(l.id||Date.now()+'_'+i),
        name:String(l.name||('Lista importada '+(i+1))).trim(),
        tickers:[...new Set((l.tickers||[]).map(t=>String(t||'').trim().toUpperCase()).filter(Boolean))],
      })).filter(l=>l.tickers.length);
      if(!clean.length) return notify?.({type:'warning',title:'Importar listas',message:'El archivo no contiene listas válidas.'});
      setSavedUniverseLists(prev=>{
        const map=new Map((Array.isArray(prev)?prev:[]).map(l=>[l.id,l]));
        clean.forEach(l=>map.set(l.id,l));
        return Array.from(map.values()).slice(0,40);
      });
      notify?.({type:'success',title:'Listas importadas',message:'Se importaron '+clean.length+' lista(s) de universo.'});
    }catch(e){
      notify?.({type:'error',title:'Error importando listas',message:e?.message||'Archivo invalido'});
    }
  };
  return (
    <div style={{padding:"9px 12px"}}>
      <div style={{...S.lbl,marginBottom:8}}>Universo</div>
      {((groups, presets)=> groups.map(g=>(
        <div key={g.id} style={{marginBottom:8}}>
          <div style={{fontSize:8,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>{g.label}</div>
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            {Object.entries(presets).filter(([,v])=>v.group===g.id&&!v.backtestOnly).map(([k,v])=>(
              <button key={k} onClick={()=>pickPreset(k)} style={chipStyle(activeIds.includes(k))}>
                <span style={{fontFamily:"var(--font-mono)",fontSize:9}}>{activeIds.includes(k) ? "x" : "+"}</span>{v.label}
              </button>
            ))}
            {g.id==="us" && (
              <button onClick={()=>pickPreset('ALL_US')} disabled={fetchingAll} style={{...chipStyle(activeIds.includes("ALL_US")),borderColor:fetchingAll?"var(--border-light)":"rgba(0,200,100,.4)",color:fetchingAll?"var(--text-2)":"var(--green)"}}>
                {fetchingAll?"Cargando...":"Todo US (Auto)"}
              </button>
            )}
          </div>
        </div>
      )))(window.StockScannerConfig.UNIVERSE_GROUPS||[{id:'us',label:'EE. UU.'}], window.StockScannerConfig.UNIVERSE_PRESETS||{})}
      <div style={{marginBottom:8}}>
        <div style={{fontSize:8,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:.8,marginBottom:4}}>Mis listas</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {(savedUniverseLists||[]).length===0 && <span style={{fontSize:9,color:"var(--text-2)"}}>Guarda una lista abajo para reutilizarla aqui.</span>}
          {(savedUniverseLists||[]).map(list=>(
            <span key={list.id} style={{display:"inline-flex",alignItems:"center",gap:4}}>
              <button onClick={()=>pickPreset('LIST_'+list.id)} style={chipStyle(activeIds.includes('LIST_'+list.id))}>
                <span style={{fontFamily:"var(--font-mono)",fontSize:9}}>{activeIds.includes('LIST_'+list.id) ? "x" : "+"}</span>{list.name}
              </button>
              <button onClick={()=>loadListForEdit(list)} title="Editar lista" style={{...S.btnG(false),padding:"5px 7px"}}>Editar</button>
              <button onClick={()=>deleteUniverseList(list.id)} title="Eliminar lista" style={{...S.btnG(false),padding:"5px 7px",color:"var(--red)",borderColor:"rgba(220,50,50,.28)"}}>Eliminar</button>
            </span>
          ))}
        </div>
      </div>
      <textarea rows={3} value={tText} onChange={e=>{setTText(e.target.value);setPreset("CUSTOM");setUniverseIds([]);}} placeholder="Tickers separados por coma..." spellCheck={false} style={{...S.inp,resize:"vertical",width:"100%",padding:8}}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:9,color:"var(--text-3)"}}>
        <span>{tCount} tickers</span><span>{activeIds.length} universos seleccionados - ~{Math.ceil(tCount/conc*0.3)}s</span>
      </div>
      <div style={{marginTop:8,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",padding:"8px 10px",border:"1px solid var(--panel-soft-border)",borderRadius:6,background:"var(--panel-accent-bg)"}}>
        <input value={universeListName} onChange={e=>setUniverseListName(e.target.value)} placeholder="Nombre de lista propia" style={{...S.inp,width:180}}/>
        <button onClick={saveUniverseList} style={{...S.btnG(true),borderColor:"rgba(0,160,255,.4)",color:"var(--accent)"}}>{selectedUniverseListId ? "Actualizar lista" : "Guardar lista"}</button>
        {selectedUniverseListId && <button onClick={()=>{setSelectedUniverseListId('');setUniverseListName('');}} style={S.btnG(false)}>Nueva lista</button>}
        <button onClick={exportUniverseLists} style={{...S.btnG(false),fontSize:9,marginLeft:"auto"}}>Exportar JSON</button>
        <label style={{...S.btnG(false),fontSize:9,cursor:"pointer",display:"inline-flex",alignItems:"center"}}>
          Importar JSON
          <input type="file" accept="application/json,.json" onChange={e=>{importUniverseLists(e.target.files?.[0]); e.target.value='';}} style={{display:"none"}}/>
        </label>
      </div>
      <div style={{marginTop:8,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:9,color:"var(--text-2)"}}>Concurrencia:</span>
          {[8,16,24,32].map(n=>(<button key={n} onClick={()=>setConc(n)} style={{...S.btnG(conc===n),padding:"2px 8px"}}>{n}</button>))}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",marginLeft:"auto"}}>
          <span style={{fontSize:9,color:"var(--text-2)"}}>Historial mínimo:</span>
          <select value={minHistoryYears} onChange={e=>setMinHistoryYears(+e.target.value)} style={{...S.inp,width:90}}>
            <option value={0}>Sin filtro</option><option value={1}>1 ano</option><option value={2}>2 anos</option><option value={3}>3 anos</option><option value={5}>5 anos</option>
          </select>
        </div>
        {typeof Notification!=="undefined"&&Notification.permission!=="granted"&&(
          <button onClick={()=>requestNotificationPermission()} style={{...S.btnG(false),fontSize:9,borderColor:"rgba(255,179,64,.35)",color:"var(--amber)"}}>🔔 Activar alertas</button>
        )}
        {typeof Notification!=="undefined"&&Notification.permission==="granted"&&(
          <span style={{fontSize:9,color:"var(--text-2)"}}>🔔 Alertas activas</span>
        )}
      </div>
    </div>
  );
}

function FilterSetBar(ctx){
  const {S,scanDirection,filters,shortFilters,savedFilterSets,setSavedFilterSets,saveFilterSetAction,loadFilterSetAction,deleteFilterSetAction,setScanDirection,setFilters,setShortFilters,filterSetName,setFilterSetName,selectedFilterSetId,setSelectedFilterSetId,notify} = ctx;
  const saveSet = () => {
    const r=saveFilterSetAction({name:filterSetName,direction:scanDirection,filters,shortFilters,savedFilterSets,setSavedFilterSets});
    if(!r.ok) notify?.({type:'warning',title:'Set de filtros',message:r.message});
    else { setFilterSetName(''); notify?.({type:'success',title:'Set guardado',message:'Tus filtros quedaron guardados.'}); }
  };
  const exportSets=()=>{
    const items=Array.isArray(savedFilterSets)?savedFilterSets:[];
    if(!items.length) return notify?.({type:'warning',title:'Sets de filtros',message:'No hay sets guardados para exportar.'});
    const payload={type:'radar-onix-scanner-filter-sets',version:1,exportedAt:new Date().toISOString(),sets:items};
    const b=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(b);
    a.download='radar_onix_scanner_filter_sets_'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  const importSets=async(file)=>{
    if(!file) return;
    try{
      const txt=await file.text();
      const json=JSON.parse(txt);
      const incoming=Array.isArray(json) ? json : Array.isArray(json?.sets) ? json.sets : [];
      const clean=incoming.filter(s=>s&&(Array.isArray(s.filters)||Array.isArray(s.shortFilters))).map((s,i)=>({
        id:String(s.id||Date.now()+'_'+i),
        name:String(s.name||('Set importado '+(i+1))).trim(),
        direction:s.direction||'long',
        filters:Array.isArray(s.filters)?s.filters:[],
        shortFilters:Array.isArray(s.shortFilters)?s.shortFilters:[],
        savedAt:s.savedAt||new Date().toISOString(),
      }));
      if(!clean.length) return notify?.({type:'warning',title:'Importar sets',message:'El archivo no contiene sets validos.'});
      setSavedFilterSets(prev=>{
        const map=new Map((Array.isArray(prev)?prev:[]).map(s=>[s.id,s]));
        clean.forEach(s=>map.set(s.id,s));
        return Array.from(map.values()).slice(0,40);
      });
      notify?.({type:'success',title:'Sets importados',message:'Se importaron '+clean.length+' set(s) de filtros.'});
    }catch(e){
      notify?.({type:'error',title:'Error importando sets',message:e?.message||'Archivo invalido'});
    }
  };
  return (
    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",padding:"8px 10px",background:"var(--panel-accent-bg)",border:"1px solid var(--panel-soft-border)",borderRadius:6,marginBottom:10}}>
      <span style={{fontSize:9,color:"var(--text-2)",fontWeight:600,minWidth:50}}>Sets guardados</span>
      <input value={filterSetName} onChange={e=>setFilterSetName(e.target.value)} placeholder="Nombre del set..." style={{...S.inp,width:160}}
        onKeyDown={e=>{if(e.key==='Enter') saveSet();}}/>
      <button onClick={saveSet} style={{...S.btnG(true),borderColor:"rgba(0,160,255,.4)",color:"var(--accent)"}}>Guardar</button>
      <div style={{width:1,height:22,background:"var(--bg-3)"}}/>
      <select value={selectedFilterSetId} onChange={e=>setSelectedFilterSetId(e.target.value)} style={{...S.inp,width:180}}>
        <option value="">Seleccionar set...</option>
        {(savedFilterSets||[]).map(s=><option key={s.id} value={s.id}>{s.name} ({s.direction})</option>)}
      </select>
      <button disabled={!selectedFilterSetId} onClick={()=>{const r=loadFilterSetAction(selectedFilterSetId,{savedFilterSets,setFilters,setShortFilters,setScanDirection});if(r.ok)setSelectedFilterSetId('');}} style={{...S.btnG(!!selectedFilterSetId),opacity:selectedFilterSetId?1:.4}}>Cargar</button>
      <button disabled={!selectedFilterSetId} onClick={()=>{deleteFilterSetAction(selectedFilterSetId,setSavedFilterSets);setSelectedFilterSetId('');}} style={{...S.btnG(false),opacity:selectedFilterSetId?1:.4,color:"var(--red)",borderColor:"rgba(220,50,50,.3)"}}>Eliminar</button>
      <button onClick={exportSets} style={{...S.btnG(false),fontSize:9,marginLeft:"auto"}}>Exportar JSON</button>
      <label style={{...S.btnG(false),fontSize:9,cursor:"pointer",display:"inline-flex",alignItems:"center"}}>
        Importar JSON
        <input type="file" accept="application/json,.json" onChange={e=>{importSets(e.target.files?.[0]); e.target.value='';}} style={{display:"none"}}/>
      </label>
      {(savedFilterSets||[]).length>0&&<span style={{fontSize:8,color:"var(--text-2)"}}>{savedFilterSets.length} guardados</span>}
    </div>
  );
}

function FilterRow(f, idx, side, ctx){
  const {S,tfColor,INDICATORS,TIMEFRAMES,upF,rmF} = ctx;
  const indDef=INDICATORS.find(x=>x.id===f.ind);
  const cmpIndDef=INDICATORS.find(x=>x.id===f.cmpInd);
  const isTextMeta = ['SECTOR','INDUSTRY','COUNTRY','EXCHANGE'].includes(f.ind);
  const supportsIgnoreMissing = !!indDef?.supportsIgnoreMissing && !isTextMeta;
  const visibleIndicators = (ctx.visibleIndicators || INDICATORS);
  const grouped = groupIndicators(visibleIndicators);
  const renderIndicatorOptions = ()=>grouped.map(([group, items])=>(<optgroup key={group} label={group}>{items.map(i=><option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>));
  const onIndicatorChange = (nid)=>{
    const def=INDICATORS.find(x=>x.id===nid);
    upF(f._id,{ind:nid,params:{p:(def?.param)||14,...(nid==='STOCH'?{ks:1,dp:3}:{}),...(nid==='MACD'?{sl:26,sg:9}:{})},cmpType:def?.metaType==='text'?'val':f.cmpType,cmpVal:def?.metaType==='text'?(f.cmpVal||''):(f.cmpVal||0),ignoreMissing:!!def?.supportsIgnoreMissing},side);
  };
  return (
    <div key={f._id} style={{display:"flex",flexWrap:"wrap",gap:5,alignItems:"center",padding:"8px 10px",background:"var(--panel-soft-bg)",border:"1px solid var(--panel-soft-border)",borderRadius:5,marginBottom:6}}>
      <span style={{color:"var(--text-3)",fontSize:8,fontWeight:700,minWidth:16}}>#{idx+1}</span>
      <select value={f.tf} onChange={e=>upF(f._id,{tf:e.target.value},side)} style={{...S.inp,width:90,fontWeight:600,color:tfColor[f.tf]||"var(--accent)",borderColor:tfColor[f.tf]||"var(--border-light)"}}>
        {TIMEFRAMES.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <select value={f.ind} onChange={e=>onIndicatorChange(e.target.value)} style={{...S.inp,maxWidth:190}}>
        {renderIndicatorOptions()}
      </select>
      {['STOCH','MACD'].includes(f.ind)&&<window.StockScannerUI.IndicatorParameters indicator={f.ind} params={f.params} onChange={params=>upF(f._id,{params},side)}/>}
      {indDef?.param!=null&&f.ind!=="STOCH"&&f.ind!=="MACD"&&(<input type="number" className="numeric-value-input" min={1} max={500} value={f.params.p} onChange={e=>upF(f._id,{params:{...f.params,p:+e.target.value||1}},side)} style={{...S.inp,width:56,textAlign:"center"}} title="Período"/>)}
      <select value={f.op} onChange={e=>upF(f._id,{op:e.target.value},side)} style={{...S.inp,width:isTextMeta?78:60}}>
        {isTextMeta ? <><option value=">">Es</option><option value="<">No es</option></> : <><option value=">">{">"}</option><option value="<">{"<"}</option><option value=">=">≥</option><option value="<=">≤</option><option value="x_up">Cruza↑</option><option value="x_dn">Cruza↓</option></>}
      </select>
      {!isTextMeta && <select value={f.cmpType} onChange={e=>upF(f._id,{cmpType:e.target.value},side)} style={{...S.inp,maxWidth:125}}>
        <option value="val">Valor numérico</option><option value="prev">Valor anterior</option><option value="ind">Otro indicador</option>
      </select>}
      {(isTextMeta || f.cmpType==="val")&&<input type={isTextMeta?"text":"number"} step="any" value={f.cmpVal} onChange={e=>upF(f._id,{cmpVal:isTextMeta?e.target.value:(+e.target.value||0)},side)} style={{...S.inp,width:isTextMeta?130:70,textAlign:"center"}} placeholder={isTextMeta?"Texto exacto":"Valor"}/>}
      {!isTextMeta && f.cmpType==="ind"&&(
        <React.Fragment>
          <select value={f.cmpInd} onChange={e=>{const def=INDICATORS.find(x=>x.id===e.target.value);upF(f._id,{cmpInd:e.target.value,cmpParams:{p:(def?.param)||14}},side)}} style={{...S.inp,maxWidth:145}}>
            {renderIndicatorOptions()}
          </select>
          {cmpIndDef?.param!=null&&(<input type="number" className="numeric-value-input" min={1} max={500} value={f.cmpParams.p} onChange={e=>upF(f._id,{cmpParams:{...f.cmpParams,p:+e.target.value||1}},side)} style={{...S.inp,width:45,textAlign:"center"}}/>)}
        </React.Fragment>
      )}
      {!isTextMeta && f.cmpType==="prev"&&<span style={{fontSize:8,color:"var(--text-2)",fontStyle:"italic"}}>{(TIMEFRAMES.find(x=>x.id===f.tf))?.unit||"período"} previo</span>}
      {supportsIgnoreMissing && <label style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:8,color:'var(--text-2)'}}>
        <input type="checkbox" checked={!!f.ignoreMissing} onChange={e=>upF(f._id,{ignoreMissing:e.target.checked},side)} />
        Ignorar faltantes
      </label>}
      <button onClick={()=>rmF(f._id,side)} style={{marginLeft:"auto",background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:15,padding:"1px 5px"}}>×</button>
    </div>
  );
}

function FilterGroup({ side, filterSet, setFilterSet, title, borderColor, bgColor, accentColor, ctx }){
  const {S,newFilter,INDICATORS} = ctx;
  const visibleIndicators = (INDICATORS||[]);
  const groupedFilters = FILTER_CATEGORY_ORDER.map(cat=>[cat, filterSet.filter(f=>getFilterCategory(INDICATORS, f)===cat)]).filter(([,items])=>items.length);
  const quickIndicators = QUICK_FILTER_IDS.map(id=>visibleIndicators.find(x=>x.id===id) || INDICATORS.find(x=>x.id===id)).filter(Boolean);
  const storageKey = FILTER_CATEGORY_COLLAPSE_KEY + '_' + side;
  const [collapsedCats, setCollapsedCats] = useState(()=>{
    try{
      const raw = localStorage.getItem(storageKey);
      const parsed = JSON.parse(raw||'{}');
      return parsed && typeof parsed==='object' ? parsed : {};
    }catch{ return {}; }
  });
  useEffect(()=>{
    try{ localStorage.setItem(storageKey, JSON.stringify(collapsedCats||{})); }catch{}
  }, [storageKey, collapsedCats]);
  const addIndicator = (nid)=>setFilterSet(f=>[...f, buildFilterFromIndicator(INDICATORS, nid)]);
  const toggleCat = (cat)=>setCollapsedCats(prev=>({ ...prev, [cat]: !prev[cat] }));
  const setAllCats = (collapsed)=>setCollapsedCats(prev=>({ ...prev, ...Object.fromEntries(groupedFilters.map(([cat])=>[cat, collapsed])) }));
  return (
    <div key={side} style={{border:"1px solid "+borderColor,borderRadius:10,padding:10,background:bgColor}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,gap:10,flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:accentColor}}>{title} <span style={{color:"var(--text-2)",fontWeight:400}}>({filterSet.length})</span></div>
          <div style={{fontSize:9,color:"var(--text-2)",marginTop:3,maxWidth:460}}>Organiza tus reglas por bloques: precio, volumen y calidad del movimiento.</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <button onClick={()=>setFilterSet(f=>[...f,newFilter()])} style={{...S.btn,background:"var(--bg-3)",border:"1px solid "+borderColor,color:accentColor}}>+ Filtro personalizado</button>
        </div>
      </div>

      {!!groupedFilters.length&&(
        <div style={{display:"flex",justifyContent:"flex-end",gap:6,flexWrap:"wrap",marginBottom:10}}>
          <button onClick={()=>setAllCats(false)} style={{...S.btnG(false),padding:"3px 8px",fontSize:8}}>Expandir todo</button>
          <button onClick={()=>setAllCats(true)} style={{...S.btnG(false),padding:"3px 8px",fontSize:8}}>Colapsar todo</button>
        </div>
      )}

      {groupedFilters.map(([cat, items])=>{
        const meta = getCategoryMeta(cat);
        const collapsed = !!collapsedCats[cat];
        return (
          <div key={cat} style={{marginBottom:10,border:"1px solid "+meta.border,borderRadius:8,overflow:"hidden"}}>
            <button onClick={()=>toggleCat(cat)} style={{display:"flex",width:"100%",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",background:meta.tint,border:"none",borderBottom:collapsed?"none":"1px solid "+meta.border,cursor:"pointer",textAlign:"left"}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:"var(--text-1)"}}>{collapsed?"+":"-"} <span style={{fontFamily:"var(--font-mono)",color:"var(--accent)"}}>{meta.icon}</span> {cat}</div>
                <div style={{fontSize:8,color:"var(--text-2)",marginTop:2}}>{meta.hint}</div>
              </div>
              <span style={{fontSize:9,color:"var(--text-1)",fontWeight:700}}>{items.length}</span>
            </button>
            {!collapsed&&(
              <div style={{padding:8}}>
                {items.map((f,idx)=>FilterRow(f, filterSet.indexOf(f), side, ctx))}
              </div>
            )}
          </div>
        );
      })}
      {filterSet.length===0&&<div style={{padding:24,textAlign:"center",color:"var(--text-2)",fontSize:10}}>Sin filtros. Crea un filtro personalizado para empezar.</div>}
    </div>
  );
}

function FiltersSection(ctx){
  const {S,DIR_OPTIONS,scanDirection,setScanDirection,filters,setFilters,shortFilters,setShortFilters,INDICATORS} = ctx;
  const activeFilters = scanDirection==="short" ? shortFilters : filters;
  return (
    <div style={{padding:"9px 12px",borderTop:"1px solid var(--card-border)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={S.lbl}>Filtros</div>
          <div style={{fontSize:9,color:"var(--text-2)"}}>Organiza reglas técnicas, de volumen y de calidad del movimiento sin mezclar todo en una sola lista.</div>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
          {DIR_OPTIONS.map(opt=>(<button key={opt.id} onClick={()=>setScanDirection(opt.id)} style={{...S.btnG(scanDirection===opt.id),padding:"5px 10px",borderColor:scanDirection===opt.id?(opt.id==="short"?"var(--purple)":"var(--accent)"):"var(--border)",color:scanDirection===opt.id?(opt.id==="short"?"var(--purple)":"var(--accent)"):"var(--text-2)"}}>{opt.label}</button>))}
        </div>
      </div>
      {FilterSetBar(ctx)}
      {scanDirection==="short"
        ? <FilterGroup side="short" filterSet={shortFilters} setFilterSet={setShortFilters} title="🟣 Filtros Short" borderColor="rgba(168,85,247,.22)" bgColor="rgba(168,85,247,.04)" accentColor="var(--purple)" ctx={ctx} />
        : <FilterGroup side="long" filterSet={filters} setFilterSet={setFilters} title="🟢 Filtros Long" borderColor="rgba(0,200,100,.22)" bgColor="rgba(0,200,100,.04)" accentColor="var(--green)" ctx={ctx} />}
    </div>
  );
}

// ── Scan action bar ────────────────────────────────────────────────────────
// Rendered in its own card below the config block so it stays visible even
// when the config is collapsed. No borderTop here - the card provides border.
function ScanBar(ctx){
  const {S,tCount,serverOk,scanDirection,filters,shortFilters,scanning,runScan,stopScan,prog} = ctx;
  const activeFilters = scanDirection==="short" ? shortFilters : filters;
  const disabled = !tCount || !serverOk || !activeFilters.length;
  const pct = prog?.total ? (prog.done/Math.max(1,prog.total)*100) : 0;
  return (
    <div style={{...S.toolbar,padding:"9px 12px"}}>
      {!scanning
        ? <button onClick={runScan} disabled={disabled} style={{...S.primaryBtn,opacity:disabled?.35:1}}>Escanear {tCount}</button>
        : <button onClick={stopScan} style={{...S.dangerBtn,minHeight:"var(--control-h)",padding:"6px 18px",fontSize:11,background:"var(--red)",color:"#fff",borderColor:"var(--red)"}}>Detener</button>
      }
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        <span style={S.statusBadge(scanDirection==="short"?"neutral":"info")}>{scanDirection==="short"?"Short":"Long"}</span>
        <span style={S.statusBadge(activeFilters.length?"success":"warning")}>{activeFilters.length} filtros</span>
        {!serverOk&&<span style={S.statusBadge("danger")}>Servidor offline</span>}
        {!tCount&&<span style={S.statusBadge("warning")}>Sin tickers</span>}
      </div>
      {scanning && (
        <div style={{flex:1,minWidth:160}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:10,marginBottom:4}}>
            <span style={S.sectionMeta}>{prog.tick}</span>
            <span style={S.sectionMeta}>{prog.done}/{prog.total} ({pct.toFixed(0)}%)</span>
          </div>
          <div style={S.progressBar}>
            <span style={{...S.progressFill(pct),transition:"width .18s ease"}}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Results panel (image-styled) ───────────────────────────────────────────

// Top bar: counter · search · "Solo señales válidas" toggle · CSV export
function ResultsHeader(ctx, shownCount, totalCount){
  const {S,onlyPass,setOnlyPass,search,setSearch,exportCSV} = ctx;
  return (
    <div className="scanner-results-header">
      <span style={S.sectionTitle}>
        Resultados <span style={{color:"var(--text-0)",fontWeight:700}}>{shownCount}</span> <span style={{color:"var(--text-2)"}}>de {totalCount} símbolos</span>
      </span>
      <div style={{flex:1,display:"flex",justifyContent:"center",minWidth:180}}>
        <div style={{position:"relative",maxWidth:320,width:"100%"}}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"var(--text-2)",pointerEvents:"none"}}><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
          <input type="text" aria-label="Buscar ticker o nombre" placeholder="Buscar ticker o nombre" value={search} onChange={e=>setSearch(e.target.value)}
            style={{...S.inp,width:"100%",padding:"7px 12px 7px 28px",background:"var(--bg-2)",fontSize:11}}/>
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <button type="button" className="ui-switch" onClick={()=>setOnlyPass(!onlyPass)}
          role="switch" aria-label="Solo señales válidas" aria-checked={onlyPass}>
          <span className="ui-switch-thumb"/>
        </button>
        <span style={{fontSize:10,color:onlyPass?"var(--accent)":"var(--text-2)",fontWeight:600}}>Solo señales válidas</span>
      </div>
      <button onClick={exportCSV} style={{...S.ghostBtn,padding:"5px 10px"}}>CSV</button>
    </div>
  );
}

function ResultsTable(ctx, selectedTicker, onSelect){
  const {S,tfColor,filters,shortFilters,scanDirection,shown,visRows,setVisRows,setSelectedChart,fmt,sortK,sortD,doSort,indLbl,scanning,onlyPass} = ctx;
  const activeFilters = scanDirection === 'short' ? shortFilters : filters;
  // Columns: TICKER, PRECIO, [one per filter], CHART
  const totalCols = 3 + activeFilters.length;

  const thBase = {...S.th,padding:"8px 10px",userSelect:"none",fontSize:9};
  const tdBase = {...S.td,padding:"7px 10px",fontSize:11,fontFamily:"var(--font-body)"};

  return (
    <div style={{...S.tableWrap,maxHeight:"60vh",border:"none",borderRadius:0}}>
      <table className="ui-table" style={S.table}>
        <thead>
          <tr>
            <th onClick={()=>doSort("ticker")} style={{...thBase,textAlign:"left",cursor:"pointer",color:sortK==="ticker"?"var(--accent)":"var(--text-2)"}}>
              Ticker {sortK==="ticker"?(sortD>0?"asc":"desc"):""}
            </th>
            <th onClick={()=>doSort("price")} style={{...thBase,textAlign:"right",cursor:"pointer",color:sortK==="price"?"var(--accent)":"var(--text-2)"}}>
              Precio {sortK==="price"?(sortD>0?"asc":"desc"):""}
            </th>
            {activeFilters.map((f,i)=>(
              <th key={f._id} onClick={()=>doSort("f"+i)}
                style={{...thBase,textAlign:"center",cursor:"pointer",borderLeft:"1px solid var(--panel-soft-border)",color:sortK==="f"+i?"var(--accent)":(tfColor[f.tf]||"var(--text-2)")}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:.3,textTransform:"none"}}>
                  {indLbl(f.ind,f.params)}
                  {sortK==="f"+i?(sortD>0?" asc":" desc"):""}
                </div>
                <div style={{fontSize:8,color:"var(--text-2)",marginTop:2,textTransform:"none",fontWeight:400,letterSpacing:0}}>
                  [{f.tf}] {formatRule(f,indLbl)}
                </div>
              </th>
            ))}
            <th style={{...thBase,textAlign:"center",borderLeft:"1px solid var(--panel-soft-border)",color:"var(--text-2)"}}>Grafico</th>
          </tr>
        </thead>
        <tbody>
          {shown.length===0 && (
            <tr><td colSpan={totalCols} style={{padding:18,border:"none"}}>
              <div style={S.emptyState}>
                {scanning ? "Escaneando..." : onlyPass ? "Ninguna acción cumple todos los filtros" : "Sin resultados"}
              </div>
            </td></tr>
          )}
          {shown.slice(0,visRows).map(r=>{
            const activeFRes = scanDirection === 'short' ? (r.shortFRes||[]) : (r.fRes||[]);
            const allPass = !r.err && r.passed;
            return (
              <tr key={r.ticker} style={{cursor:"pointer"}}
                tabIndex={0} aria-selected={selectedTicker===r.ticker}
                onClick={()=>!r.err && onSelect(r.ticker)}
                onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!r.err)onSelect(r.ticker);}}}
                onDoubleClick={()=>!r.err && setSelectedChart({ticker:r.ticker,side:scanDirection==="short"?"short":"long",source:"Resultados"})}>
                <td style={{...tdBase,fontWeight:700,color:"var(--accent)"}} title={r.name||""}>
                  {r.ticker}
                  <PassDot on={allPass}/>
                </td>
                <td style={{...tdBase,textAlign:"right",fontWeight:500,color:"var(--text-0)"}}>
                  {r.price!=null?"$"+fmt(r.price):"-"}
                </td>
                {activeFilters.map((f,i)=>{
                  const fr=activeFRes[i];
                  const valFmt = fr?.val!=null ? fmt(fr.val, Math.abs(fr.val)>999?0:2) : "-";
                  return (
                    <td key={f._id} style={{...tdBase,textAlign:"center",borderLeft:"1px solid var(--panel-soft-border)"}}>
                      {r.err ? (
                        <span style={{color:"var(--amber)"}}>-</span>
                      ) : (
                        <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",color:fr?.pass?"var(--text-0)":"var(--text-2)",fontWeight:fr?.pass?600:400}}>
                          {valFmt}
                          <PassDot on={!!fr?.pass} size={6}/>
                        </span>
                      )}
                    </td>
                  );
                })}
                <td
                  title="Abrir grafico"
                  style={{...tdBase,textAlign:"center",borderLeft:"1px solid var(--panel-soft-border)",padding:"6px 10px"}}
                >
                  <div style={{display:"flex",justifyContent:"center"}}>
                    <Sparkline closes={r.spark}/>
                  </div>
                </td>
              </tr>
            );
          })}
          {shown.length>visRows && (
            <tr><td colSpan={totalCols} style={{textAlign:"center",padding:10,border:"none"}}>
              <button onClick={()=>setVisRows(v=>v+100)} style={S.ghostBtn}>
                Mostrar mas ({shown.length-visRows} restantes)
              </button>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Scanner tab root component ─────────────────────────────────────────────
// Local state holds the collapse/expand of the config block.
// ── Telegram: envío manual y exportación como alerta programada ─────────────
function buildAlertFromScanner(ctx){
  const presets=window.StockScannerConfig.UNIVERSE_PRESETS||{};
  const filters=(ctx.scanDirection==='short'?ctx.shortFilters:ctx.filters)||[];
  const clean=filters.map(({_id,...f})=>JSON.parse(JSON.stringify(f)));
  const ids=(ctx.universeIds||[]).filter(id=>presets[id]&&!presets[id].backtestOnly);
  const fromIds=new Set(ids.flatMap(id=>presets[id].tickers||[]));
  const current=new Set(ctx.tickers||[]);
  const sameUniverse=ids.length>0&&fromIds.size===current.size&&[...current].every(t=>fromIds.has(t));
  const label=sameUniverse?ids.map(id=>presets[id].label||id).join(' + '):'Lista propia';
  const slug=(label+'-'+(ctx.scanDirection||'long')).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const alert={id:slug,name:`${label} · ${ctx.scanDirection==='short'?'short':'long'}`,enabled:true,
    ...(sameUniverse?{universe:ids.length===1?ids[0]:ids}:{tickers:[...current]}),
    direction:ctx.scanDirection==='short'?'short':'long',notifyEmpty:false,filters:clean};
  return {alert,label};
}

function TelegramActions({ ctx }){
  const {S,results,passN}=ctx;
  const [configured,setConfigured]=useState(null);
  const [status,setStatus]=useState(null);
  const [sending,setSending]=useState(false);
  const [showAlert,setShowAlert]=useState(false);
  useEffect(()=>{
    let alive=true;
    fetch('/api/telegram/status').then(r=>r.json()).then(j=>{ if(alive) setConfigured(!!j?.configured); }).catch(()=>{ if(alive) setConfigured(false); });
    return ()=>{ alive=false; };
  },[]);
  const {alert,label}=React.useMemo(()=>buildAlertFromScanner(ctx),[ctx.filters,ctx.shortFilters,ctx.scanDirection,ctx.universeIds,ctx.tickers]);
  const alertJson=JSON.stringify(alert,null,2);
  const send=async()=>{
    setSending(true); setStatus(null);
    const rows=results.filter(r=>r.passed&&!r.err).map(r=>({ticker:r.ticker,price:r.price,chg:r.chg}));
    try{
      const res=await fetch('/api/telegram/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        title:'Radar Onix · Scanner',
        subtitle:`${new Date().toISOString().slice(0,10)} · ${rows.length} señales · ${label}`,
        direction:alert.direction,filters:alert.filters,rows,
      })});
      const json=await res.json().catch(()=>({}));
      setStatus(res.ok&&json.ok?{tone:'ok',text:'Enviado a Telegram.'}:{tone:'warn',text:json.error||('Error '+res.status)});
    }catch(e){ setStatus({tone:'warn',text:e?.message||'No se pudo enviar.'}); }
    finally{ setSending(false); }
  };
  const copy=async()=>{
    try{ await navigator.clipboard.writeText(alertJson); setStatus({tone:'ok',text:'Alerta copiada. Pégala en alerts/alerts.json dentro de "alerts".'}); }
    catch{ setShowAlert(true); setStatus({tone:'warn',text:'No se pudo copiar automáticamente: selecciona el texto.'}); }
  };
  return (
    <div className="telegram-actions" aria-label="Telegram" style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',margin:'0 0 10px'}}>
      <button type="button" style={S.ghostBtn} onClick={send} disabled={!configured||!passN||sending} aria-busy={sending}
        title={configured===false?'Configura TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en los secretos de Streamlit':''}>
        {sending?'Enviando…':`Enviar ${passN} señales a Telegram`}
      </button>
      <button type="button" style={S.ghostBtn} aria-expanded={showAlert} onClick={()=>setShowAlert(v=>!v)}>Alerta diaria…</button>
      {configured===false&&<span style={{fontSize:10,color:'var(--text-3)'}}>Telegram sin configurar en el servidor.</span>}
      {status&&<span role="status" style={{fontSize:11,color:status.tone==='ok'?'var(--green)':'var(--amber)'}}>{status.text}</span>}
      {showAlert&&<div style={{...S.panel,padding:12,width:'100%'}}>
        <div style={{fontSize:11,color:'var(--text-2)',lineHeight:1.6,marginBottom:8}}>
          Para recibir estos filtros cada día laborable tras el cierre (sólo señales nuevas), añade este bloque a la lista
          <code> "alerts" </code>de <code>alerts/alerts.json</code> y súbelo a GitHub. La alerta usa el universo y los filtros actuales del scanner.
        </div>
        <textarea readOnly aria-label="Definición de la alerta" value={alertJson} rows={Math.min(18,alertJson.split('\n').length)}
          onFocus={e=>e.target.select()} style={{...S.inp,width:'100%',fontFamily:'var(--font-mono)',fontSize:10,resize:'vertical'}}/>
        <div style={{marginTop:6}}><button type="button" style={S.ghostBtn} onClick={copy}>Copiar</button></div>
      </div>}
    </div>
  );
}

function ScannerTab({ ctx }){
  const {S,results,scanning,logLines,passN,buildPortfolio,pfBuilding,shown,errN,dataCacheRef} = ctx;
  const [configOpen, setConfigOpen] = useState(()=>{
    try{
      const raw = localStorage.getItem(SCANNER_CONFIG_OPEN_KEY);
      return raw == null ? false : raw === 'true';
    }catch{ return false; }
  });
  const autoCollapsed = useRef(false);

  useEffect(()=>{
    try{ localStorage.setItem(SCANNER_CONFIG_OPEN_KEY, configOpen ? 'true' : 'false'); }catch{}
  }, [configOpen]);

  // Auto-collapse once per scan cycle: when a scan ends with at least one
  // result, close the config once. Starting a new scan resets the guard so
  // the next completion will collapse again. We do NOT force-open on scan
  // start - the user stays in control of visibility.
  useEffect(()=>{
    if(scanning){
      autoCollapsed.current = false;
      return;
    }
    if(results.length>0 && !autoCollapsed.current){
      setConfigOpen(false);
      autoCollapsed.current = true;
    }
  }, [scanning, results.length]);

  const [selectedTicker,setSelectedTicker] = useState(null);
  const [logOpen,setLogOpen] = useState(false);
  const hasResults = results.length > 0;
  const row = React.useMemo(()=>shown.find(r=>r.ticker===selectedTicker&&!r.err)||shown.find(r=>!r.err)||null,[shown,selectedTicker]);

  return (
    <div>
      <div className="workspace-toolbar">
        <div><h1>Scanner</h1><p>Encuentra señales. Selecciona un símbolo para analizarlo.</p></div>
        <div className="workspace-actions">
          <button type="button" style={S.ghostBtn} aria-expanded={configOpen} aria-controls="scanner-config" onClick={()=>setConfigOpen(v=>!v)}>Universo y filtros</button>
        </div>
      </div>
      {configOpen&&<div id="scanner-config" className="scan-config" style={S.panel}>
        <div className="config-content">{UniverseSection(ctx)}{FiltersSection(ctx)}</div>
        <details className="workspace-fold" style={{margin:10}}><summary>Presets e importación</summary>{ScannerPresetBar(ctx)}</details>
      </div>}
      <div style={{...S.panel,marginBottom:10}}>{ScanBar(ctx)}</div>
      {hasResults&&<div className="workspace-summary" aria-label="Resumen del escaneo">
        {[[results.length,'escaneadas','var(--text-1)'],[passN,'señales','var(--green)'],[results.length-passN-errN,'sin señal','var(--text-2)'],[errN,'errores','var(--amber)']].map(([n,label,color])=><span key={label}><strong style={{color}}>{n}</strong>{label}</span>)}
      </div>}
      {hasResults&&!scanning&&<TelegramActions ctx={ctx}/>}
      {passN>=2&&<div className="portfolio-cta">
        <div><strong>{passN} señales para tu portafolio</strong><span>Construye una distribución a partir de las acciones que pasan tus filtros.</span></div>
        <button type="button" className="portfolio-cta-button" onClick={buildPortfolio} disabled={pfBuilding||scanning} aria-busy={pfBuilding}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v9h9A9 9 0 1 1 12 3ZM15 3a9 9 0 0 1 6 6h-6Z"/></svg>
          {pfBuilding?'Optimizando…':'Crear portafolio'}<span aria-hidden="true">→</span>
        </button>
      </div>}
      <div className="scanner-workspace">
        <section className="scanner-results" aria-label="Resultados del scanner">
          {ResultsHeader(ctx,shown.length,results.length)}
          {ResultsTable(ctx,row?.ticker,setSelectedTicker)}
        </section>
        <ScannerInspector row={row} dataCacheRef={dataCacheRef} onOpen={ctx.setSelectedChart} side={ctx.scanDirection} filters={ctx.scanDirection==='short'?ctx.shortFilters:ctx.filters}/>
      </div>
      {hasResults&&!scanning&&<SignalPerformancePanel ctx={ctx} selectedTicker={row?.ticker}/>}
      {logLines.length>0&&<div className="workspace-log">
        <button type="button" style={S.ghostBtn} aria-expanded={logOpen} onClick={()=>setLogOpen(v=>!v)}>Actividad {logOpen?'−':'+'}</button>
        {logOpen&&<div style={{...S.panel,marginTop:6,padding:12,maxHeight:160,overflow:'auto'}}>{logLines.map((line,i)=><div key={i} style={{fontSize:10,lineHeight:1.7,color:'var(--text-2)',fontFamily:'var(--font-mono)'}}>{line}</div>)}</div>}
      </div>}
    </div>
  );
}

// ── Rendimiento histórico de la señal ───────────────────────────────────────
// Recorre el historial ya descargado del universo escaneado y mide qué pasó después de cada
// vela en la que se cumplían los filtros actuales, frente a la media de todas las velas.
function SignalPerformancePanel({ ctx, selectedTicker }){
  const {S,dataCacheRef,scanDirection,scanning}=ctx;
  const filters=scanDirection==='short'?ctx.shortFilters:ctx.filters;
  const [state,setState]=useState({status:'idle'});
  const [progress,setProgress]=useState(null);
  const runId=useRef(0);
  useEffect(()=>{ runId.current++; setState({status:'idle'}); setProgress(null); },[filters,scanDirection,scanning]);
  useEffect(()=>()=>{ runId.current++; },[]);
  const run=async()=>{
    const id=++runId.current;
    setState({status:'running'}); setProgress(null);
    try{
      const out=await window.StockScannerCore.computeSignalPerformance({
        dataByTicker:dataCacheRef.current, filters, direction:scanDirection,
        yieldToUi:()=>new Promise(resolve=>setTimeout(resolve,0)),
        isCancelled:()=>runId.current!==id,
        onProgress:p=>{ if(runId.current===id) setProgress(p); },
      });
      if(runId.current!==id) return;
      setState(out.ok?{status:'done',result:out}:{status:'error',message:out.message||'No se pudo calcular.'});
    }catch(error){
      if(runId.current===id) setState({status:'error',message:error?.message||'Error'});
    }
  };
  const pct=v=>v==null||!Number.isFinite(v)?'-':`${v>=0?'+':''}${(v*100).toFixed(2)}%`;
  const rate=v=>v==null?'-':`${(v*100).toFixed(0)}%`;
  const fmtDate=t=>t?new Date(t*1000).toISOString().slice(0,10):'-';
  const tone=v=>v==null?'var(--text-2)':v>0?'var(--green)':v<0?'var(--red)':'var(--text-2)';
  const r=state.result;
  const mine=r&&selectedTicker?r.byTicker[selectedTicker]:null;
  const th={fontSize:10,color:'var(--text-3)',fontWeight:600,padding:'6px 8px',textAlign:'right',borderBottom:'1px solid var(--row-divider)',whiteSpace:'nowrap'};
  const td={fontSize:12,padding:'7px 8px',textAlign:'right',fontVariantNumeric:'tabular-nums',borderBottom:'1px solid var(--row-divider)',whiteSpace:'nowrap'};
  return (
    <section className="signal-performance" aria-label="Rendimiento histórico de la señal" style={{...S.panel,marginTop:10,padding:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
        <div style={{minWidth:0,flex:'1 1 280px'}}>
          <strong style={{fontSize:13}}>Rendimiento histórico de la señal</strong>
          <div style={{fontSize:11,color:'var(--text-2)',marginTop:3}}>Qué pasó en el universo escaneado después de cada vela en la que se cumplían estos filtros, frente a la media de todas las velas.</div>
        </div>
        <button type="button" style={S.ghostBtn} onClick={run} disabled={state.status==='running'} aria-busy={state.status==='running'}>
          {state.status==='running'?'Calculando…':state.status==='done'?'Recalcular':'Calcular'}
        </button>
      </div>
      {state.status==='running'&&<div role="status" style={{fontSize:11,color:'var(--text-2)',marginTop:10}}>{`Analizando ${progress?progress.done+'/'+progress.total+' ':''}símbolos…`}</div>}
      {state.status==='error'&&<div role="alert" style={{fontSize:11,color:'var(--amber)',marginTop:10}}>{state.message}</div>}
      {state.status==='done'&&r&&<>
        <div style={{fontSize:11,color:'var(--text-2)',margin:'10px 0 6px'}}>
          {`${r.signals.toLocaleString()} señales (${r.episodes.toLocaleString()} episodios) en ${r.tickersWithSignals} de ${r.tickersUsed} símbolos · ${fmtDate(r.firstTime)} → ${fmtDate(r.lastTime)} · base ${r.baseTf.toUpperCase()} · ${r.direction==='short'?'Short':'Long'}`}
        </div>
        {r.signals>0?<div style={{overflowX:'auto'}}>
          <table aria-label="Retornos tras la señal" style={{width:'100%',borderCollapse:'collapse',minWidth:560}}>
            <thead><tr>
              <th style={{...th,textAlign:'left'}}>Horizonte</th><th style={th}>Señales</th><th style={th}>Retorno medio</th><th style={th}>Mediana</th>
              <th style={th}>% acierto</th><th style={th} title="Retorno medio de todas las velas evaluables del universo">Base</th><th style={th} title="Retorno medio con señal menos base">Ventaja</th>
            </tr></thead>
            <tbody>{r.aggregate.map(a=>(
              <tr key={a.bars}>
                <td style={{...td,textAlign:'left'}}>{a.label}</td>
                <td style={td}>{a.n.toLocaleString()}</td>
                <td style={{...td,color:tone(a.mean),fontWeight:600}}>{pct(a.mean)}</td>
                <td style={{...td,color:tone(a.median)}}>{pct(a.median)}</td>
                <td style={td}>{rate(a.hitRate)} <span style={{color:'var(--text-3)',fontSize:10}}>{`vs ${rate(a.baseHitRate)}`}</span></td>
                <td style={{...td,color:'var(--text-2)'}}>{pct(a.baseMean)}</td>
                <td style={{...td,color:tone(a.edge),fontWeight:700}}>{pct(a.edge)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>:<div style={{fontSize:12,color:'var(--text-2)'}}>Los filtros no se cumplieron en ninguna vela cerrada del historial disponible.</div>}
        {selectedTicker&&<div style={{fontSize:11,color:'var(--text-2)',marginTop:10}}>
          {mine?`${selectedTicker}: ${mine.signals} señales (${mine.episodes} episodios) · `+mine.horizons.map((h,i)=>`${r.horizons[i].label} ${pct(h.mean)} (${rate(h.hitRate)} acierto)`).join(' · ')
            :`${selectedTicker}: sin señales en el historial disponible.`}
        </div>}
        <ul style={{fontSize:10,color:'var(--text-3)',margin:'10px 0 0',paddingLeft:16,lineHeight:1.6}}>
          <li>Entrada en la apertura siguiente a la vela de señal y salida al cierre tras el horizonte, sin costes. Sólo velas cerradas en todas las temporalidades.</li>
          <li>Las señales consecutivas de un mismo símbolo se solapan; los episodios cuentan sólo la primera vela de cada racha.</li>
          <li>El universo es el actual: los símbolos que dejaron de cotizar no aparecen (sesgo de supervivencia).</li>
          {r.usesMeta&&<li style={{color:'var(--amber)'}}>Los filtros fundamentales usan valores actuales en todo el historial.</li>}
        </ul>
      </>}
    </section>
  );
}

const ScannerInspector = React.memo(function ScannerInspector({row,dataCacheRef,onOpen,side,filters}){
  const priceHost=useRef(null);
  const [chartStatus,setChartStatus]=useState('empty');
  const [chosenTf,setChosenTf]=useState(null);
  const [loaded,setLoaded]=useState(null);
  const [crossInfo,setCrossInfo]=useState(null);
  const [themeVersion,setThemeVersion]=useState(0);
  const ticker=row?.ticker;
  const chartTf=chosenTf||row?.mainTf||'1d';
  const source=ticker?dataCacheRef.current[ticker]:null;
  const data=source?.[chartTf]?.ok?source[chartTf]:(loaded?.ticker===ticker&&loaded?.tf===chartTf?loaded:null);
  const activeFilters=filters;
  useEffect(()=>setCrossInfo(null),[ticker,chartTf,filters]);
  useEffect(()=>{
    const observer=new MutationObserver(()=>setThemeVersion(v=>v+1));
    observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!ticker||source?.[chartTf]?.ok)return;
    const ac=new AbortController();
    setChartStatus('loading');
    window.StockScannerCore.fetchTicker(ticker,chartTf,ac.signal).then(d=>{
      if(ac.signal.aborted)return;
      if(d?.ok){
        dataCacheRef.current[ticker]={...(dataCacheRef.current[ticker]||{}),[chartTf]:d};
        setLoaded({...d,ticker,tf:chartTf});
      }else setChartStatus('unavailable');
    }).catch(()=>{if(!ac.signal.aborted)setChartStatus('unavailable');});
    return ()=>ac.abort();
  },[ticker,chartTf,dataCacheRef,source]);
  useEffect(()=>{
    if(!ticker||!data?.ok||!window.LightweightCharts||!priceHost.current){if(!ticker)setChartStatus('empty');return;}
    const renderer=window.StockScannerUI.ChartRenderer;
    const charts=[];
    let resizeObserver;
    try{
      const times=[...(data.times||[])].reverse();
      const candles=times.map((time,i)=>{
        const idx=times.length-1-i;
        return {time,open:data.opens?.[idx]??data.closes[idx],high:data.highs[idx],low:data.lows[idx],close:data.closes[idx]};
      });
      const options={activeFilters,activeEntryRules:[],activeExitRules:[],chartTf,backtestTrades:[],showExitInfo:false,showVolume:true,showIndicators:false,setCrossInfo,priceHeight:priceHost.current.clientHeight||350};
      const priceChart=renderer.buildPriceChart(priceHost.current,data,times,candles,options);
      charts.push(priceChart);
      if(times.length>150)priceChart.timeScale().setVisibleLogicalRange({from:times.length-150,to:times.length+2});
      const resize=()=>{
        if(priceHost.current)priceChart.applyOptions({width:priceHost.current.clientWidth,height:priceHost.current.clientHeight||350});
      };
      resizeObserver=new ResizeObserver(resize);
      resizeObserver.observe(priceHost.current);
      setChartStatus(candles.length?'ready':'unavailable');
    }catch(error){console.warn('Onix inspector:',error);setChartStatus('unavailable');}
    return ()=>{resizeObserver?.disconnect();charts.reverse().forEach(c=>renderer.disposeChart(c));};
  },[ticker,data,chartTf,activeFilters,themeVersion]);
  const {InspectorSummary}=window.StockScannerUI;

  const summaryData=React.useMemo(()=>data?{...data,tf:chartTf}:null,[data,chartTf]);
  return <section className="inspector-panel" aria-label="Inspector del símbolo">
    <div className="inspector-header"><div className="inspector-heading"><strong>{ticker||'Inspector'}</strong>
      <select aria-label="Temporalidad del inspector" value={chartTf} onChange={e=>setChosenTf(e.target.value)} style={window.StockScannerUI.UI_STYLES.inp}>{window.StockScannerConfig.TIMEFRAMES.map(tf=><option value={tf.id} key={tf.id}>{tf.id.toUpperCase()}</option>)}</select></div>
      {row&&<button type="button" style={window.StockScannerUI.UI_STYLES.ghostBtn} onClick={()=>onOpen({ticker,side:side==='short'?'short':'long',source:'Resultados'})}>Ampliar gráfico</button>}
    </div>

    <div className="inspector-chart-stack" style={{display:data?.ok?'block':'none'}}>
      <div ref={priceHost} className="inspector-chart"/>
    </div>
    {chartStatus!=='ready'&&<div className="inspector-empty"><strong>{ticker?'Vista de precio':'Tu próxima oportunidad empieza aquí'}</strong><span>{!ticker?'Ejecuta un escaneo y selecciona una fila para ver el gráfico.':chartStatus==='loading'?'Cargando temporalidad…':'No hay datos para esta temporalidad. Prueba otra o abre el gráfico ampliado.'}</span></div>}
    {row&&<InspectorSummary ticker={ticker} data={summaryData} dataCache={dataCacheRef} filters={activeFilters} crossInfo={crossInfo} signalTimes={row.signalTimes}/>}
  </section>;
});

// ── Entry point exposed to main.js ─────────────────────────────────────────
window.StockScannerTabs.renderScannerTabs = function(ctx){
  if(ctx.tab !== "scanner") return null;
  return <ScannerTab ctx={ctx}/>;
};

})();
