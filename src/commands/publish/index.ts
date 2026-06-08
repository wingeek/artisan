import { Command } from "@jsr/cliffy__command";
import { importCommand } from "./commands/import.ts";
import { listCommand } from "./commands/list.ts";
import { newCommand } from "./commands/new.ts";
import { editCommand } from "./commands/edit.tsx";
import { adaptCommand } from "./commands/adapt.ts";
import { pushCommand } from "./commands/push.ts";
import { previewCommand } from "./commands/preview.ts";

export const publishCommand = new Command()
  .description("Local-first multi-channel content publishing.")
  .command("import", importCommand)
  .command("list", listCommand)
  .command("new", newCommand)
  .command("edit", editCommand)
  .command("adapt", adaptCommand)
  .command("push", pushCommand)
  .command("preview", previewCommand);
