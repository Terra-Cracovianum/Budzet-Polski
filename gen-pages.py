#!/usr/bin/env python3
"""Static pages for search engines: one per spending area (dział), one per budget
year, the deficit, revenue, a topics hub and "O projekcie". They use the same
look as the app (header, view title, stat cards, bento cards, tables, charts).

Every number comes ONLY from the site's own data files:
  budget-*.json / budget-data.json   budget laws (plan)
  wykonanie-*.json                   Ministry of Finance execution reports
  budzet-2027.json                   2027 draft law
  context-data.json                  GUS inflation (CPI) and population, as used by the app
Names of spending areas are the app's own short names (app.js SHORT).
tests/pages-audit.py re-checks the numbers on the generated pages against the data.

Run after any change to the budget data:  python3 gen-pages.py
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
V_STYLE, V_PAGE, V_CHAT_CSS, V_CHAT_JS = 49, 5, 8, 10


def load(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


B = {y: load("budget-data.json" if y == LAST else f"budget-{y}.json") for y in range(FIRST, LAST + 1)}
W = {}
for _y in range(FIRST, LAST + 1):
    _p = ROOT / f"wykonanie-{_y}.json"
    W[_y] = json.loads(_p.read_text(encoding="utf-8")) if _p.exists() else None
P27 = load("budzet-2027.json")
CTX = {r["rok"]: r for r in load("context-data.json")["lata"]}


def closed(y):
    """Full-year execution exists (not a year in progress)."""
    return bool(W.get(y)) and not W[y]["meta"].get("narastajaco")


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
    """In LAST-year prices, same method as the app (CPI chain, context-data.json)."""
    f = 1.0
    for t in range(y + 1, LAST + 1):
        f *= CTX[t]["cpi"] / 100
    return v * f


def pop(y):
    return CTX[y]["ludnosc"]


def slug(s):
    s = unicodedata.normalize("NFKD", s.lower().replace("ł", "l"))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


e = html.escape

# ---------- names and colours: exactly as in the app ----------
NAMES = {d["code"]: d["name"] for d in B[LAST]["dzialy"]}          # official names (2026 law)
SHORT = {  # app.js SHORT
    "753": "Ubezpieczenia społeczne", "758": "Różne rozliczenia", "752": "Obrona narodowa", "757": "Obsługa długu",
    "855": "Rodzina", "851": "Ochrona zdrowia", "730": "Szkolnictwo wyższe i nauka", "754": "Bezpieczeństwo publiczne",
    "750": "Administracja publiczna", "751": "Urzędy naczelne i sądy", "755": "Wymiar sprawiedliwości", "600": "Transport i łączność",
    "010": "Rolnictwo", "700": "Gospodarka mieszkaniowa", "852": "Pomoc społeczna", "853": "Polityka społeczna",
    "801": "Oświata i wychowanie", "921": "Kultura", "900": "Gospodarka komunalna", "150": "Przetwórstwo przemysłowe",
    "100": "Górnictwo", "720": "Informatyka", "710": "Działalność usługowa", "854": "Opieka wychowawcza",
    "926": "Kultura fizyczna", "020": "Leśnictwo", "050": "Rybołówstwo", "500": "Handel", "630": "Turystyka",
    "925": "Ogrody i przyroda", "550": "Hotele i restauracje",
}
DOCH_SHORT = {"Inne dochody podatkowe i niepodatkowe": "Pozostałe dochody"}
SRC_COLOR = {"VAT": "social", "Akcyza": "infra", "CIT": "admin", "PIT": "edu"}


def short(code):
    return SHORT.get(code, NAMES.get(code, code))


def color_key(name):  # app.js colorKey
    n = name.lower()
    if re.search(r"ubezpiecz|emeryt|rodzin|pomoc spo|polityki spo|zabezpiecz", n): return "social"
    if re.search(r"różne rozlicz|rozliczenia|subwen", n): return "transfer"
    if re.search(r"obron|wojsk", n): return "defense"
    if re.search(r"dług|obsługa dłu", n): return "debt"
    if re.search(r"zdrow", n): return "health"
    if re.search(r"oświat|szkoln|nauk|eduk|wychowani", n): return "edu"
    if re.search(r"administ|urzęd|wymiar spr|sądown|bezpiecz|sprawiedliw|skarb", n): return "admin"
    if re.search(r"transport|łączn|infrastr|drog|kolej|gospodar|budownict|mieszkani|środowisk", n): return "infra"
    return "other"


def em_last(text):
    """App style: the last word in serif italic ("Obrona <em>narodowa</em>")."""
    w = text.split()
    return (" ".join(e(x) for x in w[:-1]) + " " if len(w) > 1 else "") + f'<em class="s">{e(w[-1])}</em>'


# ---------- data series ----------

def series(code):
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


# ---------- charts (static SVG drawn like the app's d3 charts) ----------

def mono_path(pts):
    """Monotone cubic curve through points (same feel as d3.curveMonotoneX)."""
    n = len(pts)
    if n < 2:
        return ""
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [d[0]] + [0 if d[i - 1] * d[i] <= 0 else (d[i - 1] + d[i]) / 2 for i in range(1, n - 1)] + [d[-1]]
    for i in range(n - 1):
        if d[i] == 0:
            m[i] = m[i + 1] = 0
        else:
            a, b = m[i] / d[i], m[i + 1] / d[i]
            s = a * a + b * b
            if s > 9:
                t = 3 / s ** 0.5
                m[i], m[i + 1] = t * a * d[i], t * b * d[i]
    out = f"M{xs[0]:.1f},{ys[0]:.1f}"
    for i in range(n - 1):
        h = xs[i + 1] - xs[i]
        out += (f" C{xs[i] + h / 3:.1f},{ys[i] + m[i] * h / 3:.1f} {xs[i + 1] - h / 3:.1f},{ys[i + 1] - m[i + 1] * h / 3:.1f} "
                f"{xs[i + 1]:.1f},{ys[i + 1]:.1f}")
    return out


def area_chart(points, label, gid, highlight=LAST, unit="mld zł"):
    """points: {year: {"p": plan, "w": execution or None, "draft": bool}}.
    Accent line + soft area for the plan (like the overview year chart), a thin ink
    line for execution, a dashed segment to the draft year, the highlighted year with a halo."""
    W_, H_ = 1000, 300
    L, R, T, Bm = 44, 26, 34, 30
    law = [y for y in sorted(points) if not points[y].get("draft")]
    draft = [y for y in sorted(points) if points[y].get("draft")]
    years = sorted(points)
    vmax = max(max(p["p"], p.get("w") or 0) for p in points.values()) or 1
    vmax *= 1.08
    x = lambda y: L + (y - years[0]) / max(1, years[-1] - years[0]) * (W_ - L - R)
    yv = lambda v: H_ - Bm - v / vmax * (H_ - T - Bm)
    g = []
    step = [t for t in (0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000) if vmax / t <= 4][0]
    t = step
    while t < vmax:
        g.append(f'<line class="grid" x1="{L}" x2="{W_ - R}" y1="{yv(t):.1f}" y2="{yv(t):.1f}"/>'
                 f'<text class="axis-label" x="{L - 8}" y="{yv(t) + 3.5:.1f}" text-anchor="end">{fmt(t, 0 if step >= 1 else 1)}</text>')
        t += step
    plan = [(x(y), yv(points[y]["p"])) for y in law]
    areap = mono_path(plan) + f" L{plan[-1][0]:.1f},{H_ - Bm} L{plan[0][0]:.1f},{H_ - Bm} Z"
    s = [f'<defs><linearGradient id="{gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="ac-stop" stop-opacity=".22"/>'
         f'<stop offset="1" class="ac-stop" stop-opacity="0"/></linearGradient></defs>']
    s += g
    s.append(f'<path d="{areap}" fill="url(#{gid})"/>')
    wk = [(x(y), yv(points[y]["w"])) for y in law if points[y].get("w") is not None]
    if len(wk) > 1:
        s.append(f'<path class="c-wyk" d="{mono_path(wk)}"/>')
        s += [f'<circle class="c-wyk-dot" cx="{px:.1f}" cy="{py:.1f}" r="2.6"/>' for px, py in wk]
    s.append(f'<path class="c-plan" d="{mono_path(plan)}"/>')
    s += [f'<circle class="c-dot" cx="{px:.1f}" cy="{py:.1f}" r="2.4"><title>{y}: plan {fmt(points[y]["p"])} {unit}</title></circle>'
          for (px, py), y in zip(plan, law) if y != highlight]
    for y in draft:
        last = law[-1]
        s.append(f'<path class="c-draft" d="M{x(last):.1f},{yv(points[last]["p"]):.1f} L{x(y):.1f},{yv(points[y]["p"]):.1f}"/>')
        s.append(f'<circle class="c-draft-dot" cx="{x(y):.1f}" cy="{yv(points[y]["p"]):.1f}" r="4.5"><title>{y} (projekt): {fmt(points[y]["p"])} {unit}</title></circle>')
    if highlight in points:
        hx, hy = x(highlight), yv(points[highlight]["p"])
        s.append(f'<circle class="c-halo" cx="{hx:.1f}" cy="{hy:.1f}" r="12"/><circle class="c-sel" cx="{hx:.1f}" cy="{hy:.1f}" r="5.5"/>')
        lab = f"{highlight} · {fmt(points[highlight]['p'])}"
        lx = min(max(hx, L + 60), W_ - R - 60)
        s.append(f'<text class="c-lab" x="{lx:.1f}" y="{max(hy - 18, 14):.1f}" text-anchor="middle">{lab}</text>')
    ticks = [y for y in years if (y - years[0]) % 4 == 0] + ([years[-1]] if (years[-1] - years[0]) % 4 else [])
    s += [f'<text class="axis-label" x="{x(y):.1f}" y="{H_ - 8}" text-anchor="middle">{y}</text>' for y in ticks]
    legend = '<div class="legend"><span class="legend-item"><i class="legend-swatch lg-plan"></i>plan z ustawy</span>'
    if wk:
        legend += '<span class="legend-item"><i class="legend-swatch lg-wyk"></i>wykonanie</span>'
    if draft:
        legend += f'<span class="legend-item"><i class="legend-swatch lg-draft"></i>projekt {PROJECT}</span>'
    legend += f'<span class="legend-item soft">{unit}</span></div>'
    return (f'<div class="chart-wrap pchart"><svg viewBox="0 0 {W_} {H_}" role="img" aria-label="{e(label)}">' + "".join(s)
            + "</svg></div>" + legend)


def spark(vals, color, cur=None):
    """Mini trend like the overview table (110×24)."""
    pts = [(v[0], v[1]) for v in vals if v[1] is not None]
    if len(pts) < 2:
        return ""
    W_, H_ = 110, 24
    x0, x1 = pts[0][0], pts[-1][0]
    mx = max(p[1] for p in pts) or 1
    xy = [(2 + (px - x0) / max(1, x1 - x0) * (W_ - 6), H_ - 3 - py / mx * (H_ - 6)) for px, py in pts]
    dot = ""
    if cur is not None:
        c = next((xy[i] for i, p in enumerate(pts) if p[0] == cur), None)
        if c:
            dot = f'<circle cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="2.6" style="fill:var(--c-{color}-line)"/>'
    return (f'<svg width="{W_}" height="{H_}" aria-hidden="true"><path d="{mono_path(xy)}" fill="none" stroke-width="1.6" '
            f'stroke-linecap="round" style="stroke:var(--c-{color}-line)"/>{dot}</svg>')


# ---------- building blocks (app components: .stat, .card, .tbl, .hint) ----------

def stats(items):
    """items: (label, value, unit, foot, danger)"""
    return '<div class="kpis">' + "".join(
        f'<div class="stat"><p class="stat-label">{e(l)}</p><p class="stat-value{" is-danger" if dg else ""}">{v}'
        f'{f"<span class=unit>{u}</span>" if u else ""}</p><p class="stat-foot">{f}</p></div>' for l, v, u, f, dg in items) + "</div>"


def card(span, label, title, body, right=""):
    return (f'<section class="card {span}"><div class="k"><span class="mono">{label}</span>{right}</div>'
            + (f'<h2 class="h">{title}</h2>' if title else "") + body + "</section>")


def tbl(head, rows):
    """head: [(text, cls)], rows: [[(html, cls)]]"""
    th = "".join(f'<th class="{c}">{t}</th>' for t, c in head)
    tr = "".join("<tr>" + "".join(f'<td class="{c}">{t}</td>' for t, c in r) + "</tr>" for r in rows)
    return f'<div class="tbl-wrap"><table class="tbl"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'


def links_card(span, label, items):
    """items: (href, title, sub)"""
    body = '<div class="plinks">' + "".join(
        f'<a class="plink" href="{h}"><span><b>{e(t)}</b><small>{e(s)}</small></span><i class="ti ti-arrow-up-right" aria-hidden="true"></i></a>'
        for h, t, s in items) + "</div>"
    return card(span, label, "", body)


def faq(items):
    body = "".join(f'<details class="faq-i"><summary>{e(q)}</summary><p>{a}</p></details>' for q, a in items)
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": re.sub("<[^>]+>", "", a)}} for q, a in items]}
    return '<div class="bento">' + card("s12", "Najczęstsze pytania", "", body) + "</div>" + ld_script(ld)


# ---------- identity (schema.org) ----------
ORG_URL = "https://terracracovianum.org"
ORG = {"@type": "Organization", "@id": ORG_URL + "/#org", "name": "Stowarzyszenie Terra Cracovianum",
       "alternateName": "Terra Cracovianum", "url": ORG_URL,
       "logo": {"@type": "ImageObject", "url": SITE + "/logo.svg"},
       # add the association's profiles here (LinkedIn, X, Facebook…) so Google links them together
       "sameAs": [ORG_URL]}
WEBSITE = {"@type": "WebSite", "@id": SITE + "/#website", "url": SITE + "/", "name": "Budżet Polski",
           "alternateName": "budzetpolski.com", "inLanguage": "pl-PL",
           "description": "Interaktywny budżet państwa polskiego od 2011 roku: wydatki, dochody, deficyt i wykonanie, z danych ustaw budżetowych i Ministerstwa Finansów.",
           "publisher": {"@id": ORG["@id"]}}


def dataset():
    files = [("budget-data.json", f"Ustawa budżetowa {LAST}")] + [(f"budget-{y}.json", f"Ustawa budżetowa {y}") for y in range(LAST - 1, FIRST - 1, -1)]
    files += [(f"wykonanie-{y}.json", f"Wykonanie budżetu {y}") for y in range(LAST, FIRST - 1, -1)]
    files += [("budzet-2027.json", f"Projekt budżetu {PROJECT}")]
    return {"@type": "Dataset", "@id": SITE + "/#dataset", "name": f"Budżet państwa polskiego {FIRST}–{PROJECT}: plan, wykonanie i projekt",
            "description": (f"Wydatki budżetu państwa wg działów, części i rodzajów, dochody wg źródeł (VAT, akcyza, CIT, PIT) oraz deficyt, "
                            f"z ustaw budżetowych {FIRST}–{LAST}, sprawozdań Ministerstwa Finansów z wykonania budżetu i projektu ustawy budżetowej na {PROJECT}. "
                            "Kwoty w tys. zł, w formacie JSON."),
            "url": SITE + "/o-projekcie", "keywords": ["budżet państwa", "budżet Polski", "wydatki publiczne", "deficyt budżetowy", "Ministerstwo Finansów", "ustawa budżetowa"],
            "creator": {"@id": ORG["@id"]}, "publisher": {"@id": ORG["@id"]}, "isAccessibleForFree": True, "inLanguage": "pl-PL",
            # our compilation and calculations: CC BY 4.0; the source documents themselves are not copyrighted (art. 4 pr. aut.)
            "license": "https://creativecommons.org/licenses/by/4.0/",
            "usageInfo": SITE + "/o-projekcie#licencja",
            "creditText": "budzetpolski.com, Stowarzyszenie Terra Cracovianum",
            "copyrightNotice": "Dane źródłowe (ustawy budżetowe, sprawozdania Ministerstwa Finansów) nie są przedmiotem prawa autorskiego (art. 4 ustawy o prawie autorskim i prawach pokrewnych). Opracowanie: CC BY 4.0.",
            "temporalCoverage": f"{FIRST}/{PROJECT}", "spatialCoverage": {"@type": "Place", "name": "Polska"},
            "dateModified": TODAY,
            "distribution": [{"@type": "DataDownload", "name": n, "encodingFormat": "application/json", "contentUrl": f"{SITE}/{f}"} for f, n in files]}


def ld_script(obj):
    return '<script type="application/ld+json">' + json.dumps(obj, ensure_ascii=False) + "</script>"


def crumbs_ld(items):
    return ld_script({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": SITE + p} for i, (n, p) in enumerate(items)]})


# ---------- page shell: the app's header, view title and footer ----------
NAV = [("/", "Przegląd"), ("/mapa", "Mapa wydatków"), ("/przeplyw", "Przepływ"), ("/rodzaje", "Rodzaje"),
       ("/trendy", "Trendy"), ("/podatki", "Twoje podatki"), ("/wykonanie", "Wykonanie")]


def page(path, title, desc, *, eyebrow, h1, sub, body, crumbs, tool="", image="og-home.jpg", extra_ld=None, active=None):
    graph = [ORG, WEBSITE, {"@type": "WebPage", "@id": SITE + path, "url": SITE + path, "name": title, "description": desc,
             "inLanguage": "pl-PL", "isPartOf": {"@id": WEBSITE["@id"]}, "publisher": {"@id": ORG["@id"]},
             "dateModified": TODAY, "about": {"@id": SITE + "/#dataset"}}] + (extra_ld or [])
    logo = '<img class="logo" src="/logo.svg?v=16" alt="Terra Cracovianum" width="1757" height="586">'
    nav = "".join(f'<a class="nav-i" href="{h}">{t}</a>' for h, t in NAV)
    return f"""<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#F4F2ED" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0B0B0C" media="(prefers-color-scheme: dark)">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{SITE}{path}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="{SITE}{path}">
