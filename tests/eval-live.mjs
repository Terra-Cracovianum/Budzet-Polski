// Test set for the LIVE budget assistant. Asks real questions and checks the answers.
//
// Run on your computer (Node 18+):
//   node tests/eval-live.mjs
//   node tests/eval-live.mjs https://budzetpolski.com        (other address)
//
// For each question it checks that the answer contains the right number(s)
// from the site's data (or politely refuses an off-topic question), and it
// measures speed: time to the first word and to the full answer.
// Expected numbers come from chat-data.json (built from the budget files).
// Run it before and after changing the model to compare them fairly.

const BASE = (process.argv[2] || "https://budzetpolski.com").replace(/\/$/, "");

// any: at least one of these must be in the answer. all: every one must be.
// refuse: the bot should decline (off-topic). nodata: it should say the site
// has no such data. link: the "Zobacz na stronie" button must lead here.
// h: earlier messages (a follow-up question). Numbers use the Polish comma.
const CASES = [
  { q: "Ile Polska wydaje na obronę w 2026?", any: ["109,2"], link: "/2026/mapa/752" },
  { q: "Ile wydano na zbrojenie w 2018?", any: ["33,3", "34,8"], link: "/2018/mapa/752" },
  { q: "Ile wydano na wojsko w 2019 roku?", any: ["35,7", "36,5"] },
  { q: "Ile szło na zdrowie w 2015?", any: ["6,9", "7,3"] },
  { q: "Ile wynosi plan wydatków na ochronę zdrowia w 2026?", any: ["54,2"] },
  { q: "Ile kosztowała obsługa długu w 2024?", any: ["66,5", "65,8"] },
  { q: "Ile idzie na emerytury i ubezpieczenia społeczne w 2026?", any: ["196,0", "196"] },
  { q: "Ile wydano na rodzinę w 2022?", any: ["62,3", "63,1"] },
  { q: "Ile na szkoły w 2023?", any: ["3,0", "5,9"] },
  { q: "Jaki jest deficyt w 2026?", any: ["271,7"] },
  { q: "Jaki był deficyt w 2020?", all: ["85,0"] },
  { q: "Jaki był realny deficyt w 2021 roku?", all: ["26,4"] },
  { q: "Jaki był deficyt w 2011?", any: ["40,2", "25,1"] },
  { q: "Ile wyniosły wydatki budżetu w 2017?", any: ["384,8", "375,8"] },
  { q: "Ile państwo wydało w 2025?", any: ["870,2"] },
  { q: "Ile wpłynęło z VAT w 2025?", any: ["321,6"], link: "/2025/przeplyw" },
  { q: "Ile zaplanowano z CIT w 2018?", any: ["32,4"] },
  { q: "Ile już wydano w 2026?", any: ["696,9"] },
  { q: "Ile wynosi budżet na 2027?", all: ["977,6"] },
  { q: "Jaki deficyt zakłada projekt budżetu na 2027?", all: ["281,2"] },
  { q: "Ile na obronę w projekcie na 2027?", all: ["115,7"] },
  { q: "Ile kosztuje 800 plus w 2027?", all: ["60,8"], link: "/budzet-2027" },
  { q: "Jaki jest rating Polski?", any: ["A−", "A-", "A3"] },
  { q: "Ile wynosi dług publiczny w relacji do PKB?", any: ["53,8", "55,09", "55,1"] },
  // maths done by the server
  { q: "Ile na obronę na osobę w 2026?", any: ["2926", "2 926"] },
  { q: "O ile wzrosły wydatki na zdrowie od 2015?", any: ["683,3", "47,3"], link: "/trendy" },
  { q: "Ile wynosiły wydatki budżetu w 2011 w cenach z 2026?", any: ["524,2", "506,4"] }, // plan or execution
  { q: "O ile więcej na obronę w projekcie na 2027 niż w 2026?", any: ["6,5", "5,9"] },
  // follow-up questions
  { q: "A w 2019?", h: [["Ile na obronę w 2026?", "W 2026 r. na obronę zaplanowano 109,2 mld zł."]], any: ["36,5", "35,7"] },
  { q: "a na zdrowie?", h: [["Ile na obronę w 2018?", "W 2018 r. na obronę zaplanowano 33,3 mld zł."]], any: ["7,3", "10,6"], link: "/2018/mapa/851" },
  // not in the site's data
  { q: "Ile wydaje Kraków na drogi?", nodata: true, link: "" },
  { q: "Jaki był budżet w 2005?", nodata: true, link: "" },
  { q: "Kto wygra wybory?", refuse: true },
  { q: "Napisz mi wiersz o kotach", refuse: true },
  { q: "Jaka jest stolica Francji?", refuse: true },
];

