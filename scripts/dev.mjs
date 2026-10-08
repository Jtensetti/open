import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { openDatabase } from "./sqlite-adapter.mjs";
import { createApp } from "../src/server/app.mjs";
import { build } from "esbuild";
const port = Number(process.env.PORT || 8787);
mkdirSync(".data", { recursive: true });
const result = await build({
  entryPoints: ["src/web/app.mjs"],
  bundle: true,
  format: "esm",
  target: "es2022",
  write: false,
});
const assets = {
  "/app.js": {
    body: result.outputFiles[0].text,
    type: "application/javascript; charset=utf-8",
  },
};
for (const [name, type] of [
  ["index.html", "text/html; charset=utf-8"],
  ["app.css", "text/css; charset=utf-8"],
  ["favicon.svg", "image/svg+xml"],
])
  assets["/" + name] = { body: readFileSync("src/web/" + name, "utf8"), type };
const db = openDatabase(process.env.DATABASE_PATH || ".data/oppna.sqlite");
const app = createApp(assets);
const env = {
  DB: db,
  LOCAL_DEV: "true",
  DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE || "pilot",
  STAFF_KEY_HASHES: process.env.STAFF_KEY_HASHES || "",
};
for (const key of [
  "PUBLIC_ORIGIN",
  "OIDC_CITIZEN",
  "OIDC_STAFF",
  "OIDC_CITIZEN_CLIENT_SECRET",
  "OIDC_STAFF_CLIENT_SECRET",
  "OIDC_STAFF_GRANTS",
  "OPERATOR_NAME",
  "PRIVACY_URL",
  "MAINTENANCE_KEY_HASH",
  "LOG_REQUESTS",
])
  if (process.env[key]) env[key] = process.env[key];
const server = createServer(async (req, res) => {
  try {
    const origin = `http://localhost:${port}`;
    const request = new Request(origin + req.url, {
      method: req.method,
      headers: req.headers,
      ...(["GET", "HEAD"].includes(req.method)
        ? {}
        : { body: req, duplex: "half" }),
    });
    const r = await app.fetch(request, env, {
      waitUntil: (p) => p.catch(() => {}),
    });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error(e.name);
    res.writeHead(500);
    res.end("Server error");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`ÖPPNA local pilot: http://localhost:${port}`),
);
process.on("SIGTERM", () =>
  server.close(() => {
    db.close();
    process.exit(0);
  }),
);
