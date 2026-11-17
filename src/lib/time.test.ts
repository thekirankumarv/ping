import assert from 'node:assert/strict';
import { clock, dayLabel, lastSeen, left, listTime, when, duration, bytes, laterPicks } from './time';

const at = (s: string) => new Date(s).getTime();
const now = at('2026-11-17T15:30:00');

assert.equal(clock(at('2026-11-17T00:05:00')), '12:05 AM');
assert.equal(clock(at('2026-11-17T12:00:00')), '12:00 PM');
assert.equal(clock(at('2026-11-17T15:07:00')), '3:07 PM');

assert.equal(dayLabel(at('2026-11-17T01:00:00'), now), 'Today');
assert.equal(dayLabel(at('2026-11-16T23:59:00'), now), 'Yesterday');
assert.equal(dayLabel(at('2026-11-02T10:00:00'), now), '2 Nov 2026');

assert.equal(listTime(at('2026-11-17T09:15:00'), now), '9:15 AM');
assert.equal(listTime(at('2026-11-16T09:15:00'), now), 'Yesterday');
assert.equal(listTime(at('2026-10-01T09:15:00'), now), '1 Oct');
assert.equal(listTime(at('2025-10-01T09:15:00'), now), '1 Oct 2025');

assert.equal(lastSeen(now - 10_000, now), 'last seen just now');
assert.equal(lastSeen(at('2026-11-16T21:40:00'), now), 'last seen yesterday at 9:40 PM');

assert.equal(left(30_000), '1m');
assert.equal(left(90 * 60_000), '2h');
assert.equal(left(7 * 86_400_000), '7d');

assert.equal(when(at('2026-11-18T09:00:00'), now), 'Tomorrow, 9:00 AM');
assert.equal(duration(75.4), '1:15');
assert.equal(bytes(1536), '2 KB');
assert.equal(bytes(3.5 * 1024 * 1024), '3.5 MB');
const picks = laterPicks(now);
assert.ok(picks.every(([, ts]) => ts > now));
assert.deepEqual(picks.at(-2), ['Tomorrow, 9:00 AM', at('2026-11-18T09:00:00')]);

console.log('time ok');
