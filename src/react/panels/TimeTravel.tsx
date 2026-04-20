/**
 * TimeTravel — slider + prev/next/live controls that scrub through the
 * stage sequence. Emits `onFocusChange(index)` which the host feeds
 * back into both StageFlow and MessagesPanel so the two surfaces stay
 * in sync.
 *
 * Patterned on the snapshot scrubber in footprint-explainable-ui: the
 * whole ecosystem should have one shape for "show me what it looked
 * like at step N" so users carry the muscle memory between tools.
 */
import type { Stage } from "../../core/deriveStages";
import { useLensTheme } from "../theme/useLensTheme";

export interface TimeTravelProps {
  readonly stages: readonly Stage[];
  readonly focusIndex: number;
  readonly onFocusChange: (index: number) => void;
  /** True when at the latest stage (live). Helps the host decide
   *  whether to auto-advance as new events arrive. */
  readonly isLive?: boolean;
}

export function TimeTravel({
  stages,
  focusIndex,
  onFocusChange,
  isLive,
}: TimeTravelProps) {
  const t = useLensTheme();
  const max = Math.max(0, stages.length - 1);

  function step(delta: number) {
    const next = Math.min(max, Math.max(0, focusIndex + delta));
    onFocusChange(next);
  }

  return (
    <div
      data-fp-lens="time-travel"
      style={{
        // Frosted-glass oval pill, floating clear of the surrounding
        // surfaces. `color-mix` gives a translucent tint using the
        // current theme's elevated bg; `backdrop-filter` blurs
        // whatever's behind (the graph + ask card show through
        // softly). Margin creates air around the pill so it reads as
        // a distinct floating control, not a toolbar bar.
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 14px",
        margin: "10px 14px",
        background: `color-mix(in srgb, ${t.bgElev} 55%, transparent)`,
        backdropFilter: "blur(14px) saturate(140%)",
        WebkitBackdropFilter: "blur(14px) saturate(140%)",
        border: `1px solid color-mix(in srgb, ${t.border} 70%, transparent)`,
        borderRadius: 999,
        boxShadow:
          "0 4px 16px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        fontFamily: t.fontSans,
      }}
    >
      <button
        onClick={() => step(-1)}
        disabled={focusIndex <= 0 || stages.length === 0}
        style={btnStyle(t, false)}
        title="Previous step (←)"
      >
        ◀
      </button>
      <button
        onClick={() => step(+1)}
        disabled={focusIndex >= max || stages.length === 0}
        style={btnStyle(t, false)}
        title="Next step (→)"
      >
        ▶
      </button>
      <button
        onClick={() => onFocusChange(max)}
        disabled={stages.length === 0 || isLive === true}
        style={btnStyle(t, isLive !== true && stages.length > 0)}
        title="Jump to latest step"
      >
        ⟳ Live
      </button>
      <input
        type="range"
        min={0}
        max={max}
        value={Math.min(focusIndex, max)}
        onChange={(e) => onFocusChange(Number(e.target.value))}
        disabled={stages.length <= 1}
        style={{ flex: 1, accentColor: t.accent, minWidth: 120 }}
      />
      <div
        style={{
          fontSize: 11,
          color: t.textMuted,
          fontFamily: t.fontMono,
          whiteSpace: "nowrap",
          minWidth: 80,
          textAlign: "right",
        }}
      >
        {stages.length === 0
          ? "no steps yet"
          : `Step ${focusIndex + 1} / ${stages.length}`}
      </div>
    </div>
  );
}

function btnStyle(
  t: ReturnType<typeof useLensTheme>,
  highlighted: boolean,
): React.CSSProperties {
  // Round buttons to follow the pill; subtler translucent background
  // on non-highlighted buttons so they read as controls-on-glass, not
  // framed boxes. Highlighted (Live) keeps the solid accent.
  return {
    background: highlighted
      ? t.accent
      : `color-mix(in srgb, ${t.bg} 40%, transparent)`,
    color: highlighted ? "#fff" : t.textMuted,
    border: `1px solid color-mix(in srgb, ${t.border} 60%, transparent)`,
    borderRadius: 999,
    padding: "3px 12px",
    fontSize: 12,
    cursor: "pointer",
    width: "auto",
    fontWeight: 500,
    whiteSpace: "nowrap",
    transition: "background 140ms ease, border-color 140ms ease, color 140ms ease",
  };
}
