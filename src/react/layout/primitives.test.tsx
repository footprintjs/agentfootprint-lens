/**
 * Stack, Scroller, Surface, Table, FocusRegion — unit tests.
 *
 * Surface-level contracts only — these primitives are style-heavy,
 * so tests focus on the style attributes + data hooks that consumers
 * rely on, not pixel-perfect rendering (JSDOM doesn't do real layout).
 */
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { Stack } from "./Stack";
import { Scroller } from "./Scroller";
import { Surface } from "./Surface";
import { Table } from "./Table";
import type { TableColumn } from "./Table";
import { FocusRegion } from "./FocusRegion";

// ── Stack ──────────────────────────────────────────────────────

describe("<Stack>", () => {
  it("defaults to a vertical flex column with 8px gap", () => {
    render(
      <Stack dataAttr="stack-default">
        <span>a</span>
        <span>b</span>
      </Stack>,
    );
    const el = document.querySelector('[data-fp-lens="stack-default"]') as HTMLElement;
    const style = el.getAttribute("style") ?? "";
    expect(style).toMatch(/display:\s*flex/);
    expect(style).toMatch(/flex-direction:\s*column/);
    expect(style).toMatch(/gap:\s*8px/);
  });

  it("switches to row direction and custom gap", () => {
    render(
      <Stack direction="row" gap={16} dataAttr="stack-row">
        <span>a</span>
      </Stack>,
    );
    const el = document.querySelector('[data-fp-lens="stack-row"]') as HTMLElement;
    const style = el.getAttribute("style") ?? "";
    expect(style).toMatch(/flex-direction:\s*row/);
    expect(style).toMatch(/gap:\s*16px/);
  });

  it("fill=true applies flex:1 on the main axis", () => {
    render(
      <Stack fill dataAttr="stack-fill">
        <span>a</span>
      </Stack>,
    );
    const el = document.querySelector('[data-fp-lens="stack-fill"]') as HTMLElement;
    const style = el.getAttribute("style") ?? "";
    expect(style).toMatch(/flex:\s*1 1 0%/);
    expect(style).toMatch(/min-height:\s*0/);
  });

  it("enables wrap via prop", () => {
    render(<Stack wrap dataAttr="stack-wrap">x</Stack>);
    const el = document.querySelector('[data-fp-lens="stack-wrap"]') as HTMLElement;
    expect(el.getAttribute("style") ?? "").toMatch(/flex-wrap:\s*wrap/);
  });
});

// ── Scroller ───────────────────────────────────────────────────

describe("<Scroller>", () => {
  it("renders a position:relative outer + position:absolute inner with overflow-y:auto", () => {
    render(<Scroller dataAttr="scroll-y">content</Scroller>);
    const outer = document.querySelector('[data-fp-lens="scroll-y"]') as HTMLElement;
    expect(outer.getAttribute("style") ?? "").toMatch(/position:\s*relative/);
    const inner = outer.firstElementChild as HTMLElement;
    const innerStyle = inner.getAttribute("style") ?? "";
    expect(innerStyle).toMatch(/position:\s*absolute/);
    expect(innerStyle).toMatch(/inset:\s*0/);
    expect(innerStyle).toMatch(/overflow-y:\s*auto/);
    expect(innerStyle).toMatch(/overflow-x:\s*hidden/);
    expect(innerStyle).toMatch(/contain:\s*content/);
  });

  it("swaps axes when direction='x'", () => {
    render(<Scroller direction="x" dataAttr="scroll-x">content</Scroller>);
    const inner = (document.querySelector('[data-fp-lens="scroll-x"]') as HTMLElement)
      .firstElementChild as HTMLElement;
    const style = inner.getAttribute("style") ?? "";
    expect(style).toMatch(/overflow-x:\s*auto/);
    expect(style).toMatch(/overflow-y:\s*hidden/);
  });

  it("applies padding on the inner panel", () => {
    render(<Scroller padding={16} dataAttr="scroll-pad">content</Scroller>);
    const inner = (document.querySelector('[data-fp-lens="scroll-pad"]') as HTMLElement)
      .firstElementChild as HTMLElement;
    expect(inner.getAttribute("style") ?? "").toMatch(/padding:\s*16px/);
  });

  it("injects hide-scrollbar CSS when requested", () => {
    render(<Scroller hideScrollbar dataAttr="scroll-hide">content</Scroller>);
    const styleEl = document.getElementById("fp-lens-scroller-hide");
    expect(styleEl).not.toBeNull();
    const inner = (document.querySelector('[data-fp-lens="scroll-hide"]') as HTMLElement)
      .firstElementChild as HTMLElement;
    expect(inner.getAttribute("data-fp-lens-hide-scrollbar")).toBe("true");
  });
});

// ── Surface ────────────────────────────────────────────────────

