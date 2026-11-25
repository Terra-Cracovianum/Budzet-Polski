// Social share images (Open Graph / X / Messenger / WhatsApp), 1200×630 @2x.
// Built from the site's own data, so they stay true when the budget changes.
//
//   node og/render.mjs            -> og/og-home.jpg, og/og-2027.jpg
//
// Needs Playwright with Chromium (npx playwright install chromium) and
// internet access for Google Fonts (Inter, Instrument Serif, IBM Plex Mono).

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => JSON.parse(readFileSync(path.join(ROOT, f), "utf8"));

// Same groups and colours as the spending map on the site (app.js colorKey / style.css).
const COLORS = {
  social: "#4A6382", transfer: "#77706A", defense: "#5F7146", debt: "#A8573F", health: "#A1606A",
  edu: "#725F88", admin: "#477470", infra: "#8E6B1C", other: "#78736A",
};
function colorKey(name) {
  const n = name.toLowerCase();
  if (/ubezpiecz|emeryt|rodzin|pomoc spo|polityki spo|zabezpiecz/.test(n)) return "social";
  if (/różne rozlicz|rozliczenia|subwen/.test(n)) return "transfer";
  if (/obron|wojsk/.test(n)) return "defense";
  if (/dług|obsługa dłu/.test(n)) return "debt";
  if (/zdrow/.test(n)) return "health";
  if (/oświat|szkoln|nauk|eduk|wychowani/.test(n)) return "edu";
  if (/administ|urzęd|wymiar spr|sądown|bezpiecz|sprawiedliw|skarb/.test(n)) return "admin";
  if (/transport|łączn|infrastr|drog|kolej|gospodar|budownict|mieszkani|środowisk/.test(n)) return "infra";
  return "other";
}
// The app's own short names (app.js SHORT), so the image says exactly what the site says.
const SHORT = {
  "753": "Ubezpieczenia społeczne", "758": "Różne rozliczenia", "752": "Obrona narodowa", "757": "Obsługa długu",
  "855": "Rodzina", "851": "Ochrona zdrowia", "730": "Szkolnictwo wyższe i nauka", "754": "Bezpieczeństwo publiczne",
  "750": "Administracja publiczna", "751": "Urzędy naczelne i sądy", "755": "Wymiar sprawiedliwości", "600": "Transport i łączność",
  "010": "Rolnictwo", "700": "Gospodarka mieszkaniowa", "852": "Pomoc społeczna", "801": "Oświata i wychowanie", "921": "Kultura",
};
const pl = (v, d = 1) => v.toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ /g, " ");

