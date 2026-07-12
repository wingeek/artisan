import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, rm } from "node:fs/promises";
import { parseStatOutput, MAX_DIFF_BYTES, MAX_TOTAL_DIFF_BYTES, truncateDiff } from "./core/git-scanner.ts";
import type { CommitEntry, FileStat } from "./types.ts";
import { scanRepo } from "./core/git-scanner.ts";
import { resolveScanPath } from "./scan.ts";
import { buildUserContentWithDiff } from "./adapters/claude.ts";

describe("parseStatOutput", () => {
  it("should parse basic stat output", () => {
    const stat = ` src/foo.ts | 12 +++++----
 src/bar.ts |  3 ++
 2 files changed, 15 insertions(+), 5 deletions(-)`;

    const files = parseStatOutput(stat);

    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({ path: "src/foo.ts", added: 5, deleted: 4 });
    expect(files[1]).toEqual({ path: "src/bar.ts", added: 2, deleted: 0 });
  });

  it("should handle binary files", () => {
    const stat = `Binary files src/image.png and /dev/null differ`;

    const files = parseStatOutput(stat);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/image.png");
    expect(files[0].added).toBe(0);
    expect(files[0].deleted).toBe(0);
  });

  it("should skip summary lines", () => {
    const stat = ` src/foo.ts | 5 +---
 2 files changed, 15 insertions(+), 5 deletions(-)`;

    const files = parseStatOutput(stat);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/foo.ts");
  });

  it("should handle empty output", () => {
    const files = parseStatOutput("");
    expect(files).toHaveLength(0);
  });
});

describe("truncateDiff", () => {
  it("keeps diff under the budget", () => {
    const result = truncateDiff("short diff", 100);
    expect(result.diff).toBe("short diff");
    expect(result.truncated).toBe(false);
  });

  it("truncates when diff exceeds budget", () => {
    const big = "x".repeat(100);
    const result = truncateDiff(big, 50);
    expect(result.diff).toBeUndefined();
    expect(result.truncated).toBe(true);
  });

  it("accepts diff exactly at the boundary", () => {
    const exactly = "x".repeat(50);
    const result = truncateDiff(exactly, 50);
    expect(result.diff).toBe(exactly);
    expect(result.truncated).toBe(false);
  });

  it("honors MAX_DIFF_BYTES constant from production config", () => {
    const exactly = "x".repeat(MAX_DIFF_BYTES);
    const result = truncateDiff(exactly, MAX_DIFF_BYTES);
    expect(result.truncated).toBe(false);

    const over = "x".repeat(MAX_DIFF_BYTES + 1);
    const resultOver = truncateDiff(over, MAX_DIFF_BYTES);
    expect(resultOver.truncated).toBe(true);
  });
});

describe("buildUserContentWithDiff", () => {
  const baseCommit = (overrides: Partial<CommitEntry> = {}): CommitEntry => ({
    timestamp: "2026-07-12T10:00:00Z",
    repo: "myrepo",
    submodule: "",
    message: "feat: add login",
    hash: "abc1234def5678",
    ...overrides,
  });

  it("renders diff block when entry.diff is present", () => {
    const grouped = [
      {
        repo: "myrepo",
        submodule: null,
        commits: [baseCommit({ diff: "+export function login() {}" })],
      },
    ];
    const out = buildUserContentWithDiff(grouped);
    expect(out).toContain("### [abc1234] feat: add login");
    expect(out).toContain("```diff");
    expect(out).toContain("+export function login() {}");
    expect(out).toContain("```");
  });

  it("renders truncation marker when entry.diffTruncated is set without diff", () => {
    const grouped = [
      {
        repo: "myrepo",
        submodule: null,
        commits: [baseCommit({ diff: undefined, diffTruncated: true })],
      },
    ];
    const out = buildUserContentWithDiff(grouped);
    expect(out).toContain("(diff truncated, see file stats above)");
    expect(out).not.toContain("```diff");
  });

  it("renders file stat lines when entry.files is set", () => {
    const grouped = [
      {
        repo: "myrepo",
        submodule: null,
        commits: [
          baseCommit({
            files: [
              { path: "src/a.ts", added: 5, deleted: 0 },
              { path: "src/b.ts", added: 0, deleted: 3 },
            ],
          }),
        ],
      },
    ];
    const out = buildUserContentWithDiff(grouped);
    expect(out).toContain("- src/a.ts +5");
    expect(out).toContain("- src/b.ts -3");
  });

  it("renders only hash + message when entry has no diff/files/truncation", () => {
    const grouped = [
      {
        repo: "myrepo",
        submodule: null,
        commits: [baseCommit()],
      },
    ];
    const out = buildUserContentWithDiff(grouped);
    expect(out).toContain("### [abc1234] feat: add login");
    expect(out).not.toContain("```diff");
    expect(out).not.toContain("(diff truncated");
    expect(out).not.toContain("- src/");
  });

  it("names submodule entries as repo/submodule", () => {
    const grouped = [
      {
        repo: "myrepo",
        submodule: "packages/sub",
        commits: [baseCommit()],
      },
    ];
    const out = buildUserContentWithDiff(grouped);
    expect(out).toContain("## myrepo/packages/sub");
  });
});

