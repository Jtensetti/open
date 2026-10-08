import { build } from "esbuild";
import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
await mkdir("dist/server", { recursive: true });
await mkdir("dist/client", { recursive: true });
await build({
  entryPoints: ["src/web/app.mjs"],
  outfile: "dist/client/app.js",
  bundle: true,
  format: "esm",
  target: ["es2022"],
  minify: true,
});
for (const file of ["index.html", "app.css", "favicon.svg"])
  await cp("src/web/" + file, "dist/client/" + file);
const types = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  svg: "image/svg+xml",
};
const assets = {};
for (const file of ["index.html", "app.css", "app.js", "favicon.svg"])
  assets["/" + file] = {
    body: await readFile("dist/client/" + file, "utf8"),
    type: types[file.split(".").at(-1)],
  };
await build({
  stdin: {
    contents: `import {createApp} from './src/server/app.mjs';export default createApp(${JSON.stringify(assets)});`,
    resolveDir: process.cwd(),
  },
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  external: ["node:crypto"],
  minify: false,
});
try {
  await readFile(".openai/hosting.json");
  await mkdir("dist/.openai", { recursive: true });
  await cp(".openai/hosting.json", "dist/.openai/hosting.json", {
    recursive: false,
  });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
console.log("Built browser assets and Worker entrypoint.");
