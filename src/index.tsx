#!/usr/bin/env bun
import { ensureSolidTransformPlugin } from "@opentui/solid/bun-plugin";
ensureSolidTransformPlugin();
import { TextAttributes } from "@opentui/core";
import { render } from "@opentui/solid";
import { Command } from "@jsr/cliffy__command";
import { worklogCommand } from "./commands/worklog/index.ts";
import { publishCommand } from "./commands/publish/index.ts";
import { authCommand } from "./commands/auth/index.ts";

const args = Bun.argv.slice(2);

// 无参数 → 显示欢迎 TUI
if (args.length === 0) {
  render(() => (
    <box alignItems="center" justifyContent="center" flexGrow={1}>
      <box justifyContent="center" alignItems="flex-end">
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
    .command("publish", publishCommand)
    .command("auth", authCommand)
    .parse(args);
}
