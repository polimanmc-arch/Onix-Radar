window.StockScannerConfig = window.StockScannerConfig || {};
window.StockScannerConfig.TIMEFRAMES = [
  {id:"1mo",label:"Mensual (1M)",yahooInterval:"1mo",yahooRange:"10y",unit:"meses",ppy:12},
  {id:"1wk",label:"Semanal (1W)",yahooInterval:"1wk",yahooRange:"5y",unit:"semanas",ppy:52},
  {id:"1d",label:"Diario (1D)",yahooInterval:"1d",yahooRange:"5y",unit:"días",ppy:252},
  {id:"4h",label:"4 Horas (4H)",yahooInterval:"1h",yahooRange:"730d",unit:"velas 4H",aggregateFactor:4,ppy:252*6.5/4},
];