<meta property="og:site_name" content="Budżet Polski · Terra Cracovianum">
<meta property="og:locale" content="pl_PL">
<meta property="og:image" content="{SITE}/og/{image}?v=2">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE}/og/{image}?v=2">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.7.0/dist/tabler-icons.min.css">
<link rel="stylesheet" href="/style.css?v={V_STYLE}">
<link rel="stylesheet" href="/page.css?v={V_PAGE}">
<link rel="stylesheet" href="/chat.css?v={V_CHAT_CSS}">
{ld_script({"@context": "https://schema.org", "@graph": graph})}
{crumbs_ld(crumbs)}
</head>
<body class="pbody">
<a class="skip" href="#main">Przejdź do treści</a>
<header class="hdr" id="hdr">
  <div class="wrap hdr-in">
    <a class="brand" href="/" aria-label="Terra Cracovianum: Budżet Polski, strona główna">{logo}</a>
    <nav class="nav" aria-label="Widoki budżetu">{nav}</nav>
    <div class="hdr-r"><a class="ptopics{' is-on' if active == '/tematy' else ''}" href="/tematy"><i class="ti ti-layout-grid" aria-hidden="true"></i>Tematy</a></div>
  </div>
</header>
<main id="main" class="wrap">
  <header class="vhead">
    <div class="vhead-l">
      <p class="mono pcrumb">{eyebrow}</p>
      <h1 class="vh">{h1}</h1>
      <p class="vsub">{sub}</p>
    </div>
    {f'<div class="vtools">{tool}</div>' if tool else ""}
  </header>
  {body}
  <p class="hint"><i class="ti ti-info-circle" aria-hidden="true"></i><span>Przygotowało Stowarzyszenie <a href="https://terracracovianum.org" rel="noopener">Terra Cracovianum</a> wyłącznie na podstawie danych tej strony: ustaw budżetowych {FIRST}–{LAST}, sprawozdań Ministerstwa Finansów z wykonania budżetu i projektu ustawy budżetowej na {PROJECT} (druk sejmowy nr {P27["meta"]["druk_sejmowy"]}). Ceny stałe i kwoty na osobę: inflacja CPI i ludność wg GUS. <a href="/o-projekcie">Źródła i metodologia</a>.</span></p>
