import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["core", "cli", "tests", "adapters", ".opencode/tools", ".opencode/plugins"];
const files = ["demo.ts", "demo-feasibility.ts", ...roots.flatMap((root) => walk(root))];
const failures: string[] = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failures.push(`${file}\n${result.stderr || result.stdout}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Checked ${files.length} TypeScript file(s).`);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return walk(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}
