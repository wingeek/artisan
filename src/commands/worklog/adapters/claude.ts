import Anthropic from "@anthropic-ai/sdk";
import type { GroupedCommits } from "../types.ts";
import { getDefaultTemplate } from "../templates/default.ts";

export interface ClaudeAdapterOptions {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

export interface GenerateWorklogOptions {
  commits: GroupedCommits[];
  template?: string;
  customInstructions?: string;
}

export class ClaudeAdapter {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(options: ClaudeAdapterOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    this.client = new Anthropic({ apiKey });
    this.model = options.model ?? "claude-3-7-sonnet-20250219";
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async generateWorklog(options: GenerateWorklogOptions): Promise<string> {
    const template = options.template ?? getDefaultTemplate();
    const systemPrompt = this.buildSystemPrompt(template, options.customInstructions);
    const userContent = this.buildUserContent(options.commits);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      });

      const block = response.content.find((block) => block.type === "text");
      if (!block) {
        throw new Error("No text content in Claude response");
      }

      return block.text;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Claude API error: ${error.message}`);
      }
      throw error;
    }
  }

  private buildSystemPrompt(template: string, customInstructions?: string): string {
    let prompt = template;
    if (customInstructions) {
      prompt += `\n\nAdditional instructions:\n${customInstructions}`;
    }
    return prompt;
  }

  private buildUserContent(commits: GroupedCommits[]): string {
    const lines: string[] = ["Here are the commits to summarize:\n"];

    for (const { repo, submodule, commits: repoCommits } of commits) {
      const name = submodule ? `${repo}/${submodule}` : repo;
      lines.push(`## ${name}`);
      for (const commit of repoCommits) {
        lines.push(`- [${commit.hash.slice(0, 7)}] ${commit.message}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}
