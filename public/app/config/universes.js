window.StockScannerConfig = window.StockScannerConfig || {};

// ── US presets ──────────────────────────────────────────────────────────────
// Composición actual del S&P 500: se toma de sp500History.js (generado con
// scripts/build-sp500-history.js), que debe cargarse antes que este archivo. Así la lista del
// scanner y el universo histórico del backtest salen de la misma fuente y se actualizan juntos.
window.StockScannerConfig.SP500 = (window.StockScannerConfig.SP500_HISTORY?.currentMembers || []).slice();
window.StockScannerConfig.NASDAQ100 = ["AAPL","ABNB","ADBE","ADI","ADP","ADSK","AEP","AMAT","AMD","AMGN","AMZN","ANSS","ARM","ASML","AVGO","AZN","BIIB","BKNG","BKR","CDNS","CDW","CEG","CHTR","CMCSA","COST","CPRT","CRWD","CSCO","CSGP","CSX","CTAS","CTSH","DASH","DDOG","DLTR","DXCM","EA","EXC","FANG","FAST","FTNT","GEHC","GFS","GILD","GOOG","GOOGL","HON","IDXX","ILMN","INTC","INTU","ISRG","KDP","KHC","KLAC","LRCX","LULU","MAR","MCHP","MDB","MDLZ","MELI","META","MNST","MRNA","MRVL","MSFT","MU","NFLX","NVDA","NXPI","ODFL","ON","ORLY","PANW","PAYX","PCAR","PDD","PEP","PYPL","QCOM","REGN","ROST","SBUX","SMCI","SNPS","TEAM","TMUS","TSLA","TTD","TTWO","TXN","VRSK","VRTX","WBD","WDAY","XEL","ZS"];
window.StockScannerConfig.DOW30 = ["AAPL","AMGN","AXP","BA","CAT","CRM","CSCO","CVX","DIS","DOW","GS","HD","HON","IBM","INTC","JNJ","JPM","KO","MCD","MMM","MRK","MSFT","NKE","PG","SHW","TRV","UNH","V","VZ","WMT"];

