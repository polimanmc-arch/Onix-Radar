// portfolioTab.js - Portfolio tab.
//   Layout:
//     ▸ Config card + Manual tickers card + full-width Build button
//     ▸ KPIs row + info bar
//     ▸ Nivel 1: Efficient Frontier + Unified Donut (segmented by "Accion/Sector")
//       - both cards share the same height on a 1fr/1fr grid
//     ▸ Nivel 2: Allocations table full width - enriched with day change,
//       volume, market cap, P/E and a 3-month sparkline
//     ▸ Export CSV
window.StockScannerTabs = window.StockScannerTabs || {};

(function(){
const { useState, useMemo } = React;

// ── Palette used by both donuts, legend dots and row markers ───────────────
const CHART_COLORS = [
  "#3da5ff", // blue
  "#22c98a", // green
  "#ef4c5a", // red
  "#f5a524", // amber
  "#a97cf8", // purple
  "#4cd6ff", // cyan
  "#ff7bb0", // pink
  "#9bd34d", // lime
  "#ffd15c", // yellow
  "#6b83f7", // indigo
];

// ── Small building blocks ──────────────────────────────────────────────────

function FieldLabel({ children }){
  return (
    <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:1.2,color:"var(--text-3)",marginBottom:5,fontWeight:600,fontFamily:"var(--font-mono)"}}>
      {children}
    </div>
  );
}

