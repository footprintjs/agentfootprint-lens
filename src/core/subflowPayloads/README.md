# Sub-flow payloads — where a step's boundary payloads are

A sub-flow step's input and output (`StepNode.entryPayload` / `exitPayload`)
and a model-call step's slot payloads (`slotBoundaries.*`) come from the
`subflow.entry` / `subflow.exit` events of the recording's `BoundaryEvents`
row. A saved recording's base part may move those payloads to the invocation
that owns them: the event loses `payload` and gains `payloadWith:
'invocation'`, and its `runtimeStageId` names the invocation. The child reply
then carries them: `{ result, payloads?: { entry?, exit? } }`, each side
`{ status: 'ready', value }` or `{ status: 'unavailable', reason }`.

`marks.ts · readPayloadMarks` reads those marks from the row, by the exact
mark only (an event that still has its own `payload` is recorded). Live
streams and older recordings carry none.

`reader.ts · stepPayloadReader` is the one reading of a payload, shared by
the detail panel, compare-branches and the LLM copy:

| state | when |
|---|---|
| `recorded` | the payload is in the row, or the loaded child's reply has it ready |
| `not-loaded` | marked, and the child is not asked for, loading, failed, answered without payloads (`not-sent`), or cannot be loaded here (`no-source`) |
| `unavailable` | the child's reply says so; the reason is shown for that payload only |
| `none` | no payload and no mark: none was recorded |

Only `none` may be shown as "none recorded" or lead to "in progress".
`notice.ts · payloadNotice` is the one sentence for the other two.
`needed(shown, limit)` names the invocations a view should ask for, in display
order, once each; with a limit, the first `limit` marked invocations count
whether loaded or not, so the asked-for set stays bounded across renders.

`ROW_ONLY_PAYLOADS` is the reader with no marks: every payload is what the row
holds, which is what every view did before payloads could move.
