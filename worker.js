// Cloudflare Worker entry. Static files are served from the repo root
// (see [assets] in wrangler.toml); only /api/* runs code.
import * as chat from "./functions/api/chat.js";
import * as feedback from "./functions/api/feedback.js";

const routes = { "/api/chat": chat, "/api/feedback": feedback };

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const mod = routes[pathname];
    if (!mod) return env.ASSETS.fetch(request);
    const handler = request.method === "GET" ? mod.onRequestGet : request.method === "POST" ? mod.onRequestPost : null;
    if (!handler) return new Response("Method not allowed", { status: 405 });
    return handler({ request, env, ctx });
  },
};
