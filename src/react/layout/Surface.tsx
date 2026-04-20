/**
 * Surface — themed, bordered, rounded container.
 *
 * Replaces the "repeat these 5 CSS properties on every card" pattern
 * with one component. All surface variants in Lens — cards, modals,
 * pills, wells — compose from this one primitive so the visual
 * vocabulary stays consistent when a theme swap happens.
 *
 * Explicit variant prop rather than style leakage — `variant="card"`
 * encodes a known set of colors, borders, radius, shadow. Consumers
 * pick a variant; the actual values are defined here and stay in
 * sync with the theme.
 */
import type { CSSProperties, ReactNode } from "react";

export type SurfaceVariant =
  | "card" // elevated surface, full border + shadow
  | "well" // inset surface, no shadow, subtle border
  | "pill" // fully-rounded compact surface, for tags/badges
  | "none"; // no visual — useful for composing Surface inside Surface

export interface SurfacePalette {
  /** Panel background. */
  readonly surface: string;
  /** 1px border color. */
  readonly borderColor: string;
  /** Text color inside the surface. */
  readonly textColor: string;
  /** Subtle elevated surface color (for wells). */
  readonly elevatedSurface?: string;
  /** Shadow value (CSS string). */
  readonly shadow?: string;
}

export interface SurfaceProps {
  readonly children: ReactNode;
  /** Visual preset. Default `"card"`. */
  readonly variant?: SurfaceVariant;
  /** Colors. When omitted, Surface uses a hardcoded slate palette
   *  that matches footprint-explainable-ui's coolDark default. Pass
   *  explicit colors to match your theme. */
  readonly palette?: Partial<SurfacePalette>;
  /** Padding inside the surface. Default depends on variant. */
  readonly padding?: number | string;
  /** Corner radius. Default depends on variant. */
  readonly radius?: number | string;
  /** Data-attribute hook for finding this region. */
  readonly dataAttr?: string;
  /** Extra style. Visual keys (background, border, shadow, padding,
   *  radius) are intentionally overridable so consumers can tune
   *  per-instance without reaching for a variant. */
  readonly style?: CSSProperties;
  readonly className?: string;
}

const DEFAULT_PALETTE: SurfacePalette = {
  surface: "#0f172a",
  borderColor: "#334155",
  textColor: "#f8fafc",
  elevatedSurface: "#1e293b",
  shadow: "0 2px 8px rgba(0, 0, 0, 0.18)",
};

function resolveVariantStyles(
  variant: SurfaceVariant,
  palette: SurfacePalette,
  padding: number | string | undefined,
  radius: number | string | undefined,
): CSSProperties {
  if (variant === "none") {
    return {};
  }
  if (variant === "pill") {
    return {
      background: palette.surface,
      color: palette.textColor,
      border: `1px solid ${palette.borderColor}`,
      borderRadius: radius ?? 999,
      padding: padding ?? "2px 10px",
      fontSize: 11,
      fontWeight: 600,
      whiteSpace: "nowrap",
      display: "inline-flex",
      alignItems: "center",
    };
  }
  if (variant === "well") {
    return {
      background: palette.elevatedSurface ?? palette.surface,
      color: palette.textColor,
      border: `1px solid ${palette.borderColor}`,
      borderRadius: radius ?? 6,
      padding: padding ?? 12,
    };
  }
  // card (default)
  return {
    background: palette.surface,
    color: palette.textColor,
    border: `1px solid ${palette.borderColor}`,
    borderRadius: radius ?? 10,
    padding: padding ?? 14,
    boxShadow: palette.shadow,
  };
}

export function Surface({
  children,
  variant = "card",
  palette: paletteOverride,
  padding,
  radius,
  dataAttr,
  style,
  className,
}: SurfaceProps) {
  const palette: SurfacePalette = {
    ...DEFAULT_PALETTE,
    ...paletteOverride,
  };
  const variantStyles = resolveVariantStyles(variant, palette, padding, radius);
  return (
    <div
      data-fp-lens={dataAttr ?? `surface-${variant}`}
      className={className}
      style={{ ...variantStyles, ...style }}
    >
      {children}
    </div>
  );
}
