#!/usr/bin/env python3
"""Audit of the static pages: every number in their tables and key figures must
come from the site's own data files. Recomputed here independently of
gen-pages.py, straight from the JSON files.

    python3 tests/pages-audit.py
"""
import glob
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIRST, LAST, PROJECT = 2011, 2026, 2027


def load(n):
    return json.loads((ROOT / n).read_text(encoding="utf-8"))


B = {y: load("budget-data.json" if y == LAST else f"budget-{y}.json") for y in range(FIRST, LAST + 1)}
W = {y: (load(f"wykonanie-{y}.json") if (ROOT / f"wykonanie-{y}.json").exists() else None) for y in range(FIRST, LAST + 1)}
P27 = load("budzet-2027.json")
CTX = {r["rok"]: r for r in load("context-data.json")["lata"]}
full = lambda y: W[y] is not None and not W[y]["meta"].get("narastajaco")


def n1(v, d=1):  # Polish number as the pages print it
    return f"{v:,.{d}f}".replace(",", " ").replace(".", ",")


def real(v, y):
    f = 1.0
    for t in range(y + 1, LAST + 1):
        f *= CTX[t]["cpi"] / 100
    return v * f


def cells(page):
    """Rows of the first table as plain text cells."""
    t = re.search(r"<tbody>(.*?)</tbody>", page, re.S).group(1)
    rows = []
    for tr in re.findall(r"<tr>(.*?)</tr>", t, re.S):
        rows.append([html.unescape(re.sub(r"<[^>]+>", " ", c)).split() for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)])
    return rows


errors, checked = [], 0


def check(where, got, want):
    global checked
    checked += 1
    if got != want:
        errors.append(f"{where}: strona ma {got!r}, dane dają {want!r}")


# ---- spending areas: table + key figures ----
names26 = {d["code"]: d["name"] for d in B[LAST]["dzialy"]}
for f in sorted(glob.glob(str(ROOT / "wydatki/*.html"))):
    page = Path(f).read_text(encoding="utf-8")
    code = re.search(r"Dział (\d{3}) ·", page).group(1)
    for row in cells(page):
        y = int(row[0][0])
        draft = y == PROJECT
        if draft:
            want_plan = next(d["v"] for d in P27["ustawa"]["dzialy"] if d["code"] == code)
            share = want_plan / P27["ustawa"]["art"]["wydatki"] * 100
        else:
            d = next(d for d in B[y]["dzialy"] if d["code"] == code)
            want_plan, share = d["plan"] / 1e6, d["plan"] / B[y]["meta"]["wydatki"] * 100
        check(f"{Path(f).name} {y} plan", " ".join(row[1]), n1(want_plan))
        wv = W[y]["dzialy"].get(code) if (not draft and full(y)) else None
        check(f"{Path(f).name} {y} wykonanie", " ".join(row[2]), n1(wv / 1e6) if wv is not None else "—")
        check(f"{Path(f).name} {y} udział", " ".join(row[4]), n1(share) + "%")
        check(f"{Path(f).name} {y} ceny {LAST}", " ".join(row[5]), n1(real(want_plan, y)) if not draft else "—")
    plan26 = next(d["plan"] for d in B[LAST]["dzialy"] if d["code"] == code)
    per = round(plan26 * 1e3 / CTX[LAST]["ludnosc"])
    check(f"{Path(f).name} na osobę", re.search(r"Na osobę</p><p class=\"stat-value\">([\d ]+)<", page).group(1), n1(per, 0))
    check(f"{Path(f).name} oficjalna nazwa", f"„{names26[code]}”" in html.unescape(page), True)

# ---- budget years ----
for y in range(FIRST, LAST + 1):
    page = (ROOT / f"budzet/{y}.html").read_text(encoding="utf-8")
    m = B[y]["meta"]
    for lab, key in (("Wydatki · plan", "wydatki"), ("Dochody · plan", "dochody"), ("Deficyt · plan", "deficyt")):
        got = re.search(re.escape(lab) + r'</p><p class="stat-value[^"]*">([\d ,]+)<', page).group(1)
        check(f"budzet/{y} {key}", got, n1(m[key] / 1e6))
    for row in cells(page):
        code = row[0][0]
        d = next(d for d in B[y]["dzialy"] if d["code"] == code)
        check(f"budzet/{y} dział {code} plan", " ".join(row[2]), n1(d["plan"] / 1e6))
        check(f"budzet/{y} dział {code} udział", " ".join(row[3]), n1(d["plan"] / m["wydatki"] * 100) + "%")
        wv = W[y]["dzialy"].get(code) if full(y) else None
        check(f"budzet/{y} dział {code} wykonanie", " ".join(row[4]), n1(wv / 1e6) if wv is not None else "—")

# ---- deficit ----
page = (ROOT / "deficyt.html").read_text(encoding="utf-8")
for row in cells(page):
    y = int(row[0][0])
    want = P27["ustawa"]["art"]["deficyt"] if y == PROJECT else B[y]["meta"]["deficyt"] / 1e6
    check(f"deficyt {y} plan", " ".join(row[1]), n1(want))
    wv = W[y]["wykonanie"]["deficyt"] / 1e6 if y <= LAST and full(y) else None
    check(f"deficyt {y} wykonanie", " ".join(row[2]), n1(wv) if wv is not None else "—")

# ---- revenue ----
page = (ROOT / "dochody.html").read_text(encoding="utf-8")
names = [d["name"] for d in B[LAST]["dochody"]]
for row in cells(page):
    y = int(row[0][0])
    dd = {d["name"]: d["plan"] for d in B[y]["dochody"]}
    for i, nm in enumerate(names, 1):
        check(f"dochody {y} {nm}", " ".join(row[i]), n1(dd.get(nm, 0) / 1e6))
    check(f"dochody {y} razem", " ".join(row[-1]), n1(B[y]["meta"]["dochody"] / 1e6))

# ---- nothing from outside the data ----
FORBIDDEN = ["800+", "800 plus", "policja", "straż", "drogi i kolej", "NFZ", "ZUS", "KRUS", "szpital", "wojsko", "większa część PIT",
             "partią polityczną", "Emerytury, renty"]
for f in [ROOT / "index.html", ROOT / "tematy.html", ROOT / "deficyt.html", ROOT / "dochody.html", ROOT / "o-projekcie.html"] + \
        [Path(p) for p in glob.glob(str(ROOT / "wydatki/*.html")) + glob.glob(str(ROOT / "budzet/*.html"))]:
    text = html.unescape(re.sub(r"<script.*?</script>|<[^>]+>", " ", f.read_text(encoding="utf-8"), flags=re.S))
    for w in FORBIDDEN:
        checked += 1
        if w.lower() in text.lower():
            errors.append(f"{f.name}: fraza spoza danych „{w}”")

print(f"Sprawdzono {checked} wartości na stronach statycznych.")
if errors:
    print(f"BŁĘDY ({len(errors)}):")
    for x in errors[:40]:
        print("  -", x)
    sys.exit(1)
print("ok   każda liczba zgadza się z plikami danych strony; brak fraz spoza danych")
