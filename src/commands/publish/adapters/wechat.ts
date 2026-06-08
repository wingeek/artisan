import type { ChannelAdapter, DocumentMeta, AdaptedContent, PushResult } from "./base.ts";
import { copyToClipboard, openUrl } from "./base.ts";

export class WechatAdapter implements ChannelAdapter {
  readonly name = "wechat";
  readonly label = "微信公众号";

  async adapt(content: string, meta: DocumentMeta): Promise<AdaptedContent> {
    // Strip frontmatter
    let adapted = content.replace(/^---[\s\S]*?---\n*/, "");

    // Ensure title header
    if (!adapted.startsWith("# ")) {
      adapted = `# ${meta.title}\n\n${adapted}`;
    }

    // WeChat MP doesn't support standard code fences well, convert to indented blocks
    adapted = adapted.replace(/```[\w]*\n([\s\S]*?)```/g, (_match, code: string) => {
      const lines = code.trimEnd().split("\n");
      return lines.map((line: string) => `    ${line}`).join("\n");
    });

    // Add footer with tags and attribution
    const footerParts: string[] = [""];
    if (meta.tags.length) {
      footerParts.push(`标签：${meta.tags.map((t) => `#${t}`).join(" ")}`);
    }
    footerParts.push(`> Published via artisan`);

    adapted += "\n\n---\n" + footerParts.join("\n");

    return {
      body: adapted,
      format: "markdown",
      clipboard: true,
      openUrl: "https://editor.mdnice.com/",
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
        ? "✓ Copied to clipboard, WeChat MP editor opening..."
        : "✗ Failed to copy to clipboard",
    };
  }
}
