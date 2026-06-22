/**
 * <Replay> — offline render of a persisted Trace (no live runner).
 *
 * xyflow's <ReactFlow> uses ResizeObserver; the jsdom polyfill is set up in the
 * shared test setup (same as LensFlow.test). Tests:
 *   - Unit:        structureGraphFromSpec(spec) === structureGraphFromRunner(runner)
 *                  (the extraction is behaviour-preserving).
 *   - Functional:  <Replay> mounts a flowchart from trace.structure offline.
 *   - Security/UX: the raw-content banner shows iff redaction === 'none'.
 *   - Edge:        a structure-less trace renders the re-capture hint, not a crash.
 */

import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { LLMCall, type LLMProvider } from "agentfootprint";
import type { Trace } from "agentfootprint/observe";

import { Replay } from "./Replay.js";
import {
  structureGraphFromRunner,
  structureGraphFromSpec,
} from "../core/collapser/structureGraphFromRunner.js";

const stubProvider = { name: "mock" } as unknown as LLMProvider;

const buildRunner = () =>
  LLMCall.create({
    id: "call",
    name: "Call",
    provider: stubProvider,
    model: "mock",
  })
    .system("test")
    .build();

/** A persisted Trace whose `structure` is a real serialized buildTimeStructure. */
const traceFor = (redaction: Trace["redaction"] = "pii"): Trace => ({
  version: 1,
  events: [],
  structure: (buildRunner().getSpec() as { buildTimeStructure?: unknown })
    .buildTimeStructure,
  redaction,
});

describe("structureGraphFromSpec — unit", () => {
  it("builds the SAME graph from a spec as structureGraphFromRunner does from the runner", () => {
    const runner = buildRunner();
    const fromRunner = structureGraphFromRunner(
      runner as unknown as Parameters<typeof structureGraphFromRunner>[0],
    );
    const fromSpec = structureGraphFromSpec(
      (runner.getSpec() as { buildTimeStructure?: unknown }).buildTimeStructure,
    );
    expect(fromSpec).toEqual(fromRunner); // extraction is behaviour-preserving
  });
});

describe("<Replay> — functional", () => {
  it("mounts a flowchart from trace.structure offline (no runner)", () => {
    const { container } = render(<Replay trace={traceFor()} />);
    expect(container.querySelector(".react-flow")).toBeTruthy();
  });
});

describe("<Replay> — redaction UX", () => {
  it('shows the raw-content banner when redaction is "none"', () => {
    const { getByRole, container } = render(
      <Replay trace={traceFor("none")} />,
    );
    expect(getByRole("status").textContent).toMatch(/raw, un-redacted/i);
    expect(container.querySelector(".react-flow")).toBeTruthy();
  });

  it('hides the banner when redacted ("pii")', () => {
    const { container } = render(<Replay trace={traceFor("pii")} />);
    expect(container.querySelector(".lens-replay__warning")).toBeNull();
  });

  it("can suppress the banner via warnOnRawContent={false}", () => {
    const { container } = render(
      <Replay trace={traceFor("none")} warnOnRawContent={false} />,
    );
    expect(container.querySelector(".lens-replay__warning")).toBeNull();
  });
});

describe("<Replay> — edge", () => {
  it("renders a re-capture hint (not a crash) when the trace has no structure", () => {
    const trace: Trace = { version: 1, events: [], redaction: "none" };
    const { container } = render(<Replay trace={trace} />);
    expect(container.querySelector(".lens-replay--no-structure")).toBeTruthy();
    expect(container.querySelector(".react-flow")).toBeNull();
  });
});
