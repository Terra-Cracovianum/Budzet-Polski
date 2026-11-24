import worker from "../worker.js";
import assert from "node:assert/strict";
const env = { ASSETS: { fetch: async () => new Response("asset") } };
const go = (u, m = "GET") => worker.fetch(new Request(u, { method: m }), env, {});
for (const [u, loc] of [
  ["https://www.budzetpolski.com/budzet-2027?x=1", "https://budzetpolski.com/budzet-2027?x=1"],
  ["https://budzet-polski.terra-cracovianum.workers.dev/", "https://budzetpolski.com/"],
]) { const r = await go(u); assert.equal(r.status, 301); assert.equal(r.headers.get("location"), loc); }
assert.equal(await (await go("https://budzetpolski.com/")).text(), "asset");
assert.equal(await (await go("https://abc123-budzet-polski.terra-cracovianum.workers.dev/")).text(), "asset");
assert.equal((await go("https://budzetpolski.com/api/chat")).status, 200);
console.log("ok   redirects: www + old workers.dev -> budzetpolski.com; previews untouched");
// pretty addresses load the main page
const seen = [];
const env2 = { ASSETS: { fetch: async (r) => { seen.push(new URL(r.url).pathname); return new Response("asset"); } } };
for (const p of ["/mapa", "/2024", "/2024/mapa", "/2024/mapa/752", "/2026/752", "/trendy/"]) {
  await worker.fetch(new Request("https://budzetpolski.com" + p), env2, {});
}
await worker.fetch(new Request("https://budzetpolski.com/nie-ma-takiej"), env2, {});
assert.deepEqual(seen, ["/", "/", "/", "/", "/", "/", "/nie-ma-takiej"]);
console.log("ok   pretty addresses -> main page; unknown paths untouched");
