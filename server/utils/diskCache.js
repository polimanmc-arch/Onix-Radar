const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const CACHE_ROOT = process.env.ONIX_DISK_CACHE_DIR
  ? path.resolve(process.env.ONIX_DISK_CACHE_DIR)
  : path.join(__dirname, '..', '..', '.cache');

const MAX_PRUNE_PER_CALL = 250;

function fileFor(namespace, key) {
  const safeNamespace = String(namespace || 'default').replace(/[^a-z0-9_-]/gi, '_');
  const hash = crypto.createHash('sha1').update(String(key)).digest('hex');
  return path.join(CACHE_ROOT, safeNamespace, hash.slice(0, 2), `${hash}.json.gz`);
}

async function getDiskCache(namespace, key) {
  const file = fileFor(namespace, key);
  try {
    const compressed = await fs.readFile(file);
    const raw = await gunzip(compressed);
    const item = JSON.parse(raw.toString('utf8'));
    if (!item || Date.now() > Number(item.expiresAt || 0)) {
      fs.unlink(file).catch(() => {});
      return null;
    }
    return item.value ?? null;
  } catch (_) {
    return null;
  }
}

async function hasDiskCache(namespace, key) {
  const file = fileFor(namespace, key);
  try {
    const compressed = await fs.readFile(file);
    const raw = await gunzip(compressed);
    const item = JSON.parse(raw.toString('utf8'));
    if (!item || Date.now() > Number(item.expiresAt || 0)) {
      fs.unlink(file).catch(() => {});
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

async function setDiskCache(namespace, key, value, ttlMs) {
  if (!Number.isFinite(Number(ttlMs)) || Number(ttlMs) <= 0) return;
  const file = fileFor(namespace, key);
  const dir = path.dirname(file);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify({ expiresAt: Date.now() + Number(ttlMs), value });
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmp, await gzip(Buffer.from(payload, 'utf8')));
    await fs.rename(tmp, file);
  } catch (_) {
    fs.unlink(tmp).catch(() => {});
  }
}

async function getDiskCacheStats(namespace) {
  const safeNamespace = String(namespace || 'default').replace(/[^a-z0-9_-]/gi, '_');
  const root = path.join(CACHE_ROOT, safeNamespace);
  let files = 0;
  let bytes = 0;
  async function walk(dir) {
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch (_) { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        files++;
        try { bytes += (await fs.stat(full)).size; } catch (_) {}
      }
    }
  }
  await walk(root);
  return { namespace: safeNamespace, root, files, bytes };
}

async function pruneDiskCache(namespace) {
  const safeNamespace = String(namespace || 'default').replace(/[^a-z0-9_-]/gi, '_');
  const root = path.join(CACHE_ROOT, safeNamespace);
  let checked = 0;
  let removed = 0;
  async function walk(dir) {
    if (checked >= MAX_PRUNE_PER_CALL) return;
    let entries = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch (_) { return; }
    for (const entry of entries) {
      if (checked >= MAX_PRUNE_PER_CALL) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        checked++;
        try {
          const compressed = await fs.readFile(full);
          const raw = await gunzip(compressed);
          const item = JSON.parse(raw.toString('utf8'));
          if (Date.now() > Number(item.expiresAt || 0)) {
            await fs.unlink(full);
            removed++;
          }
        } catch (_) {}
      }
    }
  }
  await walk(root);
  return { namespace: safeNamespace, checked, removed };
}

module.exports = { getDiskCache, hasDiskCache, setDiskCache, getDiskCacheStats, pruneDiskCache, CACHE_ROOT };
