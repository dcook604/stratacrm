const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an API value. Date-only strings ("2026-11-04") are calendar days, not UTC instants. */
export function parseDate(iso: string): Date {
  if (DATE_ONLY.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(iso);
}

/** Today's calendar date in the user's timezone as YYYY-MM-DD (toISOString would give the UTC date). */
export function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true };

/** "Nov 4, 2026" — always date only. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDate(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", DATE_OPTS);
}

/** "Nov 4, 2026 3:05 PM"; just the date when the value is date-only or exactly midnight. */
export function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDate(iso);
  if (isNaN(d.getTime())) return iso;
  const dateStr = d.toLocaleDateString("en-US", DATE_OPTS);
  if (DATE_ONLY.test(iso)) return dateStr;
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
  return hasTime ? `${dateStr} ${d.toLocaleTimeString("en-US", TIME_OPTS)}` : dateStr;
}

/** Like fmtDatetime but always shows the time (audit trails, last login). */
export function fmtDatetimeFull(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseDate(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("en-US", DATE_OPTS)} ${d.toLocaleTimeString("en-US", TIME_OPTS)}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago"; falls back to a date after a week. */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = parseDate(iso).getTime();
  if (isNaN(t)) return iso;
  const sec = Math.round((now - t) / 1000);
  if (sec < 0) return fmtDatetime(iso);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return fmtDatetime(iso);
}
