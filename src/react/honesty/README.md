# Honesty Lens panel

`HonestyLensPanel` presents the standing, sentences and steps from the existing
`projectHonestyTurn` reader. The host supplies the selected `turn` and its
`turnKey`. Use a key unique to that turn in the host, such as the recording ID
and the ordinal of the turn-start event. Keep it stable as the event prefix
changes or the live turn receives new events. Selecting a different key starts
the new turn with its own disclosure and step selection. The panel passes an
exact reason or step address back on “Inspect this step”. The host owns navigation and where to show the record. Opening, closing or switching
between the panel’s steps does not change the underlying replay cursor.

Known and consistent turns start folded. “Not sure” and “Ask” open on
“How far to trust it”. Updates to the same turn follow its recorded standing
until the reader opens or closes the panel. After that, the reader's choice
and focus carry through updates to that turn. Sentence buttons open
“What was checked” and keep the recorded evidence note. All output is rendered as text.

## Inspect and return

Use `HonestyLensRoundTrip` from `agentfootprint-lens/react` when the answer and
the evidence view share a cursor. Pass the controller from `useSharedCursor`
and render the host's Why or Flow view with that same controller. The renderer
also receives the admitted event address. Supply `getAnswerScroller` when a
nested host owns scrolling.

```tsx
<HonestyLensRoundTrip
  turnKey={turnKey}
  turn={turn}
  cursor={shared}
  renderEvidence={(address) => <RecordedEvidence shared={shared} address={address} />}
/>
```

Inspect opens when the saved address resolves to an exact source prefix.
An event without a position leaves the answer open and reports that the
position is unavailable. Back restores the answer's step, sentence, scroll
and focus. If the shared cursor moved during inspection, Back keeps the
new position and offers “Return to original step”. Keep the key stable for
the same recording and turn. A different key discards the prior return point.
