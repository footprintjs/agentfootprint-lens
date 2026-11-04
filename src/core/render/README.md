# render/ — graph data and positions

`toReactFlow.ts` translates Lens graph data into nodes and edges and supplies
size hints. `dagreLayout.ts` positions sized nodes with dagre, preserving the
parent-relative coordinates the renderer expects. `layoutLensGraph.ts`
composes those operations for callers such as the React hook.

These modules do not import React at runtime. The xyflow imports describe
data types. Layout and translation tests live beside their implementation.
