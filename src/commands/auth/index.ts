import { Command } from "@jsr/cliffy__command";
import { statusCommand } from "./status.ts";

export const authCommand = new Command()
  .description("Inspect AI (BYOK) configuration.")
  .command("status", statusCommand);