// Squarified treemap (Bruls et al.): tiles as close to squares as possible.
function squarify(items, x, y, w, h) {
  const total = items.reduce((s, d) => s + d.v, 0);
  const scale = (w * h) / total;
  const nodes = items.map((d) => ({ ...d, a: d.v * scale }));
  const out = [];
  let row = [], rect = { x, y, w, h };
  const worst = (r, side) => {
    const s = r.reduce((t, d) => t + d.a, 0), mx = Math.max(...r.map((d) => d.a)), mn = Math.min(...r.map((d) => d.a));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const layout = (r) => {
    const s = r.reduce((t, d) => t + d.a, 0);
    if (rect.w >= rect.h) {
      const cw = s / rect.h; let cy = rect.y;
      for (const d of r) { const hh = d.a / cw; out.push({ ...d, x: rect.x, y: cy, w: cw, h: hh }); cy += hh; }
      rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
    } else {
      const ch = s / rect.w; let cx = rect.x;
      for (const d of r) { const ww = d.a / ch; out.push({ ...d, x: cx, y: rect.y, w: ww, h: ch }); cx += ww; }
      rect = { x: rect.x, y: rect.y + ch, w: rect.w, h: rect.h - ch };
    }
  };
  for (const n of nodes) {
    const side = Math.min(rect.w, rect.h);
    if (!row.length || worst([...row, n], side) <= worst(row, side)) row.push(n);
    else { layout(row); row = [n]; }
  }
  if (row.length) layout(row);
  return out;
}

function tiles(dzialy, W, H) {
  const sorted = dzialy.slice().sort((a, b) => b.v - a.v);
  const top = sorted.slice(0, 11);
  const rest = sorted.slice(11).reduce((s, d) => s + d.v, 0);
  const items = [...top, { name: "Pozostałe", v: rest, other: true }];
  const GAP = 6;
  return squarify(items, 0, 0, W, H).map((t) => {
    const big = t.w > 170 && t.h > 110, mid = t.w > 110 && t.h > 64;
    const label = SHORT[t.code] || t.name;
    return `<div class="tile ${big ? "big" : mid ? "mid" : ""}" style="left:${t.x + GAP / 2}px;top:${t.y + GAP / 2}px;width:${t.w - GAP}px;height:${t.h - GAP}px;background:${t.other ? COLORS.other : COLORS[colorKey(t.name)]}">
      ${mid ? `<span class="t-name">${label}</span><span class="t-val">${pl(t.v)}${big ? "<small> mld zł</small>" : ""}</span>` : ""}
    </div>`;
  }).join("");
}

function page({ eyebrow, amount, unit, question, sub, chips, tileHtml, mapLabel }) {
  const logo = readFileSync(path.join(ROOT, "logo.svg"), "utf8");
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=block" rel="stylesheet">
<style>
  @property --a { syntax: "<angle>"; inherits: false; initial-value: 0deg; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    position: relative; overflow: hidden; color: #F5F1EA; font-family: Inter, sans-serif;
    background:
      radial-gradient(900px 520px at 8% 110%, rgba(201,154,107,.20), transparent 60%),
      radial-gradient(700px 500px at 100% -10%, rgba(74,99,130,.22), transparent 60%),
      #0D0C0B;
  }
  /* paper grain, like the site */
  body::after { content: ""; position: absolute; inset: 0; opacity: .045; pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.9'/%3E%3C/svg%3E"); }
  .left { position: absolute; left: 64px; top: 56px; bottom: 52px; width: 520px; display: flex; flex-direction: column; }
  .logo { height: 40px; width: auto; filter: invert(1); opacity: .92; }
  .logo svg { height: 40px; width: auto; }
  .eyebrow { margin-top: 46px; font: 500 15px/1 "IBM Plex Mono", monospace; letter-spacing: .08em; text-transform: uppercase; color: #C9A27E; display: flex; align-items: center; gap: 10px; }
  .eyebrow i { width: 8px; height: 8px; border-radius: 50%; background: #C9A27E; box-shadow: 0 0 0 5px rgba(201,162,126,.18); }
  .amount { margin-top: 18px; font-weight: 600; font-size: 148px; line-height: .9; letter-spacing: -.06em; white-space: nowrap; }
  .amount small { font-size: 46px; font-weight: 500; letter-spacing: -.03em; color: #A8A29A; margin-left: 12px; }
  .q { margin-top: 22px; font: italic 400 44px/1.08 "Instrument Serif", serif; letter-spacing: -.01em; color: #EFE6DA; }
  .sub { margin-top: 12px; font-size: 19px; line-height: 1.4; color: #A8A29A; letter-spacing: -.01em; max-width: 460px; }
  .foot { margin-top: auto; display: flex; align-items: center; gap: 14px; }
  .domain { font-weight: 600; font-size: 22px; letter-spacing: -.02em; }
  .pill { position: relative; display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px 10px 14px; border-radius: 999px; background: #171513; font-size: 16px; font-weight: 500; color: #EFE6DA; }
  .pill::before { content: ""; position: absolute; inset: -2px; z-index: -1; border-radius: inherit; background: conic-gradient(from 200deg, #C99A6B, #8A5A3B, #5F7146, #4A6382, #A1606A, #C99A6B); }
  .pill .orb { width: 12px; height: 12px; border-radius: 50%; background: conic-gradient(from 90deg, #C99A6B, #5F7146, #4A6382, #A1606A, #C99A6B); }
  .chips { display: flex; gap: 8px; margin-top: 18px; }
  .chip { font: 500 13px/1 "IBM Plex Mono", monospace; letter-spacing: .04em; color: #CFC6BA; padding: 8px 11px; border-radius: 999px; background: rgba(255,255,255,.06); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
  .map { position: absolute; right: 48px; top: 48px; width: 532px; height: 534px; }
  .map-k { position: absolute; right: 52px; top: 22px; font: 500 12px/1 "IBM Plex Mono", monospace; letter-spacing: .08em; text-transform: uppercase; color: #8F877D; }
  .tile { position: absolute; border-radius: 14px; padding: 12px 13px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.14), inset 0 0 0 1px rgba(255,255,255,.05); }
  .tile::after { content: ""; position: absolute; inset: 0; background: linear-gradient(160deg, rgba(255,255,255,.10), transparent 45%, rgba(0,0,0,.18)); }
  .t-name { position: relative; z-index: 1; font-size: 13px; font-weight: 600; line-height: 1.15; color: rgba(255,255,255,.92); letter-spacing: -.01em; }
  .t-val { position: relative; z-index: 1; font-size: 20px; font-weight: 600; letter-spacing: -.03em; color: #fff; }
  .big .t-name { font-size: 16px; }
  .big .t-val { font-size: 40px; letter-spacing: -.045em; }
  .big .t-val small { font-size: 15px; font-weight: 500; opacity: .75; letter-spacing: 0; }
</style></head><body>
  <div class="left">
    <div class="logo">${logo}</div>
    <div class="eyebrow"><i></i>${eyebrow}</div>
    <div class="amount">${amount}<small>${unit}</small></div>
    <div class="q">${question}</div>
    <div class="sub">${sub}</div>
    <div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join("")}</div>
    <div class="foot"><span class="domain">budzetpolski.com</span><span class="pill"><span class="orb"></span>Zapytaj asystenta AI</span></div>
  </div>
  <div class="map-k">${mapLabel}</div>
  <div class="map">${tileHtml}</div>
</body></html>`;
}

const b26 = read("budget-data.json");
const p27 = read("budzet-2027.json");
const MAP_W = 532, MAP_H = 534;

const variants = [
  {
    file: "og-home.jpg",
    eyebrow: `Budżet państwa ${b26.meta.rok} · plan z ustawy`,
    amount: pl(b26.meta.wydatki / 1e6), unit: "mld zł",
    question: "Na co idą Twoje pieniądze?",
    sub: "Każdy złoty budżetu państwa, od 2011 roku do projektu na 2027. Prosto z ustaw i sprawozdań Ministerstwa Finansów.",
    chips: ["2011–2027", "Mapa wydatków", "Wykonanie na żywo"],
    mapLabel: `Wydatki ${b26.meta.rok} wg działów · mld zł`,
    tileHtml: tiles(b26.dzialy.map((d) => ({ code: d.code, name: d.name, v: d.plan / 1e6 })), MAP_W, MAP_H),
  },
  {
    file: "og-2027.jpg",
    eyebrow: `Budżet ${p27.meta.rok} · ${p27.meta.etap_krotko}`,
    amount: pl(p27.ustawa.art.wydatki), unit: "mld zł",
    question: "Historia jednej ustawy.",
    sub: `Deficyt ${pl(p27.ustawa.art.deficyt)} mld zł. Skąd pieniądze, dokąd płyną i jak projekt idzie przez Sejm, krok po kroku.`,
    chips: [`Druk nr ${p27.meta.druk_sejmowy}`, "Sejm · Senat", "Krok po kroku"],
    mapLabel: `Wydatki ${p27.meta.rok} wg działów · mld zł`,
    tileHtml: tiles(p27.ustawa.dzialy.map((d) => ({ code: d.code, name: d.name, v: d.v })), MAP_W, MAP_H),
  },
];

const browser = await chromium.launch();
const pg = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
for (const v of variants) {
  await pg.setContent(page(v), { waitUntil: "networkidle" });
  await pg.evaluate(() => document.fonts.ready);
  await pg.screenshot({ path: path.join(ROOT, "og", v.file), type: "jpeg", quality: 90 });
  console.log("og/" + v.file);
}
await browser.close();
