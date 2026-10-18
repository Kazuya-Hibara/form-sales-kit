// Work dir: config.json / ledger.jsonl / suppress.txt / shots/ / .submit.lock
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jstNow, jstDate, normalizeDomain } from './util.mjs';

export const DEFAULT_CONFIG = { daily_cap: 20, min_gap_sec: 30, headless: true };

// Statuses that mean "this company has (probably) received our message".
// confirm_unclear counts: the click may have gone through, and 1 社 1 回 errs on the safe side.
export const SENT_STATUSES = ['submitted', 'confirm_unclear', 'sent_manual'];

export function workDir() {
  return path.resolve(process.env.FSK_WORK || path.join(os.homedir(), 'form-sales-kit', 'work'));
}

export function ensureWork() {
  const dir = workDir();
  fs.mkdirSync(path.join(dir, 'shots'), { recursive: true });
  const cfg = path.join(dir, 'config.json');
  if (!fs.existsSync(cfg)) fs.writeFileSync(cfg, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
  return dir;
}

export function loadConfig() {
  const file = path.join(workDir(), 'config.json');
  let user = {};
  if (fs.existsSync(file)) user = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...DEFAULT_CONFIG, ...user };
}

const ledgerFile = () => path.join(workDir(), 'ledger.jsonl');
const suppressFile = () => path.join(workDir(), 'suppress.txt');

export function readLedger() {
  const file = ledgerFile();
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim()).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

export function appendLedger(entry) {
  ensureWork();
  const row = { ts: jstNow(), ...entry };
  if (row.domain) row.domain = normalizeDomain(row.domain);
  fs.appendFileSync(ledgerFile(), JSON.stringify(row) + '\n');
  return row;
}

export function ledgerStats(date = jstDate()) {
  const rows = readLedger().filter(r => String(r.ts || '').startsWith(date));
  const counts = {};
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
  const sent = rows.filter(r => SENT_STATUSES.includes(r.status)).length;
  const cfg = loadConfig();
  return { date, counts, sent_today: sent, daily_cap: cfg.daily_cap,
           remaining_today: Math.max(0, cfg.daily_cap - sent), total_rows: rows.length };
}

export function readSuppress() {
  const file = suppressFile();
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').map(l => l.replace(/#.*/, '').trim().toLowerCase())
    .filter(Boolean);
}

export function addSuppress(entry) {
  ensureWork();
  const value = String(entry || '').trim().toLowerCase();
  if (!value) throw new Error('suppress add: domain か email を指定してください');
  const clean = value.includes('@') ? value : normalizeDomain(value);
  if (!readSuppress().includes(clean)) fs.appendFileSync(suppressFile(), clean + '\n');
  return clean;
}

// One submit at a time across processes: the guards read the ledger, so two parallel
// submits could both pass the daily cap / 1 社 1 回 check.
export function acquireLock() {
  ensureWork();
  const file = path.join(workDir(), '.submit.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
      return () => { try { fs.unlinkSync(file); } catch { /* already gone */ } };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const pid = Number(fs.readFileSync(file, 'utf8')) || 0;
      let alive = false;
      try { if (pid) { process.kill(pid, 0); alive = true; } } catch { alive = false; }
      if (alive) return null;
      fs.unlinkSync(file);                       // stale lock from a crashed run
    }
  }
  return null;
}
