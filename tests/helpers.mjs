import { openDatabase } from "../scripts/sqlite-adapter.mjs";
import { createApp } from "../src/server/app.mjs";
export const fixture = {
  tax_registration_needed: true,
  address: "Storgatan 12, Trelleborg",
  municipality: "Trelleborg",
  capacity: 40,
  alcohol: true,
  current_use: "Restaurang",
  building_changes: false,
  outdoor: true,
  public_land: true,
  outdoor_area: 30,
  food_preparation: "Tillagning på plats",
  portions: 120,
  opening_date: "2027-05-01",
  cuisine: "Italiensk",
};
export const facts = (values = fixture) =>
  Object.fromEntries(
    Object.entries(values).map(([k, v]) => [
      k,
      {
        value: v,
        status: "confirmed",
        source: "Testuppgift " + k,
        method: "explicit",
        confidence: 1,
      },
    ]),
  );
export function harness() {
  const db = openDatabase(),
    env = { DB: db, LOCAL_DEV: "true", DEPLOYMENT_MODE: "pilot" },
    app = createApp();
  let count = 0;
  function client() {
    const jar = {};
    const ip = "192.0.2." + ++count;
    return {
      jar,
      async request(path, method = "GET", body, extraHeaders = {}) {
        const headers = { "CF-Connecting-IP": ip, ...extraHeaders };
        if (method !== "GET") {
          headers.Origin = "https://oppna.test";
          headers["Content-Type"] = "application/json";
        }
        headers.Cookie = Object.entries(jar)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
        const request = new Request("https://oppna.test" + path, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const response = await app.fetch(request, env, { waitUntil() {} });
        const cookie = response.headers.get("set-cookie");
        if (cookie) {
          const [name, value] = cookie.split(";")[0].split("=");
          jar[name] = value;
        }
        const data = await response.json();
        return { status: response.status, data, headers: response.headers };
      },
    };
  }
  return {
    db,
    env,
    app,
    client,
    async initialized() {
      const c = client();
      await c.request("/api/session", "POST", {});
      const r = await c.request("/api/cases", "POST", {});
      return { c, state: r.data.case };
    },
    async ready() {
      const { c, state } = await this.initialized();
      const r = await c.request(`/api/cases/${state.id}/commands`, "POST", {
        commandId: crypto.randomUUID(),
        expectedRevision: 0,
        command: {
          type: "replace_facts",
          facts: facts(),
          inputStatus: "supported",
        },
      });
      return { c, state: r.data.case };
    },
    close() {
      db.close();
    },
  };
}
export async function dispatch(
  c,
  state,
  command,
  commandId = crypto.randomUUID(),
) {
  return c.request(`/api/cases/${state.id}/commands`, "POST", {
    commandId,
    expectedRevision: state.revision,
    command,
  });
}
