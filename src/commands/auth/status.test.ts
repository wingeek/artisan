import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { renderAuthStatus } from "./status.ts";

const ENV_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL"] as const;

let saved: Record<string, string | undefined> = {};

describe("renderAuthStatus", () => {
  beforeEach(() => {
    saved = {};
    for (const key of ENV_VARS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_VARS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  });

  it("reports Not ready when the trio is empty", () => {
    const out = renderAuthStatus();

    expect(out).toContain("AI configuration (BYOK)");
    expect(out).toContain("[!] ANTHROPIC_API_KEY");
    expect(out).toContain("default: (required)");
    expect(out).toContain("Not ready.");
    // optional vars show their built-in defaults
    expect(out).toContain("default: https://api.anthropic.com");
    expect(out).toContain("default: claude-sonnet-4-6");
  });

  it("reports Ready with GLM-compatible endpoint fully configured", () => {
    process.env.ANTHROPIC_API_KEY = "sk-glm-abcdefghijklmnop1234567890";
    process.env.ANTHROPIC_BASE_URL = "https://open.bigmodel.cn/api/anthropic";
    process.env.ANTHROPIC_MODEL = "glm-5.2";

    const out = renderAuthStatus();

    expect(out).toContain("Ready.");
    // key is masked (first 4 + ... + last 4), never the full plaintext
    expect(out).toContain("sk-g...7890");
    expect(out).not.toContain("1234567890");
    expect(out).toContain("https://open.bigmodel.cn/api/anthropic");
    expect(out).toContain("glm-5.2");
    // required-var mark is [x] when set
    expect(out).toContain("[x] ANTHROPIC_API_KEY");
  });

  it("reports Ready with only API_KEY set (other two fall back to defaults)", () => {
    // short key (≤8 chars) exercises the `first char + "***"` mask branch
    process.env.ANTHROPIC_API_KEY = "sk-ant1";

    const out = renderAuthStatus();

    expect(out).toContain("Ready.");
    expect(out).toContain("s***");
    expect(out).not.toContain("sk-ant1");
    // optional vars unset → printed with their built-in defaults
    expect(out).toContain("default: https://api.anthropic.com");
    expect(out).toContain("default: claude-sonnet-4-6");
    expect(out).toContain("[x] ANTHROPIC_API_KEY");
  });
});