describe("resolveScanPath", () => {
  it("prefers positional arg when --path is absent", () => {
    expect(resolveScanPath({}, "/some/dir")).toBe("/some/dir");
  });

  it("prefers --path when positional arg is absent", () => {
    expect(resolveScanPath({ path: "/from/flag" }, undefined)).toBe("/from/flag");
  });

  it("falls back to cwd when neither is provided", () => {
    expect(resolveScanPath({}, undefined)).toBe(process.cwd());
  });

  it("accepts both when they point to the same path", () => {
    expect(resolveScanPath({ path: "/same" }, "/same")).toBe("/same");
  });
});

describe("scanRepo integration", () => {
  let testRepo: string;

  beforeEach(async () => {
    testRepo = join(tmpdir(), `artisan-test-${Date.now()}`);
    await mkdir(testRepo, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRepo, { recursive: true, force: true });
  });

  it("should scan a repo with commits", async () => {
    const proc = Bun.spawn(["git", "init"], {
      cwd: testRepo,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    await Bun.write(join(testRepo, "test.txt"), "hello");
    const addProc = Bun.spawn(["git", "add", "test.txt"], {
      cwd: testRepo,
      stdout: "pipe",
      stderr: "pipe",
    });
    await addProc.exited;

    const commitProc = Bun.spawn(
      ["git", "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "test commit"],
      { cwd: testRepo, stdout: "pipe", stderr: "pipe" }
    );
    await commitProc.exited;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const commits = await scanRepo({
      path: testRepo,
      dateRange: { start: today, end: tomorrow },
      includeDiff: true,
    });

    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe("test commit");
    expect(commits[0].repo).toBeTruthy();
    expect(commits[0].hash).toHaveLength(40);
    expect(commits[0].diff).toBeTruthy();
  });

  it("should return empty for date range with no commits", async () => {
    const proc = Bun.spawn(["git", "init"], {
      cwd: testRepo,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    await Bun.write(join(testRepo, "test.txt"), "hello");
    const addProc = Bun.spawn(["git", "add", "test.txt"], {
      cwd: testRepo,
      stdout: "pipe",
      stderr: "pipe",
    });
    await addProc.exited;

    const commitProc = Bun.spawn(
      ["git", "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "test commit"],
      { cwd: testRepo, stdout: "pipe", stderr: "pipe" }
    );
    await commitProc.exited;

    const pastDate = new Date("2020-01-01");
    const futureDate = new Date("2020-01-02");

    const commits = await scanRepo({
      path: testRepo,
      dateRange: { start: pastDate, end: futureDate },
      includeDiff: false,
    });

    expect(commits).toHaveLength(0);
  });

  it("should throw for non-git directory", async () => {
    const nonGitDir = join(tmpdir(), `artisan-non-git-${Date.now()}`);
    await mkdir(nonGitDir, { recursive: true });

    try {
      await scanRepo({
        path: nonGitDir,
        dateRange: { start: new Date(), end: new Date() },
        includeDiff: false,
      });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("not a git repository");
    } finally {
      await rm(nonGitDir, { recursive: true, force: true });
    }
  });

  it("should truncate large diffs", async () => {
    const proc = Bun.spawn(["git", "init"], {
      cwd: testRepo,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    const largeContent = "x".repeat(10000);
    await Bun.write(join(testRepo, "large.txt"), largeContent);

    const addProc = Bun.spawn(["git", "add", "large.txt"], {
      cwd: testRepo,
      stdout: "pipe",
      stderr: "pipe",
    });
    await addProc.exited;

    const commitProc = Bun.spawn(
      ["git", "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "large file"],
      { cwd: testRepo, stdout: "pipe", stderr: "pipe" }
    );
    await commitProc.exited;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const commits = await scanRepo({
      path: testRepo,
      dateRange: { start: today, end: tomorrow },
      includeDiff: true,
    });

    expect(commits).toHaveLength(1);
    expect(commits[0].diffTruncated).toBe(true);
    expect(commits[0].files).toBeTruthy();
    expect(commits[0].diff).toBeUndefined();
  });

  it("should handle multiple commits", async () => {
    const proc = Bun.spawn(["git", "init"], {
      cwd: testRepo,
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    for (let i = 1; i <= 3; i++) {
      await Bun.write(join(testRepo, `file${i}.txt`), `content${i}`);
      const addProc = Bun.spawn(["git", "add", `file${i}.txt`], {
        cwd: testRepo,
        stdout: "pipe",
        stderr: "pipe",
      });
      await addProc.exited;

      const commitProc = Bun.spawn(
        ["git", "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", `commit ${i}`],
        { cwd: testRepo, stdout: "pipe", stderr: "pipe" }
      );
      await commitProc.exited;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const commits = await scanRepo({
      path: testRepo,
      dateRange: { start: today, end: tomorrow },
      includeDiff: false,
    });

    expect(commits).toHaveLength(3);
    const messages = commits.map((c) => c.message);
    expect(messages).toContain("commit 1");
    expect(messages).toContain("commit 2");
    expect(messages).toContain("commit 3");
  });

  it("early-stops diff capture once cumulative bytes exceed MAX_TOTAL_DIFF_BYTES", async () => {
    const initProc = Bun.spawn(["git", "init"], {
      cwd: testRepo,
      stdout: "pipe",
      stderr: "pipe",
    });
    await initProc.exited;

    // Each file's diff is ~6 KB so it fits within MAX_DIFF_BYTES (8 KB) and is
    // kept as a full diff. After ~11 commits cumulative bytes exceed 64 KB,
    // triggering the early-stop: the 12th commit's diff must not be captured.
    const blob = "x".repeat(6000);
    for (let i = 1; i <= 12; i++) {
      await Bun.write(join(testRepo, `small${i}.txt`), blob);
      const addProc = Bun.spawn(["git", "add", `small${i}.txt`], {
        cwd: testRepo,
        stdout: "pipe",
        stderr: "pipe",
      });
      await addProc.exited;

      const commitProc = Bun.spawn(
        ["git", "-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", `small commit ${i}`],
        { cwd: testRepo, stdout: "pipe", stderr: "pipe" }
      );
      await commitProc.exited;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const commits = await scanRepo({
      path: testRepo,
      dateRange: { start: today, end: tomorrow },
      includeDiff: true,
    });

    expect(commits).toHaveLength(12);

    const withDiff = commits.filter((c) => c.diff !== undefined);
    const messageOnly = commits.filter(
      (c) => c.diff === undefined && c.files === undefined && !c.diffTruncated
    );

    // Early-stop kicked in for at least the last commit.
    expect(withDiff.length).toBeLessThan(12);
    expect(messageOnly.length).toBeGreaterThan(0);
    // The last commit must be message-only (no diff, no stat fallback).
    const last = commits[commits.length - 1]!;
    expect(last.diff).toBeUndefined();
    expect(last.files).toBeUndefined();
    expect(last.diffTruncated).toBeUndefined();
  });
});
