import { normalize, context, isUncertain } from "./extractors.mjs";
import {
  wordForms,
  registerNoun,
  action,
  pastActions,
} from "./intent-language.mjs";
import { synonyms, typoAliases, compoundRoots } from "./intent-vocabulary.mjs";

const cache = new WeakMap();
const tokenize = (text) =>
  [...text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)].map((m) => ({
    word: normalize(m[0]),
    start: m.index,
    end: m.index + m[0].length,
  }));
const fold = (word) => word.normalize("NFD").replace(/\p{M}/gu, "");
const fillers =
  /^(?:en|ett|den|det|de|min|mitt|mina|vår|vårt|våra|sin|sitt|sina|din|ditt|dina|befintlig|befintligt|befintliga|ny|nytt|nya|gammal|gammalt|gamla|liten|litet|lilla|stor|stort|stora|egen|eget|egna|fler|flera|någon|några|två|tre|fyra|fem|sex|sju|åtta|nio|tio)$/u;
// A single insertion, deletion, substitution or adjacent transposition. The
// original input is never rewritten; weak matches retain uncertainty and spans.
function oneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const different = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) different.push(i);
    return (
      different.length === 1 ||
      (different.length === 2 &&
        different[1] === different[0] + 1 &&
        a[different[0]] === b[different[1]] &&
        a[different[1]] === b[different[0]])
    );
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}
function compile(scenarios) {
  if (cache.has(scenarios)) return cache.get(scenarios);
  const raw = scenarios.map((s) => {
    const base = s.id.replace(/\.(?:se|trelleborg)$/u, "");
    const compounds = (compoundRoots[base] || []).flatMap((root) =>
      ["bygge", "byggnad", "utbyggnad", "tillbyggnad", "renovering"].map(
        (end) => root + end,
      ),
    );
    return {
      id: s.id,
      title: s.title,
      aliases: [
        ...new Set([...s.aliases, ...(synonyms[base] || []), ...compounds]),
      ].filter((a) => !typoAliases[a]),
    };
  });
  for (const s of raw)
    for (const alias of s.aliases)
      for (const t of tokenize(alias)) {
        // Function words and verbs are already curated or stay literal.
        if (
          !/^(?:på|i|om|för|till|av|och|ut|in|ner|en|ett|offentlig|kommunal|bärande)$/u.test(
            t.word,
          ) &&
          !action.test(t.word)
        )
          registerNoun(t.word);
      }
  const result = raw.map((s) => ({
    ...s,
    patterns: s.aliases.map((alias) =>
      tokenize(alias).map((t) => ({
        word: t.word,
        forms: new Set(wordForms(t.word)),
      })),
    ),
  }));
  cache.set(scenarios, result);
  return result;
}
function grammar(text, hit) {
  const c = context(text, hit.start);
  let before = text.slice(c.start, hit.start),
    after = text.slice(hit.end, c.end);
  // A new coordinated subject/action starts a new negation scope. Bare noun
  // coordination inherits polarity: "inte garage eller altan" negates both.
  const boundary = [
    ...before.matchAll(
      /(?:\boch\b|\bsamt\b|,)\s*(?:(?:jag|vi|man|du|barnet)\s+)(?=(?:vill|ska|skall|skulle|behöver|önskar|tänker|planerar|söker|ansöker)\b)/giu,
    ),
  ].at(-1);
  if (boundary) before = before.slice(boundary.index + boundary[0].length);
  const originalBefore = before;
  const contrast = [
    ...before.matchAll(/(?<![\p{L}])(?:utan|istället|i stället)(?![\p{L}])/giu),
  ].at(-1);
  if (
    contrast &&
    /\b(?:inte|ej|varken)\b/iu.test(before.slice(0, contrast.index))
  )
    before = before.slice(contrast.index + contrast[0].length);
  const inheritedAction = action.test(originalBefore);
  const inheritedProspective =
    /\b(?:vill|ska|skall|tänker|planerar|behöver)\b/iu.test(originalBefore);
  const additive = /\binte\s+(?:bara|enbart|endast)\b/iu.test(before);
  const intrinsicFailure = /waterwaste\.missedcollection/.test(hit.id);
  const localAfter = after.split(/\b(?:och|samt|men|utan)\b/iu)[0];
  const postNegation =
    /^(?:\s+(?:ska|skall|vill|har|kommer|vi|jag|man|de|den|det|tänker|behöver)){0,5}\s+(?:inte|ej|aldrig)\b/iu.test(
      localAfter,
    );
  const negated =
    !intrinsicFailure &&
    !additive &&
    (/\b(?:inte|ej|aldrig|ingen|inget|inga|varken|utan)\b/iu.test(before) ||
      postNegation);
  const all = before + " " + hit.source + " " + after;
  const prospective =
    inheritedProspective ||
    /(?<![\p{L}])(?:vill|ska|skall|tänker|tänkte|planerar|önskar|behöver|önskas|behövs)(?![\p{L}])|skulle\s+(?:gärna\s+)?vilja/iu.test(
      all,
    );
  const historical =
    !prospective &&
    tokenize(before + " " + hit.source + " " + localAfter).some((t) =>
      pastActions.has(t.word),
    );
  const hypothetical =
    /\b(?:om|ifall)\b[^.!?;]*\b(?:skulle|kunde|ville)\b/iu.test(all);
  const question =
    /\b(?:får|kan|måste|behöver)\s+(?:man|jag|vi)\b|\b(?:vad|vilka|vilket)\s+(?:krävs|regler|tillstånd)/iu.test(
      all,
    );
  const uncertain =
    hit.fuzzy ||
    negated ||
    historical ||
    hypothetical ||
    question ||
    isUncertain(all) ||
    (!action.test(all) &&
      !inheritedAction &&
      !prospective &&
      !intrinsicFailure);
  return {
    ...hit,
    hasAction: action.test(all) || prospective,
    polarity: negated ? "negative" : "positive",
    tense: historical ? "past" : prospective ? "prospective" : "present",
    modality: hypothetical
      ? "conditional"
      : question
        ? "question"
        : isUncertain(all)
          ? "possible"
          : "asserted",
    uncertain,
  };
}
function relevant(text, hit) {
  const c = context(text, hit.start),
    before = text.slice(c.start, hit.start),
    after = text.slice(hit.end, c.end);
  if (
    /(?:lokalen (?:är|används som)|nuvarande användning|tidigare var|blir|ska bli)\s+(?:en |ett )?$/iu.test(
      before,
    )
  )
    return false;
  // Existing locations and employers are context, not applications.
  if (
    /(?:jobbar|arbetar|bor)\s+(?:på|i|vid)\s+(?:en |ett |min |mitt )?$/iu.test(
      before,
    )
  )
    return false;
  if (
    /(?:har|äger|finns)\s+(?:redan\s+)?(?:en |ett |min |mitt )?$/iu.test(
      before,
    ) &&
    !/\b(?:vill|ska|behöver)\b/iu.test(before) &&
    !action.test(after)
  )
    return false;
  if (/education\.(?:preschool|school)\./u.test(hit.id)) {
    if (
      /(?:jobb|anställning|praktik|vikariat)\s+(?:på|i|vid)\s*(?:en |den )?$/iu.test(
        before,
      )
    )
      return false;
    const localBefore = before.split(/(?:och|samt|men|utan)\s+/iu).at(-1);
    if (
      /(?<![\p{L}])(?:öppna\w*|bygga|bygger|byggde|driva|driver|starta\w*|stänga|stänger|riva|river|renovera\w*|jobba\w*|arbeta\w*)(?![\p{L}])/iu.test(
        localBefore,
      ) &&
      !/\b(?:barn|son|dotter)\b/iu.test(localBefore)
    )
      return false;
    if (/\b(?:går|gick)\s+(?:redan\s+)?(?:på|i)\s*$/iu.test(before))
      return false;
  }
  return true;
}
export function detectSwedishIntent(input, scenarios) {
  const text = String(input).slice(0, 3000);
  // Private notes and labelled action details are never mined for new goals.
  const goalText = text.split(
    /(?:detaljer|åtgärd|beskrivning|egen anteckning)\s*:/iu,
  )[0];
  const tokens = tokenize(goalText),
    compiled = compile(scenarios),
    hits = [],
    scores = new Map();
  function score(token, part) {
    const key = token + "/" + part.word;
    if (scores.has(key)) return scores.get(key);
    let n = 0;
    if (part.forms.has(token)) n = 2;
    else if (part.forms.has(typoAliases[token])) n = 1;
    else if (
      token.length >= 4 &&
      part.word.length >= 4 &&
      !fillers.test(part.word) &&
      !action.test(part.word)
    ) {
      for (const form of part.forms)
        if (
          fold(token) === fold(form) ||
          (token.length >= 5 && oneEdit(token, form))
        ) {
          n = 1;
          break;
        }
    }
    scores.set(key, n);
    return n;
  }
  for (const s of compiled)
    for (const pattern of s.patterns)
      for (let start = 0; start < tokens.length; start++) {
        let j = start,
          fuzzy = false,
          matched = true;
        for (let k = 0; k < pattern.length; k++) {
          if (k) {
            if (pattern[k - 1].word === "byta" && tokens[j]?.word === "ut") j++;
            for (
              let skip = 0;
              skip < 4 &&
              tokens[j] &&
              !score(tokens[j].word, pattern[k]) &&
              fillers.test(tokens[j].word);
              skip++
            )
              j++;
          }
          if (!tokens[j]) {
            matched = false;
            break;
          }
          // A phrase cannot span punctuation, conjunctions or a new sentence.
          if (
            j > start &&
            !/^[\s\-–]*$/u.test(
              goalText.slice(tokens[j - 1].end, tokens[j].start),
            )
          ) {
            matched = false;
            break;
          }
          const n = score(tokens[j].word, pattern[k]);
          if (!n) {
            matched = false;
            break;
          }
          fuzzy ||= n === 1;
          j++;
        }
        if (matched) {
          const hit = {
            id: s.id,
            start: tokens[start].start,
            end: tokens[j - 1].end,
            source: goalText.slice(tokens[start].start, tokens[j - 1].end),
            fuzzy,
          };
          if (relevant(goalText, hit)) hits.push(grammar(goalText, hit));
        }
      }
  // Exact and longer matches win locally. A fuzzy interpretation must never
  // swallow an exact neighbouring service or resolve a spelling collision.
  let unique = hits.filter(
    (h) =>
      !hits.some(
        (x) =>
          x !== h &&
          x.start <= h.start &&
          x.end >= h.end &&
          ((!x.fuzzy && h.fuzzy) ||
            (x.fuzzy === h.fuzzy && x.end - x.start > h.end - h.start)),
      ),
  );
  unique = [
    ...new Map(unique.map((h) => [`${h.id}:${h.start}:${h.end}`, h])).values(),
  ].sort((a, b) => a.start - b.start);
  unique = unique.filter(
    (h) =>
      !h.fuzzy ||
      !unique.some(
        (x) => x.id !== h.id && x.start === h.start && x.end === h.end,
      ),
  );
  // A mentioned building used as the location of another action is background.
  unique = unique.filter(
    (h) =>
      !unique.some(
        (x) =>
          x.end <= h.start &&
          x.id !== h.id &&
          /^(?:\s*(?:i|på|vid|bakom|bredvid)\s+(?:den |det |min |mitt |vår |vårt )?)$/iu.test(
            goalText.slice(x.end, h.start),
          ),
      ),
  );
  const foodGoals = unique.filter(
    (h) =>
      /^(?:restaurant|food\.(?:cafe|foodtruck))\./u.test(h.id) &&
      h.polarity === "positive",
  );
  if (foodGoals.length)
    unique = unique.filter(
      (h) =>
        !/^publicspace\.outdoorseating\.|^building\.(?:ventilation|structure)\./u.test(
          h.id,
        ) ||
        (action.test(h.source) &&
          !foodGoals.some(
            (f) =>
              context(goalText, f.start).start ===
              context(goalText, h.start).start,
          )),
    );
  // "Nej, jag menar ..." and "... istället" are explicit corrections, not
  // additional applications. Ordinary commas are not correction boundaries.
  const correction = [
    ...goalText.matchAll(
      /\b(?:nej\s*,?\s*jag menar|förresten\s*,?\s*|jag menar|vi menar)\b/giu,
    ),
  ].at(-1);
  const mentions = unique;
  if (correction && unique.some((h) => h.start > correction.index))
    unique = unique.filter((h) => h.start > correction.index);
  if (/\b(?:istället|i stället)\s*[.!]?$/iu.test(goalText) && unique.length > 1)
    unique = unique.slice(-1);
  // A field label or repeated noun must not replace a clear request. An
  // explicit later correction/negation of the same goal can replace it.
  const byId = new Map();
  for (const h of unique) {
    const previous = byId.get(h.id);
    if (!previous || h.hasAction || (!previous.hasAction && !h.fuzzy))
      byId.set(h.id, h);
  }
  unique = [...byId.values()];
  if (unique.some((h) => h.polarity === "positive"))
    unique = unique.filter((h) => h.polarity === "positive");
  if (unique.some((h) => h.tense !== "past"))
    unique = unique.filter((h) => h.tense !== "past");
  const goals = [...new Map(unique.map((h) => [h.id, h])).values()];
  const alternative =
    goals.length > 1 && /\b(?:eller|antingen)\b/iu.test(goalText);
  if (alternative) for (const g of goals) g.uncertain = true;
  return {
    goals,
    mentions,
    goal: goals.length === 1 ? goals[0].id : null,
    relation:
      goals.length > 1 ? (alternative ? "alternative" : "multiple") : "single",
    corrections: goals
      .filter((g) => g.fuzzy)
      .map((g) => ({
        from: g.source,
        to: compiled.find((s) => s.id === g.id).title,
      })),
  };
}
