import {
  NATIONAL_SCENARIOS as SCENARIOS,
  registry,
  DEFAULT_SCENARIO_ID,
} from "../domain/catalog.mjs";
import { diagnose, matches, validDate, scenarioFor } from "../domain/core.mjs";
import { parseIntake, detectIntent } from "../domain/intake-parser.mjs";
let scenario = registry[DEFAULT_SCENARIO_ID];
const $ = (q) => document.querySelector(q),
  escape = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const value = (key, v, spec = scenario) =>
  typeof v === "boolean"
    ? v
      ? "Ja"
      : "Nej"
    : spec.fields[key]?.type === "date" && validDate(v)
      ? new Intl.DateTimeFormat("sv-SE", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(v))
      : String(v) + (spec.fields[key]?.unit ? " " + spec.fields[key].unit : "");
const clock = (t) =>
  new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(t));
async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) {
    const e = new Error(data.error?.message || "Åtgärden misslyckades.");
    e.status = r.status;
    e.code = data.error?.code;
    throw e;
  }
  return data;
}

const standalone = location.pathname === "/handlaggning";
let config,
  caseState,
  localFacts = {},
  parsed = parseIntake("", scenario),
  previousParsed = parsed;
let goalConfirmed = false,
  editKey = null,
  tab = "json",
  events = [],
  auditVerified = false;
let saveTimer,
  saveChain = Promise.resolve(),
  changeVersion = 0;
