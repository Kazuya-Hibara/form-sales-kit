// Browser work: find / inspect / fill (+ submit). Judgement lives in heuristics.mjs,
// guards in guards.mjs; this file only drives Playwright and records the outcome.
import path from 'node:path';
import { chromium } from 'playwright';
import { pageInventory, pageLinks } from './inventory.mjs';
import {
  assignRoles, buildFields, captchaOf, detectSalesRefusal, findConfirmSubmit, findSubmit, judgeAfterClick,
  normalizeValues, planFill, scoreContactLink, targetFormIndex,
} from './heuristics.mjs';
import { gapRemainingSec, preSubmitGuard } from './guards.mjs';
import { acquireLock, appendLedger, ensureWork, loadConfig, readLedger, readSuppress } from './work.mjs';
import { isSharedFormHost, log, normalizeDomain, sameSite, shortHash, sleep, stamp } from './util.mjs';

export async function openBrowser({ headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', viewport: { width: 1280, height: 900 } });
  if (process.env.FSK_BLOCK_EXTERNAL === '1') {
    // Test / offline mode: nothing leaves this machine.
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      const local = ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || ['data:', 'about:', 'blob:'].includes(u.protocol);
      return local ? route.continue() : route.abort();
    });
  }
  return { browser, context };
}

// headless-shell can take 10 s+ to shut down on macOS; the CLI exits right after, and
// Playwright kills the browser process on exit, so do not wait for a graceful close.
export async function closeBrowser(browser) {
  await Promise.race([browser.close().catch(() => {}), sleep(1000)]);
}

async function load(page, url) {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.waitForLoadState('networkidle', { timeout: 4000 }); } catch { /* long-polling sites never idle */ }
  return resp;
}

async function inventoryOf(target) {
  for (let i = 0; i < 3; i++) {
    try { return await target.evaluate(pageInventory); } catch (err) {
      if (i === 2) throw err;
      await sleep(500);                         // navigation in flight destroyed the context
    }
  }
  return null;
}

function analyse(inv) {
  const fields = assignRoles(buildFields(inv.fields || []));
  return { fields, form_index: targetFormIndex(fields), captcha: captchaOf(inv), sales_refusal: detectSalesRefusal(inv.raw_text || inv.text) };
}

const publicField = f => {
  const out = { selector: f.selector, role: f.role, confidence: f.confidence, tag: f.tag, type: f.type, name: f.name, id: f.id,
                label: f.label, placeholder: f.placeholder, required: f.required, form_index: f.form_index };
  if (f.maxlength) out.maxlength = f.maxlength;
  if (f.part) { out.part = f.part; out.parts = f.parts; }
  if (f.options?.length) out.options = f.options.map(o => (o.selector ? { value: o.value, text: o.text, selector: o.selector } : { value: o.value, text: o.text }));
  return out;
};

