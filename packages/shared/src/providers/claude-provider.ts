import { execa } from 'execa';

import type { AIProvider } from '../ai-provider.js';
import type { AgentRequest, AgentResult } from '../openclaw.js';

export interface ClaudeConfig {
  model: string;
  max_tokens: number;
}

/** Agent system prompts keyed by agent role. */
const AGENT_PROMPTS: Record<string, string> = {
  identity: `You are a talent identity inference agent. Given a batch of GitHub user profiles and their signals, determine whether each user is likely a Chinese developer.

For each candidate, analyze:
- Location field (city names, country indicators)
- Bio and README content (Chinese characters, Chinese platforms)
- Email domain (.cn, qq.com, 163.com, etc.)
- Company affiliations (known Chinese tech companies)
- Repository names and descriptions (Chinese content)
- Community involvement (Chinese open-source projects)

Respond with a JSON object: { "results": [{ "username": string, "is_chinese": boolean, "confidence": number (0-1), "evidence": string, "city": string | null }] }`,

  evaluator: `You are a talent deep evaluation agent. Given a batch of top candidates with their GitHub profiles, signals, feature scores, and rule-based evaluations, write a concise human-readable summary for each.

Each summary should:
- Highlight the candidate's key strengths and AI coding depth
- Note their reachability and engagement signals
- Be 2-3 sentences, professional tone
- Focus on what makes them a good outreach candidate

Respond with a JSON object: { "results": [{ "username": string, "summary": string }] }`,
};

/**
 * AI Provider backed by the Anthropic Claude API.
 *
 * Uses the `claude` CLI for inference to avoid a hard dependency on `@anthropic-ai/sdk`.
 * Falls back to the SDK if the CLI is not available and the package is installed.
 */
export class ClaudeProvider implements AIProvider {
  readonly name = 'claude';
  private config: ClaudeConfig;

  constructor(config: ClaudeConfig) {
    this.config = config;
  }

  async callAgent(agentKey: string, request: AgentRequest): Promise<AgentResult> {
    const systemPrompt = AGENT_PROMPTS[agentKey];
    if (!systemPrompt) {
      throw new Error(
        `No prompt defined for agent key: "${agentKey}". Available: ${Object.keys(AGENT_PROMPTS).join(', ')}`
      );
    }

    // Try loading @anthropic-ai/sdk if available
    try {
      const sdk = await import('@anthropic-ai/sdk' as string);
      const Anthropic = sdk.default ?? sdk.Anthropic;
      const client = new Anthropic();

      const response = await client.messages.create({
        model: this.config.model,
        max_tokens: this.config.max_tokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: JSON.stringify(request) }],
      });

      const content = (response as { content: { type: string; text: string }[] }).content;
      const text = content[0];
      if (!text || text.type !== 'text') {
        throw new Error(`Unexpected response: ${JSON.stringify(content)}`);
      }

      return JSON.parse(text.text) as AgentResult;
    } catch (e: unknown) {
      // If SDK not installed, fall back to claude CLI
      if (e instanceof Error && e.message.includes('Cannot find')) {
        return this.callViaCLI(systemPrompt, request);
      }
      throw e;
    }
  }

  private async callViaCLI(systemPrompt: string, request: AgentRequest): Promise<AgentResult> {
    const userMessage = JSON.stringify(request);
    const { stdout } = await execa('claude', [
      '--model', this.config.model,
      '--max-tokens', String(this.config.max_tokens),
      '--output-format', 'json',
      '-p', `${systemPrompt}\n\n${userMessage}`,
    ]);

    // Extract JSON from output
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Claude CLI returned no JSON:\n${stdout}`);
    }
    return JSON.parse(jsonMatch[0]) as AgentResult;
  }
}
