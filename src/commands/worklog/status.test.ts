import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { CommitEntry } from "./types.ts";

const WORKLOG_DIR = join(homedir(), ".artisan", "worklog");
const COMMITS_FILE = join(WORKLOG_DIR, "commits.jsonl");

function createCommit(
  repo: string,
  message: string,
  date: string,
  submodule?: string,
): CommitEntry {
  const hash = `abc${repo.slice(0, 3)}${message.slice(0, 2)}${Math.random().toString(36).slice(2, 5)}`;
  return {
    timestamp: date,
    repo,
    submodule: submodule ?? "",
    message,
    hash,
  };
}

async function writeTestCommits(commits: CommitEntry[]): Promise<void> {
  const lines = commits.map((c) => JSON.stringify(c)).join("\n");
  await writeFile(COMMITS_FILE, lines);
}

async function cleanup(): Promise<void> {
  try {
    await rm(COMMITS_FILE);
  } catch {
  }
}

describe("status command", () => {
  beforeEach(async () => {
    await cleanup();
    await mkdir(WORKLOG_DIR, { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("should display today's commits by default", async () => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayStr = today.toISOString();

    const commits = [
      createCommit("cli", "First commit", todayStr),
      createCommit("docs", "Add docs", todayStr),
    ];
    await writeTestCommits(commits);

    const { loadCommits, parseDateRange, groupByRepo } = await import("./core/collector.ts");

    const dateRange = parseDateRange({});
    const loaded = await loadCommits(dateRange);

    expect(loaded).toHaveLength(2);
  });

  it("should filter by date with --date option", async () => {
    const { loadCommits, parseDateRange } = await import("./core/collector.ts");

    const commits = [
      createCommit("myrepo", "Today", "2024-03-15T10:00:00Z"),
      createCommit("myrepo", "Yesterday", "2024-03-14T10:00:00Z"),
    ];
    await writeTestCommits(commits);

    const dateRange = parseDateRange({ date: "2024-03-15" });
    const result = await loadCommits(dateRange);

    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("Today");
  });

  it("should filter by repo with --repo option", async () => {
    const { loadCommits, parseDateRange } = await import("./core/collector.ts");

    const commits = [
      createCommit("repo-a", "Commit A", "2024-03-15T10:00:00Z"),
      createCommit("repo-b", "Commit B", "2024-03-15T11:00:00Z"),
    ];
    await writeTestCommits(commits);

    const start = new Date("2024-03-15T00:00:00Z");
    const end = new Date("2024-03-16T00:00:00Z");
    const result = await loadCommits({ start, end }, "repo-a");

    expect(result).toHaveLength(1);
    expect(result[0].repo).toBe("repo-a");
  });

  it("should display no commits message when empty", async () => {
    const { loadCommits, parseDateRange } = await import("./core/collector.ts");

    const dateRange = parseDateRange({});
    const result = await loadCommits(dateRange);

    expect(result).toHaveLength(0);
  });

  it("should group commits by repo", async () => {
    const { groupByRepo } = await import("./core/collector.ts");

    const commits: CommitEntry[] = [
      createCommit("cli", "Commit 1", "2024-03-15T10:00:00Z"),
      createCommit("cli", "Commit 2", "2024-03-15T11:00:00Z"),
      createCommit("docs", "Docs commit", "2024-03-15T12:00:00Z"),
    ];

    const grouped = groupByRepo(commits);

    expect(grouped).toHaveLength(2);
    expect(grouped[0].repo).toBe("cli");
    expect(grouped[0].commits).toHaveLength(2);
    expect(grouped[1].repo).toBe("docs");
    expect(grouped[1].commits).toHaveLength(1);
  });

  it("should handle date ranges with --since and --until", async () => {
    const { loadCommits, parseDateRange } = await import("./core/collector.ts");

    const commits = [
      createCommit("myrepo", "Before", "2024-03-10T10:00:00Z"),
      createCommit("myrepo", "During 1", "2024-03-15T10:00:00Z"),
      createCommit("myrepo", "During 2", "2024-03-20T10:00:00Z"),
      createCommit("myrepo", "After", "2024-03-25T10:00:00Z"),
    ];
    await writeTestCommits(commits);

    const dateRange = parseDateRange({ since: "2024-03-15", until: "2024-03-20" });
    const result = await loadCommits(dateRange);

    expect(result).toHaveLength(2);
  });
});
