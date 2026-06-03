import { Command } from "@jsr/cliffy__command";
import { groupByRepo, loadCommits, parseDateRange } from "./core/collector.ts";

export const statusCommand = new Command()
  .description("Show today's collected commit count.")
  .option("--date <date:string>", "Filter by specific date (YYYY-MM-DD)")
  .option("--since <date:string>", "Start date range (YYYY-MM-DD)")
  .option("--until <date:string>", "End date range (YYYY-MM-DD)")
  .option("--repo <name:string>", "Filter by repository name")
  .action(async (options) => {
    const dateRange = parseDateRange(options);
    const commits = await loadCommits(dateRange, options.repo);

    if (commits.length === 0) {
      console.log("No commits found.");
      return;
    }

    const grouped = groupByRepo(commits);

    for (const { repo, submodule, commits: repoCommits } of grouped) {
      const name = submodule ? `${repo}/${submodule}` : repo;
      console.log(`${name}: ${repoCommits.length} commit${repoCommits.length === 1 ? "" : "s"}`);
    }

    console.log(`Total: ${commits.length} commit${commits.length === 1 ? "" : "s"}`);
  });
