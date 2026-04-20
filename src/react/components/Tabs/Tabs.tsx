/**
 * Tabs — reusable tab primitive.
 *
 * One visual style (the Claude Design Studio "tab-into-body" pattern):
 * the active tab shares its background with the content card below so
 * the two read as one continuous surface.
 *
 * Self-contained colors. Tabs doesn't reach into any theme context —
 * every color is either passed explicitly as a prop OR falls back to
 * a hardcoded default. This makes the component trivially
 * debuggable: open devtools, compare `.surface` on the active tab
 * with the one on the content panel, they are the SAME color by
 * construction. No indirection through CSS vars, no surprises when
 * a parent theme provider does or doesn't flow down.
 *
 * Usage:
 *
 *   <Tabs
 *     tabs={[
 *       { id: "lens",  label: "Lens",              content: <AgentLens .../> },
 *       { id: "trace", label: "Explainable Trace", content: <TraceView .../> },
 *     ]}
 *     surface="#0f172a"          // active tab + content panel
 *     textColor="#f8fafc"        // active tab label
 *     mutedTextColor="#94a3b8"   // inactive tab label
 *     borderColor="#334155"      // active tab's lift outline
 *   />
 *
 * Lens wraps this and passes theme-resolved colors. Hosts can use
 * Tabs directly with their own palette.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FillParent } from "../../layout/FillParent";

export interface TabDef {
  /** Stable id — used as key and for controlled-selection. */
  readonly id: string;
  /** Rendered in the tab strip. Strings are treated as plain text;
   *  ReactNode lets callers add icons, dots, badges, etc. */
  readonly label: ReactNode;
  /** The tab's body. Only the selected tab's content is rendered
   *  (default) or made visible (see `renderAll`). */
  readonly content: ReactNode;
  /** When true, the tab renders dimmed and cannot be selected. */
  readonly disabled?: boolean;
  /** Optional trailing decoration inside the tab button — e.g. a
   *  "running" dot or a badge count. */
  readonly trailing?: ReactNode;
  /** Tooltip shown on hover. */
  readonly title?: string;
}

export interface TabsProps {
  readonly tabs: readonly TabDef[];
  /** Controlled selected tab id. When omitted, the component manages
   *  selection state internally starting from `defaultTabId`. */
  readonly selectedTabId?: string;
  /** Initial tab on mount (uncontrolled). Defaults to the first tab
   *  in the list. */
  readonly defaultTabId?: string;
  /** Fires when the user picks a different tab. Required when using
   *  the controlled `selectedTabId` prop. */
  readonly onChange?: (tabId: string) => void;
  /**
   * When true, all tab contents stay mounted and only the selected
   *  one is visible. Preserves hidden tabs' internal state (scroll
   *  position, form input) across selection changes. Default false —
   *  only the selected tab is mounted.
   */
  readonly renderAll?: boolean;
  /** Content rendered to the LEFT of the tab buttons. Lens uses this
   *  for the `appName` brand label. */
  readonly leadingSlot?: ReactNode;
  /** Content rendered to the RIGHT of the tab buttons. Used for
   *  tools, settings, expand buttons, etc. */
  readonly trailingSlot?: ReactNode;
  /** Optional className hook on the root. */
  readonly className?: string;
  /**
   * The ONE color shared by the active tab AND the content panel.
   * Pick the color your app's card/panel surface uses; the Tabs
   * primitive will paint the selected tab, its 1px lift border's
   * contents, and the content container with this exact color so
   * they merge into one continuous surface. Default `#0f172a`
   * (slate navy) matches footprint-explainable-ui's coolDark theme.
   */
  readonly surface?: string;
  /** Text color on the active tab label. Default `#f8fafc`. */
  readonly textColor?: string;
  /** Text color on inactive tab labels. Default `#94a3b8`. */
  readonly mutedTextColor?: string;
  /** 1px border color on the active tab (the "lift" outline above
   *  the content panel). Default `#334155`. */
  readonly borderColor?: string;
  /** Font family used on the tab strip. Default system sans stack. */
  readonly fontFamily?: string;
}

