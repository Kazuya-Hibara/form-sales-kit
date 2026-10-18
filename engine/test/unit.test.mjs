import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assignRoles, buildFields, detectSalesRefusal, kanaFor, nameSide, pickOption, splitPhone, toHalfKana, toKatakana,
} from '../lib/heuristics.mjs';
import { gapRemainingSec, preSubmitGuard } from '../lib/guards.mjs';
import { jstNow, normalizeDomain } from '../lib/util.mjs';

test('sales refusal: the four stock phrasings are found', () => {
  for (const t of ['当社は営業お断りです。', '※営業目的のお問い合わせはご遠慮ください。', 'セールスはお断りしております',
                   '営業メールはお断りいたします。']) {
    assert.equal(detectSalesRefusal(t).found, true, t);
  }
});

test('sales refusal: 営業時間 next to 禁止 is not a refusal', () => {
  assert.equal(detectSalesRefusal('営業時間 9:00-18:00 / 当サイトの無断転載を禁止します').found, false);
  assert.equal(detectSalesRefusal('営業日のご案内。お問い合わせはこちらから').found, false);
});

test('kana: default katakana, hiragana when the box asks, half-width when it says 半角', () => {
  assert.equal(toKatakana('やまだ'), 'ヤマダ');
  assert.equal(toHalfKana('ヤマダ'), 'ﾔﾏﾀﾞ');
  assert.equal(kanaFor({ label_parts: ['フリガナ'] }, 'やまだ'), 'ヤマダ');
  assert.equal(kanaFor({ label_parts: ['ふりがな'], placeholder: 'やまだ たろう' }, 'ヤマダ タロウ'), 'やまだ　たろう');
  assert.equal(kanaFor({ label_parts: ['フリガナ（半角カナ）'] }, 'やまだ'), 'ﾔﾏﾀﾞ');
});

test('phone split: Tokyo 2-4-4, mobile 3-4-4, two boxes', () => {
  assert.deepEqual(splitPhone('03-1234-5678', 3), ['03', '1234', '5678']);
  assert.deepEqual(splitPhone('09012345678', 3), ['090', '1234', '5678']);
  assert.deepEqual(splitPhone('0312345678', 3), ['03', '1234', '5678']);
  assert.deepEqual(splitPhone('090-1234-5678', 2), ['090', '12345678']);
});

test('name side from caption, attribute and placeholder', () => {
  assert.equal(nameSide({ label_parts: ['姓'], name: 'a' }), 'sei');
  assert.equal(nameSide({ label_parts: ['お名前（名）'], name: 'b' }), 'mei');
  assert.equal(nameSide({ label_parts: ['お名前'], name: 'last_name' }), 'sei');
  assert.equal(nameSide({ label_parts: ['お名前'], name: 'x', placeholder: '太郎' }), 'mei');
  assert.equal(nameSide({ label_parts: ['氏名'], name: 'name' }), '');
});

const f = (over) => ({ selector: '#' + (over.name || 'x'), tag: 'INPUT', type: 'text', name: '', id: '', placeholder: '', title: '',
                       aria_label: '', label_parts: [], required: false, options: [], form_index: 0, ...over });

