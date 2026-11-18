window.StockScannerUI = window.StockScannerUI || {};
window.StockScannerUI.APP_TABS = [["scanner","Scanner"],["portfolio","Portafolio"],["backtest","Backtest"]];
window.StockScannerUI.IndicatorParameters = function IndicatorParameters({indicator,params,onChange}){
  const fields=indicator==='STOCH'?[['p','K',14],['ks','Suavizado',1],['dp','D',3]]:[['p','Rápido',12],['sl','Lento',26],['sg','Señal',9]];
  const name=indicator==='STOCH'?'Estocástico':'MACD';
  return React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}},fields.map(([key,label,fallback])=>
    React.createElement('label',{key,style:{display:'flex',flexDirection:'column',gap:4,flex:'0 0 76px'}},
      React.createElement('span',{style:{fontSize:10,color:'var(--text-2)'}},label),
      React.createElement('input',{type:'number',className:'indicator-parameter-input',min:1,max:200,
        'aria-label':name+': '+label,value:params?.[key]??fallback,
        onChange:e=>onChange({...params,[key]:Number(e.target.value)||1}),
        style:{width:76,minWidth:76,height:36,minHeight:36,padding:'6px 8px',lineHeight:'22px',fontSize:12,
          textAlign:'center',fontFamily:'var(--font-mono)',color:'var(--text-0)',background:'var(--bg-2)',
          border:'1px solid var(--border)',borderRadius:4,appearance:'textfield'}})
    )));
};
const __badgeTone = {
  info:["var(--accent-dim)","rgba(0,180,255,.22)","var(--accent)"],
  success:["var(--status-pass-bg)","var(--status-pass-border)","var(--green)"],
  warning:["var(--panel-warning-bg)","var(--panel-warning-border)","var(--amber)"],
  danger:["var(--status-fail-bg)","var(--status-fail-border)","var(--red)"],
  neutral:["var(--panel-soft-bg)","var(--panel-soft-border)","var(--text-2)"],
};
window.StockScannerUI.UI_STYLES = {
  cd:{background:"var(--card-bg)",border:"1px solid var(--card-border)",borderRadius:"var(--radius)",backdropFilter:"var(--glass)",boxShadow:"var(--shadow-card)"},
  panel:{background:"var(--card-bg)",border:"1px solid var(--card-border)",borderRadius:"var(--radius)",backdropFilter:"var(--glass)",boxShadow:"var(--shadow-card)"},
  panelSoft:{background:"var(--panel-soft-bg)",border:"1px solid var(--panel-soft-border)",borderRadius:"var(--radius)",boxShadow:"none"},
  inp:{height:"var(--control-h)",background:"var(--bg-2)",border:"1px solid var(--border)",color:"var(--text-0)",padding:"7px 10px",borderRadius:"var(--radius-sm)",fontFamily:"var(--font-mono)",fontSize:11,outline:"none",transition:"border-color .16s, box-shadow .16s, background-color .16s"},
  lbl:{fontSize:10,textTransform:"uppercase",letterSpacing:1.5,color:"var(--text-3)",marginBottom:6,fontWeight:600,fontFamily:"var(--font-mono)"},
  btnG:(on)=>({minHeight:"var(--control-h-sm)",padding:"5px 14px",fontSize:10,borderRadius:"var(--radius-sm)",cursor:"pointer",fontFamily:"var(--font-body)",fontWeight:700,background:on?"var(--accent-dim)":"var(--bg-3)",border:"1px solid "+(on?"var(--accent)":"var(--border)"),color:on?"var(--accent)":"var(--text-2)",transition:"all .16s",boxShadow:on?"0 0 0 1px rgba(0,180,255,.08), 0 6px 14px rgba(0,0,0,.10)":"none"}),
  btn:{minHeight:"var(--control-h-sm)",padding:"5px 14px",fontSize:10,borderRadius:"var(--radius-sm)",cursor:"pointer",fontFamily:"var(--font-body)",fontWeight:700,transition:"all .16s"},
  primaryBtn:{minHeight:"var(--control-h)",padding:"7px 15px",fontSize:11,borderRadius:"var(--radius-sm)",cursor:"pointer",fontFamily:"var(--font-body)",fontWeight:800,background:"var(--accent)",border:"1px solid rgba(255,255,255,.16)",color:"#fff",boxShadow:"none"},
  ghostBtn:{minHeight:"var(--control-h-sm)",padding:"5px 12px",fontSize:10,borderRadius:"var(--radius-sm)",cursor:"pointer",fontFamily:"var(--font-body)",fontWeight:700,background:"transparent",border:"1px solid var(--border)",color:"var(--text-2)"},
  dangerBtn:{minHeight:"var(--control-h-sm)",padding:"5px 12px",fontSize:10,borderRadius:"var(--radius-sm)",cursor:"pointer",fontFamily:"var(--font-body)",fontWeight:700,background:"var(--status-fail-bg)",border:"1px solid var(--status-fail-border)",color:"var(--red)"},
  warningBtn:{minHeight:"var(--control-h-sm)",padding:"5px 12px",fontSize:10,borderRadius:"var(--radius-sm)",cursor:"pointer",fontFamily:"var(--font-body)",fontWeight:700,background:"var(--panel-warning-bg)",border:"1px solid var(--panel-warning-border)",color:"var(--amber)"},
  toolbar:{display:"flex",alignItems:"center",flexWrap:"wrap",gap:"var(--space-3)"},
  sectionHeader:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"var(--space-5)",marginBottom:"var(--space-5)"},
  sectionTitle:{fontSize:11,lineHeight:1.2,color:"var(--text-1)",fontFamily:"var(--font-mono)",fontWeight:700,textTransform:"uppercase",letterSpacing:1.6},
  sectionMeta:{fontSize:10,color:"var(--text-muted)",fontFamily:"var(--font-mono)",lineHeight:1.45},
  metricCard:{background:"var(--panel-soft-bg)",border:"1px solid var(--panel-soft-border)",borderRadius:"var(--radius)",padding:"10px 12px",minHeight:48},
  statusBadge:(tone="neutral")=>{
    const t = __badgeTone[tone] || __badgeTone.neutral;
    return {display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,minHeight:20,padding:"2px 8px",borderRadius:999,border:"1px solid "+t[1],background:t[0],color:t[2],fontFamily:"var(--font-mono)",fontSize:10,fontWeight:700};
  },
  progressBar:{height:8,overflow:"hidden",borderRadius:999,border:"1px solid var(--card-border)",background:"var(--bg-2)"},
  progressFill:(pct=0)=>({display:"block",height:"100%",width:Math.max(0,Math.min(100,Number(pct)||0))+"%",minWidth:pct>0?2:0,borderRadius:999,background:"linear-gradient(90deg,var(--accent),var(--green))"}),
  tableWrap:{overflow:"auto",border:"1px solid var(--card-border)",borderRadius:"var(--radius)",background:"var(--panel-soft-bg)"},
  table:{width:"100%",borderCollapse:"separate",borderSpacing:0,fontFamily:"var(--font-mono)",fontSize:10},
  th:{position:"sticky",top:0,zIndex:2,background:"var(--bg-1)",borderBottom:"1px solid var(--card-border)",color:"var(--text-3)",fontWeight:700,letterSpacing:.9,textTransform:"uppercase",padding:"8px 10px",textAlign:"left"},
  td:{borderBottom:"1px solid var(--row-divider)",color:"var(--text-1)",padding:"8px 10px",whiteSpace:"nowrap"},
  emptyState:{display:"flex",minHeight:120,alignItems:"center",justifyContent:"center",textAlign:"center",color:"var(--text-2)",fontFamily:"var(--font-mono)",fontSize:11,border:"1px dashed var(--card-border)",borderRadius:"var(--radius)",background:"var(--panel-soft-bg)",padding:16},
};
window.StockScannerUI.TF_COLORS = {"1mo":"var(--amber)","1wk":"var(--accent)","1d":"var(--green)","4h":"var(--purple)"};