// Self-contained defaults. These match footprint-explainable-ui's
// coolDark preset so `<Tabs>` looks right out of the box without any
// theme prop. Callers (including Lens) override via props.
const DEFAULT_SURFACE = "#0f172a";
const DEFAULT_TEXT = "#f8fafc";
const DEFAULT_MUTED_TEXT = "#94a3b8";
const DEFAULT_BORDER = "#334155";
const DEFAULT_FONT_FAMILY = "Inter, system-ui, -apple-system, sans-serif";

export function Tabs({
  tabs,
  selectedTabId,
  defaultTabId,
  onChange,
  renderAll = false,
  leadingSlot,
  trailingSlot,
  className,
  surface = DEFAULT_SURFACE,
  textColor = DEFAULT_TEXT,
  mutedTextColor = DEFAULT_MUTED_TEXT,
  borderColor = DEFAULT_BORDER,
  fontFamily = DEFAULT_FONT_FAMILY,
}: TabsProps) {
  // One palette object passed down — keeps TabStrip / TabButton /
  // TabContent in sync without separately plumbing 5 props through
  // the tree.
  const palette: TabPalette = {
    surface,
    textColor,
    mutedTextColor,
    borderColor,
    fontFamily,
  };
  const initialId = defaultTabId ?? tabs[0]?.id;
  const [internalId, setInternalId] = useState<string | undefined>(initialId);
  const isControlled = selectedTabId !== undefined;
  const selectedId = isControlled ? selectedTabId : internalId;

  const pickTab = useCallback(
    (id: string) => {
      const def = tabs.find((t) => t.id === id);
      if (!def || def.disabled) return;
      if (!isControlled) setInternalId(id);
      onChange?.(id);
    },
    [tabs, isControlled, onChange],
  );

  // Arrow-key nav across the tab strip when one of the tabs has
  // focus. ← / → wrap; Home/End jump to first/last. Skipped for
  // disabled tabs so focus doesn't stall on them.
  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const enabled = tabs.filter((t) => !t.disabled);
      if (enabled.length === 0) return;
      const currentIdx = enabled.findIndex((t) => t.id === selectedId);
      let nextIdx = currentIdx;
      if (e.key === "ArrowLeft") {
        nextIdx = (currentIdx - 1 + enabled.length) % enabled.length;
      } else if (e.key === "ArrowRight") {
        nextIdx = (currentIdx + 1) % enabled.length;
      } else if (e.key === "Home") {
        nextIdx = 0;
      } else if (e.key === "End") {
        nextIdx = enabled.length - 1;
      }
      pickTab(enabled[nextIdx].id);
    },
    [tabs, selectedId, pickTab],
  );

  const selectedDef = tabs.find((t) => t.id === selectedId);

  return (
    <div
      data-fp-lens="tabs-root"
      className={className}
      style={{
        // Fill the parent on every layout model we might be dropped
        // into. `flex: 1` + `minHeight: 0` wins inside flex columns;
        // `height: 100%` wins inside block parents with a definite
        // height. Applying both makes <Tabs> self-sufficient so
        // consumers don't have to wrap it in another sizer div.
        display: "flex",
        flexDirection: "column",
        flex: "1 1 0%",
        height: "100%",
        minHeight: 0,
      }}
    >
      <TabStrip
        tabs={tabs}
        selectedId={selectedId}
        onPick={pickTab}
        onKeyDown={handleKey}
        leadingSlot={leadingSlot}
        trailingSlot={trailingSlot}
        palette={palette}
      />
      <TabContent
        tabs={tabs}
        selectedId={selectedId}
        renderAll={renderAll}
        palette={palette}
      />
      {!selectedDef && renderAll === false && (
        <div
          data-fp-lens="tabs-empty"
          style={{ flex: 1, minHeight: 0 }}
          aria-live="polite"
        />
      )}
    </div>
  );
}

// ── Internals ───────────────────────────────────────────────────────

interface TabPalette {
  surface: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  fontFamily: string;
}

