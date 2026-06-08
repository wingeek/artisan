import { Command } from "@jsr/cliffy__command";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { PublishStore } from "../core/store.ts";
import { getDbPath } from "../utils.ts";

export const importCommand = new Command()
  .description("Import a local file into publish store.")
  .arguments("<path:string>")
  .option("--tags <tags:string>", "Comma-separated tags", { default: "" })
  .option("--title <title:string>", "Override document title")
  .action(async ({ tags, title }, filePath: string) => {
    const absPath = resolve(filePath);

    if (!existsSync(absPath)) {
      console.error(`✗ file not found: ${absPath}`);
      process.exit(1);
    }

    const content = await Bun.file(absPath).text();
    const frontmatterTitle = parseFrontmatterTitle(content);
    const h1 = content.split(/\r?\n/).find((l) => l.startsWith("# "))?.replace(/^#+\s*/, "");
    const docTitle = title ?? frontmatterTitle ?? h1 ?? absPath.split(/[/\\]/).pop() ?? "Untitled";
    const tagsArray = tags ? tags.split(",").map((t: string) => t.trim()) : [];

    const store = new PublishStore(getDbPath());
    try {
      const doc = store.insertDocument({
        id: crypto.randomUUID(),
        title: docTitle,
        content,
        source: "local_import",
        original_path: absPath,
        tags: JSON.stringify(tagsArray),
      });
      console.log(`✓ imported: ${doc.id}`);
      console.log(`  title: ${doc.title}`);
      if (tagsArray.length) console.log(`  tags: ${tagsArray.join(", ")}`);
    } finally {
      store.close();
    }
  });

function parseFrontmatterTitle(content: string): string | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return undefined;
  const yaml = match[1];
  const titleLine = yaml.split(/\r?\n/).find((l) => /^title:\s*/.test(l));
  if (!titleLine) return undefined;
  return titleLine.replace(/^title:\s*/, "").replace(/^["']|["']$/g, "").trim() || undefined;
}
