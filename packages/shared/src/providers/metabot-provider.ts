import { getAgentPrompt } from '../agent-prompts/index.js';
import type { AIProvider } from '../ai-provider.js';
import type { TalentConfig } from '../config.js';
import type { AgentRequest, AgentResult } from '../openclaw.js';

/**
 * AIProvider that delegates to MetaBot's HTTP API (`POST /api/tasks`).
 * MetaBot spawns a separate Claude Code session to handle each agent call,
 * so this works even when running inside an active Claude Code session.
 *
 * Requires MetaBot to be running locally (or at a configured URL).
 */
export class MetaBotProvider implements AIProvider {
  readonly name = 'metabot';
  private url: string;
  private secret: string;
  private botName: string;
  private timeout: number;

  constructor(config: TalentConfig) {
    const mb = config.ai?.metabot;
    this.url = mb?.url ?? process.env['METABOT_URL'] ?? 'http://localhost:9100';
    this.secret = mb?.secret ?? process.env['API_SECRET'] ?? '';
    this.botName = mb?.bot_name ?? "Max's CC";
    this.timeout = mb?.timeout ?? 180_000; // 3 minutes default
  }

  async callAgent(agentKey: string, request: AgentRequest): Promise<AgentResult> {
    const systemPrompt = getAgentPrompt(agentKey);

    const prompt = [
      systemPrompt,
      '',
      'Request:',
      JSON.stringify(request),
      '',
      'Respond with ONLY valid JSON matching the output format above.',
    ].join('\n');

    // Use a unique chatId per call to avoid "Chat is busy" conflicts
    const chatId = `talent-eval-${agentKey}-${Date.now()}`;

    const body = JSON.stringify({
      botName: this.botName,
      chatId,
      prompt,
      sendCards: false,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.url}/api/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.secret ? { Authorization: `Bearer ${this.secret}` } : {}),
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`MetaBot API error (${response.status}): ${text}`);
      }

      const result = (await response.json()) as {
        success: boolean;
        responseText: string;
        error?: string;
      };

      if (!result.success) {
        throw new Error(`MetaBot task failed: ${result.error ?? 'unknown error'}`);
      }

      // responseText is Claude's raw output — may contain markdown fences
      const cleaned = result.responseText
        .replace(/^```(?:json)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim();

      return JSON.parse(cleaned) as AgentResult;
    } finally {
      clearTimeout(timer);
    }
  }
}