// ---------------------------------------------------------------- find
export async function find(homeUrl, { headless = true } = {}) {
  const { browser, context } = await openBrowser({ headless });
  try {
    const page = await context.newPage();
    await load(page, homeUrl);
    const home = page.url();
    const homeInv = await inventoryOf(page);
    const links = await page.evaluate(pageLinks);
    const seen = new Set();
    const pool = [];
    const addLinks = (list, bonus = 0) => {
      for (const l of list) {
        const url = l.href.split('#')[0];
        if (!sameSite(url, home) || seen.has(url)) continue;
        const score = scoreContactLink(l) + bonus;
        if (score <= 0) continue;
        seen.add(url);
        pool.push({ url, text: l.text || l.img_alt, score });
      }
    };
    seen.add(home.split('#')[0]);
    const selfScore = scoreContactLink({ href: home, text: '' });
    const candidates = [];
    if (homeInv.textarea_count > 0) candidates.push({ url: home, text: '(入力したページ自体)', score: selfScore > 0 ? 9 : 1 });
    addLinks(links);
    const result = { ok: true, homepage: home, form_url: null, embedded: false, candidates: [], has_captcha: false, captcha_kind: '',
                     sales_refusal: detectSalesRefusal(homeInv.raw_text || homeInv.text) };
    let loads = 0;
    while (loads < 8) {
      const queue = [...candidates, ...pool.filter(p => !candidates.includes(p))].sort((a, b) => b.score - a.score);
      const next = queue.find(c => c.has_form === undefined);
      if (!next) break;
      if (!candidates.includes(next)) candidates.push(next);
      let inv = homeInv;
      if (next.url !== home) {
        loads++;
        try { await load(page, next.url); inv = await inventoryOf(page); } catch (err) { next.has_form = false; next.error = String(err.message).slice(0, 120); continue; }
      }
      next.has_form = inv.textarea_count > 0;
      let formInv = next.has_form ? inv : null;
      let formUrl = next.has_form ? page.url() : null;
      if (!formInv && next.url !== home) {
        for (const frame of page.frames()) {
          if (frame === page.mainFrame()) continue;
          try {
            const fi = await inventoryOf(frame);
            if (fi && fi.textarea_count > 0) { formInv = fi; formUrl = frame.url(); result.embedded = true; next.has_form = true; break; }
          } catch { /* cross-origin frame not ready */ }
        }
      }
      if (formInv) {
        result.form_url = formUrl;
        Object.assign(result, captchaOf(formInv));
        const sr = detectSalesRefusal(formInv.raw_text || formInv.text);
        if (sr.found) result.sales_refusal = sr;
        if (result.embedded && !result.sales_refusal.found) {
          const outer = await inventoryOf(page);
          const sr2 = detectSalesRefusal(outer.raw_text || outer.text);
          if (sr2.found) result.sales_refusal = sr2;
        }
        break;
      }
      // second hop: 「フォームはこちら」 links on a contact page without a form
      if (next.url !== home) addLinks(await page.evaluate(pageLinks), -1);
    }
    result.candidates = candidates.concat(pool.filter(p => !candidates.includes(p))).slice(0, 10)
      .map(c => ({ url: c.url, text: c.text, score: c.score, has_form: c.has_form ?? null }));
    result.status = result.form_url ? 'found' : 'not_found';
    return result;
  } finally {
    await closeBrowser(browser);
  }
}

// ---------------------------------------------------------------- inspect
export async function inspect(formUrl, { headless = true } = {}) {
  const { browser, context } = await openBrowser({ headless });
  try {
    const page = await context.newPage();
    await load(page, formUrl);
    const inv = await inventoryOf(page);
    const a = analyse(inv);
    const btn = findSubmit(inv, a.form_index);
    return {
      ok: true, form_url: page.url(), title: inv.title, form_index: a.form_index,
      has_captcha: a.captcha.has_captcha, captcha_kind: a.captcha.captcha_kind, sales_refusal: a.sales_refusal,
      submit_button: btn ? { selector: btn.selector, text: btn.text } : null,
      fields: a.fields.filter(f => a.form_index < 0 || f.form_index === a.form_index).map(publicField),
      other_form_fields: a.form_index < 0 ? 0 : a.fields.filter(f => f.form_index !== a.form_index).length,
      iframes: inv.textarea_count ? [] : inv.frames,
    };
  } finally {
    await closeBrowser(browser);
  }
}

// ---------------------------------------------------------------- fill (+ submit)
async function applyAction(page, a) {
  const loc = page.locator(a.selector).first();
  if (a.op === 'fill') {
    await loc.fill(a.value, { timeout: 5000 });
  } else if (a.op === 'select') {
    try { await loc.selectOption(a.value, { timeout: 5000 }); } catch { await loc.selectOption({ label: a.value }, { timeout: 5000 }); }
  } else {
    const want = a.op === 'check';
    try {
      if (want) await loc.check({ force: true, timeout: 3000 }); else await loc.uncheck({ force: true, timeout: 3000 });
    } catch {
      await loc.evaluate((el, w) => {
        if (el.checked !== w) el.click();
        if (el.checked !== w) { el.checked = w; el.dispatchEvent(new Event('change', { bubbles: true })); }
      }, want);
    }
  }
}

async function settle(page) {
  const deadline = Date.now() + 15000;
  let last = '', since = Date.now();
  await sleep(300);
  while (Date.now() < deadline) {
    let snap;
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      snap = await page.evaluate(() => {
        const f = document.querySelector('form.wpcf7-form');
        return { url: location.href, len: document.body ? document.body.innerText.length : -1,
                 cf7: f ? f.className : '', busy: !!(f && /submitting/.test(f.className)) };
      });
    } catch { await sleep(300); continue; }
    const sig = JSON.stringify(snap);
    if (sig !== last) { last = sig; since = Date.now(); } else if (!snap.busy && Date.now() - since >= 1500) break;
    await sleep(250);
  }
  try { await page.waitForLoadState('networkidle', { timeout: 3000 }); } catch { /* ignore */ }
}

