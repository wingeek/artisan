import { Command } from "@jsr/cliffy__command";
import { WorklogEngine } from "./core/engine.ts";
import { parseDateRange } from "./core/collector.ts";
import type { OutputFormat } from "./types.ts";

export const generateCommand = new Command()
  .description("Generate today's work log from collected commits.")
  .option("--date <date:string>", "Filter by specific date (YYYY-MM-DD)")
  .option("--since <date:string>", "Start date range (YYYY-MM-DD)")
  .option("--until <date:string>", "End date range (YYYY-MM-DD)")
  .option("--format <format:string>", "Output format (text, md, json)", { default: "text" })
  .option("--repo <name:string>", "Filter by repository name")
  .option("--ai", "Enable AI-powered work log generation using Claude")
  .option("--ai-model <model:string>", "Claude model to use (default: claude-3-7-sonnet-20250219)")
  .option("--instructions <text:string>", "Additional instructions for AI generation")
  .action(async (options) => {
    const format = parseFormat(options.format);
    const dateRange = parseDateRange(options);
    const repoFilter = options.repo;

    const engine = new WorklogEngine({
      dateRange,
      repoFilter,
      useAi: options.ai,
      aiModel: options.aiModel,
      outputFormat: format,
      customInstructions: options.instructions,
    });

    const output = await engine.generate();
    console.log(output);
  });

export function parseFormat(format: string): OutputFormat {
  if (format === "json" || format === "md" || format === "text") {
    return format;
  }
  console.warn(`Invalid format "${format}", using "text"`);
  return "text";
}
