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
    const { container } = render(<Replay trace={traceFor("none")} />);
    expect(
      container.querySelector(".lens-replay__warning")?.textContent,
    ).toMatch(/raw, un-redacted/i);
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

describe("<Replay> — one replay path", () => {
  /** A Trace whose domain-event log holds a real run + subflow boundary pair. */
  const tracedRun = (): Trace => ({
    version: 1,
    redaction: "pii",
    structure: (buildRunner().getSpec() as { buildTimeStructure?: unknown })
      .buildTimeStructure,
    events: [
      {
        type: "run.entry",
        runtimeStageId: "__root__#0",
        subflowPath: ["__root__"],
        depth: 0,
        ts: 0,
        commitIdxBefore: 0,
        isRoot: true,
      },
      {
        type: "subflow.entry",
        runtimeStageId: "sf-llm-call#1",
        subflowId: "sf-llm-call",
        localSubflowId: "sf-llm-call",
        subflowName: "Call",
        subflowPath: ["__root__"],
        depth: 1,
        ts: 1,
        commitIdxBefore: 1,
        isAgentInternal: false,
      },
      {
        type: "subflow.exit",
        runtimeStageId: "sf-llm-call#1",
        subflowId: "sf-llm-call",
        localSubflowId: "sf-llm-call",
        subflowName: "Call",
        subflowPath: ["__root__"],
        depth: 1,
        ts: 2,
        commitIdxBefore: 3,
        isAgentInternal: false,
      },
      {
        type: "run.exit",
        runtimeStageId: "__root__#0",
        subflowPath: ["__root__"],
        depth: 0,
        ts: 3,
        commitIdxBefore: 4,
        isRoot: true,
      },
    ] as unknown as Trace["events"],
  });

  it("gives a Trace the full Lens, not a static picture", () => {
    // FAILS ON THE OLD BEHAVIOUR: `<Replay>` rendered `<LensFlow>` and nothing
    // else — no transport, no moments rail, no detail — while the docs said an
    // offline replay "matches the live `<Lens>`".
    const { container } = render(<Replay trace={tracedRun()} />);

    expect(container.querySelector(".react-flow")).toBeTruthy();
    expect(container.textContent).toMatch(/What happened/i);
    expect(container.textContent).toMatch(/Live/);
  });

  it("rebuilds the step strip from `trace.events`, which ARE the boundary log", () => {
    // The Trace stores the domain events at the top level; a footprintjs
    // snapshot stores them as the `BoundaryEvents` entry. Same events — this
    // pins that the adapter puts them where the strip reads them.
    const { container } = render(<Replay trace={tracedRun()} />);

    expect(container.textContent).not.toMatch(/no step boundaries/i);
    expect(container.textContent).not.toMatch(/no moments to walk/i);
  });

  it("says out loud that a Trace has no commentary to give", () => {
    const { container } = render(<Replay trace={tracedRun()} />);

    expect(container.textContent).toMatch(/A Trace carries the boundary log/);
  });
});
