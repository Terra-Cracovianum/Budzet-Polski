#!/usr/bin/env python3
"""Static SEO pages: one per spending area (dział), one per budget year, plus
the deficit, revenue and a topics hub. Plain HTML with real text, tables and a
small chart, so search engines can read them. Built from the site's own data.

Run after any change to the budget data:  python3 gen-pages.py
Writes: wydatki/*.html, budzet/*.html, deficyt.html, dochody.html, tematy.html,
and refreshes sitemap.xml.
"""
import html
import json
import re
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).parent
SITE = "https://budzetpolski.com"
FIRST, LAST = 2011, 2026          # adopted budget laws
PROJECT = 2027                    # draft law
TODAY = date.today().isoformat()


def load(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def budget(year):
    return load("budget-data.json" if year == LAST else f"budget-{year}.json")


def execution(year):
    p = ROOT / f"wykonanie-{year}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


B = {y: budget(y) for y in range(FIRST, LAST + 1)}
W = {y: execution(y) for y in range(FIRST, LAST + 1)}
P27 = load("budzet-2027.json")
CTX = {r["rok"]: r for r in load("context-data.json")["lata"]}


def closed(y):
    """Full-year execution exists (not a year in progress)."""
    w = W.get(y)
    return bool(w) and not w["meta"].get("narastajaco")


def mld(tys):
    return tys / 1e6


def fmt(v, d=1):
    return f"{v:,.{d}f}".replace(",", " ").replace(".", ",")


def zl(v):
    return fmt(v, 0) + " zł"


def pct(v, d=1, sign=False):
    s = fmt(abs(v), d) + "%"
    return (("+" if v >= 0 else "−") + s) if sign else s


def real(v, y):
    """Value from year y in LAST-year prices (CPI, GUS)."""
    f = 1.0
    for t in range(y + 1, LAST + 1):
        f *= CTX.get(t, {}).get("cpi", 100) / 100
    return v * f


def pop(y):
    ys = [k for k in CTX if k <= y]
    return CTX[max(ys)]["ludnosc"]


def slug(s):
    s = unicodedata.normalize("NFKD", s.lower().replace("ł", "l"))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


e = html.escape

# ---------- spending areas (działy) ----------

# current name per code; nicer everyday name for titles
NAMES = {d["code"]: d["name"] for d in B[LAST]["dzialy"]}
EVERYDAY = {
    "753": "Emerytury, renty i ubezpieczenia społeczne",
    "758": "Różne rozliczenia: subwencje dla samorządów i rezerwy",
    "752": "Obrona narodowa i wojsko",
    "855": "Rodzina: 800+ i świadczenia rodzinne",
    "757": "Obsługa długu publicznego: odsetki",
    "851": "Ochrona zdrowia",
    "730": "Szkolnictwo wyższe i nauka",
    "754": "Bezpieczeństwo publiczne: policja i straż",
    "750": "Administracja publiczna",
    "755": "Wymiar sprawiedliwości: sądy i więzienia",
    "600": "Transport i łączność: drogi i kolej",
    "801": "Oświata i wychowanie: szkoły",
    "010": "Rolnictwo",
    "852": "Pomoc społeczna",
    "921": "Kultura i dziedzictwo narodowe",
    "926": "Sport (kultura fizyczna)",
    "900": "Gospodarka komunalna i ochrona środowiska",
    "751": "Urzędy naczelne: parlament, prezydent, wybory",
}
KEYWORDS = {
    "752": "wydatki na obronę, budżet MON, wydatki na wojsko",
    "753": "emerytury, ZUS, FUS, KRUS, renty",
    "855": "800 plus, świadczenia rodzinne",
    "757": "odsetki od długu, koszt długu publicznego",
    "851": "wydatki na zdrowie, NFZ, szpitale",
    "801": "szkoły, oświata, edukacja",
    "730": "uczelnie, nauka, badania",
    "600": "drogi, kolej, transport",
}


def series(code):
    """Per year: plan (mld), execution (mld or None), name."""
    out = {}
    for y in range(FIRST, LAST + 1):
        d = next((x for x in B[y]["dzialy"] if x["code"] == code), None)
        if not d:
            continue
        w = W[y]["dzialy"].get(code) if W[y] else None
        out[y] = {"p": mld(d["plan"]), "w": mld(w) if (w is not None and closed(y)) else None,
                  "share": d["plan"] / B[y]["meta"]["wydatki"] * 100}
    d27 = next((x for x in P27["ustawa"]["dzialy"] if x["code"] == code), None)
    if d27:
        out[PROJECT] = {"p": d27["v"], "w": None, "share": d27["v"] / P27["ustawa"]["art"]["wydatki"] * 100, "draft": True}
    return out


def rank(code, y=LAST):
    order = sorted(B[y]["dzialy"], key=lambda d: -d["plan"])
    return next(i for i, d in enumerate(order, 1) if d["code"] == code)


# ---------- page parts ----------

def chart(points, label, unit="mld zł"):
    """Bars per year (plan); dots = execution; lighter bar = draft."""
    W_, H_, L, R, T, Bm = 720, 230, 8, 8, 26, 28
    ys = list(points)
    vmax = max(max(p["p"], p.get("w") or 0) for p in points.values()) or 1
    bw = (W_ - L - R) / len(ys)
    bars, dots, labels = [], [], []
    for i, y in enumerate(ys):
        p = points[y]
        h = (H_ - T - Bm) * p["p"] / vmax
        x = L + i * bw + bw * 0.16
        cls = "b-draft" if p.get("draft") else ("b-last" if y == LAST else "b")
        bars.append(f'<rect class="{cls}" x="{x:.1f}" y="{H_ - Bm - h:.1f}" width="{bw * 0.68:.1f}" height="{max(h, 1):.1f}" rx="3"><title>{y}: plan {fmt(p["p"])} {unit}</title></rect>')
        if p.get("w") is not None:
            hw = (H_ - T - Bm) * p["w"] / vmax
            dots.append(f'<circle class="d" cx="{x + bw * 0.34:.1f}" cy="{H_ - Bm - hw:.1f}" r="3.6"><title>{y}: wykonanie {fmt(p["w"])} {unit}</title></circle>')
        if i % 2 == 0 or y in (LAST, PROJECT):
            labels.append(f'<text x="{x + bw * 0.34:.1f}" y="{H_ - 8}" text-anchor="middle">{y}</text>')
    last = ys[-1]
    lh = (H_ - T - Bm) * points[last]["p"] / vmax
    lx = L + (len(ys) - 1) * bw + bw * 0.5
    top = f'<text class="v" x="{lx:.1f}" y="{H_ - Bm - lh - 8:.1f}" text-anchor="end">{fmt(points[last]["p"])}</text>'
    return (f'<figure class="pchart"><svg viewBox="0 0 {W_} {H_}" role="img" aria-label="{e(label)}">'
            + "".join(bars) + "".join(dots) + top + "".join(labels) + "</svg>"
            f'<figcaption><span class="lg lg-b"></span>plan z ustawy<span class="lg lg-n"></span>{LAST}<span class="lg lg-d"></span>wykonanie'
            + ('<span class="lg lg-p"></span>projekt' if any(p.get("draft") for p in points.values()) else "")
            + f" · {unit}</figcaption></figure>")


def table(rows, head):
    return ('<div class="ptable-wrap"><table class="ptable"><thead><tr>' + "".join(f"<th>{h}</th>" for h in head)
            + "</tr></thead><tbody>" + "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
            + "</tbody></table></div>")


def faq(items):
    body = "".join(f'<details class="faq-i"><summary>{e(q)}</summary><p>{a}</p></details>' for q, a in items)
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": re.sub("<[^>]+>", "", a)}} for q, a in items]}
    return f'<section class="psec"><h2>Najczęstsze pytania</h2>{body}</section>' + ld_script(ld)


def ld_script(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False) + "</script>"


def crumbs(items):
    """items: [(name, path)], last one is the current page."""
    html_ = " <span aria-hidden=\"true\">›</span> ".join(
        f'<a href="{p}">{e(n)}</a>' if i < len(items) - 1 else f'<span aria-current="page">{e(n)}</span>'
        for i, (n, p) in enumerate(items))
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + p} for i, (n, p) in enumerate(items)]}
    return f'<nav class="crumbs" aria-label="Ścieżka">{html_}</nav>' + ld_script(ld)