// ── Europe presets based on major index components ─────────────────────────
window.StockScannerConfig.UK_FTSE100 = ["III","ADM","AAF","ALW","AAL","ANTO","ABF","AZN","AUTO","AV","BAB","BA","BARC","BTRW","BEZ","BKG","BP","BATS","BLND","BT.A","BNZL","BRBY","CNA","CCEP","CCH","CPG","CTEC","CRDA","DCC","DGE","DPLM","EDV","ENT","EXPN","FCIT","FRES","GAW","GLEN","GSK","HLN","HLMA","HSX","HWDN","HSBA","IMB","INF","IHG","IIII","ITRK","JD.","KGF","LAND","LGEN","LIO","LLOY","LMP","LSEG","MNG","MKS","MRO","MTLN","MNDI","NG.","NWG","NXT","PSON","PSN","PHNX","PCT","PRU","RKT","REL","RTO","RMV","RIO","RR.","SBRY","SGE","SHEL","SMIN","SN.","SPX","SSE","STAN","STJ","SVT","TSCO","ULVR","UU.","VOD","WEIR","WTB","WPP"];
window.StockScannerConfig.GERMANY_DAX = ["ADS.DE","AIR.PA","ALV.DE","BAS.DE","BAYN.DE","BEI.DE","BMW.DE","BNR.DE","CBK.DE","CON.DE","DTG.DE","DBK.DE","DB1.DE","DHL.DE","DTE.DE","EOAN.DE","FRE.DE","FME.DE","G1A.DE","HNR1.DE","HEI.DE","HEN3.DE","IFX.DE","MBG.DE","MRK.DE","MUV2.DE","P911.DE","PAH3.DE","QIA.DE","RHM.DE","RWE.DE","SAP.DE","SRT3.DE","SIE.DE","ENR.DE","SHL.DE","SY1.DE","VOW3.DE","VNA.DE","ZAL.DE"];
window.StockScannerConfig.FRANCE_CAC40 = ["AC.PA","AI.PA","AIR.PA","MT.AS","CS.PA","BNP.PA","EN.PA","BVI.PA","CAP.PA","CA.PA","ACA.PA","BN.PA","DSY.PA","EDEN.PA","ENGI.PA","EL.PA","ERF.PA","RMS.PA","KER.PA","OR.PA","LR.PA","MC.PA","ML.PA","ORA.PA","RI.PA","PUB.PA","RNO.PA","SAF.PA","SGO.PA","SAN.PA","SU.PA","GLE.PA","STLAP.PA","STMPA.PA","TEP.PA","HO.PA","TTE.PA","URW.PA","VIE.PA","DG.PA"];
window.StockScannerConfig.SPAIN_IBEX35 = ["ACS.MC","ACX.MC","AMS.MC","ANA.MC","ANE.MC","BBVA.MC","BKT.MC","CABK.MC","CLNX.MC","COL.MC","AENA.MC","ELE.MC","ENG.MC","FDR.MC","FER.MC","GRF.MC","IAG.MC","IBE.MC","IDR.MC","ITX.MC","LOG.MC","MAP.MC","MRL.MC","MTS.MC","NTGY.MC","PUIG.MC","RED.MC","REP.MC","ROVI.MC","SAB.MC","SAN.MC","SCYR.MC","SLR.MC","TEF.MC","UNI.MC"];
window.StockScannerConfig.ITALY_FTSEMIB = ["A2A.MI","AMP.MI","AVIO.MI","AZM.MI","BMED.MI","BMPS.MI","BAMI.MI","BPE.MI","BC.MI","BZU.MI","CPR.MI","DIA.MI","ENEL.MI","ENI.MI","RACE.MI","FCT.MI","FBK.MI","G.MI","HER.MI","ISP.MI","INW.MI","IG.MI","IVG.MI","LDO.MI","LTMC.MI","MB.MI","MONC.MI","NEXI.MI","PST.MI","PRY.MI","REC.MI","SPM.MI","SRG.MI","STLAM.MI","STMMI.MI","TIT.MI","TEN.MI","TRN.MI","UCG.MI","UNI.MI"];
window.StockScannerConfig.NETHERLANDS_AEX = ["ABN.AS","ADYEN.AS","AGN.AS","AD.AS","AKZA.AS","MT.AS","ASM.AS","ASML.AS","ASRNL.AS","BESI.AS","DSFIR.AS","EXO.AS","HEIA.AS","IMCD.AS","INGA.AS","KPN.AS","NN.AS","PHIA.AS","PRX.AS","RAND.AS","REN.AS","SHELL.AS","UMG.AS","UNA.AS","WKL.AS"];
window.StockScannerConfig.SWITZERLAND_SMI = ["NESN.SW","ROG.SW","NOVN.SW","CFR.SW","ZURN.SW","UBSG.SW","ABBN.SW","LONN.SW","SIKA.SW","ALC.SW","GIVN.SW","HOLN.SW","SCMN.SW","PGHN.SW","SREN.SW","SOON.SW","GEBN.SW","SLHN.SW","LOGN.SW","KNIN.SW"];
window.StockScannerConfig.SWEDEN_OMX30 = ["ABB.ST","ADDT-B.ST","ALFA.ST","ASSA-B.ST","AZN.ST","ATCO-A.ST","BOL.ST","EPI-A.ST","EQT.ST","ERIC-B.ST","ESSITY-B.ST","EVO.ST","SHB-A.ST","HM-B.ST","HEXA-B.ST","INDU-C.ST","INVE-B.ST","LIFCO-B.ST","NIBE-B.ST","NDA-SE.ST","SAAB-B.ST","SAND.ST","SCA-B.ST","SEB-A.ST","SKA-B.ST","SKF-B.ST","SWED-A.ST","TEL2-B.ST","TELIA.ST","VOLV-B.ST"];
window.StockScannerConfig.DENMARK_OMXC25 = ["MAERSK-A.CO","MAERSK-B.CO","AMBU-B.CO","BAVA.CO","CARL-B.CO","COLO-B.CO","DANSKE.CO","DEMANT.CO","DSV.CO","GMAB.CO","GN.CO","ISS.CO","JYSK.CO","NKT.CO","NDA-DK.CO","NOVO-B.CO","NSIS-B.CO","PNDORA.CO","ROCK-B.CO","RBREW.CO","SYDB.CO","TRYG.CO","VWS.CO","ZEAL.CO","ORSTED.CO"];
window.StockScannerConfig.NORWAY_OBX = ["EQNR.OL","DNB.OL","NHY.OL","TEL.OL","YAR.OL","SALM.OL","MOWI.OL","AKERBP.OL","TOM.OL","ORK.OL"];
window.StockScannerConfig.FINLAND_OMXH25 = ["NOKIA.HE","KNEBV.HE","SAMPO.HE","FORTUM.HE","NESTE.HE","UPM.HE","ELISA.HE","STERV.HE","OUT1V.HE","WRT1V.HE"];
window.StockScannerConfig.BELGIUM_BEL20 = ["ABI.BR","ACKB.BR","AED.BR","AGS.BR","ARGX.BR","AZE.BR","COFB.BR","DIE.BR","ELI.BR","GBLB.BR","KBC.BR","LOTB.BR","MELE.BR","MONT.BR","SOF.BR","SOLB.BR","SYENS.BR","UCB.BR","UMI.BR","WDP.BR"];
window.StockScannerConfig.PORTUGAL_PSI = ["EDP.LS","GALP.LS","JMT.LS","BCP.LS","SON.LS","RENE.LS","EDPR.LS","NVG.LS","SEM.LS"];
window.StockScannerConfig.AUSTRIA_ATX = ["EBS.VI","OMV.VI","VER.VI","VOE.VI","BAWAG.VI","ERST.VI","ANDR.VI","MMK.VI","CAI.VI","LNZ.VI"];

