#!/usr/bin/env node
// フォーム営業キット engine CLI. Every command prints exactly one JSON object on stdout;
// human-readable progress goes to stderr.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { log, normalizeDomain, parseArgs, shortHash } from '../lib/util.mjs';
import {
  addSuppress, appendLedger, ensureWork, ledgerStats, loadConfig, readLedger, readSuppress, workDir,
} from '../lib/work.mjs';

const USAGE = `usage: node bin/kit.mjs <command>
  doctor
  find <homepage-url> [--show]
  inspect <form-url> [--show]
  fill <form-url> --values <values.json> [--map <map.json>] [--site <homepage-url>] [--company <name>]
                  [--target-email <addr>] [--submit] [--no-wait] [--show]
  ledger add --company <name> (--domain <d> | --url <u>) --status <s> [--form-url <u>] [--message-file <f>] [--note <t>]
  ledger list [--today] [--domain <d>] [--limit <n>]
  ledger stats [--date YYYY-MM-DD]
  suppress add <domain|email>
  suppress list`;

const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));

async function doctor() {
  const major = Number(process.versions.node.split('.')[0]);
  const out = { ok: false, node: process.version, node_ok: major >= 18, playwright: null, chromium_ok: false, launch_ok: false };
  try {
    const require = createRequire(import.meta.url);
    out.playwright = require('playwright/package.json').version;
    const { chromium } = await import('playwright');
    const exe = chromium.executablePath();
    out.chromium_path = exe;
    out.chromium_ok = fs.existsSync(exe);
    if (out.chromium_ok) {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.setContent('<p>ok</p>');
      out.launch_ok = (await page.textContent('p')) === 'ok';
      await Promise.race([browser.close().catch(() => {}), new Promise(r => setTimeout(r, 1500))]);
    }
  } catch (err) {
    out.error = String(err.message).split('\n')[0];
  }
  out.work_dir = ensureWork();
  out.config = loadConfig();
  out.ledger_rows = readLedger().length;
  out.suppress_entries = readSuppress().length;
  out.ok = out.node_ok && out.chromium_ok && out.launch_ok;
  if (!out.playwright) out.fix = 'engine/ で npm install を実行';
  else if (!out.chromium_ok || !out.launch_ok) out.fix = 'engine/ で npx playwright install chromium を実行';
  return out;
}

function ledgerCmd(sub, args) {
  const f = args.flags;
  if (sub === 'add') {
    const domain = normalizeDomain(f.domain || f.url || f['form-url']);
    if (!domain || !f.status || f.status === true) throw new Error('ledger add: --domain (または --url) と --status が必要です');
    let hash = '';
    if (f['message-file']) hash = shortHash(fs.readFileSync(path.resolve(f['message-file']), 'utf8'));
    const row = appendLedger({ company: f.company || '', domain, form_url: f['form-url'] || f.url || '', status: f.status,
                               message_hash: hash, screenshot: f.screenshot || '', note: f.note || '', source: 'manual' });
    return { ok: true, added: row };
  }
  if (sub === 'list') {
    let rows = readLedger();
    if (f.today) { const today = ledgerStats().date; rows = rows.filter(r => String(r.ts).startsWith(today)); }
    if (f.domain) { const d = normalizeDomain(f.domain); rows = rows.filter(r => r.domain === d); }
    const limit = Number(f.limit) || 50;
    return { ok: true, total: rows.length, rows: rows.slice(-limit) };
  }
  if (sub === 'stats') return { ok: true, ...ledgerStats(f.date && f.date !== true ? f.date : undefined) };
  throw new Error('ledger: add | list | stats');
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const show = !!args.flags.show;
  const headless = show ? false : undefined;
  switch (cmd) {
    case 'doctor': return doctor();
    case 'find': {
      const url = args.positional[0];
      if (!url) throw new Error('find <homepage-url>');
      const { find } = await import('../lib/browser.mjs');
      log('find', url);
      return find(url, { headless: headless ?? loadConfig().headless });
    }
    case 'inspect': {
      const url = args.positional[0];
      if (!url) throw new Error('inspect <form-url>');
      const { inspect } = await import('../lib/browser.mjs');
      log('inspect', url);
      return inspect(url, { headless: headless ?? loadConfig().headless });
    }
    case 'fill': {
      const url = args.positional[0];
      if (!url || !args.flags.values || args.flags.values === true) throw new Error('fill <form-url> --values <values.json>');
      const { fill } = await import('../lib/browser.mjs');
      const values = readJson(args.flags.values);
      const map = args.flags.map && args.flags.map !== true ? readJson(args.flags.map) : {};
      log(args.flags.submit ? 'fill+submit' : 'fill (dry run)', url);
      return fill(url, {
        values, map, submit: !!args.flags.submit, headless, wait: !args.flags['no-wait'],
        site: typeof args.flags.site === 'string' ? args.flags.site : '',
        company: typeof args.flags.company === 'string' ? args.flags.company : '',
        targetEmail: typeof args.flags['target-email'] === 'string' ? args.flags['target-email'] : '',
      });
    }
    case 'ledger': return ledgerCmd(args.positional[0], args);
    case 'suppress': {
      const sub = args.positional[0];
      if (sub === 'add') return { ok: true, added: addSuppress(args.positional[1]) };
      if (sub === 'list') return { ok: true, entries: readSuppress() };
      throw new Error('suppress add <domain|email> | suppress list');
    }
    case 'workdir': return { ok: true, work_dir: workDir() };
    default:
      process.stderr.write(USAGE + '\n');
      return { ok: false, error: 'unknown command', usage: USAGE };
  }
}

// Exit explicitly once stdout is flushed: a browser that is still shutting down must not keep the CLI alive.
const finish = (obj, code) => process.stdout.write(JSON.stringify(obj) + '\n', () => process.exit(code));

main().then(result => {
  finish(result, result && result.ok === false ? 1 : 0);
}).catch(err => {
  log('error:', err.stack || err.message);
  finish({ ok: false, status: 'error', error: String(err.message).split('\n')[0] }, 1);
});