def page(path, title, desc, body, h1, lead, crumb_items, image="og-home.jpg"):
    logo = '<img class="logo" src="/logo.svg?v=16" alt="Terra Cracovianum" width="1757" height="586">'
    return f"""<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{SITE}{path}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="{SITE}{path}">
<meta property="og:site_name" content="Budżet Polski · Terra Cracovianum">
<meta property="og:locale" content="pl_PL">
<meta property="og:image" content="{SITE}/og/{image}?v=1">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE}/og/{image}?v=1">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.7.0/dist/tabler-icons.min.css">
<link rel="stylesheet" href="/style.css?v=46">
<link rel="stylesheet" href="/page.css?v=2">
<link rel="stylesheet" href="/chat.css?v=8">
</head>
<body class="pbody">
<a class="skip" href="#main">Przejdź do treści</a>
<header class="hdr">
  <div class="wrap hdr-in">
    <a class="brand" href="/" aria-label="Budżet Polski: strona główna">{logo}</a>
    <nav class="pnav" aria-label="Menu">
      <a href="/">Przegląd</a><a href="/mapa">Mapa wydatków</a><a href="/tematy">Tematy</a><a href="/budzet-2027">Budżet 2027</a>
    </nav>
  </div>
</header>
<main id="main" class="wrap pmain">
  {crumbs(crumb_items)}
  <h1 class="ph1">{h1}</h1>
  <p class="plead">{lead}</p>
  {body}
  <p class="psrc">Źródła: ustawy budżetowe {FIRST}–{LAST} (Dziennik Ustaw), sprawozdania Ministerstwa Finansów z wykonania budżetu, projekt ustawy budżetowej na {PROJECT} (druk sejmowy nr {P27["meta"]["druk_sejmowy"]}). Ceny stałe: inflacja CPI wg GUS. Ludność wg GUS. Kwoty w mld zł. Aktualizacja: {TODAY}.</p>
</main>
<footer class="foot">
  <div class="wrap foot-in">
    {logo}
    <div class="foot-t">
      <span><a href="/tematy">Wszystkie tematy</a> · <a href="/deficyt">Deficyt</a> · <a href="/dochody">Dochody</a> · <a href="/budzet-2027">Budżet 2027</a></span>
      <span>© {date.today().year} Stowarzyszenie <a href="https://terracracovianum.org" rel="noopener">Terra Cracovianum</a></span>
    </div>
  </div>
</footer>
<script src="/chat.js?v=10" defer></script>
</body>
</html>
"""


