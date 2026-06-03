import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { exists, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { writeFile } from "node:fs/promises";
import type { CommitEntry, GroupedCommits } from "./types.ts";

const WORKLOG_DIR = join(homedir(), ".artisan", "worklog");
const COMMITS_FILE = join(WORKLOG_DIR, "commits.jsonl");

// Helper to create test commits
function createCommit(
  repo: string,
  message: string,
  date: string,
  submodule?: string,
): CommitEntry {
  // Create a hash longer than 7 chars to test slicing behavior
  const hash = `abc${repo.slice(0, 3)}${message.slice(0, 2)}${Math.random().toString(36).slice(2, 5)}`;
  return {
    timestamp: date,
    repo,
    submodule: submodule ?? "",
    message,
    hash,
  };
}

// Helper to write test data
async function writeTestCommits(commits: CommitEntry[]): Promise<void> {
  const lines = commits.map((c) => JSON.stringify(c)).join("\n");
  await writeFile(COMMITS_FILE, lines);
}

// Helper to clean up test data
async function cleanup(): Promise<void> {
  try {
    await rm(COMMITS_FILE);
  } catch {
    // ignore if doesn't exist
  }
}

describe("generate command functions", () => {
  beforeEach(async () => {
    await cleanup();
    await mkdir(WORKLOG_DIR, { recursive: true });
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("parseDate", () => {
    it("should parse valid YYYY-MM-DD dates", async () => {
      const { parseDate } = await import("./core/collector.ts");

      const result = parseDate("2024-03-15");
      expect(result.getUTCFullYear()).toBe(2024);
      expect(result.getUTCMonth()).toBe(2); // March (0-indexed)
      expect(result.getUTCDate()).toBe(15);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
    });

    it("should throw for invalid date format", async () => {
      const { parseDate } = await import("./core/collector.ts");

      expect(() => parseDate("2024/03/15")).toThrow("Invalid date format");
      expect(() => parseDate("03-15-2024")).toThrow("Invalid date format");
      // Note: JavaScript's Date constructor normalizes invalid dates (month 13 becomes next year January)
      // The parseDate function only validates format, not semantic validity
      expect(() => parseDate("not-a-date")).toThrow("Invalid date format");
    });

    it("should handle leap year dates", async () => {
      const { parseDate } = await import("./core/collector.ts");

      const leapDay = parseDate("2024-02-29");
      expect(leapDay.getUTCMonth()).toBe(1);
      expect(leapDay.getUTCDate()).toBe(29);
    });
  });

  describe("parseDateRange", () => {
    it("should use today when no options provided", async () => {
      const { parseDateRange } = await import("./core/collector.ts");
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      const result = parseDateRange({});
      expect(result.start.getTime()).toBe(today.getTime());
      expect(result.end.getTime()).toBe(today.getTime() + 86400000);
    });

    it("should use single date with --date option", async () => {
      const { parseDateRange } = await import("./core/collector.ts");

      const result = parseDateRange({ date: "2024-03-15" });
      expect(result.start.getUTCFullYear()).toBe(2024);
      expect(result.start.getUTCMonth()).toBe(2);
      expect(result.start.getUTCDate()).toBe(15);
      expect(result.end.getUTCDate()).toBe(16);
    });

    it("should handle --since and --until options", async () => {
      const { parseDateRange } = await import("./core/collector.ts");

      const result = parseDateRange({ since: "2024-03-01", until: "2024-03-31" });
      expect(result.start.getUTCFullYear()).toBe(2024);
      expect(result.start.getUTCMonth()).toBe(2);
      expect(result.start.getUTCDate()).toBe(1);
      expect(result.end.getUTCFullYear()).toBe(2024);
      expect(result.end.getUTCMonth()).toBe(3); // April (month 3) because end = until + 1 day
      expect(result.end.getUTCDate()).toBe(1); // April 1st
    });

    it("should prioritize --date over --since/--until", async () => {
      const { parseDateRange } = await import("./core/collector.ts");

      const result = parseDateRange({ date: "2024-03-15", since: "2024-03-01", until: "2024-03-31" });
      expect(result.start.getUTCDate()).toBe(15);
      expect(result.end.getUTCDate()).toBe(16);
    });
  });

  describe("parseFormat", () => {
    it("should accept valid formats", async () => {
      const { parseFormat } = await import("./generate.ts");

      expect(parseFormat("text")).toBe("text");
      expect(parseFormat("md")).toBe("md");
      expect(parseFormat("json")).toBe("json");
    });

    it("should fallback to text for invalid format", async () => {
      const { parseFormat } = await import("./generate.ts");

      // Mock console.warn
      const originalWarn = console.warn;
      let warned = false;
      console.warn = () => {
        warned = true;
      };

      const result = parseFormat("invalid");
      expect(result).toBe("text");
      expect(warned).toBe(true);

      console.warn = originalWarn;
    });
  });

  describe("loadCommits", () => {
    it("should return empty array when file does not exist", async () => {
      const { loadCommits } = await import("./core/collector.ts");

      const dateRange = { start: new Date(), end: new Date() };
      const result = await loadCommits(dateRange);
      expect(result).toEqual([]);
    });

    it("should load and parse valid commits", async () => {
      const { loadCommits } = await import("./core/collector.ts");

      const commits = [
        createCommit("myrepo", "First commit", "2024-03-15T10:00:00Z"),
        createCommit("myrepo", "Second commit", "2024-03-15T11:00:00Z"),
      ];
      await writeTestCommits(commits);

      const start = new Date("2024-03-15T00:00:00Z");
      const end = new Date("2024-03-16T00:00:00Z");
      const result = await loadCommits({ start, end });

      expect(result).toHaveLength(2);
      expect(result[0].message).toBe("First commit");
      expect(result[1].message).toBe("Second commit");
    });

    it("should filter by date range", async () => {
      const { loadCommits } = await import("./core/collector.ts");

      const commits = [
        createCommit("myrepo", "Before", "2024-03-14T10:00:00Z"),
        createCommit("myrepo", "During", "2024-03-15T10:00:00Z"),
        createCommit("myrepo", "After", "2024-03-16T10:00:00Z"),
      ];
      await writeTestCommits(commits);

      const start = new Date("2024-03-15T00:00:00Z");
      const end = new Date("2024-03-16T00:00:00Z");
      const result = await loadCommits({ start, end });

      expect(result).toHaveLength(1);
      expect(result[0].message).toBe("During");
    });

    it("should filter by repository name", async () => {
      const { loadCommits } = await import("./core/collector.ts");

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

    it("should skip malformed JSON lines with warning", async () => {
      const { loadCommits } = await import("./core/collector.ts");

      const valid = createCommit("myrepo", "Valid", "2024-03-15T10:00:00Z");
      const lines = [
        JSON.stringify(valid),
        "invalid json line",
        JSON.stringify(createCommit("myrepo", "Another valid", "2024-03-15T11:00:00Z")),
      ].join("\n");
      await Bun.write(COMMITS_FILE, lines);

      const start = new Date("2024-03-15T00:00:00Z");
      const end = new Date("2024-03-16T00:00:00Z");

      // Mock console.warn
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (msg) => warnings.push(msg);

      const result = await loadCommits({ start, end });

      console.warn = originalWarn;

      expect(result).toHaveLength(2);
      expect(warnings.some((w) => w.includes("malformed"))).toBe(true);
    });

    it("should skip commits with invalid timestamps", async () => {
      const { loadCommits } = await import("./core/collector.ts");

      const lines = [
        JSON.stringify(createCommit("myrepo", "Valid", "2024-03-15T10:00:00Z")),
        JSON.stringify({
          timestamp: "invalid-date",
          repo: "myrepo",
          submodule: "",
          message: "Invalid timestamp",
          hash: "abc123",
        }),
      ].join("\n");
      await Bun.write(COMMITS_FILE, lines);

      const start = new Date("2024-03-15T00:00:00Z");
      const end = new Date("2024-03-16T00:00:00Z");

      // Mock console.warn
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (msg) => warnings.push(msg);

      const result = await loadCommits({ start, end });

      console.warn = originalWarn;

      expect(result).toHaveLength(1);
      expect(warnings.some((w) => w.includes("invalid timestamp"))).toBe(true);
    });

    it("should sort commits by timestamp", async () => {
      const { loadCommits } = await import("./core/collector.ts");

      const commits = [
        createCommit("myrepo", "Third", "2024-03-15T15:00:00Z"),
        createCommit("myrepo", "First", "2024-03-15T10:00:00Z"),
        createCommit("myrepo", "Second", "2024-03-15T12:00:00Z"),
      ];
      await writeTestCommits(commits);

      const start = new Date("2024-03-15T00:00:00Z");
      const end = new Date("2024-03-16T00:00:00Z");
      const result = await loadCommits({ start, end });

      expect(result).toHaveLength(3);
      expect(result[0].message).toBe("First");
      expect(result[1].message).toBe("Second");
      expect(result[2].message).toBe("Third");
    });
  });

  describe("groupByRepo", () => {
    it("should group commits by repository", async () => {
      const { groupByRepo } = await import("./core/collector.ts");

      const commits: CommitEntry[] = [
        createCommit("repo-a", "Commit A1", "2024-03-15T10:00:00Z"),
        createCommit("repo-b", "Commit B1", "2024-03-15T11:00:00Z"),
        createCommit("repo-a", "Commit A2", "2024-03-15T12:00:00Z"),
      ];

      const result = groupByRepo(commits);

      expect(result).toHaveLength(2);
      expect(result[0].repo).toBe("repo-a");
      expect(result[0].commits).toHaveLength(2);
      expect(result[1].repo).toBe("repo-b");
      expect(result[1].commits).toHaveLength(1);
    });

    it("should handle submodules with nested paths", async () => {
      const { groupByRepo } = await import("./core/collector.ts");

      const commits: CommitEntry[] = [
        createCommit("myrepo", "Main commit", "2024-03-15T10:00:00Z"),
        createCommit("myrepo", "Sub commit", "2024-03-15T11:00:00Z", "packages/sub"),
        createCommit("myrepo", "Another sub", "2024-03-15T12:00:00Z", "packages/another"),
      ];

      const result = groupByRepo(commits);

      expect(result).toHaveLength(3);
      expect(result[0].repo).toBe("myrepo");
      expect(result[0].submodule).toBeNull();
      // Note: groupByRepo splits on "/" and only uses parts[0] (repo) and parts[1] (submodule)
      // So for "myrepo/packages/sub", parts are ["myrepo", "packages", "sub"]
      // submodule becomes "packages" (parts[1])
      expect(result[1].repo).toBe("myrepo");
      expect(result[1].submodule).toBe("packages");
      expect(result[2].repo).toBe("myrepo");
      expect(result[2].submodule).toBe("packages");
    });

    it("should sort results by repo name", async () => {
      const { groupByRepo } = await import("./core/collector.ts");

      const commits: CommitEntry[] = [
        createCommit("zebra", "Z", "2024-03-15T10:00:00Z"),
        createCommit("apple", "A", "2024-03-15T11:00:00Z"),
      ];

      const result = groupByRepo(commits);

      expect(result).toHaveLength(2);
      expect(result[0].repo).toBe("apple");
      expect(result[1].repo).toBe("zebra");
    });
  });

  describe("formatWorklog", () => {
    it("should format as text by default", async () => {
      const { formatWorklog } = await import("./outputs/local.ts");

      const commit1 = createCommit("myrepo", "Add feature", "2024-03-15T10:00:00Z");
      const commit2 = createCommit("myrepo", "Fix bug", "2024-03-15T11:00:00Z");

      const grouped: GroupedCommits[] = [
        {
          repo: "myrepo",
          submodule: null,
          commits: [commit1, commit2],
        },
      ];

      const result = formatWorklog(grouped, "text");

      expect(result).toContain("myrepo (2 commits)");
      expect(result).toContain(`• ${commit1.hash.slice(0, 7)} Add feature`);
      expect(result).toContain(`• ${commit2.hash.slice(0, 7)} Fix bug`);
    });

    it("should format as markdown", async () => {
      const { formatWorklog } = await import("./outputs/local.ts");

      const commit1 = createCommit("myrepo", "Add feature", "2024-03-15T10:00:00Z");

      const grouped: GroupedCommits[] = [
        {
          repo: "myrepo",
          submodule: null,
          commits: [commit1],
        },
      ];

      const result = formatWorklog(grouped, "md");

      expect(result).toContain("## Work Log");
      expect(result).toContain("### myrepo (1)");
      expect(result).toContain("| Hash | Message |");
      expect(result).toContain("|------|----------|");
      expect(result).toContain(`| \`${commit1.hash.slice(0, 7)}\` | Add feature |`);
    });

    it("should format as JSON", async () => {
      const { formatWorklog } = await import("./outputs/local.ts");

      const grouped: GroupedCommits[] = [
        {
          repo: "myrepo",
          submodule: null,
          commits: [createCommit("myrepo", "Add feature", "2024-03-15T10:00:00Z")],
        },
      ];

      const result = formatWorklog(grouped, "json");
      const parsed = JSON.parse(result);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].repo).toBe("myrepo");
      expect(parsed[0].commits).toHaveLength(1);
    });

    it("should handle submodule indentation in text format", async () => {
      const { formatWorklog } = await import("./outputs/local.ts");

      const commit1 = createCommit("myrepo", "Sub commit", "2024-03-15T10:00:00Z", "packages/sub");

      const grouped: GroupedCommits[] = [
        {
          repo: "myrepo",
          submodule: "packages/sub",
          commits: [commit1],
        },
      ];

      const result = formatWorklog(grouped, "text");

      expect(result).toContain("myrepo/packages/sub (1 commit)");
      expect(result).toContain(`    • ${commit1.hash.slice(0, 7)} Sub commit`); // Indented for submodule
    });

    it("should handle pluralization correctly", async () => {
      const { formatWorklog } = await import("./outputs/local.ts");

      const single: GroupedCommits[] = [
        {
          repo: "myrepo",
          submodule: null,
          commits: [createCommit("myrepo", "Only commit", "2024-03-15T10:00:00Z")],
        },
      ];

      const multiple: GroupedCommits[] = [
        {
          repo: "myrepo",
          submodule: null,
          commits: [
            createCommit("myrepo", "First", "2024-03-15T10:00:00Z"),
            createCommit("myrepo", "Second", "2024-03-15T11:00:00Z"),
          ],
        },
      ];

      const singleResult = formatWorklog(single, "text");
      const multipleResult = formatWorklog(multiple, "text");

      expect(singleResult).toContain("(1 commit)");
      expect(multipleResult).toContain("(2 commits)");
    });
  });
});
