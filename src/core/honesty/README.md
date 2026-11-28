# Honesty Lens projection

`projectHonestyTurn` is the headless reading for one recorded answer. A host passes the original ordinal of the turn’s `agent.turn_start` event and, for replay, the inclusive ordinal of the selected event.

```ts
import { projectHonestyTurn } from 'agentfootprint-lens/core';

const turn = projectHonestyTurn(recording, {
  startEventIndex: turnStartOrdinal,
  throughEventIndex: selectedEventOrdinal,
});
```

The trust line quotes the standing's meaning from the recorded assessment and distinguishes a recorded “Not assessed” from a rewind before assessment. The five steps show the response outcome, standing, checks, tool activity and supplied context. Tool rows keep request, execution and outcome separate. They join entry and settlement facts by the recorded call occurrence at the selected event's exact log position. An unreadable ledger leaves stream evidence available. A denied result only contributes the fixed refusal sentence.

Each step returns at most five rows and the number of remaining rows. Addressed rows retain their original event ordinal and any recorded source position. Sentence marks describe the absence of a recorded sentence-level link. Paragraph spacing survives splitting. A completed response alone carries no delivery confirmation.

The reader refuses a recording over 50,000 events or an answer over 131,072 UTF-16 units or 4,096 sentences. It reads saved data without calls, browser state or React. The two [producer fixtures](__fixtures__/README.md) exercise a coverage gap and a schema retry.

The tool ledger admits detached plain recording values before folding. The shared
cursor keeps native structured-clone state. The response reader resolves a
redaction marker using the selected run's snapshot and leaves it ambiguous when
that run's recorder evidence is missing.

The panel reasons retain the recorded assessment order. A row links to the reason's position in the assessment event. When the exact terminal prefix can be read, the producer's saved assessment fold supplies the corresponding witness, declared words and failure category. The reader avoids the final snapshot's shared state when replay selects an earlier turn. Missing witnesses leave the recorded reason text.