</main>
<footer class="foot">
  <div class="wrap foot-in">
    {logo}
    <div class="foot-t">
      <span><a href="/tematy">Wszystkie tematy</a> · <a href="/deficyt">Deficyt</a> · <a href="/dochody">Dochody</a> · <a href="/budzet-2027">Budżet 2027</a> · <a href="/o-projekcie">O projekcie</a> · <a href="/o-projekcie#licencja">Licencja CC BY 4.0</a></span>
      <span>© {date.today().year} Stowarzyszenie <a href="https://terracracovianum.org" rel="noopener">Terra Cracovianum</a></span>
    </div>
  </div>
</footer>
<script src="/chat.js?v={V_CHAT_JS}" defer></script>
</body>
</html>
"""


def pill(href, text, icon="ti-arrow-up-right"):
    return f'<a class="ppill" href="{href}">{e(text)}<i class="ti {icon}" aria-hidden="true"></i></a>'


def crumb_html(items):
    return " · ".join(f'<a href="{p}">{e(n)}</a>' if p else e(n) for n, p in items)


# ---------- pages ----------

def dzial_page(code):
    s = series(code)
    name, sh = NAMES[code], short(code)
    ck = color_key(name)
    cur = s[LAST]
    first_y = min(y for y in s if y <= LAST)
    lc = max((y for y in s if s[y]["w"] is not None), default=None)
    path = f"/wydatki/{slug(name)}"
    per = cur["p"] * 1e9 / pop(LAST)
    ch_first = (cur["p"] / s[first_y]["p"] - 1) * 100
    ch_real = (cur["p"] / real(s[first_y]["p"], first_y) - 1) * 100
    prev = s.get(LAST - 1)
    yoy = (cur["p"] / prev["p"] - 1) * 100 if prev else None
    d27 = s.get(PROJECT)

    k = [(f"Plan {LAST}", fmt(cur["p"]), "mld zł", f"{pct(cur['share'])} wydatków budżetu", False),
         ("Na osobę", fmt(per, 0), "zł", f"w {LAST} r.", False),
         ("Zmiana r/r", pct(yoy, sign=True) if yoy is not None else "—", "", f"wobec {LAST - 1}: {fmt(prev['p'])} mld zł" if prev else "", False),
         (f"Projekt {PROJECT}", fmt(d27["p"]) if d27 else "—", "mld zł" if d27 else "",
          (pct((d27["p"] / cur["p"] - 1) * 100, sign=True) + f" wobec {LAST}") if d27 else "brak w projekcie", False)]
    body = stats(k) + '<div class="bento">'
    head = (f"Od {first_y} r. plan {'wzrósł' if ch_first >= 0 else 'spadł'} z {fmt(s[first_y]['p'])} do {fmt(cur['p'])} mld zł, "
            f"czyli o {pct(abs(ch_first))}. W cenach z {LAST} r. to {pct(ch_real, sign=True)}.")
    body += card("s12", f"Dział {code} · {first_y}–{max(s)}", head,
                 area_chart(s, f"Wydatki w dziale {code} {name}, {first_y}–{max(s)}, mld zł", f"g{code}"))
    rows = []
    for y in sorted(s, reverse=True):
        p = s[y]
        rows.append([(f"{y}{' <span class=soft>projekt</span>' if p.get('draft') else ''}", "l"), (fmt(p["p"]), "n"),
                     (fmt(p["w"]) if p["w"] is not None else "—", ""),
                     (pct(p["w"] / p["p"] * 100, 0) if p["w"] is not None else "—", ""),
                     (pct(p["share"]), ""), (fmt(real(p["p"], y)) if y <= LAST else "—", "")])
    body += card("s8", "Rok po roku · mld zł", "",
                 tbl([("Rok", "l"), ("Plan", ""), ("Wykonanie", ""), ("Wyk. / plan", ""), ("Udział", ""), (f"Ceny {LAST}", "")], rows))
    side = [(f"/{LAST}/mapa/{code}", "Mapa wydatków", f"„{sh}” {LAST}: kto wydaje i na co"), ("/trendy", "Trendy", "porównaj działy, także w cenach stałych")]
    if lc:
        side.insert(1, (f"/{lc}/wykonanie", f"Wykonanie {lc}", "plan obok tego, co wydano"))
    if d27:
        side.append(("/budzet-2027", f"Budżet {PROJECT}", "projekt krok po kroku"))
    body += links_card("s4", "Zobacz na stronie", side)
    body += "</div>"
    q = [(f"Ile Polska wydaje na „{sh}” w {LAST} roku?",
          f"Ustawa budżetowa na {LAST} r. przewiduje w dziale {code} „{e(name)}” {fmt(cur['p'])} mld zł, czyli {pct(cur['share'])} wydatków budżetu państwa i {zl(per)} na mieszkańca."),
         (f"Jak zmieniały się wydatki na „{sh}” od {first_y} roku?",
          f"W {first_y} r. plan wynosił {fmt(s[first_y]['p'])} mld zł, a w {LAST} r. {fmt(cur['p'])} mld zł ({pct(ch_first, sign=True)}; w cenach z {LAST} r. {pct(ch_real, sign=True)}). Część działów zmieniała przez lata zakres, więc skoki mogą wynikać z przesunięć między działami.")]
    if lc:
        q.append((f"Ile faktycznie wydano na „{sh}” w {lc} roku?",
                  f"Według sprawozdania Ministerstwa Finansów wykonanie w {lc} r. wyniosło {fmt(s[lc]['w'])} mld zł przy planie {fmt(s[lc]['p'])} mld zł ({pct(s[lc]['w'] / s[lc]['p'] * 100, 0)} planu)."))
    if d27:
        q.append((f"Ile na „{sh}” przewiduje projekt budżetu na {PROJECT}?",
                  f"Projekt ustawy budżetowej na {PROJECT} r. przewiduje {fmt(d27['p'])} mld zł ({pct((d27['p'] / cur['p'] - 1) * 100, sign=True)} wobec ustawy na {LAST}). To projekt, nie uchwalona ustawa."))
    body += faq(q)
    crumbs = [("Budżet Polski", "/"), ("Tematy", "/tematy"), (sh, path)]
    title = f"{sh}: wydatki budżetu państwa {first_y}–{max(s)} | Budżet Polski"
    desc = (f"Ile Polska wydaje na dział {code} „{name}”? W {LAST} r. plan to {fmt(cur['p'])} mld zł ({pct(cur['share'])} budżetu, {zl(per)} na osobę). "
            f"Dane od {first_y} r., wykonanie i projekt na {PROJECT}.")
    sub = (f"W {LAST} r. państwo zaplanowało na dział {code} „{e(name)}” <b>{fmt(cur['p'])} mld zł</b>: "
           f"{pct(cur['share'])} wydatków budżetu, {zl(per)} na osobę. {rank(code)}. miejsce wśród {len(B[LAST]['dzialy'])} działów.")
    eyebrow = f'<i class="pdot" style="background:var(--c-{ck})"></i>{crumb_html([("Tematy", "/tematy"), (f"Dział {code}", None)])}'
    html_ = page(path, title, desc, eyebrow=eyebrow, h1=em_last(sh), sub=sub, body=body, crumbs=crumbs,
                 tool=pill(f"/{LAST}/mapa/{code}", "Otwórz na mapie"))
    return path, html_, cur["p"], ck, s


def year_page(y):
    m = B[y]["meta"]
    w = W[y]
    path = f"/budzet/{y}"
    full = closed(y)
    ww = w["wykonanie"] if w else None
    per = m["wydatki"] * 1e3 / pop(y)
    k = [("Wydatki · plan", fmt(mld(m["wydatki"])), "mld zł", f"{zl(per)} na osobę", False),
         ("Dochody · plan", fmt(mld(m["dochody"])), "mld zł", f"{pct(m['dochody'] / m['wydatki'] * 100, 0)} wydatków", False),
         ("Deficyt · plan", fmt(mld(m["deficyt"])), "mld zł", "różnica wydatków i dochodów", True),
         (("Wykonanie wydatków" if full else f"Wykonanie · {w['meta']['okres']}") if ww else "Wykonanie",
          fmt(mld(ww["wydatki"])) if ww else "—", "mld zł" if ww else "",
          (f"deficyt {fmt(mld(ww['deficyt']))} mld zł" if full else f"{pct(ww['wydatki'] / m['wydatki'] * 100)} planu") if ww else "brak danych", False)]
    body = stats(k) + '<div class="bento">'
    dz = sorted(B[y]["dzialy"], key=lambda d: -d["plan"])
    rows = []
    for d in dz[:15]:
        nm = short(d["code"]) if d["code"] in NAMES else d["name"]
        ck = color_key(NAMES.get(d["code"], d["name"]))
        link = f'<a href="/wydatki/{slug(NAMES[d["code"]])}">{e(nm)}</a>' if d["code"] in NAMES else e(nm)
        sp = spark([(yy, mld(next((x["plan"] for x in B[yy]["dzialy"] if x["code"] == d["code"]), 0)) or None) for yy in range(FIRST, LAST + 1)], ck, cur=y)
        rows.append([(d["code"], "code l"), (f'<span class="dot" style="background:var(--c-{ck})"></span>{link}', "nm l"),
                     (fmt(mld(d["plan"])), "n"), (pct(d["plan"] / m["wydatki"] * 100), ""),
                     (fmt(mld(w["dzialy"][d["code"]])) if (w and full and d["code"] in w["dzialy"]) else "—", ""), (sp, "sp")])
    top = dz[0]
    body += card("s8", f"Największe działy · {y}", f"Najwięcej: {e(short(top['code']))}, {fmt(mld(top['plan']))} mld zł, czyli {pct(top['plan'] / m['wydatki'] * 100)} wydatków.",
                 tbl([("Kod", "l"), ("Dział", "l"), ("mld zł", ""), ("Udział", ""), ("Wykonanie", ""), (f"{FIRST}–{LAST}", "")], rows))
    bars = ""
    for d in sorted(B[y]["dochody"], key=lambda d: -d["plan"]):
        sh = DOCH_SHORT.get(d["name"], d["name"])
        share = d["plan"] / m["dochody"] * 100
        bars += (f'<div class="taxbar"><span class="taxbar-name">{e(sh)}</span><span class="taxbar-track"><span class="taxbar-fill" '
                 f'style="width:{share:.1f}%;background:var(--c-{SRC_COLOR.get(d["name"], "other")})"></span></span>'
                 f'<span class="taxbar-amt">{fmt(mld(d["plan"]))}</span></div>')
    body += card("s4", f"Skąd pieniądze · {y}", "Dochody wg źródła, plan, mld zł", f'<div class="bars">{bars}</div>')
    if w and w["meta"].get("uwaga") and y in (2020, 2021):
        note = re.sub(r"\s*\(budget-\d+\.json\)|budget-\d+\.json:\s*", "", w["meta"]["uwaga"]).split(". Wydatki wg działów")[0] + "."
        body += card("s12", "Uwaga do danych", "", f'<p class="ptext">{e(note)}</p>')
    yrs = "".join(f'<a class="ppill{" is-on" if yy == y else ""}" href="/budzet/{yy}">{yy}</a>' for yy in range(FIRST, LAST + 1)) + '<a class="ppill" href="/budzet-2027">2027 projekt</a>'
    body += card("s12", "Inne lata", "", f'<div class="pyears">{yrs}</div>')
    body += "</div>"
    q = [(f"Ile wyniosły wydatki budżetu państwa w {y} roku?",
          f"Ustawa budżetowa na {y} r. zakładała {fmt(mld(m['wydatki']))} mld zł wydatków." + (f" Według sprawozdania Ministerstwa Finansów wydano {fmt(mld(ww['wydatki']))} mld zł." if ww and full else "")),
         (f"Jaki był deficyt budżetu w {y} roku?",
          f"Ustawa zakładała deficyt {fmt(mld(m['deficyt']))} mld zł." + (f" Wykonany deficyt: {fmt(mld(ww['deficyt']))} mld zł." if ww and full else "")),
         (f"Na co państwo wydało najwięcej w {y} roku?",
          "Największe działy w planie: " + ", ".join(f"{short(d['code'])} ({fmt(mld(d['plan']))} mld zł)" for d in dz[:3]) + ".")]
    body += faq(q)
    app = "/" if y == LAST else f"/{y}"
    title = f"Budżet państwa {y}: wydatki, dochody, deficyt | Budżet Polski"
    desc = (f"Budżet Polski na {y} rok: {fmt(mld(m['wydatki']))} mld zł wydatków, {fmt(mld(m['dochody']))} mld zł dochodów, deficyt {fmt(mld(m['deficyt']))} mld zł"
            + (f" (wykonanie: {fmt(mld(ww['deficyt']))} mld zł)" if ww and full else "") + ". Największe działy i źródła dochodów.")
    sub = (f"Ustawa budżetowa na {y} r. zakładała <b>{fmt(mld(m['wydatki']))} mld zł wydatków</b>, {fmt(mld(m['dochody']))} mld zł dochodów i {fmt(mld(m['deficyt']))} mld zł deficytu."
           + (f" Faktycznie wydano {fmt(mld(ww['wydatki']))} mld zł." if ww and full else ""))
    return path, page(path, title, desc, eyebrow=crumb_html([("Tematy", "/tematy#lata"), (m["ustawa"], None)]), h1=f'Budżet <em class="s">{y}</em>',
                      sub=sub, body=body, crumbs=[("Budżet Polski", "/"), ("Budżety", "/tematy#lata"), (str(y), path)],
                      tool=pill(app, f"Interaktywny budżet {y}"))


def deficit_page():
    path = "/deficyt"
    pts = {y: {"p": mld(B[y]["meta"]["deficyt"]), "w": mld(W[y]["wykonanie"]["deficyt"]) if closed(y) else None} for y in range(FIRST, LAST + 1)}
    pts[PROJECT] = {"p": P27["ustawa"]["art"]["deficyt"], "w": None, "draft": True}
    lc = max(y for y in pts if pts[y]["w"] is not None)
    k = [(f"Deficyt {LAST} · plan", fmt(pts[LAST]["p"]), "mld zł", f"{zl(pts[LAST]['p'] * 1e9 / pop(LAST))} na osobę", True),
         (f"Projekt {PROJECT}", fmt(pts[PROJECT]["p"]), "mld zł", P27["meta"]["etap_krotko"].lower(), True),
         (f"Wykonanie {lc}", fmt(pts[lc]["w"]), "mld zł", f"plan {fmt(pts[lc]['p'])} mld zł", False),
         (f"Plan {FIRST}", fmt(pts[FIRST]["p"]), "mld zł", f"wykonanie {fmt(pts[FIRST]['w'])} mld zł" if pts[FIRST]["w"] is not None else "", False)]
    body = stats(k) + '<div class="bento">'
    body += card("s12", f"Deficyt · {FIRST}–{PROJECT}", f"Plan deficytu: {fmt(pts[FIRST]['p'])} mld zł w {FIRST} r., {fmt(pts[LAST]['p'])} mld zł w {LAST} r.",
                 area_chart(pts, f"Deficyt budżetu państwa {FIRST}–{PROJECT}, mld zł", "gdef"))
    rows = [[(f'<a href="/budzet/{y}">{y}</a>' if y <= LAST else '<a href="/budzet-2027">2027</a> <span class=soft>projekt</span>', "l"),
             (fmt(p["p"]), "n"), (fmt(p["w"]) if p["w"] is not None else "—", ""),
             (fmt(p["p"] * 1e9 / pop(y), 0) + " zł" if y <= LAST else "—", "")] for y, p in sorted(pts.items(), reverse=True)]
    body += card("s8", "Rok po roku · mld zł", "", tbl([("Rok", "l"), ("Plan", ""), ("Wykonanie", ""), ("Plan na osobę", "")], rows))
    note = re.sub(r"\s*\(budget-\d+\.json\)", "", W[2020]["meta"]["uwaga"]).split(" Stąd")[0]
    body += card("s4", "2020 · uwaga do danych", "", f'<p class="ptext">{e(note)}</p>')
    body += links_card("s12", "Zobacz na stronie", [("/wykonanie", f"Wykonanie {LAST}", "ile wydano i zebrano do tej pory"),
                                                    ("/budzet-2027", f"Budżet {PROJECT}", "projekt ustawy krok po kroku"),
                                                    ("/trendy", "Trendy", f"wydatki, dochody i deficyt od {FIRST} r.")])
    body += "</div>"
    body += faq([(f"Jaki jest deficyt budżetu w {LAST} roku?", f"Ustawa budżetowa na {LAST} r. zakłada deficyt {fmt(pts[LAST]['p'])} mld zł."),
                 (f"Jaki deficyt zakłada projekt budżetu na {PROJECT}?", f"Projekt przewiduje deficyt {fmt(pts[PROJECT]['p'])} mld zł. To projekt, nie uchwalona ustawa."),
                 (f"Jaki był faktyczny deficyt w {lc} roku?", f"Według sprawozdania Ministerstwa Finansów wykonany deficyt wyniósł {fmt(pts[lc]['w'])} mld zł przy planie {fmt(pts[lc]['p'])} mld zł.")])
    title = f"Deficyt budżetowy Polski {FIRST}–{PROJECT}: plan i wykonanie | Budżet Polski"
    desc = f"Deficyt budżetu państwa: {fmt(pts[LAST]['p'])} mld zł w {LAST} r., projekt {fmt(pts[PROJECT]['p'])} mld zł na {PROJECT}. Plan i wykonanie od {FIRST} r."
    sub = (f"Różnica między wydatkami a dochodami budżetu. Ustawa na {LAST} r. zakłada "
           f"<b>{fmt(pts[LAST]['p'])} mld zł</b>, projekt na {PROJECT} r. {fmt(pts[PROJECT]['p'])} mld zł.")
    return path, page(path, title, desc, eyebrow=crumb_html([("Tematy", "/tematy"), (f"{FIRST}–{PROJECT}", None)]), h1='Deficyt <em class="s">budżetu</em>',
                      sub=sub, body=body, crumbs=[("Budżet Polski", "/"), ("Deficyt", path)], tool=pill("/trendy", "Otwórz trendy"))


def revenue_page():
    path = "/dochody"
    names = [d["name"] for d in B[LAST]["dochody"]]
    m = B[LAST]["meta"]
    vat = {y: {"p": mld(next(d["plan"] for d in B[y]["dochody"] if d["name"] == "VAT")),
               "w": mld(W[y]["dochody"]["VAT"]) if closed(y) and "VAT" in W[y].get("dochody", {}) else None} for y in range(FIRST, LAST + 1)}
    vat_share = vat[LAST]["p"] / mld(m["dochody"]) * 100
    dd = {d["name"]: mld(d["plan"]) for d in B[LAST]["dochody"]}
    k = [(f"Dochody {LAST} · plan", fmt(mld(m["dochody"])), "mld zł", f"{zl(m['dochody'] * 1e3 / pop(LAST))} na osobę", False),
         ("VAT", fmt(dd["VAT"]), "mld zł", f"{pct(vat_share)} dochodów", False),
         ("Akcyza", fmt(dd["Akcyza"]), "mld zł", f"{pct(dd['Akcyza'] / mld(m['dochody']) * 100)} dochodów", False),
         ("Deficyt · plan", fmt(mld(m["deficyt"])), "mld zł", "wydatki ponad dochody", True)]
    body = stats(k) + '<div class="bento">'
    body += card("s12", f"VAT · {FIRST}–{LAST}", f"Plan wpływów z VAT: {fmt(vat[FIRST]['p'])} mld zł w {FIRST} r., {fmt(vat[LAST]['p'])} mld zł w {LAST} r.",
                 area_chart(vat, f"Dochody z VAT {FIRST}–{LAST}, mld zł", "gvat"))
    rows = []
    for y in range(LAST, FIRST - 1, -1):
        d = {x["name"]: x["plan"] for x in B[y]["dochody"]}
        rows.append([(f'<a href="/budzet/{y}">{y}</a>', "l")] + [(fmt(mld(d.get(n, 0))), "") for n in names] + [(fmt(mld(B[y]["meta"]["dochody"])), "n")])
    body += card("s12", "Dochody wg źródła · plan, mld zł", "", tbl([("Rok", "l")] + [(e(DOCH_SHORT.get(n, n)), "") for n in names] + [("Razem", "")], rows))
    note = W[LAST]["meta"].get("uwaga", "")
    pit = next((s.strip() + "." for s in note.split(". ") if "PIT" in s and "samorząd" in s), "")
    if pit:
        body += card("s8", f"Uwaga do danych · {LAST}", "", f'<p class="ptext">{e(pit)}</p>')
    body += links_card("s4" if pit else "s12", "Zobacz na stronie", [("/przeplyw", "Przepływ", "skąd pieniądze i dokąd płyną"), ("/podatki", "Twoje podatki", "na co idą podatki konkretnej osoby")])
    body += "</div>"
    body += faq([("Skąd państwo ma najwięcej pieniędzy?", f"Z VAT: ustawa na {LAST} r. zakłada {fmt(vat[LAST]['p'])} mld zł, czyli {pct(vat_share)} dochodów budżetu państwa."),
                 (f"Ile wynoszą dochody budżetu w {LAST} roku?", f"Ustawa budżetowa na {LAST} r. zakłada {fmt(mld(m['dochody']))} mld zł dochodów przy {fmt(mld(m['wydatki']))} mld zł wydatków.")])
    title = f"Dochody budżetu państwa: VAT, CIT, PIT, akcyza {FIRST}–{LAST} | Budżet Polski"
    desc = f"Skąd państwo ma pieniądze? Dochody budżetu na {LAST} r.: {fmt(mld(m['dochody']))} mld zł, w tym VAT {fmt(vat[LAST]['p'])} mld zł. Dochody wg źródła od {FIRST} r."
    sub = f"Ustawa na {LAST} r. zakłada <b>{fmt(mld(m['dochody']))} mld zł dochodów</b>. Najwięcej daje VAT: {fmt(vat[LAST]['p'])} mld zł, czyli {pct(vat_share)} wszystkich dochodów."
    return path, page(path, title, desc, eyebrow=crumb_html([("Tematy", "/tematy"), ("VAT, akcyza, CIT, PIT", None)]), h1='Skąd państwo ma <em class="s">pieniądze</em>?',
                      sub=sub, body=body, crumbs=[("Budżet Polski", "/"), ("Dochody", path)], tool=pill("/przeplyw", "Otwórz przepływ"))


def about_page():
    path = "/o-projekcie"
    files = ", ".join(f'<a href="/{f}">{f}</a>' for f in ["budget-data.json", f"budget-{LAST - 1}.json", f"wykonanie-{LAST - 1}.json", "budzet-2027.json"])
    body = '<div class="bento">'
    body += card("s6", "Czym jest Budżet Polski", "Budżet państwa, który każdy może zrozumieć.",
                 f'<p class="ptext">Bezpłatny serwis, który pokazuje, ile państwo planuje wydać, na co, skąd ma pieniądze i ile faktycznie wydało. '
                 f'Obejmuje ustawy budżetowe z lat {FIRST}–{LAST}, wykonanie budżetu i projekt budżetu na {PROJECT}. Prowadzi go '
                 f'<a href="https://terracracovianum.org" rel="noopener">Stowarzyszenie Terra Cracovianum</a>.</p>')
    body += card("s6", "Skąd są dane", "Tylko oficjalne źródła.",
                 f'<ul class="plist"><li><b>Ustawy budżetowe {FIRST}–{LAST}</b> z Dziennika Ustaw: plan wydatków, dochodów i deficytu.</li>'
                 '<li><b>Sprawozdania Ministerstwa Finansów</b> z wykonania budżetu; w bieżącym roku dane miesięczne i szacunkowe.</li>'
                 f'<li><b>Projekt ustawy budżetowej na {PROJECT}</b> (druk sejmowy nr {P27["meta"]["druk_sejmowy"]}).</li>'
                 '<li><b>GUS</b>: inflacja (CPI) i liczba ludności.</li></ul>')
    body += card("s6", "Jak liczymy", "Te same zasady na każdej stronie.",
                 f'<ul class="plist"><li><b>Plan</b> to kwota z pierwotnej ustawy budżetowej; nowelizacje opisujemy przy danym roku.</li>'
                 '<li><b>Wykonanie</b> pochodzi ze sprawozdań Ministerstwa Finansów; w trakcie roku narastająco.</li>'
                 '<li><b>Dział</b> mówi, na co idą pieniądze, a <b>część budżetowa</b>, kto je wydaje.</li>'
                 f'<li><b>Ceny stałe</b>: kwoty przeliczone na ceny z {LAST} r. średnioroczną inflacją CPI wg GUS.</li>'
                 '<li><b>Na osobę</b>: kwota podzielona przez liczbę ludności wg GUS w danym roku.</li></ul>')
    body += card("s6", "Asystent AI", "Odpowiada tylko liczbami z tej strony.",
                 '<p class="ptext">Do każdego pytania serwer wyszukuje pasujące liczby w danych tej strony i sam wykonuje obliczenia, a model AI tylko je opisuje. '
                 'Pod odpowiedzią jest link do miejsca, gdzie można sprawdzić liczbę. Nie zakładamy kont i nie zapisujemy rozmów; '
                 'ocenione łapką pytania zapisujemy anonimowo, żeby poprawiać asystenta.</p>')
    body += (f'<section class="card s12" id="licencja"><div class="k"><span class="mono">Otwarte dane i licencja</span></div>'
             f'<h2 class="h">Informacja o publicznych pieniądzach należy do obywateli.</h2>'
             f'<p class="ptext">Konstytucja RP gwarantuje prawo do informacji o działalności organów władzy publicznej (art. 61), a gospodarka środkami publicznymi jest jawna (art. 33 ustawy o finansach publicznych).</p>'
             f'<ul class="plist"><li><b>Dane źródłowe są wolne od praw autorskich.</b> Ustawy budżetowe, sprawozdania i inne urzędowe dokumenty nie są przedmiotem prawa autorskiego (art. 4 ustawy o prawie autorskim i prawach pokrewnych).</li>'
             f'<li><b>Nasze opracowanie jest na licencji <a href="https://creativecommons.org/licenses/by/4.0/deed.pl" rel="license noopener">CC BY 4.0</a>.</b> Zestawienia, obliczenia, teksty i wykresy możesz kopiować i wykorzystywać, także komercyjnie, z podaniem źródła: <i>budzetpolski.com, Stowarzyszenie Terra Cracovianum</i>.</li>'
             f'<li><b>Dane GUS</b> (inflacja, ludność) wykorzystujemy z podaniem źródła.</li></ul>'
             f'<p class="ptext">Dane serwisu w formacie JSON (kwoty w tys. zł), np. {files}.</p></section>')
    body += card("s12", "Kontakt i błędy", "", '<p class="ptext">Znalazłeś błąd albo masz pomysł? Napisz przez stronę <a href="https://terracracovianum.org" rel="noopener">terracracovianum.org</a>. Złą odpowiedź asystenta możesz też oznaczyć łapką w dół.</p>')
    body += "</div>"
    return path, page(path, "O projekcie: źródła danych i metodologia | Budżet Polski",
                      f"Budżet Polski prowadzi Stowarzyszenie Terra Cracovianum. Dane z ustaw budżetowych {FIRST}–{LAST}, sprawozdań Ministerstwa Finansów i GUS. Metodologia, otwarte dane, licencja.",
                      eyebrow=crumb_html([("Budżet Polski", "/"), ("O projekcie", None)]), h1='O <em class="s">projekcie</em>',
                      sub="Kto prowadzi serwis, skąd pochodzą dane i jak je liczymy.", body=body, crumbs=[("Budżet Polski", "/"), ("O projekcie", path)],
                      extra_ld=[dataset(), {"@type": "AboutPage", "@id": SITE + path + "#about", "url": SITE + path, "isPartOf": {"@id": WEBSITE["@id"]}, "publisher": {"@id": ORG["@id"]}}])


def hub_page(dz):
    path = "/tematy"
    total = B[LAST]["meta"]["wydatki"]
    tiles = ""
    for code, p, v, ck, s in sorted(dz, key=lambda x: -x[2]):
        sp = spark([(y, s[y]["p"]) for y in sorted(s) if y <= LAST], ck, cur=LAST)
        tiles += (f'<a class="card s4 ptile" href="{p}"><div class="k"><span class="mono"><i class="pdot" style="background:var(--c-{ck})"></i>Dział {code}</span>'
                  f'<i class="ti ti-arrow-up-right" aria-hidden="true"></i></div><h3>{e(short(code))}</h3>'
                  f'<p class="stat-value">{fmt(v, 2 if v < 0.1 else 1)}<span class="unit">mld zł</span></p><div class="ptile-f"><span class="stat-foot">{pct(v * 1e6 / total * 100)} budżetu {LAST}</span>{sp}</div></a>')
    yrs = "".join(f'<a class="ppill" href="/budzet/{y}">{y}</a>' for y in range(LAST, FIRST - 1, -1)) + '<a class="ppill" href="/budzet-2027">2027 projekt</a>'
    body = ('<div class="bento">' + tiles
            + f'<section class="card s12" id="lata"><div class="k"><span class="mono">Budżety rok po roku</span></div><h2 class="h">Każda ustawa budżetowa od {FIRST} r.</h2><div class="pyears">{yrs}</div></section>'
            + links_card("s12", "Wyjaśnienia", [("/deficyt", "Deficyt", f"{FIRST}–{PROJECT}, plan i wykonanie"), ("/dochody", "Dochody", "VAT, akcyza, CIT, PIT"), ("/o-projekcie", "O projekcie", "źródła danych i metodologia")])
            + "</div>")
    return path, page(path, "Tematy: wydatki, dochody i deficyt budżetu państwa | Budżet Polski",
                      f"Wszystkie działy wydatków budżetu państwa, budżety od {FIRST} r., deficyt i dochody. Dane z ustaw budżetowych i Ministerstwa Finansów.",
                      eyebrow=crumb_html([("Budżet Polski", "/"), (f"{len(dz)} działów · {FIRST}–{PROJECT}", None)]), h1='Wszystkie <em class="s">tematy</em>',
                      sub=f"Każdy dział wydatków budżetu na {LAST} r., każdy budżet od {FIRST} r., deficyt i dochody. Od największych wydatków.",
                      body=body, crumbs=[("Budżet Polski", "/"), ("Tematy", path)], active="/tematy")


def write(path, content):
    out = ROOT / (path.lstrip("/") + ".html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(content, encoding="utf-8")


pages, dz_pages = [], []
for code in NAMES:
    p, content, v, ck, s = dzial_page(code)
    write(p, content)
    dz_pages.append((code, p, v, ck, s))
    pages.append((p, "0.7"))
for y in range(FIRST, LAST + 1):
    p, content = year_page(y)
    write(p, content)
    pages.append((p, "0.6"))
for fn in (deficit_page, revenue_page):
    p, content = fn()
    write(p, content)
    pages.append((p, "0.8"))
p, content = about_page()
write(p, content)
pages.append((p, "0.5"))
p, content = hub_page(dz_pages)
write(p, content)
pages.append((p, "0.8"))

# home page: schema.org graph in <head> and a block of plain links in the overview
idx = (ROOT / "index.html").read_text(encoding="utf-8")
home_ld = ld_script({"@context": "https://schema.org", "@graph": [ORG, WEBSITE, dataset(),
    {"@type": "WebPage", "@id": SITE + "/", "url": SITE + "/", "name": "Budżet Polski: na co państwo wydaje pieniądze",
     "isPartOf": {"@id": WEBSITE["@id"]}, "publisher": {"@id": ORG["@id"]}, "about": {"@id": SITE + "/#dataset"}, "dateModified": TODAY, "inLanguage": "pl-PL"}]})
top = sorted(dz_pages, key=lambda x: -x[2])[:10]
links = "".join(f'<li><a href="{p}"><span class="dot" style="background:var(--c-{ck})"></span>{e(short(c))}</a></li>' for c, p, v, ck, s in top)
years = "".join(f'<li><a href="/budzet/{y}">{y}</a></li>' for y in range(LAST, FIRST - 1, -1))
home_block = (f'<section class="card seo-links" aria-labelledby="seo-links-h"><div class="k"><span class="mono">Przeglądaj budżet</span></div><h2 class="h" id="seo-links-h">Każdy temat i każdy rok na osobnej stronie.</h2>'
              f'<div class="seo-cols"><div><h3>Na co idą pieniądze</h3><ul>{links}<li><a href="/tematy">Wszystkie tematy →</a></li></ul></div>'
              f'<div><h3>Budżety rok po roku</h3><ul class="seo-yrs">{years}<li><a href="/budzet-2027">2027 (projekt)</a></li></ul></div>'
              f'<div><h3>Wyjaśnienia</h3><ul><li><a href="/deficyt">Deficyt budżetu {FIRST}–{PROJECT}</a></li><li><a href="/dochody">Dochody: VAT, CIT, PIT, akcyza</a></li>'
              f'<li><a href="/o-projekcie">O projekcie i źródłach danych</a></li><li><a href="https://terracracovianum.org" rel="noopener">Stowarzyszenie Terra Cracovianum</a></li></ul></div></div></section>')


def between(text, start, end, inner):
    a, b = text.index(start) + len(start), text.index(end)
    return text[:a] + inner + text[b:]


idx = between(idx, "<!-- LD:START -->", "<!-- LD:END -->", home_ld)
idx = between(idx, "<!-- LINKS:START -->", "<!-- LINKS:END -->", home_block)
(ROOT / "index.html").write_text(idx, encoding="utf-8")

# sitemap: the app views + all generated pages
APP = [("/", "1.0"), ("/mapa", "0.9"), ("/przeplyw", "0.8"), ("/rodzaje", "0.7"), ("/trendy", "0.8"),
       ("/podatki", "0.9"), ("/wykonanie", "0.8"), ("/budzet-2027", "0.9")]
sm = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
for u, pr in APP + pages:
    sm += f"  <url><loc>{SITE}{u}</loc><lastmod>{TODAY}</lastmod><changefreq>weekly</changefreq><priority>{pr}</priority></url>\n"
(ROOT / "sitemap.xml").write_text(sm + "</urlset>\n", encoding="utf-8")
print(f"{len(pages)} pages, sitemap {len(APP) + len(pages)} URLs")
