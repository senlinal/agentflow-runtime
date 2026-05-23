import { spawnSync } from "node:child_process";

const commands = [
  ["npm", ["run", "release:check"]],
  ["npm", ["run", "doctor"]],
  ["npm", ["run", "opencode:check"]],
  ["npm", ["run", "workflow:validate", "--", "--template", "abcde-basic"]],
  ["npm", ["run", "workflow:validate", "--", "--template", "abcde-basic-llm"]],
  ["npm", ["run", "llm:config"]],
  ["npm", ["run", "llm:smoke"]],
  ["npm", ["run", "test"]],
  ["npm", ["run", "typecheck"]],
];

for (const [cmd, args] of commands) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`verify failed at: ${cmd} ${args.join(" ")}`);
    process.exitCode = result.status ?? 1;
    break;
  }
}

if (!process.exitCode) {
  console.log("\nVerify passed.");
}
