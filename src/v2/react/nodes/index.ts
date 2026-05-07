/**
 * Dumb React Flow node components for the Lens triangle.
 *
 * Each component is independently testable — accepts NodeProps with
 * a strictly-typed `data` field, renders one visual role:
 *
 *   - `UserNode`        — the human actor (outside every Agent)
 *   - `LLMNode`         — the LLM stage with 3-slot highlight
 *   - `ToolNode`        — external tool execution
 *   - `ContextBinNode`  — floating injection-chip bin next to LLM
 *   - `AgentGroupNode`  — dashed container wrapping LLM + Tool + ContextBin
 *
 * No derivation, no selector calls, no prop drilling of graph data.
 * The parent (`RunTreeFlow`) produces `data` from the ViewModel.
 */

export {
  UserNode,
  USER_NODE_WIDTH,
  type UserNodeData,
} from './UserNode.js';
export {
  ToolNode,
  TOOL_NODE_WIDTH,
  type ToolNodeData,
} from './ToolNode.js';
export {
  LLMNode,
  LLM_NODE_WIDTH,
  type LLMNodeData,
  type LLMSlot,
} from './LLMNode.js';
export {
  ContextBinNode,
  CONTEXT_BIN_WIDTH,
  type ContextBinNodeData,
} from './ContextBinNode.js';
export {
  AgentGroupNode,
  AGENT_GROUP_HEIGHT,
  AGENT_GROUP_PADDING,
  AGENT_GROUP_WIDTH,
  type AgentGroupNodeData,
} from './AgentGroupNode.js';
export {
  AgentCardNode,
  AGENT_CARD_HEIGHT,
  AGENT_CARD_WIDTH,
  type AgentCardNodeData,
} from './AgentCardNode.js';
