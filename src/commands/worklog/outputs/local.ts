import type { GroupedCommits, OutputFormat } from "../types.ts";

export function formatWorklog(grouped: GroupedCommits[], format: OutputFormat): string {
  switch (format) {
    case "json":
      return formatJson(grouped);
    case "md":
      return formatMarkdown(grouped);
    case "ai":
      return grouped;
    case "text":
    default:
      return formatText(grouped);
  }
}

export function formatText(grouped: GroupedCommits[]): string {
  const lines: string[] = [];

  for (const { repo, submodule, commits } of grouped) {
    const name = submodule ? `${repo}/${submodule}` : repo;
    lines.push(`${name} (${commits.length} commit${commits.length === 1 ? "" : "s"})`);

    for (const commit of commits) {
      const indent = submodule ? "  " : "";
      lines.push(`${indent}  • ${commit.hash.slice(0, 7)} ${commit.message}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function formatMarkdown(grouped: GroupedCommits[]): string {
  const lines: string[] = ["## Work Log", "", ""];

  for (const { repo, submodule, commits } of grouped) {
    const name = submodule ? `${repo}/${submodule}` : repo;
    lines.push(`### ${name} (${commits.length})`);
    lines.push("");
    lines.push("| Hash | Message |");
    lines.push("|------|----------|");

    for (const commit of commits) {
      lines.push(`| \`${commit.hash.slice(0, 7)}\` | ${commit.message} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatJson(grouped: GroupedCommits[]): string {
  return JSON.stringify(grouped, null, 2);
}
