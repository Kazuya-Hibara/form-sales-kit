// Pure judgement vocabulary for Japanese contact forms (no browser here).
// Ported from the production sender (outreach-os formfill.py / receipts.py): label
// dictionaries, split name/kana/tel/zip, kana script, sales-refusal and receipt markers.

export const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const LABEL_NOISE = /[\s　]|必須|任意|required|optional|[*＊★※:：()（）[\]【】「」・]/gi;
export const labelToken = t => String(t || '').normalize('NFKC').replace(LABEL_NOISE, '').toLowerCase();

// ---------------------------------------------------------------- roles
// Order matters (first hit wins per caption, nearest caption first).
const ROLE_RULES = [
  ['company_kana', ['会社名フリガナ', '会社名ふりがな', '会社名カナ', '貴社名フリガナ', '貴社名カナ', '法人名カナ',
                    '法人名フリガナ', '会社フリガナ', '社名カナ', '社名フリガナ', 'company_kana', 'companykana']],
  ['kana', ['ふりがな', 'フリガナ', 'ふり仮名', '振り仮名', 'よみがな', 'ヨミガナ', '読み仮名', 'カナ', 'kana', 'furigana', 'ruby', 'yomi']],
  ['email_confirm', ['メール確認', 'メールアドレス確認', 'メールアドレス再入力', 'メールアドレス確認用', 'mailconfirm',
                     'email_confirm', 'confirm_email', 'email2', 'mail2', 'email-confirm', 'e-mail確認']],
  ['email', ['メールアドレス', 'メール', 'e-mail', 'email', 'mail', 'アドレス']],
  ['company', ['会社名', '貴社名', '御社名', '企業名', '法人名', '団体名', '組織名', '屋号', '事業所名', '医院名', '店舗名',
               '施設名', '事務所名', '会社団体', 'company', 'corp', 'kaisha', 'organization', 'soshiki']],
  ['department', ['部署', '所属', '部門', 'department', 'busho', 'division']],
  ['position', ['役職', '職位', '肩書', 'position', 'job_title', 'jobtitle']],
  ['contact_method', ['希望連絡方法', 'ご希望の連絡方法', '希望の連絡方法', '連絡方法', 'ご連絡方法', '返信方法', '連絡手段']],
  ['zip', ['郵便番号', '〒', 'zip', 'postal', 'yubin', 'postcode']],
  ['pref', ['都道府県', 'prefecture', 'todofuken', 'pref']],
  ['address', ['住所', '所在地', '市区町村', '町名', '番地', '建物', 'ビル名', 'address', 'jusho', 'addr', 'city', 'street']],
  ['fax', ['fax', 'ファックス', 'ファクス']],
  ['tel', ['電話', 'tel', 'phone', '携帯', 'denwa', 'mobile']],
  ['url', ['ホームページ', 'ウェブサイト', 'webサイト', 'url', 'website', 'homepage', 'サイト']],
  ['subject', ['件名', '題名', 'タイトル', 'subject', 'title', 'kenmei']],
  ['message', ['お問い合わせ内容', 'お問合せ内容', 'お問い合せ内容', '問合せ内容', '問い合わせ内容', 'ご相談内容', 'ご要望',
               '質問内容', 'ご連絡内容', 'ご質問', '内容', '本文', 'メッセージ', '備考', '詳細', 'message', 'body',
               'content', 'inquiry', 'details', 'remarks', 'naiyo', 'comment', 'toiawase']],
  ['inquiry_type', ['お問い合わせ項目', 'お問い合わせ種別', 'お問合せ種別', 'お問い合わせの種類', '種別', '区分', '分類',
                    'カテゴリ', 'ご用件', '用件', 'category', 'type', 'kind']],
  ['name', ['お名前', '名前', '氏名', '姓名', 'ご芳名', 'ご担当者', '担当者', '御名前', 'なまえ', 'name', 'namae']],
].map(([role, words]) => [role, words.map(labelToken)]);

const CONSENT_WORDS = ['個人情報', 'プライバシー', 'privacy', '利用規約', '規約', 'ポリシー', 'policy', 'terms', '同意',
                       '承諾', 'agree', 'consent', '承知'];
const MARKETING_WORDS = ['広告', '配信', 'メルマガ', 'メールマガジン', 'newsletter', '販促', '購読', 'subscribe', 'ダイレクトメール'];
const INQUIRY_PREFS = ['その他', 'その他のお問い合わせ', 'お問い合わせ', 'お問合せ', '問い合わせ', 'ご相談', '相談'];
const PLACEHOLDER_OPTIONS = ['選択してください', '選択して下さい', 'お選びください', '選択なし', '未選択', '指定なし',
                             'pleaseselect', 'select', 'choose', '---', '--'];

export const isPlaceholderOption = text => {
  const t = labelToken(text).replace(/[-―ー‐=]/g, '');
  return !t || PLACEHOLDER_OPTIONS.some(w => labelToken(w) && t.includes(labelToken(w)));
};

