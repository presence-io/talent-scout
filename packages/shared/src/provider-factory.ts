import type { AIProvider } from './ai-provider.js';
import type { TalentConfig } from './config.js';
import { ClaudeProvider } from './providers/claude-provider.js';
import { MetaBotProvider } from './providers/metabot-provider.js';
import { OpenClawProvider } from './providers/openclaw-provider.js';

/** Create an AIProvider instance based on the `ai.provider` config. */
export function createAIProvider(config: TalentConfig): AIProvider {
  const providerName = config.ai?.provider ?? 'openclaw';

  switch (providerName) {
    case 'openclaw':
      return new OpenClawProvider(config);
    case 'claude':
      if (!config.ai?.claude) {
        throw new Error('ai.claude config required when provider is "claude"');
      }
      return new ClaudeProvider(config.ai.claude);
    case 'metabot':
      if (!config.ai?.metabot) {
        throw new Error('ai.metabot config required when provider is "metabot"');
      }
      return new MetaBotProvider(config.ai.metabot);
    default:
      throw new Error(`Unknown AI provider: "${providerName}". Use openclaw, claude, or metabot.`);
  }
}