function TabStrip({
  tabs,
  selectedId,
  onPick,
  onKeyDown,
  leadingSlot,
  trailingSlot,
  palette,
}: {
  tabs: readonly TabDef[];
  selectedId: string | undefined;
  onPick: (id: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  leadingSlot?: ReactNode;
  trailingSlot?: ReactNode;
  palette: TabPalette;
}) {
  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      data-fp-lens="tabs-strip"
      style={{
        display: "flex",
        padding: "8px 14px 0",
        // Transparent so the strip inherits from the host's outer
        // color (page/sidebar). Active tab renders an explicit
        // `palette.surface` fill so it merges with the content
        // panel; inactive tabs show the host color through.
        background: "transparent",
        flexShrink: 0,
        alignItems: "flex-end",
        position: "relative",
        zIndex: 1,
        fontFamily: palette.fontFamily,
      }}
    >
      {leadingSlot && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginRight: 12,
            paddingBottom: 10,
          }}
          data-fp-lens="tabs-leading"
        >
          {leadingSlot}
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 2,
          alignItems: "flex-end",
          flex: 1,
          minWidth: 0,
        }}
      >
        {tabs.map((def) => (
          <TabButton
            key={def.id}
            def={def}
            selected={def.id === selectedId}
            onPick={onPick}
            palette={palette}
          />
        ))}
      </div>
      {trailingSlot && (
        <div style={{ display: "flex", alignItems: "center" }}>
          {trailingSlot}
        </div>
      )}
    </div>
  );
}

function TabButton({
  def,
  selected,
  onPick,
  palette,
}: {
  def: TabDef;
  selected: boolean;
  onPick: (id: string) => void;
  palette: TabPalette;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected && document.activeElement?.getAttribute("role") === "tab") {
      buttonRef.current?.focus();
    }
  }, [selected]);

  return (
    <button
      ref={buttonRef}
      role="tab"
      aria-selected={selected}
      aria-disabled={def.disabled}
      tabIndex={selected ? 0 : -1}
      disabled={def.disabled}
      title={def.title}
      onClick={() => onPick(def.id)}
      data-fp-lens-tab={def.id}
      data-fp-lens-selected={selected}
      style={{
        padding: "9px 16px 10px",
        cursor: def.disabled ? "not-allowed" : "pointer",
        fontSize: 13,
        fontFamily: "inherit",
        width: "auto",
        display: "flex",
        alignItems: "center",
        gap: 6,
        color: selected ? palette.textColor : palette.mutedTextColor,
        // SAME color used on the content panel below. Devtools sanity
        // check: this string equals <TabContent>'s `background`. The
        // active tab has no border — its fill IS the surface, so any
        // outline would break the "tab and body are one continuous
        // shape" illusion the user asked for.
        background: selected ? palette.surface : "transparent",
        border: "none",
        borderRadius: "10px 10px 0 0",
        fontWeight: selected ? 600 : 500,
        opacity: def.disabled ? 0.45 : 1,
        transition:
          "background 140ms ease, color 140ms ease, border-color 140ms ease",
      }}
    >
      <span>{def.label}</span>
      {def.trailing}
    </button>
  );
}

function TabContent({
  tabs,
  selectedId,
  renderAll,
  palette,
}: {
  tabs: readonly TabDef[];
  selectedId: string | undefined;
  renderAll: boolean;
  palette: TabPalette;
}) {
  // Content panel paints the SAME palette.surface as the active tab
  // — that's the whole tab-into-body contract. Debuggable by diffing
  // the two elements' `background` in devtools.
  //
  // FillParent gives us the bulletproof "fill remaining height"
  // behaviour via position:relative/absolute — not via flex chain
  // resolution (which fails silently when an ancestor omits
  // `minHeight: 0`). One layer, one mental model, zero surprises.
  const bg = palette.surface;
  if (renderAll) {
    return (
      <FillParent
        dataAttr="tabs-content"
        outerStyle={{ background: bg }}
      >
        {tabs.map((def) => (
          <div
            key={def.id}
            role="tabpanel"
            aria-hidden={def.id !== selectedId}
            style={{
              position: "absolute",
              inset: 0,
              visibility: def.id === selectedId ? "visible" : "hidden",
              pointerEvents: def.id === selectedId ? "auto" : "none",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            {def.content}
          </div>
        ))}
      </FillParent>
    );
  }
  const selectedDef = tabs.find((t) => t.id === selectedId);
  if (!selectedDef) return null;
  return (
    <FillParent
      dataAttr="tabs-content"
      outerStyle={{ background: bg }}
      innerStyle={{ background: bg }}
    >
      <div
        role="tabpanel"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {selectedDef.content}
      </div>
    </FillParent>
  );
}
