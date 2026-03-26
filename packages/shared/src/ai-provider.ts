import type { AgentRequest, AgentResult } from './openclaw.js';

export type { AgentRequest, AgentResult } from './openclaw.js';

/** Abstract AI provider for agent-based tasks (identity inference / deep evaluation). */
export interface AIProvider {
  /** Call an AI agent to complete a task. */
  callAgent(agentKey: string, request: AgentRequest): Promise<AgentResult>;
  /** Provider name for logging and checkpoint markers. */
  readonly name: string;
}