const looksPrefecture = texts => texts.length >= 10 && texts.includes('北海道') && texts.some(t => t === '東京都' || t === '東京');

function captionsOf(f) {
  const own = [f.name, f.id, f.placeholder, f.aria_label, f.title].filter(Boolean).join(' ');
  const parts = [...(f.label_parts || [])];
  if (f.group_caption) parts.unshift(f.group_caption);
  return { parts, own };
}

function ruleHit(text) {
  const t = labelToken(text);
  if (!t) return '';
  for (const [role, words] of ROLE_RULES) {
    if (role === 'email_confirm' && !/mail|メール/.test(t)) continue;
    if (words.some(w => t.includes(w))) return role;
  }
  return '';
}

// Which half of a split name box this is: 'sei' / 'mei' / ''.
export function nameSide(f) {
  for (const raw of (f.label_parts || []).slice(0, 2)) {
    const r = String(raw).normalize('NFKC');
    const t = labelToken(r);
    if (/[(（]\s*(姓|せい|セイ)\s*[)）]/.test(r) || ['姓', 'せい', 'セイ', '苗字', '名字', 'lastname', 'last', 'familyname', 'family', 'surname'].includes(t)
        || /(セイ|せい|lastname)$/.test(t) || (/姓$/.test(t) && !/姓名$/.test(t))) return 'sei';
    if (/[(（]\s*(名|めい|メイ)\s*[)）]/.test(r) || ['名', 'めい', 'メイ', 'firstname', 'first', 'givenname', 'given'].includes(t)
        || /(メイ|めい|firstname)$/.test(t)) return 'mei';
  }
  const attr = `${f.name} ${f.id}`.toLowerCase();
  const toks = attr.split(/[^a-z0-9]+/).filter(Boolean);
  if (toks.some(x => ['sei', 'last', 'family', 'lname', 'surname', 'lastname', 'familyname', 'name1', 'sei1'].includes(x))) return 'sei';
  if (toks.some(x => ['mei', 'first', 'given', 'fname', 'firstname', 'givenname', 'name2', 'mei1'].includes(x))) return 'mei';
  const ph = String(f.placeholder || '').normalize('NFKC').replace(/^(例|例えば|ex)[:：.]?\s*/i, '').trim();
  if (/^(山田|やまだ|ヤマダ|鈴木|すずき|スズキ|佐藤|さとう|サトウ|田中|たなか|タナカ|yamada)$/i.test(ph)) return 'sei';
  if (/^(太郎|たろう|タロウ|花子|はなこ|ハナコ|一郎|いちろう|イチロウ|taro)$/i.test(ph)) return 'mei';
  return '';
}

/** Role of one logical field (before the cross-field pass). */
export function classifyField(f) {
  const { parts, own } = captionsOf(f);
  if (f.type === 'checkbox' && !f.options?.length) {
    const scope = labelToken([f.choice_text, ...parts.slice(0, 2)].join(' '));
    if (MARKETING_WORDS.some(w => scope.includes(labelToken(w)))) return { role: 'other', confidence: 0.6 };
    if (CONSENT_WORDS.some(w => scope.includes(labelToken(w)))) return { role: 'privacy_agree', confidence: 0.9 };
    if (scope.includes('チェック') && /入れ|して|つけ|付け/.test(scope)) return { role: 'privacy_agree', confidence: 0.6 };
    return { role: 'other', confidence: 0.3 };
  }
  if (f.type === 'select') {
    const texts = (f.options || []).map(o => o.text);
    if (looksPrefecture(texts)) return { role: 'pref', confidence: 0.95 };
  }
  if (f.type === 'radio' || f.type === 'checkbox') {
    const hit = ruleHit(f.group_caption || '') || ruleHit((f.label_parts || [])[0] || '') || ruleHit(f.name || '');
    if (hit === 'contact_method') return { role: 'contact_method', confidence: 0.8 };
    if (hit === 'inquiry_type' || hit === 'message' || hit === 'subject') return { role: 'inquiry_type', confidence: 0.85 };
    const texts = (f.options || []).map(o => o.text);
    if (texts.length >= 2 && texts.every(t => t.length <= 14) && texts.filter(t => /メール|mail|電話|tel|fax|郵送/i.test(t)).length >= 2) {
      return { role: 'contact_method', confidence: 0.6 };
    }
    if (texts.some(t => /その他|お問い?合わ?せ|ご相談/.test(t))) return { role: 'inquiry_type', confidence: 0.5 };
    return { role: 'other', confidence: 0.3 };
  }
  if (f.type === 'email') {
    const near = labelToken(parts.slice(0, 2).join(' ') + ' ' + own);
    return { role: /確認|confirm|再入力|retype|again/.test(near) ? 'email_confirm' : 'email', confidence: 0.95 };
  }
  if (f.type === 'tel') {
    const near = parts.slice(0, 2).join(' ') + ' ' + own;
    const hit = ruleHit(near);
    if (hit === 'zip') return { role: 'zip', confidence: 0.9 };
    if (hit === 'fax') return { role: 'other', confidence: 0.8 };
    return { role: 'tel', confidence: 0.95 };
  }
  if (f.type === 'url') return { role: 'url', confidence: 0.95 };
  const candidates = [...parts.map(p => [p, 0.9]), [own, 0.65]];
  for (let i = 0; i < candidates.length; i++) {
    const [text, conf] = candidates[i];
    let role = ruleHit(text);
    if (!role) continue;
    const c = i === 0 ? conf : Math.min(conf, 0.75);
    if (role === 'fax') return { role: 'other', confidence: c };
    if (f.type === 'textarea' && ['inquiry_type', 'subject', 'name', 'company', 'department', 'email', 'url'].includes(role)) role = 'message';
    if (f.type === 'select' && (role === 'message' || role === 'subject')) role = 'inquiry_type';
    if (f.type !== 'select' && f.type !== 'textarea' && role === 'inquiry_type') role = 'subject';
    // A one-line box captioned 内容 / 備考 stays 'message' here; assignRoles demotes it when a textarea exists.
    return { role, confidence: c };
  }
  if (f.type === 'textarea') return { role: 'message', confidence: 0.6 };
  return { role: 'other', confidence: 0.2 };
}

