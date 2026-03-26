import { execa } from 'execa';

import type { AIProvider } from '../ai-provider.js';
import type { AgentRequest, AgentResult } from '../openclaw.js';

export interface MetaBotConfig {
  bot_name: string;
  chat_id: string;
}

/** AI Provider that delegates agent calls to a MetaBot bot via `mb task`. */
export class MetaBotProvider implements AIProvider {
  readonly name = 'metabot';

  constructor(private config: MetaBotConfig) {}

  async callAgent(agentKey: string, request: AgentRequest): Promise<AgentResult> {
    const prompt = `Run talent-scout ${agentKey} task. Respond ONLY with the JSON result, no explanation.\n\n${JSON.stringify(request)}`;

    const { stdout } = await execa('mb', [
      'task',
      this.config.bot_name,
      this.config.chat_id,
      prompt,
    ]);

    // Extract JSON from response (mb task may include non-JSON preamble)
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`MetaBot agent "${agentKey}" returned no JSON:\n${stdout}`);
    }

    return JSON.parse(jsonMatch[0]) as AgentResult;
  }
}
