(function(){
  function makeId(){ return Math.random(); }
  function newFilter(){ return {_id:makeId(),ind:"WMA",params:{p:30},tf:"1wk",op:">",cmpType:"prev",cmpVal:0,cmpInd:"SMA",cmpParams:{p:50}}; }
  function newCond(){ return {_id:makeId(),ind:"WMA",params:{p:30},tf:"1wk",op:">",cmpType:"prev",cmpVal:0,cmpInd:"SMA",cmpParams:{p:50}}; }
  function newGroup(){ return {_id:makeId(),conditions:[newCond()]}; }

  function defaultLongFilters(){
    return [
      {...newFilter(),ind:"WMA",params:{p:30},tf:"1wk",op:">",cmpType:"prev"},
      {...newFilter(),ind:"RSI",params:{p:4},tf:"1wk",op:"<",cmpType:"val",cmpVal:35},
      {...newFilter(),ind:"STOCH",params:{p:1,ks:1,dp:1},tf:"1wk",op:"<",cmpType:"val",cmpVal:20},
    ];
  }

  function defaultShortFilters(){
    return [
      {...newFilter(),ind:"WMA",params:{p:30},tf:"1wk",op:"<",cmpType:"prev"},
      {...newFilter(),ind:"RSI",params:{p:4},tf:"1wk",op:">",cmpType:"val",cmpVal:65},
      {...newFilter(),ind:"STOCH",params:{p:1,ks:1,dp:1},tf:"1wk",op:">",cmpType:"val",cmpVal:80},
    ];
  }

  function defaultEntryRules(){
    return [{_id:makeId(),conditions:[
      {...newCond(),ind:"WMA",params:{p:30},op:">",cmpType:"prev"},
      {...newCond(),ind:"RSI",params:{p:4},op:"<",cmpType:"val",cmpVal:35},
      {...newCond(),ind:"STOCH",params:{p:1,ks:1,dp:1},tf:"1wk",op:"<",cmpType:"val",cmpVal:20},
    ]}];
  }

  function defaultExitRules(){
    return [
      {_id:makeId(),conditions:[
        {...newCond(),ind:"WMA",params:{p:30},op:"<",cmpType:"prev"},
      ]},
      {_id:makeId(),conditions:[
        {...newCond(),ind:"RSI",params:{p:4},op:">",cmpType:"val",cmpVal:65},
        {...newCond(),ind:"STOCH",params:{p:1,ks:1,dp:1},tf:"1wk",op:">",cmpType:"val",cmpVal:80},
      ]},
    ];
  }

  function defaultShortEntryRules(){
    return [{_id:makeId(),conditions:[
      {...newCond(),ind:"WMA",params:{p:30},tf:"1wk",op:"<",cmpType:"prev"},
      {...newCond(),ind:"RSI",params:{p:4},tf:"1wk",op:">",cmpType:"val",cmpVal:65},
      {...newCond(),ind:"STOCH",params:{p:1,ks:1,dp:1},tf:"1wk",op:">",cmpType:"val",cmpVal:80},
    ]}];
  }

  function defaultShortExitRules(){
    return [
      {_id:makeId(),conditions:[
        {...newCond(),ind:"WMA",params:{p:30},tf:"1wk",op:">",cmpType:"prev"},
      ]},
      {_id:makeId(),conditions:[
        {...newCond(),ind:"RSI",params:{p:4},tf:"1wk",op:"<",cmpType:"val",cmpVal:35},
        {...newCond(),ind:"STOCH",params:{p:1,ks:1,dp:1},tf:"1wk",op:"<",cmpType:"val",cmpVal:20},
      ]},
    ];
  }

  window.StockScannerState = Object.assign(window.StockScannerState||{}, {
    newFilter,
    newCond,
    newGroup,
    defaultLongFilters,
    defaultShortFilters,
    defaultEntryRules,
    defaultExitRules,
    defaultShortEntryRules,
    defaultShortExitRules,
    DEFAULT_PORTFOLIO_MANUAL_TICKERS: "AAPL, MSFT, NVDA, AMZN, GOOGL",
  });
})();
