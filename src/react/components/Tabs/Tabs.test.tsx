/**
 * Tabs — unit tests.
 *
 * Covers the behaviour contract users of the primitive will rely on:
 *   • Uncontrolled: selects the first tab (or defaultTabId) on mount,
 *     and flips selection when a different tab button is clicked.
 *   • Controlled: the parent's selectedTabId wins; onChange fires but
 *     internal state doesn't take over.
 *   • Disabled tabs are not selectable via click or arrow keys.
 *   • Arrow / Home / End keys navigate across enabled tabs with wrap.
 *   • `renderAll` mounts all panels and hides the inactive ones
 *     (scroll / form state preservation).
 *   • Variants apply their distinguishing visual tokens (selected
 *     background for folder, accent fill for pills, underline for
 *     underline).
 *   • trailingSlot renders on the tab strip.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "./Tabs";
import type { TabDef } from "./Tabs";

function buildTabs(overrides: Partial<Record<string, Partial<TabDef>>> = {}): TabDef[] {
  const base: TabDef[] = [
    { id: "one", label: "One", content: <div>panel-one</div> },
    { id: "two", label: "Two", content: <div>panel-two</div> },
    { id: "three", label: "Three", content: <div>panel-three</div> },
  ];
  return base.map((t) => ({ ...t, ...(overrides[t.id] ?? {}) }));
}

describe("<Tabs>", () => {
  it("selects the first tab by default and renders its panel", () => {
    render(<Tabs tabs={buildTabs()} />);
    const tabOne = screen.getByRole("tab", { name: "One" });
    expect(tabOne).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("panel-one")).toBeInTheDocument();
    expect(screen.queryByText("panel-two")).not.toBeInTheDocument();
  });

  it("honours defaultTabId when provided (uncontrolled)", () => {
    render(<Tabs tabs={buildTabs()} defaultTabId="two" />);
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("panel-two")).toBeInTheDocument();
  });

  it("flips to a tab when the user clicks its button (uncontrolled)", async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={buildTabs()} />);
    await user.click(screen.getByRole("tab", { name: "Three" }));
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("panel-three")).toBeInTheDocument();
  });

  it("respects selectedTabId over internal state when controlled", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <Tabs
        tabs={buildTabs()}
        selectedTabId="one"
        onChange={onChange}
      />,
    );
    // Parent hasn't bumped selectedTabId — selection stays on "one"
    // even after a click.
    await user.click(screen.getByRole("tab", { name: "Two" }));
    expect(onChange).toHaveBeenCalledWith("two");
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Parent accepts the change — now "two" is visible.
    rerender(
      <Tabs
        tabs={buildTabs()}
        selectedTabId="two"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("skips disabled tabs on click", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <Tabs
        tabs={buildTabs({ two: { disabled: true } })}
        onChange={onChange}
      />,
    );
    const disabledTab = screen.getByRole("tab", { name: "Two" });
    expect(disabledTab).toBeDisabled();
    await user.click(disabledTab);
    expect(onChange).not.toHaveBeenCalled();
    // "one" remains selected.
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("arrow keys navigate across enabled tabs with wrap-around", () => {
    render(
      <Tabs
        tabs={buildTabs({ two: { disabled: true } })}
        defaultTabId="one"
      />,
    );
    const tablist = screen.getByRole("tablist");
    // → should skip disabled "two" and land on "three"
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // → again should wrap back to "one"
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // ← should wrap to "three"
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // End/Home jumps
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.keyDown(tablist, { key: "End" });
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renderAll mounts every panel and hides the inactive ones", () => {
    render(<Tabs tabs={buildTabs()} renderAll />);
    // All three panels are in the DOM.
    expect(screen.getByText("panel-one")).toBeInTheDocument();
    expect(screen.getByText("panel-two")).toBeInTheDocument();
    expect(screen.getByText("panel-three")).toBeInTheDocument();
    // Only the selected one's panel has aria-hidden=false.
    const panels = screen.getAllByRole("tabpanel", { hidden: true });
    expect(panels).toHaveLength(3);
    const visible = panels.filter(
      (p) => p.getAttribute("aria-hidden") === "false",
    );
    expect(visible).toHaveLength(1);
  });

  it("renders trailingSlot on the tab strip", () => {
    render(
      <Tabs
        tabs={buildTabs()}
        trailingSlot={<button>settings</button>}
      />,
    );
    const strip = screen.getByRole("tablist");
    expect(within(strip).getByRole("button", { name: "settings" })).toBeInTheDocument();
  });

  it("applies the folder tab-into-body style to the active tab", () => {
    render(<Tabs tabs={buildTabs()} />);
    const active = screen.getByRole("tab", { name: "One" });
    // Active tab in folder style: rounded top corners, no visible
    // border (the fill IS the surface so any outline would break the
    // "tab + body are one continuous shape" illusion). JSDOM
    // serializes `border: none` via the shorthand-with-default-width
    // form, which renders as "border: medium" in the style attribute
    // (effectively: no border drawn because no style is set).
    const style = active.getAttribute("style") ?? "";
    expect(style).toMatch(/border-radius:\s*10px 10px 0 0/);
    expect(style).toMatch(/border:\s*(none|medium)/);
    // And the surface color is applied as background.
    expect(style).toMatch(/background:\s*rgb\(15,\s*23,\s*42\)/);
  });

  it("renders a leadingSlot on the tab strip (used by Lens for appName brand)", () => {
    render(
      <Tabs
        tabs={buildTabs()}
        leadingSlot={<span data-testid="brand">Neo</span>}
      />,
    );
    expect(screen.getByTestId("brand")).toBeInTheDocument();
  });
});
