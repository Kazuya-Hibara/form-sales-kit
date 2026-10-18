// Deterministic send guards. Pure functions: the caller passes ledger rows, suppress
// entries and config, so tests and the CLI share exactly one decision.
import { jstDate, normalizeDomain } from './util.mjs';
import { SENT_STATUSES } from './work.mjs';

function domainMatches(domain, entry) {
  return domain === entry || domain.endsWith('.' + entry) || entry.endsWith('.' + domain);
}

/** First reason to refuse a submit before the browser opens, or null. */
export function preSubmitGuard({ domain, targetEmail = '' }, { ledger, suppress, config, now = new Date() }) {
  const key = normalizeDomain(domain);
  if (!key) return { guard: 'no_domain', detail: '送信先のドメインが判定できません' };
  const email = String(targetEmail || '').trim().toLowerCase();
  for (const entry of suppress) {
    if (entry.includes('@')) {
      if (entry === email || domainMatches(key, entry.split('@').pop())) {
        return { guard: 'suppressed', detail: `停止リストに該当: ${entry}` };
      }
    } else if (domainMatches(key, entry)) {
      return { guard: 'suppressed', detail: `停止リストに該当: ${entry}` };
    }
  }
  const prior = ledger.find(r => SENT_STATUSES.includes(r.status) && r.domain
                                 && domainMatches(key, normalizeDomain(r.domain)));
  if (prior) {
    return { guard: 'already_sent', detail: `${prior.domain} は ${prior.ts} に ${prior.status} 済み (1 社 1 回)` };
  }
  const win = sendWindowGuard(config, now);
  if (win) return win;
  const today = jstDate(now);
  const sentToday = ledger.filter(r => SENT_STATUSES.includes(r.status)
                                       && String(r.ts || '').startsWith(today)).length;
  if (sentToday >= Number(config.daily_cap)) {
    return { guard: 'daily_cap', detail: `本日の送信 ${sentToday} 件が上限 ${config.daily_cap} 件に達しています` };
  }
  return null;
}

/** Seconds still to wait before the next submit click (0 = go). */
export function gapRemainingSec(ledger, config, now = new Date()) {
  const clicks = ledger.filter(r => r.clicked).map(r => Date.parse(r.clicked_at || r.ts))
    .filter(Number.isFinite);
  if (!clicks.length) return 0;
  const last = Math.max(...clicks);
  const left = Number(config.min_gap_sec) * 1000 - (now.getTime() - last);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

/** Refuse outside the configured JST send window (days 0=Sun..6=Sat, hours [from, to)). */
export function sendWindowGuard(config, now = new Date()) {
  const days = Array.isArray(config.send_days) ? config.send_days.map(Number) : [1, 2, 3, 4, 5];
  const [from, to] = Array.isArray(config.send_hours) ? config.send_hours.map(Number) : [9, 17];
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const day = jst.getUTCDay();
  const hour = jst.getUTCHours();
  if (days.includes(day) && hour >= from && hour < to) return null;
  const allowed = days.map(d => WEEKDAY_JA[d]).join('・');
  return { guard: 'outside_send_window',
           detail: `送信できる時間帯 (${allowed} ${from}-${to} 時) の外です (今は ${WEEKDAY_JA[day]} ${hour} 時台)` };
}
