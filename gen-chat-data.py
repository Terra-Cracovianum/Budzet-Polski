#!/usr/bin/env python3
"""Build chat-data.json: short facts the budget chatbot is allowed to quote.

The chatbot never answers numbers from memory. The server function
(functions/api/chat.js) picks the facts that match a question from this file
and gives only those to the model.

Run after any change to the budget data:  python3 gen-chat-data.py
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).parent
FIRST, LAST_LAW = 2011, 2026          # years with an adopted budget law
PROJECT_YEAR = 2027                   # year with a draft law (budzet-2027.json)

# Extra words people use for a budget section ("dział"), keyed by its code.
DZIAL_SLOWA = {
    "010": "rolnictwo rolnicy wieś krus dopłaty",
    "150": "przemysł energetyka energia",
    "500": "handel",
    "600": "transport drogi autostrady kolej pkp",
    "630": "turystyka",
    "700": "mieszkania mieszkalnictwo nieruchomości",
    "710": "budownictwo",
    "720": "informatyka cyfryzacja",
    "730": "nauka badania szkolnictwo wyższe uczelnie studia studenci uniwersytety",
    "750": "administracja urzędy urzędnicy ministerstwa",
    "751": "parlament sejm senat prezydent wybory",
    "752": "obrona wojsko armia mon żołnierze zbrojenia bezpieczeństwo",
    "753": "emerytury renty zus fus ubezpieczenia społeczne krus emeryci",
    "754": "policja straż graniczna straż pożarna bezpieczeństwo publiczne",
    "755": "sądy sądownictwo prokuratura więzienia wymiar sprawiedliwości",
    "756": "podatki dochody",
    "757": "dług odsetki obsługa długu zadłużenie",
    "758": "samorządy subwencje rezerwy unia składka ue",
    "801": "oświata szkoły edukacja nauczyciele przedszkola uczniowie",
    "803": "szkolnictwo wyższe uczelnie studia studenci",
    "851": "zdrowie nfz szpitale ochrona zdrowia lekarze",
    "852": "pomoc społeczna zasiłki",
    "853": "polityka społeczna",
    "854": "edukacyjna opieka wychowawcza stypendia",
    "855": "rodzina 800 plus 800+ świadczenie wychowawcze dzieci",
    "900": "środowisko klimat ekologia",
    "921": "kultura dziedzictwo muzea teatry",
    "926": "sport kultura fizyczna",
}

DOCHODY_SLOWA = {
    "VAT": "vat podatek od towarów i usług",
    "Akcyza": "akcyza akcyzowy paliwo alkohol papierosy",
    "CIT": "cit podatek dochodowy od osób prawnych firmy przedsiębiorstwa",
    "PIT": "pit podatek dochodowy od osób fizycznych",
}


def mld(tys):
    """tys. zł -> 'X,Y mld zł' (Polish decimal comma)."""
    return fmt(tys / 1e6)


def fmt(v, digits=1):
    s = f"{v:,.{digits}f}".replace(",", " ").replace(".", ",")
    return f"{s} mld zł"


def pct(a, b):
    return f"{a / b * 100:.0f}%".replace(".", ",") if b else "b.d."


def norm(text):
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return text.replace("ł", "l")


def keys(*parts):
    words = re.findall(r"[a-z0-9+]+", norm(" ".join(parts)))
    return " ".join(sorted(set(w for w in words if len(w) > 2)))


facts = []


def add(year, topic, text, extra="", always=False):
    facts.append({
        "y": year,
        "t": text,
        "k": keys(topic, extra, text if len(text) < 200 else topic),
        **({"a": 1} if always else {}),
    })


def load(name):
    p = ROOT / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


# ---------- 2011–2026: budget laws and execution ----------
for year in range(FIRST, LAST_LAW + 1):
    b = load(f"budget-{year}.json") or (load("budget-data.json") if year == 2026 else None)
    if not b or b["meta"]["rok"] != year:
        continue
    w = load(f"wykonanie-{year}.json")
    m = b["meta"]
    partial = w and w["meta"].get("narastajaco")
    est = " (szacunek MF)" if w and w["meta"].get("szacunek") else ""
    w_label = (f"wykonanie po {w['meta']['miesiace']} mies. ({w['meta']['okres']} {year}){est}"
               if partial else "wykonanie za cały rok")
    # the dział breakdown can be older than the totals
    dm = (w or {}).get("dzialy_meta")
    dz_label = f"wykonanie po {dm['miesiace']} mies. ({dm['okres']} {year})" if dm else w_label

    t = (f"Budżet państwa {year} ({m['ustawa']}): plan wydatków {mld(m['wydatki'])}, "
         f"plan dochodów {mld(m['dochody'])}, deficyt {mld(m['deficyt'])}.")
    if w:
        ww = w["wykonanie"]
        t += (f" {w_label[0].upper() + w_label[1:]}: wydatki {mld(ww['wydatki'])} ({pct(ww['wydatki'], m['wydatki'])} planu), "
              f"dochody {mld(ww['dochody'])}, deficyt {mld(ww['deficyt'])}.")
    if m.get("dlug_pkb_proc"):
        t += f" Dług publiczny ok. {str(m['dlug_pkb_proc']).replace('.', ',')}% PKB."
    if m.get("obrona_pkb_proc"):
        t += f" Wydatki na obronę ok. {str(m['obrona_pkb_proc']).replace('.', ',')}% PKB."
    add(year, "budżet ogółem razem wydatki dochody deficyt suma całość ile wynosi", t,
        "dziura budżetowa wykonanie plan", always=True)
    if w and w["meta"].get("uwaga"):
        add(year, "nowelizacja zmiana planu uwaga wyjaśnienie",
            f"Uwaga do budżetu {year}: " + re.sub(r"\s*\(budget-\d+\.json\)|budget-\d+\.json:\s*", "", w["meta"]["uwaga"]), always=True)

    plan_ov = (w or {}).get("dochody_plan", {})
    name_ov = (w or {}).get("dochody_nazwy", {})
    for d in b["dochody"]:
        t = f"Dochody {year}, {d['name']}: plan {mld(d['plan'])}"
        if w and d["name"] in w.get("dochody", {}):
            if d["name"] in name_ov:
                t += (f". MF podaje go tylko łącznie z podatkiem od gier ({name_ov[d['name']]}): plan {mld(plan_ov.get(d['name'], d['plan']))}, "
                      f"{w_label} {mld(w['dochody'][d['name']])}")
            else:
                t += f", {w_label} {mld(w['dochody'][d['name']])}"
        add(year, f"dochody wpływy podatki {d['name']}", t + ".", DOCHODY_SLOWA.get(d["name"], ""))

    for d in b["dzialy"]:
        t = (f"Wydatki {year}, dział {d['code']} {d['name']}: plan {mld(d['plan'])} "
             f"({pct(d['plan'], m['wydatki'])} wszystkich zaplanowanych wydatków)")
        if w and d["code"] in w.get("dzialy", {}):
            t += f"; {dz_label}: {mld(w['dzialy'][d['code']])}"
        t += "."
        add(year, f"wydatki dział {d['code']} {d['name']}", t, DZIAL_SLOWA.get(d["code"], ""))

    for c in b["czesci"]:
        add(year, f"część {c['code']} {c['name']} dysponent",
            f"Wydatki {year}, część budżetowa {c['code']} ({c['name']}): plan {mld(c['plan'])}.")

    for ty in b["typy"]:
        add(year, f"rodzaj typ wydatków {ty['name']}",
            f"Wydatki {year} według rodzaju, {ty['name']}: plan {mld(ty['plan'])}.")

# ---------- 2027: draft law ----------
p = load("budzet-2027.json")
if p:
    pm, art = p["meta"], p["ustawa"]["art"]
    add(PROJECT_YEAR, "budżet 2027 projekt ogółem wydatki dochody deficyt etap sejm",
        f"Projekt budżetu na {PROJECT_YEAR} (druk sejmowy nr {pm['druk_sejmowy']}; etap: {pm['etap_krotko']}): "
        f"wydatki {fmt(art['wydatki'])}, dochody {fmt(art['dochody'])}, deficyt {fmt(art['deficyt'])}. "
        f"{pm['etap_opis']} To projekt, nie przyjęta ustawa.",
        "przyszły rok następny rok projekt ustawy", always=True)
    add(PROJECT_YEAR, "pożyczki przychody rozchody potrzeby pożyczkowe limit zadłużenia",
        f"Projekt {PROJECT_YEAR}: przychody (głównie nowe pożyczki) {fmt(art['przychody'])}, "
        f"rozchody (spłata starych długów) {fmt(art['rozchody'])}, limit przyrostu zadłużenia {fmt(art['limit_zadluzenia'], 0)}.")
    for d in p["ustawa"]["dochody_pelne"]:
        add(PROJECT_YEAR, f"dochody {d['name']}", f"Projekt {PROJECT_YEAR}, dochody, {d['name']}: {fmt(d['v'])}.",
            next((v for k, v in DOCHODY_SLOWA.items() if k in d["name"]), ""))
    for d in p["ustawa"]["dzialy"]:
        t = f"Projekt {PROJECT_YEAR}, wydatki, dział {d['code']} {d['name']}: {fmt(d['v'])}"
        if d.get("v2026") is not None:
            t += f" (w ustawie na 2026: {fmt(d['v2026'])})"
        add(PROJECT_YEAR, f"wydatki dział {d['code']} {d['name']}", t + ".", DZIAL_SLOWA.get(d["code"], ""))
    for r in p["ustawa"]["rodzaje"]:
        add(PROJECT_YEAR, f"rodzaj wydatków {r['name']}", f"Projekt {PROJECT_YEAR}, {r['name']}: {fmt(r['v'])}. {r['opis']}")
    for f in p["filary"]["pozycje"]:
        add(PROJECT_YEAR, f"{f['name']} filar priorytet", f"Projekt {PROJECT_YEAR}, {f['name']} (łączne wydatki publiczne na ten cel, nie tylko budżet państwa): {fmt(f['v'])}; {f['kicker']}.")
    for x in p["portfel"]:
        add(PROJECT_YEAR, f"{x['name']} {x['name'].replace('+', ' plus')} świadczenie program", f"Projekt {PROJECT_YEAR}, {x['name']}: {fmt(x['v'])}. {x['opis']}")
    for x in p["makro"]:
        add(PROJECT_YEAR, f"{x['name']} makro założenia prognoza gospodarka",
            f"Założenia do budżetu {PROJECT_YEAR}, {x['name']}: {str(x['v']).replace('.', ',')}{x['unit']} ({x['opis']}).")
    dl = p["dlug"]
    add(PROJECT_YEAR, "dług publiczny pkb próg ostrożnościowy konstytucyjny obsługa długu odsetki",
        "Państwowy dług publiczny (% PKB): " + ", ".join(f"{x['rok']}: {str(x['v']).replace('.', ',')}%" for x in dl["pkb"])
        + f". Próg ostrożnościowy {dl['prog_ostroznosciowy']}%, limit konstytucyjny {dl['prog_konstytucyjny']}% PKB. "
        f"Obsługa długu w {PROJECT_YEAR}: {fmt(dl['obsluga_2027'])}.")
    pit = p["pit"]

    def skala(rows):
        return ", ".join(f"od {x['od']:,} zł".replace(",", " ") + (f" do {x['do']:,} zł".replace(",", " ") if x.get("do") else " wzwyż")
                         + f": {x['stawka']}%" for x in rows)
    add(PROJECT_YEAR, "pit skala podatkowa próg podatkowy 12% 32% zmiana",
        f"Skala PIT dziś: {skala(pit['teraz'])}. Proponowana skala: {skala(pit['projekt'])}. "
        f"{pit['uwaga']} Obejmie ok. {str(pit['podatnicy_mln']).replace('.', ',')} mln podatników, "
        f"maksymalnie {pit['max_zysk']} zł zysku rocznie.")
    add(PROJECT_YEAR, "termin sejm senat konstytucja kiedy uchwalenie harmonogram", p["termin"]["opis"])

# ---------- credit rating ----------
r = load("rynek.json")
if r:
    ag = "; ".join(f"{a['nazwa']}: {a['ocena']}, perspektywa {a['perspektywa']} ({a['data']})" for a in r["agencje"])
    add(None, "rating ocena wiarygodność kredytowa agencje s&p moody's fitch obligacje",
        f"Rating Polski (stan na {r['meta']['aktualizacja']}): {ag}. {r['meta']['nota']}")

import hashlib
version = hashlib.sha1(json.dumps(facts, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:10]
out = {
    "_info": "Generated by gen-chat-data.py. Do not edit by hand.",
    "version": version,
    "years": [FIRST, PROJECT_YEAR],
    "current": LAST_LAW,
    "project": PROJECT_YEAR,
    "facts": facts,
}
(ROOT / "chat-data.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"chat-data.json: {len(facts)} facts, {(ROOT / 'chat-data.json').stat().st_size // 1024} KB")
