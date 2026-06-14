import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin";
import { copyFileSync, renameSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
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
// Note: Bun.compile API ignores `outfile` (verified Bun 1.3.14).
// Default outfile = dirname of entrypoint. If entrypoint lives inside a dir
// (e.g. dist/index.js → outfile "dist"), it collides with the existing dir.
// Workaround: copy entrypoint to a flat temp file at repo root so inferred
// outfile = "_artisan_bin" (file, not dir), then rename to release/<name>.
if (compile) {
  const tmpEntry = "_artisan_bin.js";
  copyFileSync(indexPath, tmpEntry);

  const bin = await Bun.build({
    entrypoints: [tmpEntry],
    compile: true,
  });

  unlinkSync(tmpEntry);

  if (!bin.success) {
    console.error("Compile failed:");
    for (const log of bin.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  mkdirSync("release", { recursive: true });
  const isWin = process.platform === "win32";
  const name = isWin ? "artisan.exe" : "artisan";
  const compiled = bin.outputs[0].path; // "_artisan_bin" or "_artisan_bin.exe"
  renameSync(compiled, join("release", name));
  const size = (bin.outputs[0].size / 1024 / 1024).toFixed(1);
  console.log(`✓ Compiled: release/${name} (${size} MB)`);
}
