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

// Endpoint with a fake model that streams like Workers AI (server-sent events)
const sse = (parts) => new ReadableStream({ start(c) {
  const e = new TextEncoder();
  for (const p of parts) c.enqueue(e.encode("data: " + JSON.stringify({ response: p }) + "\n\n"));
  c.enqueue(e.encode("data: [DONE]\n\n")); c.close();
} });
let seen, tried = [];
const env = { AI: { run: async (model, input) => { tried.push(model); seen = { model, input }; return sse(["Odpo", "wiedź ", "testowa."]); } } };
const req = (body, origin = "https://budzet.example") => new Request("https://budzet.example/api/chat", {
  method: "POST", headers: { "content-type": "application/json", origin, "cf-connecting-ip": "1.2.3.4" }, body: JSON.stringify(body) });
let r = await onRequestPost({ request: req({ question: "Ile na obronę w 2026?" }), env });
assert.equal(r.status, 200); assert.equal(await r.text(), "Odpowiedź testowa.");
assert.equal(r.headers.get("x-chat-model"), "@cf/mistralai/mistral-small-3.1-24b-instruct");
assert.equal(seen.input.stream, true);
assert.match(seen.input.messages[0].content, /dział 752 Obrona narodowa: plan 109,2 mld zł/);
// primary model fails -> fallback answers
tried = [];
const envFail = { AI: { run: async (model) => { tried.push(model); if (model.includes("mistral")) throw new Error("no such model"); return sse(["ok"]); } } };
r = await onRequestPost({ request: req({ question: "Deficyt 2020?" }), env: envFail });
assert.equal(await r.text(), "ok"); assert.equal(r.headers.get("x-chat-model"), "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
// both fail -> JSON error
r = await onRequestPost({ request: req({ question: "Deficyt 2021?" }), env: { AI: { run: async () => { throw new Error("down"); } } } });
assert.equal(r.status, 502); assert.match((await r.json()).error, /niedostępny/);
r = await onRequestPost({ request: req({ question: "x" }, "https://evil.example"), env });
assert.equal(r.status, 403);
r = await onRequestPost({ request: req({ question: "" }), env });
assert.equal(r.status, 400);
assert.deepEqual(await (await onRequestGet({ env: {} })).json(), { ok: false });
console.log("ok   endpoint: streaming, fallback model, errors");
console.log("system prompt chars:", seen.input.messages[0].content.length);
process.exit(fail ? 1 : 0);
