const MEMORY_KEY = "nav-list-state";

export function readListMemory(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(MEMORY_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function writeListMemory(next: Record<string, string>) {
  try {
    sessionStorage.setItem(MEMORY_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable (private window) — the feature just degrades */
  }
}

/** "/lots" plus the last search/filter/page the user had there (e.g. "/lots?q=214&page=2"). */
export function listPath(base: string): string {
  return `${base}${readListMemory()[base] ?? ""}`;
}
