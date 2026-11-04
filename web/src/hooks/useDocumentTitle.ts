import { useEffect } from "react";

const SUFFIX = "Spectrum 4 CRM";
let overridden = false;

export function setBaseTitle(title: string) {
  if (!overridden) document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
}

/** Page-specific title (e.g. "Lot 214"); takes precedence over the route's default title. */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (!title) return;
    overridden = true;
    document.title = `${title} · ${SUFFIX}`;
    return () => { overridden = false; };
  }, [title]);
}
