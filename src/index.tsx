import { TextAttributes } from "@opentui/core";
import { render } from "@opentui/solid";
import { Command } from "@jsr/cliffy__command";
import { worklogCommand } from "./commands/worklog/index.ts";

const args = Bun.argv.slice(2);

// 无参数 → 显示欢迎 TUI
if (args.length === 0) {
  render(() => (
    <box alignItems="flex-start" justifyContent="flex-start" flexGrow={1}>
      <box justifyContent="flex-start" alignItems="flex-start">
        <ascii_font font="tiny" text="Artisan" />
        <text attributes={TextAttributes.DIM}>What will you create?</text>
      </box>
    </box>
  ));
} else {
  // 有参数 → 走命令分发
  await new Command()
    .name("artisan")
    .description("@wingeek/artisan — a CLI for builders")
    .version("0.0.1")
    .command("worklog", worklogCommand)
    .parse(args);
}