def cta(href, text, sub=""):
    return f'<a class="pcta" href="{href}"><span><b>{e(text)}</b>{("<small>" + e(sub) + "</small>") if sub else ""}</span><i class="ti ti-arrow-right" aria-hidden="true"></i></a>'


def kpis(items):
    return '<div class="pkpis">' + "".join(f'<div class="pkpi"><span class="pk-l">{e(l)}</span><b>{v}</b><span class="pk-s">{s}</span></div>' for l, v, s in items) + "</div>"


# ---------- builders ----------

def dzial_page(code):
    s = series(code)
    name = NAMES[code]
    every = EVERYDAY.get(code, name)
    cur = s[LAST]
    first_y = min(y for y in s if y >= FIRST)
    lc = max(y for y in s if s[y]["w"] is not None) if any(s[y]["w"] is not None for y in s) else None
    path = f"/wydatki/{slug(name)}"
    per = cur["p"] * 1e9 / pop(LAST)
    ch_first = (cur["p"] / s[first_y]["p"] - 1) * 100 if s[first_y]["p"] else None
    ch_real = (cur["p"] / real(s[first_y]["p"], first_y) - 1) * 100 if s[first_y]["p"] else None
    prev = s.get(LAST - 1)
    yoy = (cur["p"] / prev["p"] - 1) * 100 if prev and prev["p"] else None
    d27 = s.get(PROJECT)

    lead = (f"W {LAST} roku państwo zaplanowało na dział {code} „{e(name)}” <b>{fmt(cur['p'])} mld zł</b>, "
            f"czyli {pct(cur['share'])} wszystkich wydatków budżetu i {zl(per)} na każdego mieszkańca Polski. "
            f"To {rank(code)}. pozycja spośród {len(B[LAST]['dzialy'])} działów budżetu.")
    k = [("Plan " + str(LAST), fmt(cur["p"]) + "<small> mld zł</small>", f"{pct(cur['share'])} budżetu"),
         ("Na osobę", zl(per), f"ludność {fmt(pop(LAST) / 1e6, 2)} mln")]
    if yoy is not None:
        k.append((f"Zmiana r/r", pct(yoy, sign=True), f"wobec {LAST - 1}: {fmt(prev['p'])} mld zł"))
    if d27:
        k.append((f"Projekt {PROJECT}", fmt(d27["p"]) + "<small> mld zł</small>", pct((d27["p"] / cur["p"] - 1) * 100, sign=True) + f" wobec {LAST}"))

    rows = []
    for y in sorted(s):
        p = s[y]
        rows.append([f"{y}{' (projekt)' if p.get('draft') else ''}", fmt(p["p"]), fmt(p["w"]) if p["w"] is not None else "—",
                     pct(p["w"] / p["p"] * 100, 0) if p["w"] is not None and p["p"] else "—", pct(p["share"]),
                     fmt(real(p["p"], y)) if y <= LAST else "—"])
    body = kpis(k)
    body += f'<section class="psec"><h2>Wydatki na „{e(name)}” w latach {first_y}–{max(s)}</h2>'
    body += chart(s, f"Wydatki w dziale {code} {name}, {first_y}–{max(s)}, mld zł")
    if ch_first is not None:
        body += (f"<p>Od {first_y} roku plan wydatków w tym dziale zmienił się z {fmt(s[first_y]['p'])} do {fmt(cur['p'])} mld zł "
                 f"({pct(ch_first, sign=True)}). Po uwzględnieniu inflacji, w cenach z {LAST} r., to zmiana o {pct(ch_real, sign=True)}. "
                 "Część działów zmieniała przez lata zakres lub klasyfikację, więc duże skoki mogą wynikać z przesunięć między działami.</p>")
    body += table(rows, ["Rok", "Plan, mld zł", "Wykonanie, mld zł", "Wykonanie / plan", "Udział w budżecie", f"Plan w cenach {LAST}"])
    body += "</section>"
    body += '<section class="psec pctas">' + cta(f"/{LAST}/mapa/{code}", f"Zobacz „{name}” na mapie wydatków", "Kto wydaje te pieniądze, rozdziały, wykres 2011–2026")
    if lc:
        body += cta(f"/{lc}/wykonanie" if lc != LAST else "/wykonanie", f"Wykonanie budżetu {lc}", "Ile z planu faktycznie wydano")
    body += cta("/trendy", "Trendy wydatków", "Porównaj działy w latach i w cenach stałych") + "</section>"

    q = [(f"Ile Polska wydaje na „{name}” w {LAST} roku?",
          f"Ustawa budżetowa na {LAST} r. przewiduje w dziale {code} „{e(name)}” {fmt(cur['p'])} mld zł, czyli {pct(cur['share'])} wydatków budżetu państwa i {zl(per)} na mieszkańca.")]
    if ch_first is not None:
        q.append((f"Jak zmieniały się wydatki na „{name}” od {first_y} roku?",
                  f"W {first_y} r. plan wynosił {fmt(s[first_y]['p'])} mld zł, a w {LAST} r. {fmt(cur['p'])} mld zł ({pct(ch_first, sign=True)}; realnie, po uwzględnieniu inflacji, {pct(ch_real, sign=True)})."))
    if lc:
        q.append((f"Ile faktycznie wydano na „{name}” w {lc} roku?",
                  f"Według sprawozdania Ministerstwa Finansów wykonanie w {lc} r. wyniosło {fmt(s[lc]['w'])} mld zł przy planie {fmt(s[lc]['p'])} mld zł ({pct(s[lc]['w'] / s[lc]['p'] * 100, 0)} planu)."))
    if d27:
        q.append((f"Ile na „{name}” przewiduje projekt budżetu na {PROJECT}?",
                  f"Projekt ustawy budżetowej na {PROJECT} r. przewiduje {fmt(d27['p'])} mld zł ({pct((d27['p'] / cur['p'] - 1) * 100, sign=True)} wobec ustawy na {LAST}). To projekt, nie uchwalona ustawa."))
    body += faq(q)

    title = f"{every}: wydatki budżetu państwa {first_y}–{max(s)} | Budżet Polski"
    desc = (f"Ile Polska wydaje na dział „{name}”? W {LAST} r. plan to {fmt(cur['p'])} mld zł ({pct(cur['share'])} budżetu, {zl(per)} na osobę). "
            f"Dane od {first_y} r., wykonanie i projekt na {PROJECT}." + (f" {KEYWORDS[code]}." if code in KEYWORDS else ""))
    h1 = f"{e(every)}<small>Wydatki budżetu państwa {first_y}–{max(s)} · dział {code}</small>"
    return path, page(path, title, desc, body, h1, lead, [("Budżet Polski", "/"), ("Tematy", "/tematy"), (name, path)]), cur["p"]


