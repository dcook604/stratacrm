import type { KeyboardEvent, MouseEvent } from "react";
import type { NavigateFunction } from "react-router-dom";

/** Makes a whole table row navigate on click/Enter without double-firing for inner links/buttons. */
export function rowNav(navigate: NavigateFunction, to: string) {
  return {
    tabIndex: 0,
    onClick: (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
      if (window.getSelection()?.toString()) return;
      if (e.metaKey || e.ctrlKey) window.open(to, "_blank");
      else navigate(to);
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" && e.target === e.currentTarget) navigate(to);
    },
  };
}
