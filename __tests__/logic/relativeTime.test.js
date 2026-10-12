const { relativeDate } = require('@/utils/relativeTime');

const NOW = Date.parse('2026-10-07T12:00:00Z');
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(NOW - ms).toISOString();

describe('relativeDate', () => {
  it('buckets recent times', () => {
    expect(relativeDate(ago(10 * 1000), NOW)).toBe('just now');
    expect(relativeDate(ago(MIN), NOW)).toBe('1 minute ago');
    expect(relativeDate(ago(45 * MIN), NOW)).toBe('45 minutes ago');
    expect(relativeDate(ago(HOUR), NOW)).toBe('1 hour ago');
    expect(relativeDate(ago(5 * HOUR), NOW)).toBe('5 hours ago');
  });

  it('uses yesterday / days / weeks, then a calendar date after a month', () => {
    expect(relativeDate(ago(DAY), NOW)).toBe('yesterday');
    expect(relativeDate(ago(3 * DAY), NOW)).toBe('3 days ago');
    expect(relativeDate(ago(7 * DAY), NOW)).toBe('1 week ago');
    expect(relativeDate(ago(21 * DAY), NOW)).toBe('3 weeks ago');
    expect(relativeDate('2026-06-15T12:00:00Z', NOW)).toBe('Jun 15, 2026');
  });

  it('treats a future timestamp as just now and returns an empty string for junk', () => {
    expect(relativeDate(new Date(NOW + HOUR).toISOString(), NOW)).toBe('just now');
    expect(relativeDate('not a date', NOW)).toBe('');
    expect(relativeDate(undefined, NOW)).toBe('');
  });
});