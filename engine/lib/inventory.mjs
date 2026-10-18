// Runs inside the page (page.evaluate). Self-contained: no closures over Node scope.
// Label sources follow the production sender's INVENTORY_JS (nearest caption first,
// never a neighbour's row), plus a stable CSS selector per control so the agent can
// address a field in a later process (map.json).
export function pageInventory() {
  if (!document.body || !document.documentElement) return { ready: false, url: location.href };
  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
  const cssStr = s => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const uniq = sel => { try { return document.querySelectorAll(sel).length === 1; } catch (e) { return false; } };
  const selectorFor = el => {
    const tag = el.tagName.toLowerCase();
    if (el.id && uniq('#' + CSS.escape(el.id))) return '#' + CSS.escape(el.id);
    if (el.name) {
      let s = tag + '[name="' + cssStr(el.name) + '"]';
      if (uniq(s)) return s;
      if ((el.type === 'radio' || el.type === 'checkbox') && el.value) {
        s += '[value="' + cssStr(el.value) + '"]';
        if (uniq(s)) return s;
      }
    }
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      if (n !== el && n.id && uniq('#' + CSS.escape(n.id))) { parts.unshift('#' + CSS.escape(n.id)); break; }
      let p = n.tagName.toLowerCase();
      const parent = n.parentElement;
      if (parent) {
        const sibs = Array.from(parent.children).filter(c => c.tagName === n.tagName);
        if (sibs.length > 1) p += ':nth-of-type(' + (sibs.indexOf(n) + 1) + ')';
      }
      parts.unshift(p);
      n = parent;
    }
    return parts.join(' > ');
  };
  const holdsControl = n => n && n.nodeType === 1 && (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName)
    || !!n.querySelector('textarea,select,input:not([type=hidden])'));
  const labelFor = el => {
    const parts = [];
    if (el.id) {
      try { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) parts.push(l.innerText); } catch (e) {}
    }
    const anc = el.closest('label');
    if (anc) parts.push(anc.innerText);
    if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
    const by = el.getAttribute('aria-labelledby');
    if (by) by.split(/\s+/).forEach(id => { const x = document.getElementById(id); if (x) parts.push(x.innerText); });
    const row = el.closest('tr');
    if (row) {
      const th = row.querySelector('th');
      if (th) parts.push(th.innerText);
      else { const td = row.querySelector('td'); if (td && !td.contains(el)) parts.push(td.innerText); }
    }
    const dd = el.closest('dd');
    if (dd && dd.previousElementSibling && dd.previousElementSibling.tagName === 'DT') parts.push(dd.previousElementSibling.innerText);
    const par = el.parentElement;
    if (par) {
      let own = '';
      for (const node of Array.from(par.childNodes)) {
        if (node === el || (node.contains && node.contains(el))) break;
        if (node.nodeType === 3) own += node.textContent;
        else if (!holdsControl(node)) own += (node.innerText || '');
      }
      own = norm(own);
      if (own && own.length <= 40) parts.push(own);
    }
    let sib = el.previousElementSibling, hops = 0;
    while (sib && hops < 2) {
      const s = norm(sib.innerText);
      if (s && s.length <= 40 && !holdsControl(sib)) parts.push(s);
      sib = sib.previousElementSibling; hops += 1;
    }
    if (par) {
      let psib = par.previousElementSibling, phops = 0;
      while (psib && phops < 2) {
        const s = norm(psib.innerText);
        if (s && s.length <= 40 && !holdsControl(psib)) parts.push(s);
        psib = psib.previousElementSibling; phops += 1;
      }
    }
    if (!parts.some(s => norm(s))) {
      let up = par;
      while (up) {
        if (up.querySelectorAll('input:not([type=hidden]),textarea,select').length > 1) break;
        let direct = '';
        for (const node of Array.from(up.childNodes)) {
          if (node === el || (node.contains && node.contains(el))) break;
          if (node.nodeType === 3) direct += node.textContent;
          else if (!holdsControl(node)) direct += (node.innerText || '');
        }
        direct = norm(direct);
        if (direct) { parts.push(direct.slice(0, 40)); break; }
        up = up.parentElement;
      }
    }
    const seen = new Set();
    return parts.map(norm).filter(s => s && !seen.has(s) && seen.add(s));
  };
  // The visible caption of one radio / checkbox option.
  const choiceText = el => {
    if (el.id) {
      try { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l && norm(l.innerText)) return norm(l.innerText); } catch (e) {}
    }
    const anc = el.closest('label');
    if (anc && norm(anc.innerText)) return norm(anc.innerText);
    let txt = '';
    let n = el.nextSibling;
    while (n && txt.length < 40) {
      if (n.nodeType === 1 && holdsControl(n)) break;
      txt += n.nodeType === 3 ? n.textContent : (n.innerText || '');
      n = n.nextSibling;
    }
    return norm(txt) || norm(el.value);
  };
  // The question a radio / checkbox group answers (legend, th, dt, or the caption before the group).
  const groupCaption = el => {
    const fs = el.closest('fieldset');
    if (fs) { const lg = Array.from(fs.children).find(c => c.tagName === 'LEGEND'); if (lg && norm(lg.innerText)) return norm(lg.innerText); }
    const row = el.closest('tr');
    if (row) { const th = row.querySelector('th'); if (th && norm(th.innerText)) return norm(th.innerText); }
    const dd = el.closest('dd');
    if (dd && dd.previousElementSibling && dd.previousElementSibling.tagName === 'DT') return norm(dd.previousElementSibling.innerText);
    const name = el.name;
    let box = el.parentElement;
    while (box && box !== document.body) {
      const same = name ? box.querySelectorAll('input[name="' + cssStr(name) + '"]').length : 1;
      const all = box.querySelectorAll('input:not([type=hidden]),textarea,select').length;
      if (all > same) break;
      let prev = box.previousElementSibling;
      if (prev && !holdsControl(prev) && norm(prev.innerText) && norm(prev.innerText).length <= 40) return norm(prev.innerText);
      let direct = '';
      for (const node of Array.from(box.childNodes)) {
        if (node.nodeType === 1 && holdsControl(node)) break;
        if (node.nodeType === 3) direct += node.textContent; else direct += (node.innerText || '');
      }
      if (norm(direct) && norm(direct).length <= 40) return norm(direct);
      box = box.parentElement;
    }
    return '';
  };
  const reqCaption = s => /必須|★|\*|＊|required/i.test(s) || (s.length <= 24 && /※/.test(s));
  const forms = Array.from(document.forms);
  const fields = [];
  document.querySelectorAll('input,textarea,select').forEach(el => {
    const type = (el.type || '').toLowerCase();
    if (el.name === '_wpcf7_ak_hp_textarea') return;
    if (el.disabled) return;
    if (['hidden', 'submit', 'button', 'reset', 'image', 'password', 'search'].includes(type)) return;
    const style = window.getComputedStyle(el);
    const choice = type === 'checkbox' || type === 'radio';
    const invisible = style.display === 'none' || style.visibility === 'hidden';
    // Honeypots: a CSS-hidden text box is never for a human. A CSS-hidden checkbox driven
    // by a styled label is still interactive.
    if (invisible && !choice) return;
    const r = el.getBoundingClientRect();
    if (!choice && r.width === 0 && r.height === 0) return;
    const parts = labelFor(el);
    const wrapEl = el.closest('dd,td,li,p,div,label');
    const hint = wrapEl ? norm(wrapEl.innerText) : '';
    fields.push({
      selector: selectorFor(el), tag: el.tagName, type: el.tagName === 'SELECT' ? 'select' : (el.tagName === 'TEXTAREA' ? 'textarea' : type),
      name: el.name || '', id: el.id || '', placeholder: el.placeholder || '', title: el.title || '',
      aria_label: el.getAttribute('aria-label') || '',
      label_parts: parts, label: parts.join(' / '),
      required: !!el.required || el.getAttribute('aria-required') === 'true'
        || el.classList.contains('wpcf7-validates-as-required')
        || (choice && !!el.closest('.wpcf7-validates-as-required'))
        || reqCaption(parts[0] || ''),
      maxlength: el.maxLength > 0 ? el.maxLength : null,
      pattern: el.getAttribute('pattern') || '',
      options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => ({ value: o.value, text: norm(o.text), disabled: o.disabled })) : [],
      choice_text: choice ? choiceText(el) : '',
      group_caption: choice ? groupCaption(el) : '',
      value: el.tagName === 'SELECT' ? el.value : (el.value || ''),
      checked: !!el.checked,
      form_index: forms.indexOf(el.form),
      hint: hint.length <= 160 ? hint : '',
      invalid: el.classList.contains('wpcf7-not-valid') || el.getAttribute('aria-invalid') === 'true',
      valid: el.checkValidity ? el.checkValidity() : true,
      validation_message: el.validationMessage || '',
    });
  });
  const BTN_SEL = 'button,input[type=submit],input[type=button],input[type=image],[role=button],a[href^="javascript:"]';
  const buttons = [];
  document.querySelectorAll(BTN_SEL).forEach(el => {
    if (buttons.length >= 120) return;
    if (el.querySelector && el.querySelector('form,input,textarea,select')) return;
    const type = (el.getAttribute('type') || (el.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase();
    const caption = norm(el.innerText || el.value || el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('aria-label') || '');
    const native = el.tagName === 'BUTTON' || el.tagName === 'INPUT';
    if (!caption && !native) return;
    if (!native && caption.length > 40) return;
    const st = window.getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const visible = !(st.display === 'none' || st.visibility === 'hidden') && (r.width > 0 || r.height > 0);
    buttons.push({ selector: selectorFor(el), tag: el.tagName, type, text: caption.slice(0, 80), name: el.name || '',
                   visible, disabled: !!el.disabled, form_index: forms.indexOf(el.form || el.closest('form')) });
  });
  // Only a rendered challenge blocks a human-less send; invisible reCAPTCHA v3 does not.
  const captcha = [];
  const box = el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; };
  document.querySelectorAll('.g-recaptcha,.h-captcha,.cf-turnstile,[data-sitekey]').forEach(el => {
    if ((el.getAttribute('data-size') || '') === 'invisible') return;
    const b = box(el);
    const cls = String(el.className || '');
    const kind = /h-captcha/.test(cls) ? 'hcaptcha' : /cf-turnstile/.test(cls) ? 'turnstile' : 'recaptcha_v2';
    if (b.h > 40 && b.w > 40) captcha.push(kind);
  });
  document.querySelectorAll('img').forEach(el => {
    const blob = ((el.alt || '') + ' ' + (el.src || '') + ' ' + (el.id || '')).toLowerCase();
    if (/captcha|認証画像|画像認証/.test(blob) && box(el).h > 15) captcha.push('image_captcha');
  });
  document.querySelectorAll('iframe').forEach(el => {
    const src = String(el.src || '').toLowerCase();
    if (!/recaptcha\/(api2|enterprise)\/anchor|hcaptcha|challenges\.cloudflare/.test(src)) return;
    if (/[?&#]size=invisible/.test(src) || el.closest('.grecaptcha-badge')) return;
    const b = box(el);
    if (window.getComputedStyle(el).visibility !== 'hidden' && b.h > 40 && b.w > 40)
      captcha.push(src.includes('hcaptcha') ? 'hcaptcha' : src.includes('cloudflare') ? 'turnstile' : 'recaptcha_v2');
  });
  const text = document.body.innerText || '';
  if (text.includes('私はロボットではありません')) captcha.push('recaptcha_v2');
  const html = document.documentElement.innerHTML;
  const v3 = /recaptcha\/api\.js\?render=(?!explicit)/.test(html) || !!document.querySelector('.grecaptcha-badge')
    || !!document.querySelector('input[name="_wpcf7_recaptcha_response"],input[name="g-recaptcha-response"]');
  const cf7Form = document.querySelector('form.wpcf7-form');
  const cf7Out = document.querySelector('.wpcf7-response-output');
  const frames = Array.from(document.querySelectorAll('iframe')).map(f => f.src).filter(s => /^https?:/.test(s));
  return {
    ready: true, url: location.href, title: document.title,
    fields, buttons, captcha: Array.from(new Set(captcha)), recaptcha_v3: v3,
    form_count: forms.length, textarea_count: document.querySelectorAll('textarea').length,
    cf7: cf7Form ? { cls: String(cf7Form.className || ''), response: cf7Out ? norm(cf7Out.innerText) : '' } : null,
    frames,
    text: norm(text).slice(0, 20000),
    raw_text: text.slice(0, 20000),
  };
}

// Same-site link candidates for the contact page.
export function pageLinks() {
  return Array.from(document.querySelectorAll('a[href]')).map(a => ({
    href: a.href, text: (a.innerText || a.getAttribute('title') || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    img_alt: Array.from(a.querySelectorAll('img')).map(i => i.alt || '').join(' ').slice(0, 60),
  })).filter(l => /^https?:/.test(l.href));
}
