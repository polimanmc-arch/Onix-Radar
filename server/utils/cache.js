const cache = new Map();

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCache(key, value, ttlMs) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
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

module.exports = { getCache, setCache, hasCache };
