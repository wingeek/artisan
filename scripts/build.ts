import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin";
import { renameSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const compile = process.argv.includes("--compile");

// Step 1: Bundle with Solid plugin
const bundle = await Bun.build({
  entrypoints: ["src/index.tsx"],
  outdir: "dist",
  target: "bun",
  plugins: [createSolidTransformPlugin()],
});

if (!bundle.success) {
  console.error("Bundle failed:");
  for (const log of bundle.logs) {
    console.error(log);
  }
  process.exit(1);
}

// Add shebang to dist/index.js for bunx/npx
const indexPath = bundle.outputs[0].path;
let content = readFileSync(indexPath, "utf-8");
if (!content.startsWith("#!/usr/bin/env bun")) {
  content = "#!/usr/bin/env bun\n" + content;
  writeFileSync(indexPath, content);
}

console.log(`✓ Bundled ${bundle.outputs.length} file(s)`);

// Step 2: Compile to binary if requested
if (compile) {
  mkdirSync("release", { recursive: true });
  const isWin = process.platform === "win32";
  const name = isWin ? "artisan.exe" : "artisan";
  const target = join("release", name);

  const bin = await Bun.build({
    entrypoints: [bundle.outputs[0].path],
    compile: true,
    outfile: target,
  });

  if (!bin.success) {
    console.error("Compile failed:");
    for (const log of bin.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  const compiled = bin.outputs[0].path;
  const size = (bin.outputs[0].size / 1024 / 1024).toFixed(1);
  console.log(`✓ Compiled: release/${name} (${size} MB)`);
}