function Field({ label, children, style }){
  return (
    <div style={{display:"flex",flexDirection:"column",...(style||{})}}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

// Compact number formatters for the enriched table.
const fmtVol = (v) => {
  if(v == null) return "-";
  if(v >= 1e9) return (v/1e9).toFixed(2) + "B";
  if(v >= 1e6) return (v/1e6).toFixed(2) + "M";
  if(v >= 1e3) return (v/1e3).toFixed(1) + "K";
  return String(v);
};
const fmtMktCap = (v) => {
  if(v == null) return "-";
  if(v >= 1e12) return "$" + (v/1e12).toFixed(2) + "T";
  if(v >= 1e9)  return "$" + (v/1e9).toFixed(2)  + "B";
  if(v >= 1e6)  return "$" + (v/1e6).toFixed(1)  + "M";
  return "$" + v.toFixed(0);
};
const fmtPE = (v) => (v == null || !isFinite(v)) ? "-" : v.toFixed(1);

// 3-month sparkline - same contract as the scanner's. Accepts newest-first
// closes. Color by OLS slope sign.
function Sparkline({ closes, width=88, height=30 }){
  if(!closes || closes.length < 10){
    return <span style={{color:"var(--text-3)",fontSize:9}}>-</span>;
  }
  const slice = closes.slice(0, 63).filter(v=>v!=null).reverse();
  if(slice.length < 10) return <span style={{color:"var(--text-3)",fontSize:9}}>-</span>;
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const range = max - min || 1;
  const xStep = width / (slice.length - 1);
  const pts = slice.map((v,i)=>(i*xStep).toFixed(1)+","+(height-((v-min)/range)*height).toFixed(1)).join(" ");
  const meanX = (slice.length - 1) / 2;
  const meanY = slice.reduce((a,b)=>a+b,0) / slice.length;
  let num = 0, den = 0;
  slice.forEach((y,i)=>{ const dx=i-meanX; num += dx*(y-meanY); den += dx*dx; });
  const slope = den ? num/den : 0;
  const color = slope >= 0 ? "var(--green)" : "var(--red)";
  return (
    <svg width={width} height={height} viewBox={"0 0 "+width+" "+height} preserveAspectRatio="none" style={{display:"block"}}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

// Donut chart with a hole and a single centered value + tiny label. Previous
// versions stacked three pieces of text that overlapped on tight viewports;
// we now render one number with exact vertical anchoring and a small caption
// below it so it always reads cleanly regardless of size.
function DonutChart({ slices, centerValue, centerLabel, size=260 }){
  const cx = size/2, cy = size/2;
  const outerR = size*0.44;
  const innerR = size*0.28;
  let start = -Math.PI/2;
  const paths = slices.map((s,i)=>{
    const sweep = s.weight * 2 * Math.PI;
    if(sweep < 1e-4) return null;
    const end = start + sweep;
    const x1 = cx + outerR*Math.cos(start);
    const y1 = cy + outerR*Math.sin(start);
    const x2 = cx + outerR*Math.cos(end);
    const y2 = cy + outerR*Math.sin(end);
    const xi2 = cx + innerR*Math.cos(end);
    const yi2 = cy + innerR*Math.sin(end);
    const xi1 = cx + innerR*Math.cos(start);
    const yi1 = cy + innerR*Math.sin(start);
    const largeArc = sweep > Math.PI ? 1 : 0;
    const d = [
      "M", x1.toFixed(2), y1.toFixed(2),
      "A", outerR, outerR, 0, largeArc, 1, x2.toFixed(2), y2.toFixed(2),
      "L", xi2.toFixed(2), yi2.toFixed(2),
      "A", innerR, innerR, 0, largeArc, 0, xi1.toFixed(2), yi1.toFixed(2),
      "Z"
    ].join(" ");
    const midAng = start + sweep/2;
    const labelR = outerR * 0.78;
    const lx = cx + labelR*Math.cos(midAng);
    const ly = cy + labelR*Math.sin(midAng);
    start = end;
    return { d, color: s.color, label: s.label, weight: s.weight, lx, ly };
  }).filter(Boolean);

  // Only show a label on slices big enough to host readable text. The small
  // slices are covered in the legend, so skipping them here keeps the donut
  // clean.
  const LABEL_MIN = 0.06;

  return (
    <svg viewBox={"0 0 "+size+" "+size} width="100%" height={size} style={{display:"block",maxWidth:size}}>
      {paths.map((p,i)=>(
        <path key={i} d={p.d} fill={p.color} stroke="var(--bg-0)" strokeWidth="1.5">
          <title>{p.label}: {(p.weight*100).toFixed(1)}%</title>
        </path>
      ))}
      {paths.map((p,i)=> p.weight > LABEL_MIN && (
        <text key={"t"+i} x={p.lx} y={p.ly} fill="var(--bg-0)" fontSize="11" fontWeight="700"
              textAnchor="middle" dominantBaseline="central" style={{pointerEvents:"none",fontFamily:"var(--font-body)"}}>
          {(p.weight*100).toFixed(1)}%
        </text>
      ))}
      {/* Center text: ONE big number, ONE tiny caption. No "Portafolio" third
          line - that was the source of the overlap. Title already shows it. */}
      {centerValue != null && (
        <text x={cx} y={cy-4} fill="var(--text-0)" fontSize="34" fontWeight="700"
              textAnchor="middle" dominantBaseline="central"
              style={{fontFamily:"var(--font-body)",letterSpacing:".5px"}}>
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text x={cx} y={cy+20} fill="var(--text-3)" fontSize="9"
              textAnchor="middle" dominantBaseline="central"
              style={{letterSpacing:1.5,fontFamily:"var(--font-mono)",textTransform:"uppercase"}}>
          {centerLabel}
        </text>
      )}
    </svg>
  );
}

function DonutLegend({ slices, columns=1 }){
  return (
    <div className="ro-stack-mobile" style={{display:"grid",gridTemplateColumns:`repeat(${columns}, minmax(0,1fr))`,gap:"8px 20px",alignContent:"center"}}>
      {slices.map((s,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
            <span style={{display:"inline-block",width:10,height:10,borderRadius:2,background:s.color,flex:"0 0 auto"}}/>
            <span style={{fontSize:11,color:"var(--text-1)",fontWeight:600,fontFamily:"var(--font-body)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {s.label}
            </span>
          </div>
          <span style={{fontSize:11,color:"var(--text-2)",fontFamily:"var(--font-mono)",flex:"0 0 auto"}}>
            {(s.weight*100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function ConfigBadge({ pfMode, pfSims, allocCount }){
  const text = pfMode === 'equalweight'
    ? "EQUAL WEIGHT - " + (allocCount || "N") + " POS"
    : "MARKOWITZ - " + (pfSims||0).toLocaleString() + " ITER.";
  return (
    <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:1.5,color:"var(--text-3)",fontWeight:600,fontFamily:"var(--font-mono)"}}>
      {text}
    </div>
  );
}

function formatPct(v){
  const n = Number(v||0);
  return Number.isFinite(n) ? n.toFixed(n % 1 === 0 ? 0 : 1) + '%' : '-';
}

function portfolioPresetValues(preset, current = {}){
  switch(preset){
    case 'conservative':
      return { pfMinWeight:2, pfMaxWeight:12, pfMaxPos:15, pfMode:'minvol', pfCorFilter:true, pfCorThresh:0.80 };
    case 'balanced':
      return { pfMinWeight:3, pfMaxWeight:18, pfMaxPos:10, pfMode:'maxsharpe', pfCorFilter:true, pfCorThresh:0.80 };
    case 'concentrated':
      return { pfMinWeight:5, pfMaxWeight:30, pfMaxPos:6, pfMode:'maxret', pfCorFilter:false, pfCorThresh:0.80 };
    case 'equalweight':
      return { pfMinWeight:Math.max(0, Math.min(100, 100/Math.max(2, Number(current.pfMaxPos)||10))), pfMaxWeight:25, pfMaxPos:10, pfMode:'equalweight', pfCorFilter:true, pfCorThresh:0.80 };
    default:
      return null;
  }
}


function SectionCard({ S, title, subtitle, isOpen, onToggle, children }){
  return (
    <div style={{...S.panel,padding:"18px 20px",marginBottom:12}}>
      <button type="button" onClick={onToggle} style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",background:"transparent",border:"none",padding:0,cursor:"pointer",marginBottom:isOpen?14:0}}>
        <div style={{textAlign:"left"}}>
          <div style={S.sectionTitle}>{title}</div>
          {subtitle && <div style={{...S.sectionMeta,marginTop:6}}>{subtitle}</div>}
        </div>
        <div style={S.statusBadge(isOpen?"info":"neutral")}>{isOpen ? 'Ocultar' : 'Mostrar'}</div>
      </button>
      {isOpen && children}
    </div>
  );
}

// ── Config card (unchanged behavior, kept here for clarity) ────────────────

function ConfigCard(ctx){
  const {S,pfCapital,setPfCapital,pfMinWeight,setPfMinWeight,pfMaxWeight,setPfMaxWeight,pfMaxPos,setPfMaxPos,pfRiskFree,setPfRiskFree,
    pfUniverseSource,setPfUniverseSource,pfSims,setPfSims,pfMode,setPfMode,
    pfStopType,setPfStopType,pfStopATRMult,setPfStopATRMult,pfStopATRPeriod,setPfStopATRPeriod,pfStopPctVal,setPfStopPctVal,
    pfCorFilter,setPfCorFilter,pfCorThresh,setPfCorThresh,portfolio,pfConfigOpen,setPfConfigOpen,pfPreset,setPfPreset,
    savedPfPresets,pfPresetName,setPfPresetName,selectedPfPresetId,setSelectedPfPresetId,
    savePortfolioPreset,loadPortfolioPreset,deletePortfolioPreset,exportPortfolioPresets,importPortfolioPresets,
    PF_DEFAULTS} = ctx;

  const inp = {...S.inp,width:"100%",height:38,minHeight:38,padding:"7px 12px",fontSize:12,lineHeight:"20px",background:"var(--bg-2)"};
  const selStyle = {...inp,minWidth:0};
  const [minWeightDraft,setMinWeightDraft] = useState(String(pfMinWeight ?? PF_DEFAULTS?.minWeight ?? 1));
  const [corThreshDraft,setCorThreshDraft] = useState(Number(pfCorThresh ?? PF_DEFAULTS?.corThresh ?? 0.8).toFixed(2));

  React.useEffect(()=>{
    setMinWeightDraft(String(pfMinWeight ?? PF_DEFAULTS?.minWeight ?? 1));
  }, [pfMinWeight, PF_DEFAULTS]);
  React.useEffect(()=>{
    setCorThreshDraft(Number(pfCorThresh ?? PF_DEFAULTS?.corThresh ?? 0.8).toFixed(2));
  }, [pfCorThresh, PF_DEFAULTS]);
  const sideStopBtn = (active) => ({
    ...S.btn,padding:"7px 14px",fontSize:11,fontWeight:600,
    background: active ? "var(--accent-dim)" : "transparent",
    border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
    color: active ? "var(--accent)" : "var(--text-2)",
  });
  const recommendedMin = Math.max(0, +(100/Math.max(2, Number(pfMaxPos)||10)).toFixed(1));
  const minTooHigh = Number(pfMinWeight||0) > Number(pfMaxWeight||0);
  const impossibleByCount = (Number(pfMinWeight||0) * Math.max(2, Number(pfMaxPos)||0)) > 100;
  const maxTooLowForCount = (Number(pfMaxWeight||0) * Math.max(2, Number(pfMaxPos)||0)) < 100;
  const warnings = [];
  if(minTooHigh) warnings.push('El mínimo por acción no puede ser mayor que el peso máximo.');
  if(impossibleByCount) warnings.push('El mínimo por acción × el máximo de posiciones supera 100%.');
  if(maxTooLowForCount) warnings.push('Con este máximo de peso y cantidad de posiciones, no se puede invertir 100% del capital.');
  if(Number(pfMinWeight||0) > recommendedMin) warnings.push('El mínimo por acción esta por encima del nivel sugerido para este número de posiciones.');
  const applyPreset = (preset) => {
    setPfPreset(preset);
    const next = portfolioPresetValues(preset, { pfMaxPos });
    if(!next) return;
    setPfMinWeight(next.pfMinWeight);
    setPfMaxWeight(next.pfMaxWeight);
    setPfMaxPos(next.pfMaxPos);
    setPfMode(next.pfMode);
    setPfCorFilter(next.pfCorFilter);
    setPfCorThresh(next.pfCorThresh);
  };
  const resetDefaults = () => {
    setPfPreset('custom');
    setPfCapital(PF_DEFAULTS?.capital ?? 1000000);
    setPfMinWeight(PF_DEFAULTS?.minWeight ?? 1);
    setPfMaxWeight(PF_DEFAULTS?.maxWeight ?? 25);
    setPfMaxPos(PF_DEFAULTS?.maxPos ?? 10);
    setPfRiskFree(PF_DEFAULTS?.riskFree ?? 5);
    setPfCorFilter(PF_DEFAULTS?.corFilter ?? true);
    setPfCorThresh(PF_DEFAULTS?.corThresh ?? 0.8);
    setPfMode(PF_DEFAULTS?.mode ?? 'maxsharpe');
    setPfSims(PF_DEFAULTS?.sims ?? 30000);
    setPfStopType(PF_DEFAULTS?.stopType ?? 'none');
    setPfStopATRMult(PF_DEFAULTS?.stopATRMult ?? 2);
    setPfStopATRPeriod(PF_DEFAULTS?.stopATRPeriod ?? 14);
    setPfStopPctVal(PF_DEFAULTS?.stopPctVal ?? 8);
    setPfUniverseSource(PF_DEFAULTS?.universeSource ?? 'scan');
  };

  return (
    <SectionCard S={S} title="Configuración de optimizacion" subtitle="Capital, pesos, riesgo y construccion del portafolio" isOpen={pfConfigOpen} onToggle={()=>setPfConfigOpen(v=>!v)}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:1.5,color:"var(--text-3)",fontWeight:600,fontFamily:"var(--font-mono)"}}>Preset</div>
          <select value={pfPreset||'custom'} onChange={e=>applyPreset(e.target.value)} style={{...selStyle,width:180,padding:'7px 10px',fontSize:11}}>
            <option value="custom">Custom</option>
            <option value="conservative">Conservador</option>
            <option value="balanced">Balanceado</option>
            <option value="concentrated">Concentrado</option>
            <option value="equalweight">Equal Weight</option>
          </select>
          <button onClick={resetDefaults} style={{...S.btn,padding:'7px 12px',fontSize:11}}>Reset</button>
        </div>
        <ConfigBadge pfMode={pfMode} pfSims={pfSims} allocCount={portfolio?.allocations?.length}/>
      </div>

      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:14,padding:"8px 10px",border:"1px solid var(--panel-soft-border)",borderRadius:8,background:"var(--panel-accent-bg)"}}>
        <div style={{fontSize:8,color:"var(--text-3)",textTransform:"uppercase",letterSpacing:.8,fontWeight:700}}>Mis presets</div>
        <input value={pfPresetName||""} onChange={e=>setPfPresetName(e.target.value)} placeholder="Nombre del preset" style={{...S.inp,width:180}}/>
        <button onClick={savePortfolioPreset} style={{...S.btnG(true),fontSize:9,borderColor:"rgba(0,160,255,.4)",color:"var(--accent)"}}>
          {selectedPfPresetId ? "Actualizar" : "Guardar"}
        </button>
        <select value={selectedPfPresetId||""} onChange={e=>{
          const id=e.target.value;
          setSelectedPfPresetId(id);
          const item=(savedPfPresets||[]).find(x=>x.id===id);
          if(item) setPfPresetName(item.name||"");
        }} style={{...S.inp,width:190}}>
          <option value="">Seleccionar preset...</option>
          {(savedPfPresets||[]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={loadPortfolioPreset} style={{...S.btnG(false),fontSize:9}}>Cargar</button>
        <button onClick={deletePortfolioPreset} style={{...S.btnG(false),fontSize:9,color:"var(--red)",borderColor:"rgba(220,50,50,.28)"}}>Eliminar</button>
        {selectedPfPresetId&&<button onClick={()=>{setSelectedPfPresetId("");setPfPresetName("");}} style={{...S.btnG(false),fontSize:9}}>Nuevo</button>}
        <button onClick={exportPortfolioPresets} style={{...S.btnG(false),fontSize:9,marginLeft:"auto"}}>Exportar JSON</button>
        <label style={{...S.btnG(false),fontSize:9,cursor:"pointer",display:"inline-flex",alignItems:"center"}}>
          Importar JSON
          <input type="file" accept="application/json,.json" onChange={e=>{importPortfolioPresets(e.target.files?.[0]); e.target.value='';}} style={{display:"none"}}/>
        </label>
      </div>

      {warnings.length > 0 && (
        <div style={{marginBottom:14,padding:'10px 12px',border:'1px solid var(--panel-warning-border)',borderRadius:10,background:'var(--panel-warning-bg)'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--amber)',marginBottom:6}}>Advertencias de configuración</div>
          <ul style={{margin:0,paddingLeft:18,color:'var(--text-2)',fontSize:11,lineHeight:1.45}}>
            {warnings.map((w,i)=><li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="ro-stack-mobile" style={{display:"grid",gridTemplateColumns:"repeat(5, minmax(0, 1fr))",gap:14,marginBottom:14}}>
        <Field label="Capital ($)"><input type="number" min={1} step={1000} value={pfCapital ?? ''} onChange={e=>{ const raw=e.target.value; setPfPreset('custom'); if(raw==='') return setPfCapital(PF_DEFAULTS?.capital ?? 1000000); const n=Number(raw); if(Number.isFinite(n)) setPfCapital(Math.max(1,n)); }} style={inp}/></Field>
        <Field label="Min por acción %"><input type="text" inputMode="decimal" value={minWeightDraft} onFocus={e=>e.target.select()} onChange={e=>{ const raw=e.target.value.replace(',', '.'); if(!/^\d*\.?\d*$/.test(raw)) return; setPfPreset('custom'); setMinWeightDraft(raw); }} onBlur={()=>{ const fallback = PF_DEFAULTS?.minWeight ?? 1; const raw = String(minWeightDraft ?? '').trim(); if(raw===''){ setPfMinWeight(fallback); setMinWeightDraft(String(fallback)); return; } const n = Number(raw); const next = Number.isFinite(n) ? Math.min(100, Math.max(0.5, n)) : fallback; setPfMinWeight(next); setMinWeightDraft(String(next)); }} placeholder="1" style={inp}/></Field>
        <Field label="Max peso %"><input type="number" min={1} max={100} step={0.5} value={pfMaxWeight ?? ''} onChange={e=>{ const raw=e.target.value; setPfPreset('custom'); if(raw==='') return setPfMaxWeight(PF_DEFAULTS?.maxWeight ?? 25); const n=Number(raw); if(Number.isFinite(n)) setPfMaxWeight(Math.min(100, Math.max(1, n))); }} style={inp}/></Field>
        <Field label="Max posiciones"><input type="number" min={2} max={50} step={1} value={pfMaxPos ?? ''} onChange={e=>{ const raw=e.target.value; setPfPreset('custom'); if(raw==='') return setPfMaxPos(PF_DEFAULTS?.maxPos ?? 10); const n=Number(raw); if(Number.isFinite(n)) setPfMaxPos(Math.min(50, Math.max(2, Math.round(n)))); }} style={inp}/></Field>
        <Field label="Risk-Free %"><input type="number" min={0} max={100} step={0.1} value={pfRiskFree ?? ''} onChange={e=>{ const raw=e.target.value; setPfPreset('custom'); if(raw==='') return setPfRiskFree(0); const n=Number(raw); if(Number.isFinite(n)) setPfRiskFree(Math.min(100, Math.max(0, n))); }} style={inp}/></Field>
      </div>

      <div className="ro-stack-mobile" style={{display:"grid",gridTemplateColumns:"repeat(4, minmax(0, 1fr))",gap:14,marginBottom:14,alignItems:"flex-start"}}>
        <Field label="Origen universo">
          <select value={pfUniverseSource} onChange={e=>setPfUniverseSource(e.target.value)} style={selStyle}>
            <option value="scan">Scanner</option>
            <option value="manual">Manual</option>
          </select>
        </Field>
        <Field label="Iteraciones">
          <select value={pfSims} onChange={e=>{ setPfPreset('custom'); setPfSims(+e.target.value); }} style={selStyle}
            disabled={pfMode==='equalweight'}
            title={pfMode==='equalweight' ? "Equal weight no requiere iteraciones" : ""}>
            <option value={5000}>5,000</option>
            <option value={10000}>10,000</option>
            <option value={25000}>25,000</option>
            <option value={50000}>50,000</option>
            <option value={100000}>100,000</option>
          </select>
        </Field>
        <Field label="Optimización">
          <select value={pfMode} onChange={e=>{ setPfPreset('custom'); setPfMode(e.target.value); }} style={selStyle}>
            <option value="maxsharpe">Max Sharpe</option>
            <option value="minvol">Min Varianza</option>
            <option value="maxret">Max Return</option>
            <option value="equalweight">Equal Weight</option>
          </select>
        </Field>
        <Field label="Stop-Loss">
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={()=>{ setPfPreset('custom'); setPfStopType("none"); }} style={sideStopBtn(pfStopType==="none")}>Sin stop</button>
            <button onClick={()=>{ setPfPreset('custom'); setPfStopType("pct"); }}  style={sideStopBtn(pfStopType==="pct")}>% Fijo</button>
            <button onClick={()=>{ setPfPreset('custom'); setPfStopType("atr"); }}  style={sideStopBtn(pfStopType==="atr")}>ATR</button>
          </div>
          {pfStopType==="atr" && (
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:10,flexWrap:"wrap",fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-2)"}}>
              <span>ATR(</span>
              <input type="number" min={1} max={200} value={pfStopATRPeriod} onChange={e=>{ setPfPreset('custom'); setPfStopATRPeriod(+e.target.value||14); }} style={{...S.inp,width:56,padding:"5px 8px",textAlign:"center"}}/>
              <span>) x</span>
              <input type="number" step={0.1} min={0.5} max={5} value={pfStopATRMult} onChange={e=>{ setPfPreset('custom'); setPfStopATRMult(+e.target.value||2); }} style={{...S.inp,width:56,padding:"5px 8px",textAlign:"center"}}/>
            </div>
          )}
          {pfStopType==="pct" && (
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:10,fontFamily:"var(--font-mono)",fontSize:11,color:"var(--text-2)"}}>
              <input type="number" step={1} min={1} max={50} value={pfStopPctVal} onChange={e=>{ setPfPreset('custom'); setPfStopPctVal(+e.target.value||8); }} style={{...S.inp,width:64,padding:"5px 8px",textAlign:"center"}}/>
              <span>%</span>
            </div>
          )}
        </Field>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:20,flexWrap:"wrap",padding:"10px 0",borderTop:"1px solid var(--card-border)",marginTop:4}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button type="button" className="ui-switch" onClick={()=>{ setPfPreset('custom'); setPfCorFilter(!pfCorFilter); }}
            role="switch" aria-label="Filtro de correlación" aria-checked={pfCorFilter}>
            <span className="ui-switch-thumb"/>
          </button>
          <span style={{fontSize:11,color:pfCorFilter?"var(--accent)":"var(--text-2)",fontWeight:600}}>Filtro de correlación</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <label htmlFor="portfolio-correlation-threshold" style={{fontSize:10,color:"var(--text-2)",fontFamily:"var(--font-body)"}}>Umbral</label>
          <input id="portfolio-correlation-threshold" type="text" inputMode="decimal" value={corThreshDraft} onFocus={e=>e.target.select()} onChange={e=>{ const raw=e.target.value.replace(',', '.'); if(!/^\d*\.?\d*$/.test(raw)) return; setPfPreset('custom'); setCorThreshDraft(raw); }} onBlur={()=>{ const fallback = PF_DEFAULTS?.corThresh ?? 0.8; const raw = String(corThreshDraft ?? '').trim(); if(raw===''){ setPfCorThresh(fallback); setCorThreshDraft(Number(fallback).toFixed(2)); return; } const n = Number(raw); const next = Number.isFinite(n) ? Math.min(0.99, Math.max(0.5, n)) : fallback; setPfCorThresh(next); setCorThreshDraft(Number(next).toFixed(2)); }}
            disabled={!pfCorFilter}
            style={{...S.inp,width:70,padding:"7px 10px",textAlign:"center",opacity:pfCorFilter?1:.4}}/>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Manual tickers card (watchlist chips) ──────────────────────────────────

function ManualTickersCard(ctx){
  const {S,pfManualTickers,setPfManualTickers,pfWatchlistName,setPfWatchlistName,pfWatchlists,pfSelectedWatchlistId,setPfSelectedWatchlistId,
    pfCsvInputRef,saveCurrentManualWatchlist,exportCurrentManualCsv,importPortfolioCsvFile,pfManualList,
    portfolioWatchlistActions,setPfUniverseSource,pfManualOpen,setPfManualOpen} = ctx;

  const countInWatchlist = (wl) => {
    if(!wl?.tickers) return 0;
    return wl.tickers.split(/[\s,]+/).filter(Boolean).length;
  };
  const loadChip = (wl) => {
    setPfSelectedWatchlistId(wl.id);
    setPfManualTickers(wl.tickers || '');
    setPfWatchlistName(wl.name || '');
    setPfUniverseSource('manual');
  };
  const deleteChip = (wl, e) => {
    e.stopPropagation();
    if(!confirm("Eliminar la watchlist \""+wl.name+"\"?")) return;
    if(pfSelectedWatchlistId === wl.id) setPfSelectedWatchlistId('');
    portfolioWatchlistActions && portfolioWatchlistActions.deleteSelectedManualWatchlist(wl.id);
  };

  return (
    <SectionCard S={S} title="Tickers manuales y watchlists" subtitle="Crea tu universo propio para el portafolio" isOpen={pfManualOpen} onToggle={()=>setPfManualOpen(v=>!v)}>
      <div className="ro-stack-mobile" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,alignItems:"start"}}>
        <div>
          <FieldLabel>Tickers (separar por coma)</FieldLabel>
          <textarea value={pfManualTickers} onChange={e=>setPfManualTickers(e.target.value.toUpperCase())} rows={4}
            placeholder="NVDA, MSFT, JPM, LLY, XOM, COST, CAT, V"
            style={{...S.inp,width:"100%",minHeight:110,resize:"vertical",fontFamily:"var(--font-mono)",lineHeight:1.5,padding:"10px 12px",fontSize:12}}/>
          <div style={{fontSize:9,color:"var(--text-3)",marginTop:6,fontFamily:"var(--font-mono)"}}>
            {pfManualList.length} tickers detectados
          </div>
        </div>
        <div>
          <FieldLabel>Watchlists guardadas</FieldLabel>
          <div style={{display:"flex",gap:6,marginBottom:10}}>
            <input value={pfWatchlistName} onChange={e=>setPfWatchlistName(e.target.value)} placeholder="nombre watchlist"
              style={{...S.inp,flex:1,padding:"9px 12px",fontSize:12,background:"var(--bg-2)"}}/>
            <button onClick={saveCurrentManualWatchlist} style={{...S.btnG(true),padding:"8px 16px"}}>Guardar</button>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10,minHeight:32}}>
            {pfWatchlists.length === 0 && (
              <div style={{fontSize:10,color:"var(--text-3)",fontStyle:"italic",padding:"6px 0"}}>
                Aun no hay watchlists guardadas.
              </div>
            )}
            {pfWatchlists.map(wl => {
              const active = pfSelectedWatchlistId === wl.id;
              return (
                <button key={wl.id} onClick={()=>loadChip(wl)}
                  title={"Cargar \""+wl.name+"\" ("+countInWatchlist(wl)+" tickers)"}
                  style={{display:"inline-flex",alignItems:"center",gap:8,padding:"6px 10px 6px 12px",borderRadius:999,
                    background: active ? "var(--accent-dim)" : "var(--bg-3)",
                    border:"1px solid "+(active ? "var(--accent)" : "var(--border)"),
                    color: active ? "var(--accent)" : "var(--text-1)",
                    fontSize:11,fontFamily:"var(--font-mono)",fontWeight:600,cursor:"pointer",transition:"all .15s"}}>
                  <span>{wl.name}</span>
                  <span style={{fontSize:10,opacity:.7}}>{countInWatchlist(wl)}</span>
                  <span onClick={(e)=>deleteChip(wl,e)}
                    style={{opacity:.55,padding:"0 2px",borderRadius:4,cursor:"pointer",transition:"opacity .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.opacity=1}
                    onMouseLeave={e=>e.currentTarget.style.opacity=.55}>×</span>
                </button>
              );
            })}
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={()=>pfCsvInputRef.current?.click()} style={{...S.btnG(false),padding:"6px 12px"}}>Importar CSV</button>
            <button onClick={exportCurrentManualCsv} style={{...S.btnG(false),padding:"6px 12px"}}>Exportar CSV</button>
            <input ref={pfCsvInputRef} type="file" accept=".csv,text/csv" style={{display:"none"}}
              onChange={e=>{const f=e.target.files?.[0];importPortfolioCsvFile(f);e.target.value="";}}/>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Results: KPIs / info bar ───────────────────────────────────────────────

function KpiRow({ portfolio, pfRiskFree, S }){
  const retColor  = portfolio.portReturn >= 0 ? "var(--green)" : "var(--red)";
  const sharpe    = portfolio.portSharpe;
  const sharpeCol = sharpe > 1 ? "var(--accent)" : sharpe > 0.5 ? "var(--amber)" : "var(--red)";
  const kpis = [
    { label:"Retorno Esperado", value:(portfolio.portReturn>=0?"+":"")+(portfolio.portReturn*100).toFixed(1)+"%", sub:"anualizado", color:retColor },
    { label:"Volatilidad",      value:(portfolio.portVol*100).toFixed(1)+"%", sub:"σ anual", color:"var(--text-0)" },
    { label:"Sharpe Ratio",     value:sharpe.toFixed(2), sub:"vs rf "+pfRiskFree+"%", color:sharpeCol },
    { label:"Posiciones",       value:portfolio.allocations.length, sub:"optimizadas", color:"var(--accent)" },
  ];
  return (
    <div className="ro-metric-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:12}}>
      {kpis.map((k,i)=>(
        <div key={i} style={{...S.metricCard,padding:"14px 18px"}}>
          <div style={{...S.sectionTitle,marginBottom:8}}>
            {k.label}
          </div>
          <div style={{fontSize:28,fontWeight:700,color:k.color,fontFamily:"var(--font-body)",lineHeight:1.1}}>
            {k.value}
          </div>
          <div style={{fontSize:10,color:"var(--text-3)",marginTop:4}}>{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

function InfoBar({ portfolio, pfSims, pfStopType, scanDirection, S }){
  const modeLabel = portfolio.mode==='maxsharpe' ? 'Max Sharpe'
                  : portfolio.mode==='minvol'    ? 'Min Varianza'
                  : portfolio.mode==='maxret'    ? 'Max Return'
                  : portfolio.mode==='equalweight' ? 'Equal Weight'
                  : portfolio.mode;
  const side = (portfolio.scanDirection || scanDirection || 'long').toLowerCase();
  const sideLabel = side === 'short' ? 'SHORT' : 'LONG';
  const sideColor = side === 'short' ? 'var(--purple)' : 'var(--green)';
  const riskTotal = portfolio.allocations.reduce((a,x)=>a+(x.riskAmount||0),0);
  return (
    <div style={{...S.panel,padding:"10px 14px",marginBottom:12,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{...S.statusBadge("neutral"),color:sideColor}}>Lado {sideLabel}</span>
      <span style={S.statusBadge("info")}>{modeLabel}</span>
      <span style={S.statusBadge("neutral")}>{(portfolio.simsUsed||pfSims).toLocaleString()} muestras</span>
      <span style={S.statusBadge("neutral")}>{portfolio.source==="manual"?"Manual":"Scanner"}</span>
      {portfolio.removedByCor>0 && <span style={S.statusBadge("warning")}>Corr removidas {portfolio.removedByCor}</span>}
      <span style={S.statusBadge("neutral")}>Caja ${portfolio.cash.toFixed(0)}</span>
      {pfStopType !== "none" && (
        <span style={S.statusBadge("danger")}>Riesgo {pfStopType.toUpperCase()} ${riskTotal.toFixed(0)} ({(riskTotal/portfolio.capital*100).toFixed(1)}%)</span>
      )}
    </div>
  );
}

// ── Nivel 1: Efficient Frontier card ───────────────────────────────────────

function EfficientFrontierCard({ portfolio, S }){
  const pts = portfolio.frontier || [];
  if(pts.length < 3){
    return (
      <div style={{...S.cd,padding:20,textAlign:"center",color:"var(--text-3)",fontSize:11}}>
        No hay datos suficientes para la frontera eficiente.
      </div>
    );
  }
  const vols = pts.map(p=>p.vol), rets = pts.map(p=>p.ret);
  const minVol = Math.min(...vols)*0.9, maxVol = Math.max(...vols)*1.05;
  const minRet = Math.min(...rets)*1.1, maxRet = Math.max(...rets)*1.1;
  const rangeV = (maxVol-minVol)||1, rangeR = (maxRet-minRet)||1;
  // Generous padding so axis labels don't crowd the plot. Matches the
  // reference mock where titles sit well outside the gridline area.
  const W = 560, H = 360;
  const padL = 70, padR = 30, padT = 26, padB = 64;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const px = v => padL + ((v-minVol)/rangeV)*plotW;
  const py = r => padT + plotH - ((r-minRet)/rangeR)*plotH;

  // Marker for the chosen optimal point - a small green circle, matching the
  // legend entry. Kept subtle so it doesn't dominate the cloud.
  const markChosen = (p) => p && isFinite(p.vol) && isFinite(p.ret) && (
    <circle cx={px(p.vol)} cy={py(p.ret)} r={5}
      fill="var(--green)" stroke="var(--bg-0)" strokeWidth="1.5">
      <title>Optimo: ret {p.ret.toFixed(1)}% vol {p.vol.toFixed(1)}%</title>
    </circle>
  );

  // Dashed gridlines - 3 horizontal + 3 vertical, subtle.
  const vGrid = [0.25, 0.5, 0.75].map(f => padL + f*plotW);
  const hGrid = [0.25, 0.5, 0.75].map(f => padT + f*plotH);

  // Text coordinates for axis titles (rotated Y label + centered X label).
  const yLabelX = padL - 50;
  const yLabelY = padT + plotH/2;
  const xLabelX = padL + plotW/2;
  const xLabelY = H - 34;

  return (
    <div style={{...S.cd,padding:"14px 18px 14px",display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:1.5,color:"var(--text-3)",fontWeight:600,fontFamily:"var(--font-mono)"}}>
          Frontera eficiente
        </div>
        <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:1.5,color:"var(--text-3)",fontWeight:600,fontFamily:"var(--font-mono)"}}>
          {pts.length.toLocaleString()} simulaciones
        </div>
      </div>

      <div style={{flex:1,display:"flex",alignItems:"center"}}>
        <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",display:"block"}} preserveAspectRatio="xMidYMid meet">
          {/* Dashed gridlines - match the reference's very subtle 2px dashes */}
          {vGrid.map((x,i)=>(
            <line key={"v"+i} x1={x} y1={padT} x2={x} y2={padT+plotH}
              stroke="var(--chart-grid)" strokeWidth=".5" strokeDasharray="2,3"/>
          ))}
          {hGrid.map((y,i)=>(
            <line key={"h"+i} x1={padL} y1={y} x2={padL+plotW} y2={y}
              stroke="var(--chart-grid)" strokeWidth=".5" strokeDasharray="2,3"/>
          ))}
          {/* Axis borders */}
          <line x1={padL} y1={padT+plotH} x2={padL+plotW} y2={padT+plotH}
            stroke="var(--chart-border)" strokeWidth=".7"/>
          <line x1={padL} y1={padT} x2={padL} y2={padT+plotH}
            stroke="var(--chart-border)" strokeWidth=".7"/>

          {/* Sampled portfolios - uniform soft blue, like the reference.
              No color-by-Sharpe (that was noisy). Mild opacity lets overlap
              read as density without becoming a solid blob. */}
          {pts.map((p,i)=>(
            <circle key={i} cx={px(p.vol)} cy={py(p.ret)} r="2.3"
              fill="var(--chart-pill-1)" opacity=".55"/>
          ))}

          {/* Optimal point on top */}
          {markChosen(portfolio.chosenPoint)}

          {/* Y-axis title - rotated, centered on the plot area vertically */}
          <text x={yLabelX} y={yLabelY}
            fill="var(--text-3)" fontSize="10"
            textAnchor="middle" dominantBaseline="central"
            transform={`rotate(-90, ${yLabelX}, ${yLabelY})`}
            style={{fontFamily:"var(--font-mono)",letterSpacing:1.2,textTransform:"uppercase"}}>
            Retorno esperado (%)
          </text>
          {/* X-axis title - centered below the plot area */}
          <text x={xLabelX} y={xLabelY}
            fill="var(--text-3)" fontSize="10"
            textAnchor="middle"
            style={{fontFamily:"var(--font-mono)",letterSpacing:1.2,textTransform:"uppercase"}}>
            Volatilidad (sigma %)
          </text>
        </svg>
      </div>

      {/* Legend - horizontal line + label, like the reference mock. The
          sharpe digit trails the optimal entry. */}
      <div style={{display:"flex",gap:24,alignItems:"center",marginTop:10,paddingTop:8,
        borderTop:"1px solid var(--card-border)",
        fontSize:10,color:"var(--text-2)",flexWrap:"wrap",fontFamily:"var(--font-mono)"}}>
        <span style={{display:"inline-flex",alignItems:"center",gap:8}}>
          <span style={{width:16,height:2,background:"var(--chart-pill-1)",display:"inline-block",borderRadius:1}}/>
          Carteras simuladas
        </span>
        <span style={{display:"inline-flex",alignItems:"center",gap:8}}>
          <span style={{width:16,height:2,background:"var(--green)",display:"inline-block",borderRadius:1}}/>
          Optimo - Sharpe {portfolio.portSharpe.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ── Nivel 1: Unified Donut with segmented "Accion / Sector" ────────────────

function UnifiedDonutCard({ portfolio, S }){
  const [mode, setMode] = useState('ticker'); // 'ticker' | 'sector'

  // Build slices based on current mode.
  const slices = useMemo(() => {
    if(mode === 'sector'){
      const secs = (portfolio.sectors || []).filter(s => s.weight > 0);
      const total = secs.reduce((a,b)=>a+b.weight,0) || 1;
      return secs.map((s,i)=>({
        label: s.name,
        weight: s.weight/total,
        color: CHART_COLORS[i % CHART_COLORS.length],
      }));
    }
    const allocs = portfolio.allocations;
    const total = allocs.reduce((a,b)=>a+Math.abs(b.signedWeight||b.weight),0) || 1;
    return allocs.map((a,i)=>({
      label: a.ticker,
      weight: Math.abs(a.signedWeight||a.weight)/total,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [mode, portfolio]);

  const centerValue = slices.length;
  const centerLabel = mode === 'sector' ? 'sectores' : 'posiciones';

  const segBtn = (active) => ({
    padding:"6px 14px",
    fontSize:11,
    fontWeight:600,
    fontFamily:"var(--font-body)",
    background: active ? "var(--accent-dim)" : "transparent",
    color: active ? "var(--accent)" : "var(--text-2)",
    border:"none",
    borderRadius:"var(--radius-sm)",
    cursor:"pointer",
    transition:"all .15s",
  });

  return (
    <div style={{...S.cd,padding:"14px 16px 14px",display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:9,textTransform:"uppercase",letterSpacing:1.5,color:"var(--text-3)",fontWeight:600,fontFamily:"var(--font-mono)"}}>
          Composicion
        </div>
        <div style={{display:"inline-flex",gap:2,padding:3,background:"var(--bg-2)",border:"1px solid var(--card-border)",borderRadius:"var(--radius)"}}>
          <button onClick={()=>setMode('ticker')} style={segBtn(mode==='ticker')}>Por acción</button>
          <button onClick={()=>setMode('sector')} style={segBtn(mode==='sector')}>Por sector</button>
        </div>
      </div>

      <div className="ro-stack-mobile" style={{flex:1,display:"grid",gridTemplateColumns:"minmax(220px,1fr) minmax(180px,1fr)",gap:18,alignItems:"center"}}>
        <div style={{display:"flex",justifyContent:"center",alignItems:"center"}}>
          <DonutChart slices={slices}
            centerValue={centerValue}
            centerLabel={centerLabel}
            size={260}/>
        </div>
        <div style={{maxHeight:300,overflowY:"auto",paddingRight:4}}>
          <DonutLegend slices={slices} columns={1}/>
        </div>
      </div>
    </div>
  );
}

// ── Nivel 2: Allocations table (enriched) ──────────────────────────────────

function CorrelationHeatmapCard({ portfolio, S }){
  const matrix = portfolio?.correlationMatrix || [];
  if(matrix.length < 2) return null;
  const cellStyle = (v) => {
    const x = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    const alpha = Math.min(0.95, 0.18 + Math.abs(x) * 0.62);
    return {
      background: x >= 0 ? `rgba(239,76,90,${alpha})` : `rgba(34,201,138,${alpha})`,
      color: Math.abs(x) > 0.55 ? "#fff" : "var(--text-0)",
    };
  };
  return (
    <div style={{...S.panel,padding:"14px 16px",marginBottom:12,overflow:"auto"}}>
      <div style={{...S.sectionHeader,alignItems:"center",marginBottom:12}}>
        <div style={S.sectionTitle}>
          Correlacion entre posiciones
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,fontSize:9,color:"var(--text-3)",fontFamily:"var(--font-mono)"}}>
          <span style={{display:"inline-block",width:18,height:8,background:"rgba(34,201,138,.72)",borderRadius:2}}/>
          <span>Negativa</span>
          <span style={{display:"inline-block",width:18,height:8,background:"rgba(239,76,90,.72)",borderRadius:2,marginLeft:8}}/>
          <span>Positiva</span>
        </div>
      </div>
      <div className="ro-scroll-x">
        <div style={{display:"grid",gridTemplateColumns:`88px repeat(${matrix.length}, minmax(46px, 1fr))`,minWidth:Math.max(520, 88 + matrix.length * 54),gap:2}}>
          <div/>
          {matrix.map(r=>(
            <div key={"h"+r.ticker} title={r.ticker} style={{fontSize:9,color:"var(--text-3)",fontFamily:"var(--font-mono)",textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {r.ticker}
            </div>
          ))}
          {matrix.map((r,ri)=>(
            <React.Fragment key={r.ticker}>
              <div style={{fontSize:9,color:"var(--text-2)",fontFamily:"var(--font-mono)",fontWeight:700,padding:"8px 8px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {r.ticker}
              </div>
              {r.row.map((v,ci)=>(
                <div key={r.ticker+"-"+ci} title={`${r.ticker} / ${matrix[ci]?.ticker}: ${Number(v||0).toFixed(2)}`} style={{...cellStyle(v),height:32,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontFamily:"var(--font-mono)",fontWeight:700,borderRadius:3,border:ri===ci?"1px solid var(--card-border)":"1px solid var(--row-divider)"}}>
                  {Number(v||0).toFixed(2)}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function AllocationsTable({ portfolio, pfStopType, pfMaxWeight, setSelectedChart, S }){
  const allocs = portfolio.allocations;
  const fmtPct = v => (v!=null ? (v>=0?"+":"")+(v*100).toFixed(2)+"%" : "-");
  const thBase = {...S.th,padding:"10px 12px"};
  const tdBase = {...S.td,padding:"9px 12px",fontSize:11,fontFamily:"var(--font-body)"};
  const barColors = CHART_COLORS;

  return (
    <div style={{...S.tableWrap,maxHeight:"58vh",marginBottom:12}}>
      <div style={{...S.sectionHeader,alignItems:"center",marginBottom:0,padding:"14px 16px 10px",borderBottom:"1px solid var(--panel-soft-border)",background:"var(--bg-1)"}}>
        <div style={S.sectionTitle}>Posiciones optimas</div>
        <span style={S.statusBadge("info")}>{allocs.length} posiciones</span>
      </div>
      <table className="ui-table" style={S.table}>
        <thead>
          <tr>
            <th style={{...thBase,textAlign:"left"}}>Ticker</th>
            <th style={{...thBase,textAlign:"left"}}>Empresa</th>
            <th style={{...thBase,textAlign:"left"}}>Peso %</th>
            <th style={{...thBase,textAlign:"right"}}>Monto</th>
            <th style={{...thBase,textAlign:"right"}}>Acciones</th>
            <th style={{...thBase,textAlign:"right"}}>Precio</th>
            <th style={{...thBase,textAlign:"right"}}>Stop</th>
            <th style={{...thBase,textAlign:"right"}}>Retorno An.</th>
            <th style={{...thBase,textAlign:"right"}}>Volatilidad</th>
            <th style={{...thBase,textAlign:"right"}}>Sharpe</th>
            <th style={{...thBase,textAlign:"center"}}>Grafico</th>
          </tr>
        </thead>
        <tbody>
          {allocs.map((a,i)=>{
            const color = barColors[i % barColors.length];
            const wPct = a.weight*100;
            const retColor = a.annRet >= 0 ? "var(--green)" : "var(--red)";
            const sharpeCol = a.sharpe>1 ? "var(--green)" : a.sharpe>0 ? "var(--amber)" : "var(--red)";
            return (
              <tr key={a.ticker} style={{cursor:"pointer"}}
                onClick={()=>setSelectedChart({ticker:a.ticker,side:a.side||"long",source:"Portafolio"})}>
                <td style={{...tdBase,fontWeight:700}}>
                  <span style={{display:"inline-flex",alignItems:"center",gap:8}}>
                    <span style={{display:"inline-block",width:8,height:8,borderRadius:"50%",background:color}}/>
                    <span style={{color:"var(--accent)"}}>{a.ticker}</span>
                  </span>
                </td>
                <td className="ui-truncate" style={{...tdBase,color:"var(--text-2)",fontWeight:400,maxWidth:220}} title={a.longName||a.shortName||a.name}>
                  {a.shortName || a.name || "-"}
                </td>
                <td style={{...tdBase}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:70,height:6,background:"var(--bg-3)",borderRadius:3,overflow:"hidden",flex:"0 0 auto"}}>
                      <div style={{width:Math.min(100,wPct*4)+"%",height:"100%",background:color,borderRadius:3,opacity:wPct>=pfMaxWeight-1?.7:1}}/>
                    </div>
                    <span style={{fontVariantNumeric:"tabular-nums",fontWeight:600,color:"var(--text-1)",minWidth:44}}>{wPct.toFixed(1)}%</span>
                  </div>
                </td>
                <td style={{...tdBase,textAlign:"right",color:"var(--text-1)"}}>${a.amount.toFixed(0)}</td>
                <td style={{...tdBase,textAlign:"right",color:"var(--text-3)"}}>{a.shares}</td>
                <td style={{...tdBase,textAlign:"right",color:"var(--text-1)"}}>${a.price.toFixed(2)}</td>
                <td style={{...tdBase,textAlign:"right",color:"var(--text-3)"}}>
                  {a.activeStop ? "$"+a.activeStop.toFixed(2) : "-"}
                </td>
                <td style={{...tdBase,textAlign:"right",color:retColor,fontWeight:600}}>{fmtPct(a.annRet)}</td>
                <td style={{...tdBase,textAlign:"right",color:"var(--text-1)"}}>{(a.annVol*100).toFixed(2)}%</td>
                <td style={{...tdBase,textAlign:"right",color:sharpeCol,fontWeight:600}}>{a.sharpe.toFixed(2)}</td>
                <td title="Abrir grafico" style={{...tdBase,textAlign:"center",padding:"6px 10px"}}>
                  <div style={{display:"flex",justifyContent:"center"}}>
                    <Sparkline closes={a.spark}/>
                  </div>
                </td>
              </tr>
            );
          })}
          {/* Totals */}
          <tr style={{background:"rgba(0,160,255,.03)"}}>
            <td style={{...tdBase,fontWeight:700,color:"var(--accent)",borderTop:"2px solid var(--panel-soft-border)",borderBottom:"none"}}>TOTAL</td>
            <td style={{...tdBase,borderTop:"2px solid var(--panel-soft-border)",borderBottom:"none"}}/>
            <td style={{...tdBase,fontWeight:700,color:"var(--accent)",borderTop:"2px solid var(--panel-soft-border)",borderBottom:"none"}}>{(allocs.reduce((a,x)=>a+x.weight,0)*100).toFixed(1)}%</td>
            <td style={{...tdBase,fontWeight:700,textAlign:"right",color:"var(--accent)",borderTop:"2px solid var(--panel-soft-border)",borderBottom:"none"}}>${allocs.reduce((a,x)=>a+x.amount,0).toFixed(0)}</td>
            <td style={{...tdBase,textAlign:"right",color:"var(--text-3)",borderTop:"2px solid var(--panel-soft-border)",borderBottom:"none"}}>{allocs.reduce((a,x)=>a+x.shares,0)}</td>
            <td colSpan={6} style={{borderTop:"2px solid var(--panel-soft-border)",borderBottom:"none"}}/>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ExportBar({ portfolio, S }){
  const doExport = () => {
    const hdr = ["Ticker","Empresa","Sector","Industria","Peso%","Monto","Acciones","Precio","StopLoss","Riesgo$","RetAnual%","VolAnual%","Sharpe"];
    const rows = [hdr.join(",")];
    portfolio.allocations.forEach(a=>{
      rows.push([
        a.ticker,'"'+(a.name||"")+'"','"'+(a.sector||"")+'"','"'+(a.industry||"")+'"',
        (a.weight*100).toFixed(2),a.amount.toFixed(0),a.shares,a.price.toFixed(2),
        a.activeStop?a.activeStop.toFixed(2):"",a.riskAmount?a.riskAmount.toFixed(0):"",
        (a.annRet*100).toFixed(2),(a.annVol*100).toFixed(2),a.sharpe.toFixed(3),
      ].join(","));
    });
    rows.push("",
      ["Retorno Portafolio",(portfolio.portReturn*100).toFixed(2)+"%"].join(","),
      ["Volatilidad",(portfolio.portVol*100).toFixed(2)+"%"].join(","),
      ["Sharpe",portfolio.portSharpe.toFixed(3)].join(","),
      ["Capital","$"+portfolio.capital].join(",")
    );
    const b = new Blob([rows.join("\n")],{type:"text/csv"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "portfolio_"+new Date().toISOString().slice(0,10)+".csv";
    a.click();
  };
  return (
    <div style={{marginTop:12,display:"flex",gap:6}}>
      <button onClick={doExport} style={S.ghostBtn}>Exportar CSV</button>
    </div>
  );
}

function PortfolioResults({ctx}){
  const [view,setView]=React.useState('overview');
  const {S,portfolio,pfSims,pfStopType,pfMaxWeight,pfRiskFree,scanDirection,setSelectedChart} = ctx;
  return (
    <div>
      <nav className="workspace-subnav" aria-label="Vistas del portafolio">{[['overview','Resumen'],['positions','Posiciones'],['correlation','Correlación']].map(([key,label])=><button type="button" key={key} aria-current={view===key?'page':undefined} onClick={()=>setView(key)}>{label}</button>)}</nav>
      <KpiRow portfolio={portfolio} pfRiskFree={pfRiskFree} S={S}/>
      {view==='overview'&&<InfoBar portfolio={portfolio} pfSims={pfSims} pfStopType={pfStopType} scanDirection={scanDirection} S={S}/>}

      {/* Nivel 1 - Efficient Frontier + Unified Donut, same row, same height */}
      {view==='overview'&&<div className="ro-stack-mobile" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        <EfficientFrontierCard portfolio={portfolio} S={S}/>
        <UnifiedDonutCard portfolio={portfolio} S={S}/>
      </div>}

      {/* Nivel 2 - Allocations table full-width */}
      {view==='correlation'&&<CorrelationHeatmapCard portfolio={portfolio} S={S}/>}
      {view==='positions'&&<AllocationsTable portfolio={portfolio} pfStopType={pfStopType} pfMaxWeight={pfMaxWeight} setSelectedChart={setSelectedChart} S={S}/>}

      <ExportBar portfolio={portfolio} S={S}/>
    </div>
  );
}

// ── Entry point ────────────────────────────────────────────────────────────

function PortfolioWorkspace({ctx}){
  const [settingsOpen,setSettingsOpen]=React.useState(!ctx.portfolio);
  React.useEffect(()=>{if(ctx.portfolio)setSettingsOpen(false);},[ctx.portfolio]);
  const {tab,S,pfUniverseSource,pfBuilding,pfSims,portfolio,passN,pfManualList,buildPortfolio,pfMinWeight,pfMaxWeight,pfMaxPos,pfCapital,pfMode} = ctx;
  if(tab!=="portfolio") return null;

  const canBuild = pfUniverseSource==="manual" ? pfManualList.length>=2 : passN>=2;
  const portfolioWarnings = [];
  if(Number(pfMinWeight||0) > Number(pfMaxWeight||0)) portfolioWarnings.push('Min por acción % no puede superar Max peso %.');
  if((Number(pfMinWeight||0) * Math.max(2, Number(pfMaxPos)||0)) > 100) portfolioWarnings.push('La combinación entre mínimo por acción y máximo de posiciones es inviable.');
  if((Number(pfMaxWeight||0) * Math.max(2, Number(pfMaxPos)||0)) < 100) portfolioWarnings.push('No podrás asignar el 100% del capital con el máximo de peso actual.');
  if(Number(pfCapital||0) <= 0) portfolioWarnings.push('El capital debe ser mayor que 0.');
  if(pfMode === 'equalweight' && Number(pfMinWeight||0) > 100/Math.max(2, Number(pfMaxPos)||10)) portfolioWarnings.push('Equal Weight funciona mejor con un mínimo por acción menor o igual al peso equiponderado.');
  const canActuallyBuild = canBuild && portfolioWarnings.length === 0;

  return (
    <div>
      <div style={{...S.panel,padding:'12px 14px',marginBottom:12,display:'flex',flexWrap:'wrap',gap:10,alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={S.sectionTitle}>Optimizar portafolio</div>
          <div style={{...S.sectionMeta,marginTop:4}}>
            {pfUniverseSource==="manual" ? `${pfManualList.length} tickers manuales` : `${passN} acciones desde scanner`}
          </div>
        </div>
        <button onClick={buildPortfolio} disabled={pfBuilding||!canActuallyBuild}
          style={{...S.warningBtn,
            minHeight:"var(--control-h)",
            padding:"7px 16px",
            fontSize:11,
            background: canActuallyBuild && !pfBuilding ? "var(--accent)" : "var(--bg-3)",
            color: canActuallyBuild && !pfBuilding ? "#fff" : "var(--text-3)",
            cursor:(pfBuilding||!canActuallyBuild)?"not-allowed":"pointer",
            boxShadow: canActuallyBuild && !pfBuilding ? "0 2px 12px rgba(255,179,64,.2)" : "none",
          }}>
          {pfBuilding ? "Optimizando..." : "Construir Portafolio"}
        </button>
      </div>
      <div className="workspace-toolbar"><button type="button" style={S.ghostBtn} aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(v=>!v)}>Configuración y universo</button></div>
      {settingsOpen&&<><ConfigCard {...ctx}/>{ManualTickersCard(ctx)}</>}

      {portfolioWarnings.length > 0 && (
        <div style={{...S.panel,padding:'12px 14px',marginBottom:12,border:'1px solid var(--panel-warning-border)',background:'var(--panel-warning-bg)'}}>
          <div style={{...S.sectionTitle,color:'var(--amber)',marginBottom:6}}>Revisa estas restricciones antes de construir</div>
          <ul style={{margin:0,paddingLeft:18,color:'var(--text-2)',fontSize:11,lineHeight:1.45}}>
            {portfolioWarnings.map((w,i)=><li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div style={{...S.cd,padding:'10px 14px',marginBottom:12,display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}}>
        <div style={{fontSize:10,color:'var(--text-2)'}}>Capital: <b style={{color:'var(--text-1)'}}>${Number(pfCapital||0).toLocaleString()}</b></div>
        <div style={{fontSize:10,color:'var(--text-2)'}}>Min por acción: <b style={{color:'var(--text-1)'}}>{formatPct(pfMinWeight)}</b></div>
        <div style={{fontSize:10,color:'var(--text-2)'}}>Max peso: <b style={{color:'var(--text-1)'}}>{formatPct(pfMaxWeight)}</b></div>
        <div style={{fontSize:10,color:'var(--text-2)'}}>Max posiciones: <b style={{color:'var(--text-1)'}}>{pfMaxPos}</b></div>
        <div style={{fontSize:10,color:'var(--text-2)'}}>Modo: <b style={{color:'var(--text-1)'}}>{pfMode === 'minvol' ? 'Min Varianza' : pfMode === 'maxsharpe' ? 'Max Sharpe' : pfMode === 'maxret' ? 'Max Return' : 'Equal Weight'}</b></div>
      </div>

      {false && <button onClick={buildPortfolio} disabled={pfBuilding||!canActuallyBuild}
        style={{
          width:"100%",padding:"16px 24px",marginBottom:14,
          border:"1px solid "+(canActuallyBuild && !pfBuilding ? "var(--accent)" : "var(--border)"),
          borderRadius:"var(--radius)",
          background: canActuallyBuild && !pfBuilding ? "var(--accent-dim)" : "var(--bg-3)",
          color: canActuallyBuild && !pfBuilding ? "var(--accent)" : "var(--text-3)",
          fontFamily:"var(--font-body)",fontSize:14,fontWeight:700,letterSpacing:.4,
          cursor:(pfBuilding||!canActuallyBuild)?"not-allowed":"pointer",
          transition:"all .2s",
          boxShadow: canActuallyBuild && !pfBuilding ? "0 0 16px rgba(0,180,255,.08)" : "none",
        }}>
        {pfBuilding ? "Optimizando..." : "Construir Portafolio"}
      </button>}

      {portfolio && !pfBuilding && <PortfolioResults ctx={ctx}/>}
      {!portfolio && !pfBuilding && (
        <div style={S.emptyState}>
            {canActuallyBuild
              ? "Listo para optimizar. Ajusta la configuración y construye el portafolio."
              : (pfUniverseSource==="manual"
                  ? "Agrega al menos 2 tickers manuales."
                  : "Escanea primero con al menos 2 acciones que pasen los filtros.")}
        </div>
      )}
      {pfBuilding && (
        <div style={{...S.panel,padding:24,textAlign:"center"}}>
          <div style={{...S.progressBar,maxWidth:320,margin:"0 auto 12px"}}>
            <span style={{...S.progressFill(65),background:"linear-gradient(90deg,var(--amber),var(--accent))"}}/>
          </div>
          <div style={{...S.sectionMeta,color:"var(--text-2)"}}>
            Mapeando frontera eficiente ({pfSims.toLocaleString()} portafolios aleatorios)...
          </div>
        </div>
      )}
    </div>
  );
}

window.StockScannerTabs.renderPortfolioTab = function(ctx){
  return ctx.tab==='portfolio'?<PortfolioWorkspace ctx={ctx}/>:null;
};

})();
