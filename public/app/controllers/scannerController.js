// scannerController.js — scanner-specific controller helpers.
window.StockScannerControllers = window.StockScannerControllers || {};

window.StockScannerControllers.createScannerSortHandler = function(sortK, setSortK, setSortD){
  return function(k){
    if(sortK===k) setSortD(d=>-d);
    else { setSortK(k); setSortD(1); }
  };
};

window.StockScannerControllers.createScannerExportHandler = function(exportScanCsv, shown, filters, INDICATORS){
  return function(){ return exportScanCsv(shown, filters, INDICATORS); };
};
