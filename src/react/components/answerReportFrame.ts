/**
 * The print frame's constant text — its document skeleton and its stylesheet.
 * Kept apart from `AnswerReportPrint.tsx` because neither is printed to a
 * reader as words (the own-claims walker reads that file; this one holds
 * markup and CSS only). No data ever goes through these strings: the report
 * enters the frame through React, as text nodes.
 */

/** The frame's document. The `<title>` and the stylesheet are set after it is written. */
export const ANSWER_REPORT_FRAME_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title></title><style></style></head><body><div id="answer-report"></div></body></html>';

/** The report's stylesheet — always light, black ink, borders not shades; 10.5 pt; 16 mm margins. */
export const ANSWER_REPORT_PRINT_CSS = `
@page { size: auto; margin: 16mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #ffffff; color: #000000; }
body { font: 10.5pt/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
h1 { font-size: 15pt; margin: 0 0 2pt; }
h2 { font-size: 9pt; letter-spacing: 0.06em; text-transform: uppercase; margin: 12pt 0 4pt; }
p { margin: 0 0 4pt; }
code { font-family: ui-monospace, Menlo, monospace; font-size: 0.92em; }
.meta { font-size: 8.5pt; margin: 0 0 10pt; }
.answer { border: 1px solid #000000; padding: 6pt 8pt; white-space: pre-wrap; }
.one { border: 1px solid #000000; border-left-width: 4px; padding: 6pt 8pt; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #000000; padding: 5pt 6pt; text-align: left; vertical-align: top; }
th { width: 24%; font-size: 8.5pt; letter-spacing: 0.05em; text-transform: uppercase; }
ul { margin: 2pt 0 4pt; padding-left: 14pt; }
.by { display: block; font-size: 8pt; }
.chips { font-size: 8pt; }
.foot { margin-top: 10pt; font-size: 8pt; }
`;

