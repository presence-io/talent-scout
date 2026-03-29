import { execa } from 'execa';

import { getAgentPrompt } from '../agent-prompts/index.js';
import type { AIProvider } from '../ai-provider.js';
import type { TalentConfig } from '../config.js';
import type { AgentRequest, AgentResult } from '../openclaw.js';

/**
 * AIProvider that delegates to the Claude Code CLI (`claude -p`).
 * Uses non-interactive print mode with JSON output.
 * No SDK dependency — calls the locally installed `claude` binary.
 */
export class ClaudeCliProvider implements AIProvider {
  readonly name = 'claude';
  private model: string;
  private maxTurns: number;

  constructor(config: TalentConfig) {
    this.model = config.ai?.claude?.model ?? 'sonnet';
    this.maxTurns = config.ai?.claude?.max_turns ?? 1;
  }

  async callAgent(agentKey: string, request: AgentRequest): Promise<AgentResult> {
    const systemPrompt = getAgentPrompt(agentKey);

    const userMessage = [
      systemPrompt,
      '',
      'Request:',
      JSON.stringify(request),
      '',
      'Respond with ONLY valid JSON matching the output format above.',
    ].join('\n');

    const args = [
      '-p', userMessage,
      '--output-format', 'text',
      '--model', this.model,
      '--max-turns', String(this.maxTurns),
    ];

    const { stdout } = await execa('claude', args, {
      timeout: 180_000, // 3 minutes per batch
    });

    // Claude may wrap JSON in markdown fences — strip them
    const cleaned = stdout
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    return JSON.parse(cleaned) as AgentResult;
  }
}