def year_page(y):
    m = B[y]["meta"]
    w = W[y]
    path = f"/budzet/{y}"
    full = closed(y)
    ww = w["wykonanie"] if w else None
    lead = (f"Ustawa budżetowa na {y} rok zakładała <b>{fmt(mld(m['wydatki']))} mld zł wydatków</b>, {fmt(mld(m['dochody']))} mld zł dochodów "
            f"i deficyt {fmt(mld(m['deficyt']))} mld zł. ")
    if ww and full:
        lead += f"Faktycznie wydano {fmt(mld(ww['wydatki']))} mld zł, a deficyt wyniósł {fmt(mld(ww['deficyt']))} mld zł."
    elif ww:
        lead += f"Do końca okresu {w['meta']['okres']} wydano {fmt(mld(ww['wydatki']))} mld zł ({pct(ww['wydatki'] / m['wydatki'] * 100)} planu)."
    k = [("Wydatki (plan)", fmt(mld(m["wydatki"])) + "<small> mld zł</small>", f"{zl(m['wydatki'] * 1e3 / pop(y))} na osobę"),
         ("Dochody (plan)", fmt(mld(m["dochody"])) + "<small> mld zł</small>", ""),
         ("Deficyt (plan)", fmt(mld(m["deficyt"])) + "<small> mld zł</small>", "")]
    if ww:
        k.append(("Wykonanie wydatków" + ("" if full else f" ({w['meta']['okres']})"), fmt(mld(ww["wydatki"])) + "<small> mld zł</small>",
                  f"deficyt {fmt(mld(ww['deficyt']))} mld zł"))
    body = kpis(k)
    if w and w["meta"].get("uwaga") and y in (2020, 2021):
        body += f'<p class="pnote">{e(re.sub(r"[(]?budget-[0-9]+[.]json[):]*", "", w["meta"]["uwaga"]))}</p>'
    dz = sorted(B[y]["dzialy"], key=lambda d: -d["plan"])
    rows = [[f'<a href="/wydatki/{slug(NAMES.get(d["code"], d["name"]))}">{e(NAMES.get(d["code"], d["name"]))}</a>' if d["code"] in NAMES else e(d["name"]),
             fmt(mld(d["plan"])), pct(d["plan"] / m["wydatki"] * 100),
             fmt(mld(w["dzialy"][d["code"]])) if (w and full and d["code"] in w["dzialy"]) else "—"] for d in dz[:15]]
    body += f'<section class="psec"><h2>Na co państwo wydało najwięcej w {y} roku</h2>'
    body += table(rows, ["Dział", "Plan, mld zł", "Udział", "Wykonanie, mld zł"]) + "</section>"
    rows = [[e(d["name"]), fmt(mld(d["plan"])), fmt(mld(w["dochody"][d["name"]])) if (w and full and d["name"] in w.get("dochody", {})) else "—"] for d in B[y]["dochody"]]
    body += f'<section class="psec"><h2>Skąd państwo miało pieniądze w {y} roku</h2>' + table(rows, ["Źródło", "Plan, mld zł", "Wykonanie, mld zł"]) + "</section>"
    pv = f'<a href="/budzet/{y - 1}">← {y - 1}</a>' if y > FIRST else ""
    nx = f'<a href="/budzet/{y + 1}">{y + 1} →</a>' if y < LAST else '<a href="/budzet-2027">2027 (projekt) →</a>'
    body += f'<nav class="pyears" aria-label="Inne lata">{pv}<span></span>{nx}</nav>'
    app = "/" if y == LAST else f"/{y}"
    body += '<section class="psec pctas">' + cta(app, f"Interaktywny budżet {y}", "Przegląd, mapa wydatków, przepływ pieniędzy") + cta(f"/{y}/mapa" if y != LAST else "/mapa", f"Mapa wydatków {y}", "Wszystkie działy i części budżetu")
    if w:
        body += cta(f"/{y}/wykonanie" if y != LAST else "/wykonanie", f"Wykonanie budżetu {y}", "Plan obok tego, co faktycznie wydano")
    body += "</section>"
    q = [(f"Ile wyniosły wydatki budżetu państwa w {y} roku?",
          f"Ustawa budżetowa na {y} r. zakładała {fmt(mld(m['wydatki']))} mld zł wydatków." + (f" Faktycznie wydano {fmt(mld(ww['wydatki']))} mld zł." if ww and full else "")),
         (f"Jaki był deficyt budżetu w {y} roku?",
          f"Planowany deficyt wynosił {fmt(mld(m['deficyt']))} mld zł." + (f" Wykonany deficyt: {fmt(mld(ww['deficyt']))} mld zł." if ww and full else "")),
         (f"Na co państwo wydało najwięcej w {y} roku?",
          "Największe działy: " + ", ".join(f"{NAMES.get(d['code'], d['name'])} ({fmt(mld(d['plan']))} mld zł)" for d in dz[:3]) + ".")]
    body += faq(q)
    title = f"Budżet państwa {y}: wydatki, dochody, deficyt | Budżet Polski"
    desc = (f"Budżet Polski na {y} rok: {fmt(mld(m['wydatki']))} mld zł wydatków, {fmt(mld(m['dochody']))} mld zł dochodów, deficyt {fmt(mld(m['deficyt']))} mld zł"
            + (f" (wykonanie: {fmt(mld(ww['deficyt']))} mld zł)" if ww and full else "") + ". Na co wydano najwięcej i skąd były pieniądze.")
    return path, page(path, title, desc, body, f"Budżet państwa {y}<small>{e(m['ustawa'])}</small>", lead, [("Budżet Polski", "/"), ("Budżety", "/tematy#lata"), (str(y), path)])


