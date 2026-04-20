/**
 * Table — data table primitive.
 *
 * Two layouts, one component:
 *   • Desktop (`mode="table"`) — traditional `<table>` markup with a
 *     sticky header. Keeps column alignment across rows.
 *   • Mobile (`mode="cards"`) — each row collapses into a stacked
 *     label:value card. Preserves all the data, loses the column
 *     scan. Ideal below ~600px viewport.
 *
 * `auto` mode picks at render time using a container query — table
 * if the available width >= `collapseAt`, cards otherwise. Both
 * modes read from the SAME `columns` + `rows` props, so consumers
 * don't duplicate content.
 *
 * Accessibility:
 *   • In table mode: proper `<thead>` / `<tbody>` / `scope="col"`
 *   • In card mode: each card is a `role="group"` with `aria-label`
 *     = the first column's value (typically the row identifier)
 *
 * NOT included by design: sorting, filtering, selection, pagination,
 * virtualization. Those are bigger concerns with their own
 * opinionated components. Table stays a DISPLAY primitive — compose
 * it with your own state for the fancy stuff.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface TableColumn<Row> {
  /** Stable id — used as React key. */
  readonly id: string;
  /** Header label — string or custom node. */
  readonly header: ReactNode;
  /** Cell renderer. Called once per row. */
  readonly cell: (row: Row, rowIndex: number) => ReactNode;
  /**
   * Column width on desktop. Supports any CSS length. Omit for
   * auto-sized columns. */
  readonly width?: number | string;
  /** Text alignment for this column's cells. */
  readonly align?: "left" | "center" | "right";
  /**
   * In card mode, which label to show alongside the cell value.
   * Defaults to the column's `header` (stringified). Set to `null`
   * to omit the label entirely (useful for a primary-identifier
   * column rendered as the card heading). */
  readonly cardLabel?: string | null;
}

export interface TableProps<Row> {
  readonly columns: readonly TableColumn<Row>[];
  readonly rows: readonly Row[];
  /** Function returning a stable React key for each row. */
  readonly rowKey: (row: Row, rowIndex: number) => string;
  /**
   * Layout mode. `"auto"` (default) picks table vs cards based on
   * container width. `"table"` / `"cards"` force a specific layout.
   */
  readonly mode?: "auto" | "table" | "cards";
  /**
   * Container width (in CSS pixels) at which `auto` mode flips
   * from cards → table. Default 640px.
   */
  readonly collapseAt?: number;
  /** Empty-state content when `rows.length === 0`. */
  readonly emptyState?: ReactNode;
  /**
   * Colors. Defaults match the slate palette used by Surface + the
   * Lens theme's coolDark. */
  readonly palette?: {
    readonly surface?: string;
    readonly elevatedSurface?: string;
    readonly borderColor?: string;
    readonly textColor?: string;
    readonly mutedTextColor?: string;
    readonly headerColor?: string;
    readonly headerBg?: string;
  };
  /** Data-attribute hook. */
  readonly dataAttr?: string;
}

const DEFAULT_PALETTE = {
  surface: "#0f172a",
  elevatedSurface: "#1e293b",
  borderColor: "#334155",
  textColor: "#f8fafc",
  mutedTextColor: "#94a3b8",
  headerColor: "#f8fafc",
  headerBg: "#1e293b",
};

export function Table<Row>({
  columns,
  rows,
  rowKey,
  mode = "auto",
  collapseAt = 640,
  emptyState,
  palette: paletteOverride,
  dataAttr = "table",
}: TableProps<Row>) {
  const palette = { ...DEFAULT_PALETTE, ...paletteOverride };
  const containerRef = useRef<HTMLDivElement | null>(null);
  // For `auto` mode, we observe our container's width and switch
  // between table and card layouts. ResizeObserver, not media
  // queries — the mode reacts to the CONTAINER's size, not the
  // viewport's. That's the right mental model: an embedded Lens
  // in a narrow sidebar collapses to cards even on a wide monitor.
  const [resolvedMode, setResolvedMode] = useState<"table" | "cards">(
    mode === "auto" ? "table" : mode,
  );
  useEffect(() => {
    if (mode !== "auto") {
      setResolvedMode(mode);
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    // ResizeObserver is standard in browsers; JSDOM users polyfill
    // it via test setup. If it's missing (legacy env), default to
    // "table" — desktops are the common case.
    if (typeof ResizeObserver === "undefined") {
      setResolvedMode("table");
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      setResolvedMode(width >= collapseAt ? "table" : "cards");
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, collapseAt]);

  if (rows.length === 0) {
    return (
      <div
        ref={containerRef}
        data-fp-lens={dataAttr}
        style={{
          padding: 24,
          textAlign: "center",
          color: palette.mutedTextColor,
          fontSize: 13,
        }}
      >
        {emptyState ?? "No rows to display."}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-fp-lens={dataAttr}
      data-fp-lens-mode={resolvedMode}
      style={{
        width: "100%",
        color: palette.textColor,
      }}
    >
      {resolvedMode === "table" ? (
        <TableMode columns={columns} rows={rows} rowKey={rowKey} palette={palette} />
      ) : (
        <CardsMode columns={columns} rows={rows} rowKey={rowKey} palette={palette} />
      )}
    </div>
  );
}

// ── Internals ───────────────────────────────────────────────────────

type Palette = Required<NonNullable<TableProps<unknown>["palette"]>>;

function TableMode<Row>({
  columns,
  rows,
  rowKey,
  palette,
}: {
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, i: number) => string;
  palette: Palette;
}) {
  return (
    <table
      data-fp-lens-mode="table"
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 13,
      }}
    >
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.id}
              scope="col"
              style={{
                position: "sticky",
                top: 0,
                background: palette.headerBg,
                color: palette.headerColor,
                textAlign: col.align ?? "left",
                padding: "10px 12px",
                fontWeight: 600,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                borderBottom: `1px solid ${palette.borderColor}`,
                width: col.width,
                zIndex: 1,
              }}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={rowKey(row, i)}
            style={{
              borderBottom: `1px solid ${palette.borderColor}`,
            }}
          >
            {columns.map((col) => (
              <td
                key={col.id}
                style={{
                  padding: "10px 12px",
                  textAlign: col.align ?? "left",
                  verticalAlign: "top",
                }}
              >
                {col.cell(row, i)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CardsMode<Row>({
  columns,
  rows,
  rowKey,
  palette,
}: {
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row, i: number) => string;
  palette: Palette;
}) {
  return (
    <div
      data-fp-lens-mode="cards"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {rows.map((row, i) => {
        const cardId = rowKey(row, i);
        return (
          <div
            key={cardId}
            role="group"
            aria-label={cardId}
            style={{
              background: palette.elevatedSurface,
              border: `1px solid ${palette.borderColor}`,
              borderRadius: 8,
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {columns.map((col) => {
              const label =
                col.cardLabel === null
                  ? null
                  : col.cardLabel ??
                    (typeof col.header === "string" ? col.header : col.id);
              return (
                <div
                  key={col.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: label ? "120px minmax(0, 1fr)" : "minmax(0, 1fr)",
                    gap: 8,
                    fontSize: 13,
                  }}
                >
                  {label && (
                    <span
                      style={{
                        color: palette.mutedTextColor,
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        fontWeight: 600,
                      }}
                    >
                      {label}
                    </span>
                  )}
                  <span style={{ color: palette.textColor }}>{col.cell(row, i)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