describe("<Surface>", () => {
  it("defaults to the card variant with full border + shadow + padding", () => {
    render(<Surface dataAttr="surf-card">body</Surface>);
    const el = document.querySelector('[data-fp-lens="surf-card"]') as HTMLElement;
    const style = el.getAttribute("style") ?? "";
    expect(style).toMatch(/border-radius:\s*10px/);
    expect(style).toMatch(/padding:\s*14px/);
    expect(style).toMatch(/box-shadow:/);
  });

  it("well variant uses the elevated surface color + no shadow", () => {
    render(<Surface variant="well" dataAttr="surf-well">body</Surface>);
    const el = document.querySelector('[data-fp-lens="surf-well"]') as HTMLElement;
    const style = el.getAttribute("style") ?? "";
    expect(style).not.toMatch(/box-shadow:/);
    // Defaults: well uses elevatedSurface (#1e293b) → rgb(30, 41, 59)
    expect(style).toMatch(/background:\s*rgb\(30,\s*41,\s*59\)/);
  });

  it("pill variant is 999px radius + inline-flex", () => {
    render(<Surface variant="pill" dataAttr="surf-pill">tag</Surface>);
    const el = document.querySelector('[data-fp-lens="surf-pill"]') as HTMLElement;
    const style = el.getAttribute("style") ?? "";
    expect(style).toMatch(/border-radius:\s*999px/);
    expect(style).toMatch(/display:\s*inline-flex/);
  });

  it("none variant renders a bare div with no visual chrome", () => {
    render(<Surface variant="none" dataAttr="surf-none">body</Surface>);
    const el = document.querySelector('[data-fp-lens="surf-none"]') as HTMLElement;
    const style = el.getAttribute("style") ?? "";
    expect(style).not.toMatch(/border-radius:/);
    expect(style).not.toMatch(/background:/);
  });

  it("accepts palette overrides", () => {
    render(
      <Surface palette={{ surface: "#abcdef" }} dataAttr="surf-palette">
        body
      </Surface>,
    );
    const el = document.querySelector('[data-fp-lens="surf-palette"]') as HTMLElement;
    expect(el.getAttribute("style") ?? "").toMatch(
      /background:\s*rgb\(171,\s*205,\s*239\)/,
    );
  });
});

// ── Table ──────────────────────────────────────────────────────

interface Row {
  id: string;
  name: string;
  status: string;
}

const COLUMNS: TableColumn<Row>[] = [
  { id: "name", header: "Name", cell: (r) => r.name, cardLabel: null },
  { id: "status", header: "Status", cell: (r) => r.status },
];

const ROWS: Row[] = [
  { id: "1", name: "Alpha", status: "ok" },
  { id: "2", name: "Beta", status: "error" },
];

describe("<Table>", () => {
  it("renders table markup in mode='table' with sticky thead", () => {
    render(
      <Table
        mode="table"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        dataAttr="tbl-t"
      />,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    const tbl = document.querySelector('[data-fp-lens="tbl-t"]') as HTMLElement;
    expect(tbl.getAttribute("data-fp-lens-mode")).toBe("table");
    // Sticky header
    const th = screen.getByRole("columnheader", { name: "Name" });
    expect(th.getAttribute("style") ?? "").toMatch(/position:\s*sticky/);
  });

  it("renders cards in mode='cards' with role=group", () => {
    render(
      <Table
        mode="cards"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        dataAttr="tbl-c"
      />,
    );
    // One group per row, aria-label = rowKey
    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    expect(groups[0].getAttribute("aria-label")).toBe("1");
    expect(groups[1].getAttribute("aria-label")).toBe("2");
    // Labels in card mode come from headers — "Status" shown
    // (once per card = 2 total); "Name" has cardLabel:null so omitted.
    expect(screen.getAllByText("Status")).toHaveLength(2);
    expect(screen.queryByText("Name")).not.toBeInTheDocument();
  });

  it("renders the empty state when rows is empty", () => {
    render(
      <Table
        columns={COLUMNS}
        rows={[]}
        rowKey={(r) => r.id}
        emptyState={<span>No data captured yet.</span>}
        dataAttr="tbl-empty"
      />,
    );
    expect(screen.getByText("No data captured yet.")).toBeInTheDocument();
  });
});

// ── FocusRegion ───────────────────────────────────────────────

describe("<FocusRegion>", () => {
  it("updates data-focused when a focusable descendant receives focus", () => {
    render(
      <FocusRegion dataAttr="focus-test">
        <button>click</button>
      </FocusRegion>,
    );
    const region = document.querySelector('[data-fp-lens="focus-test"]') as HTMLElement;
    expect(region.getAttribute("data-focused")).toBe("false");
    // Wrap in act() so React flushes the setState triggered by the
    // native focusin listener before we read the DOM attribute.
    act(() => {
      fireEvent.keyDown(document, { key: "Tab" });
      screen.getByRole("button", { name: "click" }).focus();
    });
    expect(region.getAttribute("data-focused")).toBe("true");
    expect(region.getAttribute("data-focus-visible")).toBe("true");
  });

  it("fires onFocusChange on state transitions", () => {
    const onChange = vi.fn();
    render(
      <FocusRegion dataAttr="focus-cb" onFocusChange={onChange}>
        <button>click</button>
      </FocusRegion>,
    );
    act(() => {
      fireEvent.keyDown(document, { key: "Tab" });
      screen.getByRole("button").focus();
    });
    const calls = onChange.mock.calls.map((c) => c[0]);
    expect(calls.some((s) => s.focused === true)).toBe(true);
  });

  it("does not render a ring when showRing=false", () => {
    render(
      <FocusRegion showRing={false} dataAttr="focus-no-ring">
        <button>x</button>
      </FocusRegion>,
    );
    const region = document.querySelector('[data-fp-lens="focus-no-ring"]') as HTMLElement;
    act(() => {
      fireEvent.keyDown(document, { key: "Tab" });
      screen.getByRole("button").focus();
    });
    const style = region.getAttribute("style") ?? "";
    expect(style).toMatch(/outline:\s*none/);
  });
});
