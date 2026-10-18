import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kit, ledgerRows, newWork, startServer, writeJson, VALUES } from './helpers.mjs';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

async function submit(fixture, site, work = newWork()) {
  const values = writeJson(work, 'values.json', VALUES);
  const r = await kit(['fill', srv.base + fixture, '--values', values, '--submit', '--site', site, '--company', site], work);
  return { r, work, json: r.json };
}
const postsTo = p => srv.posts.filter(x => x.path === p);

test('simple form: submitted, POST carries our values, ledger row + screenshot', async () => {
  const { json, work } = await submit('/contact/', 'simple.test');
  assert.equal(json.status, 'submitted', JSON.stringify(json));
  const post = postsTo('/simple/post').at(-1).params;
  assert.equal(post.mail, VALUES.email);
  assert.equal(post.kind, 'その他');
  assert.equal(post.privacy, '1');
  assert.equal(post.body, VALUES.message);
  const rows = ledgerRows(work);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'submitted');
  assert.equal(rows[0].domain, 'simple.test');
  assert.match(rows[0].ts, /\+09:00$/);
  assert.equal(rows[0].message_hash.length, 16);
  assert.ok(fs.existsSync(rows[0].screenshot));
});

test('CF7-like AJAX form: sent class read as submitted', async () => {
  const { json } = await submit('/cf7.html', 'cf7.test');
  assert.equal(json.status, 'submitted', JSON.stringify(json));
  assert.match(json.evidence, /cf7:sent/);
  const post = postsTo('/cf7/feedback').at(-1).params;
  assert.equal(post['acceptance-1'], '1');
  assert.equal(post['your-subject'], VALUES.subject);
  assert.equal(post['_wpcf7_ak_hp_textarea'], '');
});

test('MW WP Form-like: 確認画面へ -> confirm page -> 送信する -> complete', async () => {
  const { json } = await submit('/mw/', 'mw.test');
  assert.equal(json.status, 'submitted', JSON.stringify(json));
  assert.equal(json.confirm_clicked, true);
  assert.match(json.final_url, /\/mw\/complete\/$/);
  const posts = postsTo('/mw/');
  assert.ok(posts.some(p => p.params.send === 'send' && p.params.content === VALUES.message));
});

test('split name / kana / tel / zip / pref / radio form: server-side check passes', async () => {
  const { json } = await submit('/split.html', 'split.test');
  assert.equal(json.status, 'submitted', JSON.stringify(json));
  const p = postsTo('/split/post').at(-1).params;
  assert.deepEqual([p.tel1, p.tel2, p.tel3, p.zip1, p.zip2], ['03', '1234', '5678', '164', '0001']);
  assert.deepEqual([p.name1, p.name2, p.kana_sei, p.kana_mei, p.company_kana], ['山田', '太郎', 'ヤマダ', 'タロウ', 'てすとしょうじ']);
  assert.equal(p.type, 'other');
  assert.equal(p.news, undefined);
});

test('thank-you redirect: URL token is the receipt', async () => {
  const { json } = await submit('/redirect.html', 'redirect.test');
  assert.equal(json.status, 'submitted', JSON.stringify(json));
  assert.match(json.evidence, /thanks_url/);
});

test('reCAPTCHA form: status captcha, nothing posted', async () => {
  const { json, work } = await submit('/captcha.html', 'captcha.test');
  assert.equal(json.status, 'captcha');
  assert.equal(postsTo('/captcha/post').length, 0);
  assert.equal(ledgerRows(work)[0].status, 'captcha');
});

test('営業お断り page: status sales_refusal, nothing posted', async () => {
  const { json } = await submit('/refusal.html', 'refusal.test');
  assert.equal(json.status, 'sales_refusal');
  assert.match(json.evidence, /営業目的/);
  assert.equal(postsTo('/refusal/post').length, 0);
});

test('server-side validation error page: validation_error', async () => {
  const { json } = await submit('/reject.html', 'reject.test');
  assert.equal(json.status, 'validation_error', JSON.stringify(json));
  assert.match(json.evidence, /誤りがあります|は必須です/);
});

test('click with no visible effect: confirm_unclear (counted as sent for 1 社 1 回)', async () => {
  const { json, work } = await submit('/noop.html', 'noop.test');
  assert.equal(json.status, 'confirm_unclear', JSON.stringify(json));
  const again = await submit('/noop.html', 'noop.test', work);
  assert.equal(again.json.status, 'blocked_by_guard');
  assert.equal(again.json.guard, 'already_sent');
});
