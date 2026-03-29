import { EVALUATOR_PROMPT } from './evaluator-prompt.js';
import { IDENTITY_PROMPT } from './identity-prompt.js';

export { IDENTITY_PROMPT, EVALUATOR_PROMPT };

const PROMPTS: Record<string, string> = {
  identity: IDENTITY_PROMPT,
  evaluator: EVALUATOR_PROMPT,
};

/** Get the system prompt for a given agent key. */
export function getAgentPrompt(agentKey: string): string {
  const prompt = PROMPTS[agentKey];
  if (!prompt) {
    throw new Error(`No prompt defined for agent key: "${agentKey}"`);
  }
  return prompt;
}
