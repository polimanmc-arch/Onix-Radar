// Caché en memoria con caducidad y tamaño máximo (LRU).
// Sin límite, un proceso que vive días acumulaba miles de gráficos caducados que nadie volvía a
// pedir (sólo se borraban al leerlos) hasta agotar la memoria del alojamiento.
const MAX_ENTRIES = Math.max(50, Number(process.env.ONIX_MEMORY_CACHE_MAX) || 1500);
const SWEEP_EVERY = 200;
const cache = new Map();
let writes = 0;

function sweepExpired(now = Date.now()) {
  for (const [key, item] of cache) if (now > item.expiresAt) cache.delete(key);
}

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Reinsertar para marcarla como usada recientemente (el Map conserva el orden de inserción).
  cache.delete(key);
  cache.set(key, item);
  return item.value;
}

function setCache(key, value, ttlMs) {
  cache.delete(key);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (++writes % SWEEP_EVERY === 0) sweepExpired();
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

function hasCache(key) {
  const item = cache.get(key);
  if (!item) return false;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return false;
  }
  return true;
}

function cacheSize() { return cache.size; }

module.exports = { getCache, setCache, hasCache, cacheSize, MAX_ENTRIES };
