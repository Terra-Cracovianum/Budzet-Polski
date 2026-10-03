/* Budżet 2027 — historia w toku.
   One bill, told through its own numbers. Data: budzet-2027.json (the only file to update;
   section "ustawa" is parsed from Sejm print no. 3150) + budget-data.json / trends-data.json /
   context-data.json (2011–2026 plans shared with the explorer). */
(function () {
  "use strict";

  var REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var C = {
    gold: "#E8B04B", red: "#EF5A4C", blue: "#3E8EE0", green: "#22A57E", mint: "#5FD3AE", amber: "#C9831F",
    violet: "#8F7BEA", rose: "#D9567F", sand: "#B9AE98", gray: "#6E675C", dim: "#4A443B",
    surface: "#12110E", bg: "#0B0A09", ink: "#F4EFE6", inkSoft: "#BFB6A8", inkFaint: "#8A8377"
  };

  /* ---------------- helpers ---------------- */
  function fmt(v, dec) {
    if (v == null || isNaN(v)) return "—";
    return Number(v).toLocaleString("pl-PL", { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  }
  function nb(s) { return String(s).replace(/\s/g, " "); }
  function mld(v, dec) { return nb(fmt(v, dec == null ? 1 : dec)) + " mld zł"; }
  function zl(v) { return nb(fmt(Math.round(v))) + " zł"; }
  function signed(v, dec, suf) { return (v > 0 ? "+" : v < 0 ? "−" : "±") + nb(fmt(Math.abs(v), dec)) + (suf || ""); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  var MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  var MONTHS_NOM = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
  function fmtDate(iso) { var p = iso.split("-"); return p.length === 2 ? MONTHS_NOM[+p[1] - 1] + " " + p[0] : (+p[2]) + " " + MONTHS[+p[1] - 1] + " " + p[0]; }
  function dur(ms) { return REDUCED ? 0 : ms; }
  function largestRemainder(values, total) {
    var sum = d3.sum(values), raw = values.map(function (v) { return v / sum * total; });
    var fl = raw.map(Math.floor), rem = total - d3.sum(fl);
    raw.map(function (v, i) { return [v - fl[i], i]; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, rem).forEach(function (p) { fl[p[1]]++; });
    return fl;
  }
  function onceVisible(el, fn, th) {
    if (!el) return;
    new IntersectionObserver(function (en, o) { if (en[0].isIntersecting) { fn(); o.disconnect(); } }, { threshold: th || 0.2 }).observe(el);
  }

  var tt = $("tt");
  function showTT(html, x, y) { tt.innerHTML = html; tt.style.left = x + "px"; tt.style.top = y + "px"; tt.classList.add("is-on"); }
  function hideTT() { tt.classList.remove("is-on"); }

  function getJSON(u) { return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(u + " " + r.status); return r.json(); }); }
  Promise.all([getJSON("budzet-2027.json"), getJSON("trends-data.json"), getJSON("context-data.json"), getJSON("budget-data.json")])
    .then(function (r) { init(r[0], r[1], r[2], r[3]); })
    .catch(function (e) { console.error(e); });

  var SHORT = {
    "753": ["Ubezpieczenia społeczne", "Ubezp. społeczne"], "758": ["Różne rozliczenia", "Różne rozliczenia"],
    "752": ["Obrona narodowa", "Obrona"], "757": ["Obsługa długu", "Obsługa długu"], "855": ["Rodzina", "Rodzina"],
    "851": ["Ochrona zdrowia", "Zdrowie"], "730": ["Szkolnictwo wyższe i nauka", "Nauka i uczelnie"],
    "754": ["Bezpieczeństwo publiczne", "Bezpieczeństwo"], "750": ["Administracja publiczna", "Administracja"],
    "755": ["Wymiar sprawiedliwości", "Sprawiedliwość"], "600": ["Transport i łączność", "Transport"]
  };
  var DV_SHORT = { "751": "Urzędy naczelne i sądownictwo", "700": "Gospodarka mieszkaniowa", "010": "Rolnictwo", "100": "Górnictwo", "801": "Oświata i wychowanie", "921": "Kultura", "150": "Przetwórstwo przemysłowe", "900": "Gospodarka komunalna", "852": "Pomoc społeczna", "853": "Polityka społeczna", "500": "Handel" };
  var DZ_COLOR = { "753": C.blue, "855": C.blue, "752": C.amber, "754": C.amber, "757": C.red, "851": C.rose, "730": C.green, "801": C.green, "750": C.violet, "751": C.violet, "755": C.violet, "758": C.sand, "600": "#9C8F78" };

  /* ===================================================================== */
  function init(D, T, CTX, B26) {
    var U = D.ustawa, cur = D.wersje.filter(function (v) { return v.wydatki != null; }).pop();
    D._cur = cur; D._b26 = B26;
    var hist = T.lata.map(function (d) {
      var ob = d.typy.filter(function (t) { return /Obsługa długu/.test(t.name); })[0];
      return { rok: d.rok, obsluga: ob ? ob.plan / 1e6 : null };
    });
    hist.push({ rok: 2027, obsluga: D.dlug.obsluga_2027, projekt: true });

    splitHeads();
    buildTopbar(D);
    buildProlog(D, cur);
    var stage = dotStage($("dots"), D);
    setupAct(stage);
    buildDiverge(U);
    buildLedgers(U, B26);
    buildSpenders(U);
    var debt = chartDebt($("chart-debt"), U, hist, D);
    var orbit = chartOrbit($("chart-orbit"), U);
    setupScrolly({ debt: debt, orbit: orbit });
    buildTiles(U);
    buildPrio(U, D);
    buildReceipt(U, D);
    buildCalc(D);
    buildClock(D);
    buildJourney(D);
    buildVersions(D);
    buildLog(D);
    buildTape(U, D, B26);
    buildMacro(D);
    buildSources(D);
    $("foot-upd").textContent = "Ostatnia aktualizacja: " + fmtDate(D.meta.aktualizacja) + " · druk nr " + (U.druk || "—");
    setupReveal();
    setupStepper();

    var lastW = window.innerWidth, rt;
    window.addEventListener("resize", function () {
      if (Math.abs(window.innerWidth - lastW) < 2 && window.innerWidth > 900) return;
      lastW = window.innerWidth; clearTimeout(rt);
      rt = setTimeout(function () {
        stage.resize();
        [debt, orbit].forEach(function (c) { c.render(); c.step(c.cur || 0, true); });
        buildTiles(U);
      }, 160);
    });
  }

  /* ---------------- word-split headings ---------------- */
  function splitHeads() {
    document.querySelectorAll("[data-split]").forEach(function (h) {
      var i = 0, out = [];
      Array.prototype.slice.call(h.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach(function (t) {
            if (!t) return;
            if (/^\s+$/.test(t)) out.push(document.createTextNode(" "));
            else { var s = document.createElement("span"); s.className = "w"; s.style.setProperty("--i", i++); s.textContent = t; out.push(s); }
          });
        } else {
          var w = document.createElement("span"); w.className = "w"; w.style.setProperty("--i", i++); w.appendChild(n.cloneNode(true)); out.push(w);
        }
      });
      h.textContent = ""; out.forEach(function (n) { h.appendChild(n); });
      h.setAttribute("aria-label", h.textContent);
    });
  }

  /* ---------------- top bar ---------------- */
  var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  function buildTopbar(D) {
    var nav = $("tb-chapters"), label = $("tb-label");
    var secs = Array.prototype.slice.call(document.querySelectorAll("[data-chapter]"));
    secs.forEach(function (s, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "tb-ch";
      b.innerHTML = ROMAN[i] + '<span class="tb-tip">' + ROMAN[i] + " · " + esc(s.dataset.label) + "</span>";
      b.setAttribute("aria-label", "Rozdział " + ROMAN[i] + ": " + s.dataset.label);
      b.addEventListener("click", function () { goToEl(s); });
      nav.appendChild(b);
    });
    var K = D.kalendarz, ci = -1;
    K.forEach(function (k, i) { if (k.status === "current") ci = i; });
    if (ci < 0) K.forEach(function (k, i) { if (k.status === "done") ci = i; });
    var stage = K[ci] || { nazwa: D.meta.etap_krotko };
    $("tb-status").textContent = stage.nazwa;
    $("tb-status-k").textContent = "Etap " + (ci + 1) + " z " + K.length;
    $("tb-status-bar").innerHTML = K.map(function (k) { return '<i class="' + k.status + '"></i>'; }).join("");
    $("tb-status-link").setAttribute("aria-label", "Etap " + (ci + 1) + " z " + K.length + ": " + stage.nazwa + ". Przejdź do drogi przez parlament");
    var btns = nav.querySelectorAll(".tb-ch"), bar = $("tb-progress"), ticking = false, last = -2;
    function onScroll() {
      ticking = false;
      var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max > 0 ? h.scrollTop / max * 100 : 0) + "%";
      var mid = window.innerHeight * 0.5, active = -1;
      secs.forEach(function (s, i) { if (s.getBoundingClientRect().top < mid) active = i; });
      if (active === last) return; last = active;
      btns.forEach(function (b, i) {
        b.classList.toggle("is-active", i === active); b.classList.toggle("is-done", i < active);
        if (i === active) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
      });
      label.innerHTML = active >= 0 ? "<b>" + ROMAN[active] + "</b> · " + esc(secs[active].dataset.label) : "";
    }
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();
  }

  /* ---------------- prolog ---------------- */
  function buildProlog(D, cur) {
    $("trio").innerHTML = [
      ["Dochody", cur.dochody, C.blue, "Art. 1 ust. 1"],
      ["Wydatki", cur.wydatki, C.gold, "Art. 1 ust. 2"],
      ["Deficyt", cur.deficyt, C.red, "Art. 1 ust. 5"]
    ].map(function (t) {
      return '<div><div class="trio-k"><i style="background:' + t[2] + '"></i>' + t[0] + '</div><div class="trio-v">' + nb(fmt(t[1], 1)) + '<small>mld zł</small></div><div class="trio-c">' + t[3] + "</div></div>";
    }).join("");
    var pro = $("prolog"), doc = $("doc");
    requestAnimationFrame(function () { pro.classList.add("is-in"); });
    setTimeout(function () { doc.classList.add("is-marked"); }, REDUCED ? 0 : 1100);
    if (REDUCED) { doc.style.setProperty("--p", 1); return; }
    var tick = false;
    function upd() {
      tick = false;
      var p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.7)));
      doc.style.setProperty("--p", (0.08 + p * 0.92).toFixed(3));
    }
    window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }

  /* =====================================================================
     DOT STAGE — 978 particles, 1 dot = 1 mld zł, travelling through chapters I–IV
     ===================================================================== */
  function dotStage(cv, D) {
    var U = D.ustawa, cur = D._cur;
    var N = Math.round(cur.wydatki), nRev = Math.round(cur.dochody);
    var ctx = cv.getContext("2d"), W = 0, H = 0, dpr = 1, mobile = false;
    var P = [];
    for (var i = 0; i < N; i++) P.push({ x: 0, y: 0, r: 1.5, c: [232, 176, 75], a: 0, fx: 0, fy: 0, fr: 0, fc: [0, 0, 0], fa: 0, tx: 0, ty: 0, tr: 0, tc: [0, 0, 0], ta: 0, d: 0, ph: Math.random() * 6.28, sp: 0.3 + Math.random() * 0.7, sx: Math.random(), sy: Math.random() });
    var state = "cloud", hl = null, layout = null, t0 = 0, animating = false, labelsAlpha = 0, hover = null, raf = 0, visible = false;
    var T_MOVE = 1150;

    // --- group definitions ---
    var rev = U.dochody_pelne;
    var revG = [
      { id: "vat", name: "VAT", v: rev[0].v, color: C.blue, desc: "Podatek od towarów i usług" },
      { id: "akcyza", name: "Akcyza", v: rev[1].v, color: C.amber, desc: "Paliwa, alkohol, wyroby tytoniowe, energia" },
      { id: "cit", name: "CIT", v: rev[2].v, color: C.green, desc: "Podatek od zysków firm" },
      { id: "pit", name: "PIT", v: rev[3].v, color: C.violet, desc: "Część podatku od dochodów osób" },
      { id: "inne", name: "Pozostałe dochody", sname: "Pozostałe", v: d3.sum(rev.slice(4), function (d) { return d.v; }), color: C.gray, desc: "Inne podatki, dywidendy, cło, opłaty, środki z UE" }
    ];
    var rc = largestRemainder(revG.map(function (g) { return g.v; }), nRev);
    revG.forEach(function (g, i) { g.n = rc[i]; });
    revG.push({ id: "pozyczone", name: "Pożyczone (deficyt)", sname: "Pożyczone", v: cur.deficyt, color: C.red, n: N - nRev, desc: "Art. 1 ust. 5" });

    var dz = U.dzialy.slice().sort(function (a, b) { return b.v - a.v; });
    var top = dz.slice(0, 11), rest = dz.slice(11);
    var dzG = top.map(function (d) { return { id: d.code, name: SHORT[d.code] ? SHORT[d.code][0] : d.name, sname: SHORT[d.code] ? SHORT[d.code][1] : d.name, v: d.v, color: DZ_COLOR[d.code] || C.gray, desc: "Dział " + d.code + " · " + d.name }; });
    dzG.push({ id: "rest", name: "Pozostałe " + rest.length + " działów", sname: "Pozostałe (" + rest.length + ")", v: d3.sum(rest, function (d) { return d.v; }), color: C.dim, desc: rest.slice(0, 4).map(function (d) { return d.name; }).join(", ") + "…" });
    var dc = largestRemainder(dzG.map(function (g) { return g.v; }), N);
    dzG.forEach(function (g, i) { g.n = dc[i]; });

    var TYPE_COLOR = { tb: C.violet, wb: C.sand, sw: C.blue, wm: C.green, tm: C.mint };
    var tyG = U.rodzaje.map(function (r) { return { id: r.id, name: r.name, v: r.v, color: TYPE_COLOR[r.id], desc: r.opis }; });
    var tc = largestRemainder(tyG.map(function (g) { return g.v; }), N);
    tyG.forEach(function (g, i) { g.n = tc[i]; });

    var splitG = [
      { id: "dochody", name: "Dochody", v: cur.dochody, color: C.blue, n: nRev, desc: "Art. 1 ust. 1 · załącznik nr 1" },
      { id: "deficyt", name: "Deficyt", v: cur.deficyt, color: C.red, n: N - nRev, desc: "Art. 1 ust. 5" }
    ];

    function region() {
      if (mobile) return { x0: 16, x1: W - 16, y0: 104, y1: H * 0.54 };
      var x0 = Math.max(W * 0.43, Math.min(W * 0.5, (W - 1200) / 2 + 480));
      return { x0: x0, x1: W - Math.max(32, W * 0.04), y0: H * 0.15, y1: H * 0.88 };
    }

    // --- layouts: return {slots, labels, rects} ---
    function layCloud() {
      var slots = P.map(function (p) {
        var cx = mobile ? W * 0.5 : W * 0.62, cy = H * 0.5;
        var ang = p.sx * Math.PI * 2, rad = Math.pow(p.sy, 0.6) * Math.max(W, H) * 0.62;
        return { x: cx + Math.cos(ang) * rad * 1.15, y: cy + Math.sin(ang) * rad * 0.62, r: 1.3 + p.sp * 0.8, c: hexRgb(C.gold), a: 0.12 + p.sp * 0.28 };
      });
      return { slots: slots, labels: [], rects: [] };
    }
    function layGrid() {
      var R = region(), w = R.x1 - R.x0, h = R.y1 - R.y0 - 30;
      var cols = Math.ceil(Math.sqrt(N * w / h)), rows = Math.ceil(N / cols), cell = Math.min(w / cols, h / rows);
      var ox = R.x0 + (w - cols * cell) / 2, oy = R.y0 + 30 + (h - rows * cell) / 2, col = hexRgb("#D9CBB0");
      var slots = P.map(function (p, i) { return { x: ox + (i % cols) * cell + cell / 2, y: oy + Math.floor(i / cols) * cell + cell / 2, r: Math.max(1.2, cell * 0.36), c: col, a: 0.9 }; });
      return { slots: slots, labels: [{ x: ox, y: oy - 12, name: "Wydatki budżetu państwa", v: cur.wydatki, gid: "all" }], rects: [{ x: ox, y: oy, w: cols * cell, h: rows * cell, g: { name: "Wydatki", v: cur.wydatki, desc: "Art. 1 ust. 2" } }] };
    }
    function layColumns(groups) {
      var R = region(), labelH = mobile ? 44 : 34, gap = mobile ? 14 : 26, w = R.x1 - R.x0, h = R.y1 - R.y0 - labelH, best = null;
      for (var rows = 6; rows < 80; rows++) {
        var colsTot = d3.sum(groups, function (g) { return Math.ceil(g.n / rows); });
        var cell = Math.min(h / rows, (w - gap * (groups.length - 1)) / colsTot);
        if (!best || cell > best.cell) best = { rows: rows, cell: cell };
      }
      var cell = best.cell, rows = best.rows, totW = d3.sum(groups, function (g) { return Math.ceil(g.n / rows); }) * cell + gap * (groups.length - 1);
      var x = R.x0 + (w - totW) / 2, oy = R.y0 + labelH + (h - rows * cell) / 2, slots = [], labels = [], rects = [];
      groups.forEach(function (g) {
        var cols = Math.ceil(g.n / rows), col = hexRgb(g.color);
        for (var k = 0; k < g.n; k++) slots.push({ x: x + Math.floor(k / rows) * cell + cell / 2, y: oy + (k % rows) * cell + cell / 2, r: Math.max(1.2, cell * 0.36), c: col, a: 0.95, gid: g.id });
        labels.push({ x: x, y: oy - (mobile ? 26 : 12), name: g.name, v: g.v, gid: g.id });
        rects.push({ x: x, y: oy, w: cols * cell, h: rows * cell, g: g });
        x += cols * cell + gap;
      });
      return { slots: slots, labels: labels, rects: rects };
    }
    function layBars(groups) {
      var R = region(), w = R.x1 - R.x0, h = R.y1 - R.y0, G = groups.length;
      var labelLeft = mobile, labelW = labelLeft ? 112 : 0, labelH = labelLeft ? 0 : 19, gap = labelLeft ? 5 : 9;
      var maxN = d3.max(groups, function (g) { return g.n; }), best = null;
      for (var rows = 1; rows <= 12; rows++) {
        var cellH = (h - G * (labelH + gap)) / (G * rows), cellW = (w - labelW - (labelLeft ? 46 : 60)) / Math.ceil(maxN / rows);
        var cell = Math.min(cellH, cellW);
        if (!best || cell > best.cell) best = { rows: rows, cell: cell };
      }
      var cell = Math.min(best.cell, mobile ? 9 : 14), rows = best.rows;
      var band = labelH + rows * cell + gap, total = band * G, y = R.y0 + (h - total) / 2, slots = [], labels = [], rects = [];
      groups.forEach(function (g) {
        var col = hexRgb(g.color), x0 = R.x0 + labelW, by = y + labelH, cols = Math.ceil(g.n / rows);
        for (var k = 0; k < g.n; k++) slots.push({ x: x0 + Math.floor(k / rows) * cell + cell / 2, y: by + (k % rows) * cell + cell / 2, r: Math.max(1.05, cell * 0.38), c: col, a: 0.95, gid: g.id });
        if (labelLeft) labels.push({ x: R.x0, y: by + rows * cell / 2 + 4, name: g.sname || g.name, v: g.v, gid: g.id, left: true, w: labelW - 8, vx: x0 + cols * cell + 6 });
        else labels.push({ x: x0, y: by - 6, name: g.name, v: g.v, gid: g.id });
        rects.push({ x: R.x0, y: y, w: Math.max(labelW + cols * cell, 200), h: band, g: g });
        y += band;
      });
      return { slots: slots, labels: labels, rects: rects };
    }
    function build(name) {
      if (name === "cloud") return layCloud();
      if (name === "grid") return layGrid();
      if (name === "split") return layColumns(splitG);
      if (name === "revenue") return layBars(revG);
      if (name === "dzialy") return layBars(dzG);
      if (name === "types") return layBars(tyG);
      return layCloud();
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight; mobile = W <= 900;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout = build(state);
      P.forEach(function (p, i) { var s = layout.slots[i]; p.x = p.tx = s.x; p.y = p.ty = s.y; p.r = p.tr = s.r; p.c = p.tc = s.c; p.a = p.ta = slotAlpha(s); });
      labelsAlpha = 1; draw(performance.now());
    }
    function slotAlpha(s) { return hl && s.gid && hl.indexOf(s.gid) < 0 ? s.a * 0.26 : s.a; }

    function setState(name, hlStr) {
      var nhl = hlStr ? hlStr.split(",") : null;
      if (name === state && String(nhl) === String(hl)) return;
      var moving = name !== state;
      state = name; hl = nhl;
      layout = build(state);
      var now = performance.now();
      P.forEach(function (p, i) {
        var s = layout.slots[i];
        p.fx = p.x; p.fy = p.y; p.fr = p.r; p.fc = p.c.slice(); p.fa = p.a;
        p.tx = s.x; p.ty = s.y; p.tr = s.r; p.tc = s.c; p.ta = slotAlpha(s);
        p.d = moving ? (REDUCED ? 0 : (i / N) * 320 + p.sx * 180) : 0;
      });
      t0 = now; animating = true; labelsAlpha = moving ? 0 : labelsAlpha;
      loop();
    }

    var ease = d3.easeCubicInOut;
    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      var allDone = true, dt = REDUCED ? 1 : 0;
      for (var i = 0; i < N; i++) {
        var p = P[i];
        if (animating) {
          var k = REDUCED ? 1 : Math.min(1, Math.max(0, (now - t0 - p.d) / T_MOVE));
          if (k < 1) allDone = false;
          var e = ease(k);
          p.x = p.fx + (p.tx - p.fx) * e; p.y = p.fy + (p.ty - p.fy) * e; p.r = p.fr + (p.tr - p.fr) * e; p.a = p.fa + (p.ta - p.fa) * e;
          p.c = [p.fc[0] + (p.tc[0] - p.fc[0]) * e, p.fc[1] + (p.tc[1] - p.fc[1]) * e, p.fc[2] + (p.tc[2] - p.fc[2]) * e];
        }
        var x = p.x, y = p.y;
        if (state === "cloud" && !REDUCED) { x += Math.sin(now / 1600 * p.sp + p.ph) * 6; y += Math.cos(now / 2000 * p.sp + p.ph) * 4; }
        var a = p.a;
        if (hover && layout.slots[i] && layout.slots[i].gid === hover && !animating) a = Math.min(1, a + 0.25);
        ctx.fillStyle = "rgba(" + (p.c[0] | 0) + "," + (p.c[1] | 0) + "," + (p.c[2] | 0) + "," + a.toFixed(3) + ")";
        ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.2832); ctx.fill();
      }
      if (animating && allDone) animating = false;
      // labels fade in after particles land
      if (!animating || now - t0 > T_MOVE * 0.75) labelsAlpha = Math.min(1, labelsAlpha + (REDUCED ? 1 : 0.06));
      drawLabels();
      void dt;
    }
    function drawLabels() {
      if (!layout || !layout.labels.length || labelsAlpha <= 0) return;
      layout.labels.forEach(function (l) {
        var dim = hl && hl.indexOf(l.gid) < 0;
        var al = labelsAlpha * (dim ? 0.32 : 1);
        ctx.textBaseline = "alphabetic";
        if (l.left) {
          ctx.font = "600 11.5px Inter, system-ui, sans-serif"; ctx.textAlign = "left";
          ctx.fillStyle = "rgba(244,239,230," + al + ")";
          var name = l.name; while (ctx.measureText(name).width > l.w && name.length > 4) name = name.slice(0, -2) + "…";
          ctx.fillText(name, l.x, l.y);
          ctx.font = "700 11px Inter, system-ui, sans-serif"; ctx.fillStyle = "rgba(191,182,168," + al + ")";
          ctx.fillText(fmt(l.v, 1), l.vx, l.y);
          return;
        }
        ctx.textAlign = "left";
        var fs = mobile ? 11.5 : 13;
        ctx.font = "600 " + fs + "px Inter, system-ui, sans-serif"; ctx.fillStyle = "rgba(191,182,168," + al + ")";
        ctx.fillText(l.name, l.x, l.y);
        var w = ctx.measureText(l.name).width;
        ctx.font = "700 " + fs + "px Inter, system-ui, sans-serif"; ctx.fillStyle = "rgba(244,239,230," + al + ")";
        if (mobile) ctx.fillText(nb(fmt(l.v, 1)), l.x, l.y + 15);
        else ctx.fillText(nb(fmt(l.v, 1)) + " mld zł", l.x + w + 8, l.y);
      });
    }
    function loop() {
      cancelAnimationFrame(raf);
      (function f(now) {
        draw(now);
        if (visible && (animating || state === "cloud" || labelsAlpha < 1) && !REDUCED) raf = requestAnimationFrame(f);
      })(performance.now());
    }

    // hover
    cv.addEventListener("pointermove", function (e) {
      if (!layout) return;
      var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, hit = null;
      layout.rects.forEach(function (rc) { if (mx >= rc.x && mx <= rc.x + rc.w && my >= rc.y && my <= rc.y + rc.h) hit = rc; });
      var id = hit && hit.g.id || null;
      if (hit) showTT("<b>" + esc(hit.g.name) + "</b><br><span class='tt-v'>" + mld(hit.g.v) + "</span><br><span class='tt-s'>" + esc(hit.g.desc || "") + "</span>", e.clientX, e.clientY);
      else hideTT();
      if (id !== hover) { hover = id; draw(performance.now()); }
      cv.style.cursor = hit ? "crosshair" : "default";
    });
    cv.addEventListener("pointerleave", function () { hover = null; hideTT(); draw(performance.now()); });
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) loop(); }).observe(cv.parentElement);

    resize();
    return { setState: setState, resize: resize };
  }

  function setupAct(stage) {
    var steps = document.querySelectorAll(".astep");
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) {
        if (!e.isIntersecting) return;
        steps.forEach(function (s) { s.classList.toggle("is-active", s === e.target); });
        stage.setState(e.target.dataset.state, e.target.dataset.hl || "");
      });
    }, { rootMargin: "-50% 0px -50% 0px", threshold: 0 });
    steps.forEach(function (s) { io.observe(s); });
  }

  /* =====================================================================
     V. WINNERS / LOSERS, LEDGERS, SPENDERS
     ===================================================================== */
  function buildDiverge(U) {
    var rows = U.dzialy.map(function (d) { return { code: d.code, name: d.name, v: d.v, v0: d.v2026, d: d.v - d.v2026, p: d.v2026 ? (d.v - d.v2026) / d.v2026 * 100 : 0 }; })
      .sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); }).slice(0, 16).sort(function (a, b) { return b.d - a.d; });
    var host = $("diverge"), mode = "abs";
    function render(animate) {
      var key = mode === "abs" ? "d" : "p", mx = d3.max(rows, function (r) { return Math.abs(r[key]); });
      host.innerHTML = rows.map(function (r) {
        var val = r[key], w = Math.abs(val) / mx * 50, pos = val >= 0;
        return '<div class="dv" title="' + esc(r.name) + '"><div class="dv-name">' + esc(SHORT[r.code] ? SHORT[r.code][0] : DV_SHORT[r.code] || r.name) + "<small>dział " + r.code + " · " + nb(fmt(r.v0, 1)) + " → " + nb(fmt(r.v, 1)) + "</small></div>" +
          '<div class="dv-track"><span class="dv-bar ' + (pos ? "pos" : "neg") + '" data-w="' + w.toFixed(2) + '%"></span></div>' +
          '<div class="dv-val ' + (pos ? "pos" : "neg") + '">' + (mode === "abs" ? signed(r.d, 1) + "<small>mld zł</small>" : signed(r.p, 1, "%")) + "</div></div>";
      }).join("");
      var bars = host.querySelectorAll(".dv-bar");
      function grow() { bars.forEach(function (b) { b.style.width = b.dataset.w; }); }
      if (animate) onceVisible(host, grow, 0.15); else requestAnimationFrame(grow);
    }
    render(true);
    [["dv-abs", "abs"], ["dv-pct", "pct"]].forEach(function (b) {
      $(b[0]).addEventListener("click", function () {
        mode = b[1]; $("dv-abs").setAttribute("aria-pressed", mode === "abs"); $("dv-pct").setAttribute("aria-pressed", mode === "pct"); render(false);
      });
    });
  }

  function buildLedgers(U, B26) {
    var p26 = {}; B26.dochody.forEach(function (d) { p26[d.name] = d.plan / 1e6; });
    var MAP26 = { 0: "VAT", 1: "Akcyza", 2: "CIT", 3: "PIT" };
    var maxIn = d3.max(U.dochody_pelne, function (d) { return d.v; });
    function delta(v, v0) {
      if (!v0) return "<small class='flat'>—</small>";
      var p = (v - v0) / v0 * 100, cls = Math.abs(p) < 0.5 ? "flat" : p > 0 ? "up" : "down";
      return "<small class='" + cls + "'>" + signed(p, 1, "%") + "</small>";
    }
    $("ledger-in").innerHTML = '<div class="ledger-h"><b>Dochody</b><span>Załącznik nr 1<br>mld zł · zmiana wobec 2026</span></div>' +
      U.dochody_pelne.map(function (d, i) {
        return '<div class="lrow"><span class="lrow-n">' + esc(d.name) + '</span><span class="lrow-v">' + nb(fmt(d.v, 1)) + delta(d.v, MAP26[i] && p26[MAP26[i]]) + '</span><span class="lrow-bar"><span style="--w:' + (d.v / maxIn * 100).toFixed(1) + '%"></span></span></div>';
      }).join("") + '<div class="ledger-foot"><span>Razem</span><span>' + nb(fmt(U.art.dochody, 1)) + "</span></div>";

    var dz = U.dzialy.slice().sort(function (a, b) { return b.v - a.v; }), maxOut = dz[0].v, open = false, host = $("ledger-out");
    function render() {
      var list = open ? dz : dz.slice(0, 12);
      host.innerHTML = '<div class="ledger-h"><b>Wydatki</b><span>Załącznik nr 2 · ' + dz.length + ' działów<br>mld zł · zmiana wobec 2026</span></div>' +
        list.map(function (d) {
          return '<div class="lrow"><span class="lrow-n"><span class="code">' + d.code + "</span>" + esc(d.name) + '</span><span class="lrow-v">' + nb(fmt(d.v, d.v < 1 ? 2 : 1)) + delta(d.v, d.v2026) + '</span><span class="lrow-bar"><span style="--w:' + Math.max(0.4, d.v / maxOut * 100).toFixed(1) + '%"></span></span></div>';
        }).join("") +
        (open ? "" : '<button type="button" class="ledger-more" id="ledger-more"><i class="ti ti-chevron-down" aria-hidden="true"></i> Pokaż wszystkie ' + dz.length + " działy</button>") +
        '<div class="ledger-foot"><span>Razem</span><span>' + nb(fmt(U.art.wydatki, 1)) + "</span></div>";
      var more = $("ledger-more");
      if (more) more.addEventListener("click", function () { open = true; render(); host.classList.add("is-in"); });
    }
    render();
  }

  function buildSpenders(U) {
    var max = d3.max(U.dysponenci, function (d) { return d.v; });
    var SUBC = ["c-debt", "c-jst", "c-ue", "c-fin", "c-rest"];
    $("sp-legend").innerHTML = [["Odsetki od długu", C.red], ["Subwencje dla samorządów", "#7DB6F2"], ["Składka do budżetu UE", "#A898F2"], ["Pozostałe wydatki", "#CFC4AF"]]
      .map(function (l) { return '<span><i style="background:' + l[1] + '"></i>' + l[0] + "</span>"; }).join("");
    var host = $("spenders");
    host.innerHTML = U.dysponenci.map(function (d) {
      var segs = d.sub ? d.sub.map(function (s, i) { return '<span class="sp-seg ' + SUBC[i] + '" data-w="' + (s[1] / max * 100).toFixed(2) + '%" title="' + esc(s[0]) + ": " + mld(s[1]) + '">' + (s[1] / max > 0.12 ? esc(s[0].split(" ")[0]) + " " + nb(fmt(s[1], 0)) : "") + "</span>"; }).join("")
        : '<span class="sp-seg c0" data-w="' + (d.v / max * 100).toFixed(2) + '%"></span>';
      return '<div class="sp' + (d.sub ? " mf" : "") + '"><span class="sp-name">' + esc(d.name) + '</span><span class="sp-track">' + segs + '</span><span class="sp-val">' + nb(fmt(d.v, 1)) + "<small>mld zł</small></span></div>";
    }).join("");
    onceVisible(host, function () { host.querySelectorAll(".sp-seg").forEach(function (s, i) { setTimeout(function () { s.style.width = s.dataset.w; }, dur(i * 40)); }); }, 0.15);
  }

  /* =====================================================================
     SVG helpers + scrolly controller
     ===================================================================== */
  function svgIn(el) {
    el.innerHTML = "";
    var w = el.clientWidth, h = el.clientHeight;
    return { svg: d3.select(el).append("svg").attr("viewBox", "0 0 " + w + " " + h), w: w, h: h };
  }
  function barPath(x0, base, w, h) {
    var r = Math.min(4, w / 2, Math.abs(h));
    if (h <= 0) return "M" + x0 + "," + base + "h" + w + "v0h" + (-w) + "Z";
    return "M" + x0 + "," + base + "V" + (base - h + r) + "Q" + x0 + "," + (base - h) + " " + (x0 + r) + "," + (base - h) + "H" + (x0 + w - r) + "Q" + (x0 + w) + "," + (base - h) + " " + (x0 + w) + "," + (base - h + r) + "V" + base + "Z";
  }
  function setupScrolly(charts) {
    document.querySelectorAll(".scrolly").forEach(function (sc) {
      var chart = charts[sc.dataset.chart]; if (!chart) return;
      var steps = sc.querySelectorAll(".sstep");
      chart.step(0, true);
      var io = new IntersectionObserver(function (en) {
        en.forEach(function (e) {
          if (!e.isIntersecting) return;
          var i = +e.target.dataset.step;
          steps.forEach(function (s) { s.classList.toggle("is-active", s === e.target); });
          if (chart.cur !== i || !chart.started) { chart.started = true; chart.step(i); }
        });
      }, { rootMargin: "-48% 0px -48% 0px", threshold: 0 });
      steps.forEach(function (s) { io.observe(s); });
    });
  }

  /* =====================================================================
     VI. DEBT — waterfall (art. 3) → interest history → debt/GDP
     ===================================================================== */
  function chartDebt(el, U, hist, D) {
    var api = { cur: 0 }, s, gW, gI, gL, wBars, wLbl, iBars, iLbl, clipL, ptsL, lblL, xL;
    var A = U.art;
    var WF = [
      { k: "Deficyt budżetu państwa", short: "Deficyt", v: A.deficyt, base: 0, color: C.red, step: 0, cite: "art. 1 ust. 5" },
      { k: "Deficyt budżetu środków europejskich", short: "Środki UE", v: -A.bse_wynik, base: A.deficyt, color: "#F28B7F", step: 1, cite: "art. 2 ust. 3" },
      { k: "Saldo przychodów i rozchodów", short: "Saldo", v: A.saldo, base: 0, color: C.gold, total: true, step: 1, cite: "art. 3 ust. 2" },
      { k: "Spłata starych długów i inne rozchody", short: "Rozchody", v: A.rozchody, base: A.saldo, color: "#8A8377", step: 2, cite: "art. 3 ust. 1" },
      { k: "Przychody, czyli nowe pożyczki brutto", short: "Przychody", v: A.przychody, base: 0, color: C.gold, total: true, step: 2, cite: "art. 3 ust. 1" }
    ];
    var ob = hist.filter(function (d) { return d.obsluga != null; });
    var debt = D.dlug.pkb;

    api.render = function () {
      s = svgIn(el);
      var mob = s.w < 520, M = { t: 34, r: 10, b: 54, l: mob ? 34 : 44 };
      // --- waterfall
      gW = s.svg.append("g");
      var x = d3.scaleBand().domain(WF.map(function (d, i) { return i; })).range([M.l, s.w - M.r]).padding(0.32);
      var y = d3.scaleLinear().domain([0, 1200]).range([s.h - M.b, M.t]);
      var gr = gW.append("g").attr("class", "grid");
      [300, 600, 900, 1200].forEach(function (v) { gr.append("line").attr("x1", M.l).attr("x2", s.w - M.r).attr("y1", y(v)).attr("y2", y(v)); });
      gW.append("g").attr("class", "ax").attr("transform", "translate(" + (M.l - 6) + ",0)").call(d3.axisLeft(y).tickValues([0, 300, 600, 900, 1200]).tickSize(0).tickFormat(function (d) { return fmt(d); })).call(function (a) { a.select(".domain").remove(); });
      var bw = Math.min(64, x.bandwidth());
      wBars = gW.append("g").selectAll("rect").data(WF).enter().append("rect")
        .attr("x", function (d, i) { return x(i) + (x.bandwidth() - bw) / 2; }).attr("width", bw).attr("rx", 4)
        .attr("y", function (d) { return y(d.base + d.v); }).attr("height", function (d) { return y(d.base) - y(d.base + d.v); })
        .attr("fill", function (d) { return d.color; }).attr("fill-opacity", function (d) { return d.total ? 0.95 : 0.85; }).attr("opacity", 0);
      // connectors
      wLbl = gW.append("g").selectAll("g").data(WF).enter().append("g").attr("opacity", 0);
      wLbl.append("text").attr("class", "lbl").attr("text-anchor", "middle")
        .attr("x", function (d, i) { return x(i) + x.bandwidth() / 2; }).attr("y", function (d) { return y(d.base + d.v) - 9; })
        .style("font-size", mob ? "11.5px" : "14px").text(function (d) { return fmt(d.v, 1); });
      wLbl.append("text").attr("class", "lbl-mono").attr("text-anchor", "middle")
        .attr("x", function (d, i) { return x(i) + x.bandwidth() / 2; }).attr("y", s.h - M.b + 18)
        .text(function (d) { return d.short; });
      wLbl.append("text").attr("class", "lbl-mono").attr("text-anchor", "middle").style("opacity", .7)
        .attr("x", function (d, i) { return x(i) + x.bandwidth() / 2; }).attr("y", s.h - M.b + 32)
        .text(function (d) { return mob ? "" : d.cite; });
      gW.selectAll("rect").on("pointermove", function (e, d) { showTT("<b>" + esc(d.k) + "</b><br><span class='tt-v'>" + mld(d.v) + "</span><br><span class='tt-s'>" + d.cite + "</span>", e.clientX, e.clientY); }).on("pointerleave", hideTT);

      // --- interest history
      gI = s.svg.append("g").attr("opacity", 0).style("pointer-events", "none");
      var xi = d3.scaleBand().domain(ob.map(function (d) { return d.rok; })).range([M.l, s.w - M.r]).padding(0.26);
      var yi = d3.scaleLinear().domain([0, 120]).range([s.h - M.b, M.t]);
      var gi = gI.append("g").attr("class", "grid");
      [30, 60, 90, 120].forEach(function (v) { gi.append("line").attr("x1", M.l).attr("x2", s.w - M.r).attr("y1", yi(v)).attr("y2", yi(v)); });
      gI.append("g").attr("class", "ax").attr("transform", "translate(" + (M.l - 6) + ",0)").call(d3.axisLeft(yi).tickValues([0, 30, 60, 90, 120]).tickSize(0)).call(function (a) { a.select(".domain").remove(); });
      gI.append("g").attr("class", "ax").attr("transform", "translate(0," + (s.h - M.b + 8) + ")").call(d3.axisBottom(xi).tickSize(0).tickFormat(function (d) { return mob ? (d % 4 === 3 ? d : "") : "’" + String(d).slice(2); })).call(function (a) { a.select(".domain").remove(); });
      var ibw = Math.min(22, xi.bandwidth());
      iBars = gI.append("g").selectAll("path").data(ob).enter().append("path")
        .attr("d", function (d) { return barPath(xi(d.rok) + (xi.bandwidth() - ibw) / 2, yi(0), ibw, yi(0) - yi(d.obsluga)); })
        .attr("fill", function (d) { return d.rok === 2027 ? C.red : d.rok === 2022 ? C.gold : C.dim; });
      iLbl = gI.append("g").selectAll("text").data(ob.filter(function (d) { return d.rok === 2022 || d.rok === 2027; })).enter().append("text")
        .attr("class", "lbl").attr("text-anchor", "middle").attr("x", function (d) { return xi(d.rok) + xi.bandwidth() / 2; }).attr("y", function (d) { return yi(d.obsluga) - 9; })
        .text(function (d) { return fmt(d.obsluga, d.obsluga >= 100 ? 0 : 1); });

      // --- debt / GDP
      gL = s.svg.append("g").attr("opacity", 0).style("pointer-events", "none");
      var ML = { t: 40, r: mob ? 40 : 70, b: 40, l: mob ? 36 : 44 };
      xL = d3.scaleLinear().domain([2026, 2029]).range([ML.l + 20, s.w - ML.r]);
      var yL = d3.scaleLinear().domain([50, 62]).range([s.h - ML.b, ML.t]);
      gL.append("rect").attr("x", ML.l).attr("width", s.w - ML.r + 30 - ML.l).attr("y", yL(62)).attr("height", yL(60) - yL(62)).attr("fill", "rgba(239,90,76,.10)");
      var gl = gL.append("g").attr("class", "grid");
      [50, 52, 54, 56, 58, 60, 62].forEach(function (v) { gl.append("line").attr("x1", ML.l).attr("x2", s.w - ML.r + 30).attr("y1", yL(v)).attr("y2", yL(v)); });
      gL.append("g").attr("class", "ax").attr("transform", "translate(" + (ML.l - 6) + ",0)").call(d3.axisLeft(yL).tickValues([50, 54, 58, 62]).tickSize(0).tickFormat(function (d) { return d + "%"; })).call(function (a) { a.select(".domain").remove(); });
      gL.append("g").attr("class", "ax").attr("transform", "translate(0," + (s.h - ML.b + 10) + ")").call(d3.axisBottom(xL).tickValues([2026, 2027, 2028, 2029]).tickSize(0).tickFormat(d3.format("d"))).call(function (a) { a.select(".domain").remove(); });
      [[D.dlug.prog_ostroznosciowy, C.amber, "próg ostrożnościowy"], [D.dlug.prog_konstytucyjny, C.red, "limit z Konstytucji"]].forEach(function (t) {
        gL.append("line").attr("x1", ML.l).attr("x2", s.w - ML.r + 30).attr("y1", yL(t[0])).attr("y2", yL(t[0])).attr("stroke", t[1]).attr("stroke-width", 1.5);
        gL.append("text").attr("x", ML.l + 4).attr("y", yL(t[0]) - 7).attr("fill", t[1]).style("font", "600 11px Inter, sans-serif").text(t[0] + "% · " + t[2]);
      });
      clipL = s.svg.append("defs").append("clipPath").attr("id", "c-debtl").append("rect").attr("x", 0).attr("y", 0).attr("height", s.h).attr("width", xL(2026) + 1);
      gL.append("path").datum(debt).attr("clip-path", "url(#c-debtl)").attr("fill", "none").attr("stroke", C.gold).attr("stroke-width", 2.5)
        .attr("d", d3.line().x(function (d) { return xL(d.rok); }).y(function (d) { return yL(d.v); }));
      ptsL = gL.append("g").selectAll("circle").data(debt).enter().append("circle").attr("cx", function (d) { return xL(d.rok); }).attr("cy", function (d) { return yL(d.v); })
        .attr("r", 5.5).attr("fill", C.gold).attr("stroke", C.surface).attr("stroke-width", 2).attr("opacity", 0);
      lblL = gL.append("g").selectAll("text").data(debt).enter().append("text").attr("class", "lbl").attr("text-anchor", "middle")
        .attr("x", function (d) { return xL(d.rok); }).attr("y", function (d) { return yL(d.v) + 24; }).attr("opacity", 0).text(function (d) { return fmt(d.v, 1) + "%"; });
    };

    api.step = function (i, instant) {
      api.cur = i;
      var ms = instant ? 0 : dur(700), mode = i <= 2 ? "w" : i === 3 ? "i" : "l";
      gW.transition().duration(ms).attr("opacity", mode === "w" ? 1 : 0); gW.style("pointer-events", mode === "w" ? "auto" : "none");
      gI.transition().duration(ms).attr("opacity", mode === "i" ? 1 : 0);
      gL.transition().duration(ms).attr("opacity", mode === "l" ? 1 : 0);
      var T = { w: ["Ile państwo musi pożyczyć w 2027 r.", "mld zł · art. 1, 2 i 3 · załącznik nr 5"], i: ["Koszt obsługi długu Skarbu Państwa", "mld zł · plan z ustaw budżetowych 2011–2027"], l: ["Państwowy dług publiczny", "% PKB · 2026 plan, 2027–2029 prognoza rządu"] }[mode];
      $("debt-title").textContent = T[0]; $("debt-sub").textContent = T[1];
      if (mode === "w") {
        wBars.transition().duration(ms).delay(function (d, k) { return instant ? 0 : dur(k * 120); }).attr("opacity", function (d) { return d.step <= i ? 1 : 0; });
        wLbl.transition().duration(ms).delay(function (d, k) { return instant ? 0 : dur(k * 120 + 200); }).attr("opacity", function (d) { return d.step <= i ? 1 : 0; });
      }
      if (mode === "l") {
        clipL.transition().duration(instant ? 0 : dur(1100)).ease(d3.easeCubicInOut).attr("width", xL(2029) + 1);
        ptsL.transition().duration(ms).delay(function (d) { return instant ? 0 : dur((d.rok - 2026) * 320); }).attr("opacity", 1);
        lblL.transition().duration(ms).delay(function (d) { return instant ? 0 : dur((d.rok - 2026) * 320 + 200); }).attr("opacity", 1);
      }
    };
    api.render();
    return api;
  }

  /* =====================================================================
     VII. ORBIT — budget inside the whole state
     ===================================================================== */
  function chartOrbit(el, U) {
    var api = { cur: 0 }, s, items, A = U.art;
    var DATA = [
      { id: "sektor", v: A.wydatki_sektora, name: "Wydatki państwowych jednostek i funduszy", short: "Całe państwo", cite: "art. 1 ust. 3", fill: "rgba(143,123,234,.10)", stroke: C.violet, dash: "", step: 1 },
      { id: "limit", v: A.limit_wydatkow, name: "Limit z reguły wydatkowej", short: "Limit wydatków", cite: "art. 1 ust. 4", fill: "none", stroke: C.gold, dash: "6 6", step: 2 },
      { id: "budzet", v: A.wydatki, name: "Budżet państwa", short: "Budżet państwa", cite: "art. 1 ust. 2", fill: C.gold, stroke: "none", dash: "", step: 0 },
      { id: "bse", v: A.bse_wydatki, name: "Budżet środków europejskich", short: "Środki z UE", cite: "art. 2 ust. 2", fill: C.blue, stroke: "none", dash: "", step: 3, side: 1 },
      { id: "skladka", v: 45.572445, name: "Składka Polski do budżetu UE", short: "Składka do UE", cite: "część 84", fill: C.violet, stroke: "none", dash: "", step: 3, side: 2 }
    ];
    api.render = function () {
      s = svgIn(el);
      var mob = s.w < 520, R = Math.min(s.w * (mob ? 0.42 : 0.36), (s.h - 30) * (mob ? 0.4 : 0.5)), k = R / Math.sqrt(A.wydatki_sektora);
      var cx = mob ? s.w * 0.5 : s.w * 0.40, base = mob ? 2 * R + 8 : s.h - 12;
      items = s.svg.append("g").selectAll("g").data(DATA).enter().append("g").attr("opacity", 0);
      items.each(function (d) {
        var r = Math.sqrt(d.v) * k, g = d3.select(this), x = cx, y = base - r;
        if (d.side) {
          var rb = Math.sqrt(A.wydatki) * k, rr = Math.sqrt(d.v) * k;
          x = cx + rb + rr + (mob ? 6 : 18) + (d.side === 2 ? 0 : 0);
          y = d.side === 1 ? base - rb * 1.55 : base - rr - 4;
          if (mob) { x = cx + (d.side === 1 ? -1 : 1) * (rb + rr + 6); y = base - rr - 24; }
        }
        d._x = x; d._y = y; d._r = r;
        g.append("circle").attr("cx", x).attr("cy", y).attr("r", r).attr("fill", d.fill).attr("stroke", d.stroke).attr("stroke-width", 1.6).attr("stroke-dasharray", d.dash);
        var inside = d.id === "budzet";
        var ty = d.side ? y - r - 22 : inside ? y + 6 : y - r + 30, anchor = "middle";
        if (d.id === "limit") { x = cx - r * 0.71 + 10; ty = y - r * 0.71 + 30; anchor = "start"; }
        g.append("text").attr("class", "lbl-mono").attr("text-anchor", anchor).attr("x", x).attr("y", ty - 18).style("fill", inside ? "rgba(18,15,11,.7)" : null).text(d.short.toUpperCase());
        g.append("text").attr("text-anchor", anchor).attr("x", x).attr("y", ty + 6).style("font", "750 " + (inside || d.id === "sektor" ? (mob ? 20 : 28) : 16) + "px Inter, sans-serif").style("letter-spacing", "-0.02em")
          .style("fill", inside ? "#120F0B" : C.ink).text(fmt(d.v, 1));
        g.on("pointermove", function (e) { showTT("<b>" + esc(d.name) + "</b><br><span class='tt-v'>" + mld(d.v) + "</span><br><span class='tt-s'>" + d.cite + "</span>", e.clientX, e.clientY); }).on("pointerleave", hideTT);
      });
    };
    api.step = function (i, instant) {
      api.cur = i;
      var ms = instant ? 0 : dur(800);
      items.transition().duration(ms).attr("opacity", function (d) {
        if (d.step > i) return 0;
        if (i === 3 && (d.id === "sektor" || d.id === "limit")) return s.w < 520 ? 0 : 0.25;
        return 1;
      });
    };
    api.render();
    return api;
  }

  /* =====================================================================
     VIII. RESERVES — squarified treemap
     ===================================================================== */
  function buildTiles(U) {
    var host = $("tiles"), R = U.rezerwy, items = R.pozycje.slice();
    var restV = R.razem - d3.sum(items, function (d) { return d.v; });
    items.push({ poz: null, name: "Pozostałe pozycje rezerw", v: restV, rest: true });
    var w = host.clientWidth, h = host.clientHeight;
    var root = d3.hierarchy({ children: items }).sum(function (d) { return d.v; }).sort(function (a, b) { return b.value - a.value; });
    d3.treemap().size([w, h]).paddingInner(4).tile(d3.treemapSquarify.ratio(1.2))(root);
    host.innerHTML = root.leaves().map(function (l, i) {
      var d = l.data, tw = l.x1 - l.x0, th = l.y1 - l.y0, area = tw * th;
      var cls = area < 2600 ? " tiny" : area < 9000 ? " small" : "";
      var bg = d.rest ? "#2A2620" : i < 3 ? "#D8973A" : i < 8 ? "#C9831F" : "#A86C17";
      var col = d.rest ? C.inkSoft : "#1A1206";
      return '<div class="tile' + cls + '" style="left:' + l.x0 + "px;top:" + l.y0 + "px;width:" + tw + "px;height:" + th + "px;background:" + bg + ";color:" + col + ";--d:" + (i * 40) + 'ms" data-i="' + i + '">' +
        '<span class="tile-n">' + esc(d.name) + "</span><span><span class='tile-v'>" + (d.v >= 1 ? nb(fmt(d.v, 1)) + "<small>mld zł</small>" : nb(fmt(d.v * 1000, 0)) + "<small>mln zł</small>") + "</span>" +
        (d.poz ? "<span class='tile-p'> · poz. " + d.poz + "</span>" : "") + "</span></div>";
    }).join("");
    host.querySelectorAll(".tile").forEach(function (t) {
      var d = root.leaves()[+t.dataset.i].data;
      t.addEventListener("pointermove", function (e) { showTT("<b>" + esc(d.name) + "</b><br><span class='tt-v'>" + (d.v >= 1 ? mld(d.v, 2) : nb(fmt(d.v * 1000, 1)) + " mln zł") + "</span>" + (d.poz ? "<br><span class='tt-s'>część 83 · poz. " + d.poz + "</span>" : ""), e.clientX, e.clientY); });
      t.addEventListener("pointerleave", hideTT);
    });
    onceVisible(host, function () { host.classList.add("is-in"); }, 0.15);
    var small = root.leaves().filter(function (l) { return (l.x1 - l.x0) * (l.y1 - l.y0) < 9000 && !l.data.rest; });
    var cap = $("tiles-small");
    if (cap) cap.innerHTML = small.length ? "Najmniejsze na mapie: " + small.map(function (l) { return "<strong>" + esc(l.data.name) + "</strong> " + (l.data.v >= 1 ? mld(l.data.v) : nb(fmt(l.data.v * 1000, 1)) + "\u00a0mln\u00a0zł"); }).join(" · ") + "." : "";
  }

  /* =====================================================================
     IX. PRIORITIES — law vs government total
     ===================================================================== */
  function buildPrio(U, D) {
    var dz = {}; U.dzialy.forEach(function (d) { dz[d.code] = d; });
    var F = {}; D.filary.pozycje.forEach(function (p) { F[p.id] = p; });
    var cards = [
      { k: "Filar 1", h: "Zdrowie", c: C.rose, soft: "rgba(217,86,127,.18)", law: dz["851"].v, lawK: "Dział 851 w ustawie", lawO: "w tym dotacja dla NFZ 41,5 mld zł", tot: F.zdrowie.v, totK: "Łącznie wg rządu", totO: "z NFZ, powyżej 7% PKB" },
      { k: "Filar 2", h: "Bezpieczeństwo", c: C.amber, soft: "rgba(201,131,31,.2)", law: 125.232789, lawK: "Część 29 w ustawie", lawO: "Minister Obrony Narodowej", tot: F.obrona.v, totK: "Łącznie wg rządu", totO: "z Funduszem Wsparcia Sił Zbrojnych, ponad 4,5% PKB" },
      { k: "Filar 3", h: "Rozwój", c: C.green, soft: "rgba(34,165,126,.18)", law: dz["730"].v + dz["600"].v, lawK: "Działy 730 i 600", lawO: "nauka (43,3) oraz transport (27,7)", tot: F.nauka.v + F.infra.v, totK: "Łącznie wg rządu", totO: "nauka (46,2) oraz drogi i kolej (62,4)" }
    ];
    var maxV = d3.max(cards, function (c) { return c.tot; });
    $("prio").innerHTML = cards.map(function (c, i) {
      return '<article class="pcard rv" style="--c:' + c.c + ";--c-soft:" + c.soft + ";--d:" + (i * 120) + 'ms"><span class="pcard-k">' + c.k + '</span><h4 class="pcard-h">' + c.h + '</h4><div class="pviz" data-i="' + i + '"></div>' +
        '<div class="pcard-nums"><div class="pnum"><div class="pnum-k"><i style="background:' + c.c + '"></i>' + c.lawK + '</div><div class="pnum-v">' + nb(fmt(c.law, 1)) + '<small>mld zł</small></div><div class="pnum-o">' + c.lawO + "</div></div>" +
        '<div class="pnum"><div class="pnum-k"><i style="border:1.5px dashed ' + c.c + ';background:none"></i>' + c.totK + '</div><div class="pnum-v">' + nb(fmt(c.tot, 1)) + '<small>mld zł</small></div><div class="pnum-o">' + c.totO + "</div></div></div></article>";
    }).join("");
    document.querySelectorAll(".pviz").forEach(function (el) {
      var c = cards[+el.dataset.i], w = el.clientWidth || 300, h = el.clientHeight || 168, Rm = h / 2 - 4;
      var ro = Math.sqrt(c.tot / maxV) * Rm, ri = Math.sqrt(c.law / maxV) * Rm, svg = d3.select(el).append("svg").attr("viewBox", "0 0 " + w + " " + h);
      var cx = w / 2, by = h - 2;
      svg.append("circle").attr("cx", cx).attr("cy", by - ro).attr("r", ro).attr("fill", "none").attr("stroke", c.c).attr("stroke-width", 1.6).attr("stroke-dasharray", "5 5");
      var inner = svg.append("circle").attr("cx", cx).attr("cy", by - ri).attr("r", 0).attr("fill", c.c);
      onceVisible(el, function () { inner.transition().duration(dur(1200)).ease(d3.easeCubicOut).attr("r", ri); }, 0.4);
      svg.append("text").attr("x", cx).attr("y", by - ri + 5).attr("text-anchor", "middle").style("font", "700 13px Inter, sans-serif").style("fill", "#120F0B").text(Math.round(c.law / c.tot * 100) + "%");
    });
  }

  /* =====================================================================
     X. RECEIPT + PIT CALCULATOR
     ===================================================================== */
  function buildReceipt(U, D) {
    var L = D.meta.ludnosc, total = U.art.wydatki * 1e9 / L, def = U.art.deficyt * 1e9 / L;
    var lines = [["753", "Emerytury i renty"], ["758", "Samorządy, UE, rezerwy"], ["752", "Obrona narodowa"], ["757", "Odsetki od długu"], ["855", "Rodzina, w tym 800+"], ["851", "Ochrona zdrowia"], ["730", "Uczelnie i nauka"], ["754", "Policja, straż, służby"], ["750", "Administracja"], ["755", "Sądy i więziennictwo"], ["600", "Drogi, kolej, łączność"]];
    var dz = {}; U.dzialy.forEach(function (d) { dz[d.code] = d.v; });
    var rows = lines.map(function (l) { return [l[1], Math.round(dz[l[0]] * 1e9 / L)]; });
    var tot = Math.round(total);
    rows.push(["Wszystko inne", tot - d3.sum(rows, function (r) { return r[1]; })]);
    function row(a, b, cls) { return '<div class="rc-row ' + (cls || "") + '"><span>' + esc(a) + "</span><i></i><b>" + nb(fmt(b)) + "</b></div>"; }
    $("receipt").innerHTML = '<div class="rc-head"><b>PARAGON</b><span>Budżet państwa · rok 2027</span><span>1 mieszkaniec · projekt, druk nr 3150</span></div>' +
      rows.map(function (r) { return row(r[0], r[1]); }).join("") +
      '<div class="rc-sum">' + row("SUMA PLN", tot) + row("w tym na kredyt", Math.round(def), "red") + "</div>" +
      '<div class="rc-foot">dziękujemy za zakupy · do zapłaty przez kolejne pokolenia</div><div class="rc-bar" aria-hidden="true"></div>';
    $("rc-big").innerHTML = nb(fmt(tot)) + "<small>zł</small>";
    $("rc-def").textContent = "Z tego " + zl(def) + " to pieniądze pożyczone.";
    var rr = $("receipt").querySelectorAll(".rc-row");
    onceVisible($("receipt"), function () { rr.forEach(function (r, i) { setTimeout(function () { r.classList.add("on"); }, dur(120 * i)); }); }, 0.25);
  }

  function taxOn(scale, inc) { var t = 0; scale.forEach(function (b) { var hi = b.do == null ? Infinity : b.do; if (inc > b.od) t += (Math.min(inc, hi) - b.od) * b.stawka / 100; }); return t; }
  function buildCalc(D) {
    var P = D.pit, range = $("calc-range"), num = $("calc-num");
    $("calc-note").textContent = P.uwaga;
    function scaleRow(name, sc, inc, max) {
      var bands = [{ od: 0, do: sc[0].od, stawka: 0 }].concat(sc);
      return '<div class="cs-row"><span class="cs-name">' + name + '</span><div class="cs-track">' + bands.map(function (b) {
        var hi = b.do == null ? max : Math.min(b.do, max), w = Math.max(0, hi - b.od) / max * 100;
        return w > 0 ? '<div class="cs-seg r' + b.stawka + '" style="width:' + w + '%">' + (w > 9 ? b.stawka + "%" : "") + "</div>" : "";
      }).join("") + '<span class="cs-marker" style="left:' + Math.min(100, inc / max * 100) + '%"></span></div></div>';
    }
    function update(src) {
      var inc = Math.max(0, +(src === "num" ? num.value : range.value) || 0);
      if (src === "num") range.value = Math.min(250000, inc); else num.value = inc;
      var max = Math.max(250000, Math.ceil(inc / 50000) * 50000), a = taxOn(P.teraz, inc), b = taxOn(P.projekt, inc), g = a - b;
      var stepV = (window.innerWidth < 560 ? 2 : 1) * Math.max(50000, Math.round(max / 5 / 50000) * 50000);
      $("calc-scales").innerHTML = scaleRow("Dziś", P.teraz, inc, max) + scaleRow("Projekt", P.projekt, inc, max) +
        '<div class="cs-axis"><i></i><div>' + d3.range(0, max + 1, stepV).map(function (v, k, arr) {
          var tr = k === 0 ? "translateX(0)" : (k === arr.length - 1 && v === max) ? "translateX(-100%)" : "translateX(-50%)";
          return '<span style="left:' + (v / max * 100) + "%;transform:" + tr + '">' + fmt(v / 1000) + " tys.</span>";
        }).join("") + "</div></div>";
      $("calc-out").innerHTML = '<div class="co"><div class="co-k">Podatek dziś</div><div class="co-v">' + zl(a) + '</div></div><div class="co"><div class="co-k">Wg projektu</div><div class="co-v">' + zl(b) +
        '</div></div><div class="co' + (g > 0 ? " is-win" : "") + '"><div class="co-k">Zostaje w kieszeni</div><div class="co-v">' + (g > 0 ? "+" : "") + zl(g) + "</div></div>";
    }
    range.addEventListener("input", function () { update("range"); });
    num.addEventListener("input", function () { update("num"); });
    update("range");
  }

  /* =====================================================================
     XI. PARLIAMENT
     ===================================================================== */
  function buildClock(D) {
    var a = new Date(D.termin.wplyniecie + "T00:00:00"), b = new Date(D.termin.termin_sejm_senat + "T00:00:00"), now = new Date();
    var total = Math.round((b - a) / 864e5), done = Math.max(0, Math.min(total, Math.floor((now - a) / 864e5))), left = total - done;
    var finished = D.kalendarz.every(function (k) { return k.status === "done"; }), C2 = 2 * Math.PI * 62;
    $("clock").innerHTML = '<div class="clock-dial"><svg viewBox="0 0 140 140"><circle class="trk" cx="70" cy="70" r="62"/><circle class="arc" cx="70" cy="70" r="62" stroke-dasharray="' + C2.toFixed(1) + '" stroke-dashoffset="' + C2.toFixed(1) + '"/></svg>' +
      '<div class="num"><b>' + (finished ? "✓" : fmt(Math.max(0, left))) + "</b><span>" + (finished ? "zdążyli" : "dni zostało") + "</span></div></div>" +
      '<div><div class="clock-k">Konstytucyjny zegar · art. 225</div><h3 class="clock-h">Minęło ' + fmt(done) + " z " + fmt(total) + " dni</h3><p class=\"clock-o\">" + esc(D.termin.opis) + " Termin: " + fmtDate(D.termin.termin_sejm_senat) + ".</p></div>";
    var arc = $("clock").querySelector(".arc");
    onceVisible($("clock"), function () { arc.style.strokeDashoffset = (C2 * (1 - done / total)).toFixed(1); }, 0.5);
  }
  function buildJourney(D) {
    var host = $("journey"), ICON = { done: "ti-check", current: "ti-point-filled", planned: "ti-clock" }, TAG = { done: "Za nami", current: "Teraz", planned: "Plan" };
    host.innerHTML = '<span class="journey-fill" aria-hidden="true"></span>' + D.kalendarz.map(function (k) {
      return '<li class="jstop ' + k.status + '"' + (k.status === "current" ? ' aria-current="step"' : "") + '><span class="jdot"><i class="ti ' + ICON[k.status] + '" aria-hidden="true"></i></span>' +
        '<div class="jcard"><div class="jmeta"><span class="jtag">' + TAG[k.status] + "</span><span>" + esc(k.kiedy) + "</span><span>· " + esc(k.kto) + '</span></div><h4 class="jname">' + esc(k.nazwa) + '</h4><p class="jdesc">' + esc(k.opis) + "</p></div></li>";
    }).join("");
    var fill = host.querySelector(".journey-fill");
    function place() { var last = null; host.querySelectorAll(".jstop").forEach(function (s) { if (!s.classList.contains("planned")) last = s; }); if (last) fill.dataset.h = (last.offsetTop + 22 - 10) + "px"; }
    place();
    window.addEventListener("resize", function () { place(); if (fill.style.height) fill.style.height = fill.dataset.h; });
    onceVisible(host, function () { fill.style.height = fill.dataset.h; }, 0.1);
  }
  function buildVersions(D) {
    var V = D.wersje, curIdx = -1; V.forEach(function (v, i) { if (v.wydatki != null) curIdx = i; });
    var rows = [["Dochody", "dochody", 1], ["Wydatki", "wydatki", 0], ["Deficyt", "deficyt", -1]];
    $("versions").innerHTML = '<p class="scroll-hint"><i class="ti ti-arrows-horizontal" aria-hidden="true"></i> Przesuń tabelę w bok</p><table class="vtable"><thead><tr><th>mld zł</th>' +
      V.map(function (v, i) { return '<th class="' + (i === curIdx ? "is-current" : "") + '"><b>' + esc(v.nazwa) + "</b><span>" + esc(v.kiedy) + "</span></th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) {
        var prev = null;
        return "<tr><td>" + r[0] + "</td>" + V.map(function (v) {
          var val = v[r[1]]; if (val == null) return '<td class="na">czekamy</td>';
          var d = "";
          if (prev != null) { var df = Math.round((val - prev) * 10) / 10, cls = df === 0 ? "same" : df * r[2] > 0 ? "good" : df * r[2] < 0 ? "bad" : "same"; d = '<span class="vd ' + cls + '">' + (df === 0 ? "bez zmian" : signed(df, 1)) + "</span>"; }
          prev = val; return "<td>" + nb(fmt(val, 1)) + d + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }
  function buildLog(D) {
    $("log").innerHTML = D.dziennik.map(function (l) { return '<li><time datetime="' + esc(l.data) + '">' + fmtDate(l.data) + "</time><span>" + esc(l.tekst) + "</span></li>"; }).join("");
  }

  /* =====================================================================
     XII. BALANCE + MACRO
     ===================================================================== */
  function buildTape(U, D, B26) {
    var m = B26.meta, dz = {}; U.dzialy.forEach(function (d) { dz[d.code] = d; });
    var rows = [
      ["Wydatki", m.wydatki / 1e6, U.art.wydatki, " mld"], ["Dochody", m.dochody / 1e6, U.art.dochody, " mld"], ["Deficyt", m.deficyt / 1e6, U.art.deficyt, " mld"],
      ["Obsługa długu", dz["757"].v2026, dz["757"].v, " mld"], ["Ochrona zdrowia", dz["851"].v2026, dz["851"].v, " mld"], ["Obrona narodowa", dz["752"].v2026, dz["752"].v, " mld"],
      ["Rodzina", dz["855"].v2026, dz["855"].v, " mld"], ["Dług publiczny / PKB", m.dlug_pkb_proc, D.dlug.pkb.filter(function (p) { return p.rok === 2027; })[0].v, "%"]
    ];
    var tape = $("tape");
    tape.innerHTML = '<div class="tape-head"><span class="l">2026 · ustawa</span><span></span><span class="r">2027 · projekt</span></div>' + rows.map(function (r) {
      var mx = Math.max(r[1], r[2]), chg = r[3] === "%" ? signed(r[2] - r[1], 1, " pkt proc.") : signed((r[2] - r[1]) / r[1] * 100, 1, "%");
      return '<div class="trow"><div class="tside l"><span class="tval">' + nb(fmt(r[1], 1)) + r[3] + '</span><span class="tbar"><span data-w="' + (r[1] / mx * 100) + '%"></span></span></div>' +
        '<div class="tmid"><div class="tname">' + r[0] + '</div><div class="tchg">' + chg + "</div></div>" +
        '<div class="tside r"><span class="tbar"><span data-w="' + (r[2] / mx * 100) + '%"></span></span><span class="tval">' + nb(fmt(r[2], 1)) + r[3] + "</span></div></div>";
    }).join("");
    onceVisible(tape, function () { tape.querySelectorAll(".tbar span").forEach(function (s) { s.style.width = s.dataset.w; }); }, 0.15);
  }
  function buildMacro(D) {
    $("macro").innerHTML = D.makro.map(function (m) {
      var rev = "";
      if (m.przed != null && m.przed !== m.v) {
        var worse = (m.id === "pkb" && m.v < m.przed) || (m.id === "cpi" && m.v > m.przed);
        rev = '<span class="mtile-rev' + (worse ? " worse" : "") + '"><i class="ti ti-arrow-' + (m.v > m.przed ? "up" : "down") + '-right" aria-hidden="true"></i>w czerwcu: ' + fmt(m.przed, 1) + "%</span>";
      }
      return '<div class="mtile rv"><div class="mtile-k">' + esc(m.name) + '</div><div class="mtile-v">' + fmt(m.v, 1) + "<small>" + esc(m.unit) + '</small></div><div class="mtile-o">' + esc(m.opis) + "</div>" + rev + "</div>";
    }).join("");
  }
  function buildSources(D) {
    $("sources").innerHTML = D.zrodla.map(function (z) {
      var ext = /^https?:/.test(z.url);
      return '<li><a href="' + esc(z.url) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" + esc(z.t) + "</a></li>";
    }).join("");
  }

  /* =====================================================================
     STEPPER — one gesture, one frame. Wheel, trackpad, keys and touch move the
     story to the next stop; the page holds still until that frame has settled.
     Sections taller than the screen scroll natively inside, and step at their edges.
     ===================================================================== */
  var stepper = null;
  function goToEl(el) {
    if (stepper) stepper.goToEl(el);
    else el.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" });
  }

  function setupStepper() {
    if (REDUCED || window.innerHeight < 460) return;
    var root = document.documentElement, topH = 58, segs = [], cur = 0;
    var locked = false, animating = false, lockTimer = 0, raf = 0;
    var lastWheel = 0, lastAbs = 0, hint = $("step-hint"), hintCount = $("step-hint-n");
    root.style.scrollBehavior = "auto";
    root.classList.add("stepper");

    var HOLD = { prolog: 500, astep: 1250, ahead: 900, chead: 750, lex: 900, sstep: 1000, sec: 450, free: 350 };

    function docTop(el) { var r = el.getBoundingClientRect(); return r.top + window.scrollY; }
    function maxY() { return root.scrollHeight - window.innerHeight; }
    function clampY(y) { return Math.max(0, Math.min(maxY(), Math.round(y))); }

    function build() {
      var vh = window.innerHeight, list = [];
      topH = $("tb-chapters") ? document.querySelector(".topbar").offsetHeight : 58;
      list.push({ type: "stop", y: 0, hold: HOLD.prolog, el: $("prolog") });
      document.querySelectorAll(".astep, .chead-block, .lex-wrap, .sstep, .sec, .outro").forEach(function (el) {
        var t = docTop(el), h = el.offsetHeight, kind;
        if (el.classList.contains("astep")) kind = el.classList.contains("astep-head") ? "ahead" : "astep";
        else if (el.classList.contains("chead-block")) kind = "chead";
        else if (el.classList.contains("lex-wrap")) kind = "lex";
        else if (el.classList.contains("sstep")) kind = "sstep";
        else kind = "sec";
        if (kind === "sec") {
          if (h + topH + 24 <= vh) list.push({ type: "stop", y: clampY(t + h / 2 - (vh + topH) / 2), hold: HOLD.sec, el: el });
          else list.push({ type: "free", y0: clampY(t - topH - 18), y1: clampY(t + h - vh + 28), el: el });
        } else {
          list.push({ type: "stop", y: clampY(t + h / 2 - vh / 2), hold: HOLD[kind], el: el });
        }
      });
      list.sort(function (a, b) { return (a.type === "stop" ? a.y : a.y0) - (b.type === "stop" ? b.y : b.y0); });
      segs = [];
      list.forEach(function (s) {
        var p = segs[segs.length - 1], sy = s.type === "stop" ? s.y : s.y0;
        if (p) {
          var py = p.type === "stop" ? p.y : p.y1;
          if (s.type === "stop" && Math.abs(sy - py) < 40) return;
          if (p.type === "free" && s.type === "free" && s.y0 <= p.y1 + 40) { p.y1 = Math.max(p.y1, s.y1); return; }
        }
        segs.push(s);
      });
      cur = locate(window.scrollY);
    }

    function inFree(s, y) { return s.type === "free" && y >= s.y0 - 2 && y <= s.y1 + 2; }
    function locate(y) {
      var best = 0, bd = Infinity;
      segs.forEach(function (s, i) {
        var d = s.type === "stop" ? Math.abs(s.y - y) : (y < s.y0 ? s.y0 - y : y > s.y1 ? y - s.y1 : 0);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    }
    function stopCount() { return segs.length; }

    // --- motion
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function animateTo(y, hold, idx) {
      y = clampY(y);
      cancelAnimationFrame(raf); clearTimeout(lockTimer);
      locked = true; animating = true; setHint(false);
      var from = window.scrollY, dist = y - from, T = Math.max(560, Math.min(1150, 420 + Math.abs(dist) * 0.32)), t0 = performance.now();
      if (Math.abs(dist) < 2) T = 1;
      (function f(now) {
        var k = Math.min(1, (now - t0) / T);
        window.scrollTo(0, from + dist * ease(k));
        if (k < 1) raf = requestAnimationFrame(f);
        else {
          animating = false; cur = idx != null ? idx : locate(y);
          lockTimer = setTimeout(release, hold);
        }
      })(t0);
    }
    function release() { locked = false; updateHint(); }
    function go(dir) {
      if (locked || !segs.length) return;
      var y = window.scrollY, i = locate(y), s = segs[i], j;
      if (s.type === "stop" && ((dir > 0 && s.y > y + 24) || (dir < 0 && s.y < y - 24))) j = i;
      else j = i + dir;
      if (j < 0) return;
      if (j >= segs.length) { if (dir > 0 && y < maxY() - 2) animateTo(maxY(), HOLD.free); return; }
      var t = segs[j];
      if (t.type === "free") animateTo(dir > 0 ? t.y0 : t.y1, HOLD.free, j);
      else animateTo(t.y, t.hold, j);
    }
    function goToEl(el) {
      var y = docTop(el), j = 0, bd = Infinity;
      segs.forEach(function (s, i) {
        var sy = s.type === "stop" ? s.y : s.y0, d = Math.abs(sy - (y - topH));
        if (s.el === el || (el.contains && s.el && el.contains(s.el))) d -= 100000;
        if (d < bd) { bd = d; j = i; }
      });
      var s = segs[j];
      locked = false;
      animateTo(s.type === "stop" ? s.y : s.y0, s.type === "stop" ? s.hold : HOLD.free, j);
    }
    stepper = { goToEl: goToEl };

    // --- hint pill
    function setHint(on) { if (hint) hint.classList.toggle("is-on", on); }
    function updateHint() {
      var y = window.scrollY, i = locate(y), s = segs[i];
      var show = !locked && i > 0 && i < segs.length - 1 && s.type === "stop" && Math.abs(s.y - y) < 30;
      if (hintCount) hintCount.textContent = (i + 1) + " / " + stopCount();
      setHint(show);
    }

    // --- wheel (mouse + trackpad, with inertia absorption)
    function interactive(t) { return t && t.closest && t.closest("input, textarea, select, [contenteditable], .versions, .tt"); }
    window.addEventListener("wheel", function (e) {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1), dir = dy > 0 ? 1 : -1, abs = Math.abs(dy);
      var now = performance.now(), gap = now - lastWheel;
      var fresh = gap > 140 || abs > lastAbs * 1.7 + 6;
      lastWheel = now; lastAbs = abs;
      var y = window.scrollY, s = segs[locate(y)];
      // native scrolling inside tall sections, clamped to their edges
      if (!locked && s && inFree(s, y)) {
        var target = y + dy;
        if ((dir > 0 && y < s.y1 - 1) || (dir < 0 && y > s.y0 + 1)) {
          if (target > s.y1 && dir > 0) { e.preventDefault(); window.scrollTo(0, s.y1); hold(); }
          else if (target < s.y0 && dir < 0) { e.preventDefault(); window.scrollTo(0, s.y0); hold(); }
          return;
        }
      }
      e.preventDefault();
      if (locked || !fresh || abs < 3) return;
      go(dir);
    }, { passive: false });
    function hold() { locked = true; clearTimeout(lockTimer); lockTimer = setTimeout(release, HOLD.free); }

    // --- keyboard
    window.addEventListener("keydown", function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || interactive(e.target) || (e.target && e.target.closest && e.target.closest("button, a") && (e.key === " " || e.key === "Enter"))) return;
      var down = ["ArrowDown", "PageDown"].indexOf(e.key) >= 0 || (e.key === " " && !e.shiftKey);
      var up = ["ArrowUp", "PageUp"].indexOf(e.key) >= 0 || (e.key === " " && e.shiftKey);
      if (!down && !up) return;
      var y = window.scrollY, s = segs[locate(y)];
      if (s && inFree(s, y) && ((down && y < s.y1 - 1) || (up && y > s.y0 + 1))) return;
      e.preventDefault();
      go(down ? 1 : -1);
    });

    // --- touch
    var ts = null;
    window.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) { ts = null; return; }
      ts = { x: e.touches[0].clientX, y: e.touches[0].clientY, mode: interactive(e.target) ? "native" : null };
    }, { passive: true });
    window.addEventListener("touchmove", function (e) {
      if (!ts) return;
      var dx = ts.x - e.touches[0].clientX, dy = ts.y - e.touches[0].clientY;
      if (!ts.mode) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        if (Math.abs(dx) > Math.abs(dy)) ts.mode = "native";
        else {
          var y = window.scrollY, s = segs[locate(y)], dir = dy > 0 ? 1 : -1;
          ts.mode = (!locked && s && inFree(s, y) && ((dir > 0 && y < s.y1 - 1) || (dir < 0 && y > s.y0 + 1))) ? "native" : "step";
        }
      }
      if (ts.mode === "step") { e.preventDefault(); ts.dy = dy; }
    }, { passive: false });
    window.addEventListener("touchend", function () {
      if (ts && ts.mode === "step" && Math.abs(ts.dy || 0) > 28) go(ts.dy > 0 ? 1 : -1);
      ts = null;
    }, { passive: true });

    // --- anchors inside the story
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var el = document.querySelector(a.getAttribute("href"));
      if (!el) return;
      e.preventDefault(); goToEl(el);
    });

    // --- settle: anything that moved the page without us (scrollbar drag, find, focus, momentum out of a long section)
    var idle = 0;
    window.addEventListener("scroll", function () {
      if (animating) return;
      setHint(false);
      clearTimeout(idle);
      idle = setTimeout(function () {
        if (ts || animating) return;
        var y = window.scrollY, i = locate(y), s = segs[i];
        if (s && s.type === "stop" && Math.abs(s.y - y) > 6) { locked = false; animateTo(s.y, 250, i); }
        else updateHint();
      }, 180);
    }, { passive: true });

    var rt;
    function rebuild() { clearTimeout(rt); rt = setTimeout(function () { build(); updateHint(); }, 200); }
    window.addEventListener("resize", rebuild);
    if (window.ResizeObserver) new ResizeObserver(rebuild).observe(document.body);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
    build();
    setTimeout(updateHint, 900);
  }

  /* ---------------- reveal ---------------- */
  function setupReveal() {
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });
    document.querySelectorAll(".chead-block .chead, .rv, .lex, .ledger, .jstop").forEach(function (n) { if (!n.closest(".prolog")) io.observe(n); });
  }
})();
