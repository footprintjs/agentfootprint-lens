/**
 * FillParent — make a child exactly fill its parent.
 *
 * Two-layer pattern:
 *   • outer `<div>` — `position: relative` + `flex: 1` + `min-height: 0`
 *   • inner `<div>` — `position: absolute; inset: 0` — pins to outer
 *
 * Why the indirection? Absolute positioning needs a positioned
 * ancestor ("containing block"). A direct `flex: 1 + min-height: 0`
 * child of a flex column is supposed to fill remaining space, but in
 * practice fails silently when ANY ancestor in the chain omits
 * `min-height: 0` — the child collapses to zero. That's the bug that
 * kept biting us.
 *
 * Absolute positioning sidesteps the whole flex resolution dance:
 * once the OUTER has a non-zero size, the INNER pins to `inset: 0`
 * with no ambiguity. Layout tools, DOM inspectors, and consumers all
 * see the same concrete box.
 *
 * The outer is a flex item itself, so it participates in the parent's
 * flex chain (flex: 1, min-height: 0). When the parent is a bounded
 * flex column, outer gets a real size, inner fills it. When the
 * parent is a grid cell or block-with-height, outer uses `height:
 * 100%` as a secondary fill mechanism — same story.
 */
import type { CSSProperties, ReactNode } from "react";

export interface FillParentProps {
  readonly children: ReactNode;
  /** Optional data-attribute to identify this region in the DOM. */
  readonly dataAttr?: string;
  /**
   * Extra style for the outer wrapper (the flex/grid child).
   * Safe keys only — layout keys are locked to the self-fill
   * contract.
   */
  readonly outerStyle?: Omit<
    CSSProperties,
    "position" | "flex" | "minHeight" | "height" | "display" | "flexDirection"
  >;
  /**
   * Extra style for the inner wrapper (the absolute-positioned box
   * that holds children). Same lock as `outerStyle`.
   */
  readonly innerStyle?: Omit<
    CSSProperties,
    "position" | "top" | "left" | "right" | "bottom" | "inset"
  >;
}

export function FillParent({
  children,
  dataAttr,
  outerStyle,
  innerStyle,
}: FillParentProps) {
  return (
    <div
      data-fp-lens={dataAttr}
      style={{
        // Outer: flex child + block with definite height via 100%.
        // `position: relative` establishes the containing block for
        // the absolutely-positioned inner.
        position: "relative",
        flex: "1 1 0%",
        minHeight: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        ...outerStyle,
      }}
    >
      <div
        style={{
          // Inner: pinned to all four edges of outer. Once outer has
          // a size (any mechanism), inner fills it exactly.
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          ...innerStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