/** Group radios / same-name checkboxes into one logical field each. */
export function buildFields(raw) {
  const out = [];
  const groups = new Map();
  for (const f of raw) {
    if (f.type === 'radio' || f.type === 'checkbox') {
      const key = `${f.type}|${f.form_index}|${f.name || f.selector}`;
      if (!groups.has(key)) {
        const g = { ...f, members: [] };
        groups.set(key, g);
        out.push(g);
      }
      groups.get(key).members.push(f);
    } else out.push({ ...f, options: f.options || [] });
  }
  for (const g of groups.values()) {
    const m = g.members;
    g.required = m.some(x => x.required);
    if (m.length === 1 && g.type === 'checkbox') {
      g.options = [];
      g.label = [g.choice_text, ...(g.label_parts || [])].filter(Boolean).join(' / ');
    } else {
      g.options = m.map(x => ({ value: x.value, text: x.choice_text || x.value, selector: x.selector, checked: x.checked }));
      if (g.name) {
        const tag = 'input';
        g.selector = `${tag}[name="${String(g.name).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
      }
      g.label = [g.group_caption, ...(g.label_parts || []).filter(p => !m.some(x => x.choice_text === p))]
        .filter(Boolean).join(' / ');
    }
    delete g.members;
  }
  return out;
}

/** Roles for every logical field, with the cross-field pass (split boxes, confirm email, lone textarea). */
export function assignRoles(fields) {
  const list = fields.map(f => ({ ...f, ...classifyField(f) }));
  const textareas = list.filter(f => f.type === 'textarea');
  if (textareas.length && list.some(f => f.role === 'message' && f.type !== 'textarea')) {
    for (const f of list) if (f.role === 'message' && f.type !== 'textarea') { f.role = 'other'; f.confidence = 0.3; }
  }
  if (!list.some(f => f.role === 'message') && textareas.length === 1) {
    textareas[0].role = 'message'; textareas[0].confidence = 0.6;
  }
  // name / kana halves
  for (const f of list) {
    if (f.role !== 'name' && f.role !== 'kana') continue;
    const side = nameSide(f);
    if (side) { f.role = `${f.role === 'name' ? 'name' : 'kana'}_${side}`; f.confidence = Math.min(f.confidence, 0.9); }
  }
  // runs of identical roles in document order: 2 unlabeled name/kana boxes = sei+mei; tel/zip/address parts
  for (let i = 0; i < list.length;) {
    let j = i + 1;
    while (j < list.length && list[j].role === list[i].role && list[j].form_index === list[i].form_index) j++;
    const run = list.slice(i, j);
    const role = list[i].role;
    if (run.length === 2 && (role === 'name' || role === 'kana')) {
      run[0].role = role + '_sei'; run[1].role = role + '_mei';
      run.forEach(f => { f.confidence = 0.7; });
    } else if (run.length >= 2 && ['tel', 'zip', 'address'].includes(role)) {
      run.forEach((f, k) => { f.part = k + 1; f.parts = run.length; });
    } else if (run.length === 2 && role === 'email') {
      run[1].role = 'email_confirm'; run[1].confidence = 0.7;
    }
    i = j;
  }
  // a second plain email box anywhere in the same form is the confirmation box
  const emails = list.filter(f => f.role === 'email');
  if (emails.length === 2 && emails[0].form_index === emails[1].form_index) { emails[1].role = 'email_confirm'; emails[1].confidence = 0.7; }
  return list;
}

/** The <form> that carries the letter (its textarea), or -1. */
export function targetFormIndex(fields) {
  const msg = fields.find(f => f.role === 'message');
  return msg ? msg.form_index : -1;
}

// ---------------------------------------------------------------- values
export function toKatakana(text) {
  return [...String(text || '').normalize('NFKC')].map(c => (c >= 'ぁ' && c <= 'ゖ') ? String.fromCharCode(c.charCodeAt(0) + 0x60) : c).join('');
}
export function toHiragana(text) {
  return [...String(text || '')].map(c => (c >= 'ァ' && c <= 'ヶ') ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c).join('');
}
const HALF = (() => {
  const table = { '　': ' ', 'ー': 'ｰ', '・': '･' };
  for (let cp = 0xFF66; cp < 0xFF9E; cp++) {
    const h = String.fromCharCode(cp);
    const full = h.normalize('NFKC');
    if (full.length === 1 && !(full in table)) table[full] = h;
    for (const mark of ['ﾞ', 'ﾟ']) {
      const comp = (h + mark).normalize('NFKC');
      if (comp.length === 1 && comp !== full && !(comp in table)) table[comp] = h + mark;
    }
  }
  return table;
})();
export const toHalfKana = text => [...toKatakana(text)].map(c => HALF[c] ?? c).join('');

/** Which kana the box asks for: 'half' / 'hira' / 'kata' (default). */
export function kanaScript(f) {
  const own = [...(f.label_parts || []), f.name, f.id, f.placeholder, f.title].join(' ');
  const sample = String(f.placeholder || '').replace(/ふりがな|フリガナ|ﾌﾘｶﾞﾅ/g, '');
  if (/半角/.test(own) || /[ｦ-ﾟ]/.test(sample)) return 'half';
  const hira = (sample.match(/[ぁ-ゖ]/g) || []).length;
  const kata = (sample.match(/[ァ-ヺ]/g) || []).length;
  if (hira >= 2 && hira > kata && !/カタカナ/.test(own)) return 'hira';
  if (kata >= 2 && kata > hira && !/ひらがな/.test(own)) return 'kata';
  for (const text of [own, f.hint || '']) {
    if (/半角\s*(カタ)?カナ|半角\s*ｶﾅ/.test(text)) return 'half';
    if (/ひらがな|平仮名/.test(text)) return 'hira';
    if (/カタカナ|ｶﾀｶﾅ/.test(text)) return 'kata';
  }
  return 'kata';
}
export function kanaFor(f, value) {
  const script = kanaScript(f);
  const base = toKatakana(value).trim().replace(/[\s　]+/g, script === 'half' ? ' ' : '　');
  if (script === 'hira') return toHiragana(base);
  if (script === 'half') return toHalfKana(base);
  return base;
}

export function splitName(full) {
  const parts = String(full || '').trim().split(/[\s　]+/).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts.slice(1).join(' ')];
  return [parts[0] || '', ''];
}

export const digitsOf = v => String(v || '').normalize('NFKC').replace(/\D/g, '');

/** ['090','1234','5678'] / ['03','1234','5678'] / ['0120','123','456']; [] when unknown. */
export function phoneThree(phone) {
  const written = String(phone || '').normalize('NFKC').split(/[-‐―ー－\s().]+/).filter(Boolean);
  if (written.length === 3 && written.every(p => /^\d+$/.test(p))) return written;
  const d = digitsOf(phone);
  if (d.length === 11 && /^0[5789]0/.test(d)) return [d.slice(0, 3), d.slice(3, 7), d.slice(7)];
  if (d.length === 10) {
    if (/^(0120|0800)/.test(d)) return [d.slice(0, 4), d.slice(4, 7), d.slice(7)];
    if (/^0[36]/.test(d)) return [d.slice(0, 2), d.slice(2, 6), d.slice(6)];
    return [d.slice(0, 3), d.slice(3, 6), d.slice(6)];
  }
  return [];
}

export function splitPhone(phone, boxes) {
  const three = phoneThree(phone);
  if (!three.length) return [];
  if (boxes === 3) return three;
  if (boxes === 2) return [three[0], three[1] + three[2]];
  return [];
}

function patternOk(f, v) {
  if (f.maxlength && v.length > f.maxlength) return false;
  if (f.pattern) {
    try { if (!new RegExp(`^(?:${f.pattern})$`, 'v').test(v)) return false; } catch {
      try { if (!new RegExp(`^(?:${f.pattern})$`).test(v)) return false; } catch { return true; }
    }
  }
  return true;
}

const NO_HYPHEN = /ハイフン\s*(なし|無し|不要|を除|を入れず|を含めず|抜き)|ハイフン無|半角数字のみ|数字のみ/;

function spellNumber(f, role, value) {
  const d = digitsOf(value);
  let opts;
  if (role === 'zip' && d.length === 7) opts = [`${d.slice(0, 3)}-${d.slice(3)}`, d];
  else if (role === 'tel' && d) { const t = phoneThree(value); opts = [String(value).trim(), t.length ? t.join('-') : '', d].filter(Boolean); }
  else return String(value);
  const ctx = [f.placeholder, f.hint, ...(f.label_parts || [])].join(' ');
  if (NO_HYPHEN.test(ctx) || (/^\d{7,11}$/.test(String(f.placeholder || '').normalize('NFKC').replace(/^例[:：]?\s*/, '')))) opts = [d, ...opts];
  return opts.find(v => patternOk(f, v)) || opts[0];
}

export function normalizeValues(v) {
  const out = { ...v };
  const alias = { phone: 'tel', postal: 'zip', postcode: 'zip', body: 'message', website: 'url', name_kana: 'kana',
                  prefecture: 'pref', company_name: 'company', inquiry: 'inquiry_type', title: 'position' };
  for (const [a, b] of Object.entries(alias)) if (out[a] !== undefined && out[b] === undefined) out[b] = out[a];
  if (!out.name && (out.name_sei || out.name_mei)) out.name = [out.name_sei, out.name_mei].filter(Boolean).join(' ');
  if (out.name && !out.name_sei) [out.name_sei, out.name_mei] = splitName(out.name);
  if (!out.kana && (out.kana_sei || out.kana_mei)) out.kana = [out.kana_sei, out.kana_mei].filter(Boolean).join(' ');
  if (out.kana && !out.kana_sei) [out.kana_sei, out.kana_mei] = splitName(out.kana);
  if (out.email && !out.email_confirm) out.email_confirm = out.email;
  return out;
}

/** Option chosen for a select / radio group, or null. */
export function pickOption(f, values) {
  const opts = (f.options || []).filter(o => !o.disabled && String(o.value) !== '' && !isPlaceholderOption(o.text));
  if (!opts.length) return null;
  const find = prefs => {
    for (const p of prefs.filter(Boolean)) {
      const exact = opts.find(o => o.text === p || o.value === p);
      if (exact) return exact;
      const part = opts.find(o => o.text.includes(p));
      if (part) return part;
    }
    return null;
  };
  if (f.role === 'pref') return find([values.pref]);
  if (f.role === 'contact_method') return find([values.contact_method, 'メール', 'E-mail', 'Eメール', 'email', 'mail']) || (f.required ? opts[0] : null);
  if (f.role === 'inquiry_type') {
    const picked = find([values.inquiry_type, ...INQUIRY_PREFS]);
    if (picked) return picked;
    return f.required ? opts[opts.length - 1] : null;
  }
  const own = values[f.role];
  return own ? find([own]) : null;
}

/**
 * Decide what goes where. Returns {actions, filled, unfilled_required, skipped}.
 * map = {selector: value} overrides from the agent win over every heuristic.
 */
export function planFill(fields, rawValues, map = {}) {
  const values = normalizeValues(rawValues || {});
  const formIdx = targetFormIndex(fields);
  const scoped = formIdx >= 0 ? fields.filter(f => f.form_index === formIdx) : fields;
  const actions = [], unfilled = [], notes = [];
  const used = new Set();
  const mapKeys = Object.keys(map || {});
  const hasPref = scoped.some(f => f.role === 'pref');
  const label = f => (f.label || f.name || f.selector).slice(0, 60);

  for (const f of scoped) {
    const optionKey = (f.options || []).find(o => o.selector && mapKeys.includes(o.selector));
    if (mapKeys.includes(f.selector) || optionKey) {
      const key = optionKey ? optionKey.selector : f.selector;
      actions.push(mapAction(f, key, map[key]));
      used.add(key);
      continue;
    }
    let value;
    const r = f.role;
    if (r === 'privacy_agree') { actions.push({ op: 'check', selector: f.selector, role: r, label: label(f) }); continue; }
    if (f.type === 'checkbox' && !(f.options || []).length) {
      if (f.required) unfilled.push({ selector: f.selector, label: label(f), role: r, reason: 'required_checkbox_unknown' });
      continue;
    }
    if (f.type === 'radio' || f.type === 'checkbox' || f.type === 'select') {
      const o = pickOption(f, values);
      if (o) {
        if (f.type === 'select') actions.push({ op: 'select', selector: f.selector, value: o.value, role: r, label: label(f), text: o.text });
        else actions.push({ op: 'check', selector: o.selector, role: r, label: label(f), text: o.text });
      } else if (f.required) unfilled.push({ selector: f.selector, label: label(f), role: r, options: (f.options || []).map(o => o.text).slice(0, 20) });
      continue;
    }
    switch (r) {
      case 'name_sei': case 'name_mei': case 'name': case 'company': case 'department': case 'position':
      case 'email': case 'email_confirm': case 'url': case 'subject': case 'contact_method':
        value = values[r]; break;
      case 'kana_sei': case 'kana_mei': case 'kana': case 'company_kana':
        value = values[r] ? kanaFor(f, values[r]) : ''; break;
      case 'pref': value = values.pref; break;
      case 'message': value = values.message; break;
      case 'tel':
        if (f.parts) { value = splitPhone(values.tel, f.parts)[f.part - 1]; }
        else value = values.tel ? spellNumber(f, 'tel', values.tel) : '';
        break;
      case 'zip': {
        const d = digitsOf(values.zip);
        if (f.parts === 2 && d.length === 7) value = f.part === 1 ? d.slice(0, 3) : d.slice(3);
        else if (!f.parts) value = values.zip ? spellNumber(f, 'zip', values.zip) : '';
        break;
      }
      case 'address': {
        let a = String(values.address || '');
        if (hasPref && values.pref && a.startsWith(values.pref)) a = a.slice(values.pref.length);
        if (!f.parts || f.part === 1) value = a;
        break;
      }
      default: value = '';
    }
    if (r === 'message' && value && f.maxlength && value.length > f.maxlength) {
      unfilled.push({ selector: f.selector, label: label(f), role: r, reason: `message_too_long:${value.length}>${f.maxlength}` });
      continue;
    }
    if (value) {
      actions.push({ op: 'fill', selector: f.selector, value: String(value), role: r, label: label(f) });
    } else if (f.required) {
      unfilled.push({ selector: f.selector, label: label(f), role: r });
    }
  }
  for (const key of mapKeys) if (!used.has(key)) actions.push(mapAction(null, key, map[key]));
  if (!scoped.some(f => f.role === 'message') && !mapKeys.length) notes.push('no_message_field');
  return { actions, unfilled_required: unfilled, form_index: formIdx, notes };
}

function mapAction(f, selector, value) {
  if (value === true || value === false) return { op: value ? 'check' : 'uncheck', selector, role: f?.role || 'mapped', mapped: true };
  if (f && f.type === 'select') return { op: 'select', selector, value: String(value), role: f.role, mapped: true };
  if (f && (f.type === 'radio' || f.type === 'checkbox')) {
    const o = (f.options || []).find(x => x.selector === selector || x.value === String(value) || x.text === String(value));
    return { op: 'check', selector: o ? o.selector : selector, role: f.role, mapped: true };
  }
  return { op: 'fill', selector, value: String(value), role: f?.role || 'mapped', mapped: true };
}

// ---------------------------------------------------------------- page judgements
const SALES_RE = /営業|セールス|売り込み|売込み|勧誘|広告宣伝|ダイレクトメール|DM送信|商談|営利目的|販売目的|宣伝/;
const SALES_NOT = /営業(時間|日|所|部|中|拠点|エリア|担当|カレンダー|案内|時|開始|終了|品目|許可|年数|成績|利益|職|マン|の皆様|拠点)/g;
const BAN_RE = /お断り|ご遠慮|遠慮(ください|下さい|願)|受け付けて?おりません|受付ておりません|受け付けません|受付けません|禁止|お控え|いたしかねます|致しかねます|できません|出来ません|しないでください|返信(はいたし|は致し|いたし|致し)ません|対応(いたし|致し|して)(かね|おりません|ません)/;

/** {found, text}: a sentence refusing sales contact (営業お断り etc.). */
export function detectSalesRefusal(text) {
  const sentences = String(text || '').split(/[。\n！!]/);
  for (const s of sentences) {
    if (s.length > 240) continue;
    const scrubbed = s.replace(SALES_NOT, '□');
    if (SALES_RE.test(scrubbed) && BAN_RE.test(scrubbed)) return { found: true, text: norm(s).slice(0, 160) };
  }
  return { found: false, text: '' };
}

export const CAPTCHA_FIELD = /captcha|画像認証|認証コード|認証番号|あなたはロボット|security ?code|スパム防止|計算.*答え|quiz/i;

/** {has_captcha, captcha_kind} from an inventory (rendered widgets and challenge fields only). */
export function captchaOf(inv) {
  const kinds = [...(inv.captcha || [])];
  for (const f of inv.fields || []) {
    const blob = [f.label, f.name, f.id, f.placeholder].join(' ');
    if (CAPTCHA_FIELD.test(blob)) kinds.push('captcha_field');
  }
  const uniq = [...new Set(kinds)];
  if (uniq.length) return { has_captcha: true, captcha_kind: uniq.join(',') };
  return { has_captcha: false, captcha_kind: inv.recaptcha_v3 ? 'recaptcha_v3_invisible' : '' };
}

const SUBMIT_WORDS = ['送信する', '送信', '確認画面', '確認する', '入力内容を確認', '内容確認', '確認', '同意して', '上記に同意',
                      'この内容で', '問い合わせる', '問合せる', '申し込む', '次へ', 'submit', 'send', 'confirm', 'next'];
const BACK_WORDS = ['戻る', '修正', 'キャンセル', 'やり直', 'クリア', 'リセット', '検索', 'back', 'cancel', 'reset', 'edit', 'search', 'clear'];
const CONFIRM_SUBMIT_WORDS = ['この内容で送信', '上記内容で送信', '送信内容を確定', '内容を送信', '送信する', '送信', '確定', 'send', 'submit'];

/** The button that posts the target form. */
export function findSubmit(inv, formIndex) {
  let btns = (inv.buttons || []).filter(b => !b.disabled);
  if (formIndex >= 0) btns = btns.filter(b => b.form_index === formIndex).length ? btns.filter(b => b.form_index === formIndex) : btns;
  const pools = [btns.filter(b => b.visible), btns];
  for (const pool of pools) {
    const ok = pool.filter(b => !BACK_WORDS.some(w => labelToken(b.text + ' ' + b.name).includes(labelToken(w))));
    for (const w of SUBMIT_WORDS) {
      const hit = ok.find(b => labelToken(b.text).includes(labelToken(w)));
      if (hit) return hit;
    }
    const typed = ok.find(b => b.type === 'submit' || b.type === 'image');
    if (typed) return typed;
  }
  return null;
}

/** The button that finalises a confirmation page (never 戻る / 確認). */
export function findConfirmSubmit(inv) {
  let best = null, bestRank = 99;
  for (const b of inv.buttons || []) {
    if (!b.visible || b.disabled) continue;
    const t = labelToken(b.text + ' ' + b.name);
    if (!t) continue;
    if (BACK_WORDS.some(w => t.includes(labelToken(w)))) continue;
    if (/確認|kakunin/.test(t)) continue;
    const rank = t === 'ok' ? 0 : CONFIRM_SUBMIT_WORDS.findIndex(w => t.includes(labelToken(w))) + 1;
    if (rank <= 0 && t !== 'ok') continue;
    if (rank < bestRank) { best = b; bestRank = rank; }
  }
  return best;
}

const ACCEPT_MARKERS = ['送信しました', '送信が完了', '送信完了', 'ありがとうございま', '受け付けました', '受付完了', '受付いたしました',
                        'お問い合わせを受け', '完了しました', 'thank you', 'thanks for', 'successfully sent', 'メッセージは送信されました'];
const ERROR_MARKERS = ['必須項目', '入力してください', '未入力', 'エラー', '不正', '選択してください', 'は必須です', '誤りがあります',
                       '送信に失敗', '失敗しました', '送信できませんでした', '未選択です', 'スパムと判定', 'invalid', 'required field'];
const VALIDATION_ERROR = /(入力|記入|選択)(内容|項目)?[^。\n]{0,24}(誤り|不備|不足)/;
const CONFIRM_TEXT_MARKERS = ['確認画面', '内容をご確認', 'ご確認の上', '以下の内容で', '下記の内容で', '入力内容の確認', '入力内容をご確認',
                              'この内容で送信', '内容確認', 'まだ送信されていません', '送信は完了していません', '送信内容の確認'];
const CONFIRM_URL_WORDS = ['conf', 'confirm', 'kakunin', 'check', 'preview'];
const ACCEPT_URL_TOKENS = ['complete', 'completed', 'thanks', 'thankyou', 'thank', 'done', 'finish', 'finished', 'end', 'sent', 'success', 'kanryo'];

const urlTokens = u => { try { const x = new URL(u); return new Set((x.pathname + ' ' + x.search).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)); } catch { return new Set(); } };
const sameOrigin = (a, b) => { try { return new URL(a).origin === new URL(b).origin; } catch { return false; } };
function newTokens(before, after) { const b = urlTokens(before); return [...urlTokens(after)].filter(t => !b.has(t)); }

function stripPayload(text, payload) {
  let v = norm(text);
  for (const p of [...payload].map(norm).filter(x => x.length >= 2).sort((a, b) => b.length - a.length)) v = v.split(p).join(' ');
  return v;
}

/**
 * Compare a page after a click with the page before it.
 * Returns {state, evidence}: state = submitted | confirm | validation_error | captcha | error | unclear.
 * `origin` = the first form page (after a confirm click, a marker it already had is not fresh).
 */
export function judgeAfterClick(before, after, payload = [], origin = null) {
  if (!after || after.ready === false) return { state: 'unclear', evidence: 'page_not_ready' };
  const bt = stripPayload(before.text, payload);
  const at = stripPayload(after.text, payload);
  const seen = bt + '\n' + (origin ? stripPayload(origin.text, payload) : '');
  const cap = captchaOf(after);
  if (cap.has_captcha && !captchaOf(before).has_captcha) return { state: 'captcha', evidence: `captcha_after_click:${cap.captcha_kind}` };
  if (after.cf7) {
    const toks = after.cf7.cls.split(/\s+/);
    if (toks.includes('sent')) return { state: 'submitted', evidence: `cf7:sent ${after.cf7.response}`.trim() };
    if (toks.includes('invalid') || toks.includes('unaccepted')) return { state: 'validation_error', evidence: `cf7:invalid ${after.cf7.response}`.trim() };
    const bad = ['spam', 'failed', 'aborted'].find(t => toks.includes(t));
    if (bad) return { state: 'error', evidence: `cf7:${bad} ${after.cf7.response}`.trim() };
  }
  const errors = ERROR_MARKERS.filter(m => at.toLowerCase().includes(m) && !seen.toLowerCase().includes(m));
  if (VALIDATION_ERROR.test(at) && !VALIDATION_ERROR.test(seen)) errors.push(at.match(VALIDATION_ERROR)[0]);
  const invalid = (after.fields || []).filter(f => f.invalid).map(f => f.name || f.selector);
  if (invalid.length) errors.push('invalid_field:' + invalid.slice(0, 3).join('/'));
  const accepts = ACCEPT_MARKERS.filter(m => at.toLowerCase().includes(m) && !seen.toLowerCase().includes(m));
  const moved = after.url !== before.url;
  const newUrlTok = moved && sameOrigin(before.url, after.url) ? newTokens(before.url, after.url) : [];
  const confirmBtn = findConfirmSubmit(after);
  const hasBack = (after.buttons || []).some(b => b.visible && /戻る|修正|キャンセル/.test(labelToken(b.text)));
  const editableMsg = (after.fields || []).some(f => f.tag === 'TEXTAREA');
  if (errors.length && !accepts.length) return { state: 'validation_error', evidence: errors.slice(0, 3).join(' | ') + ' :: ' + excerpt(at, errors[0]) };
  if (confirmBtn && !accepts.length) {
    const urlConfirm = newUrlTok.some(t => CONFIRM_URL_WORDS.some(w => t.includes(w)));
    const textConfirm = CONFIRM_TEXT_MARKERS.find(m => at.includes(m) && !seen.includes(m));
    const echoed = payload.some(p => norm(p).length >= 8 && norm(after.text).includes(norm(p).slice(0, 20)));
    if (urlConfirm || textConfirm || (hasBack && echoed && !editableMsg)) {
      return { state: 'confirm', evidence: textConfirm ? `confirm_text:${textConfirm}` : urlConfirm ? `confirm_url:${after.url}` : 'confirm_echo', button: confirmBtn };
    }
  }
  if (accepts.length && !errors.length) return { state: 'submitted', evidence: `accept:${accepts[0]} :: ${excerpt(at, accepts[0])}` };
  const thanksTok = newUrlTok.find(t => ACCEPT_URL_TOKENS.includes(t));
  if (thanksTok && !errors.length) return { state: 'submitted', evidence: `thanks_url:${after.url}` };
  const formGone = (before.textarea_count || 0) > 0 && (after.textarea_count || 0) === 0
    && !(after.fields || []).some(f => ['text', 'email', 'tel', 'textarea'].includes(f.type));
  if (formGone && !errors.length && !confirmBtn) return { state: 'submitted', evidence: `form_gone${moved ? ':' + after.url : ''} :: ${at.slice(0, 120)}` };
  if (accepts.length && errors.length) return { state: 'unclear', evidence: `accept_and_error:${accepts[0]}/${errors[0]}` };
  return { state: 'unclear', evidence: moved ? `url_changed:${after.url}` : 'page_unchanged' };
}

function excerpt(text, marker) {
  const i = text.toLowerCase().indexOf(String(marker).toLowerCase());
  if (i < 0) return text.slice(0, 120);
  return text.slice(Math.max(0, i - 40), i + 80);
}

// ---------------------------------------------------------------- contact page search
const CONTACT_TEXT = /お問い?合わ?せ|お問合せ|問い合わせ|問合せ|ご相談|コンタクト|contact|inquiry|enquiry/i;
const CONTACT_HREF = /contact|inquiry|enquiry|toiawase|otoiawase|mailform|form|soudan|consult/i;
const NOT_CONTACT = /recruit|採用|求人|entry|career|job|faq|よくある|privacy|プライバシー|login|ログイン|資料請求|download/i;

export function scoreContactLink(link) {
  const text = `${link.text} ${link.img_alt || ''}`;
  let href = link.href;
  try { const u = new URL(link.href); href = decodeURIComponent(u.pathname + u.search); } catch { /* keep raw */ }
  let s = 0;
  if (CONTACT_TEXT.test(text)) s += 3;
  if (CONTACT_HREF.test(href)) s += 2;
  if (/お問い?合わ?せ|問合せ/.test(href)) s += 2;
  if (s && NOT_CONTACT.test(text + ' ' + href)) s -= 3;
  return s;
}
