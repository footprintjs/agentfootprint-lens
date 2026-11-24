# Honesty Lens panel

`HonestyLensPanel` presents the standing, sentences and steps from the existing
`projectHonestyTurn` reader. The host supplies the selected turn. The panel
passes an exact reason or step address back on “Inspect this step”. The host
owns navigation and where to show the record. Opening, closing or switching
between the panel’s steps does not change the underlying replay cursor.

Known and consistent turns start folded. Other recorded warnings open on
“How far to trust it”. Sentence buttons open “What was checked” and keep the
recorded evidence note. All output is rendered as text.