def deficit_page():
    path = "/deficyt"
    pts = {}
    for y in range(FIRST, LAST + 1):
        m = B[y]["meta"]
        pts[y] = {"p": mld(m["deficyt"]), "w": mld(W[y]["wykonanie"]["deficyt"]) if closed(y) else None}
    pts[PROJECT] = {"p": P27["ustawa"]["art"]["deficyt"], "w": None, "draft": True}
    rows = [[f'<a href="/budzet/{y}">{y}</a>' if y <= LAST else '<a href="/budzet-2027">2027 (projekt)</a>', fmt(p["p"]),
             fmt(p["w"]) if p["w"] is not None else "—", fmt(p["p"] * 1e9 / pop(min(y, LAST)), 0) + " zł"] for y, p in pts.items()]
    lc = max(y for y in pts if pts[y]["w"] is not None)
    lead = (f"Deficyt to różnica między wydatkami a dochodami budżetu państwa: tyle państwo musi pożyczyć w danym roku. "
            f"Ustawa na {LAST} r. zakłada <b>{fmt(pts[LAST]['p'])} mld zł</b> deficytu, a projekt na {PROJECT} r. {fmt(pts[PROJECT]['p'])} mld zł. "
            f"W {FIRST} r. plan wynosił {fmt(pts[FIRST]['p'])} mld zł.")
    body = kpis([(f"Deficyt {LAST} (plan)", fmt(pts[LAST]["p"]) + "<small> mld zł</small>", zl(pts[LAST]["p"] * 1e9 / pop(LAST)) + " na osobę"),
                 (f"Projekt {PROJECT}", fmt(pts[PROJECT]["p"]) + "<small> mld zł</small>", ""),
                 (f"Wykonanie {lc}", fmt(pts[lc]["w"]) + "<small> mld zł</small>", f"plan {fmt(pts[lc]['p'])} mld zł")])
    body += f'<section class="psec"><h2>Deficyt budżetu państwa {FIRST}–{PROJECT}</h2>' + chart(pts, f"Deficyt budżetu państwa {FIRST}–{PROJECT}, mld zł")
    body += "<p>W 2020 r. pierwotna ustawa zakładała budżet zrównoważony (deficyt 0). W pandemii znowelizowano ją do deficytu 109,3 mld zł; wykonany deficyt wyniósł 85,0 mld zł.</p>"
    body += table(rows, ["Rok", "Plan, mld zł", "Wykonanie, mld zł", "Plan na osobę"]) + "</section>"
    body += '<section class="psec pctas">' + cta("/wykonanie", f"Wykonanie budżetu {LAST}", "Ile wydano i zebrano do tej pory") + cta("/budzet-2027", f"Budżet {PROJECT} krok po kroku", "Ile pożyczamy i jak projekt idzie przez Sejm") + "</section>"
    body += faq([(f"Jaki jest deficyt budżetu w {LAST} roku?", f"Ustawa budżetowa na {LAST} r. zakłada deficyt {fmt(pts[LAST]['p'])} mld zł."),
                 (f"Jaki deficyt zakłada projekt budżetu na {PROJECT}?", f"Projekt przewiduje deficyt {fmt(pts[PROJECT]['p'])} mld zł. To projekt, nie uchwalona ustawa."),
                 ("Czym deficyt różni się od długu publicznego?", "Deficyt to brakująca kwota w jednym roku. Dług to suma wszystkich dotychczasowych pożyczek, które państwo musi jeszcze spłacić.")])
    title = f"Deficyt budżetowy Polski {FIRST}–{PROJECT}: plan i wykonanie | Budżet Polski"
    desc = f"Deficyt budżetu państwa: {fmt(pts[LAST]['p'])} mld zł w {LAST} r., projekt {fmt(pts[PROJECT]['p'])} mld zł na {PROJECT}. Plan i wykonanie od {FIRST} r., wykres i tabela."
    return path, page(path, title, desc, body, f"Deficyt budżetu państwa<small>{FIRST}–{PROJECT}, plan i wykonanie</small>", lead, [("Budżet Polski", "/"), ("Deficyt", path)])


