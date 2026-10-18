import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { kit, newWork, startServer, writeJson, VALUES } from './helpers.mjs';

let srv, work;
before(async () => { srv = await startServer(); work = newWork(); });
after(async () => { await srv.close(); });

test('doctor: node, playwright, chromium launch, work dir', async () => {
  const r = await kit(['doctor'], work);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.launch_ok, true);
  assert.equal(r.json.work_dir, work);
  assert.equal(r.json.config.daily_cap, 20);
});

test('find: homepage -> same-site お問い合わせ page (skips 採用, external, mailto)', async () => {
  const r = await kit(['find', srv.base + '/'], work);
  assert.equal(r.json.status, 'found', r.stdout);
  assert.equal(r.json.form_url, srv.base + '/contact/');
  assert.equal(r.json.has_captcha, false);
  assert.equal(r.json.sales_refusal.found, false, '営業時間 footer must not read as a refusal');
  assert.ok(!r.json.candidates.some(c => c.url.includes('example.com')));
});

test('find: CONTACT -> second hop to the form, sales refusal reported', async () => {
  const r = await kit(['find', srv.base + '/home2/'], work);
  assert.equal(r.json.form_url, srv.base + '/refusal.html', r.stdout);
  assert.equal(r.json.sales_refusal.found, true);
  assert.match(r.json.sales_refusal.text, /営業目的のお問い合わせはご遠慮/);
});

test('find: a form page itself, with reCAPTCHA v2 widget', async () => {
  const r = await kit(['find', srv.base + '/captcha.html'], work);
  assert.equal(r.json.form_url, srv.base + '/captcha.html');
  assert.equal(r.json.has_captcha, true);
  assert.match(r.json.captcha_kind, /recaptcha_v2/);
});

test('inspect: simple form roles, search form excluded, submit button', async () => {
  const r = await kit(['inspect', srv.base + '/contact/'], work);
  const roles = Object.fromEntries(r.json.fields.map(f => [f.name, f.role]));
  assert.deepEqual(roles, { company: 'company', your_name: 'name', mail: 'email', tel: 'tel', kind: 'inquiry_type',
                            body: 'message', privacy: 'privacy_agree' });
  assert.equal(r.json.fields.find(f => f.name === 'your_name').required, true);
  assert.equal(r.json.submit_button.text, '送信');
  assert.equal(r.json.fields.find(f => f.name === 'kind').options.length, 4);
});

test('inspect: split name / kana / tel / zip, radio group, honeypot hidden', async () => {
  const r = await kit(['inspect', srv.base + '/split.html'], work);
  const by = Object.fromEntries(r.json.fields.map(f => [f.name, f]));
  assert.equal(by.name1.role, 'name_sei');
  assert.equal(by.name2.role, 'name_mei');
  assert.equal(by.kana_sei.role, 'kana_sei');
  assert.equal(by.kana_mei.role, 'kana_mei');
  assert.equal(by.company_kana.role, 'company_kana');
  assert.deepEqual([by.tel1.role, by.tel1.part, by.tel3.part], ['tel', 1, 3]);
  assert.deepEqual([by.zip1.role, by.zip2.part], ['zip', 2]);
  assert.equal(by.pref.role, 'pref');
  assert.equal(by.email_confirm.role, 'email_confirm');
  assert.equal(by.type.role, 'inquiry_type');
  assert.equal(by.type.options.length, 3);
  assert.equal(by.contact_way.role, 'contact_method');
  assert.equal(by.agree.role, 'privacy_agree');
  assert.equal(by.news.role, 'other');
  assert.equal(by.website_hp, undefined);
});

test('fill dry run: fills, ticks privacy, picks その他, never posts', async () => {
  const values = writeJson(work, 'values.json', VALUES);
  const before = srv.posts.length;
  const r = await kit(['fill', srv.base + '/contact/', '--values', values], work);
  assert.equal(r.json.status, 'dry_run', r.stdout);
  assert.equal(r.json.ready, true);
  assert.deepEqual(r.json.unfilled_required, []);
  const kind = r.json.filled.find(x => x.role === 'inquiry_type');
  assert.equal(kind.text, 'その他');
  assert.ok(r.json.filled.some(x => x.role === 'privacy_agree'));
  assert.ok(r.json.screenshot.endsWith('.png'));
  assert.equal(srv.posts.length, before, 'dry run must not submit');
});

test('fill dry run: map overrides the inquiry type; unfilled required reported', async () => {
  const values = writeJson(work, 'values-noemail.json', { ...VALUES, email: '' });
  const map = writeJson(work, 'map.json', { 'select[name="kind"]': 'サービスについて' });
  const r = await kit(['fill', srv.base + '/contact/', '--values', values, '--map', map], work);
  assert.equal(r.json.filled.find(x => x.selector === 'select[name="kind"]').mapped, true);
  assert.equal(r.json.ready, false);
  assert.deepEqual(r.json.unfilled_required.map(u => u.role), ['email']);
});
