import { retrieve, onRequestPost, onRequestGet } from "../functions/api/chat.js";
import assert from "node:assert/strict";

const cases = [
  ["Ile wydajemy na obronę?", /2026, dział 752/],
  ["Ile Polska wydała na wojsko w 2019?", /2019, dział 752/],
  ["Jaki był deficyt w 2020 roku?", /Budżet państwa 2020/],
  ["Ile wpływa z VAT w 2025?", /Dochody 2025, VAT/],
  ["Jak zmieniały się wydatki na zdrowie?", /dział 851/],
  ["Ile wynosi budżet na przyszły rok?", /Projekt budżetu na 2027/],
  ["Jaki jest rating Polski?", /Rating Polski/],
  ["Ile kosztują odsetki od długu w 2024?", /2024, dział 757/],
  ["Ile idzie na szkoły w 2023?", /2023, dział 801/],
  ["Jak zmieni się PIT?", /Skala PIT/],
];
let fail = 0;
for (const [q, re] of cases) {
  const { years, facts } = retrieve(q);
  const ok = facts.some((f) => re.test(f));
  if (!ok) fail++;
  console.log(ok ? "ok  " : "FAIL", q, "| years:", years.join(","), "| facts:", facts.length, ok ? "" : "\n     " + facts.slice(0, 4).join("\n     "));
}
// follow-up question takes the year from history
const fu = retrieve("A na zdrowie?", [{ role: "user", content: "Ile na obronę w 2018?" }]);
console.log(fu.years[0] === 2018 && fu.facts.some((f) => /2018, dział 851/.test(f)) ? "ok   follow-up keeps year" : (fail++, "FAIL follow-up"));

// Endpoint with a fake model that echoes what it received
let seen;
const env = { AI: { run: async (model, input) => { seen = { model, input }; return { response: "Odpowiedź testowa." }; } } };
const req = (body, origin = "https://budzet.example") => new Request("https://budzet.example/api/chat", {
  method: "POST", headers: { "content-type": "application/json", origin, "cf-connecting-ip": "1.2.3.4" }, body: JSON.stringify(body) });
let r = await onRequestPost({ request: req({ question: "Ile na obronę w 2026?" }), env });
assert.equal(r.status, 200); assert.equal((await r.json()).answer, "Odpowiedź testowa.");
assert.match(seen.input.messages[0].content, /dział 752 Obrona narodowa: plan 109,2 mld zł/);
r = await onRequestPost({ request: req({ question: "x" }, "https://evil.example"), env });
assert.equal(r.status, 403);
r = await onRequestPost({ request: req({ question: "" }), env });
assert.equal(r.status, 400);
assert.deepEqual(await (await onRequestGet({ env: {} })).json(), { ok: false });
console.log("ok   endpoint checks");
console.log("system prompt chars:", seen.input.messages[0].content.length);
process.exit(fail ? 1 : 0);