async function clickButton(page, selector) {
  const loc = page.locator(selector).first();
  try { await loc.click({ timeout: 8000 }); } catch { await loc.evaluate(el => el.click()); }
}

function shotPath(domain, tag) {
  return path.join(ensureWork(), 'shots', `${(domain || 'page').replace(/[^a-z0-9.-]/gi, '_')}-${stamp()}-${tag}.png`);
}

async function shoot(page, file) {
  try { await page.screenshot({ path: file, fullPage: true, timeout: 15000 }); return file; } catch (err) {
    log('screenshot failed:', err.message);
    return null;
  }
}

/**
 * opts: {values, map, submit, headless, site, company, targetEmail, wait}
 * Without submit: fill + screenshot, never click. With submit: guards → fill → click → confirm → receipt.
 */
export async function fill(formUrl, opts) {
  const cfg = loadConfig();
  const values = normalizeValues(opts.values || {});
  const submit = !!opts.submit;
  if (!opts.site && isSharedFormHost(formUrl)) {
    if (submit) return { ok: false, status: 'error', error: 'フォームが外部サービス上にあります。--site <会社のホームページURL> を付けてください (1 社 1 回の判定に使います)' };
  }
  const domain = normalizeDomain(opts.site || formUrl);
  const base = { ok: true, mode: submit ? 'submit' : 'dry_run', domain, form_url: formUrl, company: opts.company || '' };
  let release = null;
  const record = (status, extra) => {
    const row = appendLedger({ company: opts.company || '', domain, form_url: formUrl, status,
                               message_hash: values.message ? shortHash(values.message) : '', ...extra });
    return row;
  };
  if (submit) {
    release = acquireLock();
    if (!release) return { ...base, status: 'blocked_by_guard', guard: 'another_submit_running', evidence: '別の送信が実行中です。終わってから次を送ってください' };
    const g = preSubmitGuard({ domain, targetEmail: opts.targetEmail }, { ledger: readLedger(), suppress: readSuppress(), config: cfg });
    if (g) { release(); return { ...base, status: 'blocked_by_guard', guard: g.guard, evidence: g.detail }; }
    const early = opts.wait === false ? gapRemainingSec(readLedger(), cfg) : 0;
    if (early > 0) {
      release();
      return { ...base, status: 'blocked_by_guard', guard: 'min_gap', wait_sec: early, evidence: `前回の送信から ${cfg.min_gap_sec} 秒空けます (あと ${early} 秒)` };
    }
  }
  const headless = opts.headless ?? cfg.headless;
  let browser;
  try {
    const opened = await openBrowser({ headless });
    browser = opened.browser;
    const page = await opened.context.newPage();
    await load(page, formUrl);
    const inv = await inventoryOf(page);
    const a = analyse(inv);
    const out = { ...base, form_url: page.url(), has_captcha: a.captcha.has_captcha, captcha_kind: a.captcha.captcha_kind, sales_refusal: a.sales_refusal };
    if (submit && a.captcha.has_captcha) {
      const shot = await shoot(page, shotPath(domain, 'captcha'));
      record('captcha', { screenshot: shot, evidence: a.captcha.captcha_kind, clicked: false });
      return { ...out, status: 'captcha', evidence: `captcha:${a.captcha.captcha_kind}`, screenshot: shot };
    }
    if (submit && a.sales_refusal.found) {
      const shot = await shoot(page, shotPath(domain, 'refusal'));
      record('sales_refusal', { screenshot: shot, evidence: a.sales_refusal.text, clicked: false });
      return { ...out, status: 'sales_refusal', evidence: a.sales_refusal.text, screenshot: shot };
    }
    const plan = planFill(a.fields, values, opts.map || {});
    const filled = [], failed = [];
    for (const act of plan.actions) {
      try {
        await applyAction(page, act);
        filled.push({ selector: act.selector, role: act.role, op: act.op, value: act.op === 'fill' || act.op === 'select' ? act.value : true,
                      ...(act.text ? { text: act.text } : {}), ...(act.mapped ? { mapped: true } : {}) });
      } catch (err) {
        failed.push({ selector: act.selector, role: act.role, error: String(err.message).split('\n')[0].slice(0, 160) });
      }
    }
    await sleep(200);
    const inv2 = await inventoryOf(page);
    const formIdx = plan.form_index;
    const invalid = (inv2.fields || []).filter(f => (formIdx < 0 || f.form_index === formIdx) && !f.valid)
      .map(f => ({ selector: f.selector, name: f.name, label: (f.label_parts || [])[0] || '', message: f.validation_message }));
    const button = findSubmit(inv2, formIdx);
    const filledShot = await shoot(page, shotPath(domain, 'filled'));
    Object.assign(out, { filled, unfilled_required: plan.unfilled_required, failed, invalid,
                         submit_button: button ? { selector: button.selector, text: button.text } : null, screenshot: filledShot });
    if (plan.notes.includes('no_message_field')) out.notes = ['本文欄 (textarea) が見つかりません。inspect で確認し --map で指定してください'];
    if (!submit) {
      out.status = 'dry_run';
      out.ready = !plan.unfilled_required.length && !failed.length && !invalid.length && !!button && !a.captcha.has_captcha && !a.sales_refusal.found;
      return out;
    }
    const blockers = [];
    if (plan.notes.includes('no_message_field')) blockers.push('no_message_field');
    if (plan.unfilled_required.length) blockers.push('unfilled_required:' + plan.unfilled_required.map(u => u.label || u.selector).join('/'));
    if (failed.length) blockers.push('fill_failed:' + failed.map(f => f.selector).join('/'));
    if (invalid.length) blockers.push('invalid:' + invalid.map(f => `${f.label || f.name}(${f.message})`).join('/'));
    if (!button) blockers.push('submit_button_not_found');
    if (blockers.length) {
      record('validation_error', { screenshot: filledShot, evidence: blockers.join(' | ').slice(0, 300), clicked: false });
      return { ...out, status: 'validation_error', clicked: false, evidence: blockers.join(' | ') };
    }
    const wait = gapRemainingSec(readLedger(), cfg);
    if (wait > 0) {
      if (opts.wait === false) return { ...out, status: 'blocked_by_guard', guard: 'min_gap', wait_sec: wait, evidence: `前回の送信から ${cfg.min_gap_sec} 秒空けます (あと ${wait} 秒)` };
      log(`min gap: waiting ${wait}s`);
      await sleep(wait * 1000);
    }
    const payload = [values.message, values.email, values.company, values.name].filter(Boolean);
    const clickedAt = new Date().toISOString();
    log('click:', button.text || button.selector);
    await clickButton(page, button.selector);
    await settle(page);
    let after = await inventoryOf(page);
    let verdict = judgeAfterClick(inv2, after, payload);
    let confirmClicked = false;
    if (verdict.state === 'confirm') {
      const confirmBtn = findConfirmSubmit(after);
      log('confirm page:', verdict.evidence, '-> click', confirmBtn.text);
      const confirmPage = after;
      await clickButton(page, confirmBtn.selector);
      confirmClicked = true;
      await settle(page);
      after = await inventoryOf(page);
      verdict = judgeAfterClick(confirmPage, after, payload, inv2);
      if (verdict.state === 'confirm') verdict = { state: 'unclear', evidence: 'still_on_confirm_page:' + verdict.evidence };
    }
    const status = { submitted: 'submitted', validation_error: 'validation_error', captcha: 'captcha', error: 'error' }[verdict.state] || 'confirm_unclear';
    const postShot = await shoot(page, shotPath(domain, status));
    record(status, { screenshot: postShot, evidence: String(verdict.evidence).slice(0, 300), clicked: true, clicked_at: clickedAt,
                     confirm_clicked: confirmClicked, final_url: page.url() });
    return { ...out, status, clicked: true, confirm_clicked: confirmClicked, final_url: page.url(), evidence: verdict.evidence,
             screenshot: postShot, filled_screenshot: filledShot };
  } finally {
    if (browser) await closeBrowser(browser);
    if (release) release();
  }
}
