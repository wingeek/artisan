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
  .option("--publish", "Import generated worklog into publish store")
  .option("--tags <tags:string>", "Tags for publish import (comma-separated, use with --publish)")
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

    if (options.publish) {
      await importToPublish(output, dateRange, options.tags);
    } else {
      console.log(output);
    }
  });

async function importToPublish(output: string, dateRange: { start: Date; end: Date }, tagsStr?: string): Promise<void> {
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
      source: "worklog_generate",
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

export function parseFormat(format: string): OutputFormat {
  if (format === "json" || format === "md" || format === "text") {
    return format;
  }
  console.warn(`Invalid format "${format}", using "text"`);
  return "text";
}

export function parseDateRange(options: { date?: string; since?: string; until?: string }): DateRange {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  if (options.date) {
    const date = parseDate(options.date);
    return { start: date, end: new Date(date.getTime() + 86400000) };
  }

  const start = options.since ? parseDate(options.since) : today;
  const end = options.until ? new Date(parseDate(options.until).getTime() + 86400000) : new Date(today.getTime() + 86400000);

  return { start, end };
}

export function parseDate(dateStr: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date format: ${dateStr}. Use YYYY-MM-DD.`);
  }
  const [, year, month, day] = match;
  return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
}

export async function loadCommits(dateRange: DateRange, repoFilter?: string): Promise<CommitEntry[]> {
  const hasFile = await exists(COMMITS_FILE);
  if (!hasFile) {
    return [];
  }

  const file = Bun.file(COMMITS_FILE);
  const content = await file.text();
  const lines = content.split("\n").filter(Boolean);

  const commits: CommitEntry[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as CommitEntry;
      const timestamp = new Date(entry.timestamp);

      if (isNaN(timestamp.getTime())) {
        console.warn(`Skipping invalid timestamp: ${entry.timestamp}`);
        continue;
      }

      if (timestamp < dateRange.start || timestamp >= dateRange.end) {
        continue;
      }

      if (repoFilter && entry.repo !== repoFilter) {
        continue;
      }

      commits.push(entry);
    } catch (e) {
      console.warn(`Skipping malformed line: ${line.slice(0, 50)}...`);
    }
  }

  return commits.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function groupByRepo(commits: CommitEntry[]): GroupedCommits[] {
  const map = new Map<string, CommitEntry[]>();

  for (const commit of commits) {
    const key = commit.submodule ? `${commit.repo}/${commit.submodule}` : commit.repo;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(commit);
  }

  return Array.from(map.entries()).map(([key, commits]) => {
    const parts = key.split("/");
    const repo = parts[0] ?? "";
    const submodule = parts[1] ?? null;
    return { repo, submodule, commits };
  }).sort((a, b) => a.repo.localeCompare(b.repo));
}

export function formatWorklog(grouped: GroupedCommits[], format: OutputFormat): string {
  switch (format) {
    case "json":
      return formatJson(grouped);
    case "md":
      return formatMarkdown(grouped);
    case "text":
    default:
      return formatText(grouped);
  }
}

function formatText(grouped: GroupedCommits[]): string {
  const lines: string[] = [];

  for (const { repo, submodule, commits } of grouped) {
    const name = submodule ? `${repo}/${submodule}` : repo;
    lines.push(`${name} (${commits.length} commit${commits.length === 1 ? "" : "s"})`);

    for (const commit of commits) {
      const indent = submodule ? "    " : "";
      lines.push(`${indent}• ${commit.hash.slice(0, 7)} ${commit.message}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatMarkdown(grouped: GroupedCommits[]): string {
  const lines: string[] = ["## Work Log", "", ""];

  for (const { repo, submodule, commits } of grouped) {
    const name = submodule ? `${repo}/${submodule}` : repo;
    lines.push(`### ${name} (${commits.length})`);
    lines.push("");
    lines.push("| Hash | Message |");
    lines.push("|------|----------|");

    for (const commit of commits) {
      lines.push(`| \`${commit.hash.slice(0, 7)}\` | ${commit.message} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatJson(grouped: GroupedCommits[]): string {
  return JSON.stringify(grouped, null, 2);
}
