import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
for (const directory of ["src", "scripts", "tests"])
  for (const entry of await readdir(directory, { recursive: true })) {
    if (!entry.endsWith(".mjs")) continue;
    const r = spawnSync(
      process.execPath,
      ["--check", `${directory}/${entry}`],
      { stdio: "inherit" },
    );
    if (r.status) process.exit(r.status);
  }
await import("./check-scenarios.mjs");
console.log("JavaScript syntax verified.");
