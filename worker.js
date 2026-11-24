// Cloudflare Worker entry. Static files are served from the repo root
// (see [assets] in wrangler.toml); only /api/* runs code.
import * as chat from "./functions/api/chat.js";
import * as feedback from "./functions/api/feedback.js";
import data from "./chat-data.json" with { type: "json" };

const MAIN_HOST = "budzetpolski.com";
// Old addresses that should send visitors (and Google) to the main domain.
// Preview addresses (*-budzet-polski.….workers.dev) are left alone.
const REDIRECT_HOSTS = new Set(["www.budzetpolski.com", "budzet-polski.terra-cracovianum.workers.dev"]);

const APP_PATH = /^\/(?:20\d\d\/?)?(?:(?:mapa|przeplyw|rodzaje|trendy|podatki|wykonanie)\/?)?(?:\d{3}\/?)?$/;

// ---------- SEO for app addresses ----------
// /mapa, /2024/wykonanie… all load index.html. Without this, search engines see
// the home page's title and canonical "/" on every one of them and may treat
// them as copies. The page fixes the title in the browser, but crawlers should
// get it in the HTML itself.
const SITE = "https://" + MAIN_HOST;
const LATEST = data.current;
const DZ_NAMES = {};
for (const f of data.facts) if (f.l && /\/mapa\/\d{3}$/.test(f.l[0]) && f.y === LATEST) DZ_NAMES[f.l[0].slice(-3)] = f.l[1].split(" · ")[0];

const VIEW_META = {
  "": (y) => [`Budżet Polski ${y}: na co państwo wydaje pieniądze`, `Interaktywny budżet państwa ${y}: wydatki, dochody i deficyt z ustawy budżetowej i sprawozdań Ministerstwa Finansów, w prostym widoku dla każdego.`],
  mapa: (y) => [`Mapa wydatków budżetu państwa ${y}`, `Na co idą pieniądze w ${y} r.? Wszystkie działy i części budżetu państwa na jednej mapie, z kwotami, udziałami i kwotą na osobę.`],
  przeplyw: (y) => [`Przepływ budżetu ${y}: skąd pieniądze i dokąd płyną`, `Dochody budżetu państwa w ${y} r. (VAT, akcyza, CIT, PIT) i wydatki na jednym wykresie przepływu.`],
  rodzaje: (y) => [`Rodzaje wydatków budżetu ${y}`, `Wydatki budżetu państwa w ${y} r. według rodzaju: dotacje i subwencje, świadczenia, inwestycje, obsługa długu.`],
  trendy: () => [`Trendy wydatków budżetu państwa 2011–${LATEST}`, `Jak zmieniały się wydatki państwa na obronę, zdrowie, emerytury i inne obszary od 2011 r., także w cenach stałych.`],
  podatki: () => [`Na co idą Twoje podatki? Kalkulator`, `Wpisz swoje zarobki i zobacz, ile z Twoich podatków idzie na emerytury, obronę, zdrowie, szkoły i dług publiczny.`],
  wykonanie: (y) => [`Wykonanie budżetu ${y}: plan i faktyczne wydatki`, `Ile z planu budżetu państwa na ${y} r. faktycznie wydano i zebrano: wydatki, dochody, deficyt i działy.`],
};

export function appMeta(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  let year = LATEST, view = "", dz = null;
  for (const p of parts) {
    if (/^20\d\d$/.test(p)) year = +p;
    else if (/^\d{3}$/.test(p)) dz = p;
    else view = p;
  }
  if (dz && !view) view = "mapa";
  const make = VIEW_META[view] || VIEW_META[""];
  let [title, desc] = make(year);
  if (dz && DZ_NAMES[dz]) {
    title = `${DZ_NAMES[dz]} ${year}: wydatki budżetu państwa`;
    desc = `Dział ${dz} „${DZ_NAMES[dz]}” w budżecie państwa na ${year} r.: kwota, udział w budżecie, kto wydaje te pieniądze i jak zmieniały się wydatki od 2011 r.`;
  }
  // canonical: same rule as the app (no year for the newest one; dział sheet -> its view)
  // Trendy shows every year at once: one canonical address for all of them
  const canon = "/" + [year !== LATEST && view !== "trendy" ? year : null, view || null].filter(Boolean).join("/");
  return { title: title + " | Budżet Polski", desc, canon: canon === "/" ? "/" : canon };
}

function withMeta(res, m) {
  if (typeof HTMLRewriter === "undefined") return res;
  const set = (attr, val) => ({ element(el) { el.setAttribute(attr, val); } });
  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(m.title); } })
    .on('meta[name="description"]', set("content", m.desc))
    .on('meta[property="og:title"]', set("content", m.title))
    .on('meta[property="og:description"]', set("content", m.desc))
    .on('link[rel="canonical"]', set("href", SITE + m.canon))
    .on('meta[property="og:url"]', set("content", SITE + m.canon))
    .transform(res);
}

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
      if (APP_PATH.test(url.pathname)) {
        const res = await env.ASSETS.fetch(new Request(new URL("/", url), request));
        return withMeta(res, appMeta(url.pathname));
      }
      return env.ASSETS.fetch(request);
    }
    const handler = request.method === "GET" ? mod.onRequestGet : request.method === "POST" ? mod.onRequestPost : null;
    if (!handler) return new Response("Method not allowed", { status: 405 });
    return handler({ request, env, ctx });
  },
};
