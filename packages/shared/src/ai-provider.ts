import type { TalentConfig } from './config.js';
import type { AgentRequest, AgentResult } from './openclaw.js';

/**
 * Abstract AI provider for agent-style tasks (identity inference, deep evaluation).
 * Implementations wrap different backends: OpenClaw CLI, Claude Code CLI, etc.
 */
export interface AIProvider {
  /** Call an AI agent by key (e.g. 'identity', 'evaluator'). */
  callAgent(agentKey: string, request: AgentRequest): Promise<AgentResult>;
  /** Provider name for logging and checkpoint tagging. */
  readonly name: string;
}

/**
 * Create an AIProvider based on config.
 * Falls back to 'openclaw' when `ai.provider` is not set.
 */
export async function createAIProvider(config: TalentConfig): Promise<AIProvider> {
  const providerName = config.ai?.provider ?? 'openclaw';

  switch (providerName) {
    case 'metabot': {
      const { MetaBotProvider } = await import('./providers/metabot-provider.js');
      return new MetaBotProvider(config);
    }
    case 'claude': {
      const { ClaudeCliProvider } = await import('./providers/claude-cli-provider.js');
      return new ClaudeCliProvider(config);
    }
    case 'openclaw': {
      const { OpenClawProvider } = await import('./providers/openclaw-provider.js');
      return new OpenClawProvider(config);
    }
    default:
      throw new Error(`Unknown AI provider: "${providerName}". Use "metabot", "claude", or "openclaw".`);
  }
}
