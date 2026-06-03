import { Command } from "@jsr/cliffy__command";
import { initCommand } from "./init.ts";
import { generateCommand } from "./generate.ts";
import { statusCommand } from "./status.ts";

export const worklogCommand = new Command()
  .description("Generate structured work logs from git commit history.")
  .command("init", initCommand)
  .command("generate", generateCommand)
  .command("status", statusCommand);
