// Cloudflare Worker entry. Static files are served from the repo root
// (see [assets] in wrangler.toml); only /api/* runs code.
import * as chat from "./functions/api/chat.js";
import * as feedback from "./functions/api/feedback.js";

const MAIN_HOST = "budzetpolski.com";
// Old addresses that should send visitors (and Google) to the main domain.
// Preview addresses (*-budzet-polski.….workers.dev) are left alone.
const REDIRECT_HOSTS = new Set(["www.budzetpolski.com", "budzet-polski.terra-cracovianum.workers.dev"]);

const APP_PATH = /^\/(?:20\d\d\/?)?(?:(?:mapa|przeplyw|rodzaje|trendy|podatki|wykonanie)\/?)?(?:\d{3}\/?)?$/;

const routes = { "/api/chat": chat, "/api/feedback": feedback };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (REDIRECT_HOSTS.has(url.hostname) && (request.method === "GET" || request.method === "HEAD")) {
      url.hostname = MAIN_HOST;
      url.protocol = "https:";
      url.port = "";
      return Response.redirect(url.toString(), 301);
    }
    const mod = routes[url.pathname];
    if (!mod) {
      // Pretty app addresses (/mapa, /2024, /2024/mapa/752) all load the main page;
      // the page reads the address itself. Real files are served before this runs.
      if (APP_PATH.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL("/", url), request));
      return env.ASSETS.fetch(request);
    }
    const handler = request.method === "GET" ? mod.onRequestGet : request.method === "POST" ? mod.onRequestPost : null;
    if (!handler) return new Response("Method not allowed", { status: 405 });
    return handler({ request, env, ctx });
  },
};
