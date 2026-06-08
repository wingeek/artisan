import type { ChannelAdapter, DocumentMeta, AdaptedContent, PushResult } from "./base.ts";
import { copyToClipboard, openUrl } from "./base.ts";

export class JuejinAdapter implements ChannelAdapter {
  readonly name = "juejin";
  readonly label = "掘金";

  async adapt(content: string, meta: DocumentMeta): Promise<AdaptedContent> {
    // Juejin supports standard markdown, strip any frontmatter
    let adapted = content.replace(/^---[\s\S]*?---\n*/, "");

    // Ensure there's a title header
    if (!adapted.startsWith("# ")) {
      adapted = `# ${meta.title}\n\n${adapted}`;
    }

    // Append tags as juejin-friendly footer
    if (meta.tags.length) {
      adapted += `\n\n---\n\n> 标签: ${meta.tags.join(", ")}`;
    }

    return {
      body: adapted,
      format: "markdown",
      clipboard: true,
      openUrl: "https://juejin.cn/editor/drafts/new?v=2",
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
        ? "✓ Copied to clipboard, juejin editor opening..."
        : "✗ Failed to copy to clipboard",
    };
  }
}
