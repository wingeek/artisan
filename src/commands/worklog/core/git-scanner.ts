import { resolveGitDir, listSubmodules } from "../init.ts";
import { join } from "node:path";
import type { CommitEntry, DateRange, FileStat } from "../types.ts";

export const MAX_DIFF_BYTES = 8192;
export const MAX_TOTAL_DIFF_BYTES = 65536;

export interface ScanOptions {
  path: string;
  dateRange: DateRange;
  includeDiff: boolean;
  repo?: string;
  submodule?: string;
}

export async function scanRepo(opts: ScanOptions): Promise<CommitEntry[]> {
  const { path, dateRange, includeDiff, repo, submodule } = opts;

  const gitDir = await resolveGitDir(path);
  if (!gitDir) {
    throw new Error(`not a git repository: ${path}`);
  }

  const repoName = await getRepoName(path);
  const finalRepo = repo ?? repoName;

  const logEntries = await getGitLogEntries(path, dateRange);

  if (logEntries.length === 0) {
    return [];
  }

  const commits: CommitEntry[] = [];
  let totalDiffBytes = 0;

  for (const [hash, timestamp, message] of logEntries) {
    const entry: CommitEntry = {
      timestamp,
      repo: finalRepo,
      submodule: submodule ?? "",
      message,
      hash,
    };

    if (includeDiff && totalDiffBytes < MAX_TOTAL_DIFF_BYTES) {
      const diffResult = await captureDiff(path, hash, MAX_DIFF_BYTES);

      if (diffResult.diff) {
        entry.diff = diffResult.diff;
        totalDiffBytes += diffResult.diff.length;
      }

      if (diffResult.files) {
        entry.files = diffResult.files;
      }

      if (diffResult.truncated) {
        entry.diffTruncated = true;
      }
    }

    commits.push(entry);
  }

  return commits;
}

async function getRepoName(path: string): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
      cwd: path,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) {
      return path.split("/").pop() ?? path;
    }
    return out.trim().split("/").pop() ?? path;
  } catch {
    return path.split("/").pop() ?? path;
  }
}

async function getGitLogEntries(path: string, dateRange: DateRange): Promise<[string, string, string][]> {
  const since = dateRange.start.toISOString();
  const until = dateRange.end.toISOString();

  try {
    const proc = Bun.spawn(
      [
        "git",
        "log",
        `--since=${since}`,
        `--until=${until}`,
        "--pretty=format:%H|%aI|%s",
      ],
      {
        cwd: path,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;

    if (code !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`git log failed: ${err.trim()}`);
    }

    const lines = out.split("\n").filter(Boolean);
    const entries: [string, string, string][] = [];

    for (const line of lines) {
      const parts = line.split("|");
      if (parts.length >= 3) {
        const [hash, timestamp, ...messageParts] = parts;
        entries.push([hash, timestamp, messageParts.join("|")]);
      }
    }

    return entries;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`git log failed: ${error.message}`);
    }
    throw error;
  }
}

export interface DiffResult {
  diff?: string;
  files?: FileStat[];
  truncated: boolean;
}

/**
 * Decide whether a raw diff patch fits within the per-commit budget.
 * Pure function — callers handle the actual stat fallback.
 */
export function truncateDiff(diff: string, maxSize: number): { diff?: string; truncated: boolean } {
  if (diff.length <= maxSize) {
    return { diff, truncated: false };
  }
  return { truncated: true };
}

async function captureDiff(path: string, hash: string, maxSize: number): Promise<DiffResult> {
  try {
    const proc = Bun.spawn(["git", "show", "--no-color", "--format=", hash], {
      cwd: path,
      stdout: "pipe",
      stderr: "pipe",
    });

    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;

    if (code !== 0) {
      console.warn(`git show failed for ${hash}, skipping diff`);
      return { truncated: false };
    }

    const decision = truncateDiff(out, maxSize);
    if (!decision.truncated) {
      return { diff: decision.diff, truncated: false };
    }

    const statResult = await captureStat(path, hash);
    return { files: statResult, truncated: true };
  } catch (error) {
    console.warn(`failed to capture diff for ${hash}`);
    return { truncated: false };
  }
}

async function captureStat(path: string, hash: string): Promise<FileStat[]> {
  try {
    const proc = Bun.spawn(["git", "show", "--stat", "--format=", hash], {
      cwd: path,
      stdout: "pipe",
      stderr: "pipe",
    });

    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;

    if (code !== 0) {
      return [];
    }

    return parseStatOutput(out);
  } catch {
    return [];
  }
}

export function parseStatOutput(stat: string): FileStat[] {
  const files: FileStat[] = [];
  const lines = stat.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.includes("Binary files") && trimmed.includes("differ")) {
      const match = trimmed.match(/Binary files (.+) and (.+) differ/);
      if (match) {
        files.push({ path: match[1].trim(), added: 0, deleted: 0 });
      }
      continue;
    }

    if (trimmed.includes(" files changed,") || !trimmed.includes("|")) {
      continue;
    }

    const parts = trimmed.split("|");
    if (parts.length >= 2) {
      const path = parts[0].trim();
      const stats = parts[1].trim();

      const added = (stats.match(/\+/g) || []).length;
      const deleted = (stats.match(/-/g) || []).length;

      files.push({ path, added, deleted });
    }
  }

  return files;
}
