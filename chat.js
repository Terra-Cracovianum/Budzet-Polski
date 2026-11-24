// Budget chatbot widget. Shows up only when /api/chat answers (Cloudflare Pages).
(function () {
  "use strict";

  var API = "/api/chat";
  var SUGGESTIONS = [
    "Ile Polska wydaje na obronę?",
    "Jaki jest deficyt w 2026 roku?",
    "Skąd państwo ma najwięcej pieniędzy?",
    "Co zmienia projekt budżetu na 2027?"
  ];
  var history = [];
  var busy = false;
  var els = {};

  fetch(API, { method: "GET" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.ok) build(); })
    .catch(function () { /* no chat on this host */ });

  function build() {
    var root = document.createElement("div");
    root.className = "chat";
    root.innerHTML =
      '<button type="button" class="chat-fab" id="chat-open" aria-expanded="false" aria-controls="chat-panel">' +
        '<i class="ti ti-message-chatbot" aria-hidden="true"></i><span>Zapytaj o budżet</span></button>' +
      '<section class="chat-panel" id="chat-panel" role="dialog" aria-modal="false" aria-labelledby="chat-title" hidden>' +
        '<header class="chat-head">' +
          '<div><h2 class="chat-title" id="chat-title">Zapytaj o budżet</h2>' +
          '<p class="chat-sub">Odpowiedzi tylko na podstawie danych z tej strony</p></div>' +
          '<button type="button" class="icon-btn chat-x" id="chat-close" aria-label="Zamknij czat"><i class="ti ti-x" aria-hidden="true"></i></button>' +
        '</header>' +
        '<div class="chat-log" id="chat-log" role="log" aria-live="polite">' +
          '<div class="chat-msg bot"><p>Cześć! Pomogę Ci zrozumieć budżet państwa: ile, na co i skąd. Zapytaj o dowolny rok od 2011 do 2027.</p></div>' +
          '<div class="chat-sugg" id="chat-sugg"></div>' +
        '</div>' +
        '<form class="chat-form" id="chat-form">' +
          '<label class="sr-only" for="chat-input">Twoje pytanie o budżet</label>' +
          '<textarea id="chat-input" rows="1" maxlength="500" placeholder="Np. ile idzie na zdrowie w 2025?" required></textarea>' +
          '<button type="submit" class="chat-send" id="chat-send" aria-label="Wyślij pytanie"><i class="ti ti-arrow-up" aria-hidden="true"></i></button>' +
        '</form>' +
        '<p class="chat-foot">Asystent AI może się pomylić. Sprawdzaj liczby na wykresach.</p>' +
      '</section>';
    document.body.appendChild(root);

    ["chat-open", "chat-panel", "chat-close", "chat-log", "chat-sugg", "chat-form", "chat-input", "chat-send"].forEach(function (id) {
      els[id] = document.getElementById(id);
    });

    SUGGESTIONS.forEach(function (q) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chat-chip";
      b.textContent = q;
      b.addEventListener("click", function () { send(q); });
      els["chat-sugg"].appendChild(b);
    });

    els["chat-open"].addEventListener("click", function () { toggle(true); });
    els["chat-close"].addEventListener("click", function () { toggle(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !els["chat-panel"].hidden) toggle(false);
    });
    els["chat-form"].addEventListener("submit", function (e) {
      e.preventDefault();
      send(els["chat-input"].value);
    });
    els["chat-input"].addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(els["chat-input"].value); }
    });
    els["chat-input"].addEventListener("input", grow);
    els["chat-log"].addEventListener("click", onLink);
  }

  function toggle(open) {
    els["chat-panel"].hidden = !open;
    els["chat-open"].setAttribute("aria-expanded", String(open));
    els["chat-open"].hidden = open;
    if (open) els["chat-input"].focus();
    else els["chat-open"].focus();
  }

  function grow() {
    var t = els["chat-input"];
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 120) + "px";
  }

  function add(role, html) {
    var d = document.createElement("div");
    d.className = "chat-msg " + role;
    d.innerHTML = html;
    els["chat-log"].appendChild(d);
    els["chat-log"].scrollTop = els["chat-log"].scrollHeight;
    return d;
  }

  function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true;
    els["chat-sugg"].remove && els["chat-sugg"].parentNode && els["chat-sugg"].remove();
    els["chat-input"].value = "";
    grow();
    els["chat-send"].disabled = true;
    add("user", "<p>" + esc(text) + "</p>");
    var wait = add("bot wait", '<p><span class="chat-dots" aria-label="Asystent pisze"><i></i><i></i><i></i></span></p>');

    fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: text, history: history })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        wait.remove();
        if (j.answer) {
          add("bot", render(j.answer));
          history.push({ role: "user", content: text }, { role: "assistant", content: j.answer });
          history = history.slice(-6);
        } else {
          add("bot err", "<p>" + esc(j.error || "Coś poszło nie tak. Spróbuj ponownie.") + "</p>");
        }
      })
      .catch(function () {
        wait.remove();
        add("bot err", "<p>Brak połączenia. Spróbuj ponownie.</p>");
      })
      .then(function () {
        busy = false;
        els["chat-send"].disabled = false;
        els["chat-input"].focus();
      });
  }

  // Tiny, safe Markdown: paragraphs, lists, **bold**, and links to this site only.
  function render(md) {
    var blocks = esc(md).split(/\n{2,}/);
    return blocks.map(function (b) {
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
        if (/^budzet-2027\.html(#[\w-]*)?$/.test(href)) return '<a href="' + href + '">' + label + "</a>";
        return label; // drop any other link
      });
  }

  function onLink(e) {
    var a = e.target.closest && e.target.closest("a.chat-link");
    if (!a) return;
    e.preventDefault();
    var m = a.getAttribute("href").match(/^#(widok|rok)=(\w+)$/);
    if (!m) return;
    if (m[1] === "widok") {
      var tab = document.getElementById("tab-" + m[2]);
      if (tab) { tab.click(); tab.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    } else {
      var sel = document.getElementById("year-select");
      if (sel && sel.querySelector('option[value="' + m[2] + '"]')) {
        sel.value = m[2];
        sel.dispatchEvent(new Event("change"));
      }
    }
    if (window.matchMedia("(max-width: 640px)").matches) toggle(false);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
