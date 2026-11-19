// Acceso opcional a Yahoo Finance mediante la librería yahoo-finance2 (MIT).
// Gestiona la cookie y el "crumb" que Yahoo exige desde 2023 para /v7/quote y /v10/quoteSummary;
// sin ellos esas llamadas fallan y se pierden cotizaciones, fundamentales e industria.
// Sólo se usa con Node >= 22 (requisito de la librería). Con versiones anteriores, o si se
// desactiva con ONIX_YF2=0, el cliente propio sigue funcionando como hasta ahora.
const MIN_NODE = 22;
let client = null;
let unavailable = null;

function nodeMajor(){ return Number(String(process.versions.node).split('.')[0]) || 0; }

function getClient(){
  if(client || unavailable) return client;
  if(process.env.ONIX_YF2 === '0'){ unavailable = 'desactivado con ONIX_YF2=0'; return null; }
  if(nodeMajor() < MIN_NODE){ unavailable = `requiere Node ${MIN_NODE}+ (actual ${process.versions.node})`; return null; }
  try{
    const mod = require('yahoo-finance2');
    const YahooFinance = mod.default || mod;
    client = typeof YahooFinance === 'function'
      ? new YahooFinance({ suppressNotices: ['yahooSurvey'] })
      : YahooFinance;
  }catch(error){
    unavailable = `no se pudo cargar yahoo-finance2: ${error.code || error.message}`;
  }
  return client;
}

// Sin validación estricta de esquema: un campo nuevo de Yahoo no debe tumbar la consulta.
const LOOSE = { validateResult: false };

async function quote(symbols){
  const yf = getClient();
  if(!yf || !symbols?.length) return null;
  try{
    const res = await yf.quote(symbols, { return: 'array' }, LOOSE);
    return Array.isArray(res) ? res : res ? [res] : [];
  }catch(_){ return null; }
}

async function quoteSummary(symbol, modules){
  const yf = getClient();
  if(!yf) return null;
  try{ return await yf.quoteSummary(symbol, { modules }, LOOSE); }
  catch(_){ return null; }
}

function status(){
  getClient();
  return { available: Boolean(client), reason: unavailable, node: process.versions.node };
}

module.exports = { quote, quoteSummary, status, MIN_NODE };
