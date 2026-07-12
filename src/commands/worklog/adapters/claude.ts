import Anthropic from "@anthropic-ai/sdk";
import type { CommitEntry, GroupedCommits } from "../types.ts";
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
      throw new Error(
        "ANTHROPIC_API_KEY is required for AI worklog generation.\n" +
          "Set it via: export ANTHROPIC_API_KEY=your-api-key\n" +
          "To use a Claude-compatible endpoint (e.g. GLM, DeepSeek), also set:\n" +
          "  export ANTHROPIC_BASE_URL=https://your-compat-endpoint\n" +
          "  export ANTHROPIC_MODEL=your-model-name",
      );
    }

    this.client = new Anthropic({ apiKey });
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
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
    return buildUserContentWithDiff(commits);
  }
}

/**
 * Render grouped commits into the user message sent to the LLM.
 * Pure function — exported for unit testing.
 */
export function buildUserContentWithDiff(commits: GroupedCommits[]): string {
  const lines: string[] = ["Here are the commits to summarize:\n"];

  for (const { repo, submodule, commits: repoCommits } of commits) {
    const name = submodule ? `${repo}/${submodule}` : repo;
    lines.push(`## ${name}`);
    for (const commit of repoCommits) {
      lines.push(`### [${commit.hash.slice(0, 7)}] ${commit.message}`);

      if (commit.files && commit.files.length > 0) {
        for (const file of commit.files) {
          const added = file.added > 0 ? ` +${file.added}` : "";
          const deleted = file.deleted > 0 ? ` -${file.deleted}` : "";
          lines.push(`- ${file.path}${added}${deleted}`);
        }
      }

      if (commit.diff) {
        lines.push("```diff");
        lines.push(commit.diff);
        lines.push("```");
      } else if (commit.diffTruncated) {
        lines.push("(diff truncated, see file stats above)");
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}
