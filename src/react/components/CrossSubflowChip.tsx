/**
 * <CrossSubflowChip> — inline chip pointing at a cross-subflow writer.
 *
 * Layer 3 / Tier B / Lens v0.1.
 *
 * Rendered next to a "reads" entry in the side panel when the read's
 * last writer lives in a DIFFERENT subflow path. Format:
 *
 *   ↩ written by sf-other/stage#N
 *
 * Click → consumer calls `onFocus(writerRuntimeStageId)` to navigate
 * the slider + selection to that writer step.
 */

import React from 'react';

export interface CrossSubflowChipProps {
  readonly writerRuntimeStageId: string;
  readonly writerSubflowPath: readonly string[];
  readonly onFocus?: (runtimeStageId: string) => void;
}

function formatWriterLabel(path: readonly string[], rid: string): string {
  // Strip the __root__ root from the path display for compactness.
  const stripped = path.filter((seg) => seg !== '__root__');
  const stageWithIdx = rid.split('/').pop() ?? rid;
  const dir = stripped.slice(0, -1).join('/');
  return dir.length > 0 ? `${dir}/${stageWithIdx}` : stageWithIdx;
}

export const CrossSubflowChip: React.FC<CrossSubflowChipProps> = ({
  writerRuntimeStageId,
  writerSubflowPath,
  onFocus,
}) => {
  const label = formatWriterLabel(writerSubflowPath, writerRuntimeStageId);
  return (
    <button
      type="button"
      className="lens-cross-subflow-chip"
      data-rid={writerRuntimeStageId}
      title={`Last written by ${writerRuntimeStageId}`}
      onClick={() => onFocus?.(writerRuntimeStageId)}
    >
      <span aria-hidden>↩</span>
      <span className="lens-cross-subflow-chip__label">written by {label}</span>
    </button>
  );
};
