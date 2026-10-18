// Small shared helpers: domain keys, JST time, CLI args, JSON output.
import { createHash } from 'node:crypto';

export function normalizeDomain(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('@') && !raw.includes('://')) raw = raw.split('@').pop();
  if (!raw.includes('://')) raw = 'http://' + raw;
  let host = '';
  try { host = new URL(raw).hostname.toLowerCase(); } catch { return ''; }
  return host.startsWith('www.') ? host.slice(4) : host;
}

// a.example.co.jp and example.co.jp are the same company for our purposes.
export function sameSite(a, b) {
  const x = normalizeDomain(a), y = normalizeDomain(b);
  if (!x || !y) return false;
  return x === y || x.endsWith('.' + y) || y.endsWith('.' + x);
}

// Hosted form services: the form URL's host says nothing about which company it is.
export const SHARED_FORM_HOSTS = [
  'form.run', 'docs.google.com', 'forms.gle', 'forms.office.com', 'hsforms.com', 'hsforms.net',
  'share.hsforms.com', 'form-mailer.jp', 'ssl.form-mailer.jp', 'tayori.com', 'formzu.net',
  'secure.formzu.net', 'f.msgs.jp', 'pro.form-mailer.jp', 'jotform.com', 'typeform.com',
  'formstack.com', 'wufoo.com', 'kintoneapp.com', 'cybozu.com',
];

export function isSharedFormHost(url) {
  const host = normalizeDomain(url);
  return SHARED_FORM_HOSTS.some(h => host === h || host.endsWith('.' + h));
}

export function jstNow(date = new Date()) {
  const t = new Date(date.getTime() + 9 * 3600 * 1000);
  return t.toISOString().replace(/\.\d{3}Z$/, '+09:00');
}

export function jstDate(date = new Date()) {
  return jstNow(date).slice(0, 10);
}

export function stamp(date = new Date()) {
  return jstNow(date).slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
}

export function shortHash(text) {
  return createHash('sha256').update(String(text || '')).digest('hex').slice(0, 16);
}

export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { flags[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

export function log(...parts) {
  process.stderr.write('[fsk] ' + parts.join(' ') + '\n');
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));
