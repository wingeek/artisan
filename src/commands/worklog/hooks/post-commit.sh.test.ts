import { describe, it, expect } from "bun:test";
import { POST_COMMIT_HOOK } from "./post-commit.sh.ts";

describe("POST_COMMIT_HOOK template", () => {
  it("should be a non-empty string", () => {
    expect(typeof POST_COMMIT_HOOK).toBe("string");
    expect(POST_COMMIT_HOOK.length).toBeGreaterThan(0);
  });

  it("should contain shebang", () => {
    expect(POST_COMMIT_HOOK).toContain("#!/bin/sh");
  });

  it("should contain management marker", () => {
    expect(POST_COMMIT_HOOK).toContain("# artisan-worklog-managed");
  });

  it("should capture commit hash", () => {
    expect(POST_COMMIT_HOOK).toContain("COMMIT_HASH=$(git rev-parse --short HEAD)");
  });

  it("should capture commit message", () => {
    expect(POST_COMMIT_HOOK).toContain("COMMIT_MSG=$(git log -1 --pretty=%s)");
  });

  it("should capture timestamp in UTC ISO format", () => {
    expect(POST_COMMIT_HOOK).toContain('date -u +"%Y-%m-%dT%H:%M:%S+00:00"');
  });

  it("should capture repo name", () => {
    expect(POST_COMMIT_HOOK).toContain("git remote get-url origin");
  });

  it("should detect submodule context", () => {
    expect(POST_COMMIT_HOOK).toContain("SUBMODULE=");
    expect(POST_COMMIT_HOOK).toContain("git rev-parse --show-toplevel");
  });

  it("should escape commit message for JSON", () => {
    expect(POST_COMMIT_HOOK).toContain("ESC_MSG=");
    expect(POST_COMMIT_HOOK).toContain('sed');
  });

  it("should create JSON entry with required fields", () => {
    expect(POST_COMMIT_HOOK).toContain('\\"timestamp\\"');
    expect(POST_COMMIT_HOOK).toContain('\\"repo\\"');
    expect(POST_COMMIT_HOOK).toContain('\\"submodule\\"');
    expect(POST_COMMIT_HOOK).toContain('\\"message\\"');
    expect(POST_COMMIT_HOOK).toContain('\\"hash\\"');
  });

  it("should append to commits.jsonl", () => {
    expect(POST_COMMIT_HOOK).toContain("commits.jsonl");
    expect(POST_COMMIT_HOOK).toContain(">>");
  });

  it("should create worklog directory if needed", () => {
    expect(POST_COMMIT_HOOK).toContain("mkdir -p");
    expect(POST_COMMIT_HOOK).toContain("$HOME/.artisan/worklog");
  });
});
