// Cache: the same first question is answered once by the model, then from the cache.
import assert from "node:assert/strict";
const store = new Map();
globalThis.caches = { default: {
  match: async (req) => { const r = store.get(req.url); return r ? r.clone() : undefined; },
  put: async (req, res) => { store.set(req.url, res.clone()); },
} };
const { onRequestPost, normQuestion } = await import("../functions/api/chat.js");
const sse = (t) => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("data: " + JSON.stringify({ response: t }) + "\n\n")); c.close(); } });
let calls = 0;
const env = { AI: { run: async () => { calls++; return sse("W 2026 roku na obronę zaplanowano 109,2 mld zł."); } } };
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
const ask = (question, history) => onRequestPost({ request: new Request("https://budzetpolski.com/api/chat", {
  method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "9.9.9.9" }, body: JSON.stringify({ question, history }) }), env, ctx });

let r = await ask("Ile Polska wydaje na obronę?");
assert.equal(r.headers.get("x-chat-cache"), "miss"); assert.match(await r.text(), /109,2/);
await Promise.all(waits);
r = await ask("ile polska wydaje na obronę");            // same question, other spelling
assert.equal(r.headers.get("x-chat-cache"), "hit"); assert.match(await r.text(), /109,2/);
assert.equal(calls, 1);
r = await ask("A na zdrowie?", [{ role: "user", content: "Ile na obronę?" }, { role: "assistant", content: "..." }]);
assert.equal(r.headers.get("x-chat-cache"), "miss"); // follow-ups never use the cache
assert.equal(normQuestion("Ile Polska wydaje na OBRONĘ?!"), "ile polska wydaje na obrone");
// a year with no data is answered by the server even if the cache holds an older answer
for (const [url, res] of store) if (url.includes("ile%20polska")) store.set(url.replace(/ile%20polska[^/]*$/, "jaki%20byl%20budzet%20w%202005"), new Response("stara odpowiedz modelu"));
r = await ask("Jaki był budżet w 2005?");
assert.equal(r.headers.get("x-chat-model"), "server"); assert.match(await r.text(), /^Nie mam danych za 2005 rok/);
console.log("ok   cache: repeat question served from cache, follow-ups not cached, server reply beats cache");