def revenue_page():
    path = "/dochody"
    names = [d["name"] for d in B[LAST]["dochody"]]
    rows = []
    for y in range(FIRST, LAST + 1):
        dd = {d["name"]: d["plan"] for d in B[y]["dochody"]}
        rows.append([f'<a href="/budzet/{y}">{y}</a>'] + [fmt(mld(dd.get(n, 0))) for n in names] + [fmt(mld(B[y]["meta"]["dochody"]))])
    vat = {y: {"p": mld(next(d["plan"] for d in B[y]["dochody"] if d["name"] == "VAT")),
               "w": mld(W[y]["dochody"]["VAT"]) if closed(y) and "VAT" in W[y].get("dochody", {}) else None} for y in range(FIRST, LAST + 1)}
    m = B[LAST]["meta"]
    vat_share = vat[LAST]["p"] / mld(m["dochody"]) * 100
    lead = (f"Budżet państwa na {LAST} r. zakłada <b>{fmt(mld(m['dochody']))} mld zł dochodów</b>. Najważniejszy jest VAT: "
            f"{fmt(vat[LAST]['p'])} mld zł, czyli {pct(vat_share)} wszystkich dochodów. Resztę wydatków państwo pożycza (deficyt {fmt(mld(m['deficyt']))} mld zł).")
    body = kpis([(f"Dochody {LAST}", fmt(mld(m["dochody"])) + "<small> mld zł</small>", ""), ("VAT", fmt(vat[LAST]["p"]) + "<small> mld zł</small>", pct(vat_share) + " dochodów")])
    body += f'<section class="psec"><h2>Wpływy z VAT {FIRST}–{LAST}</h2>' + chart(vat, f"Dochody z VAT {FIRST}–{LAST}, mld zł") + "</section>"
    body += f'<section class="psec"><h2>Dochody budżetu wg źródła, plan</h2>' + table(rows, ["Rok"] + [e(n) for n in names] + ["Razem"])
    body += "<p>Dochody z PIT i CIT w budżecie państwa są pomniejszone o udziały samorządów, dlatego wpływy z PIT wyglądają na niskie.</p></section>"
    body += '<section class="psec pctas">' + cta("/przeplyw", "Przepływ pieniędzy", "Skąd pieniądze przychodzą i dokąd płyną") + cta("/podatki", "Twoje podatki", "Na co idą podatki konkretnej osoby") + "</section>"
    body += faq([(f"Skąd państwo ma najwięcej pieniędzy?", f"Z VAT: w {LAST} r. {fmt(vat[LAST]['p'])} mld zł, czyli {pct(vat_share)} dochodów budżetu państwa."),
                 ("Dlaczego wpływy z PIT są takie niskie?", "Większa część PIT trafia do samorządów (gmin, powiatów, województw). W budżecie państwa zostaje tylko część, a w trakcie roku po odliczeniu udziałów samorządów saldo bywa nawet ujemne.")])
    title = f"Dochody budżetu państwa: VAT, CIT, PIT, akcyza {FIRST}–{LAST} | Budżet Polski"
    desc = f"Skąd państwo ma pieniądze? Dochody budżetu na {LAST} r.: {fmt(mld(m['dochody']))} mld zł, w tym VAT {fmt(vat[LAST]['p'])} mld zł. Dochody wg źródła od {FIRST} r."
    return path, page(path, title, desc, body, f"Dochody budżetu państwa<small>VAT, akcyza, CIT, PIT · {FIRST}–{LAST}</small>", lead, [("Budżet Polski", "/"), ("Dochody", path)])


