import { useEffect, useRef } from "react";
import { useConfirm } from "../components/ConfirmDialog";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let idCounter = 0;
let scrollLocks = 0;

/**
 * Turns an existing modal overlay element into an accessible dialog without
 * restructuring its markup. Attach the returned ref to the fixed overlay `div`.
 *
 *  - role="dialog", aria-modal and aria-labelledby (first heading inside)
 *  - Escape and backdrop click request a close
 *  - Tab is trapped inside; focus returns to the opener on close
 *  - Page scroll is locked while open
 *  - If the user edited a field, closing asks before discarding the changes
 */
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const opener = document.activeElement as HTMLElement | null;
    let dirty = false;
    let asking = false;

    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    const heading = el.querySelector<HTMLElement>("h1, h2, h3");
    if (heading) {
      if (!heading.id) heading.id = `dialog-title-${++idCounter}`;
      el.setAttribute("aria-labelledby", heading.id);
    }

    if (scrollLocks++ === 0) document.body.style.overflow = "hidden";

    if (!el.contains(document.activeElement)) {
      const target =
        el.querySelector<HTMLElement>("[autofocus], input:not([type=hidden]):not([type=checkbox]):not([type=search]), select, textarea") ??
        el.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    }

    async function requestClose() {
      if (asking) return;
      if (dirty) {
        asking = true;
        const discard = await confirmRef.current({
          title: "Discard changes?",
          message: "You have unsaved changes that will be lost.",
          confirmLabel: "Discard",
          cancelLabel: "Keep editing",
          danger: true,
        });
        asking = false;
        if (!discard) return;
      }
      onCloseRef.current();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.stopPropagation();
        void requestClose();
      } else if (e.key === "Tab") {
        const items = Array.from(el!.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !el!.contains(document.activeElement))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    let downOnBackdrop = false;
    const onMouseDown = (e: MouseEvent) => { downOnBackdrop = e.target === el; };
    const onClick = (e: MouseEvent) => {
      if (downOnBackdrop && e.target === el) void requestClose();
      downOnBackdrop = false;
    };

    const markDirty = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      // Search boxes inside forms are navigation aids, not edits.
      if (t && t.type === "search") return;
      dirty = true;
    };

    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("click", onClick);
    el.addEventListener("input", markDirty);
    el.addEventListener("change", markDirty);

    return () => {
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("click", onClick);
      el.removeEventListener("input", markDirty);
      el.removeEventListener("change", markDirty);
      if (--scrollLocks === 0) document.body.style.overflow = "";
      opener?.focus?.();
    };
  }, []);

  return ref;
}
