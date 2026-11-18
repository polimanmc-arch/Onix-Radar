// Envío a Telegram con la Bot API. El token y el chat nunca llegan al navegador:
// se leen de las variables de entorno TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID
// (secretos de Streamlit Cloud o de GitHub Actions).
const API = 'https://api.telegram.org';

function telegramConfig(env = process.env){
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();
  return { token, chatId, configured: Boolean(token && chatId) };
}

async function sendTelegramMessages(messages, { env = process.env, fetchImpl = fetch, timeoutMs = 15000 } = {}){
  const { token, chatId, configured } = telegramConfig(env);
  if(!configured) throw Object.assign(new Error('Telegram no está configurado (faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID).'), { status: 503 });
  const sent = [];
  for(const text of messages){
    const res = await fetchImpl(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => ({}));
    if(!res.ok || json.ok === false){
      // Nunca incluir el token en el error.
      throw Object.assign(new Error(`Telegram respondió ${res.status}: ${json.description || 'error'}`), { status: 502 });
    }
    sent.push(json.result?.message_id ?? null);
  }
  return sent;
}

module.exports = { telegramConfig, sendTelegramMessages };
