// Rate limits: Cloudflare bindings (6 per 10 s, 30 per minute) and the in-memory backstop.
import assert from "node:assert/strict";
import { onRequestPost, rateLimit } from "../functions/api/chat.js";

// fake Cloudflare rate limiter: allows `max` calls per key
const limiter = (max) => { const n = new Map(); return { limit: async ({ key }) => { n.set(key, (n.get(key) || 0) + 1); return { success: n.get(key) <= max }; } }; };
const sse = () => new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: {"response":"ok, odpowiedź testowa"}\n\n')); c.close(); } });
let modelCalls = 0;
const env = { CHAT_BURST: limiter(6), CHAT_MINUTE: limiter(30), AI: { run: async () => { modelCalls++; return sse(); } } };
const ask = (ip, q = "Ile na obronę?") => onRequestPost({ request: new Request("https://budzetpolski.com/api/chat", {
  method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify({ question: q + " " + Math.random(), history: [{ role: "user", content: "x" }] }) }), env, ctx: {} });

// a visitor firing 10 questions in a row: 6 answered, then 429 with Retry-After 10
const statuses = [];
for (let i = 0; i < 10; i++) { const r = await ask("1.1.1.1"); statuses.push(r.status); if (r.status === 429) { assert.equal(r.headers.get("retry-after"), "10"); assert.match((await r.json()).error, /Zwolnij/); } else await r.text(); }
assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429, 429, 429, 429]);
assert.equal(modelCalls, 6); // blocked questions never reach the model
// another visitor is not affected
assert.equal((await ask("2.2.2.2")).status, 200);
// minute limit: burst passes but the minute counter is used up
const env2 = { CHAT_BURST: limiter(1000), CHAT_MINUTE: limiter(2) };
assert.equal(await rateLimit(env2, "3.3.3.3"), 0); assert.equal(await rateLimit(env2, "3.3.3.3"), 0); assert.equal(await rateLimit(env2, "3.3.3.3"), 60);
// a broken limiter never blocks visitors
assert.equal(await rateLimit({ CHAT_BURST: { limit: async () => { throw new Error("down"); } } }, "4.4.4.4"), 0);
// no bindings (local dev): the in-memory backstop still stops a flood
let blocked = 0;
for (let i = 0; i < 130; i++) if (await rateLimit({}, "5.5.5.5")) blocked++;
assert.equal(blocked, 10);
console.log("ok   rate limits: burst 6/10 s, 30/min, backstop, other visitors unaffected");
