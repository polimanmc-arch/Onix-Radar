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

];
window.StockScannerConfig.DIR_OPTIONS = [
  {id:"long",label:"Solo Long"},
  {id:"short",label:"Solo Short"}
];
