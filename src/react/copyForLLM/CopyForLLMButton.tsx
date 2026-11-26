import React, { useState } from 'react';
import type { LensRecorder } from '../../core/LensRecorder.js';
import type { Humanizer } from '../../core/humanizer.js';
import { useRecordedContext } from '../recordedContext.js';
import { T } from '../theme/index.js';

/**
 * "Copy for LLM" button — dumps the run as one Markdown blob (run
 * summary + per-boundary rollups + every step with payload + commentary)
 * to the clipboard, ready to paste into a chat for debugging
 * assistance. Mirror of footprint-explainable-ui's NarrativePanel
 * "Copy for LLM" button.
 */
export const CopyForLLMButton: React.FC<{
  recorder: LensRecorder;
  stepGraph?: import("agentfootprint/observe").StepGraph;
  humanizer: Humanizer;
  appName: string;
  /** Optional snapshot of view state at copy time (slider position,
   *  current step, drill path, etc.). Plumbed by EngineerView so the
   *  copied paste includes a Current View State section — invaluable
   *  for diagnosing slider-sync / focus / drill bugs from the paste
   *  alone. */
  viewState?: import("../../core/copyForLLM.js").ViewStateSnapshot;
  /** Where each step's boundary payloads are; a payload not loaded is written as such. */
  payloads?: import("../../core/subflowPayloads/index.js").StepPayloadReader;
}> = ({ recorder, stepGraph, humanizer, appName, viewState, payloads }) => {
  const [copied, setCopied] = useState(false);
  const context = useRecordedContext();
  const [failed, setFailed] = useState(false);
  const handleCopy = async (): Promise<void> => {
    setFailed(false);
    let text: string;
    try {
      const { buildLLMText } = await import("../../core/copyForLLM.js");
      text = buildLLMText({
      recorder,
      ...(context !== undefined ? { context } : {}),
      ...(stepGraph ? { stepGraph } : {}),
      humanizer,
      appName,
      ...(viewState ? { viewState } : {}),
      ...(payloads ? { payloads } : {}),
      });
    } catch {
      // A refused presentation must never copy a partial or misleading run.
      setFailed(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may be unavailable (insecure context, sandbox,
      // older browser). Fall back to a textarea trick: select + copy.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setFailed(true);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };
  return (
    <button
      onClick={handleCopy}
      title={failed ? "Run could not be copied safely" : "Copy run as LLM-ready text — paste into a chat to debug"}
      aria-label={failed ? "Run could not be copied safely" : "Copy run as LLM-ready text"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        // Icon-only (the tooltip explains it) — the full "Copy for LLM" label
        // ate space the metrics row needed. Compact square button.
        padding: "6px 8px",
        marginRight: 6,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: "inherit",
        color: copied ? "#fff" : T.textPrimary,
        background: copied ? T.warning : T.bgElevated,
        border: `1px solid ${copied ? T.warning : T.border}`,
        borderRadius: 6,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flex: "none",
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
      }}
    >
      {failed ? "!" : copied ? "✓" : "📋"}
    </button>
  );
};

