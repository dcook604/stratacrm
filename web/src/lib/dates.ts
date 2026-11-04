/**
 * Format an ISO datetime string for display.
 * Shows date only when time is midnight, date+time otherwise.
 */
export function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;

  const dateStr = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Check if time is midnight (00:00:00 or 00:00:00.000)
  const hasNonMidnightTime =
    d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;

  if (!hasNonMidnightTime) return dateStr;

  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${dateStr} ${timeStr}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago"; falls back to a date after a week. */
export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
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
