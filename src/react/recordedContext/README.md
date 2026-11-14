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

The decoded dictionary and Lens share the selected palette scope, using the
same theme projection as direct Lens. Its display-contents wrapper changes no
layout box. Only --fp-* defaults are stamped; ancestor --lens-* overrides still
win, and no palette is stamped without an explicit theme. Legacy input keeps
its original tree without this wrapper.
