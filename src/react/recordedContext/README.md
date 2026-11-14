# recordedContext — a recording's dictionary and call view

The scoped provider owns one immutable headless context model for this
recording. The panel and copy button consume that same model; no global
registry, second recorder or second cursor is introduced. Legacy input has
no model and renders its existing Lens tree without an extra panel.

The dictionary prints each exact string once. Reference buttons open that
dictionary entry; they do not fetch artifact data. Per-call rows retain
duplicate occurrences, recorded counts/order and native coordinates. A
source event index is shown as evidence, not used as a decoded-array index.
This panel describes recorded context, not provider acceptance.
