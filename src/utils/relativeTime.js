const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;

/**
 * "just now" / "5 minutes ago" / "yesterday" / "3 weeks ago", falling back to a
 * calendar date after a month. Returns '' for an unparseable value so callers
 * can drop the label rather than print "Invalid Date".
 * @param {string|number|Date} value
 * @param {number} [now] epoch ms, injectable for tests
 */
export function relativeDate(value, now = Date.now()) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return plural(Math.floor(diff / HOUR), 'hour');
  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY);
    return days === 1 ? 'yesterday' : plural(days, 'day');
  }
  if (diff < 30 * DAY) return plural(Math.floor(diff / (7 * DAY)), 'week');
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}