def hub_page(dz_pages):
    path = "/tematy"
    items = "".join(f'<li><a href="{p}"><span>{e(EVERYDAY.get(c, NAMES[c]))}</span><b>{fmt(v)} mld zł</b></a></li>'
                    for c, p, v in sorted(dz_pages, key=lambda x: -x[2]))
    years = "".join(f'<li><a href="/budzet/{y}">{y}</a></li>' for y in range(LAST, FIRST - 1, -1)) + '<li><a href="/budzet-2027">2027 (projekt)</a></li>'
    body = (f'<section class="psec"><h2>Na co idą pieniądze ({LAST})</h2><ul class="phub">{items}</ul></section>'
            f'<section class="psec" id="lata"><h2>Budżety państwa rok po roku</h2><ul class="pyrs">{years}</ul></section>'
            '<section class="psec pctas">' + cta("/deficyt", "Deficyt budżetu", f"{FIRST}–{PROJECT}, plan i wykonanie") + cta("/dochody", "Dochody budżetu", "VAT, akcyza, CIT, PIT") + "</section>")
    lead = "Wszystkie obszary wydatków budżetu państwa i każdy budżet od 2011 roku. Każda strona to liczby z ustaw budżetowych i sprawozdań Ministerstwa Finansów, z wykresem, tabelą i linkiem do interaktywnej mapy."
    return path, page(path, "Tematy: wydatki, dochody i deficyt budżetu państwa | Budżet Polski",
                      f"Wydatki państwa na obronę, zdrowie, emerytury, szkoły i inne obszary, budżety od {FIRST} r., deficyt i dochody. Dane z ustaw budżetowych i MF.",
                      body, "Tematy", lead, [("Budżet Polski", "/"), ("Tematy", path)])


