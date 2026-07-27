// store.js — a zero-dependency JSON file datastore.
// Every "table" is a JSON file under /data. Writes are atomic (write to temp file, then rename)
// so a crash mid-write can't corrupt data. Good enough for a single small-business site;
// swap for SQLite/Postgres later if traffic ever demands it.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readTable(name, fallback) {
  ensureDataDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) {
    writeTable(name, fallback);
    return fallback;
  }
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[store] Failed to read ${name}.json, restoring fallback:`, err.message);
    writeTable(name, fallback);
    return fallback;
  }
}

function writeTable(name, data) {
  ensureDataDir();
  const fp = filePath(name);
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, fp); // atomic on POSIX filesystems
}

module.exports = { readTable, writeTable, ensureDataDir, DATA_DIR };
