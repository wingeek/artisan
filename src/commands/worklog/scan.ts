import { Command } from "@jsr/cliffy__command";
import { exists } from "node:fs/promises";
import { join, resolve } from "node:path";
import { scanRepo } from "./core/git-scanner.ts";
import { listSubmodules } from "./init.ts";
import { WorklogEngine } from "./core/engine.ts";
import { parseFormat, parseDateRange } from "./generate.ts";
import type { CommitEntry, OutputFormat } from "./types.ts";

export const scanCommand = new Command()
  .description("Scan git repository directly for work log generation.")
  .arguments("[path:string]")
  .option("--path <dir:string>", "Target repository path (alternative to positional arg)")
  .option("--date <date:string>", "Filter by specific date (YYYY-MM-DD)")
  .option("--since <date:string>", "Start date range (YYYY-MM-DD)")
  .option("--until <date:string>", "End date range (YYYY-MM-DD)")
  .option("--with-submodules", "Also scan all submodules")
  .option("--no-diff", "Skip diff collection, only commit messages")
  .option("--format <format:string>", "Output format (text, md, json)", { default: "text" })
  .option("--ai", "Enable AI-powered work log generation using Claude")
  .option("--ai-model <model:string>", "Model to use (overrides ANTHROPIC_MODEL env; default: claude-sonnet-4-6)")
  .option("--instructions <text:string>", "Additional instructions for AI generation")
  .option("--publish", "Import generated worklog into publish store")
  .option("--tags <tags:string>", "Tags for publish import (comma-separated, use with --publish)")
  .action(async (options, pathArg?: string) => {
    const scanPath = resolveScanPath(options, pathArg);
    await validatePath(scanPath);

    const format = parseFormat(options.format);
    const dateRange = parseDateRange(options);
    const includeDiff = !options.noDiff;
    const withSubmodules = options.withSubmodules ?? false;

    let allCommits: CommitEntry[] = [];

    try {
      const mainCommits = await scanRepo({
        path: scanPath,
        dateRange,
        includeDiff,
      });
      allCommits.push(...mainCommits);

      if (withSubmodules) {
        const submodules = await listSubmodules(scanPath);
        for (const sub of submodules) {
          const subPath = join(scanPath, sub);
          const subCommits = await scanRepo({
            path: subPath,
            dateRange,
            includeDiff,
            submodule: sub,
          });
          allCommits.push(...subCommits);
        }
      }

      if (allCommits.length === 0) {
        console.log("No commits found for the specified date range.");
        return;
      }

      allCommits.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      let instructions = options.instructions;
      if (includeDiff && allCommits.some((c) => c.diffTruncated)) {
        const fallbackNote =
          "部分大改动仅以文件统计形式提供,如需更细致总结请缩小日期范围或单独扫描。";
        instructions = instructions ? `${instructions}\n\n${fallbackNote}` : fallbackNote;
      }

      const output = await WorklogEngine.processCommits({
        commits: allCommits,
        useAi: options.ai,
        aiModel: options.aiModel,
        outputFormat: format,
        customInstructions: instructions,
      });

      if (options.publish) {
        await importToPublish(output, dateRange, options.tags);
      } else {
        console.log(output);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`✗ ${error.message}`);
        process.exit(1);
      }
      throw error;
    }
  });

function resolveScanPath(options: { path?: string }, pathArg?: string): string {
  if (pathArg && options.path && pathArg !== options.path) {
    console.error("✗ provide either [path] or --path, not both");
    process.exit(2);
  }

  const target = pathArg ?? options.path ?? process.cwd();
  return resolve(target);
}

async function validatePath(path: string): Promise<void> {
  const hasPath = await exists(path);
  if (!hasPath) {
    console.error(`✗ path not found: ${path}`);
    process.exit(1);
  }
}

async function importToPublish(
  output: string,
  dateRange: { start: Date; end: Date },
  tagsStr?: string
): Promise<void> {
  const { PublishStore } = await import("../publish/core/store.ts");
  const { getDbPath } = await import("../publish/utils.ts");

  const dateStr = dateRange.start.toISOString().slice(0, 10);
  const title = `Work Log ${dateStr}`;
  const tags = tagsStr ? tagsStr.split(",").map((t: string) => t.trim()) : ["worklog"];

  const store = new PublishStore(getDbPath());
  try {
    const doc = store.insertDocument({
      id: crypto.randomUUID(),
      title,
      content: output,
      source: "worklog_scan",
      tags: JSON.stringify(tags),
    });
    console.log(`✓ worklog published: ${doc.id}`);
    console.log(`  title: ${doc.title}`);
    console.log(`  tags: ${tags.join(", ")}`);
    console.log(`\nNext: artisan publish adapt ${doc.id.slice(0, 8)} --channel <channel>`);
  } finally {
    store.close();
  }
}
