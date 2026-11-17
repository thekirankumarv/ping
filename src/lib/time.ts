// 12-hour formatting by hand: Hermes Intl output varies between Android versions.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86_400_000;

export function clock(ts: number) {
  const d = new Date(ts);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const midnight = (ts: number) => new Date(ts).setHours(0, 0, 0, 0);
const daysAgo = (ts: number, now: number) => Math.round((midnight(now) - midnight(ts)) / DAY);

function date(ts: number, now: number, year = false) {
  const d = new Date(ts);
  const y = year || d.getFullYear() !== new Date(now).getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${y}`;
}

export function dayLabel(ts: number, now = Date.now()) {
  const n = daysAgo(ts, now);
  return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : n === -1 ? 'Tomorrow' : date(ts, now, true);
}

export function listTime(ts: number, now = Date.now()) {
  const n = daysAgo(ts, now);
  return n === 0 ? clock(ts) : n === 1 ? 'Yesterday' : date(ts, now);
}

export function lastSeen(ts: number, now = Date.now()) {
  if (now - ts < 60_000) return 'last seen just now';
  const n = daysAgo(ts, now);
  const day = n === 0 ? 'today' : n === 1 ? 'yesterday' : date(ts, now);
  return `last seen ${day} at ${clock(ts)}`;
}

export const sameDay = (a: number, b: number) => midnight(a) === midnight(b);

// Short countdown for disappearing messages.
export function left(ms: number) {
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `${Math.max(m, 1)}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

// Seconds; -1 means "after seen".
export const TTLS: [number, string][] = [
  [0, 'Off'],
  [-1, 'After seen'],
  [86_400, '24 hours'],
  [172_800, '48 hours'],
  [604_800, '1 week'],
  [2_592_000, '1 month'],
];
export const ttlLabel = (s: number) => TTLS.find(([v]) => v === s)?.[1] ?? 'Off';
export const ttlShort = (s: number) => (s === -1 ? '1×' : s ? left(s * 1000) : '');

export function duration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
}

// Quick picks for scheduled messages and reminders.
export function laterPicks(now = Date.now()): [string, number][] {
  const at = (days: number, h: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d.getTime();
  };
  const picks: [string, number][] = [
    ['In 20 minutes', now + 20 * 60_000],
    ['In 1 hour', now + 3_600_000],
    ['In 3 hours', now + 3 * 3_600_000],
  ];
  if (at(0, 20) - now > 3_600_000) picks.push(['Tonight, 8:00 PM', at(0, 20)]);
  picks.push(['Tomorrow, 9:00 AM', at(1, 9)], ['Tomorrow, 8:00 PM', at(1, 20)]);
  return picks;
}

export const when = (ts: number, now = Date.now()) => `${dayLabel(ts, now)}, ${clock(ts)}`;
