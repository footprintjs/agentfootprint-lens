/**
 * agentfootprint-lens/react/layout — internal layout primitive
 * library. Re-exported from the React entry so consumers can
 * compose their own shells using the same self-contained building
 * blocks Lens uses internally.
 */
export { SelfSizingRoot } from "./SelfSizingRoot";
export type { SelfSizingRootProps } from "./SelfSizingRoot";

export { FillParent } from "./FillParent";
export type { FillParentProps } from "./FillParent";

export { Stack } from "./Stack";
export type { StackProps } from "./Stack";

export { Scroller } from "./Scroller";
export type { ScrollerProps } from "./Scroller";

export { Surface } from "./Surface";
export type { SurfaceProps, SurfaceVariant, SurfacePalette } from "./Surface";

export { Table } from "./Table";
export type { TableProps, TableColumn } from "./Table";

export {
  FocusRegion,
  useFocusTracking,
} from "./FocusRegion";
export type { FocusRegionProps, FocusState } from "./FocusRegion";
