import { Command } from "@jsr/cliffy__command";
import { exists, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { POST_COMMIT_HOOK } from "./hooks/post-commit.sh.ts";

const WORKLOG_DIR = join(homedir(), ".artisan", "worklog");
const HOOK_MARKER = "# artisan-worklog-managed";

export const initCommand = new Command()
  .description("Install worklog post-commit hook into a git repository.")
  .arguments("[path:string]")
  .option("--with-submodules", "Also install hooks for all submodules.")
  .action(async ({ withSubmodules }, path?: string) => {
    const target = path ?? process.cwd();
    await installHook(target);
    if (withSubmodules) {
      const subs = await listSubmodules(target);
      for (const sub of subs) {
        await installHook(join(target, sub));
      }
    }
    await ensureWorklogDir();
  });

async function installHook(repoRoot: string): Promise<void> {
  const gitDir = await resolveGitDir(repoRoot);
  if (!gitDir) {
    console.error(`✗ not a git repository: ${repoRoot}`);
    return;
  }

  const hookPath = join(gitDir, "hooks", "post-commit");
  const hooksDir = dirname(hookPath);
  await mkdir(hooksDir, { recursive: true });

  const existing = await exists(hookPath);
  if (existing) {
    const content = await Bun.file(hookPath).text();
    if (content.includes(HOOK_MARKER)) {
      console.log(`✓ already installed (skipped): ${hookPath}`);
      return;
    }
    console.error(`✗ post-commit hook already exists: ${hookPath}`);
    console.error(`  please merge manually. see docs/worklog.md.`);
    return;
  }

  await Bun.write(hookPath, POST_COMMIT_HOOK);
  if (process.platform !== "win32") {
    await Bun.spawn(["chmod", "+x", hookPath]).exited;
  }
  console.log(`✓ hook installed: ${hookPath}`);
}

export async function resolveGitDir(repoRoot: string): Promise<string | null> {
  try {
    const proc = Bun.spawn(["git", "rev-parse", "--git-dir"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) return null;
    const gitDir = out.trim();
    // git rev-parse returns relative path; resolve to absolute
    return gitDir.startsWith(".")
      ? join(repoRoot, gitDir)
      : gitDir;
  } catch {
    return null;
  }
}

export async function listSubmodules(repoRoot: string): Promise<string[]> {
  try {
    const proc = Bun.spawn(
      ["git", "submodule", "foreach", "--quiet", "echo $sm_path"],
      { cwd: repoRoot, stdout: "pipe", stderr: "pipe" },
    );
    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    if (code !== 0) return [];
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export async function ensureWorklogDir(): Promise<void> {
  await mkdir(WORKLOG_DIR, { recursive: true });
  console.log(`✓ worklog dir: ${WORKLOG_DIR}`);
}
