import type { DateRange } from "../types.ts";
import { loadCommits, groupByRepo } from "./collector.ts";
import { ClaudeAdapter, type GenerateWorklogOptions } from "../adapters/claude.ts";
import { formatWorklog } from "../outputs/local.ts";

export interface EngineOptions {
  dateRange: DateRange;
  repoFilter?: string;
  useAi?: boolean;
  aiApiKey?: string;
  aiModel?: string;
  outputFormat: "text" | "md" | "json";
  customInstructions?: string;
}

export class WorklogEngine {
  private dateRange: DateRange;
  private repoFilter?: string;
  private useAi: boolean;
  private aiApiKey?: string;
  private aiModel?: string;
  private outputFormat: "text" | "md" | "json";
  private customInstructions?: string;

  constructor(options: EngineOptions) {
    this.dateRange = options.dateRange;
    this.repoFilter = options.repoFilter;
    this.useAi = options.useAi ?? false;
    this.aiApiKey = options.aiApiKey;
    this.aiModel = options.aiModel;
    this.outputFormat = options.outputFormat;
    this.customInstructions = options.customInstructions;
  }

  async generate(): Promise<string> {
    const commits = await loadCommits(this.dateRange, this.repoFilter);

    if (commits.length === 0) {
      return "No commits found for the specified date range.";
    }

    const grouped = groupByRepo(commits);

    if (this.useAi) {
      return this.generateWithAi(grouped);
    }

    return formatWorklog(grouped, this.outputFormat);
  }

  private async generateWithAi(grouped: ReturnType<typeof groupByRepo>): Promise<string> {
    try {
      const adapter = new ClaudeAdapter({
        apiKey: this.aiApiKey,
        model: this.aiModel,
      });

      const options: GenerateWorklogOptions = {
        commits: grouped,
        customInstructions: this.customInstructions,
      };

      return await adapter.generateWorklog(options);
    } catch (error) {
      if (error instanceof Error) {
        console.warn(`AI generation failed: ${error.message}. Falling back to standard formatting.`);
      }
      return formatWorklog(grouped, this.outputFormat);
    }
  }
}
