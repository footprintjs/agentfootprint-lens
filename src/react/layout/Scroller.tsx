/**
 * Scroller — bounded scrollable region with proper overflow
 * containment.
 *
 * The trap we're avoiding: `overflow: auto` on a flex child ONLY
 * scrolls when the flex parent constrains its size. Forget to set
 * `min-height: 0` on the child and it stretches to fit content,
 * which means nothing overflows, which means no scrollbar — the
 * scroll "silently fails." The absolute-positioning pattern used
 * below sidesteps the whole dance: once the OUTER `position:
 * relative` box is sized, the INNER absolute+overflow:auto panel
 * scrolls internally, always.
 *
 * Two modes:
 *   • `direction: "y"` (default) — vertical scroll, content flows
 *     as a column.
 *   • `direction: "x"` — horizontal scroll, content flows as a row.
 *
 * Explicit `contain: content` on the inner panel so internal scroll
 * doesn't propagate and nothing inside paints outside the clip box.
 * Safer than `overflow: hidden` alone.
 */
import type { CSSProperties, ReactNode } from "react";

export interface ScrollerProps {
  readonly children: ReactNode;
  /** Scroll direction. Default `"y"` (vertical). */
  readonly direction?: "y" | "x";
  /** Padding inside the scroll viewport. Default `0`. */
  readonly padding?: number | string;
  /** Hide the scrollbar visually but keep scroll functionality. */
  readonly hideScrollbar?: boolean;
  /** Data-attribute hook for finding this region in the DOM. */
  readonly dataAttr?: string;
  /** Extra style for the outer (bounded) wrapper. */
  readonly outerStyle?: Omit<
    CSSProperties,
    "position" | "flex" | "minHeight" | "height" | "display" | "flexDirection"
  >;
  /** Extra style for the inner (scrolling) panel. */
  readonly innerStyle?: Omit<
    CSSProperties,
    "position" | "top" | "left" | "right" | "bottom" | "inset" | "overflow"
  >;
  readonly className?: string;
}

// Inject the hide-scrollbar CSS rule once globally. Using a unique
// data-attribute means we don't collide with other stylesheets.
const SCROLLBAR_STYLE_ID = "fp-lens-scroller-hide";
function ensureHideScrollbarStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(SCROLLBAR_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = SCROLLBAR_STYLE_ID;
  el.textContent = `
    [data-fp-lens-hide-scrollbar="true"] {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    [data-fp-lens-hide-scrollbar="true"]::-webkit-scrollbar {
      display: none;
    }
  `;
  document.head.appendChild(el);
}

export function Scroller({
  children,
  direction = "y",
  padding = 0,
  hideScrollbar = false,
  dataAttr,
  outerStyle,
  innerStyle,
  className,
}: ScrollerProps) {
  if (hideScrollbar) ensureHideScrollbarStyles();

  const overflowKey = direction === "y" ? "overflowY" : "overflowX";
  // Cross-axis stays hidden so content never overflows the wrong way.
  const crossOverflowKey = direction === "y" ? "overflowX" : "overflowY";

  return (
    <div
      data-fp-lens={dataAttr}
      className={className}
      style={{
        position: "relative",
        flex: "1 1 0%",
        minHeight: 0,
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        ...outerStyle,
      }}
    >
      <div
        data-fp-lens-hide-scrollbar={hideScrollbar ? "true" : undefined}
        style={{
          position: "absolute",
          inset: 0,
          [overflowKey]: "auto",
          [crossOverflowKey]: "hidden",
          padding,
          // Contain — internal scroll never triggers a scroll on any
          // ancestor, and painting stops at the clip box.
          contain: "content",
          display: "flex",
          flexDirection: direction === "y" ? "column" : "row",
          ...innerStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
