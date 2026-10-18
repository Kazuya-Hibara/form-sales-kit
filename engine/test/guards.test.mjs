import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { kit, ledgerRows, newWork, startServer, writeJson, VALUES } from './helpers.mjs';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });

const simplePosts = () => srv.posts.filter(p => p.path === '/simple/post').length;
const send = (work, site, extra = []) => kit(['fill', srv.base + '/contact/', '--values', writeJson(work, 'v.json', VALUES),
                                             '--submit', '--site', site, ...extra], work);

test('1 社 1 回: second submit to the same domain is blocked before the browser opens', async () => {
  const work = newWork();
  const first = await send(work, 'https://www.once.test/');
  assert.equal(first.json.status, 'submitted', first.stdout);
  const n = simplePosts();
  const second = await send(work, 'https://once.test/company/');
  assert.equal(second.json.status, 'blocked_by_guard');
  assert.equal(second.json.guard, 'already_sent');
  assert.equal(simplePosts(), n, 'no second POST');
  assert.equal(ledgerRows(work).length, 1);
});

test('suppress: domain and email entries block the submit', async () => {
  const work = newWork();
  assert.equal((await kit(['suppress', 'add', 'https://www.stop.test/'], work)).json.added, 'stop.test');
  assert.equal((await kit(['suppress', 'add', 'info@quiet.test'], work)).json.added, 'info@quiet.test');
  const n = simplePosts();
  const a = await send(work, 'stop.test');
  assert.deepEqual([a.json.status, a.json.guard], ['blocked_by_guard', 'suppressed']);
  const b = await send(work, 'https://quiet.test/');
  assert.deepEqual([b.json.status, b.json.guard], ['blocked_by_guard', 'suppressed']);
  assert.equal(simplePosts(), n);
});

test('daily cap: today count from the ledger stops the next submit', async () => {
  const work = newWork({ min_gap_sec: 0, daily_cap: 2 });
  await kit(['ledger', 'add', '--company', 'A', '--domain', 'a.test', '--status', 'submitted'], work);
  await kit(['ledger', 'add', '--company', 'B', '--domain', 'b.test', '--status', 'sent_manual'], work);
  await kit(['ledger', 'add', '--company', 'C', '--domain', 'c.test', '--status', 'captcha'], work);
  const stats = await kit(['ledger', 'stats'], work);
  assert.equal(stats.json.sent_today, 2);
  assert.equal(stats.json.remaining_today, 0);
  assert.deepEqual(stats.json.counts, { submitted: 1, sent_manual: 1, captcha: 1 });
  const n = simplePosts();
  const r = await send(work, 'd.test');
  assert.deepEqual([r.json.status, r.json.guard], ['blocked_by_guard', 'daily_cap']);
  assert.equal(simplePosts(), n);
});

test('min gap: --no-wait refuses, default waits the remaining seconds', async () => {
  const work = newWork({ min_gap_sec: 6 });
  const first = await send(work, 'gap1.test');
  assert.equal(first.json.status, 'submitted', first.stdout);
  const refused = await send(work, 'gap2.test', ['--no-wait']);
  assert.equal(refused.json.status, 'blocked_by_guard');
  assert.equal(refused.json.guard, 'min_gap');
  assert.ok(refused.json.wait_sec >= 1 && refused.json.wait_sec <= 6);
  const waited = await send(work, 'gap3.test');
  assert.equal(waited.json.status, 'submitted', waited.stdout);
  const rows = ledgerRows(work).filter(r => r.clicked);
  const gapMs = Date.parse(rows[1].clicked_at) - Date.parse(rows[0].clicked_at);
  assert.ok(gapMs >= 6000, `clicks ${gapMs}ms apart`);
});

test('shared form host without --site is refused (1 社 1 回 needs the company domain)', async () => {
  const work = newWork();
  const r = await kit(['fill', 'https://form.run/@example', '--values', writeJson(work, 'v.json', VALUES), '--submit'], work);
  assert.equal(r.json.ok, false);
  assert.match(r.json.error, /--site/);
});

test('ledger list / add with url', async () => {
  const work = newWork();
  await kit(['ledger', 'add', '--company', '甲社', '--url', 'https://www.kou.test/contact', '--status', 'skipped', '--note', '手動確認'], work);
  const r = await kit(['ledger', 'list', '--today'], work);
  assert.equal(r.json.total, 1);
  assert.equal(r.json.rows[0].domain, 'kou.test');
  assert.equal(r.json.rows[0].source, 'manual');
});
