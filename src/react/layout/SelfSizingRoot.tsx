/**
 * SelfSizingRoot — bulletproof outer container for Lens.
 *
 * Solves the "parent didn't give me a height" problem once so every
 * surface below it gets a guaranteed usable size, regardless of how
 * the host app lays out its parent chain.
 *
 * Behaviour matrix:
 *
 *   Parent context                    | Resolved height
 *   ──────────────────────────────────┼──────────────────────────────
 *   flex column with flex:1 child     | fills remaining parent space
 *   grid cell minmax(0, 1fr)          | fills remaining grid space
 *   block with `height: 100vh`        | fills viewport
 *   block with NO height              | floor = `min(400px, 100dvh)`
 *   parent that is 0 × 0              | floor = `min(400px, 100dvh)`
 *
 * The floor (`min(400px, 100dvh)`) ensures Lens is NEVER invisible.
 * On a desktop with a 900px viewport, the floor is 400px; on a
 * 320px-tall mobile landscape, the floor shrinks to 320px (via the
 * 100dvh cap). Always readable, never overflows the screen.
 *
 * CSS containment (`contain: layout size paint`) isolates Lens from
 * the outer page — margin collapse, overflow propagation, and flex
 * baseline leaks all stop at the boundary. Ideal for a library
 * component dropped into arbitrary consumer markup.
 */
import type { CSSProperties, ReactNode } from "react";

export interface SelfSizingRootProps {
  readonly children: ReactNode;
  /** Optional className hook on the root. */
  readonly className?: string;
  /** Optional data-attribute for host apps to find Lens in the DOM. */
  readonly dataAttr?: string;
  /**
   * Override the floor. Defaults to `min(400px, 100dvh)`. Set to
   * `0` to opt out of the floor entirely (Lens will collapse when
   * parent is 0 × 0 — useful for debugging layout bugs). */
  readonly minHeight?: CSSProperties["minHeight"];
  /**
   * Override the ceiling. Defaults to `100dvh`. Set to `none` to
   * opt out — Lens will grow past the viewport if the parent
   * permits (e.g. within a scrollable page).
   */
  readonly maxHeight?: CSSProperties["maxHeight"];
  /**
   * Extra inline style merged after the self-sizing rules. Useful
   * for background, font-family, etc. Anything layout-related
   * (`height`, `flex`, `display`, `min-height`, `max-height`,
   * `contain`, `overflow`) is ignored to preserve the self-sizing
   * contract — override via the explicit props above instead.
   */
  readonly style?: Omit<
    CSSProperties,
    | "height"
    | "minHeight"
    | "maxHeight"
    | "flex"
    | "display"
    | "flexDirection"
    | "contain"
    | "overflow"
  >;
}

export function SelfSizingRoot({
  children,
  className,
  dataAttr = "self-sizing-root",
  minHeight = "min(400px, 100dvh)",
  maxHeight = "100dvh",
  style,
}: SelfSizingRootProps) {
  return (
    <div
      className={className}
      data-fp-lens={dataAttr}
      style={{
        // Layout — all five declarations work together. The parent's
        // layout model decides which ones "win":
        //   • inside a flex column parent → `flex: 1` dominates
        //   • inside a grid cell          → `height: 100%` dominates
        //   • inside a block with height  → `height: 100%` dominates
        //   • inside an unsized parent    → `min-height` (floor) wins
        // The `max-height: 100dvh` caps all of the above so Lens
        // never exceeds the viewport.
        display: "flex",
        flexDirection: "column",
        flex: "1 1 0%",
        height: "100%",
        minHeight,
        maxHeight,
        // CSS containment — Lens is a self-contained layout island.
        // `layout`: inner layout doesn't influence outer layout.
        // `size`:   inner element sizes doesn't affect outer element
        //           size (requires an explicit size — provided above).
        // `paint`:  nothing inside paints outside the box. Clips
        //           descendant overflow too, so we don't need
        //           `overflow: hidden` separately, but we keep it
        //           for older browsers that don't honour paint
        //           containment.
        contain: "layout size paint",
        overflow: "hidden",
        // Custom caller style merged last, but the layout keys above
        // are intentionally NOT overridable — if a consumer wants to
        // change sizing, they use the explicit props. This is how we
        // guarantee "library-quality" self-containment: the layout
        // contract is stable no matter what style prop comes in.
        ...style,
      }}
    >
      {children}
    </div>
  );
}
