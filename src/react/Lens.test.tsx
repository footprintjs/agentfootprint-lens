/**
 * Lens — behavior tests.
 *
 * Verifies the "consumer hands us a runtimeSnapshot + appName and
 * forgets about layout" contract:
 *   • Two tabs render by default — Lens + Explainable Trace
 *   • Default tab is Lens
 *   • Clicking the Trace tab switches content
 *   • defaultTabId="trace" opens Trace on mount
 *   • appName renders as the brand label on the tab strip
 *   • trailingSlot renders on the strip
 *   • Empty snapshot doesn't crash
 *   • `theme` prop applies FootprintTheme tokens internally
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Lens } from "./Lens";
import type { AgentTimeline } from "../core/types";

const emptyTimeline: AgentTimeline = {
  agent: { id: "test", name: "Test" },
  turns: [],
  messages: [],
  tools: [],
  subAgents: [],
  finalDecision: {},
  rawSnapshot: null,
};

describe("<Lens>", () => {
  it("renders both tabs by default (Lens + Explainable Trace)", () => {
    render(<Lens timeline={emptyTimeline} appName="Neo" />);
    expect(screen.getByRole("tab", { name: "Lens" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Explainable Trace" }),
    ).toBeInTheDocument();
  });

  it("defaults to the Lens tab on mount", () => {
    render(<Lens timeline={emptyTimeline} />);
    expect(screen.getByRole("tab", { name: "Lens" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("switches to the Explainable Trace tab when clicked", async () => {
    const user = userEvent.setup();
    render(<Lens timeline={emptyTimeline} />);
    await user.click(screen.getByRole("tab", { name: "Explainable Trace" }));
    expect(
      screen.getByRole("tab", { name: "Explainable Trace" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("honours defaultTabId=\"trace\" on mount", () => {
    render(<Lens timeline={emptyTimeline} defaultTabId="trace" />);
    expect(
      screen.getByRole("tab", { name: "Explainable Trace" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("renders the appName brand label on the tab strip", () => {
    render(<Lens timeline={emptyTimeline} appName="Neo" />);
    const brand = screen.getByText("Neo");
    expect(brand).toBeInTheDocument();
    expect(brand.getAttribute("data-fp-lens")).toBe("brand");
  });

  it("omits the brand label when appName is not provided", () => {
    render(<Lens timeline={emptyTimeline} />);
    // There's no "Neo" text on an appName-less tab strip.
    const brand = document.querySelector('[data-fp-lens="brand"]');
    expect(brand).toBeNull();
  });

  it("renders a trailingSlot alongside the tab buttons", () => {
    render(
      <Lens
        timeline={emptyTimeline}
        trailingSlot={<button>theme-toggle</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "theme-toggle" }),
    ).toBeInTheDocument();
  });

  it("renders gracefully when no snapshot and no timeline are supplied", () => {
    render(<Lens runtimeSnapshot={null} />);
    // Lens tab renders the empty state; Trace tab mounts but has
    // nothing to show. We just assert the tab bar is up.
    expect(screen.getByRole("tab", { name: "Lens" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Explainable Trace" }),
    ).toBeInTheDocument();
  });

  it("wraps its subtree in FootprintTheme when a theme prop is provided", () => {
    // A theme wrapper adds a .fp-theme-root ancestor; when theme is
    // set, that ancestor is present (inside Lens's own DOM, not
    // outside it).
    const { container } = render(
      <Lens
        timeline={emptyTimeline}
        theme={{ colors: { primary: "#ff00aa" } }}
      />,
    );
    expect(container.querySelector(".fp-theme-root")).not.toBeNull();
  });
});
