/**
 * Stack — vertical or horizontal spacing primitive.
 *
 * One concept: lay children out in a direction with consistent gaps.
 * Variants people typically reach for (`<HStack>`, `<VStack>`,
 * `<Flex>`, `<Row>`, `<Col>`) are all this component. One import,
 * one mental model.
 *
 * Explicit contract — every sizing/behavior knob is a prop, not a
 * className override. This keeps Stack's layout predictable across
 * consumers: you get exactly what you asked for, no CSS leaking in
 * from a theme or utility class.
 */
import type { CSSProperties, ReactNode } from "react";

export interface StackProps {
  readonly children: ReactNode;
  /** Direction of stacking. Default `"column"` (vertical). */
  readonly direction?: "row" | "column";
  /** Gap between children in pixels, or any CSS length. Default 8. */
  readonly gap?: number | string;
  /** Cross-axis alignment. Default `"stretch"` — children fill
   *  the cross-axis. Common overrides: `"center"`, `"flex-start"`. */
  readonly align?: CSSProperties["alignItems"];
  /** Main-axis distribution. Default `"flex-start"`. */
  readonly justify?: CSSProperties["justifyContent"];
  /** Allow children to wrap to a new row/column. Default `false`. */
  readonly wrap?: boolean;
  /** Whether the Stack itself should fill its parent on the main
   *  axis. Default `false`. When `true`, sets `flex: 1 1 0%` +
   *  `min-*-size: 0` so it participates correctly in a parent flex. */
  readonly fill?: boolean;
  /** Inline padding (shorthand for `padding` css). */
  readonly padding?: number | string;
  /** Data-attribute hook for finding this region in the DOM. */
  readonly dataAttr?: string;
  /** Extra style. Layout keys (direction, gap, align, justify, wrap,
   *  flex) are locked — use the props above instead. */
  readonly style?: Omit<
    CSSProperties,
    | "display"
    | "flexDirection"
    | "gap"
    | "alignItems"
    | "justifyContent"
    | "flexWrap"
    | "flex"
    | "minWidth"
    | "minHeight"
  >;
  readonly className?: string;
}

export function Stack({
  children,
  direction = "column",
  gap = 8,
  align = "stretch",
  justify = "flex-start",
  wrap = false,
  fill = false,
  padding,
  dataAttr,
  style,
  className,
}: StackProps) {
  const mainAxisMin = direction === "column" ? "minHeight" : "minWidth";
  return (
    <div
      data-fp-lens={dataAttr}
      className={className}
      style={{
        display: "flex",
        flexDirection: direction,
        gap,
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? "wrap" : "nowrap",
        ...(fill
          ? { flex: "1 1 0%", [mainAxisMin]: 0 }
          : {}),
        ...(padding !== undefined ? { padding } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
