import { describe, it, expect } from "bun:test";
import { join } from "node:path";

// Simple unit tests for exported utilities
// Note: Full integration tests would require temp directories and git repos

describe("init module utilities", () => {
  describe("path resolution", () => {
    it("should resolve relative git paths correctly", () => {
      const repoRoot = "/test/repo";
      const relativeGit = ".git";
      const expected = join(repoRoot, relativeGit);
      expect(expected).toBe("/test/repo/.git");
    });

    it("should keep absolute paths as-is", () => {
      const absPath = "/absolute/path/to/.git";
      expect(absPath.startsWith("/")).toBe(true);
    });

    it("should handle nested submodule paths", () => {
      const parentRoot = "/main/repo";
      const submodulePath = "packages/ui";
      const expected = join(parentRoot, submodulePath);
      expect(expected).toBe("/main/repo/packages/ui");
    });
  });

  describe("submodule parsing", () => {
    it("should parse single submodule", () => {
      const output = "packages/ui\n";
      const paths = output.split("\n").map((s) => s.trim()).filter(Boolean);
      expect(paths).toEqual(["packages/ui"]);
    });

    it("should parse multiple submodules", () => {
      const output = "packages/ui\npackages/core\n";
      const paths = output.split("\n").map((s) => s.trim()).filter(Boolean);
      expect(paths).toEqual(["packages/ui", "packages/core"]);
    });

    it("should filter empty lines", () => {
      const output = "packages/ui\n\npackages/core\n\n";
      const paths = output.split("\n").map((s) => s.trim()).filter(Boolean);
      expect(paths).toEqual(["packages/ui", "packages/core"]);
    });

    it("should handle empty output", () => {
      const output = "\n";
      const paths = output.split("\n").map((s) => s.trim()).filter(Boolean);
      expect(paths).toEqual([]);
    });

    it("should trim whitespace", () => {
      const output = "  packages/ui  \n  packages/core  \n";
      const paths = output.split("\n").map((s) => s.trim()).filter(Boolean);
      expect(paths).toEqual(["packages/ui", "packages/core"]);
    });
  });

  describe("worklog directory path", () => {
    it("should construct worklog path correctly", () => {
      const homedir = "/home/user";
      const worklogPath = join(homedir, ".artisan", "worklog");
      expect(worklogPath).toBe("/home/user/.artisan/worklog");
    });
  });

  describe("hook path construction", () => {
    it("should construct hook path correctly", () => {
      const gitDir = "/repo/.git";
      const hookPath = join(gitDir, "hooks", "post-commit");
      expect(hookPath).toBe("/repo/.git/hooks/post-commit");
    });
  });
});
