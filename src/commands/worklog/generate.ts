import { Command } from "@jsr/cliffy__command";
import { exists } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CommitEntry, DateRange, GroupedCommits, OutputFormat } from "./types.ts";

const WORKLOG_DIR = join(homedir(), ".artisan", "worklog");
const COMMITS_FILE = join(WORKLOG_DIR, "commits.jsonl");

export const generateCommand = new Command()
  .description("Generate today's work log from collected commits.")
  .option("--date <date:string>", "Filter by specific date (YYYY-MM-DD)")
  .option("--since <date:string>", "Start date range (YYYY-MM-DD)")
  .option("--until <date:string>", "End date range (YYYY-MM-DD)")
  .option("--format <format:string>", "Output format (text, md, json)", { default: "text" })
  .option("--repo <name:string>", "Filter by repository name")
  .action(async (options) => {
    const format = parseFormat(options.format);
    const dateRange = parseDateRange(options);
    const repoFilter = options.repo;

    const commits = await loadCommits(dateRange, repoFilter);
    if (commits.length === 0) {
      console.log("No commits found for the specified date range.");
      return;
    }

    const grouped = groupByRepo(commits);
    const output = formatWorklog(grouped, format);
    console.log(output);
  });

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
