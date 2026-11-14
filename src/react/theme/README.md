# Theme

Shared token vocabulary and palette projection for direct Lens and recording
surfaces. variables.ts owns the one light/dark preset and node-state overlay
projection. It stamps only --fp-* so consumer --lens-* overrides retain priority.
No explicit theme produces no custom-property declarations. Tests sit beside
the projection; Lens and WhyLens DOM tests check actual scope ancestry.