const drafts = new Map();
function setError(message) {
  $("#error-banner").hidden = !message;
  $("#error-banner").textContent = message || "";
}
async function run(fn) {
  try {
    await fn();
    setError("");
  } catch (e) {
    setError(e.message);
    document.body.dataset.saveState = "error";
  }
}
function storeRaw(text) {
  if (!caseState) return;
  try {
    sessionStorage.setItem("oppna.raw." + caseState.id, text);
  } catch {}
}
function inputStatus() {
  return parsed.unsupported.length
    ? "unsupported"
    : !parsed.goal ||
        (parsed.uncertain.some((x) => x.key === "goal") && !goalConfirmed)
      ? "uncertain"
      : "supported";
}
function hasGoal() {
  return (
    !!parsed.goal &&
    !parsed.unsupported.length &&
    parsed.goals?.[0]?.polarity !== "negative"
  );
}
async function loadEvents() {
  const data = await api(`/api/cases/${caseState.id}/events`);
  events = data.events;
  auditVerified = data.verified;
}
async function command(command) {
  const response = await api(`/api/cases/${caseState.id}/commands`, {
    method: "POST",
    body: {
      commandId: crypto.randomUUID(),
      expectedRevision: caseState.revision,
      command,
    },
  });
  caseState = response.case;
}
function scheduleSave() {
  clearTimeout(saveTimer);
  changeVersion++;
  document.body.dataset.saveState = "pending";
  saveTimer = setTimeout(() => run(saveFacts), 500);
}
async function saveFacts() {
  const version = changeVersion;
  const snapshot = {
    raw: $("#intent").value,
    scenarioId: scenario.id,
    facts: structuredClone(localFacts),
    inputStatus: inputStatus(),
    inputReasons: [
      ...parsed.unsupported,
      ...parsed.uncertain.filter((x) => x.key === "goal").map((x) => x.message),
    ],
  };
  // Serialize scenario changes and facts against the latest server revision. A slow
  // response must never replace newer text or facts in the user's local view.
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      if (version !== changeVersion) return;
      document.body.dataset.saveState = "saving";
      if (caseState.submitted) {
        caseState = (
          await api("/api/cases", {
            method: "POST",
            body: { scenarioId: snapshot.scenarioId },
          })
        ).case;
        storeRaw($("#intent").value);
      }
      if (caseState.scenarioId !== snapshot.scenarioId)
        await command({
          type: "select_scenario",
          scenarioId: snapshot.scenarioId,
        });
      await command({
        type: "replace_facts",
        facts: snapshot.facts,
        inputStatus: snapshot.inputStatus,
        inputReasons: snapshot.inputReasons,
      });
      try {
        sessionStorage.setItem("oppna.savedRaw." + caseState.id, snapshot.raw);
      } catch {}
      await loadEvents();
      if (version === changeVersion) document.body.dataset.saveState = "saved";
      renderSystem();
      renderAuthority();
    });
  await saveChain;
}
function parseInput() {
  const text = $("#intent").value;
  const intent = detectIntent(text, SCENARIOS);
  const check = parseIntake(text, scenario);
  if (intent.goal && intent.goal !== scenario.id && !check.unsupported.length) {
    scenario = registry[intent.goal];
    localFacts = {};
    previousParsed = { facts: {}, goal: null, uncertain: [] };
    goalConfirmed = false;
    drafts.clear();
  }
  const next = parseIntake(text, scenario);
  if (!text.trim()) localFacts = {};
  else if (next.unsupported.length || !next.goal)
    // A temporarily incomplete goal must not erase answers the user entered.
    // Keep them on this draft; a genuinely different scenario clears them above.
    localFacts = Object.fromEntries(
      Object.entries(localFacts).filter(([, f]) => f.method === "explicit"),
    );
  else
    for (const key of new Set([
      ...Object.keys(previousParsed.facts),
      ...Object.keys(next.facts),
    ])) {
      const semantic = (f) =>
        JSON.stringify([
          f?.value,
          f?.status,
          f?.alternatives?.map((a) => [a.value, a.status]),
        ]);
      if (
        localFacts[key]?.method === "explicit" &&
        semantic(previousParsed.facts[key]) === semantic(next.facts[key])
      )
        continue;
      if (
        !localFacts[key] ||
        JSON.stringify(previousParsed.facts[key]) !==
          JSON.stringify(next.facts[key])
      ) {
        if (next.facts[key]) localFacts[key] = next.facts[key];
        else delete localFacts[key];
      }
    }
  if (
    previousParsed.goal !== next.goal ||
    previousParsed.uncertain.some((x) => x.key === "goal") !==
      next.uncertain.some((x) => x.key === "goal")
  )
    goalConfirmed = false;
  parsed = next;
  if (!text.trim() || (next.goal && !next.unsupported.length))
    previousParsed = next;
  editKey = null;
  storeRaw(text);
  scheduleSave();
  render();
}
function questionMarkup() {
  if (!$("#intent").value.trim() && !hasGoal()) return "";
  const diagnosis = diagnose(scenario, localFacts),
    scope = inputStatus();
  if (parsed.goals?.length > 1) {
    return `<div class="question-box uncertain"><h3>${parsed.goalRelation === "alternative" ? "Vilket gäller?" : "Flera ärenden"}</h3><ul>${parsed.goals.map((g) => `<li>${escape(registry[g.id].title)}${g.fuzzy ? " (osäker tolkning)" : ""}</li>`).join("")}</ul><p>Beskriv ett ärende i taget för att komplettera uppgifterna.</p></div>`;
  }
  if (parsed.goals?.[0]?.polarity === "negative")
    return `<div class="question-box"><h3>Vad vill du göra i stället?</h3></div>`;
  if (scope === "unsupported") {
    const message = parsed.unsupported.some((s) =>
      s.includes("flera ärendemål"),
    )
      ? "Beskriv en sak i taget."
      : parsed.unsupported.some((s) => s.includes("inte säkert identifiera"))
        ? "Beskriv lite tydligare vad du vill göra."
        : "Det här ärendet stöds inte ännu.";
    return `<div class="question-box stopped"><h3>Vad gäller ärendet?</h3><p>${message}</p></div>`;
  }
  if (!parsed.goal)
    return `<div class="question-box"><h3>Vad vill du göra?</h3></div>`;
  if (scope === "uncertain" && !goalConfirmed && !editKey)
    return `<div class="question-box uncertain"><div class="question-label">Har vi förstått rätt?</div><h3>${parsed.goals?.[0]?.tense === "past" ? "Gäller ärendet något som redan är gjort?" : `Vill du ${escape(scenario.title.toLowerCase())}?`}</h3><button class="primary" data-confirm-goal>Ja, det stämmer</button></div>`;
  const q = editKey
    ? { key: editKey, ...scenario.fields[editKey], kind: "edit" }
    : diagnosis.questions[0];
  if (q) {
    const current = drafts.has("field." + q.key)
      ? drafts.get("field." + q.key)
      : q.kind === "edit"
        ? (localFacts[q.key]?.value ?? "")
        : "";
    let control;
    if (q.type === "boolean")
      control = `<div class="choice-row"><button class="choice" data-bool-key="${q.key}" data-bool="true">Ja</button><button class="choice" data-bool-key="${q.key}" data-bool="false">Nej</button><button class="text-button" data-unsure="${q.key}">Vet inte</button></div>`;
    else {
      let field =
        q.type === "enum"
          ? `<select id="answer" name="answer" class="field" data-draft="field.${q.key}" required aria-label="${escape(q.question)}"><option value="">Välj…</option>${q.options.map((v) => `<option ${v === current ? "selected" : ""}>${escape(v)}</option>`).join("")}</select>`
          : `<input id="answer" name="answer" class="field" data-draft="field.${q.key}" type="${q.type === "number" ? "number" : q.type === "date" ? "date" : "text"}" value="${escape(current)}" ${q.type === "number" ? `min="${q.min}" max="${q.max}" step="1"` : `maxlength="${q.max || 160}"`} placeholder="${escape(q.key === "address" ? "Gatuadress och ort" : q.placeholder || "")}" required aria-label="${escape(q.question)}">`;
      control = `<form data-answer-form="${q.key}" class="answer-form">${field}<button class="primary" type="submit">Bekräfta</button></form>`;
    }
    return `<div class="question-box ${q.kind === "uncertain" ? "uncertain" : ""}"><div class="question-label">${q.kind === "uncertain" ? "Bekräfta tolkningen" : q.kind === "edit" ? "Ändra uppgift" : "Nästa fråga"}<span>${diagnosis.questions.length} kvar</span></div><h3>${escape(q.question)}</h3>${q.kind === "uncertain" ? `<blockquote>”${escape(localFacts[q.key]?.source)}”</blockquote>` : ""}${q.help ? `<details class="question-help"><summary>Hjälp med svaret</summary><p>${escape(q.help)}</p></details>` : ""}${control}${editKey ? '<button class="text-button cancel-edit" data-cancel-edit>Avbryt ändring</button>' : ""}</div>`;
  }

  return "";
}
function renderCitizen() {
  $("#count").textContent = `${$("#intent").value.length} / 3 000`;
  $("#question").innerHTML = questionMarkup();
  $("#question").hidden = !$("#question").innerHTML;
  const d = diagnose(scenario, localFacts);
  const active = hasGoal()
    ? Object.entries(scenario.fields).filter(
        ([k, def]) =>
          localFacts[k] ||
          (def.required && (!def.when || matches(def.when, localFacts))),
      )
    : [];
  $("#facts").innerHTML =
    `<div class="facts-heading"><h2>Det här har vi förstått</h2>${hasGoal() ? `<span>${d.completeCount} / ${d.requiredCount} klara</span>` : ""}</div>
    ${hasGoal() ? `<div class="progress"><i style="width:${(d.completeCount / Math.max(1, d.requiredCount)) * 100}%"></i></div>` : '<p class="empty-state">Inga uppgifter ännu.</p>'}
    ${parsed.corrections.map((c) => `<p class="correction">”${escape(c.from)}” tolkades som ”${escape(c.to)}”</p>`).join("")}
    ${active
      .map(([key, def]) => {
        const f = localFacts[key];
        return `<details class="fact-row" data-fact="${key}"><summary><span class="fact-icon ${!f ? "missing" : f.status === "uncertain" ? "uncertain" : ""}" aria-hidden="true">${!f ? "?" : f.status === "uncertain" ? "!" : "✓"}</span><span>${escape(def.label)}</span><strong class="${!f ? "missing-value" : ""}">${f ? escape(value(key, f.value)) : "Saknas"}</strong></summary><div class="provenance">${f ? `<p><b>Källa:</b> ”${escape(f.source)}”</p><p>${f.status === "confirmed" ? "Bekräftat av dig" : f.status === "uncertain" ? "Osäker tolkning" : "Tolkat från din beskrivning"}</p>` : ""}<button class="text-button" data-edit="${key}">${f ? "Ändra eller bekräfta" : "Ange uppgift"}</button></div></details>`;
      })
      .join("")}`;
}
function highlight(o) {
  return escape(JSON.stringify(o, null, 2)).replace(
    /(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null|\d+(?:\.\d+)?)\b/g,
    (m, s, k, n) =>
      s
        ? `<span class="${k ? "json-key" : "json-string"}">${s}</span>${k || ""}`
        : `<span class="json-number">${n}</span>`,
  );
}

