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
