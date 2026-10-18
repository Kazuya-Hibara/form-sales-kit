// Local fixture server (127.0.0.1 only) + CLI runner. Nothing here talks to the internet.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
export const KIT = path.join(HERE, '..', 'bin', 'kit.mjs');

const page = name => fs.readFileSync(path.join(FIX, name), 'utf8');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROUTES = { '/': 'home.html', '/home2/': 'home2.html', '/info/': 'info.html', '/contact/': 'simple.html', '/mw/': 'mw.html',
                 '/thanks/complete.html': 'thanks.html' };
const THANKS = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>送信完了</title></head><body>'
  + '<h1>送信完了</h1><p>お問い合わせありがとうございました。内容を確認のうえご連絡いたします。</p></body></html>';

function splitCheck(p) {
  const want = { name1: '山田', name2: '太郎', kana_sei: 'ヤマダ', kana_mei: 'タロウ', company_kana: 'てすとしょうじ',
                 tel1: '03', tel2: '1234', tel3: '5678', zip1: '164', zip2: '0001', pref: '東京都', addr: '中野区中野1-1-1',
                 type: 'other', contact_way: 'mail', agree: '1' };
  const bad = Object.entries(want).filter(([k, v]) => p.get(k) !== v).map(([k, v]) => `${k}=${p.get(k)} (期待 ${v})`);
  if (p.get('email') !== p.get('email_confirm') || !p.get('email')) bad.push('email_confirm');
  if (p.get('news')) bad.push('news checked');
  if (p.get('website_hp')) bad.push('honeypot filled');
  if (!p.get('message')) bad.push('message');
  return bad;
}

export function startServer() {
  const posts = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (code, body, type = 'text/html; charset=utf-8', extra = {}) => { res.writeHead(code, { 'content-type': type, ...extra }); res.end(body); };
    if (req.method === 'GET') {
      if (url.pathname === '/mw/complete/') return send(200, THANKS);
      const file = ROUTES[url.pathname] || (url.pathname.endsWith('.html') ? url.pathname.slice(1) : null);
      if (file && fs.existsSync(path.join(FIX, file))) return send(200, page(file));
      return send(404, '<html><body>not found</body></html>');
    }
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const p = new URLSearchParams(raw);
      posts.push({ path: url.pathname, params: Object.fromEntries(p) });
      switch (url.pathname) {
        case '/simple/post': case '/captcha/post': case '/refusal/post':
          return send(200, THANKS.replace('送信完了</h1>', 'お問い合わせ</h1>'));
        case '/cf7/feedback': {
          const ok = p.get('your-name') && p.get('your-email') && p.get('acceptance-1') === '1' && p.get('your-message');
          return send(200, JSON.stringify(ok ? { status: 'mail_sent', message: 'ありがとうございます。メッセージは送信されました。' }
                                             : { status: 'validation_failed', message: '入力内容に問題があります。確認して再度お試しください。' }),
                      'application/json');
        }
        case '/mw/': {
          if (p.has('send')) return send(302, '', 'text/html', { location: '/mw/complete/' });
          const hidden = [...p.entries()].filter(([k]) => k !== 'confirm')
            .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
          const rows = [...p.entries()].filter(([k]) => k !== 'confirm').map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
          return send(200, `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>お問い合わせ - MW</title></head><body>
<h1>お問い合わせ</h1><p>入力内容の確認</p><div class="mw_wp_form mw_wp_form_confirm"><form method="post" action=""><dl>${rows}</dl>${hidden}
<button type="submit" name="submitBack" value="back">戻る</button> <button type="submit" name="send" value="send">送信する</button></form></div></body></html>`);
        }
        case '/split/post': {
          const bad = splitCheck(p);
          if (bad.length) return send(200, page('split.html').replace('<h1>お問い合わせ</h1>', `<h1>お問い合わせ</h1><p class="error">入力内容に誤りがあります: ${esc(bad.join(', '))}</p>`));
          return send(200, THANKS);
        }
        case '/redirect/post': return send(303, '', 'text/html', { location: '/thanks/complete.html' });
        case '/reject/post':
          return send(200, page('reject.html').replace('<!--ERROR-->', '<p class="error">入力内容に誤りがあります。電話番号は必須です。</p>'));
        default: return send(404, 'no');
      }
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ base, posts, close: () => new Promise(r => server.close(r)) });
  }));
}

export function newWork(config = { min_gap_sec: 0 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fsk-test-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ daily_cap: 20, headless: true, send_days: [0, 1, 2, 3, 4, 5, 6], send_hours: [0, 24], ...config }));
  return dir;
}

export function writeJson(dir, name, obj) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
}

export const VALUES = {
  company: 'テスト商事株式会社', company_kana: 'テストショウジ', name: '山田 太郎', kana: 'やまだ たろう',
  email: 'taro@example.test', tel: '03-1234-5678', zip: '164-0001', pref: '東京都', address: '東京都中野区中野1-1-1',
  url: 'https://example.test', subject: 'ご挨拶',
  message: '突然のご連絡失礼いたします。テスト商事の山田と申します。貴社の取り組みを拝見しご連絡しました。お忙しいところありがとうございます。',
};

/** Run the CLI; resolves {code, json, stderr, ms}. */
export function kit(args, work, env = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [KIT, ...args], {
      env: { ...process.env, FSK_WORK: work, FSK_BLOCK_EXTERNAL: '1', ...env },
    });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    child.on('error', reject);
    child.on('close', code => {
      let json = null;
      try { json = JSON.parse(out.trim().split('\n').pop()); } catch { /* left null */ }
      resolve({ code, json, stdout: out, stderr: err, ms: Date.now() - t0 });
    });
  });
}

export function ledgerRows(work) {
  const f = path.join(work, 'ledger.jsonl');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
}
