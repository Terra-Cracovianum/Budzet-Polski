// Budget assistant. A big "ask" bar on the overview, then a full-screen chat.
// Everything stays hidden unless /api/chat answers (Cloudflare Pages).
(function () {
  "use strict";

  var API = "/api/chat";
  var EXAMPLES = [
    "Ile Polska wydaje na obronę?",
    "Jaki jest deficyt w 2026 roku?",
    "Skąd państwo ma najwięcej pieniędzy?",
    "Ile kosztują odsetki od długu?",
    "Co zmienia projekt budżetu na 2027?",
    "Ile szło na zdrowie w 2015?"
  ];
  var history = [];
  var busy = false;
  var $ = function (id) { return document.getElementById(id); };

  fetch(API, { method: "GET" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.ok) build(); })
    .catch(function () { /* no assistant on this host */ });

  // ---------- markup ----------

  function build() {
    // 1) Ask bar on the overview, right under the big number.
    var hero = document.querySelector("#panel-overview .hero");
    if (hero) {
      var ask = document.createElement("section");
      ask.className = "ask";
      ask.setAttribute("aria-label", "Zapytaj asystenta o budżet");
      ask.innerHTML =
        '<form class="ask-bar" id="ask-form">' +
          '<label class="chat-sr" for="ask-input">Zapytaj o budżet państwa</label>' +
          '<i class="ti ti-sparkles ask-ico" aria-hidden="true"></i>' +
          '<span class="ask-field" id="ask-field">' +
            '<input id="ask-input" type="text" maxlength="500" autocomplete="off" enterkeyhint="send">' +
            '<span class="ask-ph" aria-hidden="true"><span class="ask-ph-t" id="ask-ph"></span></span>' +
          "</span>" +
          '<button type="submit" class="chat-send" aria-label="Zapytaj"><i class="ti ti-arrow-up" aria-hidden="true"></i></button>' +
        "</form>" +
        '<p class="ask-note">Asystent AI odpowiada na podstawie danych z tej strony.</p>';
      hero.insertAdjacentElement("afterend", ask);
      $("ask-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var q = $("ask-input").value.trim();
        $("ask-input").value = "";
        $("ask-field").classList.remove("has-value");
        open(q || curExample);
      });
      $("ask-input").addEventListener("input", function () {
        $("ask-field").classList.toggle("has-value", !!$("ask-input").value);
      });
      rotatePlaceholder($("ask-input"));
    }

    // 2) Small button for the other tabs.
    var fab = document.createElement("button");
    fab.type = "button";
    fab.className = "chat-fab";
    fab.id = "chat-fab";
    fab.innerHTML = '<i class="ti ti-sparkles" aria-hidden="true"></i><span>Zapytaj o budżet</span>';
    fab.addEventListener("click", function () { open(); });
    document.body.appendChild(fab);
    var bar = document.querySelector(".ask");
    if (bar && "IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        fab.classList.toggle("is-hidden", en[0].isIntersecting);
      }).observe(bar);
    }

    // 3) Full-screen chat.
    var full = document.createElement("div");
    full.className = "chat-full";
    full.id = "chat-full";
    full.hidden = true;
    full.setAttribute("role", "dialog");
    full.setAttribute("aria-modal", "true");
    full.setAttribute("aria-label", "Asystent budżetu");
    full.innerHTML =
      '<header class="chat-top">' +
        '<a class="chat-home" id="chat-home" href="/" aria-label="Terra Cracovianum: Budżet Polski, strona główna">' +
          '<img class="logo chat-logo" src="/logo.svg?v=16" alt="Terra Cracovianum" width="1757" height="586">' +
        "</a>" +
        '<button type="button" class="chat-back" id="chat-close"><i class="ti ti-arrow-left" aria-hidden="true"></i>Wróć do budżetu</button>' +
      "</header>" +
      '<div class="chat-scroll" id="chat-scroll">' +
        '<div class="chat-col" id="chat-log" role="log" aria-live="polite"></div>' +
      "</div>" +
      '<footer class="chat-bottom">' +
        '<div class="chat-col">' +
          '<p class="chat-links">' +
            '<button type="button" data-info="privacy"><i class="ti ti-lock" aria-hidden="true"></i>Twoja prywatność</button>' +
            '<span aria-hidden="true">·</span>' +
            '<button type="button" data-info="how"><i class="ti ti-info-circle" aria-hidden="true"></i>Jak działa asystent</button>' +
          "</p>" +
          '<form class="ask-bar ask-bar-sm" id="chat-form">' +
            '<label class="chat-sr" for="chat-input">Twoje pytanie o budżet</label>' +
            '<textarea id="chat-input" rows="1" maxlength="500" placeholder="Zapytaj o budżet…" enterkeyhint="send"></textarea>' +
            '<button type="submit" class="chat-send" id="chat-send" aria-label="Wyślij pytanie"><i class="ti ti-arrow-up" aria-hidden="true"></i></button>' +
          "</form>" +
        "</div>" +
      "</footer>";
    document.body.appendChild(full);

    $("chat-close").addEventListener("click", close);
    // Logo: close the chat and go to the overview (home) without reloading.
    $("chat-home").addEventListener("click", function (e) {
      var home = $("tab-overview");
      if (!home || e.metaKey || e.ctrlKey || e.shiftKey) return; // new tab etc.: plain link
      e.preventDefault();
      close();
      home.click();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !full.hidden) close();
    });
    $("chat-form").addEventListener("submit", function (e) { e.preventDefault(); send($("chat-input").value); });
    $("chat-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send($("chat-input").value); }
    });
    $("chat-input").addEventListener("input", grow);
    $("chat-log").addEventListener("click", onLogClick);
    full.querySelector(".chat-links").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-info]");
      if (b) info(b.getAttribute("data-info"));
    });
  }

  // The example question in the ask bar changes like a slot: old one slides up and
  // fades, the new one rises in. (A real placeholder cannot be animated.)
  var curExample = EXAMPLES[0];
  function rotatePlaceholder(input) {
    var ph = $("ask-ph"), i = 0;
    input.setAttribute("aria-label", "Zapytaj o budżet państwa, np. " + EXAMPLES[0]);
    function text() { curExample = EXAMPLES[i % EXAMPLES.length]; ph.innerHTML = 'Spróbuj: <q>' + esc(curExample) + "</q>"; }
    text();
    setInterval(function () {
      if (document.activeElement === input || input.value || document.hidden) return;
      i++;
      if (REDUCED()) { text(); return; }
      ph.classList.add("is-out");
      setTimeout(function () { text(); ph.classList.remove("is-out"); ph.classList.add("is-in");
        requestAnimationFrame(function () { requestAnimationFrame(function () { ph.classList.remove("is-in"); }); });
      }, 320);
    }, 3800);
  }
  function REDUCED() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

  // ---------- open / close ----------

  var lastFocus = null;

  function open(question) {
    lastFocus = document.activeElement;
    var full = $("chat-full");
    clearTimeout(closeTimer);
    full.hidden = false;
    document.documentElement.classList.add("chat-lock");
    // two frames so the browser paints the start state before the transition
    requestAnimationFrame(function () { requestAnimationFrame(function () { full.classList.add("is-open"); }); });
    if (!$("chat-log").children.length) welcome();
    if (question) send(question);
    else $("chat-input").focus();
  }

  var closeTimer = null;
  function close() {
    var full = $("chat-full");
    full.classList.remove("is-open");
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () { full.hidden = true; }, REDUCED() ? 0 : 320);
    document.documentElement.classList.remove("chat-lock");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function welcome() {
    var w = add("bot", "<p>Cześć! Pomogę Ci zrozumieć budżet państwa: ile, na co i skąd. Pytaj o dowolny rok od 2011 do 2027.</p>", false);
    var s = document.createElement("div");
    s.className = "chat-sugg";
    EXAMPLES.slice(0, 4).forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chat-chip";
      b.style.setProperty("--i", s.children.length);
      b.textContent = q;
      b.addEventListener("click", function () { send(q); });
      s.appendChild(b);
    });
    w.appendChild(s);
  }

  // ---------- messages ----------

  function add(role, html, actions) {
    var d = document.createElement("div");
    d.className = "chat-msg " + role;
    d.innerHTML = '<div class="chat-body">' + html + "</div>";
    if (actions) addActions(d);
    $("chat-log").appendChild(d);
    scrollDown();
    return d;
  }

  function scrollDown() {
    var sc = $("chat-scroll");
    sc.scrollTop = sc.scrollHeight;
  }

  function addActions(d) {
      d.insertAdjacentHTML("beforeend",
        '<div class="chat-acts">' +
          '<span class="chat-pair">' +
            '<button type="button" data-act="up" aria-label="Dobra odpowiedź" aria-pressed="false"><i class="ti ti-thumb-up" aria-hidden="true"></i></button>' +
            '<button type="button" data-act="down" aria-label="Zła odpowiedź" aria-pressed="false"><i class="ti ti-thumb-down" aria-hidden="true"></i></button>' +
          "</span>" +
          '<button type="button" data-act="copy" aria-label="Kopiuj odpowiedź"><i class="ti ti-copy" aria-hidden="true"></i></button>' +
        "</div>");
  }

  function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true;
    var sugg = document.querySelector(".chat-sugg");
    if (sugg) sugg.remove();
    $("chat-input").value = "";
    grow();
    $("chat-send").disabled = true;
    add("user", "<p>" + esc(text) + "</p>", false);
    var wait = add("bot wait", '<p class="chat-think" role="status"><span class="chat-orb" aria-hidden="true"></span><span class="chat-shimmer">Szukam w danych budżetu…</span></p>', false);

    fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: text, history: history })
    })
      .then(function (r) {
        var ct = r.headers.get("content-type") || "";
        // errors (rate limit, model down) come back as JSON
        if (!r.ok || ct.indexOf("application/json") !== -1 || !r.body) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            wait.remove();
            add("bot err", "<p>" + esc(j.error || "Coś poszło nie tak. Spróbuj ponownie.") + "</p>", false);
          });
        }
        // the place on the page this answer is about (button under the answer)
        var link = null;
        try { var lh = r.headers.get("x-chat-link"); if (lh) link = JSON.parse(decodeURIComponent(lh)); } catch (e) { link = null; }
        // the answer arrives in pieces: show it as it is written
        var reader = r.body.getReader(), dec = new TextDecoder(), answer = "", msg = null;
        function pump() {
          return reader.read().then(function (x) {
            if (x.done) return;
            answer += dec.decode(x.value, { stream: true });
            if (!msg && answer.trim()) { wait.remove(); msg = add("bot is-streaming", "", false); }
            if (msg) { msg.querySelector(".chat-body").innerHTML = render(answer.trim()); scrollDown(); }
            return pump();
          });
        }
        return pump().then(function () {
          answer = answer.trim();
          if (!msg) {
            wait.remove();
            add("bot err", "<p>Nie udało mi się odpowiedzieć. Spróbuj zadać pytanie inaczej.</p>", false);
            return;
          }
          msg.classList.remove("is-streaming");
          if (link && typeof link.href === "string" && /^\/[\w\/-]*$/.test(link.href)) {
            msg.insertAdjacentHTML("beforeend",
              '<a class="chat-goto" href="' + esc(link.href) + '">' +
                '<span class="chat-goto-k">Zobacz na stronie</span>' +
                '<span class="chat-goto-l">' + esc(link.label || "") + "</span>" +
                '<i class="ti ti-arrow-right" aria-hidden="true"></i>' +
              "</a>");
          }
          addActions(msg);
          msg._q = text;
          msg._a = answer;
          history.push({ role: "user", content: text }, { role: "assistant", content: answer });
          history = history.slice(-6);
        });
      })
      .catch(function () {
        wait.remove();
        add("bot err", "<p>Brak połączenia. Spróbuj ponownie.</p>", false);
      })
      .then(function () {
        busy = false;
        $("chat-send").disabled = false;
        $("chat-input").focus();
      });
  }

  function info(kind) {
    var html = kind === "privacy"
      ? "<p><strong>Twoja prywatność.</strong> Nie zakładamy konta i nie zapisujemy rozmów. Pytanie trafia do modelu AI tylko po to, by odpowiedzieć. Jeśli klikniesz łapkę w górę lub w dół, zapiszemy anonimowo to pytanie i odpowiedź, żeby poprawiać asystenta. Nie wpisuj danych osobowych.</p>"
      : "<p><strong>Jak działa asystent.</strong> Do każdego pytania wyszukujemy pasujące liczby w danych tej strony: ustawach budżetowych 2011–2026, sprawozdaniach Ministerstwa Finansów i projekcie budżetu na 2027. Model AI tylko tłumaczy te liczby prostym językiem. Odpowiada wyłącznie o budżecie Polski. Może się pomylić, dlatego sprawdzaj liczby na wykresach.</p>";
    add("bot note", html, false);
  }

  // ---------- actions: links, feedback, copy ----------

  function onLogClick(e) {
    // "Zobacz na stronie": close the chat and open that place (Cmd/Ctrl+click: new tab)
    var go = e.target.closest && e.target.closest("a.chat-goto");
    if (go) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      var href = go.getAttribute("href");
      if (!window.BudzetApp || href.indexOf("/budzet-2027") === 0) return; // plain navigation
      e.preventDefault();
      close();
      window.BudzetApp.go(href);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    var a = e.target.closest("a.chat-link");
    if (a) {
      e.preventDefault();
      var m = a.getAttribute("href").match(/^#(widok|rok)=(\w+)$/);
      if (!m) return;
      close();
      if (m[1] === "widok") {
        var tab = $("tab-" + m[2]);
        if (tab) tab.click();
      } else {
        var sel = $("year-select");
        if (sel && sel.querySelector('option[value="' + m[2] + '"]')) {
          sel.value = m[2];
          sel.dispatchEvent(new Event("change"));
        }
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    var b = e.target.closest("button[data-act]");
    if (!b) return;
    var msg = b.closest(".chat-msg");
    var act = b.getAttribute("data-act");
    if (act === "copy") {
      var txt = msg.querySelector(".chat-body").innerText;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () {
        b.innerHTML = '<i class="ti ti-check" aria-hidden="true"></i>';
        b.setAttribute("aria-label", "Skopiowano");
        setTimeout(function () {
          b.innerHTML = '<i class="ti ti-copy" aria-hidden="true"></i>';
          b.setAttribute("aria-label", "Kopiuj odpowiedź");
        }, 1500);
      }).catch(function () {});
      return;
    }
    // thumbs up / down: one vote per answer
    msg.querySelectorAll("button[data-act=up],button[data-act=down]").forEach(function (x) {
      x.setAttribute("aria-pressed", String(x === b));
      x.disabled = true;
    });
    fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vote: act, question: msg._q, answer: msg._a })
    }).catch(function () {});
  }

  // ---------- helpers ----------

  function grow() {
    var t = $("chat-input");
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 140) + "px";
  }

  // Tiny, safe Markdown: paragraphs, lists, **bold**, links to this site only.
  function render(md) {
    return esc(md).split(/\n{2,}/).map(function (b) {
      var lines = b.split("\n");
      if (lines.every(function (l) { return /^\s*[-*•]\s+/.test(l); })) {
        return "<ul>" + lines.map(function (l) { return "<li>" + inline(l.replace(/^\s*[-*•]\s+/, "")) + "</li>"; }).join("") + "</ul>";
      }
      return "<p>" + inline(lines.join("<br>")) + "</p>";
    }).join("");
  }

  function inline(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, href) {
        if (/^#(widok|rok)=[a-z0-9]+$/.test(href)) return '<a href="' + href + '" class="chat-link">' + label + "</a>";
        if (/^budzet-2027(\.html)?(#[\w-]*)?$/.test(href)) return '<a href="' + href + '">' + label + "</a>";
        return label;
      });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
