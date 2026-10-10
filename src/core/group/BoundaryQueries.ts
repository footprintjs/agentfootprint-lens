import type { BoundaryRecorder } from 'agentfootprint/observe';

/**
 * The boundary index's read-only query port. Lens consumes the recorder's
 * public methods, not a concrete index class's private storage. Deriving the
 * method and label types keeps their definition with AgentFootprint whether
 * its index comes from FootPrint (9.x) or Foottrace (10.x).
 */
export type BoundaryQueries = Readonly<Pick<
  BoundaryRecorder['boundaryIndex'],
  'enclosing' | 'overlapping'
>>;
