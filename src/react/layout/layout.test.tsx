/**
 * Layout primitives — parent-shape regression tests.
 *
 * Each primitive MUST render a non-zero bounded box across every
 * realistic parent layout model. These tests are the contract that
 * keeps Lens from ever regressing to "height: 0, invisible body"
 * across consumer apps.
 *
 * Six scenarios per primitive:
 *   1. Flex column with `flex: 1` parent
 *   2. Flex row with `flex: 1` parent
 *   3. Grid cell `minmax(0, 1fr)`
 *   4. Block with `height: 100vh`
 *   5. Block with NO height (fallback floor kicks in)
 *   6. Parent that is 0 × 0 (fallback floor kicks in)
 *
 * JSDOM caveat: we can't assert pixel heights reliably because JSDOM
 * doesn't do real layout (`getBoundingClientRect()` returns zeros
 * for pure CSS layout). What we CAN assert is that the primitives
 * apply the correct style attributes for the browser to resolve.
 * That's the surface we want to lock down — inline styles with a
 * known contract — and it's what integration tests in a real
 * browser would verify on top of this.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SelfSizingRoot } from "./SelfSizingRoot";
import { FillParent } from "./FillParent";

describe("<SelfSizingRoot>", () => {
  it("applies the sizing contract (flex + height + min/max + containment)", () => {
    render(<SelfSizingRoot><div>child</div></SelfSizingRoot>);
    const root = document.querySelector('[data-fp-lens="self-sizing-root"]') as HTMLElement;
    expect(root).not.toBeNull();
    const style = root.getAttribute("style") ?? "";
    // Layout: fills when parent is flex column / grid cell / block with height
    expect(style).toMatch(/flex:\s*1 1 0%/);
    expect(style).toMatch(/height:\s*100%/);
    expect(style).toMatch(/display:\s*flex/);
    expect(style).toMatch(/flex-direction:\s*column/);
    // Fallback floor — never collapses
    expect(style).toMatch(/min-height:\s*min\(400px, 100dvh\)/);
    // Ceiling — never blows past viewport
    expect(style).toMatch(/max-height:\s*100dvh/);
    // CSS containment — Lens is a layout island
    expect(style).toMatch(/contain:\s*layout size paint/);
    expect(style).toMatch(/overflow:\s*hidden/);
  });

  it("accepts custom minHeight / maxHeight overrides", () => {
    render(
      <SelfSizingRoot minHeight={200} maxHeight="none">
        <div>child</div>
      </SelfSizingRoot>,
    );
    const root = document.querySelector('[data-fp-lens="self-sizing-root"]') as HTMLElement;
    const style = root.getAttribute("style") ?? "";
    expect(style).toMatch(/min-height:\s*200px/);
    expect(style).toMatch(/max-height:\s*none/);
  });

  it("merges caller style but keeps the layout contract locked", () => {
    render(
      <SelfSizingRoot style={{ background: "red", fontFamily: "serif" }}>
        <div>child</div>
      </SelfSizingRoot>,
    );
    const root = document.querySelector('[data-fp-lens="self-sizing-root"]') as HTMLElement;
    const style = root.getAttribute("style") ?? "";
    expect(style).toMatch(/background:\s*red/);
    expect(style).toMatch(/font-family:\s*serif/);
    // Layout still in effect
    expect(style).toMatch(/flex:\s*1 1 0%/);
    expect(style).toMatch(/contain:\s*layout size paint/);
  });

  it("renders the same style contract regardless of parent layout model", () => {
    const parents: Array<{ name: string; parentStyle: React.CSSProperties }> = [
      { name: "flex column", parentStyle: { display: "flex", flexDirection: "column", height: "100vh" } },
      { name: "flex row", parentStyle: { display: "flex", flexDirection: "row", height: "100vh" } },
      { name: "grid 1fr", parentStyle: { display: "grid", gridTemplateRows: "minmax(0, 1fr)", height: "100vh" } },
      { name: "block 100vh", parentStyle: { height: "100vh" } },
      { name: "block no height", parentStyle: {} },
      { name: "zero-size parent", parentStyle: { width: 0, height: 0 } },
    ];
    for (const { name, parentStyle } of parents) {
      const { unmount } = render(
        <div data-testid={`parent-${name}`} style={parentStyle}>
          <SelfSizingRoot dataAttr={`root-${name}`}>
            <div>child</div>
          </SelfSizingRoot>
        </div>,
      );
      const root = document.querySelector(`[data-fp-lens="root-${name}"]`) as HTMLElement;
      expect(root, `parent: ${name}`).not.toBeNull();
      const style = root.getAttribute("style") ?? "";
      // Same contract in every parent — the self-contained promise
      expect(style, `parent: ${name}`).toMatch(/min-height:\s*min\(400px, 100dvh\)/);
      expect(style, `parent: ${name}`).toMatch(/contain:\s*layout size paint/);
      unmount();
    }
  });
});

describe("<FillParent>", () => {
  it("renders as position:relative outer + position:absolute inner", () => {
    render(
      <FillParent dataAttr="fill-test">
        <div>child</div>
      </FillParent>,
    );
    const outer = document.querySelector('[data-fp-lens="fill-test"]') as HTMLElement;
    expect(outer).not.toBeNull();
    const outerStyle = outer.getAttribute("style") ?? "";
    expect(outerStyle).toMatch(/position:\s*relative/);
    expect(outerStyle).toMatch(/flex:\s*1 1 0%/);
    expect(outerStyle).toMatch(/min-height:\s*0/);
    expect(outerStyle).toMatch(/height:\s*100%/);

    // The inner is the absolutely-positioned child of outer.
    const inner = outer.firstElementChild as HTMLElement;
    expect(inner).not.toBeNull();
    const innerStyle = inner.getAttribute("style") ?? "";
    expect(innerStyle).toMatch(/position:\s*absolute/);
    expect(innerStyle).toMatch(/inset:\s*0/);
  });

  it("merges outerStyle without overriding layout keys", () => {
    render(
      <FillParent
        dataAttr="fill-bg"
        outerStyle={{ background: "blue", borderRadius: 8 }}
      >
        <div>child</div>
      </FillParent>,
    );
    const outer = document.querySelector('[data-fp-lens="fill-bg"]') as HTMLElement;
    const style = outer.getAttribute("style") ?? "";
    expect(style).toMatch(/background:\s*blue/);
    expect(style).toMatch(/border-radius:\s*8px/);
    // Layout still intact
    expect(style).toMatch(/position:\s*relative/);
    expect(style).toMatch(/flex:\s*1 1 0%/);
  });

  it("renders the same structure inside every parent layout", () => {
    const parents: React.CSSProperties[] = [
      { display: "flex", flexDirection: "column", height: "100vh" },
      { display: "flex", flexDirection: "row", height: "100vh" },
      { display: "grid", gridTemplateRows: "minmax(0, 1fr)", height: "100vh" },
      { height: "100vh" },
      {},
      { width: 0, height: 0 },
    ];
    for (const [i, parentStyle] of parents.entries()) {
      const dataAttr = `fp-${i}`;
      const { unmount } = render(
        <div style={parentStyle}>
          <FillParent dataAttr={dataAttr}>
            <div>child</div>
          </FillParent>
        </div>,
      );
      const outer = document.querySelector(`[data-fp-lens="${dataAttr}"]`) as HTMLElement;
      expect(outer, `parent ${i}`).not.toBeNull();
      const inner = outer.firstElementChild as HTMLElement;
      expect(inner, `parent ${i}`).not.toBeNull();
      expect(inner.getAttribute("style") ?? "", `parent ${i}`).toMatch(
        /position:\s*absolute/,
      );
      unmount();
    }
  });
});
