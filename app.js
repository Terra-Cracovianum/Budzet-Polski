/* Budżet Polski — Terra Cracovianum
   Vanilla JS + D3 v7. No build step.
   Design: Apple minimalism · bento grid · terminal precision · wabi-sabi warmth. */

(function () {
  "use strict";

  // ================= STATE =================
  var DATA = null;                  // current year's budget json
  var YEAR = 2026;                  // currently displayed year
  var LATEST = 2026;                // newest budget year we have
  var YEAR_CACHE = {};              // year -> budget json
  var YEAR_FILES = { 2026: "budget-data.json", 2025: "budget-2025.json", 2024: "budget-2024.json", 2023: "budget-2023.json", 2022: "budget-2022.json", 2021: "budget-2021.json", 2020: "budget-2020.json", 2019: "budget-2019.json", 2018: "budget-2018.json", 2017: "budget-2017.json", 2016: "budget-2016.json", 2015: "budget-2015.json", 2014: "budget-2014.json", 2013: "budget-2013.json", 2012: "budget-2012.json", 2011: "budget-2011.json" };
  var axis = "dzialy";              // "dzialy" | "czesci"
  var view = "overview";            // overview | tree | flow | type | trends | taxes | exec
  var path = [];                    // drill-down stack (części axis)
  var dzialDetail = null;           // open dział sheet (code) or null
  var treeAsTable = false;          // map shown as a table
  var taxAmount = 5000;             // shared by overview + taxes view
  var P27 = null;                   // budzet-2027.json (read only, for the overview card)

  var fmtPL = new Intl.NumberFormat("pl-PL");
  var tooltip = document.getElementById("tooltip");

  var MOBILE_Q = window.matchMedia("(max-width: 760px)");
  var COARSE_Q = window.matchMedia("(pointer: coarse)");
  function isMobile() {
    if (MOBILE_Q.matches) return true;
    if (COARSE_Q.matches && window.innerWidth < 900) return true;
    return false;
  }
  var MOBILE_TOP = 12;              // rows shown before grouping into "Pozostałe"
  var restExpanded = false;

  var VIEWS = {
    overview: { tab: "tab-overview", panel: "panel-overview", slug: "" },
    tree:     { tab: "tab-tree",     panel: "panel-tree",     slug: "mapa" },
    flow:     { tab: "tab-flow",     panel: "panel-flow",     slug: "przeplyw" },
    type:     { tab: "tab-type",     panel: "panel-type",     slug: "rodzaje" },
    trends:   { tab: "tab-trends",   panel: "panel-trends",   slug: "trendy" },
    taxes:    { tab: "tab-taxes",    panel: "panel-taxes",    slug: "podatki" },
    exec:     { tab: "tab-exec",     panel: "panel-exec",     slug: "wykonanie" }
  };
  var VIEW_ORDER = ["overview", "tree", "flow", "type", "trends", "taxes", "exec"];
  function viewFromSlug(s) {
    for (var k in VIEWS) if (VIEWS[k].slug === s) return k;
    return "overview";
  }

  // ================= CATEGORY COLOURS =================
  function colorKey(name) {
    var n = (name || "").toLowerCase();
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
  var CMAP = {
    social:   { fill: "var(--c-social)",   ink: "var(--c-social-ink)",   line: "var(--c-social-line)",   label: "Społeczne" },
    transfer: { fill: "var(--c-transfer)", ink: "var(--c-transfer-ink)", line: "var(--c-transfer-line)", label: "Transfery i rozliczenia" },
    defense:  { fill: "var(--c-defense)",  ink: "var(--c-defense-ink)",  line: "var(--c-defense-line)",  label: "Obrona" },
    debt:     { fill: "var(--c-debt)",     ink: "var(--c-debt-ink)",     line: "var(--c-debt-line)",     label: "Dług" },
    health:   { fill: "var(--c-health)",   ink: "var(--c-health-ink)",   line: "var(--c-health-line)",   label: "Zdrowie" },
    edu:      { fill: "var(--c-edu)",      ink: "var(--c-edu-ink)",      line: "var(--c-edu-line)",      label: "Edukacja i nauka" },
    admin:    { fill: "var(--c-admin)",    ink: "var(--c-admin-ink)",    line: "var(--c-admin-line)",    label: "Państwo i prawo" },
    infra:    { fill: "var(--c-infra)",    ink: "var(--c-infra-ink)",    line: "var(--c-infra-line)",    label: "Infrastruktura i gospodarka" },
    other:    { fill: "var(--c-other)",    ink: "var(--c-other-ink)",    line: "var(--c-other-line)",    label: "Pozostałe" }
  };
  var CMAP_ORDER = ["social", "transfer", "defense", "debt", "health", "edu", "admin", "infra", "other"];

  // resolve a CSS var to a concrete colour (SVG attributes, canvas)
  function cssVar(v) {
    var m = /var\((--[\w-]+)\)/.exec(v);
    if (!m) return v;
    return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || v;
  }

  // ================= NUMBER FORMATTING =================
  // all amounts in the data are in thousands of złoty (tys. zł)
  // pl-PL leaves 4-digit numbers ungrouped ("5000"); Apple-style tables group them too ("5 000")
  function grp(s) { return String(s).replace(/(^|[^\d,])(\d)(\d{3})(?=$|[^\d])/g, "$1$2\u00a0$3"); }
  function money(thousands) { return grp(money0(thousands)); }
  function moneyShort(thousands) { return thousands === 0 ? "0" : grp(moneyShort0(thousands)); }
  function money0(thousands) {
    var zl = thousands * 1000;
    if (Math.abs(zl) >= 1e9) return (zl / 1e9).toLocaleString("pl-PL", { maximumFractionDigits: 1 }) + " mld zł";
    if (Math.abs(zl) >= 1e6) return (zl / 1e6).toLocaleString("pl-PL", { maximumFractionDigits: 0 }) + " mln zł";
    return fmtPL.format(zl) + " zł";
  }
  function moneyShort0(thousands) {
    var zl = thousands * 1000;
    if (Math.abs(zl) >= 1e12) return (zl / 1e12).toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + " bln";
    if (Math.abs(zl) >= 1e9) return (zl / 1e9).toLocaleString("pl-PL", { maximumFractionDigits: 1 }) + " mld";
    if (Math.abs(zl) >= 1e6) return (zl / 1e6).toLocaleString("pl-PL", { maximumFractionDigits: 0 }) + " mln";
    return fmtPL.format(Math.round(zl / 1000)) + " tys.";
  }
  function pl(x, d) { return grp(x.toLocaleString("pl-PL", { minimumFractionDigits: d, maximumFractionDigits: d })); }
  function pct(x, d) { return pl(x, d == null ? 1 : d) + "%"; }
  function mldN(thousands, d) { return pl(thousands / 1e6, d == null ? 1 : d); }  // "918,9"
  function zl(v) { return grp(fmtPL.format(Math.round(v))) + " zł"; }
  function exactTys(thousands) { return fmtPL.format(Math.round(thousands)) + " tys. zł"; }
  // compact amount for tiles: "54,2 mld" / "312 mln"
  function amtShort(thousands) {
    if (Math.abs(thousands) >= 1e6) return pl(thousands / 1e6, 1).replace(/,0$/, "") + " mld";
    return pl(thousands / 1e3, 0) + " mln";
  }
  function amtNum(thousands) {   // number only, unit given separately
    if (Math.abs(thousands) >= 1e6) return { n: pl(thousands / 1e6, 1).replace(/,0$/, ""), u: "mld zł" };
    return { n: pl(thousands / 1e3, 0), u: "mln zł" };
  }
  // year-over-year change in %, null when not comparable
  function rr(cur, prev) { return (prev != null && prev > 0 && cur != null) ? (cur / prev - 1) * 100 : null; }
  // arrow + %, colour only where the direction is unambiguous (goodWhenDown)
  function deltaHtml(p, goodWhenDown, suffix) {
    suffix = suffix == null ? " r/r" : suffix;
    if (p == null || !isFinite(p)) return '<span class="delta">—</span>';
    if (Math.abs(p) < 0.05) return '<span class="delta">bez zmian' + suffix + "</span>";
    var cls = goodWhenDown == null ? "" : ((p < 0) === goodWhenDown ? " up" : " dn");
    return '<span class="delta' + cls + '">' + (p > 0 ? "▲ " : "▼ ") + pl(Math.abs(p), 1) + "%" + suffix + "</span>";
  }

  // ================= NAMES =================
  // Older laws were extracted with a broken Polish encoding ("LeĞnictwo"). The data files stay
  // untouched; we repair the characters only for display.
  var CHARFIX = { "Ŝ": "ż", "Ğ": "ś", "ü": "ć", "Ċ": "ę", "Ĕ": "ń", "Ī": "ż", "ĩ": "Ż", "ē": "Ń", "ĉ": "Ę", "ĝ": "Ś", "Ĩ": "ź", "û": "Ć" };
  var NAME_CACHE = {};
  function fixName(s) {
    if (s == null) return "";
    if (NAME_CACHE[s]) return NAME_CACHE[s];
    var out = s.replace(/[ŜĞüĊĔĪĩēĉĝĨû]/g, function (c) { return CHARFIX[c]; });
    // ALL CAPS part names → sentence case for calmer reading
    if (out.length > 4 && out === out.toUpperCase() && /[A-ZĄĆĘŁŃÓŚŹŻ]{4}/.test(out)) {
      out = out.charAt(0) + out.slice(1).toLowerCase();
    }
    NAME_CACHE[s] = out;
    return out;
  }
  // same canonical names as gen-trends.py, so a dział can be matched across years in trends-data.json
  var NORM = {
    "Bezpieczeństwo publiczne i ochrona ppoż.": "Bezpieczeństwo publiczne i ochrona przeciwpożarowa",
    "Urzędy naczelnych organów władzy państwowej": "Urzędy naczelnych organów władzy państwowej, kontroli i ochrony prawa oraz sądownictwa",
    "Ogrody botaniczne i zoologiczne": "Ogrody botaniczne i zoologiczne oraz naturalne obszary i obiekty chronionej przyrody",
    "Dochody od osób prawnych, fizycznych i innych jednostek": "Różne rozliczenia"
  };
  function normName(n) { var f = fixName(n); return NORM[f] || f; }
  // short, friendly labels for the biggest działy (full names stay in tooltips and detail)
  var SHORT = {
    "753": "Ubezpieczenia społeczne", "758": "Różne rozliczenia", "752": "Obrona narodowa", "757": "Obsługa długu",
    "855": "Rodzina", "851": "Ochrona zdrowia", "730": "Szkolnictwo wyższe i nauka", "754": "Bezpieczeństwo publiczne",
    "750": "Administracja publiczna", "751": "Urzędy naczelne i sądy", "755": "Wymiar sprawiedliwości", "600": "Transport i łączność",
    "010": "Rolnictwo", "700": "Gospodarka mieszkaniowa", "852": "Pomoc społeczna", "853": "Polityka społeczna",
    "801": "Oświata i wychowanie", "921": "Kultura", "900": "Gospodarka komunalna", "150": "Przetwórstwo przemysłowe",
    "100": "Górnictwo", "720": "Informatyka", "710": "Działalność usługowa", "854": "Opieka wychowawcza",
    "926": "Kultura fizyczna", "020": "Leśnictwo", "050": "Rybołówstwo", "500": "Handel", "630": "Turystyka",
    "925": "Ogrody i przyroda", "550": "Hotele i restauracje", "756": "Dochody od osób prawnych"
  };
  function dzialShort(code, name) { return SHORT[code] || fixName(name); }
  var DOCH_SHORT = { "Inne dochody podatkowe i niepodatkowe": "Pozostałe dochody" };
  function lcFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  // "co piąta złotówka" phrasing for a share (0..1)
  var ORD = { 2: "druga", 3: "trzecia", 4: "czwarta", 5: "piąta", 6: "szósta", 7: "siódma", 8: "ósma", 9: "dziewiąta", 10: "dziesiąta" };
  function everyNth(share) {
    if (!(share > 0)) return null;
    var inv = 1 / share, n = Math.round(inv);
    if (!ORD[n]) return null;
    var diff = inv - n;
    var pre = Math.abs(diff) < 0.06 ? "" : (diff < 0 ? "ponad " : "prawie ");
    return pre + "co " + ORD[n] + " złotówka";
  }
  function ucFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // Polish plural: 1 część / 2-4 części / 5+ części
  function plural(n, one, few, many) {
    n = Math.abs(n); var d10 = n % 10, d100 = n % 100;
    if (n === 1) return one;
    if (d10 >= 2 && d10 <= 4 && !(d100 >= 12 && d100 <= 14)) return few;
    return many;
  }

  // ================= DATA ACCESS =================
  function getJSON(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(u + " HTTP " + r.status); return r.json(); }); }
  function loadYear(yr) {
    if (YEAR_CACHE[yr]) return Promise.resolve(YEAR_CACHE[yr]);
    if (!YEAR_FILES[yr]) return Promise.resolve(null);
    return getJSON(YEAR_FILES[yr]).then(function (j) { YEAR_CACHE[yr] = j; return j; });
  }
  function prevData() { return YEAR_CACHE[YEAR - 1] || null; }
  function dzialByCode(json, code) {
    if (!json || !json.dzialy) return null;
    for (var i = 0; i < json.dzialy.length; i++) if (json.dzialy[i].code === code) return json.dzialy[i];
    return null;
  }
  function dzialyDesc() { return DATA.dzialy.slice().sort(function (a, b) { return b.plan - a.plan; }); }
  function prevRR(code) {
    var p = dzialByCode(prevData(), code), c = dzialByCode(DATA, code);
    return (p && c) ? rr(c.plan, p.plan) : null;
  }
  function perCap(thousands, year) { var p = popOf(year || YEAR); return p ? thousands * 1000 / p : null; }
  function yearIsPast() { return YEAR < LATEST; }

  // ================= COUNT-UP =================
  var prevStatVals = {};
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function tweenValue(from, to, dur, onUpdate) {
    if (prefersReduced() || !dur || from === to) { onUpdate(to); return; }
    var startTs = null;
    function step(ts) {
      if (startTs === null) startTs = ts;
      var p = Math.min(1, (ts - startTs) / dur);
      onUpdate(from + (to - from) * easeOutCubic(p));
      if (p < 1) requestAnimationFrame(step);
      else onUpdate(to);
    }
    requestAnimationFrame(step);
  }
  // formatter locked to the TARGET's magnitude so the unit never flickers mid-count
  function statMoneyFmt(toThousands) {
    var zl2 = toThousands * 1000, div, unit, dec;
    if (Math.abs(zl2) >= 1e9) { div = 1e9; unit = "mld zł"; dec = 1; }
    else if (Math.abs(zl2) >= 1e6) { div = 1e6; unit = "mln zł"; dec = 0; }
    else { div = 1; unit = "zł"; dec = 0; }
    return function (vThousands) {
      var n = (vThousands * 1000) / div;
      return { num: grp(n.toLocaleString("pl-PL", { minimumFractionDigits: dec, maximumFractionDigits: dec })), unit: unit };
    };
  }
  function statPctFmt(dec) {
    return function (v) { return { num: v.toLocaleString("pl-PL", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + "%", unit: "" }; };
  }
  // count a plain number inside an element (keeps last value per key)
  function countTo(el, key, to, dec, suffixHtml) {
    if (!el) return;
    var from = prevStatVals[key]; if (from == null) from = to * 0.6;
    prevStatVals[key] = to;
    tweenValue(from, to, 900, function (v) { el.innerHTML = pl(v, dec) + (suffixHtml || ""); });
  }

  // ================= TEXT FITTING (no overlaps, ever) =================
  // shrink an SVG <text> with an ellipsis until it fits maxW; remove it if even "…" won't fit
  function fitText(textSel, maxW) {
    var node = textSel.node();
    if (!node || maxW <= 8) { if (node) textSel.remove(); return false; }
    var full = node.textContent;
    if (node.getComputedTextLength() <= maxW) return true;
    var lo = 0, hi = full.length;
    while (lo < hi) {             // binary search the longest prefix that fits
      var mid = Math.ceil((lo + hi) / 2);
      node.textContent = full.slice(0, mid).replace(/[\s,.;·–-]+$/, "") + "…";
      if (node.getComputedTextLength() <= maxW) lo = mid; else hi = mid - 1;
    }
    if (lo < 3) { textSel.remove(); return false; }
    node.textContent = full.slice(0, lo).replace(/[\s,.;·–-]+$/, "") + "…";
    return true;
  }
  function textW(textSel) { var n = textSel.node(); return n ? n.getComputedTextLength() : 0; }

  // ================= TOOLTIP =================
  function showTipHtml(ev, html) {
    tooltip.innerHTML = html;
    tooltip.style.opacity = "1";
    positionTip(ev);
  }
  function positionTip(ev) {
    var x = ev.clientX + 16, y = ev.clientY + 16;
    var r = tooltip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - 12) x = ev.clientX - r.width - 16;
    if (y + r.height > window.innerHeight - 12) y = ev.clientY - r.height - 16;
    tooltip.style.left = Math.max(8, x) + "px";
    tooltip.style.top = Math.max(8, y) + "px";
  }
  function hideTip() { tooltip.style.opacity = "0"; }
  document.addEventListener("scroll", hideTip, { passive: true });

  // ================= BOOTSTRAP =================
  function soft(p) { return p.catch(function (e) { console.error(e); return null; }); }

  Promise.all([
    getJSON("budget-data.json"),
    soft(getJSON("trends-data.json")),
    soft(getJSON("context-data.json")),
    soft(loadYear(2025))
  ]).then(function (r) {
    DATA = r[0];
    YEAR = LATEST = (DATA.meta && DATA.meta.rok) || 2026;
    YEAR_CACHE[YEAR] = DATA;
    TRENDS = r[1];
    CONTEXT = r[2]; if (CONTEXT) buildPriceLevels();

    wireNav();
    wireAxis();
    wireYear();
    wireTutorial();
    wireOverview();
    wireSheet();
    wireTaxes();
    updateExecTab();
    window.addEventListener("resize", debounce(onResize, 150));
    window.addEventListener("popstate", syncFromUrl);
    soft(getJSON("budzet-2027.json")).then(function (j) { P27 = j; if (view === "overview") { render2027(); renderYearChart(); } });

    var st = document.getElementById("boot-state"); if (st) st.remove();
    whenFonts(function () {
      initFromUrl();
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.body.classList.add("is-loaded");
          maybeShowFirstVisitTutorial();
        });
      });
    });
  }).catch(function (err) {
    var s = document.getElementById("boot-state");
    if (s) s.innerHTML = '<i class="ti ti-alert-triangle"></i> Nie udało się wczytać danych budżetu. Odśwież stronę lub spróbuj ponownie później.';
    document.body.classList.add("is-loaded");
    wireTutorial();
    console.error(err);
  });

  // text is measured for layout, so wait for the web fonts (with a safety timeout)
  function whenFonts(cb) {
    var done = false;
    function go() { if (!done) { done = true; cb(); } }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go);
    setTimeout(go, 1800);
    if (!document.fonts) go();
  }

  // ================= NAVIGATION =================
  function wireNav() {
    var nav = document.getElementById("nav");
    VIEW_ORDER.forEach(function (v) {
      var b = document.getElementById(VIEWS[v].tab);
      b.addEventListener("click", function () { switchView(v, { scroll: true }); });
    });
    // roving focus with arrow keys (WAI-ARIA tabs)
    nav.addEventListener("keydown", function (ev) {
      var tabs = Array.prototype.slice.call(nav.querySelectorAll('[role="tab"]')).filter(function (t) { return t.style.display !== "none"; });
      var i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      var j = null;
      if (ev.key === "ArrowRight") j = (i + 1) % tabs.length;
      else if (ev.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      else if (ev.key === "Home") j = 0;
      else if (ev.key === "End") j = tabs.length - 1;
      if (j == null) return;
      ev.preventDefault();
      tabs[j].focus();
      tabs[j].click();
    });
    document.addEventListener("click", function (ev) {
      var go = ev.target.closest && ev.target.closest("[data-go]");
      if (go) { ev.preventDefault(); switchView(go.getAttribute("data-go"), { scroll: true }); }
    });
  }

  function switchView(v, opts) {
    opts = opts || {};
    if (!VIEWS[v]) v = "overview";
    if (dzialDetail != null) closeDzial(true);
    var prevView = view;
    function apply() {
      view = v;
      VIEW_ORDER.forEach(function (k) {
        var sel = k === v;
        var tab = document.getElementById(VIEWS[k].tab);
        tab.setAttribute("aria-selected", sel ? "true" : "false");
        tab.tabIndex = sel ? 0 : -1;
        var panel = document.getElementById(VIEWS[k].panel);
        panel.classList.toggle("is-active", sel);
        if (sel) panel.removeAttribute("hidden"); else panel.setAttribute("hidden", "");
        panel.classList.remove("fade-in");
      });
      if (opts.scroll) window.scrollTo({ top: 0 });
      renderView(v);
      writeUrl();
      // keep the active tab visible in the horizontally-scrolling mobile nav
      var tabEl = document.getElementById(VIEWS[v].tab);
      if (tabEl && tabEl.scrollIntoView && document.getElementById("nav").scrollWidth > document.getElementById("nav").clientWidth) {
        tabEl.scrollIntoView({ block: "nearest", inline: "center", behavior: prefersReduced() ? "auto" : "smooth" });
      }
    }
    if (prevView === v) { apply(); return; }
    if (!prefersReduced()) {
      apply();
      var panel = document.getElementById(VIEWS[v].panel);
      void panel.offsetWidth;
      panel.classList.add("fade-in");
    } else apply();
  }

  function renderView(v) {
    hideTip();
    var yr = YEAR;
    setText("tree-k", "Mapa wydatków · " + yr);
    setText("flow-k", "Przepływ pieniędzy · " + yr);
    setText("type-k", "Rodzaje wydatków · " + yr);
    setText("taxes-k", "Twoje podatki · " + yr);
    setText("exec-k", "Plan i wykonanie · " + yr);
    if (v === "overview") renderOverview();
    else if (v === "tree") { drawTree(); renderTreeInsights(); }
    else if (v === "flow") { drawSankey(); renderFlowInsights(); }
    else if (v === "type") { drawTypes(); }
    else if (v === "trends") loadTrends(function () { drawTrends(); });
    else if (v === "taxes") drawTaxes();
    else if (v === "exec") drawExec();
  }

  function setText(id, t) { var el = document.getElementById(id); if (el) el.textContent = t; }
  function setHtml(id, h) { var el = document.getElementById(id); if (el) el.innerHTML = h; }

  // ================= URL =================
  function writeUrl() {
    var p = new URLSearchParams();
    if (YEAR !== LATEST || dzialDetail != null) p.set("rok", YEAR);
    if (VIEWS[view].slug) p.set("widok", VIEWS[view].slug);
    if (dzialDetail != null) p.set("dzial", dzialDetail);
    var q = p.toString();
    history.replaceState(history.state, "", q ? "?" + q : location.pathname);
  }
  function initFromUrl() {
    var p = new URLSearchParams(location.search);
    var v = viewFromSlug(p.get("widok") || "");
    var dz = p.get("dzial"), rok = parseInt(p.get("rok"), 10);
    // old deep links (?rok=2025&dzial=752) opened the map — keep that behaviour
    if (dz && !p.get("widok")) v = "tree";
    function finish() {
      switchView(v);
      if (dz && dzialMeta(dz)) openDzial(dz, false);
    }
    if (rok && YEAR_FILES[rok] && rok !== YEAR) setYear(rok, finish, true);
    else finish();
  }
  function syncFromUrl() {
    var p = new URLSearchParams(location.search);
    var dz = p.get("dzial"), rok = parseInt(p.get("rok"), 10);
    if (dz && (rok || LATEST) === YEAR && dzialMeta(dz)) {
      if (dzialDetail !== dz) openDzial(dz, false);
    } else if (dzialDetail != null) {
      closeDzial(false);
    }
  }

  // ================= YEAR =================
  function wireYear() {
    var sel = document.getElementById("year-select");
    sel.addEventListener("change", function () { setYear(parseInt(sel.value, 10)); });
  }

  function setYear(yr, onDone, silent) {
    if (!YEAR_FILES[yr]) return;
    if (yr === YEAR) { if (onDone) onDone(); return; }
    var sel = document.getElementById("year-select");
    if (sel) sel.value = String(yr);
    if (view === "exec" && !WYK_FILES[yr]) switchView("overview");
    path = [];
    restExpanded = false;

    Promise.all([loadYear(yr), soft(loadYear(yr - 1))]).then(function (r) {
      var json = r[0];
      DATA = json;
      YEAR = yr;
      updateExecTab();
      document.title = "Budżet Polski " + yr + ": na co państwo wydaje pieniądze | Terra Cracovianum";
      // the dział sheet stays open across a year change if that dział exists in the new year
      if (dzialDetail != null) {
        if (dzialMeta(dzialDetail)) {
          drawDzialDetail(dzialDetail, true);
          history.replaceState({ dzial: dzialDetail }, "", "?rok=" + yr + (VIEWS[view].slug ? "&widok=" + VIEWS[view].slug : "") + "&dzial=" + dzialDetail);
        } else closeDzial(true);
      }
      if (!silent) {
        if (view === "flow" || view === "type") crossfadeRedraw(function () { renderView(view); });
        else renderView(view);
      }
      writeUrl();
      if (onDone) onDone();
    }).catch(function (err) {
      console.error(err);
      if (sel) sel.value = String(YEAR);
    });
  }

  function onResize() {
    if (view === "overview") renderOverview(true);
    else if (view === "tree") drawTree();
    else if (view === "flow") drawSankey();
    else if (view === "trends" && TRENDS) drawTrendCharts();
    else if (view === "taxes" && DATA) drawTaxes(true);
    else if (view === "exec" && DATA) drawExec();
  }
  (function wireBreakpoint() {
    var handler = function () { restExpanded = false; if (DATA) onResize(); };
    [MOBILE_Q, COARSE_Q].forEach(function (q) {
      if (q.addEventListener) q.addEventListener("change", handler);
      else if (q.addListener) q.addListener(handler);
    });
  })();

  // insight cards ("Co tu widzisz"): three short, computed sentences
  function renderInsights(hostId, items) {
    var host = document.getElementById(hostId); if (!host) return;
    host.innerHTML = items.filter(Boolean).slice(0, 3).map(function (t, i) {
      return '<div class="card ins rv" style="--d:' + i + '"><span class="ins-n" aria-hidden="true">' + (i + 1) + "</span><p>" + t + "</p></div>";
    }).join("");
  }

  // =====================================================================
  // ============================ PRZEGLĄD ================================
  // =====================================================================
  function wireOverview() {
    var inp = document.getElementById("ov-tax-input");
    if (inp) inp.addEventListener("input", function () {
      var v = parseFloat(inp.value); taxAmount = (isFinite(v) && v >= 0) ? v : 0;
      syncTaxInputs(inp);
      renderOvTax();
    });
    var yc = document.getElementById("year-chart");
    if (yc) yc.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowLeft" && YEAR_FILES[YEAR - 1]) { ev.preventDefault(); setYear(YEAR - 1); }
      if (ev.key === "ArrowRight" && YEAR_FILES[YEAR + 1]) { ev.preventDefault(); setYear(YEAR + 1); }
    });
  }

  function renderOverview(resizeOnly) {
    renderHero(resizeOnly);
    renderYearChart();
    renderTicker(resizeOnly);
    renderOvMap();
    renderOvSrc();
    renderOvExec();
    renderOvGauge();
    renderOvTax();
    renderOvTable();
    render2027();
  }

  // ---------- hero ----------
  function renderHero(resizeOnly) {
    var m = DATA.meta, yr = m.rok || YEAR;
    var dz = (m.ustawa || "").match(/Dz\.U\.[^)]*/);
    setText("hero-eyebrow", "Budżet państwa " + yr + " · plan z ustawy" + (dz ? " · " + dz[0] : ""));
    var amt = document.getElementById("hero-amt"), unit = document.getElementById("hero-unit");
    var f = statMoneyFmt(m.wydatki);
    if (!resizeOnly) {
      var from = prevStatVals.__hero; if (from == null) from = m.wydatki * 0.82;
      tweenValue(from, m.wydatki, 1100, function (v) { var r = f(v); amt.textContent = r.num; unit.textContent = r.unit; });
      prevStatVals.__hero = m.wydatki;
    }
    var pc = perCap(m.wydatki, yr);
    var verb = yearIsPast() ? "planowało wydać" : "planuje wydać";
    setHtml("hero-lead", "Tyle państwo " + verb + " w " + yr + " roku." +
      (pc ? " To <b>" + zl(pc) + "</b> na każdą osobę w Polsce, <em class=\"s\">od niemowlęcia po seniora.</em>" : ""));
  }

  // ---------- year chart (the year picker) ----------
  var ycLast = null;
  function renderYearChart() {
    var svgEl = document.getElementById("year-chart");
    if (!svgEl || !TRENDS) return;
    var pts = TRENDS.lata.map(function (r) { return { rok: r.rok, v: r.wydatki / 1e6 }; });
    var cur27 = p27Current();
    var W = svgEl.clientWidth || 520, H = svgEl.clientHeight || 170;
    var m = { l: 6, r: 22, t: 30, b: 22 };
    var lastYr = cur27 ? 2027 : pts[pts.length - 1].rok;
    var x = d3.scaleLinear().domain([pts[0].rok, lastYr]).range([m.l, W - m.r]);
    var maxV = d3.max(pts, function (d) { return d.v; });
    if (cur27) maxV = Math.max(maxV, cur27.wydatki);
    var y = d3.scaleLinear().domain([0, maxV * 1.06]).range([H - m.b, m.t]);
    var ac = cssVar("var(--accent)"), ink = cssVar("var(--ink)"), ink3 = cssVar("var(--ink-3)"), surf = cssVar("var(--surface)");

    var svg = d3.select(svgEl).attr("viewBox", "0 0 " + W + " " + H);
    svg.selectAll("*").remove();
    var gid = "yc-grad";
    var grad = svg.append("defs").append("linearGradient").attr("id", gid).attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 1);
    grad.append("stop").attr("offset", "0").attr("stop-color", ac).attr("stop-opacity", 0.22);
    grad.append("stop").attr("offset", "1").attr("stop-color", ac).attr("stop-opacity", 0);

    y.ticks(3).filter(function (t) { return t > 0; }).forEach(function (t) {
      svg.append("line").attr("class", "grid").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(t)).attr("y2", y(t));
    });
    svg.append("path").attr("d", d3.area().x(function (d) { return x(d.rok); }).y0(y(0)).y1(function (d) { return y(d.v); }).curve(d3.curveMonotoneX)(pts)).attr("fill", "url(#" + gid + ")");
    svg.append("path").attr("d", d3.line().x(function (d) { return x(d.rok); }).y(function (d) { return y(d.v); }).curve(d3.curveMonotoneX)(pts))
      .attr("fill", "none").attr("stroke", ac).attr("stroke-width", 2).attr("stroke-linecap", "round");
    if (cur27) {
      var lp = pts[pts.length - 1];
      svg.append("path").attr("d", d3.line()([[x(lp.rok), y(lp.v)], [x(2027), y(cur27.wydatki)]]))
        .attr("stroke", ac).attr("stroke-width", 2).attr("stroke-dasharray", "3 4").attr("fill", "none");
      svg.append("circle").attr("cx", x(2027)).attr("cy", y(cur27.wydatki)).attr("r", 4).attr("fill", surf).attr("stroke", ac).attr("stroke-width", 2);
    }
    pts.forEach(function (d) {
      svg.append("circle").attr("class", "yc-dot").attr("cx", x(d.rok)).attr("cy", y(d.v)).attr("r", 2).attr("fill", ac).attr("opacity", d.rok === YEAR ? 0 : 0.45);
    });

    // selected year: halo + dot + label, glides from the previous position
    var sel = pts.filter(function (d) { return d.rok === YEAR; })[0];
    if (sel) {
      var sx = x(sel.rok), sy = y(sel.v);
      var from = ycLast && !prefersReduced() ? ycLast : { x: sx, y: sy };
      var halo = svg.append("circle").attr("r", 11).attr("fill", ac).attr("opacity", 0.16).attr("cx", from.x).attr("cy", from.y);
      var dot = svg.append("circle").attr("r", 5).attr("fill", ac).attr("stroke", surf).attr("stroke-width", 2).attr("cx", from.x).attr("cy", from.y);
      var lab = svg.append("text").attr("y", sy - 15).attr("fill", ink).style("font", "600 12.5px " + cssVar("var(--sans)"))
        .text(sel.rok + " · " + pl(sel.v, 1));
      var lw = textW(lab);
      var lx = Math.max(m.l, Math.min(W - m.r - lw, sx - lw / 2));
      lab.attr("x", lx);
      if (sy - 15 < 12) lab.attr("y", sy + 24);
      [halo, dot].forEach(function (c) { c.transition().duration(prefersReduced() ? 0 : 600).ease(d3.easeCubicInOut).attr("cx", sx).attr("cy", sy); });
      ycLast = { x: sx, y: sy };

      // axis labels: a few anchor years + the selected one; drop any that would collide
      var labels = [];
      var anchors = [pts[0].rok, 2015, 2019, 2023];
      if (cur27) anchors.push(2027);
      var selBox = { x: sx, w: 30 };
      anchors.forEach(function (a) {
        if (a === YEAR) return;
        if (Math.abs(x(a) - selBox.x) < 38) return;
        labels.push({ yr: a, x: x(a), sel: false });
      });
      labels.push({ yr: YEAR, x: sx, sel: true });
      labels.forEach(function (L) {
        var t = svg.append("text").attr("class", "axis-label").attr("y", H - 4)
          .attr("x", L.x).attr("text-anchor", L.x < m.l + 16 ? "start" : (L.x > W - m.r - 10 ? "end" : "middle"))
          .text(L.yr);
        if (L.sel) t.style("fill", ink).style("font-weight", 600);
        if (L.yr === 2027) t.style("fill", ac);
      });
    }

    // hit areas — click a year to switch, 2027 opens the story
    var allYrs = pts.map(function (d) { return d.rok; });
    if (cur27) allYrs.push(2027);
    var step = (x(allYrs[1]) - x(allYrs[0]));
    allYrs.forEach(function (yr) {
      var v = yr === 2027 ? cur27.wydatki : pts.filter(function (d) { return d.rok === yr; })[0].v;
      svg.append("rect").attr("class", "yc-hit").attr("x", x(yr) - step / 2).attr("y", 0).attr("width", step).attr("height", H).attr("fill", "transparent")
        .on("mouseenter", function (ev) {
          showTipHtml(ev, '<div class="tt-k">' + (yr === 2027 ? "Projekt budżetu" : "Plan z ustawy") + '</div><div class="tt-t">' + yr + '</div><div class="tt-v">' + pl(v, 1) + ' mld zł</div><div class="tt-s">' + (yr === 2027 ? "Kliknij, aby zobaczyć historię projektu" : (yr === YEAR ? "Wybrany rok" : "Kliknij, aby wybrać rok")) + "</div>");
        })
        .on("mousemove", positionTip)
        .on("mouseleave", hideTip)
        .on("click", function () { hideTip(); if (yr === 2027) location.href = "budzet-2027.html"; else setYear(yr); });
    });
  }
  function p27Current() {
    if (!P27 || !P27.wersje) return null;
    var c = P27.wersje.filter(function (v) { return v.wydatki != null; });
    return c.length ? c[c.length - 1] : null;
  }

  // ---------- ticker ----------
  function renderTicker() {
    var host = document.getElementById("ticker"); if (!host) return;
    var m = DATA.meta, P = prevData(), pm = P ? P.meta : null;
    var d752 = dzialByCode(DATA, "752"), d757 = dzialByCode(DATA, "757");
    var cells = [];
    cells.push({ k: "Wydatki", v: m.wydatki / 1e6, dec: 1, u: "mld", foot: deltaHtml(pm ? rr(m.wydatki, pm.wydatki) : null) });
    cells.push({ k: "Dochody", v: m.dochody / 1e6, dec: 1, u: "mld", foot: deltaHtml(pm ? rr(m.dochody, pm.dochody) : null) });
    if (m.deficyt > 0) cells.push({ k: "Deficyt", v: m.deficyt / 1e6, dec: 1, u: "mld", danger: true, foot: deltaHtml(pm && pm.deficyt > 0 ? rr(m.deficyt, pm.deficyt) : null, true) });
    else cells.push({ k: "Deficyt", v: 0, dec: 0, u: "zł", foot: '<span class="delta up">budżet zbilansowany</span>' });
    if (m.dlug_pkb_proc != null) cells.push({ k: "Dług / PKB", v: m.dlug_pkb_proc, dec: 1, u: "%", foot: '<span class="delta">próg ostrożn. 55%</span>' });
    else cells.push({ k: "Pokrycie wydatków", v: m.dochody / m.wydatki * 100, dec: 1, u: "%", foot: '<span class="delta">dochody ÷ wydatki</span>' });
    if (m.obrona_pkb_proc != null) cells.push({ k: "Obrona / PKB", v: m.obrona_pkb_proc, dec: 2, u: "%", foot: '<span class="delta">' + (d752 ? mldN(d752.plan) + " mld zł" : "") + "</span>" });
    else if (d752) cells.push({ k: "Obrona narodowa", v: d752.plan / 1e6, dec: 1, u: "mld", foot: deltaHtml(prevRR("752")) });
    if (d757) cells.push({ k: "Odsetki od długu", v: d757.plan / 1e6, dec: 1, u: "mld", foot: deltaHtml(prevRR("757"), true) });
    host.innerHTML = cells.map(function (c, i) {
      return '<div class="tk"><div class="mono">' + c.k + '</div><div class="tk-v' + (c.danger ? " is-danger" : "") + '"><span data-tk="' + i + '"></span><small>' + c.u + "</small></div>" + c.foot + "</div>";
    }).join("");
    cells.forEach(function (c, i) { countTo(host.querySelector('[data-tk="' + i + '"]'), "tk" + c.k, c.v, c.dec); });
  }

  // ---------- mini map ----------
  function renderOvMap() {
    var dz = dzialyDesc().filter(function (d) { return d.plan > 0; });
    var total = DATA.meta.wydatki;
    var TOP = isMobile() ? 9 : 14;
    var head = dz.slice(0, TOP), tail = dz.slice(TOP);
    var nodes = head.map(function (d) {
      return { key: "d" + d.code, code: d.code, name: fixName(d.name), label: dzialShort(d.code, d.name), value: d.plan, kind: "dzial", color: CMAP[colorKey(fixName(d.name))] };
    });
    if (tail.length) nodes.push({ key: "rest", code: null, name: tail.length + " mniejszych działów", label: tail.length + " mniejszych działów", value: d3.sum(tail, function (d) { return d.plan; }), kind: "rest", color: CMAP.other });
    renderTreemap(document.getElementById("ov-treemap"), nodes, {
      height: isMobile() ? 340 : 420, total: total,
      onClick: function (n) { if (n.kind === "rest") switchView("tree", { scroll: true }); else openDzial(n.code, true); }
    });
    setText("ov-map-k", "Mapa wydatków · " + DATA.dzialy.length + " " + plural(DATA.dzialy.length, "dział", "działy", "działów"));
    var s3 = d3.sum(dz.slice(0, 3), function (d) { return d.plan; }) / total * 100;
    setText("ov-map-h", s3 > 50 ? "Trzy obszary to ponad połowa wszystkich wydatków." : "Trzy największe obszary to " + pct(s3, 0) + " wszystkich wydatków.");
    buildCatLegend("ov-legend", nodes);
  }
  function buildCatLegend(id, nodes) {
    var used = {};
    nodes.forEach(function (n) { used[colorKey(n.name)] = true; });
    setHtml(id, CMAP_ORDER.filter(function (k) { return used[k]; }).map(function (k) {
      return '<span class="legend-item"><span class="legend-swatch" style="background:' + CMAP[k].fill + '"></span>' + CMAP[k].label + "</span>";
    }).join(""));
  }

  // ---------- where the money comes from ----------
  var SRC_COLOR = { "VAT": "var(--c-social)", "Akcyza": "var(--c-infra)", "CIT": "var(--c-edu)", "PIT": "var(--c-health)" };
  function renderOvSrc() {
    var m = DATA.meta, P = prevData();
    var rows = DATA.dochody.slice().sort(function (a, b) { return b.plan - a.plan; });
    var maxV = Math.max(d3.max(rows, function (r) { return r.plan; }), m.deficyt);
    var prevBy = {};
    if (P) P.dochody.forEach(function (d) { prevBy[d.name] = d.plan; });
    var h = rows.map(function (r, i) {
      return '<div class="src-row"><span>' + (DOCH_SHORT[r.name] || r.name) + "</span><b>" + mldN(r.plan) + "</b>" + deltaHtml(rr(r.plan, prevBy[r.name]), null, "") + "</div>" +
        '<div class="src-bar"><i style="width:' + (r.plan / maxV * 100).toFixed(1) + "%;background:" + (SRC_COLOR[r.name] || "var(--c-other)") + ";animation-delay:" + (i * 60) + 'ms"></i></div>';
    }).join("");
    if (m.deficyt > 0) {
      h += '<div class="src-sep"></div><div class="src-row is-def"><span>Pożyczone (deficyt)</span><b>' + mldN(m.deficyt) + "</b>" +
        deltaHtml(P && P.meta.deficyt > 0 ? rr(m.deficyt, P.meta.deficyt) : null, true, "") + "</div>" +
        '<div class="src-bar"><i style="width:' + (m.deficyt / maxV * 100).toFixed(1) + '%;background:var(--down);animation-delay:320ms"></i></div>';
    }
    h += '<div class="mono soft">mld zł' + (P ? " · zmiana wobec planu " + (YEAR - 1) : "") + "</div>";
    var gr = Math.round(m.deficyt / m.wydatki * 100);
    if (m.deficyt > 0) {
      h += '<div class="cov"><div class="cov-t">Z każdej złotówki wydatków: <b>' + (100 - gr) + ' gr</b> z dochodów, <b class="is-def">' + gr + ' gr</b> pożyczone</div>' +
        '<div class="cov-b"><i style="flex:0 0 calc(' + (100 - gr) + '% - 2px)">' + (100 - gr) + ' gr</i><i style="flex:0 0 calc(' + gr + '% - 1px)">' + gr + " gr</i></div></div>";
    } else {
      h += '<div class="cov"><div class="cov-t">Z każdej złotówki wydatków: <b>100 gr</b> z dochodów</div><div class="cov-b"><i style="flex:1">100 gr</i></div></div>';
    }
    setHtml("ov-src", h);
    var top = rows[0], share = top.plan / m.dochody * 100;
    setText("ov-src-h", (DOCH_SHORT[top.name] || top.name) + " to " + (share > 50 ? "ponad połowa" : pct(share, 0)) + " dochodów." +
      (m.deficyt > 0 ? " Resztę wydatków państwo pożycza." : " Dochody pokrywają wszystkie wydatki."));
  }

  // ---------- execution rings ----------
  function renderOvExec() {
    var host = document.getElementById("ov-rings"); if (!host) return;
    var yr = YEAR;
    if (!WYK_FILES[yr]) {
      setText("ov-exec-k", "Wykonanie");
      setText("ov-exec-h", "Brak danych o wykonaniu dla " + yr + " r.");
      drawRings(host, []); setHtml("ov-rings-leg", ""); return;
    }
    loadExec(function (W) {
      if (yr !== YEAR) return;
      if (!W) { setText("ov-exec-h", "Nie udało się wczytać danych o wykonaniu."); return; }
      var rings = execRings(W);
      drawRings(host, rings);
      setHtml("ov-rings-leg", ringLegend(rings));
      var n = execMonths(W), m = DATA.meta, w = W.wykonanie;
      if (n) {
        setHtml("ov-exec-k", '<span class="live">W toku · ' + (EXEC_PO[n] || "narastająco") + "</span>");
        setText("ov-exec-h", "Minęło " + Math.round(n / 12 * 100) + "% roku. Wydano " + Math.round(execPct(w.wydatki, m.wydatki)) + "% planu.");
      } else {
        setText("ov-exec-k", "Wykonanie " + yr);
        setText("ov-exec-h", "Wydano " + pct(execPct(w.wydatki, m.wydatki), 1) + " planu, dochody wyniosły " + pct(execPct(w.dochody, m.dochody), 1) + " planu.");
      }
    });
  }
  function execRings(W) {
    var m = DATA.meta, w = W.wykonanie, n = execMonths(W);
    var r = [
      { label: "Wydatki", v: execPct(w.wydatki, m.wydatki), color: "var(--c-social-line)" },
      { label: "Dochody", v: execPct(w.dochody, m.dochody), color: "var(--c-defense-line)" }
    ];
    if (n) r.push({ label: "Czas (" + n + "/12)", v: n / 12 * 100, color: "var(--ink-3)" });
    else if (m.deficyt > 0) r.push({ label: "Deficyt", v: execPct(w.deficyt, m.deficyt), color: "var(--down)" });
    return r;
  }
  function ringLegend(rings) {
    return rings.map(function (r) {
      return '<div class="rl-i"><i style="background:' + r.color + '"></i><span>' + r.label + "</span><b>" + (r.v == null ? "—" : pct(r.v, 1)) + "</b></div>";
    }).join("");
  }
  // Apple-Fitness-style concentric rings; animate from the previous value
  function drawRings(svgEl, rings) {
    var svg = d3.select(svgEl);
    var R = [64, 48, 32], TH = 6;
    var groups = svg.selectAll("g.ring").data(rings, function (d, i) { return i; });
    groups.exit().remove();
    var enter = groups.enter().append("g").attr("class", "ring").attr("transform", "translate(75,75)");
    enter.append("path").attr("class", "ring-bg");
    enter.append("path").attr("class", "ring-fg");
    var all = enter.merge(groups);
    all.each(function (d, i) {
      var g = d3.select(this);
      var arc = d3.arc().innerRadius(R[i] - TH).outerRadius(R[i] + TH).startAngle(0).cornerRadius(TH);
      var col = cssVar(d.color);
      g.select(".ring-bg").attr("d", arc.endAngle(Math.PI * 2)()).attr("fill", col).attr("opacity", 0.14);
      var to = Math.max(0, Math.min(1, (d.v || 0) / 100));
      var fg = g.select(".ring-fg").attr("fill", col);
      var from = fg.property("__v"); if (from == null) from = 0;
      fg.property("__v", to);
      fg.transition().duration(prefersReduced() ? 0 : 1100).ease(d3.easeCubicOut)
        .attrTween("d", function () { var ip = d3.interpolateNumber(from, to); return function (t) { return arc.endAngle(Math.PI * 2 * Math.max(0.001, ip(t)))(); }; });
    });
  }

  // ---------- gauge: dług/PKB (2026) or coverage (other years) ----------
  function renderOvGauge() {
    var m = DATA.meta, svgEl = document.getElementById("ov-gauge");
    if (m.dlug_pkb_proc != null) {
      var v = m.dlug_pkb_proc;
      setText("ov-gauge-k", "Dług publiczny / PKB");
      drawGauge(svgEl, { v: v, max: 70, ticks: [[55, "var(--live)"], [60, "var(--down)"]], label: pct(v, 1), sub: v < 55 ? "do progu 55%: " + pl(55 - v, 1) + " pkt proc." : "powyżej progu 55%" });
      setHtml("ov-gauge-leg", '<span>0%</span><span class="t1">55% próg</span><span class="t2">60% limit</span>');
      setText("ov-gauge-h", v >= 60 ? "Dług powyżej konstytucyjnego limitu." : v >= 55 ? "Dług powyżej progu ostrożnościowego." : (55 - v <= 3 ? "Dług blisko progu ostrożnościowego." : "Dług poniżej progu ostrożnościowego."));
    } else {
      var c = m.dochody / m.wydatki * 100;
      setText("ov-gauge-k", "Pokrycie wydatków dochodami");
      drawGauge(svgEl, { v: c, max: 100, ticks: [], label: pct(c, 1), sub: "dochody ÷ wydatki" });
      setHtml("ov-gauge-leg", "<span>0%</span><span>100%</span>");
      setText("ov-gauge-h", m.deficyt <= 0 ? "Budżet zbilansowany: dochody pokrywają wszystkie wydatki." : "Dochody pokrywają " + pct(c, 0) + " wydatków. Resztę trzeba pożyczyć.");
    }
  }
  function drawGauge(svgEl, o) {
    var svg = d3.select(svgEl), cx = 130, cy = 140, R = 112;
    function ang(v) { return -Math.PI / 2 + Math.PI * Math.max(0, Math.min(o.max, v)) / o.max; }
    var arc = d3.arc().innerRadius(R - 12).outerRadius(R).cornerRadius(6);
    var bg = svg.select("path.g-bg"); if (bg.empty()) bg = svg.append("path").attr("class", "g-bg").attr("transform", "translate(" + cx + "," + cy + ")");
    bg.attr("d", arc({ startAngle: ang(0), endAngle: ang(o.max) })).attr("fill", cssVar("var(--hair-2)"));
    var fg = svg.select("path.g-fg"); if (fg.empty()) fg = svg.append("path").attr("class", "g-fg").attr("transform", "translate(" + cx + "," + cy + ")");
    var from = fg.property("__v"), max0 = fg.property("__max");
    if (from == null || max0 !== o.max) from = 0;
    fg.property("__v", o.v).property("__max", o.max).attr("fill", cssVar("var(--ink)"));
    fg.transition().duration(prefersReduced() ? 0 : 1100).ease(d3.easeCubicOut)
      .attrTween("d", function () { var ip = d3.interpolateNumber(from, o.v); return function (t) { return arc({ startAngle: ang(0), endAngle: Math.max(ang(0) + 0.001, ang(ip(t))) }); }; });
    svg.selectAll("line.g-tick").remove();
    o.ticks.forEach(function (t) {
      var a = ang(t[0]);
      svg.append("line").attr("class", "g-tick")
        .attr("x1", cx + Math.sin(a) * (R - 18)).attr("y1", cy - Math.cos(a) * (R - 18))
        .attr("x2", cx + Math.sin(a) * (R + 6)).attr("y2", cy - Math.cos(a) * (R + 6))
        .attr("stroke", cssVar(t[1])).attr("stroke-width", 2.5).attr("stroke-linecap", "round");
    });
    var lab = svg.select("text.g-v"); if (lab.empty()) lab = svg.append("text").attr("class", "g-v").attr("x", cx).attr("y", cy - 14).attr("text-anchor", "middle");
    lab.attr("fill", cssVar("var(--ink)")).style("font", "600 38px " + cssVar("var(--sans)")).style("letter-spacing", "-0.04em").text(o.label);
    var sub = svg.select("text.g-s"); if (sub.empty()) sub = svg.append("text").attr("class", "g-s").attr("x", cx).attr("y", cy + 8).attr("text-anchor", "middle");
    sub.attr("fill", cssVar("var(--ink-2)")).style("font", "500 12px " + cssVar("var(--sans)")).text(o.sub);
  }

  // ---------- your taxes (mini) ----------
  function syncTaxInputs(src) {
    ["ov-tax-input", "tax-input", "tax-range"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el !== src) el.value = String(Math.round(taxAmount));
    });
  }
  function renderOvTax() {
    var dz = dzialyDesc(), total = DATA.meta.wydatki;
    var rows = dz.slice(0, 6).map(function (d) { return { code: d.code, name: dzialShort(d.code, d.name), share: d.plan / total, color: CMAP[colorKey(fixName(d.name))].fill }; });
    setHtml("ov-tax-list", rows.map(function (r) {
      return '<div class="tx-i"><i style="background:' + r.color + '"></i><span>' + r.name + "</span><b>" + zl(r.share * taxAmount) + "</b></div>";
    }).join(""));
    var t = rows[0];
    setText("ov-tax-h", taxAmount > 0 ? "Z " + zl(taxAmount) + " podatku " + zl(t.share * taxAmount) + " idzie na " + lcFirst(t.name) + "." : "Wpisz kwotę, a pokażemy, jak się dzieli.");
  }

  // ---------- table of the largest działy ----------
  function renderOvTable() {
    var P = prevData(), total = DATA.meta.wydatki;
    var rows = dzialyDesc().slice(0, 8);
    setText("ov-tbl-k", "Największe działy · " + YEAR + (P ? " vs " + (YEAR - 1) : ""));
    var head = '<thead><tr><th class="l x-col">Kod</th><th class="l">Dział</th><th>mld zł</th><th class="x-only x-col">Udział</th><th>' + (P ? "r/r" : "") + '</th><th class="x-only x-col">' + trendRange() + "</th></tr></thead>";
    var body = rows.map(function (d, i) {
      var nm = fixName(d.name);
      return '<tr class="is-link" data-code="' + d.code + '" tabindex="0"><td class="code l x-col">' + d.code + '</td><td class="nm l"><span class="dot" style="background:' + CMAP[colorKey(nm)].fill + '"></span>' + dzialShort(d.code, d.name) +
        '</td><td class="n">' + mldN(d.plan) + '</td><td class="x-only x-col">' + pct(d.plan / total * 100, 1) + "</td><td>" + (P ? deltaHtml(prevRR(d.code), null, "") : "") +
        '</td><td class="sp x-col"><svg width="110" height="24" data-spark="' + i + '"></svg></td></tr>';
    }).join("");
    var tbl = document.getElementById("ov-table");
    tbl.innerHTML = head + "<tbody>" + body + "</tbody>";
    rows.forEach(function (d, i) { drawSpark(tbl.querySelector('[data-spark="' + i + '"]'), seriesFor(d.name), CMAP[colorKey(fixName(d.name))].line); });
    tbl.querySelectorAll("tr.is-link").forEach(function (tr) {
      function go() { openDzial(tr.getAttribute("data-code"), true); }
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } });
    });
    // headline: the fastest grower among the ten largest
    var best = null;
    if (P) dzialyDesc().slice(0, 10).forEach(function (d) { var r = prevRR(d.code); if (r != null && (!best || r > best.r)) best = { d: d, r: r }; });
    if (best && best.r > 0) setText("ov-tbl-h", "Najszybciej rośnie " + lcFirst(dzialShort(best.d.code, best.d.name)) + ": +" + pl(best.r, 1) + "% rok do roku.");
    else if (best) setText("ov-tbl-h", "Żaden z dziesięciu największych działów nie rośnie rok do roku.");
    else setText("ov-tbl-h", "Osiem działów, na które idzie najwięcej pieniędzy.");
  }
  function trendRange() { return TRENDS ? TRENDS.meta.lata[0] + "–" + TRENDS.meta.lata[TRENDS.meta.lata.length - 1] : ""; }
  // a dział's plan across all years (mld zł), matched by canonical name
  function seriesFor(name) {
    if (!TRENDS) return [];
    var nm = normName(name);
    return TRENDS.lata.map(function (r) {
      var d = r.dzialy.filter(function (x) { return x.name === nm; })[0];
      return { x: r.rok, y: d ? d.plan / 1e6 : null };
    });
  }
  function drawSpark(svgEl, series, color) {
    if (!svgEl || !series.length) return;
    var s = d3.select(svgEl), W = +svgEl.getAttribute("width"), H = +svgEl.getAttribute("height");
    var vals = series.filter(function (p) { return p.y != null; });
    if (!vals.length) return;
    var x = d3.scaleLinear().domain([series[0].x, series[series.length - 1].x]).range([2, W - 4]);
    var y = d3.scaleLinear().domain([0, d3.max(vals, function (p) { return p.y; })]).range([H - 3, 3]);
    var col = cssVar(color);
    s.append("path").attr("d", d3.line().defined(function (p) { return p.y != null; }).x(function (p) { return x(p.x); }).y(function (p) { return y(p.y); }).curve(d3.curveMonotoneX)(series))
      .attr("fill", "none").attr("stroke", col).attr("stroke-width", 1.6).attr("stroke-linecap", "round");
    var cur = series.filter(function (p) { return p.x === YEAR; })[0];
    if (cur && cur.y != null) s.append("circle").attr("cx", x(cur.x)).attr("cy", y(cur.y)).attr("r", 2.6).attr("fill", col);
  }

  // ---------- Budżet 2027 card ----------
  function render2027() {
    if (!P27) return;
    var meta = P27.meta || {};
    if (meta.etap_krotko) setText("c27-stage", meta.etap_krotko);
    var cal = P27.kalendarz || [];
    if (cal.length) {
      var curIdx = -1;
      setHtml("c27-steps", cal.map(function (s, i) {
        if (s.status === "current") curIdx = i;
        return "<i" + (s.status === "done" ? ' class="d"' : s.status === "current" ? ' class="c"' : "") + "></i>";
      }).join(""));
      if (curIdx >= 0) setText("c27-step", "Etap " + (curIdx + 1) + " z " + cal.length + " · " + (cal[curIdx].nazwa || ""));
    }
    var cur = p27Current();
    if (cur) setHtml("c27-fig", "<div><b>" + pl(cur.wydatki, 1) + "</b><span>mld zł wydatków</span></div><div><b>" + pl(cur.deficyt, 1) + "</b><span>mld zł deficytu</span></div>");
  }

  // =====================================================================
  // ======================== TREEMAP (shared) ============================
  // =====================================================================
  // nodes: [{ key, code, name, label, value, kind, color: CMAP entry, interactive? }]
  function renderTreemap(svgEl, nodes, o) {
    var W = svgEl.clientWidth || svgEl.parentNode.clientWidth || 800, H = o.height;
    var total = o.total || d3.sum(nodes, function (d) { return d.value; });
    var root = d3.hierarchy({ children: nodes }).sum(function (d) { return d.value; }).sort(function (a, b) { return b.value - a.value; });
    d3.treemap().size([W, H]).paddingInner(3).round(true).tile(d3.treemapSquarify.ratio(1.25))(root);
    var leaves = root.leaves();
    var svg = d3.select(svgEl).attr("viewBox", "0 0 " + W + " " + H).attr("height", H);
    var reduce = prefersReduced();
    var token = (svgEl.__tok = (svgEl.__tok || 0) + 1);
    var sizeKey = W + "x" + H;
    var morph = !reduce && svgEl.__drawn && svgEl.__size === sizeKey;
    svgEl.__drawn = true; svgEl.__size = sizeKey;
    function rx(d) { return Math.min(10, (d.x1 - d.x0) / 4, (d.y1 - d.y0) / 4); }

    var tiles = svg.selectAll("g.tile").data(leaves, function (d) { return d.data.key; });
    tiles.exit().interrupt().transition().duration(morph ? 300 : 0).style("opacity", 0).remove();
    var enter = tiles.enter().append("g").attr("class", "tile")
      .attr("transform", function (d) { return "translate(" + d.x0 + "," + d.y0 + ")"; })
      .style("opacity", 0);
    enter.append("rect");
    var all = enter.merge(tiles);
    all.selectAll("text").remove();
    all.select("rect").attr("fill", function (d) { return cssVar(d.data.color.fill); });

    if (morph) {
      // year / axis change: tiles glide to their new place, labels return when they land
      var t = d3.transition().duration(650).ease(d3.easeCubicInOut);
      all.interrupt().transition(t).attr("transform", function (d) { return "translate(" + d.x0 + "," + d.y0 + ")"; }).style("opacity", 1);
      all.select("rect").interrupt().transition(t)
        .attr("width", function (d) { return Math.max(0, d.x1 - d.x0); })
        .attr("height", function (d) { return Math.max(0, d.y1 - d.y0); })
        .attr("rx", rx);
      setTimeout(function () { if (svgEl.__tok === token) all.each(function (d) { labelTile(d3.select(this), d, total); }); }, 660);
    } else {
      all.attr("transform", function (d) { return "translate(" + d.x0 + "," + d.y0 + ")"; });
      all.select("rect")
        .attr("width", function (d) { return Math.max(0, d.x1 - d.x0); })
        .attr("height", function (d) { return Math.max(0, d.y1 - d.y0); })
        .attr("rx", rx);
      all.each(function (d) { labelTile(d3.select(this), d, total); });
      if (reduce) all.style("opacity", 1);
      else all.interrupt().style("opacity", 0).transition().delay(function (d, i) { return Math.min(i * 22, 420); }).duration(420).ease(d3.easeCubicOut).style("opacity", 1);
    }

    svg.classed("is-hovering", false);
    all.attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", function (d) { return d.data.name + ", " + money(d.data.value) + ", " + pct(d.data.value / total * 100, 1) + (d.data.interactive === false ? "" : ", otwórz szczegóły"); })
      .style("cursor", function (d) { return d.data.interactive === false ? "default" : "pointer"; })
      .on("mouseenter", function (ev, d) { svg.classed("is-hovering", true); d3.select(this).classed("is-hot", true); showTipHtml(ev, tileTip(d.data, total)); })
      .on("mousemove", positionTip)
      .on("mouseleave", function () { svg.classed("is-hovering", false); d3.select(this).classed("is-hot", false); hideTip(); })
      .on("click", function (ev, d) { hideTip(); if (d.data.interactive !== false && o.onClick) o.onClick(d.data); })
      .on("keydown", function (ev, d) { if ((ev.key === "Enter" || ev.key === " ") && o.onClick) { ev.preventDefault(); o.onClick(d.data); } });
  }

  // labels are measured: they shrink with an ellipsis or disappear, they never overlap
  function labelTile(g, d, total) {
    var w = d.x1 - d.x0, h = d.y1 - d.y0, n = d.data;
    if (w < 40 || h < 26) return;
    var ink = cssVar(n.color.ink), font = cssVar("var(--sans)"), mono = cssVar("var(--mono)");
    var big = w >= 190 && h >= 124, pad = big ? 14 : 10, inner = w - pad * 2;
    var a = amtNum(n.value);
    if (big) {
      var nm = g.append("text").attr("x", pad).attr("y", pad + 15).attr("fill", ink).style("font", "600 15px " + font).text(n.label);
      fitText(nm, inner);
      var codeTxt = n.kind === "dzial" ? "DZIAŁ " + n.code : n.kind === "czesc" ? "CZĘŚĆ " + n.code : n.kind === "rozdzial" ? "ROZDZIAŁ " + n.code : "";
      if (codeTxt) {
        var c = g.append("text").attr("x", pad).attr("y", pad + 33).attr("fill", ink).attr("opacity", 0.62).style("font", "500 10.5px " + mono).style("letter-spacing", "0.06em").text(codeTxt);
        fitText(c, inner);
      }
      var sub = g.append("text").attr("x", pad).attr("y", h - pad - 38).attr("fill", ink).attr("opacity", 0.78).style("font", "500 12px " + font)
        .text(a.u + " · " + pct(n.value / total * 100, 1));
      fitText(sub, inner);
      var v = g.append("text").attr("x", pad).attr("y", h - pad - 2).attr("fill", ink).style("font", "600 30px " + font).style("letter-spacing", "-0.03em").text(a.n);
      fitText(v, inner);
      return;
    }
    var val = g.append("text").attr("x", pad).attr("y", pad + 14).attr("fill", ink).style("font", "600 14.5px " + font).style("letter-spacing", "-0.02em").text(amtShort(n.value));
    // a number is never shown cut: drop the unit first, then the label entirely
    if (textW(val) > inner) val.text(a.n);
    if (textW(val) > inner) { val.remove(); return; }
    if (h >= 52) {
      var name = g.append("text").attr("x", pad).attr("y", pad + 31).attr("fill", ink).attr("opacity", 0.86).style("font", "500 12px " + font).text(n.label);
      fitText(name, inner);
    }
  }

  function tileTip(n, total) {
    var kind = n.kind === "dzial" ? "Dział " + n.code : n.kind === "czesc" ? "Część " + n.code : n.kind === "rozdzial" ? "Rozdział " + n.code : "Grupa";
    var pc = perCap(n.value);
    var h = '<div class="tt-k">' + kind + '</div><div class="tt-t">' + escapeHtml(n.name) + '</div><div class="tt-v">' + money(n.value) + "</div>" +
      '<div class="tt-s">' + pct(n.value / total * 100, 1) + (n.kind === "rozdzial" ? " działu" : " budżetu") + (pc ? " · " + zl(pc) + " na osobę" : "") + "</div>";
    {
      var x = exactTys(n.value);
      if (n.kind === "dzial" && prevData()) { var r = prevRR(n.code); if (r != null) x += " · r/r " + (r > 0 ? "▲ " : "▼ ") + pl(Math.abs(r), 1) + "%"; }
      h += '<div class="tt-x">' + x + "</div>";
    }
    if (n.interactive !== false) h += '<div class="tt-s" style="margin-top:6px">' + (n.kind === "rest" ? "Kliknij, aby zobaczyć wszystkie" : (n.kind === "dzial" ? "Kliknij, aby zobaczyć szczegóły" : "Kliknij, aby wejść głębiej")) + "</div>";
    return h;
  }

  // =====================================================================
  // ========================== MAPA WYDATKÓW =============================
  // =====================================================================
  function wireAxis() {
    document.getElementById("axis-dzialy").addEventListener("click", function () { setAxis("dzialy"); });
    document.getElementById("axis-czesci").addEventListener("click", function () { setAxis("czesci"); });
    document.getElementById("tree-as-chart").addEventListener("click", function () { setTreeAsTable(false); });
    document.getElementById("tree-as-table").addEventListener("click", function () { setTreeAsTable(true); });
  }
  function setAxis(a) {
    if (axis === a) return;
    axis = a; path = []; restExpanded = false;
    document.getElementById("axis-dzialy").setAttribute("aria-pressed", a === "dzialy" ? "true" : "false");
    document.getElementById("axis-czesci").setAttribute("aria-pressed", a === "czesci" ? "true" : "false");
    var svg = document.getElementById("treemap"); if (svg) svg.__drawn = false;   // different hierarchy: fresh entrance, not a morph
    drawTree(); renderTreeInsights();
  }
  function setTreeAsTable(on, silent) {
    treeAsTable = on;
    document.getElementById("tree-as-chart").setAttribute("aria-pressed", on ? "false" : "true");
    document.getElementById("tree-as-table").setAttribute("aria-pressed", on ? "true" : "false");
    if (!silent) drawTree();
  }

  // nodes for the current axis & drill level
  function currentNodes() {
    var col = function (nm) { return CMAP[colorKey(nm)]; };
    if (path.length === 0) {
      if (axis === "dzialy") {
        return DATA.dzialy.map(function (d) {
          var nm = fixName(d.name);
          return { key: "d" + d.code, code: d.code, name: nm, label: dzialShort(d.code, d.name), value: d.plan, kind: "dzial", color: col(nm), interactive: true };
        });
      }
      return DATA.czesci.map(function (p) {
        var nm = fixName(p.name);
        return { key: "c" + p.code, code: p.code, name: nm, label: nm, value: p.plan, kind: "czesc", color: col(nm), ref: p, interactive: !!(p.dzialy && p.dzialy.length) };
      });
    }
    var node = path[path.length - 1];
    if (node.level === "czesc") {
      return (node.ref.dzialy || []).map(function (d) {
        var nm = fixName(d.name);
        return { key: "cd" + d.code, code: d.code, name: nm, label: dzialShort(d.code, d.name), value: d.plan, kind: "dzial", color: col(nm), ref: d, interactive: !!(d.rozdzialy && d.rozdzialy.length), drill: true };
      });
    }
    if (node.level === "dzial") {
      var c0 = col(node.name);
      return (node.ref.rozdzialy || []).map(function (r) {
        var nm = fixName(r.name);
        return { key: "r" + r.code, code: r.code, name: nm, label: nm, value: r.plan, kind: "rozdzial", color: c0, interactive: false };
      });
    }
    return [];
  }

  function onTileClick(n) {
    if (path.length === 0 && axis === "dzialy") { openDzial(n.code, true); return; }
    if (!n.interactive) return;
    restExpanded = false;
    if (path.length === 0) path.push({ level: "czesc", name: n.name, code: n.code, ref: n.ref });
    else if (path[path.length - 1].level === "czesc") path.push({ level: "dzial", name: n.name, code: n.code, ref: n.ref });
    var svg = document.getElementById("treemap"); if (svg) svg.__drawn = false;
    drawTree(); renderTreeInsights();
  }

  function drawTree() {
    if (!DATA) return;
    var state = document.getElementById("tree-state"); if (state) state.style.display = "none";
    renderCrumbs();
    var nodes = currentNodes().filter(function (n) { return n.value > 0; }).sort(function (a, b) { return b.value - a.value; });
    var total = d3.sum(nodes, function (n) { return n.value; });
    var svgEl = document.getElementById("treemap"), list = document.getElementById("tree-rest"), tbl = document.getElementById("tree-table");
    var legendIds = { used: nodes };
    buildCatLegend("legend", legendIds.used);
    setText("tree-hint-t", axis === "dzialy" && !path.length ? "Kliknij pole, aby zobaczyć, kto wydaje te pieniądze i na co dokładnie." :
      path.length < 2 ? "Kliknij pole, aby wejść głębiej. Ścieżka nad mapą prowadzi z powrotem." : "To najniższy poziom: rozdziały klasyfikacji budżetowej.");

    if (treeAsTable) {
      svgEl.style.display = "none"; list.style.display = "none"; tbl.hidden = false;
      drawTreeTable(tbl, nodes, total);
      return;
    }
    tbl.hidden = true;
    if (isMobile()) {
      svgEl.style.display = "none"; list.style.display = "flex";
      drawTreeMobile(list, nodes, total);
      return;
    }
    list.style.display = "none"; svgEl.style.display = "block";
    var W = svgEl.parentNode.clientWidth || 1000;
    renderTreemap(svgEl, nodes, { height: Math.round(Math.max(460, Math.min(640, W * 0.56))), total: total, onClick: onTileClick });
  }

  function drawTreeTable(host, nodes, total) {
    var showRR = path.length === 0 && axis === "dzialy" && prevData();
    var unitLbl = nodes[0] && nodes[0].kind === "rozdzial" ? "Rozdział" : nodes[0] && nodes[0].kind === "czesc" ? "Część" : "Dział";
    host.innerHTML = '<table class="tbl"><thead><tr><th class="l">Kod</th><th class="l">' + unitLbl + "</th><th>Plan, tys. zł</th><th>Udział</th>" + (showRR ? "<th>r/r</th>" : "") + "</tr></thead><tbody>" +
      nodes.map(function (n) {
        return '<tr class="' + (n.interactive ? "is-link" : "") + '" data-key="' + n.key + '"' + (n.interactive ? ' tabindex="0"' : "") + '><td class="code l">' + escapeHtml(n.code || "") + '</td><td class="nm l"><span class="dot" style="background:' + n.color.fill + '"></span>' + escapeHtml(n.name) +
          '</td><td class="n">' + fmtPL.format(n.value) + "</td><td>" + pct(n.value / total * 100, 2) + "</td>" + (showRR ? "<td>" + deltaHtml(prevRR(n.code), null, "") + "</td>" : "") + "</tr>";
      }).join("") + '</tbody><tfoot><tr><td></td><td class="nm l"><b>Razem</b></td><td class="n">' + fmtPL.format(total) + "</td><td>100%</td>" + (showRR ? "<td></td>" : "") + "</tr></tfoot></table>";
    var byKey = {}; nodes.forEach(function (n) { byKey[n.key] = n; });
    host.querySelectorAll("tr.is-link").forEach(function (tr) {
      function go() { onTileClick(byKey[tr.getAttribute("data-key")]); }
      tr.addEventListener("click", go);
      tr.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } });
    });
  }

  function drawTreeMobile(host, nodes, total) {
    host.innerHTML = "";
    var max = nodes.length ? nodes[0].value : 1;
    var showAll = nodes.length <= MOBILE_TOP + 1;
    var head = showAll ? nodes : nodes.slice(0, MOBILE_TOP), tail = showAll ? [] : nodes.slice(MOBILE_TOP);
    var tailSum = d3.sum(tail, function (d) { return d.value; });
    function bar(n, idx) {
      var drill = !!n.interactive;
      var el = document.createElement(drill ? "button" : "div");
      el.className = "mbar" + (drill ? " is-drill" : "");
      if (drill) el.type = "button";
      el.innerHTML = '<span class="mbar-name">' + escapeHtml(n.label) + (drill ? ' <i class="ti ti-chevron-right" aria-hidden="true"></i>' : "") + "</span>" +
        '<span class="mbar-amt">' + amtShort(n.value) + "<small>" + pct(n.value / total * 100, 1) + "</small></span>" +
        '<span class="mbar-track"><span class="mbar-fill" style="width:' + Math.max(1.5, n.value / max * 100).toFixed(1) + "%;background:" + n.color.fill + ";--anim-delay:" + Math.min((idx || 0) * 30, 360) + 'ms"></span></span>';
      if (drill) {
        el.setAttribute("aria-label", n.name + ", " + money(n.value) + ", otwórz szczegóły");
        el.addEventListener("click", function () { onTileClick(n); });
      }
      return el;
    }
    head.forEach(function (n, i) { host.appendChild(bar(n, i)); });
    if (!tail.length) return;
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "mbar mbar-rest is-drill";
    function renderToggle() {
      toggle.innerHTML = '<span class="mbar-name"><i class="ti ti-' + (restExpanded ? "chevron-up" : "dots") + '" aria-hidden="true"></i> ' + (restExpanded ? "Zwiń" : "Pozostałe (" + tail.length + ")") + "</span>" +
        '<span class="mbar-amt">' + amtShort(tailSum) + "<small>" + pct(tailSum / total * 100, 1) + "</small></span>" +
        '<span class="mbar-track"><span class="mbar-fill" style="width:' + Math.max(1.5, tailSum / max * 100).toFixed(1) + '%;background:var(--c-other)"></span></span>';
      toggle.setAttribute("aria-expanded", restExpanded ? "true" : "false");
    }
    renderToggle();
    toggle.addEventListener("click", function () {
      restExpanded = !restExpanded;
      renderToggle();
      host.querySelectorAll(".mbar-tail").forEach(function (n) { n.remove(); });
      if (restExpanded) tail.forEach(function (n, i) { var b = bar(n, i); b.classList.add("mbar-tail"); host.appendChild(b); });
    });
    host.appendChild(toggle);
    if (restExpanded) tail.forEach(function (n, i) { var b = bar(n, i); b.classList.add("mbar-tail"); host.appendChild(b); });
  }

  function renderCrumbs() {
    var el = document.getElementById("crumbs");
    var nodes = currentNodes();
    var total = d3.sum(nodes, function (n) { return n.value; });
    var rootLbl = axis === "dzialy" ? "Cały budżet " + YEAR : "Wszystkie części · " + YEAR;
    var html = '<button type="button" class="crumb' + (path.length === 0 ? " is-current" : "") + '" data-i="-1"><i class="ti ti-home-2" aria-hidden="true"></i> ' + rootLbl + "</button>";
    path.forEach(function (p, i) {
      html += '<span class="crumb-sep" aria-hidden="true"><i class="ti ti-chevron-right"></i></span>';
      html += '<button type="button" class="crumb' + (i === path.length - 1 ? " is-current" : "") + '" data-i="' + i + '">' + escapeHtml(p.name) + "</button>";
    });
    html += '<span class="crumb-total">· ' + money(total) + "</span>";
    el.innerHTML = html;
    el.querySelectorAll(".crumb").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = parseInt(b.getAttribute("data-i"), 10);
        if (i === path.length - 1 || (i < 0 && !path.length)) return;
        restExpanded = false;
        path = i < 0 ? [] : path.slice(0, i + 1);
        var svg = document.getElementById("treemap"); if (svg) svg.__drawn = false;
        drawTree(); renderTreeInsights();
      });
    });
  }

  function renderTreeInsights() {
    var nodes = currentNodes().filter(function (n) { return n.value > 0; }).sort(function (a, b) { return b.value - a.value; });
    var total = d3.sum(nodes, function (n) { return n.value; });
    if (!nodes.length) { renderInsights("ins-tree", []); return; }
    var top = nodes[0], s1 = top.value / total;
    var items = [];
    if (path.length === 0 && axis === "dzialy") {
      var s3 = d3.sum(nodes.slice(0, 3), function (n) { return n.value; }) / total * 100;
      items.push("<b>Trzy obszary</b> (" + nodes.slice(0, 3).map(function (n) { return lcFirst(n.label); }).join(", ") + ") to " + (s3 > 50 ? "ponad połowa" : pct(s3, 0)) + " wydatków: " + pct(s3, 1) + ".");
      var nth = everyNth(s1);
      items.push((nth ? "<b>" + ucFirst(nth) + "</b>" : "<b>" + pct(s1 * 100, 1) + "</b> wydatków") + (nth ? " (" + pct(s1 * 100, 1) + ")" : "") + " idzie na " + lcFirst(top.label) + ".");
      var debt = dzialByCode(DATA, "757"), health = dzialByCode(DATA, "851");
      if (debt && health) items.push("Na <b>obsługę długu</b> idzie " + mldN(debt.plan) + " mld zł, " + (debt.plan > health.plan ? "więcej" : "mniej") + " niż na <b>ochronę zdrowia</b> (" + mldN(health.plan) + " mld zł).");
      else { var small = nodes.slice(-15); items.push("<b>" + small.length + " najmniejszych działów</b> to razem tylko " + pct(d3.sum(small, function (n) { return n.value; }) / total * 100, 1) + " wydatków."); }
    } else if (path.length === 0) {
      items.push("Najwięcej wydaje <b>" + escapeHtml(top.name) + "</b>: " + money(top.value) + ", czyli " + pct(s1 * 100, 1) + " budżetu.");
      var s5 = d3.sum(nodes.slice(0, 5), function (n) { return n.value; }) / total * 100;
      items.push("<b>Pięć największych części</b> wydaje razem " + pct(s5, 1) + " wszystkich pieniędzy.");
      items.push("Budżet dzieli się na <b>" + nodes.length + " " + plural(nodes.length, "część", "części", "części") + "</b>. Każda to instytucja, która dysponuje pieniędzmi, np. ministerstwo lub urząd.");
    } else {
      var cur = path[path.length - 1];
      items.push("<b>" + escapeHtml(cur.name) + "</b>: razem " + money(total) + ".");
      items.push("Największa pozycja to <b>" + escapeHtml(top.label) + "</b>: " + pct(s1 * 100, 1) + " tej kwoty.");
      items.push("Tu jest <b>" + nodes.length + " " + (cur.level === "czesc" ? plural(nodes.length, "dział", "działy", "działów") : plural(nodes.length, "rozdział", "rozdziały", "rozdziałów")) + "</b>.");
    }
    renderInsights("ins-tree", items);
  }

  // =====================================================================
  // ======================= DZIAŁ DETAIL (sheet) =========================
  // =====================================================================
  var sheetTrigger = null;
  function aggregatePartsForDzial(code) {
    var rows = [];
    (DATA.czesci || []).forEach(function (cz) {
      var sum = 0, roz = [];
      (cz.dzialy || []).forEach(function (dz) {
        if (dz.code === code) { sum += dz.plan; if (dz.rozdzialy) roz = roz.concat(dz.rozdzialy); }
      });
      if (sum > 0) rows.push({ czescCode: cz.code, czescName: fixName(cz.name), sum: sum, rozdzialy: roz });
    });
    rows.sort(function (a, b) { return b.sum - a.sum; });
    return { rows: rows, aggTotal: d3.sum(rows, function (r) { return r.sum; }) };
  }
  function dzialMeta(code) { return dzialByCode(DATA, code); }

  function wireSheet() {
    var bd = document.getElementById("sheet-backdrop");
    bd.addEventListener("click", function () { closeDzial(true); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && dzialDetail != null) closeDzial(true); });
    // simple focus trap inside the sheet
    var sheet = document.getElementById("dzial-detail");
    sheet.addEventListener("keydown", function (ev) {
      if (ev.key !== "Tab") return;
      var f = sheet.querySelectorAll('button, summary, [href], [tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    });
  }

  function openDzial(code, push) {
    if (!DATA || !dzialMeta(code)) return;
    hideTip();
    var wasOpen = dzialDetail != null;
    dzialDetail = code;
    if (!wasOpen) sheetTrigger = document.activeElement;
    var sheet = document.getElementById("dzial-detail"), bd = document.getElementById("sheet-backdrop");
    drawDzialDetail(code);
    sheet.hidden = false; bd.hidden = false;
    document.body.classList.add("sheet-open");
    sheet.scrollTop = 0;
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add("is-open"); bd.classList.add("is-open"); }); });
    setTimeout(function () { sheet.focus({ preventScroll: true }); }, 60);
    if (push) {
      var p = new URLSearchParams(location.search);
      p.set("rok", YEAR); p.set("dzial", code);
      if (VIEWS[view].slug) p.set("widok", VIEWS[view].slug);
      history.pushState({ dzial: code }, "", "?" + p.toString());
    }
  }
  function closeDzial(push) {
    if (dzialDetail == null) return;
    dzialDetail = null;
    var sheet = document.getElementById("dzial-detail"), bd = document.getElementById("sheet-backdrop");
    sheet.classList.remove("is-open"); bd.classList.remove("is-open");
    document.body.classList.remove("sheet-open");
    setTimeout(function () { if (dzialDetail == null) { sheet.hidden = true; bd.hidden = true; } }, prefersReduced() ? 0 : 460);
    if (push) {
      var p = new URLSearchParams(location.search);
      p.delete("dzial");
      if (YEAR === LATEST) p.delete("rok");
      var q = p.toString();
      history.pushState({}, "", q ? "?" + q : location.pathname);
    }
    if (sheetTrigger && sheetTrigger.focus && document.contains(sheetTrigger)) sheetTrigger.focus({ preventScroll: true });
    sheetTrigger = null;
  }

  function drawDzialDetail(code, yearChange) {
    var host = document.getElementById("dzial-detail"); if (!host) return;
    var dz = dzialMeta(code);
    if (!dz) { closeDzial(true); return; }
    var nm = fixName(dz.name);
    var agg = aggregatePartsForDzial(code);
    var share = dz.plan / DATA.meta.wydatki * 100;
    var maxSum = agg.rows.length ? agg.rows[0].sum : 1;
    var nRoz = d3.sum(agg.rows, function (r) { return r.rozdzialy.length; });
    var col = CMAP[colorKey(nm)];
    var pc = perCap(dz.plan);
    var r = prevRR(code);

    var parts = agg.rows.map(function (row, i) {
      var w = Math.max(1.5, row.sum / maxSum * 100);
      var pShare = row.sum / agg.aggTotal * 100;
      var rozHtml = row.rozdzialy.slice().sort(function (a, b) { return b.plan - a.plan; }).map(function (rz) {
        var rsh = row.sum ? (rz.plan / row.sum * 100) : 0;
        return '<div class="dd-roz"><span>' + escapeHtml(fixName(rz.name)) + ' <span class="dd-code">' + rz.code + "</span></span>" +
          '<span class="dd-roz-amt">' + money(rz.plan) + '<span class="dd-roz-pct">' + pl(rsh, 0) + "%</span></span></div>";
      }).join("");
      return '<details class="dd-part" style="--i:' + i + '"><summary>' +
        '<span class="dd-part-head"><span class="dd-part-name">' + escapeHtml(row.czescName) + ' <span class="dd-code">cz. ' + row.czescCode + '</span><i class="ti ti-chevron-right dd-chev" aria-hidden="true"></i></span>' +
        '<span class="dd-part-amt">' + money(row.sum) + '<span class="dd-part-pct">' + pl(pShare, 0) + "%</span></span></span>" +
        '<span class="dd-track"><span class="dd-fill" style="width:' + w.toFixed(1) + "%;background:" + CMAP[colorKey(row.czescName)].fill + '"></span></span>' +
        "</summary>" + '<div class="dd-roz-list">' + (rozHtml || '<p class="dd-empty">Brak rozdziałów w danych.</p>') + "</div></details>";
    }).join("");

    host.innerHTML =
      '<div class="dd-top"><p class="dd-eyebrow mono"><span class="dot" style="background:' + col.fill + '"></span>Dział ' + escapeHtml(code) + " · plan " + YEAR + "</p>" +
        '<button type="button" class="icon-btn" id="dd-close" aria-label="Zamknij szczegóły"><i class="ti ti-x" aria-hidden="true"></i></button></div>' +
      '<h2 class="dd-title">' + escapeHtml(nm) + "</h2>" +
      '<p class="dd-amount"><span class="dd-amount-num" id="dd-amt"></span></p>' +
      '<div class="dd-facts">' +
        '<div class="dd-fact"><span class="mono">Udział</span><b>' + pct(share, 1) + "</b></div>" +
        '<div class="dd-fact"><span class="mono">Na osobę</span><b>' + (pc ? zl(pc) : "—") + "</b></div>" +
        '<div class="dd-fact"><span class="mono">r/r</span><b>' + (r == null ? "—" : (r > 0 ? "+" : "−") + pl(Math.abs(r), 1) + "%") + "</b></div>" +
      "</div>" +
      '<div class="dd-chart"><div class="k"><span class="mono">Plan ' + trendRange() + ", mld zł</span></div><svg id=\"dd-spark\" aria-hidden=\"true\"></svg></div>" +
      '<h3 class="dd-h">Kto wydaje te pieniądze</h3>' +
      '<p class="dd-sub">' + agg.rows.length + " " + plural(agg.rows.length, "część", "części", "części") + " budżetu (instytucje) · " + nRoz + " " + plural(nRoz, "rozdział", "rozdziały", "rozdziałów") + ". Rozwiń, aby zobaczyć rozdziały.</p>" +
      '<div class="dd-parts">' + parts + "</div>" +
      (Math.abs(agg.aggTotal - dz.plan) > 1 ? '<p class="hint dd-note"><i class="ti ti-info-circle" aria-hidden="true"></i> Suma rozbicia wg części (' + exactTys(agg.aggTotal) + ") może nieznacznie różnić się od kwoty działu w zestawieniu zbiorczym (" + exactTys(dz.plan) + "). To różnice klasyfikacyjne w ustawie, nie błąd.</p>" : "");

    document.getElementById("dd-close").addEventListener("click", function () { closeDzial(true); });
    var amtEl = document.getElementById("dd-amt");
    var f = statMoneyFmt(dz.plan);
    tweenValue(yearChange && prevStatVals.__dd ? prevStatVals.__dd : dz.plan * 0.7, dz.plan, 800, function (v) { var rr2 = f(v); amtEl.innerHTML = rr2.num + '<span class="unit"> ' + rr2.unit + "</span>"; });
    prevStatVals.__dd = dz.plan;
    requestAnimationFrame(function () { drawDetailChart(document.getElementById("dd-spark"), seriesFor(dz.name), col.line); });
  }

  // a dział over time: soft area + line + the selected year
  function drawDetailChart(svgEl, series, color) {
    if (!svgEl) return;
    var vals = series.filter(function (p) { return p.y != null; });
    if (vals.length < 2) { svgEl.parentNode.style.display = "none"; return; }
    var W = svgEl.clientWidth || 480, H = 120, m = { l: 4, r: 4, t: 18, b: 18 };
    var svg = d3.select(svgEl).attr("viewBox", "0 0 " + W + " " + H);
    svg.selectAll("*").remove();
    var x = d3.scaleLinear().domain([series[0].x, series[series.length - 1].x]).range([m.l, W - m.r]);
    var y = d3.scaleLinear().domain([0, d3.max(vals, function (p) { return p.y; }) * 1.1]).range([H - m.b, m.t]);
    var col = cssVar(color), gid = "dd-g";
    var gr = svg.append("defs").append("linearGradient").attr("id", gid).attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 1);
    gr.append("stop").attr("offset", 0).attr("stop-color", col).attr("stop-opacity", 0.25);
    gr.append("stop").attr("offset", 1).attr("stop-color", col).attr("stop-opacity", 0);
    var def = function (p) { return p.y != null; };
    svg.append("path").attr("d", d3.area().defined(def).x(function (p) { return x(p.x); }).y0(y(0)).y1(function (p) { return y(p.y); }).curve(d3.curveMonotoneX)(series)).attr("fill", "url(#" + gid + ")");
    var line = svg.append("path").attr("d", d3.line().defined(def).x(function (p) { return x(p.x); }).y(function (p) { return y(p.y); }).curve(d3.curveMonotoneX)(series))
      .attr("fill", "none").attr("stroke", col).attr("stroke-width", 2).attr("stroke-linecap", "round");
    if (!prefersReduced()) { var len = line.node().getTotalLength(); line.attr("stroke-dasharray", len + " " + len).attr("stroke-dashoffset", len).transition().duration(800).ease(d3.easeCubicOut).attr("stroke-dashoffset", 0); }
    var first = vals[0], cur = series.filter(function (p) { return p.x === YEAR; })[0];
    svg.append("text").attr("class", "axis-label").attr("x", x(first.x)).attr("y", H - 2).text(first.x);
    svg.append("text").attr("class", "axis-label").attr("x", x(series[series.length - 1].x)).attr("y", H - 2).attr("text-anchor", "end").text(series[series.length - 1].x);
    if (cur && cur.y != null) {
      svg.append("circle").attr("cx", x(cur.x)).attr("cy", y(cur.y)).attr("r", 4.5).attr("fill", col).attr("stroke", cssVar("var(--surface)")).attr("stroke-width", 2);
      var t = svg.append("text").attr("y", y(cur.y) - 10).attr("fill", cssVar("var(--ink)")).style("font", "600 12px " + cssVar("var(--sans)")).text(cur.x + " · " + pl(cur.y, 1));
      var tw = textW(t);
      t.attr("x", Math.max(m.l, Math.min(W - m.r - tw, x(cur.x) - tw / 2)));
      if (y(cur.y) - 10 < 10) t.attr("y", y(cur.y) + 20);
    }
  }

  // =====================================================================
  // ============================ PRZEPŁYW ================================
  // =====================================================================
  var DEF_NODE = "Deficyt (dług)";
  function buildSankeyGraph(opts) {
    opts = opts || {};
    var topN = opts.topN || 9;
    var mergeRev = !!opts.mergeRev;
    var dz = dzialyDesc().filter(function (d) { return d.plan > 0; });
    var top = dz.slice(0, topN), rest = dz.slice(topN);
    var restSum = d3.sum(rest, function (d) { return d.plan; });
    var nodes = [], nodeIndex = {};
    function addNode(name, kind, extra) {
      if (nodeIndex[name] != null) return nodeIndex[name];
      nodeIndex[name] = nodes.length;
      nodes.push(Object.assign({ name: name, kind: kind }, extra || {}));
      return nodeIndex[name];
    }
    var HUB = "Budżet państwa";
    addNode(HUB, "hub");
    var dochody = DATA.dochody.slice().sort(function (a, b) { return b.plan - a.plan; });
    var revLinks = [];
    if (mergeRev) {
      var keep = dochody.filter(function (r) { return /VAT|Akcyza/.test(r.name); });
      var mergedSum = d3.sum(dochody.filter(function (r) { return !/VAT|Akcyza/.test(r.name); }), function (r) { return r.plan; });
      keep.forEach(function (r) { addNode(r.name, "rev"); revLinks.push({ name: r.name, value: r.plan }); });
      addNode("Inne podatki", "rev"); revLinks.push({ name: "Inne podatki", value: mergedSum });
    } else {
      dochody.forEach(function (r) { addNode(r.name, "rev"); revLinks.push({ name: r.name, value: r.plan }); });
    }
    if (DATA.meta.deficyt > 0) addNode(DEF_NODE, "rev");
    top.forEach(function (d) { addNode(fixName(d.name), "exp", { code: d.code }); });
    if (restSum > 0) addNode("Pozostałe działy", "exp");
    var links = [];
    revLinks.forEach(function (r) { links.push({ source: nodeIndex[r.name], target: nodeIndex[HUB], value: r.value }); });
    if (DATA.meta.deficyt > 0) links.push({ source: nodeIndex[DEF_NODE], target: nodeIndex[HUB], value: DATA.meta.deficyt });
    top.forEach(function (d) { links.push({ source: nodeIndex[HUB], target: nodeIndex[fixName(d.name)], value: d.plan }); });
    if (restSum > 0) links.push({ source: nodeIndex[HUB], target: nodeIndex["Pozostałe działy"], value: restSum });
    return { nodes: nodes, links: links, HUB: HUB };
  }
  function sankeyNodeColor(n) {
    if (n.kind === "hub") return cssVar("var(--ink)");
    if (n.name === DEF_NODE) return cssVar("var(--down)");
    if (n.kind === "rev") return cssVar(SRC_COLOR[n.name] || "var(--c-other)");
    return cssVar(CMAP[colorKey(n.name)].fill);
  }
  function linkColor(d) {
    if (d.source.name === DEF_NODE) return cssVar("var(--down)");
    return sankeyNodeColor(d.target.kind === "exp" ? d.target : d.source);
  }
  function shortLabel(n) {
    var map = {
      "Pozostałe działy": "Pozostałe działy", "Inne dochody podatkowe i niepodatkowe": "Pozostałe dochody",
      "Inne podatki": "Inne dochody", "Deficyt (dług)": "Deficyt (pożyczone)", "Budżet państwa": "Budżet"
    };
    if (map[n.name]) return map[n.name];
    if (n.code) return dzialShort(n.code, n.name);
    return n.name;
  }
  function flowTip(title, v, total, sub) {
    return '<div class="tt-k">' + sub + '</div><div class="tt-t">' + escapeHtml(title) + '</div><div class="tt-v">' + money(v) + '</div><div class="tt-s">' + pct(v / total * 100, 1) + " wydatków budżetu" + (perCap(v) ? " · " + zl(perCap(v)) + " na osobę" : "") + "</div>" +
      '<div class="tt-x">' + exactTys(v) + "</div>";
  }

  function drawSankey() {
    if (!DATA) return;
    if (isMobile()) drawSankeyMobile(); else drawSankeyDesktop();
  }

  function drawSankeyDesktop() {
    setHtml("sankey-legend", "");
    var wrap = document.getElementById("sankey-wrap");
    var W = wrap.clientWidth || 1000;
    var H = Math.round(Math.max(480, Math.min(640, W * 0.56)));
    var svg = d3.select("#sankey").attr("viewBox", "0 0 " + W + " " + H).attr("height", H);
    svg.selectAll("*").remove();
    var LAB = 180, LAB_R = Math.min(250, Math.round(W * 0.2));   // room for labels on both outer sides
    var g = buildSankeyGraph();
    var graph = d3.sankey().nodeWidth(10).nodePadding(18).nodeSort(null).extent([[LAB, 18], [W - LAB_R, H - 18]])({
      nodes: g.nodes.map(function (d) { return Object.assign({}, d); }),
      links: g.links.map(function (d) { return Object.assign({}, d); })
    });
    var total = DATA.meta.wydatki, reduce = prefersReduced();
    var linkG = svg.append("g").attr("fill", "none");
    var slinks = linkG.selectAll("path").data(graph.links).enter().append("path")
      .attr("class", "slink").attr("d", d3.sankeyLinkHorizontal())
      .attr("stroke", linkColor).attr("stroke-width", function (d) { return Math.max(1, d.width); })
      .attr("stroke-opacity", reduce ? 0.28 : 0);
    if (!reduce) slinks.transition().delay(function (d, i) { return i * 30; }).duration(500).ease(d3.easeCubicOut).attr("stroke-opacity", 0.28);
    function hot(pred) { svg.classed("sankey-hover", true); slinks.classed("is-hot", pred); }
    function cool() { svg.classed("sankey-hover", false); slinks.classed("is-hot", false); hideTip(); }
    slinks.on("mouseenter", function (ev, d) {
      hot(function (l) { return l === d; });
      showTipHtml(ev, flowTip(shortLabel(d.source) + " → " + shortLabel(d.target), d.value, total, "Przepływ"));
    }).on("mousemove", positionTip).on("mouseleave", cool);

    var node = svg.append("g").selectAll("g").data(graph.nodes).enter().append("g").attr("class", "snode");
    node.append("rect")
      .attr("x", function (d) { return d.x0; }).attr("y", function (d) { return d.y0; })
      .attr("width", function (d) { return d.x1 - d.x0; }).attr("height", function (d) { return Math.max(1, d.y1 - d.y0); })
      .attr("fill", sankeyNodeColor).attr("rx", 3);
    node.style("cursor", "default")
      .on("mouseenter", function (ev, d) {
        hot(function (l) { return l.source === d || l.target === d; });
        showTipHtml(ev, flowTip(d.kind === "hub" ? "Budżet państwa" : (d.code ? fixName(d.name) : shortLabel(d)), d.value, total, d.kind === "rev" ? "Źródło" : d.kind === "hub" ? "Razem" : "Wydatek"));
      }).on("mousemove", positionTip).on("mouseleave", cool);
    if (!reduce) node.style("opacity", 0).transition().delay(function (d, i) { return 120 + i * 25; }).duration(400).style("opacity", 1);

    // labels — two lines when there is room, one line otherwise; always measured
    var ink = cssVar("var(--ink)"), ink2 = cssVar("var(--ink-2)"), surf = cssVar("var(--surface)");
    node.each(function (d) {
      var sel = d3.select(this), h = d.y1 - d.y0, cy = (d.y0 + d.y1) / 2;
      if (d.kind === "hub") {
        var t = sel.append("text").attr("class", "slabel").attr("x", (d.x0 + d.x1) / 2).attr("y", d.y0 - 8).attr("text-anchor", "middle").attr("fill", ink).style("font-weight", 600)
          .text("Budżet · " + moneyShort(d.value) + " zł");
        t.attr("paint-order", "stroke").attr("stroke", surf).attr("stroke-width", 4).attr("stroke-linejoin", "round");
        return;
      }
      var left = d.kind === "rev";
      var x = left ? d.x0 - 10 : d.x1 + 10, anchor = left ? "end" : "start";
      var room = (h + 18) >= 34;
      var name = sel.append("text").attr("class", "slabel").attr("x", x).attr("text-anchor", anchor).attr("fill", d.name === DEF_NODE ? cssVar("var(--down)") : ink)
        .attr("y", room ? cy - 2 : cy + 4).text(room ? shortLabel(d) : shortLabel(d) + " · " + moneyShort(d.value));
      var avail = (left ? LAB : LAB_R) - 16;
      if (!room && textW(name) > avail) name.text(shortLabel(d) + " " + moneyShort(d.value));
      fitText(name, avail);
      if (room) {
        var v = sel.append("text").attr("class", "svalue").attr("x", x).attr("y", cy + 13).attr("text-anchor", anchor).attr("fill", ink2).text(moneyShort(d.value) + " zł · " + pct(d.value / total * 100, 1));
        fitText(v, avail);
      }
    });
  }

  function drawSankeyMobile() {
    var wrap = document.getElementById("sankey-wrap");
    var W = wrap.clientWidth || 360;
    var g = buildSankeyGraph({ topN: 6, mergeRev: true });
    var TOP = 28, BOT = 26;                      // letters above, numbers below — names live in the legend
    var LH = W - 8, LW = Math.max(420, Math.min(620, W * 1.45));
    var graph = d3.sankey().nodeWidth(10).nodePadding(14).nodeSort(null).extent([[TOP, 4], [LW - BOT, LH - 4]])({
      nodes: g.nodes.map(function (d) { return Object.assign({}, d); }),
      links: g.links.map(function (d) { return Object.assign({}, d); })
    });
    var H = LW;
    var svg = d3.select("#sankey").attr("viewBox", "0 0 " + W + " " + H).attr("height", H);
    svg.selectAll("*").remove();
    var total = DATA.meta.wydatki;
    function vlink(d) {
      var sy = d.source.x1, tyy = d.target.x0;
      var x0 = d.y0, x1 = d.y1, ym = (sy + tyy) / 2;
      return "M" + x0 + "," + sy + "C" + x0 + "," + ym + " " + x1 + "," + ym + " " + x1 + "," + tyy;
    }
    var slinks = svg.append("g").attr("fill", "none").selectAll("path").data(graph.links).enter().append("path")
      .attr("class", "slink").attr("d", vlink).attr("stroke", linkColor).attr("stroke-opacity", 0.3)
      .attr("stroke-width", function (d) { return Math.max(1.5, d.width); });
    slinks.on("click", function (ev, d) { showTipHtml(ev, flowTip(shortLabel(d.source) + " → " + shortLabel(d.target), d.value, total, "Przepływ")); });
    svg.append("g").selectAll("rect").data(graph.nodes).enter().append("rect")
      .attr("x", function (d) { return d.y0; }).attr("y", function (d) { return d.x0; })
      .attr("width", function (d) { return Math.max(1, d.y1 - d.y0); }).attr("height", function (d) { return d.x1 - d.x0; })
      .attr("fill", sankeyNodeColor).attr("rx", 3);

    var ink = cssVar("var(--ink)"), ink2 = cssVar("var(--ink-2)"), surf = cssVar("var(--surface)");
    var labG = svg.append("g");
    // sources: two staggered rows above the nodes
    var revs = graph.nodes.filter(function (d) { return d.kind === "rev"; }).sort(function (a, b) { return a.y0 - b.y0; });
    var LET = "ABCDEFGH";
    revs.forEach(function (d, i) {
      labG.append("text").attr("class", "svalue").attr("x", (d.y0 + d.y1) / 2).attr("y", d.x0 - 10).attr("text-anchor", "middle")
        .attr("fill", d.name === DEF_NODE ? cssVar("var(--down)") : ink2).text(LET[i]);
    });
    var hub = graph.nodes.filter(function (d) { return d.kind === "hub"; })[0];
    if (hub) labG.append("text").attr("class", "slabel").attr("x", (hub.y0 + hub.y1) / 2).attr("y", hub.x0 - 8).attr("text-anchor", "middle").style("font-weight", 600)
      .attr("fill", ink).attr("paint-order", "stroke").attr("stroke", surf).attr("stroke-width", 4).text("Budżet · " + moneyShort(hub.value) + " zł");
    // expenses: a number under each node, names in the legend below (no rotated text)
    var exps = graph.nodes.filter(function (d) { return d.kind === "exp"; }).sort(function (a, b) { return a.y0 - b.y0; });
    exps.forEach(function (d, i) {
      labG.append("text").attr("class", "svalue").attr("x", (d.y0 + d.y1) / 2).attr("y", d.x1 + 16).attr("text-anchor", "middle").attr("fill", ink2).text(i + 1);
    });
    function li(d, mark) {
      return '<li' + (d.name === DEF_NODE ? ' class="is-def"' : "") + '><span class="sk-n">' + mark + '</span><i style="background:' + sankeyNodeColor(d) + '"></i><span class="sk-t">' + escapeHtml(shortLabel(d)) + "</span><b>" + moneyShort(d.value) + "</b></li>";
    }
    setHtml("sankey-legend", '<li class="sk-h mono">Skąd pieniądze</li>' + revs.map(function (d, i) { return li(d, LET[i]); }).join("") +
      '<li class="sk-h mono">Dokąd płyną</li>' + exps.map(function (d, i) { return li(d, i + 1); }).join(""));
  }

  function renderFlowInsights() {
    var m = DATA.meta, doch = DATA.dochody.slice().sort(function (a, b) { return b.plan - a.plan; });
    var top = doch[0], items = [];
    items.push("<b>" + (DOCH_SHORT[top.name] || top.name) + "</b> to " + pct(top.plan / m.dochody * 100, 1) + " wszystkich dochodów: " + money(top.plan) + ".");
    if (m.deficyt > 0) items.push("<b>" + Math.round(m.deficyt / m.wydatki * 100) + " gr</b> z każdej wydanej złotówki trzeba pożyczyć. Razem " + money(m.deficyt) + ".");
    else items.push("<b>Budżet zbilansowany.</b> Dochody pokrywają wszystkie wydatki, więc nie ma czerwonego strumienia.");
    var e = dzialyDesc()[0];
    items.push("Najszerszy strumień płynie do działu <b>" + lcFirst(dzialShort(e.code, e.name)) + "</b>: " + money(e.plan) + ".");
    renderInsights("ins-flow", items);
  }

  // =====================================================================
  // ============================ RODZAJE =================================
  // =====================================================================
  function typeColorKey(name) {
    var n = name.toLowerCase();
    if (/świadcz/.test(n)) return "social";
    if (/bieżąc/.test(n)) return "admin";
    if (/dotacj|subwencj/.test(n)) return "transfer";
    if (/majątk|inwestyc/.test(n)) return "infra";
    if (/dług/.test(n)) return "debt";
    if (/własne ue|środki własne/.test(n)) return "edu";
    if (/współfinans|projekt/.test(n)) return "health";
    return "other";
  }
  var TYPE_INFO = {
    "Dotacje i subwencje": ["Przelewy dla samorządów i instytucji", "Subwencje dla gmin, powiatów i województw oraz dotacje m.in. dla funduszy ubezpieczeń, uczelni i agencji."],
    "Świadczenia na rzecz osób fizycznych": ["Świadczenia dla ludzi", "Pieniądze wypłacane bezpośrednio osobom: świadczenia, zasiłki, stypendia."],
    "Wydatki bieżące jednostek": ["Utrzymanie państwa", "Pensje i bieżące koszty urzędów, sądów, wojska, policji i innych jednostek państwowych."],
    "Wydatki majątkowe": ["Inwestycje", "Budowy i zakupy na lata: drogi, sprzęt, budynki, systemy informatyczne."],
    "Obsługa długu Skarbu Państwa": ["Odsetki od długu", "Koszt pożyczonych pieniędzy: odsetki i inne koszty obsługi długu."],
    "Środki własne UE": ["Składka do UE", "Wpłata Polski do budżetu Unii Europejskiej."],
    "Współfinansowanie projektów UE": ["Wkład w projekty UE", "Krajowa część finansowania projektów współfinansowanych z budżetu Unii."]
  };
  function typeFriendly(n) { return (TYPE_INFO[n] || [n])[0]; }
  function typeShort(n) { return typeFriendly(n); }

  function drawTypes() {
    var src = (DATA && DATA.typy) ? DATA.typy : [];
    var host = document.getElementById("types"), stack = document.getElementById("type-stack");
    if (!src.length) { host.innerHTML = '<p class="mv-empty">Brak danych o rodzaju wydatku dla tego roku.</p>'; stack.innerHTML = ""; renderInsights("ins-type", []); return; }
    var total = d3.sum(src, function (t) { return t.plan; });
    var types = src.slice().sort(function (a, b) { return b.plan - a.plan; });
    var P = prevData(), prevBy = {};
    if (P && P.typy) P.typy.forEach(function (t) { prevBy[t.name] = t.plan; });

    stack.innerHTML = types.map(function (t, i) {
      return '<i style="flex:0 0 calc(' + (t.plan / total * 100).toFixed(2) + '% - 3px);background:' + CMAP[typeColorKey(t.name)].fill + ";--anim-delay:" + (i * 50) + 'ms" data-i="' + i + '"></i>';
    }).join("");
    stack.querySelectorAll("i").forEach(function (el) {
      var t = types[+el.getAttribute("data-i")];
      el.addEventListener("mouseenter", function (ev) { showTipHtml(ev, '<div class="tt-k">Rodzaj wydatku</div><div class="tt-t">' + typeFriendly(t.name) + '</div><div class="tt-v">' + money(t.plan) + '</div><div class="tt-s">' + pct(t.plan / total * 100, 1) + " wydatków</div>"); });
      el.addEventListener("mousemove", positionTip);
      el.addEventListener("mouseleave", hideTip);
    });

    host.innerHTML = types.map(function (t, i) {
      var info = TYPE_INFO[t.name] || [t.name, ""];
      var a = amtNum(t.plan), pc = perCap(t.plan);
      return '<div class="type-c" style="--anim-delay:' + (i * 50) + 'ms">' +
        '<div class="type-name"><span class="dot" style="background:' + CMAP[typeColorKey(t.name)].fill + '"></span>' + info[0] + "</div>" +
        '<div class="type-v">' + a.n + "<small>" + a.u + "</small></div>" +
        '<div class="type-meta"><span>' + pct(t.plan / total * 100, 1) + "</span>" + (pc ? "<span>" + zl(pc) + " na osobę</span>" : "") + (P ? deltaHtml(rr(t.plan, prevBy[t.name])) : "") + "</div>" +
        '<p class="type-d">' + info[1] + "</p>" +
        '<p class="type-official">' + exactTys(t.plan) + " · " + "w ustawie: „" + t.name + "”</p></div>";
    }).join("");

    var top = types[0];
    var inv = src.filter(function (t) { return /majątk/i.test(t.name); })[0];
    var debt = src.filter(function (t) { return /dług/i.test(t.name); })[0];
    var items = ["<b>" + typeFriendly(top.name) + "</b> to " + pct(top.plan / total * 100, 1) + " wszystkich wydatków. Te pieniądze wydaje ktoś inny: samorząd albo instytucja."];
    if (inv) items.push("Na <b>inwestycje</b> idzie " + pct(inv.plan / total * 100, 1) + " budżetu, czyli " + money(inv.plan) + ".");
    if (debt) items.push("<b>Odsetki od długu</b> kosztują " + money(debt.plan) + (perCap(debt.plan) ? ", czyli " + zl(perCap(debt.plan)) + " na każdą osobę." : "."));
    if (!/dotacj/i.test(top.name)) items[0] = "<b>" + typeFriendly(top.name) + "</b> to " + pct(top.plan / total * 100, 1) + " wszystkich wydatków.";
    renderInsights("ins-type", items);
  }

  // =====================================================================
  // ============================= TRENDY =================================
  // =====================================================================
  var TRENDS = null;
  var trendsMode = "zl";              // "zl" | "pct"
  var trendsCat = "Obrona narodowa";
  var trendsInit = false;

  function loadTrends(cb) {
    var st = document.getElementById("trends-state");
    function init() {
      if (!trendsInit) {
        trendsInit = true;
        if (st) st.style.display = "none";
        document.getElementById("trends-body").hidden = false;
        populateCatPicker();
        populateMoversPickers();
        wireTrends();
      }
      cb();
    }
    if (TRENDS) { loadContext(init); return; }
    getJSON("trends-data.json").then(function (json) { TRENDS = json; loadContext(init); })
      .catch(function (err) {
        console.error(err);
        if (st) st.innerHTML = '<i class="ti ti-alert-triangle"></i> Nie udało się wczytać danych historycznych.';
      });
  }

  function trendYears() { return TRENDS.meta.lata; }
  function fmtYearAxis(yr) { return "'" + String(yr).slice(2); }

  // categories present in >=75% of years, sorted by latest-year size
  function trendCategories() {
    var count = {}, latest = TRENDS.lata[TRENDS.lata.length - 1], latestMap = {};
    latest.dzialy.forEach(function (d) { latestMap[d.name] = d.plan; });
    TRENDS.lata.forEach(function (r) { r.dzialy.forEach(function (d) { count[d.name] = (count[d.name] || 0) + 1; }); });
    var n = TRENDS.lata.length;
    return Object.keys(count).filter(function (k) { return count[k] >= Math.ceil(n * 0.75); })
      .sort(function (a, b) { return (latestMap[b] || 0) - (latestMap[a] || 0); });
  }
  function populateCatPicker() {
    var sel = document.getElementById("trend-cat");
    if (!sel) return;
    var cats = trendCategories();
    if (cats.indexOf(trendsCat) < 0) trendsCat = cats[0];
    sel.innerHTML = cats.map(function (c) {
      return '<option value="' + escapeHtml(c) + '"' + (c === trendsCat ? " selected" : "") + ">" + escapeHtml(c) + "</option>";
    }).join("");
  }
  function wireTrends() {
    var zlB = document.getElementById("trend-zl"), pctB = document.getElementById("trend-pct");
    zlB.addEventListener("click", function () { setTrendsMode("zl"); });
    pctB.addEventListener("click", function () { setTrendsMode("pct"); });
    var sel = document.getElementById("trend-cat");
    sel.addEventListener("change", function () { trendsCat = sel.value; drawTrendCategory(); });
    document.getElementById("trend-real-curr").addEventListener("click", function () { setTrendsReal(false); });
    document.getElementById("trend-real-const").addEventListener("click", function () { setTrendsReal(true); });
    var mf = document.getElementById("movers-from"), mt = document.getElementById("movers-to");
    mf.addEventListener("change", function () { moversFrom = parseInt(mf.value, 10); drawMovers(); });
    mt.addEventListener("change", function () { moversTo = parseInt(mt.value, 10); drawMovers(); });
  }
  function setTrendsMode(m) {
    if (trendsMode === m) return;
    trendsMode = m;
    document.getElementById("trend-zl").setAttribute("aria-pressed", m === "zl" ? "true" : "false");
    document.getElementById("trend-pct").setAttribute("aria-pressed", m === "pct" ? "true" : "false");
    drawTrendTypes();
    drawTrendCategory();
  }

  function drawTrends() { if (!TRENDS) return; drawTrendKPIs(); drawTrendCharts(); }
  function drawTrendCharts() { if (!TRENDS) return; drawTrendTotals(); drawTrendTypes(); drawTrendCategory(); drawMovers(); }

  function buildLegendEl(id, items) {
    setHtml(id, items.map(function (it) {
      return '<span class="legend-item"><span class="legend-swatch" style="background:' + it.color + '"></span>' + escapeHtml(it.label) + "</span>";
    }).join(""));
  }

  // ---- KPI cards ----
  function statCards(hostId, cards, prefix) {
    var host = document.getElementById(hostId); if (!host) return;
    host.innerHTML = cards.map(function (c, i) {
      return '<div class="stat"><p class="stat-label">' + c.label + '</p><p class="stat-value' + (c.danger ? " is-danger" : "") + '" data-k="' + i + '"></p><p class="stat-foot">' + c.foot + "</p>" + (c.extra || "") + "</div>";
    }).join("");
    cards.forEach(function (c, i) {
      var el = host.querySelector('.stat-value[data-k="' + i + '"]');
      if (c.na) { el.textContent = "—"; return; }
      if (c.noAnim) { var rr0 = c.fmt(c.to); el.innerHTML = rr0.num + (rr0.unit ? '<span class="unit">' + rr0.unit + "</span>" : ""); return; }
      var key = prefix + i, from = prevStatVals[key]; if (from == null) from = 0;
      tweenValue(from, c.to, 900, function (v) { var r = c.fmt(v); el.innerHTML = r.num + (r.unit ? '<span class="unit">' + r.unit + "</span>" : ""); });
      prevStatVals[key] = c.to;
    });
  }
  function drawTrendKPIs() {
    var L = TRENDS.lata, first = L[0], last = L[L.length - 1];
    var growth = (last.wydatki / first.wydatki - 1) * 100;
    var maxDef = L.reduce(function (a, b) { return b.deficyt > a.deficyt ? b : a; });
    var balanced = L.filter(function (r) { return r.deficyt === 0; }).map(function (r) { return r.rok; });
    var cumDef = d3.sum(L, function (r) { return r.deficyt; });
    var realFirst = deflate(first.wydatki, first.rok);
    var realGrowth = CONTEXT ? (last.wydatki / realFirst - 1) * 100 : null;
    statCards("trend-kpis", [
      { label: "Wzrost wydatków", to: growth, fmt: statPctFmt(0), foot: first.rok + " → " + last.rok + (realGrowth != null ? " · realnie +" + Math.round(realGrowth) + "%" : "") },
      { label: "Największy deficyt", to: maxDef.deficyt, fmt: statMoneyFmt(maxDef.deficyt), foot: "w planie na " + maxDef.rok + " r.", danger: true },
      { label: "Budżet zbilansowany", to: 0, fmt: function () { return { num: balanced.length ? balanced.join(", ") : "nigdy", unit: "" }; }, foot: balanced.length ? "deficyt w planie = 0" : "w latach " + first.rok + "–" + last.rok, noAnim: true },
      { label: "Suma deficytów", to: cumDef, fmt: statMoneyFmt(cumDef), foot: "plany " + first.rok + "–" + last.rok }
    ], "__tk");
  }

  // ---- reusable responsive line chart with touch focus ----
  function trendLineChart(svgId, series, opts) {
    opts = opts || {};
    var svgEl = document.getElementById(svgId);
    if (!svgEl) return;
    var wrap = svgEl.parentNode;
    var W = wrap.clientWidth || 800;
    var narrow = W < 520;
    var H = opts.height || (narrow ? 240 : 300);
    var m = { t: 14, r: narrow ? 12 : 18, b: 26, l: narrow ? 62 : 68 };
    var iw = Math.max(10, W - m.l - m.r), ih = Math.max(10, H - m.t - m.b);
    var years = trendYears();
    var x = d3.scaleLinear().domain([years[0], years[years.length - 1]]).range([0, iw]);
    var allY = [];
    series.forEach(function (s) { s.values.forEach(function (p) { if (p.y != null) allY.push(p.y); }); });
    var ymax = d3.max(allY) || 1;
    var ymin = opts.allowNeg ? Math.min(0, d3.min(allY)) : 0;
    var y = d3.scaleLinear().domain([ymin, ymax * 1.06]).nice().range([ih, 0]);

    var svg = d3.select(svgEl).attr("viewBox", "0 0 " + W + " " + H).attr("height", H);
    svg.selectAll("*").remove();
    var defs = svg.append("defs");
    var g = svg.append("g").attr("transform", "translate(" + m.l + "," + m.t + ")");

    var yticks = y.ticks(narrow ? 4 : 5);
    g.selectAll("line.grid").data(yticks).enter().append("line").attr("class", "grid").attr("x1", 0).attr("x2", iw).attr("y1", y).attr("y2", y);
    g.selectAll("text.gy").data(yticks).enter().append("text").attr("class", "axis-label gy")
      .attr("x", -10).attr("y", y).attr("dy", "0.32em").attr("text-anchor", "end")
      .text(function (d) { return (opts.yFmt || moneyShort)(d); });
    var step = narrow ? 3 : (W < 760 ? 2 : 1);
    g.selectAll("text.gx").data(years).enter().append("text").attr("class", "axis-label gx")
      .attr("x", function (d) { return x(d); }).attr("y", ih + 18).attr("text-anchor", "middle")
      .text(function (d, i) { return (i % step === 0 || i === years.length - 1) ? (narrow ? fmtYearAxis(d) : d) : ""; });
    if (opts.markerYear != null && years.indexOf(opts.markerYear) >= 0) {
      g.append("line").attr("class", "year-marker").attr("x1", x(opts.markerYear)).attr("x2", x(opts.markerYear)).attr("y1", 0).attr("y2", ih);
    }

    var reduce = prefersReduced();
    var line = d3.line().defined(function (p) { return p.y != null; }).x(function (p) { return x(p.x); }).y(function (p) { return y(p.y); }).curve(d3.curveMonotoneX);
    series.forEach(function (s, si) {
      if (si === 0 && opts.area !== false) {
        var gid = svgId + "-g" + si;
        var gr = defs.append("linearGradient").attr("id", gid).attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 1);
        gr.append("stop").attr("offset", 0).attr("stop-color", s.color).attr("stop-opacity", 0.18);
        gr.append("stop").attr("offset", 1).attr("stop-color", s.color).attr("stop-opacity", 0);
        g.append("path").datum(s.values).attr("fill", "url(#" + gid + ")")
          .attr("d", d3.area().defined(function (p) { return p.y != null; }).x(function (p) { return x(p.x); }).y0(y(Math.max(0, ymin))).y1(function (p) { return y(p.y); }).curve(d3.curveMonotoneX));
      }
      var path2 = g.append("path").datum(s.values).attr("fill", "none")
        .attr("stroke", s.color).attr("stroke-width", narrow ? 2 : 2.4)
        .attr("stroke-linejoin", "round").attr("stroke-linecap", "round").attr("d", line);
      if (!reduce) {
        var len = path2.node().getTotalLength();
        if (len > 0) path2.attr("stroke-dasharray", len + " " + len).attr("stroke-dashoffset", len)
          .transition().duration(800).ease(d3.easeCubicOut).attr("stroke-dashoffset", 0)
          .on("end", function () { d3.select(this).attr("stroke-dasharray", null); });
      }
      s.values.forEach(function (p) {
        if (p.y == null) return;
        g.append("circle").attr("class", "tdot").attr("r", p.x === opts.markerYear ? 4 : (narrow ? 2 : 2.5))
          .attr("cx", x(p.x)).attr("cy", y(p.y)).attr("fill", s.color)
          .attr("stroke", p.x === opts.markerYear ? cssVar("var(--surface)") : "none").attr("stroke-width", 2);
      });
    });

    var focusLine = g.append("line").attr("class", "focus-line").attr("y1", 0).attr("y2", ih).style("opacity", 0);
    var ov = g.append("rect").attr("width", iw).attr("height", ih).attr("fill", "transparent");
    var node = ov.node();
    function move(e) {
      var rect = node.getBoundingClientRect();
      var mx = (e.clientX - rect.left) * (iw / rect.width);
      var yr = Math.max(years[0], Math.min(years[years.length - 1], Math.round(x.invert(mx))));
      focusLine.attr("x1", x(yr)).attr("x2", x(yr)).style("opacity", 1);
      var rows = series.map(function (s) {
        var p = s.values.filter(function (pp) { return pp.x === yr; })[0];
        if (!p || p.y == null) return "";
        return '<div class="tt-row"><span class="tt-dot" style="background:' + s.color + '"></span>' + escapeHtml(s.name) + "<strong>" + (opts.yTip || opts.yFmt || money)(p.y) + "</strong></div>";
      }).join("");
      showTipHtml(e, '<div class="tt-t">' + yr + (trendsReal && !opts.noReal ? ' <span class="tt-k">ceny ' + REAL_BASE + "</span>" : "") + "</div>" + rows);
    }
    function leave() { hideTip(); focusLine.style("opacity", 0); }
    node.addEventListener("mousemove", move);
    node.addEventListener("mouseleave", leave);
    node.addEventListener("touchstart", function (e) { move(e.touches[0]); }, { passive: true });
    node.addEventListener("touchmove", function (e) { e.preventDefault(); move(e.touches[0]); }, { passive: false });
    node.addEventListener("touchend", leave);
  }

  function drawTrendTotals() {
    var L = TRENDS.lata;
    function vals(f) { return L.map(function (r) { return { x: r.rok, y: realVal(r[f], r.rok) }; }); }
    var series = [
      { name: "Wydatki", color: cssVar("var(--accent)"), values: vals("wydatki") },
      { name: "Dochody", color: cssVar("var(--c-social-line)"), values: vals("dochody") },
      { name: "Deficyt", color: cssVar("var(--down)"), values: vals("deficyt") }
    ];
    buildLegendEl("legend-totals", series.map(function (s) { return { label: s.name, color: s.color }; }));
    trendLineChart("chart-totals", series, { markerYear: YEAR, yFmt: moneyShort, yTip: money });
    var first = L[0], last = L[L.length - 1];
    var nom = last.wydatki / first.wydatki;
    var real = CONTEXT ? last.wydatki / deflate(first.wydatki, first.rok) : null;
    setText("trend-totals-h", "Od " + first.rok + " r. wydatki w planie wzrosły " + pl(nom, 1) + " raza" + (real ? ", a po uwzględnieniu inflacji " + pl(real, 1) + " raza." : "."));
  }

  function drawTrendCategory() {
    if (!TRENDS) return;
    var L = TRENDS.lata, pctMode = trendsMode === "pct";
    var values = L.map(function (r) {
      var d = r.dzialy.filter(function (x) { return x.name === trendsCat; })[0];
      var v = d ? d.plan : null;
      if (pctMode && v != null) v = v / r.wydatki * 100;
      else if (v != null) v = realVal(v, r.rok);
      return { x: r.rok, y: v };
    });
    var color = cssVar(CMAP[colorKey(trendsCat)].line);
    trendLineChart("chart-cat", [{ name: trendsCat, color: color, values: values }], {
      markerYear: YEAR,
      yFmt: pctMode ? function (v) { return pl(v, 0) + "%"; } : moneyShort,
      yTip: pctMode ? function (v) { return pct(v, 1); } : money
    });
    var vals = values.filter(function (p) { return p.y != null; });
    if (vals.length >= 2) {
      var a = vals[0], b = vals[vals.length - 1];
      setText("trend-cat-h", pctMode ? trendsCat + ": " + pct(a.y, 1) + " budżetu w " + a.x + " r., " + pct(b.y, 1) + " w " + b.x + " r."
        : trendsCat + ": " + money(a.y) + " w " + a.x + " r., " + money(b.y) + " w " + b.x + " r.");
    }
  }

  function drawTrendTypes() {
    if (!TRENDS) return;
    var svgEl = document.getElementById("chart-types");
    if (!svgEl) return;
    var W = svgEl.parentNode.clientWidth || 800;
    var narrow = W < 520;
    var H = narrow ? 260 : 300;
    var m = { t: 14, r: narrow ? 8 : 12, b: 26, l: narrow ? 62 : 68 };
    var iw = Math.max(10, W - m.l - m.r), ih = Math.max(10, H - m.t - m.b);
    var L = TRENDS.lata, years = trendYears(), pctMode = trendsMode === "pct";
    var typeNames = L[L.length - 1].typy.slice().sort(function (a, b) { return b.plan - a.plan; }).map(function (t) { return t.name; });
    var x = d3.scaleBand().domain(years.map(String)).range([0, iw]).padding(narrow ? 0.18 : 0.28);
    var maxTotal = pctMode ? 100 : d3.max(L, function (r) { return d3.sum(r.typy, function (t) { return realVal(t.plan, r.rok); }); });
    var y = d3.scaleLinear().domain([0, maxTotal]).nice().range([ih, 0]);
    var svg = d3.select(svgEl).attr("viewBox", "0 0 " + W + " " + H).attr("height", H);
    svg.selectAll("*").remove();
    var g = svg.append("g").attr("transform", "translate(" + m.l + "," + m.t + ")");
    var yticks = y.ticks(narrow ? 4 : 5);
    g.selectAll("line.grid").data(yticks).enter().append("line").attr("class", "grid").attr("x1", 0).attr("x2", iw).attr("y1", y).attr("y2", y);
    g.selectAll("text.gy").data(yticks).enter().append("text").attr("class", "axis-label gy")
      .attr("x", -10).attr("y", y).attr("dy", "0.32em").attr("text-anchor", "end")
      .text(function (d) { return pctMode ? d + "%" : moneyShort(d); });
    var step = W < 620 ? 3 : 2;
    g.selectAll("text.gx").data(years).enter().append("text").attr("class", "axis-label gx")
      .attr("x", function (d) { return x(String(d)) + x.bandwidth() / 2; }).attr("y", ih + 18).attr("text-anchor", "middle")
      .text(function (d, i) { return (i % step === 0 || i === years.length - 1) ? fmtYearAxis(d) : ""; });
    var reduce = prefersReduced();
    L.forEach(function (r) {
      var total = d3.sum(r.typy, function (t) { return t.plan; });
      var cum = 0, bx = x(String(r.rok)), bw = x.bandwidth();
      var colDelay = Math.min((r.rok - years[0]) * 22, 320);
      typeNames.forEach(function (tn, ti) {
        var t = r.typy.filter(function (z) { return z.name === tn; })[0];
        var val = t ? t.plan : 0;
        var disp = pctMode ? (total ? val / total * 100 : 0) : realVal(val, r.rok);
        var y0 = cum, y1 = cum + disp; cum = y1;
        var ry = y(y1), rh = Math.max(0, y(y0) - y(y1) - (ti < typeNames.length - 1 ? 1 : 0));
        var rect = g.append("rect").attr("class", "tseg").attr("x", bx).attr("width", bw).attr("rx", Math.min(3, bw / 4))
          .attr("y", reduce ? ry : ih).attr("height", reduce ? rh : 0)
          .attr("fill", cssVar(CMAP[typeColorKey(tn)].fill)).attr("opacity", r.rok === YEAR ? 1 : 0.82);
        rect.on("mouseenter", function (ev) { showTipHtml(ev, '<div class="tt-k">' + r.rok + '</div><div class="tt-t">' + typeFriendly(tn) + '</div><div class="tt-v">' + (pctMode ? pct(disp, 1) : money(disp)) + "</div>" + (pctMode ? "" : '<div class="tt-s">' + pct(total ? val / total * 100 : 0, 1) + " wydatków</div>")); })
          .on("mousemove", positionTip).on("mouseleave", hideTip);
        if (!reduce) rect.transition().delay(colDelay).duration(420).ease(d3.easeCubicOut).attr("y", ry).attr("height", rh);
      });
    });
    if (years.indexOf(YEAR) >= 0) g.append("rect").attr("class", "col-current").attr("x", x(String(YEAR)) - 3).attr("y", -4).attr("width", x.bandwidth() + 6).attr("height", ih + 4).attr("rx", 5);
    buildLegendEl("legend-types", typeNames.map(function (tn) { return { label: typeFriendly(tn), color: cssVar(CMAP[typeColorKey(tn)].fill) }; }));
    var last = L[L.length - 1], lt = last.typy.slice().sort(function (a, b) { return b.plan - a.plan; })[0];
    var lastTotal = d3.sum(last.typy, function (t) { return t.plan; });
    var firstRec = L[0], ft = firstRec.typy.filter(function (t) { return t.name === lt.name; })[0];
    var firstTotal = d3.sum(firstRec.typy, function (t) { return t.plan; });
    setText("trend-types-h", typeFriendly(lt.name) + ": " + pct(ft ? ft.plan / firstTotal * 100 : 0, 0) + " wydatków w " + firstRec.rok + " r., " + pct(lt.plan / lastTotal * 100, 0) + " w " + last.rok + " r.");
  }

  // ================= CONTEXT (CPI + ludność z GUS) =================
  var CONTEXT = null;
  var PRICE = {};               // rok -> poziom cen (baza 2011 = 100)
  var REAL_BASE = 2026;         // ceny stałe wyrażone w cenach tego roku
  var trendsReal = false;

  function loadContext(cb) {
    if (CONTEXT) { cb(); return; }
    getJSON("context-data.json").then(function (json) { CONTEXT = json; buildPriceLevels(); cb(); })
      .catch(function (err) { console.error(err); cb(); });
  }
  function buildPriceLevels() {
    PRICE = {}; var lvl = 100;
    CONTEXT.lata.forEach(function (r, i) { lvl = (i === 0) ? 100 : lvl * (r.cpi / 100); PRICE[r.rok] = lvl; });
    var base = CONTEXT.lata[CONTEXT.lata.length - 1].rok;
    if (PRICE[REAL_BASE] == null) REAL_BASE = base;
  }
  function popOf(year) { var r = (CONTEXT ? CONTEXT.lata : []).filter(function (x) { return x.rok === year; })[0]; return r ? r.ludnosc : null; }
  function deflate(val, year) {
    if (!CONTEXT || PRICE[year] == null || PRICE[REAL_BASE] == null) return val;
    return val * (PRICE[REAL_BASE] / PRICE[year]);
  }
  function realVal(val, year) { return (trendsReal && val != null) ? deflate(val, year) : val; }

  // ================= NAJWIĘKSZE ZMIANY =================
  var moversFrom = null, moversTo = null;
  function yearRecT(y) { return TRENDS.lata.filter(function (r) { return r.rok === y; })[0]; }
  function populateMoversPickers() {
    var years = trendYears();
    if (moversFrom == null) moversFrom = years[0];
    if (moversTo == null) moversTo = years[years.length - 1];
    [["movers-from", moversFrom], ["movers-to", moversTo]].forEach(function (p) {
      var sel = document.getElementById(p[0]); if (!sel) return;
      sel.innerHTML = years.map(function (y) { return '<option value="' + y + '"' + (y === p[1] ? " selected" : "") + ">" + y + "</option>"; }).join("");
    });
  }
  function moverRow(name, w, color, amt) {
    return '<div class="mv-row"><span class="mv-name" title="' + escapeHtml(name) + '">' + escapeHtml(name) + "</span>" +
      '<span class="mv-track"><span class="mv-fill" style="width:' + w.toFixed(1) + "%;background:" + color + '"></span></span>' +
      '<span class="mv-amt">' + amt + "</span></div>";
  }
  function drawMovers() {
    if (!TRENDS) return;
    var host = document.getElementById("movers"); if (!host) return;
    var a = yearRecT(moversFrom), b = yearRecT(moversTo);
    if (!a || !b) { host.innerHTML = ""; return; }
    function mapOf(rec) { var m = {}; rec.dzialy.forEach(function (d) { m[d.name] = realVal(d.plan, rec.rok); }); return m; }
    var ma = mapOf(a), mb = mapOf(b), names = {};
    Object.keys(ma).forEach(function (n) { names[n] = 1; }); Object.keys(mb).forEach(function (n) { names[n] = 1; });
    var rows = Object.keys(names).map(function (n) {
      var va = ma[n] || 0, vb = mb[n] || 0;
      // suppress % when a dział is absent in one year (rename/reclassification, not a real 0→x / x→0 change)
      return { name: n, delta: vb - va, pct: (va > 0 && vb > 0) ? (vb / va - 1) * 100 : null };
    }).filter(function (r) { return Math.abs(r.delta) > 0; });
    var gain = rows.filter(function (r) { return r.delta > 0; }).sort(function (x, y) { return y.delta - x.delta; }).slice(0, 6);
    var loss = rows.filter(function (r) { return r.delta < 0; }).sort(function (x, y) { return x.delta - y.delta; }).slice(0, 6);
    var maxAbs = d3.max(rows, function (r) { return Math.abs(r.delta); }) || 1;
    function listHtml(title, arr, up) {
      return '<div class="movers-col"><h4 class="movers-h ' + (up ? "is-up" : "is-down") + '"><i class="ti ti-arrow-' + (up ? "up-right" : "down-right") + '" aria-hidden="true"></i>' + title + "</h4>" +
        (arr.length ? arr.map(function (r) {
          var sign = r.delta >= 0 ? "+" : "−";
          var pctS = r.pct == null ? "" : '<span class="mv-pct">' + sign + pl(Math.abs(r.pct), 0) + "%</span>";
          return moverRow(r.name, Math.max(3, Math.abs(r.delta) / maxAbs * 100), CMAP[colorKey(r.name)].fill, sign + money(Math.abs(r.delta)) + pctS);
        }).join("") : '<p class="mv-empty">Brak</p>') + "</div>";
    }
    host.innerHTML = listHtml("Najbardziej wzrosły", gain, true) + listHtml("Najbardziej spadły", loss, false);
  }

  function setTrendsReal(real) {
    if (trendsReal === real) return;
    trendsReal = real;
    document.getElementById("trend-real-curr").setAttribute("aria-pressed", real ? "false" : "true");
    document.getElementById("trend-real-const").setAttribute("aria-pressed", real ? "true" : "false");
    drawTrendKPIs(); drawTrendTotals(); drawTrendTypes(); drawTrendCategory(); drawMovers();
  }

  // =====================================================================
  // ========================== TWOJE PODATKI =============================
  // =====================================================================
  var taxesWired = false;
  function wireTaxes() {
    if (taxesWired) return; taxesWired = true;
    var inp = document.getElementById("tax-input"), rng = document.getElementById("tax-range");
    function set(v, src) { taxAmount = (isFinite(v) && v >= 0) ? v : 0; syncTaxInputs(src); drawTaxSplit(); }
    if (inp) inp.addEventListener("input", function () { set(parseFloat(inp.value), inp); });
    if (rng) rng.addEventListener("input", function () { set(parseFloat(rng.value), rng); });
  }
  function drawTaxes(resizeOnly) {
    if (!DATA) return;
    var st = document.getElementById("taxes-state"), body = document.getElementById("taxes-body");
    if (!CONTEXT) { loadContext(function () { if (CONTEXT) drawTaxes(); }); }
    if (st) st.style.display = "none";
    if (body) body.hidden = false;
    syncTaxInputs(null);
    if (!resizeOnly) drawTaxKPIs();
    drawTax1000();
    drawTaxSplit();
  }
  function drawTaxKPIs() {
    var m = DATA.meta, pop = popOf(YEAR);
    statCards("tax-kpis", [
      { label: "Wydatki na osobę", to: pop ? m.wydatki / pop : 0, fmt: statMoneyFmt(pop ? m.wydatki / pop : 0), foot: "w " + (m.rok || YEAR) + " r.", na: !pop },
      { label: "Dochody na osobę", to: pop ? m.dochody / pop : 0, fmt: statMoneyFmt(pop ? m.dochody / pop : 0), foot: "wpływy ÷ ludność", na: !pop },
      { label: "Deficyt na osobę", to: pop ? m.deficyt / pop : 0, fmt: statMoneyFmt(pop ? m.deficyt / pop : 0), foot: "pożyczone na każdego", danger: m.deficyt > 0, na: !pop },
      { label: "Dziennie na osobę", to: pop ? m.wydatki / pop / 365 : 0, fmt: statMoneyFmt(pop ? m.wydatki / pop / 365 : 0), foot: "wydatki ÷ 365 dni", na: !pop }
    ], "__xk");
  }
  // top działy + "pozostałe", each with a distinct colour (same-category neighbours get a lighter tint)
  function taxRows(topN) {
    var dz = dzialyDesc().filter(function (d) { return d.plan > 0; });
    var total = d3.sum(dz, function (d) { return d.plan; }) || 1;
    var top = dz.slice(0, topN), restSum = d3.sum(dz.slice(topN), function (d) { return d.plan; });
    var seen = {};
    var rows = top.map(function (d) {
      var nm = fixName(d.name), k = colorKey(nm), c = CMAP[k].fill;
      if (seen[k]) c = "color-mix(in srgb, " + CMAP[k].fill + " " + (seen[k] === 1 ? 62 : 40) + "%, var(--surface))";
      seen[k] = (seen[k] || 0) + 1;
      return { code: d.code, name: dzialShort(d.code, d.name), full: nm, share: d.plan / total, color: c };
    });
    if (restSum > 0) rows.push({ code: null, name: "Pozostałe działy", full: "Pozostałe działy", share: restSum / total, color: "var(--surface-3)" });
    return rows;
  }
  function drawTax1000() {
    var rows = taxRows(7);
    // 100 squares = 1000 zł: largest-remainder allocation so the squares add up exactly
    var raw = rows.map(function (r) { return r.share * 100; });
    var cells = raw.map(Math.floor), left = 100 - d3.sum(cells);
    raw.map(function (v, i) { return { i: i, f: v - Math.floor(v) }; }).sort(function (a, b) { return b.f - a.f; })
      .slice(0, left).forEach(function (o) { cells[o.i]++; });
    var html = "", k = 0;
    rows.forEach(function (r, i) {
      for (var j = 0; j < cells[i]; j++) {
        html += '<i style="background:' + r.color + ";--d:" + Math.min(k * 6, 600) + 'ms" data-r="' + i + '"></i>';
        k++;
      }
    });
    var wf = document.getElementById("tax-waffle");
    wf.innerHTML = html;
    wf.setAttribute("aria-label", rows.map(function (r) { return r.name + " " + Math.round(r.share * 1000) + " zł"; }).join(", "));
    wf.querySelectorAll("i").forEach(function (el) {
      var r = rows[+el.getAttribute("data-r")];
      el.addEventListener("mouseenter", function (ev) { showTipHtml(ev, '<div class="tt-k">Z każdych 1000 zł</div><div class="tt-t">' + escapeHtml(r.full) + '</div><div class="tt-v">' + zl(r.share * 1000) + '</div><div class="tt-s">' + pct(r.share * 100, 1) + " budżetu</div>"); });
      el.addEventListener("mousemove", positionTip);
      el.addEventListener("mouseleave", hideTip);
    });
    setHtml("tax-1000", rows.map(function (r) {
      return '<div class="tx-i"><i style="background:' + r.color + '"></i><span>' + escapeHtml(r.name) + "</span><b>" + zl(r.share * 1000) + "</b></div>";
    }).join(""));
    var t = rows[0];
    setText("tax-1000-h", ucFirst(lcFirst(t.name)) + " to " + zl(t.share * 1000) + " z każdych 1000 zł.");
  }
  function drawTaxSplit() {
    var host = document.getElementById("tax-split"); if (!host || !DATA) return;
    var rows = taxRows(9);
    var maxShare = d3.max(rows, function (r) { return r.share; }) || 1;
    host.innerHTML = rows.map(function (r) {
      return '<div class="taxbar"><span class="taxbar-name" title="' + escapeHtml(r.full) + '">' + escapeHtml(r.name) + "</span>" +
        '<span class="taxbar-track"><span class="taxbar-fill" style="width:' + Math.max(1.5, r.share / maxShare * 100).toFixed(1) + "%;background:" + r.color + '"></span></span>' +
        '<span class="taxbar-amt">' + zl(r.share * taxAmount) + "</span></div>";
    }).join("");
    var t = rows[0];
    setText("tax-split-h", taxAmount > 0 ? "Z " + zl(taxAmount) + " najwięcej, " + zl(t.share * taxAmount) + ", idzie na " + lcFirst(t.name) + "." : "Wpisz kwotę, a pokażemy, jak się dzieli.");
  }

  // =====================================================================
  // ======================== PLAN VS WYKONANIE ===========================
  // =====================================================================
  // 2026 is year-to-date (sprawozdanie operatywne), not a closed year.
  var WYK_FILES = { 2026: "wykonanie-2026.json", 2025: "wykonanie-2025.json", 2024: "wykonanie-2024.json", 2023: "wykonanie-2023.json", 2022: "wykonanie-2022.json", 2021: "wykonanie-2021.json", 2020: "wykonanie-2020.json", 2019: "wykonanie-2019.json", 2018: "wykonanie-2018.json", 2017: "wykonanie-2017.json", 2016: "wykonanie-2016.json", 2015: "wykonanie-2015.json", 2014: "wykonanie-2014.json", 2013: "wykonanie-2013.json", 2012: "wykonanie-2012.json", 2011: "wykonanie-2011.json" };
  var EXEC_PO = { 1: "po styczniu", 2: "po lutym", 3: "po marcu", 4: "po kwietniu", 5: "po maju", 6: "po czerwcu", 7: "po lipcu", 8: "po sierpniu", 9: "po wrześniu", 10: "po październiku", 11: "po listopadzie" };
  var EXEC_KONIEC = { 1: "stycznia", 2: "lutego", 3: "marca", 4: "kwietnia", 5: "maja", 6: "czerwca", 7: "lipca", 8: "sierpnia", 9: "września", 10: "października", 11: "listopada" };
  var EXEC_CLOSED_LEAD = "Ile z zaplanowanego budżetu faktycznie wydano. Porównanie planu z ustawy budżetowej z wykonaniem według sprawozdania Ministerstwa Finansów.";
  var EXEC_CLOSED_HINT = "„% planu” = wykonanie ÷ plan z ustawy. MF liczy wykonanie względem planu po zmianach (po rezerwach), więc względem pierwotnej ustawy bywa ponad 100% tam, gdzie uruchomiono rezerwy celowe (np. rolnictwo, zdrowie). Część pieniędzy trafia też do działów spoza pierwotnego planu.";
  var WYK_CACHE = {};

  function updateExecTab() {
    var btn = document.getElementById("tab-exec");
    if (btn) btn.style.display = WYK_FILES[YEAR] ? "" : "none";
    refreshExecTabLabel();
  }
  function setExecTabLabel(partial) {
    var btn = document.getElementById("tab-exec");
    if (btn) btn.classList.toggle("is-live", !!partial);
    setText("tab-exec-label", partial ? "Wykonanie w toku" : "Wykonanie");
  }
  function setExecStatus(text) {
    var el = document.getElementById("exec-status");
    if (!el) return;
    if (!text) { el.hidden = true; return; }
    setText("exec-status-text", text);
    el.hidden = false;
  }
  function refreshExecTabLabel() {
    if (!WYK_FILES[YEAR]) { setExecTabLabel(false); return; }
    var yr = YEAR;
    loadExec(function (W) { if (yr === YEAR) setExecTabLabel(!!execMonths(W)); });
  }
  function loadExec(cb) {
    var yr = YEAR, file = WYK_FILES[yr];
    if (!file) { cb(null); return; }
    if (WYK_CACHE[yr]) { cb(WYK_CACHE[yr]); return; }
    getJSON(file).then(function (json) { WYK_CACHE[yr] = json; cb(json); })
      .catch(function (err) { console.error(err); cb(null); });
  }
  function execPct(wyk, plan) { return plan > 0 ? wyk / plan * 100 : null; }
  // partial year: meta.miesiace is 1–11. A closed year has no such field.
  function execMonths(W) {
    var n = W && W.meta && W.meta.miesiace;
    return (typeof n === "number" && n > 0 && n < 12) ? n : 0;
  }
  function applyExecChrome(W) {
    var n = execMonths(W);
    if (!n) {
      setExecTabLabel(false);
      setExecStatus("");
      setText("exec-lead", EXEC_CLOSED_LEAD);
      setText("exec-hint-text", EXEC_CLOSED_HINT);
      setText("exec-h-bars", "Plan obok wykonania");
      setText("exec-h-doch", "Dochody wg źródła: % planu");
      setText("exec-h-list", "Stopień wykonania wg działów");
      setText("exec-list-note", "kreska = 100% planu");
      setText("exec-h-odch", "Największe odchylenia od planu");
      return;
    }
    var po = EXEC_PO[n] || "narastająco";
    var rok = (W.meta && W.meta.rok) || YEAR;
    var okres = (W.meta && W.meta.okres) ? " (" + W.meta.okres + ")" : "";
    var koniec = EXEC_KONIEC[n] || po;
    setExecTabLabel(true);
    setExecStatus("Stan na koniec " + koniec + " " + rok + ", " + n + " z 12 miesięcy. Kwoty to wykonanie narastająco, nie wynik za cały rok.");
    setText("exec-lead", "Stan na koniec " + koniec + " " + rok + okres + ". Plan z ustawy na cały rok obok tego, co już wydano i zebrano.");
    setText("exec-hint-text", (W.meta && W.meta.uwaga) || "");
    setText("exec-h-bars", "Plan roczny obok wykonania " + po);
    setText("exec-h-doch", "Dochody wg źródła: stan " + po);
    setText("exec-h-list", "Ile planu rocznego już wydano, wg działów");
    setText("exec-list-note", "kreska = " + n + "/12 roku");
    setText("exec-h-odch", "Tempo wobec " + n + "/12 roku");
  }
  function drawExec() {
    var st = document.getElementById("exec-state"), body = document.getElementById("exec-body"), notice = document.getElementById("exec-notice");
    if (st) st.style.display = "none";
    if (!WYK_FILES[YEAR]) { if (body) body.hidden = true; if (notice) notice.hidden = false; return; }
    if (notice) notice.hidden = true;
    var yr = YEAR;
    loadExec(function (W) {
      if (yr !== YEAR) return;
      if (!W) { if (notice) { notice.hidden = false; notice.textContent = "Nie udało się wczytać danych o wykonaniu."; } if (body) body.hidden = true; return; }
      if (body) body.hidden = false;
      applyExecChrome(W);
      drawExecRings(W); drawExecSummary(W); drawExecKPIs(W); drawExecBars(W); drawExecDochody(W); drawExecList(W); drawExecOdchylenia(W);
    });
  }
  function drawExecRings(W) {
    var rings = execRings(W), n = execMonths(W), m = DATA.meta, w = W.wykonanie;
    drawRings(document.getElementById("exec-rings"), rings);
    setHtml("exec-rings-leg", ringLegend(rings));
    if (n) {
      setHtml("exec-rings-k", '<span class="live">W toku · ' + (EXEC_PO[n] || "") + "</span>");
      setText("exec-rings-h", "Minęło " + Math.round(n / 12 * 100) + "% roku. Wydano " + Math.round(execPct(w.wydatki, m.wydatki)) + "% planu.");
    } else {
      setText("exec-rings-k", "Rok " + YEAR + " · zamknięty");
      var dw = (w.wydatki / m.wydatki - 1) * 100;
      setText("exec-rings-h", "Wydano " + pct(Math.abs(dw), 1) + (dw < 0 ? " mniej" : " więcej") + ", niż zakładała ustawa.");
    }
  }
  function execDev(plan, wyk) { return { diff: wyk - plan, pct: plan ? (wyk / plan - 1) * 100 : null }; }
  function absPct(p) { return pl(Math.abs(p), 1); }
  function signMoney(diff) { return (diff >= 0 ? "+" : "−") + money(Math.abs(diff)); }
  function drawExecSummary(W) {
    var el = document.getElementById("exec-summary"); if (!el) return;
    var m = DATA.meta, w = W.wykonanie;
    var n = execMonths(W);
    if (n) {
      var spend = execPct(w.wydatki, m.wydatki), inc = execPct(w.dochody, m.dochody), def = execPct(w.deficyt, m.deficyt);
      var elapsed = Math.round(n / 12 * 100);
      var defClause = (def == null) ? " Deficyt wykonania to " + money(w.deficyt) + "."
        : " Deficyt sięgnął " + money(w.deficyt) + ", czyli " + absPct(def) + "% deficytu założonego w ustawie.";
      el.innerHTML = "Po " + n + " miesiącach wydano <strong>" + money(w.wydatki) + "</strong>, czyli <strong>" + absPct(spend) + "%</strong> rocznego planu. Dochody wyniosły " + money(w.dochody) + " (" + absPct(inc) + "% planu)." + defClause + " Minęło " + elapsed + "% roku.";
      return;
    }
    var dd = execDev(m.dochody, w.dochody), dw = execDev(m.wydatki, w.wydatki), df = execDev(m.deficyt, w.deficyt);
    function mw(p) { return p < 0 ? "mniej" : "więcej"; }
    var defClause = (df.pct == null)
      ? "W efekcie pojawił się deficyt " + money(w.deficyt) + ", choć ustawa zakładała budżet zrównoważony (plan 0)."
      : "W efekcie deficyt był o " + money(Math.abs(df.diff)) + " (" + absPct(df.pct) + "%) <strong>" + (df.diff < 0 ? "niższy" : "wyższy") + "</strong> od planu.";
    el.innerHTML = "W " + (m.rok || YEAR) + " r. do budżetu wpłynęło o <strong>" + absPct(dd.pct) + "% " + mw(dd.pct) + "</strong>, niż zaplanowano (" + signMoney(dd.diff) +
      "), a wydano o <strong>" + absPct(dw.pct) + "% " + mw(dw.pct) + "</strong> (" + signMoney(dw.diff) + "). " + defClause;
  }
  function drawExecKPIs(W) {
    var m = DATA.meta, n = execMonths(W);
    var po = n ? (EXEC_PO[n] || "narastająco") : "";
    var cards = [
      { label: "Wydatki", plan: m.wydatki, wyk: W.wykonanie.wydatki },
      { label: "Dochody", plan: m.dochody, wyk: W.wykonanie.dochody },
      { label: "Deficyt", plan: m.deficyt, wyk: W.wykonanie.deficyt, danger: true }
    ];
    statCards("exec-kpis", cards.map(function (c) {
      var dv = execDev(c.plan, c.wyk), share = execPct(c.wyk, c.plan);
      // closed year: deficyt lower than plan = good news. A partial year is not finished, so no good/bad.
      var dCls = (!n && c.label === "Deficyt") ? (dv.diff < 0 ? " is-good" : " is-bad") : "";
      var delta = n ? (share == null ? "—" : absPct(share) + "% planu rocznego")
        : (signMoney(dv.diff) + " · " + (dv.pct == null ? "—" : (dv.pct >= 0 ? "+" : "−") + absPct(dv.pct) + "%") + " vs plan");
      return { label: c.label + (n ? " " + po : ""), to: c.wyk, fmt: statMoneyFmt(c.wyk), foot: "plan " + money(c.plan), danger: c.danger, extra: '<p class="exec-delta' + dCls + '">' + delta + "</p>" };
    }), "__ek");
  }
  // the three totals: plan bar and execution bar on the same scale
  function drawExecBars(W) {
    var host = document.getElementById("exec-bars"); if (!host) return;
    var m = DATA.meta, w = W.wykonanie;
    var rows = [
      { label: "Wydatki", plan: m.wydatki, wyk: w.wydatki, col: "var(--c-social-line)" },
      { label: "Dochody", plan: m.dochody, wyk: w.dochody, col: "var(--c-defense-line)" },
      { label: "Deficyt", plan: m.deficyt, wyk: w.deficyt, col: "var(--down)" }
    ];
    var max = d3.max(rows, function (r) { return Math.max(r.plan, r.wyk); }) || 1;
    var n = execMonths(W);
    var planLab = n ? "plan roczny" : "plan", wykLab = n ? (EXEC_PO[n] || "wykonanie") : "wykonanie";
    host.innerHTML = rows.map(function (r, i) {
      function bar(val, cls, lab, d) {
        var pw = Math.max(0.5, Math.max(0, val) / max * 100);
        return '<div class="planbar-row"><span class="planbar-track"><span class="planbar-fill ' + cls + '" style="width:' + pw.toFixed(1) + "%;animation-delay:" + d + "ms;" + (cls === "is-wyk" ? "background:" + r.col : "") + '"></span></span>' +
          '<span class="planbar-val">' + lab + " " + moneyShort(val) + "</span></div>";
      }
      return '<div class="planbar-group"><div class="planbar-label">' + r.label + "</div>" + bar(r.plan, "is-plan", planLab, i * 90) + bar(r.wyk, "is-wyk", wykLab, i * 90 + 60) + "</div>";
    }).join("");
  }
  // bars with a reference mark: n/12 for a year in progress, 100% for a closed year
  function execBarRow(name, title, pctV, color, amtHtml, partialN) {
    var max = partialN ? 100 : 125;
    var mark = partialN ? partialN / 12 * 100 : 100;
    var w = Math.max(1.5, Math.min(pctV == null ? 0 : pctV, max) / max * 100);
    return '<div class="taxbar" title="' + escapeHtml(title) + '"><span class="taxbar-name">' + escapeHtml(name) + "</span>" +
      '<span class="taxbar-track"><span class="taxbar-fill" style="width:' + w.toFixed(1) + "%;background:" + color + '"></span><span class="taxbar-mark" style="left:' + (mark / max * 100).toFixed(1) + '%"></span></span>' +
      '<span class="taxbar-amt">' + amtHtml + "</span></div>";
  }
  function pctCls(pctV, partial) { return (!partial && pctV != null) ? (pctV >= 99 ? "is-over" : (pctV < 85 ? "is-low" : "")) : ""; }
  function drawExecList(W) {
    var host = document.getElementById("exec-list"); if (!host) return;
    var n = execMonths(W);
    var dz = DATA.dzialy.filter(function (d) { return W.dzialy[d.code] != null; }).sort(function (a, b) { return b.plan - a.plan; });
    host.innerHTML = dz.map(function (d) {
      var wyk = W.dzialy[d.code], p = execPct(wyk, d.plan), nm = fixName(d.name);
      return execBarRow(dzialShort(d.code, d.name), nm + ": plan " + money(d.plan) + " → wykonanie " + money(wyk), p, CMAP[colorKey(nm)].fill,
        '<span class="exec-pct ' + pctCls(p, n) + '">' + (p != null ? pl(p, 0) + "%" : "—") + "</span>", n);
    }).join("");
  }
  function drawExecDochody(W) {
    var host = document.getElementById("exec-dochody"); if (!host || !W.dochody) return;
    var inneName = "Inne dochody podatkowe i niepodatkowe";
    var known = W.dochody.VAT + W.dochody.Akcyza + W.dochody.CIT + W.dochody.PIT;
    var wykOf = function (name) { return name === inneName ? (W.wykonanie.dochody - known) : W.dochody[name]; };
    var n = execMonths(W);
    var rows = DATA.dochody.slice().filter(function (d) { return wykOf(d.name) != null; }).sort(function (a, b) { return b.plan - a.plan; });
    host.innerHTML = rows.map(function (d) {
      var wyk = wykOf(d.name), p = execPct(wyk, d.plan), nm = DOCH_SHORT[d.name] || d.name;
      var col = SRC_COLOR[d.name] || "var(--c-other)";
      // negative execution (PIT mid-year: shares sent to local governments exceed collections) is an amount, not a % bar
      if (wyk < 0) return execBarRow(nm, d.name + ": plan " + money(d.plan) + " → wykonanie " + signMoney(wyk), 0, col, '<span class="exec-pct is-low">' + signMoney(wyk) + "</span>", n);
      return execBarRow(nm, d.name + ": plan " + money(d.plan) + " → wykonanie " + money(wyk), p, col, '<span class="exec-pct ' + pctCls(p, n) + '">' + (p != null ? pl(p, 0) + "%" : "—") + "</span>", n);
    }).join("");
  }
  function drawExecOdchylenia(W) {
    var host = document.getElementById("exec-odchylenia"); if (!host) return;
    var n = execMonths(W);
    if (n) { drawExecPace(host, W, n); return; }
    var rows = DATA.dzialy.filter(function (d) { return W.dzialy[d.code] != null; }).map(function (d) {
      var wyk = W.dzialy[d.code];
      return { name: dzialShort(d.code, d.name), full: fixName(d.name), diff: wyk - d.plan, pct: d.plan ? wyk / d.plan * 100 : null };
    }).filter(function (r) { return Math.abs(r.diff) > 0; });
    var above = rows.filter(function (r) { return r.diff > 0; }).sort(function (a, b) { return b.diff - a.diff; }).slice(0, 5);
    var below = rows.filter(function (r) { return r.diff < 0; }).sort(function (a, b) { return a.diff - b.diff; }).slice(0, 5);
    var maxAbs = d3.max(rows, function (r) { return Math.abs(r.diff); }) || 1;
    function list(title, arr, up) {
      return '<div class="movers-col"><h4 class="movers-h ' + (up ? "is-up" : "is-down") + '">' + title + "</h4>" +
        (arr.length ? arr.map(function (r) {
          return moverRow(r.name, Math.max(3, Math.abs(r.diff) / maxAbs * 100), CMAP[colorKey(r.full)].fill, signMoney(r.diff) + (r.pct == null ? "" : '<span class="mv-pct">' + pl(r.pct, 0) + "% planu</span>"));
        }).join("") : '<p class="mv-empty">Brak</p>') + "</div>";
    }
    host.innerHTML = list("Najbardziej powyżej planu", above, true) + list("Najbardziej poniżej planu", below, false);
  }
  // partial year: distance from a flat pace (miesiące/12), not distance from the full-year plan
  function drawExecPace(host, W, n) {
    var pace = n / 12;
    var rows = DATA.dzialy.filter(function (d) { return W.dzialy[d.code] != null && d.plan > 0; }).map(function (d) {
      var share = W.dzialy[d.code] / d.plan;
      return { name: dzialShort(d.code, d.name), full: fixName(d.name), share: share, gap: share - pace };
    });
    var ahead = rows.filter(function (r) { return r.gap > 0; }).sort(function (a, b) { return b.gap - a.gap; }).slice(0, 5);
    var behind = rows.filter(function (r) { return r.gap < 0; }).sort(function (a, b) { return a.gap - b.gap; }).slice(0, 5);
    var maxAbs = d3.max(rows, function (r) { return Math.abs(r.gap); }) || 1;
    function list(title, arr, up) {
      return '<div class="movers-col"><h4 class="movers-h ' + (up ? "is-up" : "is-down") + '">' + title + "</h4>" +
        (arr.length ? arr.map(function (r) {
          var pkt = r.gap * 100;
          return moverRow(r.name, Math.max(3, Math.abs(r.gap) / maxAbs * 100), CMAP[colorKey(r.full)].fill, pl(r.share * 100, 0) + "% planu" + '<span class="mv-pct">' + (pkt >= 0 ? "+" : "−") + pl(Math.abs(pkt), 0) + " pkt</span>");
        }).join("") : '<p class="mv-empty">Brak</p>') + "</div>";
    }
    host.innerHTML = list("Szybciej niż równe tempo", ahead, true) + list("Wolniej niż równe tempo", behind, false);
  }

  // =====================================================================
  // ============================ SAMOUCZEK ===============================
  // =====================================================================
  var TUT = { id: "kYXm-8s79P0", seenKey: "budzet-tutorial-seen" };
  var tutLastTrigger = null;
  var tutWired = false;

  function readTutorialSeen() {
    try { return localStorage.getItem(TUT.seenKey) === "1"; }
    catch (e) { return true; }               // storage blocked → treat as seen, never nag
  }
  function markTutorialSeen() { try { localStorage.setItem(TUT.seenKey, "1"); } catch (e) {} }

  function buildTutorialPoster() {
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "tut-play"; btn.id = "tut-play";
    btn.setAttribute("aria-label", "Odtwórz samouczek");
    var img = document.createElement("img");
    img.className = "tut-poster"; img.alt = ""; img.setAttribute("aria-hidden", "true");
    img.width = 1280; img.height = 720;
    img.src = "https://i.ytimg.com/vi/" + TUT.id + "/maxresdefault.jpg";
    img.onerror = function () { this.onerror = null; this.src = "https://i.ytimg.com/vi/" + TUT.id + "/hqdefault.jpg"; };
    var ic = document.createElement("span");
    ic.className = "tut-play-icon"; ic.setAttribute("aria-hidden", "true");
    ic.innerHTML = '<i class="ti ti-player-play-filled"></i>';
    btn.appendChild(img); btn.appendChild(ic);
    return btn;
  }
  function buildTutorialIframe() {
    var f = document.createElement("iframe");
    f.className = "tut-iframe";
    f.setAttribute("src", "https://www.youtube-nocookie.com/embed/" + TUT.id + "?autoplay=1&rel=0&modestbranding=1");
    f.setAttribute("title", "Samouczek: Budżet Państwa Polskiego");
    f.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    f.setAttribute("allowfullscreen", "");
    f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    return f;
  }
  function playTutorial() {
    var host = document.getElementById("tut-video");
    if (!host) return;
    host.innerHTML = "";
    host.appendChild(buildTutorialIframe());
    var f = host.querySelector("iframe"); if (f) f.focus();
  }
  function openTutorial(trigger) {
    var dlg = document.getElementById("tutorial-dialog");
    if (!dlg) return;
    tutLastTrigger = trigger || document.activeElement || null;
    if (typeof dlg.showModal !== "function") { window.open("https://www.youtube.com/watch?v=" + TUT.id, "_blank", "noopener"); return; }
    if (dlg.open) return;
    var host = document.getElementById("tut-video");
    if (host) { host.innerHTML = ""; host.appendChild(buildTutorialPoster()); }
    dlg.showModal();
    var close = document.getElementById("tut-close"); if (close) close.focus();
  }
  function closeTutorial() {
    var dlg = document.getElementById("tutorial-dialog");
    if (!dlg) return;
    var host = document.getElementById("tut-video"); if (host) host.innerHTML = "";
    if (dlg.open) dlg.close();
    if (tutLastTrigger && tutLastTrigger.focus) tutLastTrigger.focus();
    tutLastTrigger = null;
  }
  function wireTutorial() {
    if (tutWired) return;
    var dlg = document.getElementById("tutorial-dialog");
    var openBtn = document.getElementById("tut-open");
    if (!dlg || !openBtn) return;
    tutWired = true;
    openBtn.addEventListener("click", function () { openTutorial(openBtn); });
    var closeBtn = document.getElementById("tut-close");
    if (closeBtn) closeBtn.addEventListener("click", closeTutorial);
    var host = document.getElementById("tut-video");
    if (host) host.addEventListener("click", function (ev) { if (ev.target.closest && ev.target.closest("#tut-play")) playTutorial(); });
    dlg.addEventListener("cancel", function (ev) { ev.preventDefault(); closeTutorial(); });
    dlg.addEventListener("click", function (ev) { if (ev.target === dlg) closeTutorial(); });
    dlg.addEventListener("close", function () { var h = document.getElementById("tut-video"); if (h) h.innerHTML = ""; });
  }
  function maybeShowFirstVisitTutorial() {
    if (readTutorialSeen()) return;
    markTutorialSeen();
    setTimeout(function () { openTutorial(document.getElementById("tut-open")); }, prefersReduced() ? 0 : 1400);
  }

  // =====================================================================
  // ============================= HELPERS ================================
  // =====================================================================
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function prefersReduced() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function activeChartEl() {
    if (view === "flow") return document.getElementById("sankey-wrap");
    if (view === "type") return document.getElementById("types");
    return null;
  }
  // soft blur-out → swap data → fade back in
  function crossfadeRedraw(redraw) {
    var el = activeChartEl();
    if (!el || prefersReduced()) { redraw(); return; }
    el.classList.add("chart-swap", "is-swapping");
    setTimeout(function () {
      redraw();
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.remove("is-swapping"); }); });
    }, 160);
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); var a = arguments, c = this; t = setTimeout(function () { fn.apply(c, a); }, ms); }; }

})();
