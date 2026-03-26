import { execa } from 'execa';

import type { AIProvider } from '../ai-provider.js';
import type { AgentRequest, AgentResult } from '../openclaw.js';
import type { TalentConfig } from '../config.js';

/** AI Provider backed by the OpenClaw CLI agent system. */
export class OpenClawProvider implements AIProvider {
  readonly name = 'openclaw';

  constructor(private config: TalentConfig) {}

  async callAgent(agentKey: string, request: AgentRequest): Promise<AgentResult> {
    const agentConfig = this.config.openclaw.agents[agentKey];
    if (!agentConfig) {
      throw new Error(`Unknown agent key: "${agentKey}". Check openclaw.agents in talents.yaml.`);
    }

    const args = ['agent', '--message', JSON.stringify(request), '--json'];
    if (agentConfig.name) {
      args.push('--agent-name', agentConfig.name);
    }
    if (agentConfig.workspace) {
      args.push('--workspace', agentConfig.workspace);
    }

    const { stdout } = await execa('openclaw', args, {
      timeout: agentConfig.timeout * 1000,
    });

    return JSON.parse(stdout) as AgentResult;
  }
}