(function(){
  const cfg = window.StockScannerConfig;
  const uniq = arr => [...new Set((arr||[]).filter(Boolean))];
  const lse = ticker => `${String(ticker).replace(/\.$/,'').replace(/\./g,'-')}.L`;

  cfg.UK_FTSE100 = [
    "III","AAF","AAL","ABF","ADM","AHT","ANTO","AUTO","AV","AZN","BA","BARC","BATS","BEZ","BKG","BLND",
    "BNZL","BP","BRBY","BT.A","CCH","CNA","CPG","CRDA","DCC","DGE","DPLM","EDV","ENT","EXPN","FCIT",
    "FRES","GAW","GLEN","GSK","HLMA","HLN","HSBA","HSX","HWDN","IHG","IMB","INF","ITRK","JD.","KGF",
    "LAND","LGEN","LIO","LLOY","LMP","LSEG","MKS","MNG","MNDI","MRO","MTLN","NG.","NWG","NXT","PCT",
    "PHNX","PRU","PSN","PSON","RKT","REL","RIO","RMV","RR.","RTO","SBRY","SGE","SHEL","SMIN","SN.",
    "SPX","SSE","STAN","STJ","SVT","TSCO","ULVR","UU.","VOD","WEIR","WPP","WTB","BME","SGRO","TW.",
    "EZJ","FRAS","HIK","HMSO","ICG","IMI","ITV","MAB","PNN"
  ].map(lse);

  cfg.NORWAY_OBX = [
    "AKRBP.OL","BWLPG.OL","DNB.OL","EQNR.OL","FRO.OL","GJF.OL","AKER.OL","HAFNI.OL","HAUTO.OL","KOG.OL",
    "MOWI.OL","MPCC.OL","NOD.OL","NHY.OL","NAS.OL","ORK.OL","SALM.OL","STB.OL","SUBC.OL","TEL.OL",
    "TGS.OL","TOM.OL","VAR.OL","WAWI.OL","YAR.OL"
  ];
  cfg.FINLAND_OMXH25 = [
    "NOKIA.HE","KNEBV.HE","SAMPO.HE","FORTUM.HE","NESTE.HE","UPM.HE","ELISA.HE","STERV.HE","OUT1V.HE","WRT1V.HE",
    "VALMT.HE","METSO.HE","TYRES.HE","HUH1V.HE","KESKOB.HE","KOJAMO.HE","ORNBV.HE","NDA-FI.HE","CTY1S.HE","QTCOM.HE",
    "PUUILO.HE","HARVIA.HE","TIETO.HE","MANTA.HE","SSABAH.HE"
  ];
  cfg.PORTUGAL_PSI = [
    "GALP.LS","JMT.LS","EDP.LS","ALTR.LS","BCP.LS","NVG.LS","EGL.LS","RENE.LS","SEM.LS","SON.LS",
    "NOS.LS","EDPR.LS","COR.LS","IBS.LS","TDSA.LS","CTT.LS","PHR.LS","RAM.LS","CDU.LS","MCP.LS"
  ];
  cfg.AUSTRIA_ATX = [
    "ANDR.VI","EBS.VI","EVN.VI","OMV.VI","RBI.VI","PAL.VI","SBO.VI","VOE.VI","VER.VI","WIE.VI",
    "UQA.VI","CAI.VI","POST.VI","STR.VI","VIG.VI","DOC.VI","LNZ.VI","ATS.VI","POS.VI","BG.VI"
  ];

  cfg.RUSSELL2000_TOP = [
    "BE","CRDO","FN","CDE","NXT","SATS","IONQ","RMBS","STRL","AEIS","TTMI","MOD","SITM","DY","KTOS",
    "HL","FORM","BBIO","GH","SPXC","VIAV","ENSG","PL","ARWR","SMTC"
  ];
  cfg.MARKET_INDICES = ["^GSPC","^IXIC","^DJI","^RUT","^RUI","^FTSE","^GDAXI","^FCHI","^IBEX","^STOXX50E","^N225","^HSI","^VIX"];
  cfg.COMMODITIES = ["GC=F","GLD","IAU","SI=F","SLV","CL=F","BZ=F","HG=F"];
  cfg.BONDS_TREASURIES = ["TLT","IEF","SHY","IEI","BIL","SGOV","TLH","ZB=F","ZN=F","ZF=F","ZT=F","^TNX","^TYX","^FVX","^IRX"];
  cfg.MACRO_ASSETS = uniq([...cfg.MARKET_INDICES, ...cfg.COMMODITIES, ...cfg.BONDS_TREASURIES, "IWM"]);

  cfg.EUROPE_MAJOR_INDICES_COMPONENTS = uniq([
    ...cfg.UK_FTSE100,
    ...cfg.GERMANY_DAX,
    ...cfg.FRANCE_CAC40,
    ...cfg.SPAIN_IBEX35,
    ...cfg.ITALY_FTSEMIB,
    ...cfg.NETHERLANDS_AEX,
    ...cfg.SWITZERLAND_SMI,
    ...cfg.SWEDEN_OMX30,
    ...cfg.DENMARK_OMXC25,
    ...cfg.NORWAY_OBX,
    ...cfg.FINLAND_OMXH25,
    ...cfg.BELGIUM_BEL20,
    ...cfg.PORTUGAL_PSI,
    ...cfg.AUSTRIA_ATX,
  ]);

  cfg.US_INDEX_COMPONENTS = uniq([...cfg.SP500, ...cfg.NASDAQ100, ...cfg.DOW30, ...cfg.RUSSELL2000_TOP]);
  cfg.ALL_INDEX_COMPANIES = uniq([...cfg.US_INDEX_COMPONENTS, ...cfg.EUROPE_MAJOR_INDICES_COMPONENTS]);
  cfg.GLOBAL_FULL_UNIVERSE = uniq([...cfg.ALL_INDEX_COMPANIES, ...cfg.MACRO_ASSETS]);

  cfg.UNIVERSE_PRESETS = {
    SP500: { label:'S&P 500', tickers: cfg.SP500, group:'us' },
    NASDAQ100: { label:'NASDAQ 100', tickers: cfg.NASDAQ100, group:'us' },
    DOW30: { label:'Dow 30', tickers: cfg.DOW30, group:'us' },
    RUSSELL2000_TOP: { label:'Russell 2000 Top', tickers: cfg.RUSSELL2000_TOP, group:'us' },
    ALL: { label:'Combinado US', tickers: cfg.US_INDEX_COMPONENTS, group:'us' },

    EUROPE_MAJOR_INDICES_COMPONENTS: { label:'Europa', tickers: cfg.EUROPE_MAJOR_INDICES_COMPONENTS, group:'europe' },
    UK_FTSE100: { label:'FTSE 100', tickers: cfg.UK_FTSE100, group:'europe' },
    GERMANY_DAX: { label:'DAX', tickers: cfg.GERMANY_DAX, group:'europe' },
    FRANCE_CAC40: { label:'CAC 40', tickers: cfg.FRANCE_CAC40, group:'europe' },
    SPAIN_IBEX35: { label:'IBEX 35', tickers: cfg.SPAIN_IBEX35, group:'europe' },
    ITALY_FTSEMIB: { label:'FTSE MIB', tickers: cfg.ITALY_FTSEMIB, group:'europe' },
    NETHERLANDS_AEX: { label:'AEX', tickers: cfg.NETHERLANDS_AEX, group:'europe' },
    SWITZERLAND_SMI: { label:'SMI', tickers: cfg.SWITZERLAND_SMI, group:'europe' },
    SWEDEN_OMX30: { label:'OMX Stockholm 30', tickers: cfg.SWEDEN_OMX30, group:'europe' },
    DENMARK_OMXC25: { label:'OMX Copenhagen 25', tickers: cfg.DENMARK_OMXC25, group:'europe' },
    NORWAY_OBX: { label:'OBX', tickers: cfg.NORWAY_OBX, group:'europe' },
    FINLAND_OMXH25: { label:'OMX Helsinki 25', tickers: cfg.FINLAND_OMXH25, group:'europe' },
    BELGIUM_BEL20: { label:'BEL 20', tickers: cfg.BELGIUM_BEL20, group:'europe' },
    PORTUGAL_PSI: { label:'PSI', tickers: cfg.PORTUGAL_PSI, group:'europe' },
    AUSTRIA_ATX: { label:'ATX', tickers: cfg.AUSTRIA_ATX, group:'europe' },

    ALL_INDEX_COMPANIES: { label:'Todas empresas indices', tickers: cfg.ALL_INDEX_COMPANIES, group:'global' },
    GLOBAL_FULL_UNIVERSE: { label:'Universo completo', tickers: cfg.GLOBAL_FULL_UNIVERSE, group:'global' },

    MARKET_INDICES: { label:'Indices', tickers: cfg.MARKET_INDICES, group:'assets' },
    COMMODITIES: { label:'Oro y materias primas', tickers: cfg.COMMODITIES, group:'assets' },
    BONDS_TREASURIES: { label:'Bonos y notas', tickers: cfg.BONDS_TREASURIES, group:'assets' },
    MACRO_ASSETS: { label:'Activos macro', tickers: cfg.MACRO_ASSETS, group:'assets' },
  };

  cfg.UNIVERSE_GROUPS = [
    { id:'us', label:'EE. UU.' },
    { id:'europe', label:'Europa' },
    { id:'global', label:'Global' },
    { id:'assets', label:'Activos' },
  ];
})();