test('roles: Japanese captions map to roles; split tel gets parts; second email = confirm', () => {
  const fields = assignRoles(buildFields([
    f({ name: 'kaisha', label_parts: ['貴社名'] }),
    f({ name: 'n', label_parts: ['ご担当者名'] }),
    f({ name: 'k', label_parts: ['フリガナ'] }),
    f({ name: 'm1', type: 'email', label_parts: ['メールアドレス'] }),
    f({ name: 'm2', type: 'email', label_parts: ['メールアドレス'] }),
    f({ name: 't1', type: 'tel', label_parts: ['電話番号'] }),
    f({ name: 't2', type: 'tel', label_parts: ['電話番号'] }),
    f({ name: 't3', type: 'tel', label_parts: ['電話番号'] }),
    f({ name: 'fax', type: 'tel', label_parts: ['FAX番号'] }),
    f({ name: 'zip', label_parts: ['郵便番号'] }),
    f({ name: 'kind', tag: 'SELECT', type: 'select', label_parts: ['お問い合わせ内容'], options: [{ value: 'a', text: 'その他' }] }),
    f({ name: 'body', tag: 'TEXTAREA', type: 'textarea', label_parts: ['ご質問・ご要望'] }),
    f({ name: 'pp', type: 'checkbox', choice_text: '個人情報の取り扱いに同意する' }),
    f({ name: 'mm', type: 'checkbox', choice_text: 'メールマガジンを受け取る' }),
  ]));
  const role = n => fields.find(x => x.name === n);
  assert.equal(role('kaisha').role, 'company');
  assert.equal(role('n').role, 'name');
  assert.equal(role('k').role, 'kana');
  assert.equal(role('m1').role, 'email');
  assert.equal(role('m2').role, 'email_confirm');
  assert.deepEqual([role('t1').part, role('t3').part, role('t3').parts], [1, 3, 3]);
  assert.equal(role('fax').role, 'other');
  assert.equal(role('zip').role, 'zip');
  assert.equal(role('kind').role, 'inquiry_type');
  assert.equal(role('body').role, 'message');
  assert.equal(role('pp').role, 'privacy_agree');
  assert.equal(role('mm').role, 'other');
});

test('inquiry type: その他 preferred, explicit value wins, required fallback = last option', () => {
  const opts = ['選択してください', '製品について', '採用', 'その他'].map((t, i) => ({ value: i ? String(i) : '', text: t }));
  assert.equal(pickOption({ role: 'inquiry_type', options: opts }, {}).text, 'その他');
  assert.equal(pickOption({ role: 'inquiry_type', options: opts }, { inquiry_type: '製品' }).text, '製品について');
  const noOther = opts.slice(0, 3);
  assert.equal(pickOption({ role: 'inquiry_type', options: noOther, required: false }, {}), null);
  assert.equal(pickOption({ role: 'inquiry_type', options: noOther, required: true }, {}).text, '採用');
});

test('guards: already sent, suppress (domain / email / subdomain), daily cap', () => {
  const now = new Date();
  const config = { daily_cap: 2, min_gap_sec: 30 };
  const ledger = [{ ts: jstNow(now), domain: 'a.test', status: 'submitted' }];
  assert.equal(preSubmitGuard({ domain: 'www.a.test' }, { ledger, suppress: [], config }).guard, 'already_sent');
  assert.equal(preSubmitGuard({ domain: 'b.test' }, { ledger, suppress: ['b.test'], config }).guard, 'suppressed');
  assert.equal(preSubmitGuard({ domain: 'shop.c.test' }, { ledger, suppress: ['info@c.test'], config }).guard, 'suppressed');
  assert.equal(preSubmitGuard({ domain: 'd.test' }, { ledger, suppress: [], config }), null);
  const full = [...ledger, { ts: jstNow(now), domain: 'e.test', status: 'confirm_unclear' }];
  assert.equal(preSubmitGuard({ domain: 'd.test' }, { ledger: full, suppress: [], config }).guard, 'daily_cap');
  const failed = [{ ts: jstNow(now), domain: 'f.test', status: 'validation_error' }];
  assert.equal(preSubmitGuard({ domain: 'f.test' }, { ledger: failed, suppress: [], config }), null);
});

test('guards: min gap counts from the last click', () => {
  const now = new Date();
  const ledger = [{ ts: jstNow(now), clicked: true, clicked_at: new Date(now.getTime() - 10_000).toISOString() }];
  assert.equal(gapRemainingSec(ledger, { min_gap_sec: 30 }, now), 20);
  assert.equal(gapRemainingSec(ledger, { min_gap_sec: 5 }, now), 0);
  assert.equal(gapRemainingSec([{ ts: jstNow(now), clicked: false }], { min_gap_sec: 30 }, now), 0);
});

test('domain normalisation', () => {
  assert.equal(normalizeDomain('https://www.Example.co.jp/contact/'), 'example.co.jp');
  assert.equal(normalizeDomain('info@example.co.jp'), 'example.co.jp');
  assert.match(jstNow(new Date('2026-10-18T15:30:00Z')), /^2026-10-19T00:30:00\+09:00$/);
});