function renderSystem() {
  if (!caseState) return;
  $("#case-ref").textContent = "case / " + caseState.id.slice(0, 8);
  document.querySelectorAll("[data-system-tab]").forEach((b) => {
    const active = b.dataset.systemTab === tab;
    b.setAttribute("aria-selected", String(active));
    b.tabIndex = active ? 0 : -1;
  });
  $("#system-content").setAttribute(
    "aria-labelledby",
    tab === "json" ? "json-tab" : "events-tab",
  );
  if (tab === "events") {
    $("#system-content").innerHTML =
      `<div class="events"><div class="audit-status">${auditVerified ? "✓ Händelsekedjan är verifierad" : ""}</div>${[
        ...events,
      ]
        .reverse()
        .map(
          (e) =>
            `<details class="event"><summary><time>${clock(e.at)}</time><span>${escape(e.type)}<small>#${e.sequence} · ${escape(e.actor.role)}</small></span></summary><pre>${escape(JSON.stringify(e.data, null, 2))}</pre></details>`,
        )
        .join("")}</div>`;
    return;
  }
  const d = hasGoal()
    ? diagnose(scenario, localFacts)
    : { missing: [], uncertain: [] };
  const goal = hasGoal() ? scenario.id : null;
  const visibleFacts = hasGoal() ? localFacts : {};
  const data = {
    case_id: caseState.id,
    scenario: goal,
    input_status: inputStatus(),
    ...(parsed.goals?.length
      ? {
          identified_goals: parsed.goals.map(
            ({
              id,
              source,
              start,
              end,
              polarity,
              tense,
              modality,
              uncertain,
            }) => ({
              scenario: id,
              source,
              sourceSpan: { start, end },
              polarity,
              tense,
              modality,
              uncertain,
            }),
          ),
          goal_relation: parsed.goalRelation,
        }
      : {}),
    facts: visibleFacts,
    missing: d.missing,
    uncertain: [
      ...(inputStatus() === "uncertain" && $("#intent").value.trim()
        ? ["goal"]
        : []),
      ...d.uncertain,
    ],
  };
  $("#system-content").innerHTML =
    `<div class="graph-code"><div class="tree"><b>◉ case</b><div><strong>goal</strong><span>${escape(goal || "—")}</span></div><div><strong>facts <em>${Object.keys(visibleFacts).length}</em></strong>${Object.entries(
      visibleFacts,
    )
      .map(
        ([k, f]) =>
          `<span>${escape(k)} <i>${escape(JSON.stringify(f.value))}</i></span>`,
      )
      .join(
        "",
      )}</div><div><strong>missing</strong>${d.missing.map((k) => `<span class="amber">${escape(k)}</span>`).join("") || '<span class="dim">[ ]</span>'}</div><div><strong>uncertain</strong>${data.uncertain.map((k) => `<span class="amber">${escape(k)}</span>`).join("") || '<span class="dim">[ ]</span>'}</div></div><pre class="code" tabindex="0" aria-label="Ärendets JSON">${highlight(data)}</pre></div>`;
}
function factsTable(facts, spec) {
  return `<table><caption class="sr-only">Strukturerade ärendeuppgifter</caption><tbody>${Object.entries(
    facts,
  )
    .filter(([k]) => k !== "citizen_note")
    .map(
      ([k, f]) =>
        `<tr data-field="${escape(k)}"><th scope="row">${escape(spec.fields[k]?.label || k)}</th><td>${escape(value(k, f.value, spec))}${f.status === "uncertain" ? '<small class="uncertain-value">Osäker tolkning</small>' : ""}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}
function renderAuthority() {
  // This is a read-only projection of the citizen's own case. Real staff access
  // remains scoped by the server; no pilot staff session or routing is needed.
  $("#authority").innerHTML = hasGoal()
    ? `<article class="work-card"><div class="work-top"><strong>${escape(scenario.title)}</strong><span>${escape(localFacts.municipality?.value || "")}</span></div><div class="work-inner">${Object.keys(localFacts).filter((k) => k !== "citizen_note").length ? factsTable(localFacts, scenario) : '<p class="empty-state">Inga uppgifter ännu.</p>'}</div></article>`
    : '<p class="empty-state">Inga uppgifter ännu.</p>';
}
function render() {
  const focused = document.activeElement?.id;
  const selection =
    focused && "selectionStart" in document.activeElement
      ? document.activeElement.selectionStart
      : null;
  const openFacts = [
    ...document.querySelectorAll("details[data-fact][open]"),
  ].map((x) => x.dataset.fact);
  renderCitizen();
  renderSystem();
  renderAuthority();
  for (const key of openFacts)
    document
      .querySelector(`details[data-fact="${key}"]`)
      ?.setAttribute("open", "");
  if (focused && focused !== "intent") {
    const el = document.getElementById(focused);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        if (selection !== null) el.setSelectionRange(selection, selection);
      } catch {}
    }
  }
}
function explicitAnswer(key, v, uncertain = false) {
  if (scenario.fields[key].type === "number") v = Number(v);
  localFacts[key] = {
    value: v,
    status: uncertain ? "uncertain" : "confirmed",
    source: uncertain
      ? "Användaren är osäker"
      : `${scenario.fields[key].label}: ${value(key, v)}`,
    sourceSpan: null,
    method: "explicit",
    confidence: uncertain ? 0.5 : 1,
  };
  drafts.delete("field." + key);
  editKey = null;
  scheduleSave();
  render();
}
$("#intent").addEventListener("input", parseInput);
document.addEventListener("input", (e) => {
  if (e.target.dataset.draft)
    drafts.set(e.target.dataset.draft, e.target.value);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.boolKey)
    explicitAnswer(b.dataset.boolKey, b.dataset.bool === "true");
  if (b.dataset.unsure) explicitAnswer(b.dataset.unsure, false, true);
  if (b.dataset.edit) {
    editKey = b.dataset.edit;
    render();
    $("#answer")?.focus();
  }
  if (b.hasAttribute("data-cancel-edit")) {
    editKey = null;
    render();
  }
  if (b.hasAttribute("data-confirm-goal")) {
    goalConfirmed = true;
    scheduleSave();
    render();
  }
  if (b.dataset.systemTab) {
    tab = b.dataset.systemTab;
    renderSystem();
  }
  if (b.dataset.identityProvider)
    run(async () => {
      const r = await api("/api/auth/start", {
        method: "POST",
        body: { provider: b.dataset.identityProvider },
      });
      location.assign(r.authorizationUrl);
    });
});
document.addEventListener("submit", (e) => {
  if (e.target.dataset.answerForm) {
    e.preventDefault();
    explicitAnswer(
      e.target.dataset.answerForm,
      new FormData(e.target).get("answer"),
    );
  }
  if (e.target.id === "staff-login") {
    e.preventDefault();
    run(async () => {
      await api("/api/staff/login", {
        method: "POST",
        body: { key: new FormData(e.target).get("key") },
      });
      await renderStandalone();
    });
  }
});
$("[role=tablist]").addEventListener("keydown", (e) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
  e.preventDefault();
  tab =
    e.key === "Home"
      ? "json"
      : e.key === "End"
        ? "events"
        : tab === "json"
          ? "events"
          : "json";
  renderSystem();
  $("#" + (tab === "json" ? "json-tab" : "events-tab")).focus();
});
async function renderStandalone() {
  $("#citizen-workspace").hidden = true;
  $("#staff-workspace").hidden = false;
  try {
    const { tasks } = await api("/api/staff/tasks");
    $("#staff-standalone").innerHTML = tasks.length
      ? tasks
          .map(
            (p) =>
              `<article class="work-card"><div class="work-top"><strong>${escape(p.title)}</strong><span>${escape(p.caseId.slice(0, 8))}</span></div><div class="work-inner">${factsTable(p.facts, scenarioFor(p.scenarioId, p.scenarioVersion))}</div></article>`,
          )
          .join("")
      : '<p class="empty-state">Inga tilldelade ärenden.</p>';
  } catch (e) {
    if (e.status !== 401) throw e;
    $("#staff-standalone").innerHTML = config.identityProviders.staff
      ? '<button class="primary" data-identity-provider="staff">Logga in</button>'
      : config.pilotEnabled
        ? '<form id="staff-login"><label for="staff-key">Handläggarnyckel</label><input id="staff-key" name="key" class="field" type="password" autocomplete="off" required minlength="32"><button class="primary">Logga in</button></form>'
        : "<p>Tjänsten förbereds.</p>";
  }
}
async function boot() {
  config = await api("/api/config");
  if (standalone) {
    await renderStandalone();
    return;
  }
  const session = await api("/api/session");
  if (!config.pilotEnabled && !session.authenticated) {
    $("#citizen-workspace").hidden = true;
    $("#identity-panel").hidden = false;
    $("#identity-panel").innerHTML = config.identityProviders.citizen
      ? '<h1>Logga in till ÖPPNA</h1><button class="primary" data-identity-provider="citizen">Logga in</button>'
      : "<h1>Tjänsten förbereds</h1>";
    return;
  }
  await api("/api/session", { method: "POST", body: {} });
  const { cases } = await api("/api/cases");
  if (!cases.length && !config.pilotEnabled) {
    $("#citizen-workspace").hidden = true;
    $("#identity-panel").hidden = false;
    $("#identity-panel").textContent = "Du har inga ärenden.";
    return;
  }
  caseState = cases.length
    ? (await api("/api/cases/" + cases[0].id)).case
    : (await api("/api/cases", { method: "POST", body: {} })).case;
  scenario = scenarioFor(caseState.scenarioId, caseState.scenarioVersion);
  localFacts = structuredClone(caseState.facts);
  let raw = "",
    savedRaw = null;
  try {
    raw = sessionStorage.getItem("oppna.raw." + caseState.id) || "";
    savedRaw = sessionStorage.getItem("oppna.savedRaw." + caseState.id);
  } catch {}
  $("#intent").value = raw;
  parsed = parseIntake(raw, scenario);
  // Saved structured data can exist without the browser-local original text.
  if (
    !raw &&
    Object.keys(localFacts).length &&
    caseState.inputStatus === "supported"
  )
    parsed.goal = scenario.id;
  previousParsed = parsed;
  goalConfirmed = caseState.inputStatus === "supported";
  await loadEvents();
  render();
  document.body.dataset.saveState = "saved";
  $("#intent").disabled = false;
  if (savedRaw !== null && raw !== savedRaw) {
    previousParsed = parseIntake(savedRaw, scenario);
    parseInput();
  } else if (raw) {
    const candidate = parseIntake(raw, scenario);
    if (
      candidate.suggestedScenario ||
      Object.entries(candidate.facts).some(
        ([k, f]) =>
          localFacts[k]?.method !== "explicit" &&
          (localFacts[k]?.value !== f.value ||
            localFacts[k]?.source !== f.source),
      ) ||
      Object.keys(localFacts).some(
        (k) => localFacts[k].method !== "explicit" && !candidate.facts[k],
      )
    ) {
      previousParsed = {
        ...parsed,
        facts: Object.fromEntries(
          Object.entries(localFacts).filter(([, f]) => f.method !== "explicit"),
        ),
      };
      parseInput();
    }
  }
}
run(boot);
