import {
  NATIONAL_SCENARIOS as SCENARIOS,
  registry,
  DEFAULT_SCENARIO_ID,
} from "../domain/catalog.mjs";
import {
  diagnose,
  matches,
  validDate,
  validateValue,
  scenarioFor,
} from "../domain/core.mjs";
import { parseIntake, detectIntent } from "../domain/intake-parser.mjs";
import {
  containsPersonalNumberIn,
  PILOT_DATA_MESSAGE,
} from "../domain/pilot-data.mjs";
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
  let r, data;
  try {
    r = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    data = await r.json();
  } catch {
    throw new Error(
      "Kunde inte nå tjänsten. Din inmatning finns kvar här. Kontrollera anslutningen och försök igen.",
    );
  }
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
let pendingCommand = null,
  dirty = false,
  conflict = false,
  privacyBlocked = false,
  announcementTimer,
  historyError = false,
  resumeId = null,
  initialized = false;
const drafts = new Map();
function setSaveState(state) {
  document.body.dataset.saveState = state;
  $("#save-status").textContent = {
    loading: "Läser in…",
    pending: "Osparade ändringar",
    saving: "Sparar utkast…",
    saved: caseState ? "Utkast sparat" : "Redo",
    error: "Inte sparat",
    blocked: "Sparandet pausat",
  }[state];
  $("#system-status").textContent =
    state === "saved"
      ? caseState
        ? "Sparat"
        : "Tomt"
      : state === "loading"
        ? "Läser in"
        : "Lokalt";
  $("#retry-save").hidden = conflict || privacyBlocked;
  $("#copy-draft").hidden = !conflict;
  $("#recovery-actions").hidden = !["error", "blocked"].includes(state);
}
function setError(message) {
  $("#error-banner").hidden = !message;
  $("#error-banner").textContent = message || "";
}
async function run(fn) {
  try {
    await fn();
  } catch (e) {
    if (e.code === "REVISION_CONFLICT") {
      conflict = true;
      cacheDraft();
    }
    setError(
      e.status === 401
        ? "Sessionen har gått ut. Hämta din text och dina uppgifter innan du laddar om sidan."
        : conflict
          ? "En annan vy har ändrat utkastet. Du kan spara din inmatning som en egen kopia utan att skriva över den andra versionen."
          : e.message,
    );
    setSaveState("error");
  }
}
function storeRaw(text) {
  if (!caseState || privacyBlocked) return;
  try {
    sessionStorage.setItem("oppna.raw." + caseState.id, text);
  } catch {}
}
function snapshot() {
  return {
    raw: $("#intent").value,
    scenarioId: scenario.id,
    facts: structuredClone(localFacts),
    inputStatus: inputStatus(),
    inputReasons: [
      ...parsed.unsupported,
      ...parsed.uncertain.filter((x) => x.key === "goal").map((x) => x.message),
    ],
  };
}
function cacheDraft() {
  if (privacyBlocked) return;
  try {
    sessionStorage.setItem(
      "oppna.draft." + (caseState?.id || "new"),
      JSON.stringify({
        ...snapshot(),
        goalConfirmed,
        baseRevision: caseState?.revision ?? 0,
        pendingCommand,
        conflict,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
function pauseForPrivateData(data) {
  privacyBlocked = !!config?.pilotEnabled && containsPersonalNumberIn(data);
  $("#intent").setAttribute("aria-invalid", String(privacyBlocked));
  if (!privacyBlocked) return false;
  clearTimeout(saveTimer);
  changeVersion++;
  dirty = true;
  setError(PILOT_DATA_MESSAGE);
  setSaveState("blocked");
  return true;
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
  if (!caseState) {
    events = [];
    auditVerified = false;
    historyError = false;
    return;
  }
  try {
    const data = await api(`/api/cases/${caseState.id}/events`);
    events = data.events;
    auditVerified = data.verified;
    historyError = false;
  } catch {
    historyError = true;
    auditVerified = false;
  }
}
async function deliverPendingCommand() {
  if (!pendingCommand) return;
  const attempt = pendingCommand;
  let response;
  try {
    response = await api(`/api/cases/${caseState.id}/commands`, {
      method: "POST",
      body: attempt,
    });
  } catch (e) {
    if (e.code === "REVISION_CONFLICT") {
      conflict = true;
      cacheDraft();
    }
    throw e;
  }
  caseState = response.case;
  pendingCommand = null;
  cacheDraft();
  // A replay can return a newer state written by another tab. Do not overwrite it.
  if (response.replayed && caseState.revision > attempt.expectedRevision + 1)
    throw Object.assign(new Error("Utkastet har ändrats."), {
      code: "REVISION_CONFLICT",
    });
}
async function command(command) {
  pendingCommand = {
    commandId: crypto.randomUUID(),
    expectedRevision: caseState.revision,
    command,
  };
  cacheDraft();
  await deliverPendingCommand();
}
function scheduleSave() {
  clearTimeout(saveTimer);
  changeVersion++;
  dirty = true;
  cacheDraft();
  if (conflict || privacyBlocked) return;
  setError("");
  setSaveState("pending");
  saveTimer = setTimeout(() => run(saveFacts), 500);
}
async function saveFacts() {
  if (conflict || pauseForPrivateData([$("#intent").value, localFacts])) return;
  const version = changeVersion;
  const captured = snapshot();
  // Serialize scenario changes and facts against the latest server revision. A slow
  // response must never replace newer text or facts in the user's local view.
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      if (version !== changeVersion || conflict) return;
      setSaveState("saving");
      await deliverPendingCommand();
      if (version !== changeVersion || privacyBlocked) return;
      if (!caseState || caseState.submitted) {
        caseState = (
          await api("/api/cases", {
            method: "POST",
            body: { scenarioId: captured.scenarioId },
          })
        ).case;
        storeRaw($("#intent").value);
        if (cacheDraft()) {
          try {
            sessionStorage.removeItem("oppna.draft.new");
          } catch {}
        }
      }
      if (caseState.scenarioId !== captured.scenarioId)
        await command({
          type: "select_scenario",
          scenarioId: captured.scenarioId,
        });
      await command({
        type: "replace_facts",
        facts: captured.facts,
        inputStatus: captured.inputStatus,
        inputReasons: captured.inputReasons,
      });
      try {
        sessionStorage.setItem("oppna.savedRaw." + caseState.id, captured.raw);
      } catch {}
      if (version === changeVersion) {
        dirty = false;
        setError("");
        setSaveState("saved");
        try {
          sessionStorage.removeItem("oppna.draft." + caseState.id);
        } catch {}
      }
      await loadEvents();
      renderSystem();
      renderAuthority();
    });
  try {
    await saveChain;
  } catch (e) {
    if (version === changeVersion || e.code === "REVISION_CONFLICT") throw e;
  }
}
function parseInput() {
  const text = $("#intent").value;
  $("#resume-draft").hidden = true;
  $("#count").textContent = `${text.length} / 3 000`;
  if (pauseForPrivateData(text)) return;
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
  clearTimeout(announcementTimer);
  announcementTimer = setTimeout(() => {
    $("#parser-announcement").textContent = hasGoal()
      ? `${scenario.title}. ${Object.keys(localFacts).length} uppgifter. ${diagnose(scenario, localFacts).questions.length} frågor kvar.`
      : $("#question h3")?.textContent || "Inga uppgifter ännu.";
  }, 900);
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
      control = `<form data-answer-form="${q.key}" class="answer-form" novalidate>${field}<button class="primary" type="submit">Bekräfta</button><p id="answer-error" class="field-error" role="alert" hidden></p></form>`;
    }
    return `<div class="question-box ${q.kind === "uncertain" ? "uncertain" : ""}"><div class="question-label">${q.kind === "uncertain" ? "Bekräfta tolkningen" : q.kind === "edit" ? "Ändra uppgift" : "Nästa fråga"}<span>${diagnosis.questions.length} kvar</span></div><h3>${escape(q.question)}</h3>${q.kind === "uncertain" ? `<blockquote>”${escape(localFacts[q.key]?.source)}”</blockquote>` : ""}${q.help ? `<details class="question-help"><summary>Hjälp med svaret</summary><p>${escape(q.help)}</p></details>` : ""}${control}${editKey ? '<button class="text-button cancel-edit" data-cancel-edit>Avbryt ändring</button>' : ""}</div>`;
  }

  return '<div class="question-box ready"><h3>Underlaget är ifyllt</h3><p>Du kan ändra uppgifterna nedan. Inget har skickats in.</p></div>';
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
    `<div class="facts-heading"><h2>Det här har vi förstått</h2>${hasGoal() ? `<span>${d.completeCount} / ${d.requiredCount} ifyllda</span>` : ""}</div>
    ${hasGoal() ? `<div class="progress" role="progressbar" aria-label="Ifyllda uppgifter" aria-valuemin="0" aria-valuemax="${Math.max(1, d.requiredCount)}" aria-valuenow="${d.completeCount}"><i style="width:${(d.completeCount / Math.max(1, d.requiredCount)) * 100}%"></i></div>` : '<p class="empty-state">Inga uppgifter ännu.</p>'}
    ${parsed.corrections.map((c) => `<p class="correction">”${escape(c.from)}” tolkades som ”${escape(c.to)}”</p>`).join("")}
    ${active
      .map(([key, def]) => {
        const f = localFacts[key];
        return `<details class="fact-row" data-fact="${key}"><summary><span class="fact-icon ${!f ? "missing" : f.status === "uncertain" ? "uncertain" : ""}" aria-hidden="true">${!f ? "?" : f.status === "uncertain" ? "!" : f.status === "confirmed" ? "✓" : "·"}</span><span>${escape(def.label)}</span><strong class="${!f ? "missing-value" : ""}">${f ? escape(value(key, f.value)) : "Saknas"}${f ? `<small class="fact-status">${factStatus(f)}</small>` : ""}</strong></summary><div class="provenance">${f ? `<p><b>Källa:</b> ”${escape(f.source)}”</p><p>${f.status === "confirmed" ? "Bekräftat av dig" : f.status === "uncertain" ? "Osäker tolkning" : "Tolkat från din beskrivning"}</p>` : ""}<button class="text-button" data-edit="${key}" aria-label="${f ? "Ändra eller bekräfta" : "Ange uppgift"}: ${escape(def.label)}">${f ? "Ändra eller bekräfta" : "Ange uppgift"}</button></div></details>`;
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
  const container = $("#system-content");
  const focusId = container.contains(document.activeElement)
    ? document.activeElement.id
    : null;
  const scrollers = [
    ...container.querySelectorAll(".code, .tree, .events"),
  ].map((el) => [el.className, el.scrollTop, el.scrollLeft]);
  const openEvents = [...container.querySelectorAll(".event[open]")].map(
    (el) => el.id,
  );
  function restoreSystemView() {
    for (const id of openEvents)
      document.getElementById(id)?.setAttribute("open", "");
    for (const [name, top, left] of scrollers) {
      const el = container.querySelector("." + name);
      if (el) {
        el.scrollTop = top;
        el.scrollLeft = left;
      }
    }
    if (focusId)
      document.getElementById(focusId)?.focus({ preventScroll: true });
  }
  $("#case-ref").textContent = "case / " + (caseState?.id.slice(0, 8) || "—");
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
      `<div class="events">${historyError ? '<p class="history-error">Historiken kunde inte hämtas. Utkastets sparstatus visas vid textfältet. <button class="text-button" data-retry-history>Försök hämta historiken igen</button></p>' : ""}<div class="audit-status">${auditVerified ? "✓ Händelsekedjan är verifierad" : ""}</div>${[
        ...events,
      ]
        .reverse()
        .map(
          (e) =>
            `<details class="event" id="event-${e.sequence}"><summary id="event-summary-${e.sequence}"><time>${clock(e.at)}</time><span>${escape(e.type)}<small>#${e.sequence} · ${escape(e.actor.role)}</small></span></summary><pre>${escape(JSON.stringify(e.data, null, 2))}</pre></details>`,
        )
        .join("")}</div>`;
    restoreSystemView();
    return;
  }
  const d = hasGoal()
    ? diagnose(scenario, localFacts)
    : { missing: [], uncertain: [] };
  const goal = hasGoal() ? scenario.id : null;
  const visibleFacts = hasGoal() ? localFacts : {};
  const data = {
    case_id: caseState?.id || null,
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
    `<div class="graph-code"><div class="tree" id="case-tree" tabindex="0" aria-label="Ärendets träd"><b>◉ case</b><div><strong>goal</strong><span>${escape(goal || "—")}</span></div><div><strong>facts <em>${Object.keys(visibleFacts).length}</em></strong>${Object.entries(
      visibleFacts,
    )
      .map(
        ([k, f]) =>
          `<span>${escape(k)} <i>${escape(JSON.stringify(f.value))}</i></span>`,
      )
      .join(
        "",
      )}</div><div><strong>missing</strong>${d.missing.map((k) => `<span class="amber">${escape(k)}</span>`).join("") || '<span class="dim">[ ]</span>'}</div><div><strong>uncertain</strong>${data.uncertain.map((k) => `<span class="amber">${escape(k)}</span>`).join("") || '<span class="dim">[ ]</span>'}</div></div><pre id="case-json" class="code" tabindex="0" aria-label="Ärendets JSON">${highlight(data)}</pre></div>`;
  restoreSystemView();
}
function factStatus(f) {
  return f.status === "confirmed"
    ? "Bekräftat av dig"
    : f.status === "uncertain"
      ? "Osäker tolkning"
      : "Tolkat · ej bekräftat";
}
function factsTable(facts, spec) {
  return `<table><caption class="sr-only">Strukturerade ärendeuppgifter</caption><tbody>${Object.entries(
    facts,
  )
    .filter(([k]) => k !== "citizen_note")
    .map(
      ([k, f]) =>
        `<tr data-field="${escape(k)}"><th scope="row">${escape(spec.fields[k]?.label || k)}</th><td>${escape(value(k, f.value, spec))}<small class="fact-status ${f.status === "uncertain" ? "uncertain-value" : ""}">${factStatus(f)}</small></td></tr>`,
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
function focusQuestion() {
  const heading = $("#question h3") || $("#facts h2");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}
function answerError(message) {
  const error = $("#answer-error"),
    input = $("#answer");
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
  if (input) {
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", "answer-error");
    input.focus();
  }
}
function explicitAnswer(key, v, uncertain = false) {
  const field = scenario.fields[key];
  if (typeof v === "string") v = v.trim();
  if (config.pilotEnabled && containsPersonalNumberIn(v)) {
    answerError(PILOT_DATA_MESSAGE);
    return;
  }
  if (field.type === "number" && v !== "") v = Number(v);
  if (!validateValue(field, v)) {
    answerError(
      field.type === "number"
        ? `Ange ett heltal mellan ${field.min} och ${field.max}.`
        : field.type === "enum"
          ? "Välj ett av alternativen."
          : field.type === "date"
            ? "Ange ett giltigt datum mellan år 2000 och 2099."
            : `Ange ${field.min}–${field.max} tecken för ${field.label.toLowerCase()}.`,
    );
    return;
  }
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
  focusQuestion();
}
$("#intent").addEventListener("input", parseInput);
document.addEventListener("input", (e) => {
  if (e.target.dataset.draft)
    drafts.set(e.target.dataset.draft, e.target.value);
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "resume-draft" && !dirty && resumeId) {
    run(async () => {
      b.disabled = true;
      $("#intent").disabled = true;
      try {
        await restoreDraft(resumeId);
        b.hidden = true;
      } finally {
        b.disabled = false;
        $("#intent").disabled = false;
      }
    });
  }
  if (b.id === "retry-save" || b.id === "copy-draft")
    run(async () => {
      b.disabled = true;
      setError("");
      try {
        if (!initialized) return await boot();
        if (!dirty && !caseState && resumeId && !$("#resume-draft").hidden) {
          await restoreDraft(resumeId);
          $("#resume-draft").hidden = true;
          return;
        }
        if (b.id === "copy-draft") {
          if (pauseForPrivateData([$("#intent").value, localFacts])) return;
          caseState = (
            await api("/api/cases", {
              method: "POST",
              body: { scenarioId: scenario.id },
            })
          ).case;
          conflict = false;
          pendingCommand = null;
          storeRaw($("#intent").value);
        }
        clearTimeout(saveTimer);
        changeVersion++;
        cacheDraft();
        await saveFacts();
      } finally {
        b.disabled = false;
      }
    });
  if (b.hasAttribute("data-download-draft")) {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: "0.5.1",
            kind: "local_draft",
            submitted: false,
            saved: !dirty && !!caseState,
            interpretationPaused: privacyBlocked,
            ...snapshot(),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "oppna-utkast.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (b.hasAttribute("data-retry-history"))
    run(async () => {
      await loadEvents();
      renderSystem();
    });
  if (b.dataset.boolKey)
    explicitAnswer(b.dataset.boolKey, b.dataset.bool === "true");
  if (b.dataset.unsure) explicitAnswer(b.dataset.unsure, false, true);
  if (b.dataset.edit) {
    editKey = b.dataset.edit;
    render();
    ($("#answer") || $("#question button"))?.focus();
  }
  if (b.hasAttribute("data-cancel-edit")) {
    const key = editKey;
    editKey = null;
    render();
    document.querySelector(`[data-edit="${key}"]`)?.focus();
  }
  if (b.hasAttribute("data-confirm-goal")) {
    goalConfirmed = true;
    scheduleSave();
    render();
    focusQuestion();
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
  setSaveState("loading");
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
  // Never select the latest server case implicitly. The shared browser may
  // contain a previous visitor's or tester's draft in the same pilot session.
  initialized = true;
  resumeId = readCachedDraft("new")
    ? "new"
    : cases.find((c) => c.revision > 0 || readCachedDraft(c.id))?.id || null;
  $("#resume-draft").hidden = !resumeId;
  $("#intent").value = "";
  $("#intent").disabled = !config.pilotEnabled;
  render();
  setError("");
  setSaveState("saved");
}
function readCachedDraft(id) {
  try {
    const candidate = JSON.parse(sessionStorage.getItem("oppna.draft." + id));
    const spec = candidate && registry[candidate.scenarioId];
    if (
      spec &&
      typeof candidate.raw === "string" &&
      candidate.raw.length <= 3000 &&
      candidate.facts &&
      !Array.isArray(candidate.facts) &&
      Object.keys(candidate.facts).length <= 30 &&
      Object.entries(candidate.facts).every(
        ([key, f]) =>
          spec.fields[key] && f && validateValue(spec.fields[key], f.value),
      ) &&
      !(config.pilotEnabled && containsPersonalNumberIn(candidate))
    )
      return candidate;
  } catch {}
  return null;
}
async function restoreDraft(id) {
  caseState = id === "new" ? null : (await api("/api/cases/" + id)).case;
  scenario = caseState
    ? scenarioFor(caseState.scenarioId, caseState.scenarioVersion)
    : registry[DEFAULT_SCENARIO_ID];
  localFacts = structuredClone(caseState?.facts || {});
  let raw = "",
    savedRaw = null;
  const cached = readCachedDraft(id);
  if (id === "new" && !cached)
    throw new Error(
      "Det lokala utkastet finns inte längre. Börja med en ny beskrivning.",
    );
  try {
    raw = sessionStorage.getItem("oppna.raw." + id) || "";
    savedRaw = sessionStorage.getItem("oppna.savedRaw." + id);
  } catch {}
  if (cached) {
    scenario = registry[cached.scenarioId];
    localFacts = cached.facts;
    raw = cached.raw;
    pendingCommand = cached.pendingCommand || null;
    conflict =
      !!cached.conflict ||
      (cached.baseRevision !== (caseState?.revision ?? 0) && !pendingCommand);
    dirty = true;
  }
  $("#intent").value = raw;
  parsed = parseIntake(raw, scenario);
  // Saved structured data can exist without the browser-local original text.
  if (
    !raw &&
    Object.keys(localFacts).length &&
    caseState?.inputStatus === "supported"
  )
    parsed.goal = scenario.id;
  previousParsed = parsed;
  goalConfirmed = cached
    ? !!cached.goalConfirmed
    : caseState?.inputStatus === "supported";
  await loadEvents();
  render();
  setError("");
  setSaveState("saved");
  $("#intent").disabled = false;
  if (pauseForPrivateData([raw, localFacts])) return;
  if (conflict)
    throw Object.assign(new Error("Utkastet har ändrats."), {
      code: "REVISION_CONFLICT",
    });
  if (cached) {
    scheduleSave();
    return;
  }
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
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
window.addEventListener("online", () => {
  if (dirty && initialized && !conflict && !privacyBlocked) scheduleSave();
});
run(boot);
