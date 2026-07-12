import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdir, rm } from "node:fs/promises";
import { parseStatOutput, MAX_DIFF_BYTES, MAX_TOTAL_DIFF_BYTES } from "./core/git-scanner.ts";
import type { CommitEntry, FileStat } from "./types.ts";
import { scanRepo } from "./core/git-scanner.ts";

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
});
