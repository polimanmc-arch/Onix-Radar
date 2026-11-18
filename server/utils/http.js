const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "application/json",
};

async function fetchJson(url, { timeoutMs = 10000, headers = {} } = {}) {
  const response = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function fetchText(url, { timeoutMs = 10000, headers = {}, accept = "text/html,application/xhtml+xml" } = {}) {
  const response = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, Accept: accept, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    const error = new Error(`Request failed: ${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return response.text();
}

module.exports = { fetchJson, fetchText, DEFAULT_HEADERS };
