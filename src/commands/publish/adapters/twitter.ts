import type { ChannelAdapter, DocumentMeta, AdaptedContent, PushResult } from "./base.ts";
import { copyToClipboard, openUrl } from "./base.ts";

const TWEET_MAX = 280;

export class TwitterAdapter implements ChannelAdapter {
  readonly name = "twitter";
  readonly label = "Twitter/X";

  async adapt(content: string, meta: DocumentMeta): Promise<AdaptedContent> {
    // Strip frontmatter
    let text = content.replace(/^---[\s\S]*?---\n*/, "");

    // Extract first meaningful paragraph as summary
    const summary = extractSummary(text, TWEET_MAX * 2);

    // Build tags
    const tagStr = meta.tags.length ? `\n\n${meta.tags.map((t) => `#${t}`).join(" ")}` : "";

    // Split summary into tweets if needed
    const chunks = splitIntoTweets(summary, TWEET_MAX - tagStr.length);

    const tweets = chunks.map((chunk, i) =>
      chunks.length > 1 ? `${i + 1}/${chunks.length} ${chunk}` : chunk
    );

    // Append tags to last tweet
    if (tweets.length > 0 && tagStr) {
      tweets[tweets.length - 1] += tagStr;
    }

    // Format as thread
    const thread = tweets.join("\n\n---\n\n");

    return {
      body: thread,
      format: "text",
      clipboard: true,
      openUrl: "https://x.com/compose/post",
    };
  }

  async push(adapted: AdaptedContent): Promise<PushResult> {
    const copied = await copyToClipboard(adapted.body);
    if (adapted.openUrl) {
      await openUrl(adapted.openUrl);
    }

    return {
      success: copied,
      message: copied
        ? "✓ Thread copied to clipboard, X compose opening..."
        : "✗ Failed to copy to clipboard",
    };
  }
}

/** Extract a concise summary: first 2-3 paragraphs, skip headers and images */
function extractSummary(text: string, maxLen: number): string {
  const lines = text.split(/\r?\n/);

  // Collect meaningful paragraphs (skip headers, images, source lines, author lines)
  const paragraphs: string[] = [];
  let current = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip headers, images, hr, source lines, author lines
    if (
      /^#{1,6}\s/.test(trimmed) ||
      /^!\[/.test(trimmed) ||
      /^---$/.test(trimmed) ||
      /^source:/i.test(trimmed) ||
      /^作者[｜|]/.test(trimmed) ||
      /^\d+\s/.test(trimmed)  // numbered section headers like "1 Entire 是谁？"
    ) {
      if (current.trim()) {
        paragraphs.push(current.trim());
        current = "";
      }
      continue;
    }

    if (trimmed === "") {
      if (current.trim()) {
        paragraphs.push(current.trim());
        current = "";
      }
      continue;
    }

    current = current ? `${current} ${trimmed}` : trimmed;
  }
  if (current.trim()) paragraphs.push(current.trim());

  // Take paragraphs until we approach maxLen
  let summary = "";
  for (const para of paragraphs) {
    if (summary.length + para.length + 2 > maxLen && summary.length > 0) break;
    summary = summary ? `${summary}\n\n${para}` : para;
  }

  return summary || text.slice(0, maxLen);
}

/** Split text into tweet-sized chunks, respecting paragraph boundaries */
function splitIntoTweets(text: string, maxLen: number): string[] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
  const tweets: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current.length + trimmed.length + 2 <= maxLen) {
      current = current ? `${current}\n\n${trimmed}` : trimmed;
    } else {
      if (current) tweets.push(current);
      if (trimmed.length > maxLen) {
        const parts = splitBySentences(trimmed, maxLen);
        tweets.push(...parts.slice(0, -1));
        current = parts[parts.length - 1] || "";
      } else {
        current = trimmed;
      }
    }
  }
  if (current) tweets.push(current);

  return tweets.length > 0 ? tweets : [text.slice(0, maxLen)];
}

function splitBySentences(text: string, maxLen: number): string[] {
  const sentences = text.split(/(?<=[.!?。！？])\s*/);
  const result: string[] = [];
  let current = "";

  for (const s of sentences) {
    if (current.length + s.length + 1 <= maxLen) {
      current = current ? `${current} ${s}` : s;
    } else {
      if (current) result.push(current);
      current = s;
    }
  }
  if (current) result.push(current);

  return result;
}