const REFUSAL = /tylko|wyłącznie|budżet/i;          // the decline mentions it only helps with the budget
const NODATA = /nie (mam|ma |posiadam|obejmuje|zawiera|znajd)|brak|nie są dostępne|niedostępn|tylko (za lata|budżet państwa)/i;
const NUMBER = /\d+,\d+\s*(mld|mln)/;               // a refusal should not contain budget amounts

async function ask(q, h = []) {
  const t0 = performance.now();
  const res = await fetch(BASE + "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ question: q, history: h.flatMap(([u, a]) => [{ role: "user", content: u }, { role: "assistant", content: a }]) }),
  });
  const model = res.headers.get("x-chat-model") || "?";
  let link = "";
  try { const lh = res.headers.get("x-chat-link"); if (lh) link = JSON.parse(decodeURIComponent(lh)).href; } catch {}
  const cache = res.headers.get("x-chat-cache") || "?";
  if (!res.ok || (res.headers.get("content-type") || "").includes("json")) {
    const j = await res.json().catch(() => ({}));
    return { error: `${res.status} ${j.error || ""}`, model, cache };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "", first = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (first === null) first = performance.now() - t0;
    text += dec.decode(value, { stream: true });
  }
  return { text: text.trim(), first, total: performance.now() - t0, model, cache, link };
}

function judge(c, r) {
  if (r.error) return [false, r.error];
  if (c.link !== undefined && r.link !== c.link) return [false, `przycisk: ${r.link || "(brak)"} zamiast ${c.link || "(brak)"}`];
  const t = r.text;
  if (c.nodata) return NODATA.test(t) ? [true, "brak danych"] : [false, "nie powiedział, że brak danych"];
  if (c.refuse) return REFUSAL.test(t) && !NUMBER.test(t) ? [true, "odmówił"] : [false, "nie odmówił"];
  if (c.all) { const miss = c.all.filter((n) => !t.includes(n)); return miss.length ? [false, "brak " + miss.join(", ")] : [true, c.all.join(", ")]; }
  const hit = c.any.find((n) => t.includes(n));
  return hit ? [true, hit] : [false, "brak " + c.any.join(" / ")];
}

const s = (ms) => (ms == null ? "  -  " : (ms / 1000).toFixed(1) + "s");
console.log(`Test asystenta: ${BASE}\n`);
let ok = 0, firsts = [], totals = [], models = new Set();
for (const [i, c] of CASES.entries()) {
  let r;
  try { r = await ask(c.q, c.h); } catch (e) { r = { error: e.message }; }
  const [pass, why] = judge(c, r);
  if (pass) ok++;
  if (r.first != null && r.cache !== "hit") { firsts.push(r.first); totals.push(r.total); }
  if (r.model) models.add(r.model);
  console.log(`${pass ? "✅" : "❌"} ${String(i + 1).padStart(2)}. ${c.q.padEnd(58)} ${s(r.first)} / ${s(r.total)}${r.cache === "hit" ? " (cache)" : ""}  ${why}`);
  if (!pass && r.text) console.log("      → " + r.text.replace(/\s+/g, " ").slice(0, 220));
  await new Promise((res) => setTimeout(res, 2500)); // stay under the limits (6 per 10 s, 30 per minute)
}
const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
console.log(`\nWynik: ${ok}/${CASES.length} poprawnych (${Math.round(ok / CASES.length * 100)}%)`);
console.log(`Szybkość (mediana, bez cache): pierwsze słowo ${s(med(firsts))}, cała odpowiedź ${s(med(totals))}`);
console.log(`Model: ${[...models].join(", ")}`);
