window.StockScannerConfig = window.StockScannerConfig || {};
window.StockScannerConfig.INDICATORS = [
  // Tendencia / momentum clásico
  {id:"WMA",label:"WMA (Ponderada)",param:30,category:"Precio y estructura"},
  {id:"SMA",label:"SMA (Simple)",param:20,category:"Precio y estructura"},
  {id:"EMA",label:"EMA (Exponencial)",param:20,category:"Precio y estructura"},
  {id:"RSI",label:"RSI",param:14,category:"Precio y estructura"},
  {id:"STOCH",label:"Estocástico %K",param:14,extra:true,category:"Precio y estructura"},
  {id:"MACD",label:"MACD Histograma",param:12,extra:true,category:"Precio y estructura"},

  // Precio y estructura
  {id:"PRICE",label:"Precio Cierre",param:null,category:"Precio y estructura"},
  {id:"CHG",label:"Cambio % diario",param:null,category:"Precio y estructura"},
  {id:"GAP",label:"Gap %",param:null,category:"Precio y estructura"},
  {id:"DIST_HIGH",label:"Distancia a máximo",param:20,category:"Precio y estructura"},
  {id:"DIST_LOW",label:"Distancia a mínimo",param:20,category:"Precio y estructura"},
  {id:"ATR",label:"ATR",param:14,category:"Precio y estructura"},
  {id:"ADR_PCT",label:"ADR %",param:20,category:"Precio y estructura"},

  // Volumen y liquidez
  {id:"VOL",label:"Volumen del día",param:null,category:"Volumen y liquidez"},
  {id:"AVG_VOL",label:"Volumen promedio",param:20,category:"Volumen y liquidez"},
  {id:"RVOL",label:"Relative Volume (RVOL)",param:20,category:"Volumen y liquidez"},
  {id:"DOLLAR_VOL",label:"Dollar Volume",param:null,category:"Volumen y liquidez"},

  // Calidad del movimiento
  {id:"GREEN_COUNT",label:"Velas verdes en N barras",param:10,category:"Calidad del movimiento"},
  {id:"RED_COUNT",label:"Velas rojas en N barras",param:10,category:"Calidad del movimiento"},
  {id:"CONSEC_UP",label:"Barras alcistas consecutivas",param:null,category:"Calidad del movimiento"},
  {id:"CONSEC_DN",label:"Barras bajistas consecutivas",param:null,category:"Calidad del movimiento"},
  {id:"EXT_EMA_PCT",label:"Extensión sobre EMA %",param:20,category:"Calidad del movimiento"},
  {id:"EXT_VWAP_PCT",label:"Extensión sobre VWAP %",param:null,category:"Calidad del movimiento"},

  // Fundamentales: dato actual de Yahoo (no histórico). Sólo scanner y alertas.
  {id:"PE",label:"PER (P/E)",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"FWD_PE",label:"PER estimado (forward)",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"PS",label:"Precio / Ventas",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"PB",label:"Precio / Valor contable",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"EV_EBITDA",label:"EV / EBITDA",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"DEBT_EQUITY",label:"Deuda / Patrimonio (%)",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"CURRENT_RATIO",label:"Ratio de liquidez",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"ROE",label:"ROE %",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"ROA",label:"ROA %",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"GROSS_MARGIN",label:"Margen bruto %",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"OPER_MARGIN",label:"Margen operativo %",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"REV_GROWTH",label:"Crecimiento de ingresos %",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"EPS_GROWTH",label:"Crecimiento de beneficios %",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},
  {id:"FCF_YIELD",label:"Rentabilidad flujo de caja libre %",param:null,category:"Fundamentales",meta:true,supportsIgnoreMissing:true},

  // Perfil y propiedad
  {id:"MARKET_CAP",label:"Capitalización (millones $)",param:null,category:"Perfil y propiedad",meta:true,supportsIgnoreMissing:true},
  {id:"FLOAT",label:"Acciones en float (millones)",param:null,category:"Perfil y propiedad",meta:true,supportsIgnoreMissing:true},
  {id:"SHARES_OUT",label:"Acciones en circulación (millones)",param:null,category:"Perfil y propiedad",meta:true,supportsIgnoreMissing:true},
  {id:"BETA",label:"Beta",param:null,category:"Perfil y propiedad",meta:true,supportsIgnoreMissing:true},
  {id:"SHORT_INT_PCT",label:"Posiciones cortas % del float",param:null,category:"Perfil y propiedad",meta:true,supportsIgnoreMissing:true},
  {id:"INST_OWN_PCT",label:"Propiedad institucional %",param:null,category:"Perfil y propiedad",meta:true,supportsIgnoreMissing:true},
  {id:"INSIDER_OWN_PCT",label:"Propiedad de directivos %",param:null,category:"Perfil y propiedad",meta:true,supportsIgnoreMissing:true},
  {id:"SECTOR",label:"Sector",param:null,category:"Perfil y propiedad",meta:true,metaType:"text"},
  {id:"INDUSTRY",label:"Industria",param:null,category:"Perfil y propiedad",meta:true,metaType:"text"},
  {id:"COUNTRY",label:"País",param:null,category:"Perfil y propiedad",meta:true,metaType:"text"},
  {id:"EXCHANGE",label:"Bolsa",param:null,category:"Perfil y propiedad",meta:true,metaType:"text"},

];
window.StockScannerConfig.DIR_OPTIONS = [
  {id:"long",label:"Solo Long"},
  {id:"short",label:"Solo Short"}
];
