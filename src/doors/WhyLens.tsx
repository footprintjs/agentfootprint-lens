/**
 * <WhyLens> — the `agentfootprint-lens/why` door's mount component.
 *
 * Hand it the RECORDING — `recordRun(agent)`'s `{ snapshot, events,
 * structure }`, the `persistRecording` envelope, or the producer-decoded
 * context port — and it mounts
 * the shipped `<Lens>` shell over the replay, on the MILESTONE axis
 * (`granularity="group"`): the agent's own moments, banded by iteration.
 *
 *   import { WhyLens } from 'agentfootprint-lens/why';
 *
 *   <WhyLens recording={JSON.parse(json)} />
 *
 * VALIDATES AT MOUNT. A wrong input renders a teaching refusal card — what
 * was received, where to go — never a blank panel (`readAgentRecording` is
 * the gate; `DoorRefusalCard` is the card). TypeScript consumers fail at
 * build time instead: `recording` is typed `AgentRecordingInput`, which a
 * bare commit log is not assignable to.
 *
 * ONE REPLAY PER RECORDING: `observeRecording` is memoized on the `recording`
 * reference, so keep the parsed object stable across renders (parse once,
 * outside the render body) — the same rule `observeRecording`'s own docs
 * state.
 *
 * Everything else — the controlled cursor (`step`/`onStepChange`), the theme,
 * the humanizer, the detail slot — is the `<Lens>` grammar, passed through
 * unchanged. A host that already holds a recorder mounts `<Lens>` directly;
 * it is exported beside this.
 */

import React, { useMemo } from 'react';

import { observeRecording } from '../core/observeRecording.js';
import { Lens, type LensProps } from '../react/Lens.js';
import { DoorRefusalCard } from '../react/components/DoorRefusalCard.js';
import { REFUSAL_GO_TO, readAgentRecording, type AgentRecordingInput } from '../core/recordingInput.js';
import { RecordedContextScope } from '../react/recordedContext.js';
import { isDecodedContextPort } from '../core/contextOpening.js';
import { ContextRecordingGate } from '../react/ContextRecordingGate.js';
import type { RecordingVerdict } from '../core/recordingInput.js';

/** Sentence 1 of the door's refusal — what the Why Lens reads. */
export const WHY_LENS_READS =
  'an agent’s recording — the { snapshot, events, structure } that recordRun() froze, or the envelope persistRecording() wrote';

export interface WhyLensProps
  extends Pick<
    LensProps,
    | 'view'
    | 'stepStrip'
    | 'showSummary'
    | 'theme'
    | 'humanizer'
    | 'appName'
    | 'commentaryTemplates'
    | 'granularity'
    | 'step'
    | 'onStepChange'
    | 'slots'
  > {
  /**
   * The recording — envelope, `{ snapshot, events, structure }`, or producer-decoded context. The
   * branded input: anything else refuses at mount (JS) or at build (TS).
   */
  readonly recording: AgentRecordingInput;
}

export function WhyLens(props: WhyLensProps): React.ReactElement {
  return isDecodedContextPort(props.recording)
    ? <ContextRecordingGate recording={props.recording}>
        {verdict => <WhyLensView {...props} verdict={verdict} />}
      </ContextRecordingGate>
    : <LegacyWhyLens {...props} />;
}

function LegacyWhyLens(props: WhyLensProps): React.ReactElement {
  const verdict = useMemo(() => readAgentRecording(props.recording), [props.recording]);
  return <WhyLensView {...props} verdict={verdict} />;
}

function WhyLensView({ recording: _recording, verdict, granularity = 'group', view = 'engineer', ...rest }:
  WhyLensProps & { readonly verdict: RecordingVerdict }): React.ReactElement {
  const observed = useMemo(
    () => (verdict.ok ? observeRecording(verdict.recording) : undefined),
    [verdict],
  );

  if (!verdict.ok || observed === undefined) {
    const refused = verdict.ok
      ? { received: 'a recording this replay could not open', goTo: REFUSAL_GO_TO['record-the-run'] }
      : { received: verdict.received, goTo: REFUSAL_GO_TO[verdict.goTo] };
    return <DoorRefusalCard door="Why Lens" reads={WHY_LENS_READS} received={refused.received} goTo={refused.goTo} />;
  }

  return (
    <RecordedContextScope view={verdict.context} showPanel={view !== 'user'} theme={rest.theme}>
    <Lens
      recorder={observed.recorder}
      {...(observed.runner !== undefined && { runner: observed.runner })}
      granularity={granularity}
      view={view}
      {...rest}
    />
    </RecordedContextScope>
  );
}
