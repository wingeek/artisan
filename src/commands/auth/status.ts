import { Command } from "@jsr/cliffy__command";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_BASE_URL = "https://api.anthropic.com";

interface EnvCheck {
  name: string;
  value: string | undefined;
  default: string;
  required: boolean;
  hint?: string;
}

function mask(value: string): string {
  if (value.length <= 8) return value[0] + "***";
  return value.slice(0, 4) + "..." + value.slice(-4);
}

function resolveChecks(): EnvCheck[] {
  return [
    {
      name: "ANTHROPIC_API_KEY",
      value: process.env.ANTHROPIC_API_KEY,
      default: "(required)",
      required: true,
      hint: "Get one from your provider's console (Anthropic / GLM / DeepSeek).",
    },
    {
      name: "ANTHROPIC_BASE_URL",
      value: process.env.ANTHROPIC_BASE_URL,
      default: DEFAULT_BASE_URL,
      required: false,
      hint: "Set this to a Claude-compatible endpoint (e.g. GLM, DeepSeek).",
    },
    {
      name: "ANTHROPIC_MODEL",
      value: process.env.ANTHROPIC_MODEL,
      default: DEFAULT_MODEL,
      required: false,
      hint: "Override the model used by `worklog generate --ai`.",
    },
  ];
}

export function renderAuthStatus(): string {
  const checks = resolveChecks();
  const lines: string[] = ["AI configuration (BYOK)", ""];

  let ready = true;
  for (const check of checks) {
    const isSet = !!check.value;
    const mark = isSet ? "[x]" : check.required ? "[!]" : "[ ]";
    const shown = isSet
      ? check.name === "ANTHROPIC_API_KEY"
        ? mask(check.value!)
        : check.value
      : `default: ${check.default}`;
    lines.push(`  ${mark} ${check.name.padEnd(20)} ${shown}`);
    if (!isSet && check.required) ready = false;
  }

  lines.push("");
  if (ready) {
    lines.push("Ready. `artisan worklog generate --ai` will use the above.");
  } else {
    lines.push("Not ready. Set the missing required env var to enable AI features.");
    for (const check of checks) {
      if (check.hint && (!check.value || check.name === "ANTHROPIC_BASE_URL")) {
        lines.push(`  Tip: ${check.name} — ${check.hint}`);
      }
    }
  }

  return lines.join("\n");
}

export const statusCommand = new Command()
  .description("Check whether AI (BYOK) configuration is ready.")
  .action(() => {
    console.log(renderAuthStatus());
  });
