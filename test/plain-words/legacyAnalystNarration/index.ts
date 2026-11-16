import type { Humanizer } from '../../../src/core/humanizer.js';

// ONLY flat-dynamic-tools' historical layout inputs; never a default policy.
const CAPTIONS: Readonly<Record<string, string | null>> = Object.freeze({
  'agentfootprint.agent.run_configured|run-configured#0': '[agentfootprint.agent.run_configured]',
  'agentfootprint.agent.turn_start|seed#0': 'User asked Chatbot: "go".',
  'agentfootprint.context.evaluated|sf-injection-engine/evaluate#3': null,
  'agentfootprint.context.injected|sf-system-prompt/compose#8': null,
  'agentfootprint.context.slot_composed|sf-system-prompt/compose#8': null,
  'agentfootprint.context.injected|sf-messages/compose#10': null,
  'agentfootprint.context.slot_composed|sf-messages/compose#10': null,
  'agentfootprint.context.injected|sf-tools/compose#13': null,
  'agentfootprint.context.slot_composed|sf-tools/compose#13': null,
  'agentfootprint.agent.iteration_start|call-llm#18': null,
  'agentfootprint.stream.llm_start|call-llm#18': 'Chatbot sent the question to the LLM.',
  'agentfootprint.stream.llm_end|call-llm#18': 'The LLM said it needs to use a tool. Chatbot will do that next.',
  'agentfootprint.agent.route_decided|sf-route#21': null,
  'agentfootprint.stream.tool_start|tool-calls#22': 'Chatbot called the `alpha_tool` tool — registered as "the alpha_tool tool". The LLM asked for it, and Chatbot figured out the inputs from the conversation.',
  'agentfootprint.stream.tool_end|tool-calls#22': 'The tool returned its result. Chatbot will share it with the LLM next.',
  'agentfootprint.agent.iteration_end|tool-calls#22': null,
  'agentfootprint.context.evaluated|sf-injection-engine/evaluate#25': null,
  'agentfootprint.context.injected|sf-system-prompt/compose#30': null,
  'agentfootprint.context.slot_composed|sf-system-prompt/compose#30': null,
  'agentfootprint.context.injected|sf-messages/compose#32': null,
  'agentfootprint.context.slot_composed|sf-messages/compose#32': null,
  'agentfootprint.context.injected|sf-tools/compose#35': null,
  'agentfootprint.context.slot_composed|sf-tools/compose#35': null,
  'agentfootprint.agent.iteration_start|call-llm#40': null,
  'agentfootprint.stream.llm_start|call-llm#40': "Chatbot sent the tool's result to the LLM for reasoning.",
  'agentfootprint.stream.token|call-llm#40': null,
  'agentfootprint.stream.llm_end|call-llm#40': 'The LLM gave the final answer. Chatbot returned it to the user.',
  'agentfootprint.agent.route_decided|sf-route#43': null,
  'agentfootprint.agent.iteration_end|final/prepare-final#45': null,
  'agentfootprint.agent.turn_end|final/prepare-final#45': null,
  'agentfootprint.integrity.disposition|integrity-disposition#0': '[agentfootprint.integrity.disposition]',
});

export const legacyAnalystNarration: Humanizer = (event) => {
  const identity = `${event.type}|${event.meta.runtimeStageId}`;
  if (!Object.prototype.hasOwnProperty.call(CAPTIONS, identity))
    throw new Error('Unexpected event in the historical analyst layout fixture');
  return CAPTIONS[identity]!;
};