def write(path, content):
    out = ROOT / (path.lstrip("/") + ".html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(content, encoding="utf-8")


pages = []
dz_pages = []
for code in NAMES:
    if code not in {d["code"] for d in B[LAST]["dzialy"]}:
        continue
    p, content, v = dzial_page(code)
    write(p, content)
    dz_pages.append((code, p, v))
    pages.append((p, "0.7"))
for y in range(FIRST, LAST + 1):
    p, content = year_page(y)
    write(p, content)
    pages.append((p, "0.6"))
for fn in (deficit_page, revenue_page):
    p, content = fn()
    write(p, content)
    pages.append((p, "0.8"))
p, content = hub_page(dz_pages)
write(p, content)
pages.append((p, "0.8"))

# sitemap: the app views + all generated pages
APP = [("/", "1.0"), ("/mapa", "0.9"), ("/przeplyw", "0.8"), ("/rodzaje", "0.7"), ("/trendy", "0.8"),
       ("/podatki", "0.9"), ("/wykonanie", "0.8"), ("/budzet-2027", "0.9")]
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
for u, pr in APP + pages:
    sm += f"  <url><loc>{SITE}{u}</loc><lastmod>{TODAY}</lastmod><changefreq>weekly</changefreq><priority>{pr}</priority></url>\n"
(ROOT / "sitemap.xml").write_text(sm + "</urlset>\n", encoding="utf-8")
print(f"{len(pages)} pages, sitemap {len(APP) + len(pages)} URLs")
