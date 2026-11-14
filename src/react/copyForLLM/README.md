# copyForLLM — clipboard adapter

The existing copy button is moved as a whole unit from Lens, with its clipboard and
textarea fallback behavior preserved. It passes the recording-scoped context
model to the pure headless formatter when the decoded context door supplies
one. A formatting refusal exposes fixed words and never copies partial text.
Clipboard effects stay here; dictionary and call formatting stay in core.
