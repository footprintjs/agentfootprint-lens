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
