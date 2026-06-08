import { Command } from "@jsr/cliffy__command";
import { PublishStore } from "../core/store.ts";
import { getDbPath } from "../utils.ts";
import { listChannels } from "../adapters/registry.ts";
import { openUrl } from "../adapters/base.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileSync, unlinkSync } from "node:fs";

export const previewCommand = new Command()
  .description("Preview adapted content for a channel.")
  .arguments("<docId:string>")
  .option("--channel <channel:string>", `Channel to preview (${listChannels().join("/")})`)
  .option("--open", "Open in browser with basic HTML rendering")
  .action(async ({ channel, open }, docId: string) => {
    if (!channel) {
      console.error("✗ --channel is required");
      console.error(`  Available: ${listChannels().join(", ")}`);
      process.exit(1);
    }

    const store = new PublishStore(getDbPath());
    try {
      // Find document by partial ID
      const docs = store.listDocuments();
      const doc = docs.find((d) => d.id === docId || d.id.startsWith(docId));
      if (!doc) {
        console.error(`✗ document not found: ${docId}`);
        process.exit(1);
      }

      // Find adapted publication
      const pubs = store.getPublications(doc.id);
      const pub = pubs.find((p) => p.channel === channel);
      if (!pub || !pub.adapted_content) {
        console.error(`✗ no adapted content for channel "${channel}"`);
        console.error(`  Run: artisan publish adapt ${doc.id.slice(0, 8)} --channel ${channel}`);
        process.exit(1);
      }

      if (open) {
        // Write to temp HTML file and open in browser
        const htmlPath = join(tmpdir(), `artisan-preview-${doc.id.slice(0, 8)}-${channel}.html`);
        const html = renderMarkdownAsHtml(pub.adapted_content, doc.title, channel);
        writeFileSync(htmlPath, html, "utf8");
        console.log(`Opening preview: ${htmlPath}`);
        await openUrl(`file://${htmlPath}`);
        console.log(`\n  Temp file will remain until next preview or system cleanup.`);
        console.log(`  To remove: del "${htmlPath}"`);
      } else {
        // Print full adapted content to terminal
        console.log(`\n=== ${doc.title} → ${channel} ===\n`);
        console.log(pub.adapted_content);
        console.log(`\n--- ${pub.adapted_content.length} chars | status: ${pub.status} ---`);
      }
    } finally {
      store.close();
    }
  });

function renderMarkdownAsHtml(md: string, title: string, channel: string): string {
  // Channel display info
  const channelInfo: Record<string, { label: string; url: string }> = {
    "github-pages": { label: "GitHub Pages", url: "" },
    "juejin": { label: "掘金", url: "https://juejin.cn/editor/drafts/new?v=2" },
    "wechat": { label: "微信公众号", url: "https://editor.mdnice.com/" },
    "twitter": { label: "Twitter/X", url: "https://x.com/compose/post" },
  };
  const info = channelInfo[channel] ?? { label: channel, url: "" };

  // Lightweight markdown-to-HTML for preview purposes
  let body = md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Headers
    .replace(/^######\s+(.+)/gm, "<h6>$1</h6>")
    .replace(/^#####\s+(.+)/gm, "<h5>$1</h5>")
    .replace(/^####\s+(.+)/gm, "<h4>$1</h4>")
    .replace(/^###\s+(.+)/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.+)/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.+)/gm, "<h1>$1</h1>")
    // Tables
    .replace(/((?:^\|.+\|$\n?)+)/gm, renderTable)
    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Horizontal rules
    .replace(/^---$/gm, "<hr>")
    // Blockquotes
    .replace(/^>\s+(.+)/gm, "<blockquote>$1</blockquote>")
    // Paragraphs (lines not already wrapped in tags)
    .replace(/^(?!<[a-z/])(.+)$/gm, "<p>$1</p>")
    // Collapse empty <p> tags from newlines
    .replace(/<p>\s*<\/p>/g, "");

  // Escape md for embedding in JS string
  const mdEscaped = JSON.stringify(md);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview: ${title} → ${info.label}</title>
  <style>
    body {
      max-width: 800px;
      margin: 0 auto;
      padding: 0 1rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.8;
      color: #333;
    }
    h1, h2, h3 { margin-top: 1.5em; }
    pre { background: #f6f8fa; padding: 1rem; border-radius: 6px; overflow-x: auto; }
    code { background: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 1rem; color: #666; }
    img { border-radius: 6px; }
    hr { border: none; border-top: 1px solid #ddd; margin: 2rem 0; }
    .toolbar {
      position: sticky; top: 0; z-index: 100;
      background: #fff; border-bottom: 1px solid #e5e5e5;
      padding: 0.75rem 0; margin-bottom: 1.5rem;
      display: flex; align-items: center; gap: 0.75rem;
    }
    .toolbar .channel-badge {
      background: #f0f0f0; padding: 0.25em 0.6em; border-radius: 4px;
      font-size: 0.85em; font-weight: 600;
    }
    .toolbar button {
      padding: 0.4em 1em; border: 1px solid #d0d0d0; border-radius: 6px;
      background: #fff; cursor: pointer; font-size: 0.9em;
      transition: all 0.15s;
    }
    .toolbar button:hover { background: #f5f5f5; border-color: #999; }
    .toolbar button.primary { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
    .toolbar button.primary:hover { background: #333; }
    .toolbar button.copied { background: #16a34a; color: #fff; border-color: #16a34a; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 0.5em 0.75em; text-align: left; }
    th { background: #f6f8fa; font-weight: 600; }
    tr:nth-child(even) { background: #fafafa; }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="channel-badge">${info.label}</span>
    <button onclick="copyContent(this)">复制内容</button>
    ${info.url ? `<button class="primary" onclick="openPlatform()">打开${info.label}后台</button>` : ""}
  </div>
  <div class="content">
    ${body}
  </div>
  <script>
    const content = ${mdEscaped};
    function copyContent(btn) {
      navigator.clipboard.writeText(content).then(() => {
        btn.textContent = "已复制 ✓";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "复制内容";
          btn.classList.remove("copied");
        }, 2000);
      }).catch(() => {
        // Fallback for file:// protocol
        const ta = document.createElement("textarea");
        ta.value = content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        btn.textContent = "已复制 ✓";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "复制内容";
          btn.classList.remove("copied");
        }, 2000);
      });
    }
    function openPlatform() {
      window.open("${info.url}", "_blank");
    }
  </script>
</body>
</html>`;
}

function renderTable(match: string): string {
  const lines = match.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return match;

  const headerCells = parseRow(lines[0]);
  if (!headerCells) return match;

  // Skip separator row (|---|---|)
  let dataStart = 1;
  if (/^\|[\s\-:|]+\|$/.test(lines[1].trim())) {
    dataStart = 2;
  }

  const rows = lines.slice(dataStart).map(parseRow).filter(Boolean) as string[][];

  const thead = `<tr>${headerCells.map((c) => `<th>${c}</th>`).join("")}</tr>`;
  const tbody = rows.map((row) => `<tr>${row.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");

  return `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

function parseRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed.slice(1, -1).split("|").map((c) => c.trim());
}
