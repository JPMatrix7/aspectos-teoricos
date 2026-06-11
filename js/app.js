/* ===========================================================================
   Aspectos Teóricos da Computação — App de estudo interativo
   Vanilla JS · funciona offline (file://) · gamificação completa
   =========================================================================== */
(function () {
  "use strict";

  const COURSE = window.COURSE || { modules: [], totals: {} };
  const MODS = COURSE.modules;
  const byId = (id) => MODS.find((m) => m.id === id);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const todayStr = () => new Date().toISOString().slice(0, 10);

  /* ---------------------------------------------------------------- STATE */
  const LS_KEY = "atc_progress_v2";
  const defaultState = () => ({
    xp: 0,
    points: 0,
    streak: { count: 0, last: null },
    mods: {},          // id -> { read, fc:{idx:'known'}, quizBest, exDone:{idx:true} }
    ach: {},           // id -> true
    settings: { sound: false },
  });
  let S = load();
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {}
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) {}
  }
  function ms(id) {
    if (!S.mods[id]) S.mods[id] = { read: false, fc: {}, quizBest: 0, exDone: {} };
    return S.mods[id];
  }

  /* ------------------------------------------------------------- LEVELING */
  // Threshold p/ ATINGIR o nível n: T(n) = 50*(n-1)*n  →  L2=100, L3=300, L4=600, L5=1000...
  function levelInfo(xp) {
    let L = 1;
    while (50 * L * (L + 1) <= xp) L++;
    const base = 50 * (L - 1) * L;
    const next = 50 * L * (L + 1);
    return { level: L, base, next, pct: Math.max(0, Math.min(1, (xp - base) / (next - base))) };
  }

  function addXP(n, ev) {
    const before = levelInfo(S.xp).level;
    S.xp += n;
    const after = levelInfo(S.xp).level;
    save();
    updateHUD();
    if (ev) floatXP(n, ev);
    blip("xp");
    if (after > before) {
      confetti();
      blip("level");
      toast("lvl", "🎉", `Nível ${after}!`, `Você alcançou o nível ${after}. Continue assim!`);
    }
    checkAchievements();
  }
  function addPoints(n) { S.points += n; save(); updateHUD(); }

  /* ------------------------------------------------------------- STREAK */
  function touchStreak() {
    const t = todayStr();
    const last = S.streak.last;
    if (last === t) return;
    if (last) {
      const diff = (new Date(t) - new Date(last)) / 86400000;
      S.streak.count = diff === 1 ? S.streak.count + 1 : 1;
    } else {
      S.streak.count = 1;
    }
    S.streak.last = t;
    save();
    updateHUD();
    checkAchievements();
  }

  /* ------------------------------------------------------- ACHIEVEMENTS */
  const ACHS = [
    { id: "start", ico: "🥾", ttl: "Primeiros Passos", desc: "Abra seu primeiro módulo", check: () => Object.keys(S.mods).length >= 1 },
    { id: "reader", ico: "📖", ttl: "Leitor", desc: "Leia o conteúdo de 3 módulos", check: () => countRead() >= 3 },
    { id: "explorer", ico: "🧭", ttl: "Explorador", desc: "Visite todos os 11 módulos", check: () => Object.keys(S.mods).length >= MODS.length },
    { id: "fc25", ico: "🎴", ttl: "Colecionador", desc: "Domine 25 flashcards", check: () => countFC() >= 25 },
    { id: "fc100", ico: "🃏", ttl: "Mestre dos Cards", desc: "Domine 100 flashcards", check: () => countFC() >= 100 },
    { id: "quiz1", ico: "✅", ttl: "Quiz Iniciante", desc: "Complete um quiz", check: () => Object.values(S.mods).some((m) => m.quizBest > 0) },
    { id: "perfect", ico: "🏆", ttl: "Nota Máxima", desc: "Acerte 100% em um quiz", check: () => Object.values(S.mods).some((m) => m.quizBest >= 100) || S.ach.simulado100 },
    { id: "perf3", ico: "💯", ttl: "Perfeccionista", desc: "100% em 3 quizzes", check: () => Object.values(S.mods).filter((m) => m.quizBest >= 100).length >= 3 },
    { id: "automata", ico: "🤖", ttl: "Domador de Autômatos", desc: "≥70% nos quizzes dos módulos 5–9", check: () => ["05-automato-finito","06-afd-e-afnd","07-afn","08-afn-movimentos-vazios","09-afng"].every((id) => (S.mods[id]?.quizBest || 0) >= 70) },
    { id: "streak3", ico: "🔥", ttl: "Em Chamas", desc: "3 dias seguidos estudando", check: () => S.streak.count >= 3 },
    { id: "lvl5", ico: "🧠", ttl: "Sábio", desc: "Alcance o nível 5", check: () => levelInfo(S.xp).level >= 5 },
    { id: "complete", ico: "👑", ttl: "Lenda da Computação", desc: "Complete todos os módulos", check: () => MODS.every((m) => moduleProgress(m.id).done) },
  ];
  function countRead() { return Object.values(S.mods).filter((m) => m.read).length; }
  function countFC() { return Object.values(S.mods).reduce((a, m) => a + Object.values(m.fc || {}).filter((v) => v === "known").length, 0); }
  function checkAchievements() {
    let changed = false;
    ACHS.forEach((a) => {
      if (!S.ach[a.id] && a.check()) {
        S.ach[a.id] = true; changed = true;
        confetti(); blip("ach");
        toast("ach", a.ico, "Conquista desbloqueada!", `${a.ttl} — ${a.desc}`);
      }
    });
    if (changed) { save(); if (route.view === "home") renderMain(); }
  }

  /* ----------------------------------------------------------- PROGRESS */
  // Progresso do módulo: leitura (20%) + flashcards (30%) + quiz (35%) + exercícios (15%)
  function moduleProgress(id) {
    const m = byId(id); if (!m) return { pct: 0, done: false };
    const st = S.mods[id] || { read: false, fc: {}, quizBest: 0, exDone: {} };
    const fcTot = m.flashcards.length, exTot = m.exercises.length;
    const fcKnown = Object.values(st.fc || {}).filter((v) => v === "known").length;
    const exDone = Object.keys(st.exDone || {}).length;
    const pRead = st.read ? 1 : 0;
    const pFc = fcTot ? fcKnown / fcTot : 1;
    const pQuiz = (st.quizBest || 0) / 100;
    const pEx = exTot ? exDone / exTot : 1;
    const pct = Math.round((pRead * 0.20 + pFc * 0.30 + pQuiz * 0.35 + pEx * 0.15) * 100);
    const done = st.read && pFc >= 0.999 && (st.quizBest || 0) >= 70 && pEx >= 0.999;
    return { pct, done, fcKnown, fcTot, exDone, exTot, quizBest: st.quizBest || 0 };
  }
  function overallProgress() {
    const arr = MODS.map((m) => moduleProgress(m.id).pct);
    return Math.round(arr.reduce((a, b) => a + b, 0) / (arr.length || 1));
  }

  /* --------------------------------------------------------------- SOUND */
  let actx = null;
  function blip(type) {
    if (!S.settings.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      const map = { xp: [660, .05], ok: [880, .08], no: [180, .12], ach: [1040, .14], level: [1320, .2], flip: [520, .04] };
      const [f, d] = map[type] || [440, .05];
      o.frequency.value = f; o.type = "sine";
      g.gain.value = .06; o.connect(g); g.connect(actx.destination);
      o.start(); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + d);
      o.stop(actx.currentTime + d + .02);
    } catch (e) {}
  }

  /* ------------------------------------------------------------ CONFETTI */
  const fx = $("#fx"); const fctx = fx.getContext("2d");
  let parts = [], fxRunning = false;
  function sizeFx() { fx.width = innerWidth; fx.height = innerHeight; }
  addEventListener("resize", sizeFx); sizeFx();
  function confetti(n = 130) {
    const colors = ["#6366f1", "#8b5cf6", "#22d3ee", "#ec4899", "#22c55e", "#f59e0b"];
    for (let i = 0; i < n; i++) {
      parts.push({
        x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .3,
        vx: (Math.random() - .5) * 11, vy: Math.random() * -13 - 4,
        g: .28 + Math.random() * .12, s: 5 + Math.random() * 7,
        c: colors[(Math.random() * colors.length) | 0], rot: Math.random() * 6.28, vr: (Math.random() - .5) * .3,
        life: 100 + Math.random() * 40,
      });
    }
    if (!fxRunning) { fxRunning = true; requestAnimationFrame(stepFx); }
  }
  function stepFx() {
    fctx.clearRect(0, 0, fx.width, fx.height);
    parts.forEach((p) => {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot); fctx.fillStyle = p.c;
      fctx.globalAlpha = Math.max(0, Math.min(1, p.life / 40));
      fctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); fctx.restore();
    });
    parts = parts.filter((p) => p.life > 0 && p.y < fx.height + 40);
    if (parts.length) requestAnimationFrame(stepFx); else { fxRunning = false; fctx.clearRect(0, 0, fx.width, fx.height); }
  }

  /* --------------------------------------------------------------- TOAST */
  function toast(kind, ico, title, body) {
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.innerHTML = `<div class="toast-ico">${ico}</div><div class="toast-body"><strong>${esc(title)}</strong><small>${esc(body)}</small></div>`;
    $("#toasts").appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 350); }, 3600);
  }
  function floatXP(n, ev) {
    const el = document.createElement("div");
    el.className = "xp-float"; el.textContent = "+" + n + " XP";
    let x = innerWidth / 2, y = innerHeight / 2;
    if (ev && ev.clientX) { x = ev.clientX; y = ev.clientY; }
    el.style.left = x + "px"; el.style.top = y + "px";
    document.body.appendChild(el); setTimeout(() => el.remove(), 1150);
  }

  /* --------------------------------------------------------------- HUD */
  function updateHUD() {
    const li = levelInfo(S.xp);
    $("#hudLevelNum").textContent = li.level;
    $("#hudLevelText").textContent = li.level;
    $("#hudXp").textContent = S.xp;
    $("#hudXpFill").style.width = (li.pct * 100).toFixed(1) + "%";
    $("#hudPointsNum").textContent = S.points;
    $("#hudStreakNum").textContent = S.streak.count;
    $("#soundBtn").textContent = S.settings.sound ? "🔊" : "🔈";
  }

  /* ------------------------------------------------------- MARKDOWN/MERMAID */
  let mermaidReady = false;
  if (window.mermaid) {
    try {
      mermaid.initialize({
        startOnLoad: false, securityLevel: "loose", theme: "base",
        themeVariables: {
          darkMode: true, background: "transparent",
          primaryColor: "#1c2550", primaryTextColor: "#e8ebf7", primaryBorderColor: "#6366f1",
          lineColor: "#8b9bd4", secondaryColor: "#15233f", tertiaryColor: "#0e1430",
          fontFamily: "Inter, system-ui, sans-serif", fontSize: "15px",
        },
      });
      mermaidReady = true;
    } catch (e) { console.warn("mermaid init", e); }
  }
  if (window.marked) marked.setOptions({ breaks: false, gfm: true });

  let mermaidSeq = 0;
  async function renderMarkdown(el, md) {
    el.innerHTML = window.marked ? marked.parse(md) : "<pre>" + esc(md) + "</pre>";
    // converte blocos ```mermaid``` (code.language-mermaid) em diagramas
    const blocks = $$("pre > code.language-mermaid", el);
    for (const code of blocks) {
      const src = code.textContent;
      const holder = document.createElement("div");
      holder.className = "mermaid";
      const pre = code.parentElement;
      pre.replaceWith(holder);
      if (mermaidReady) {
        try {
          const { svg } = await mermaid.render("mmd" + (++mermaidSeq), src);
          holder.innerHTML = svg;
        } catch (e) {
          holder.classList.remove("mermaid");
          holder.innerHTML = `<pre class="mermaid-error">⚠ Diagrama (Mermaid):\n${esc(src)}</pre>`;
        }
      } else {
        holder.innerHTML = `<pre class="mermaid-error">${esc(src)}</pre>`;
      }
    }
  }

  /* ---------------------------------------------------------- EVAL FILTER */
  let filterEval = "all"; // "all" | "A1" | "A2"
  function filteredMods() {
    return filterEval === "all" ? MODS : MODS.filter((m) => m.eval === filterEval);
  }
  function evalFilterBar() {
    const opts = [
      { v: "all", ico: "📚", lbl: "Ambos" },
      { v: "A1",  ico: "", lbl: "1ª Avaliação" },
      { v: "A2",  ico: "", lbl: "2ª Avaliação" },
    ];
    return `<div class="eval-filter">${opts.map((o) =>
      `<button class="eval-btn${filterEval === o.v ? " active" : ""}" data-f="${o.v}">` +
      (o.v === "A1" ? `<span class="eval-badge eval-badge-a1">A1</span> ` : o.v === "A2" ? `<span class="eval-badge eval-badge-a2">A2</span> ` : `${o.ico} `) +
      `${o.lbl}</button>`
    ).join("")}</div>`;
  }
  function bindEvalFilter(cb) {
    $$(".eval-btn").forEach((b) => b.addEventListener("click", () => { filterEval = b.dataset.f; cb(); }));
  }

  /* --------------------------------------------------------------- ROUTER */
  let route = { view: "home", id: null, tab: "conteudo" };
  function parseHash() {
    const h = (location.hash || "#home").slice(1);
    const [a, b, c] = h.split("/");
    if (a === "mod" && b) return { view: "module", id: decodeURIComponent(b), tab: c || "conteudo" };
    if (a === "simulado") return { view: "simulado" };
    if (a === "cards") return { view: "cards" };
    if (a === "timeline") return { view: "timeline" };
    if (a === "search") return { view: "search" };
    return { view: "home" };
  }
  function go(hash) { location.hash = hash; }
  addEventListener("hashchange", () => { route = parseHash(); render(); });

  /* --------------------------------------------------------------- SIDEBAR */
  function renderSidebar() {
    const nav = $("#sidebar");
    let h = "";
    h += `<div class="nav-section">Geral</div>`;
    h += navItem("#home", "🏠", "Início", null, route.view === "home");
    h += navItem("#search", "🔍", "Buscar", null, route.view === "search");
    h += navItem("#timeline", "📅", "Linha do Tempo", null, route.view === "timeline");
    h += navItem("#simulado", "🎯", "Simulado Geral", null, route.view === "simulado");
    h += navItem("#cards", "🎴", "Flashcards Gerais", null, route.view === "cards");

    const a1 = MODS.filter((m) => m.eval !== "A2");
    const a2 = MODS.filter((m) => m.eval === "A2");

    function navMods(mods) {
      let out = "";
      mods.forEach((m) => {
        const p = moduleProgress(m.id);
        const active = route.view === "module" && route.id === m.id;
        const dot = p.done ? "done" : p.pct > 0 ? "partial" : "";
        out += `<div class="nav-item ${active ? "active" : ""}" data-h="#mod/${m.id}">
          <span class="nav-ico">${m.icon}</span>
          <span class="nav-label">${esc(m.title)}</span>
          <span class="nav-dot ${dot}" title="${p.pct}%"></span>
        </div>
        <div class="nav-mini"><i style="width:${p.pct}%"></i></div>`;
      });
      return out;
    }

    if (a1.length) {
      h += `<div class="nav-section nav-section-eval">📘 A1 — Primeira Avaliação</div>`;
      h += navMods(a1);
    }
    if (a2.length) {
      h += `<div class="nav-section nav-section-eval nav-section-a2">📗 A2 — Segunda Avaliação</div>`;
      h += navMods(a2);
    }

    nav.innerHTML = h;
    $$(".nav-item", nav).forEach((it) => it.addEventListener("click", () => { go(it.dataset.h); closeNav(); }));
  }
  function navItem(hash, ico, label, num, active) {
    return `<div class="nav-item ${active ? "active" : ""}" data-h="${hash}">
      <span class="nav-ico">${ico}</span><span class="nav-label">${label}</span>
    </div>`;
  }

  /* --------------------------------------------------------------- RENDER */
  const main = $("#main");
  function render() { renderSidebar(); renderMain(); updateHUD(); }
  function renderMain() {
    main.scrollTop = 0; window.scrollTo(0, 0);
    if (route.view === "home") return viewHome();
    if (route.view === "module") return viewModule();
    if (route.view === "simulado") return viewSimulado();
    if (route.view === "cards") return viewCards();
    if (route.view === "timeline") return viewTimeline();
    if (route.view === "search") return viewSearch();
    viewHome();
  }

  /* ----------------------------------------------------------- VIEW: HOME */
  function viewHome() {
    const li = levelInfo(S.xp);
    const overall = overallProgress();
    const doneCount = MODS.filter((m) => moduleProgress(m.id).done).length;
    const unlocked = ACHS.filter((a) => S.ach[a.id]).length;
    const t = COURSE.totals || {};
    main.innerHTML = `
      <section class="hero fade-in">
        <h1>Domine os <span class="gradient-text">Aspectos Teóricos da Computação</span></h1>
        <p>Linguagens formais, autômatos, expressões regulares e grafos — transcritos fielmente dos slides da disciplina. Estude com conteúdo, flashcards, quizzes e exercícios resolvidos. Ganhe XP, suba de nível e desbloqueie conquistas. 🚀</p>
        <div class="hero-stats">
          <div class="stat"><span class="stat-ico">📚</span><div><div class="stat-val">${MODS.length}</div><div class="stat-lbl">módulos</div></div></div>
          <div class="stat"><span class="stat-ico">🎴</span><div><div class="stat-val">${t.flashcards || 0}</div><div class="stat-lbl">flashcards</div></div></div>
          <div class="stat"><span class="stat-ico">❓</span><div><div class="stat-val">${t.quiz || 0}</div><div class="stat-lbl">perguntas</div></div></div>
          <div class="stat"><span class="stat-ico">✍️</span><div><div class="stat-val">${t.exercises || 0}</div><div class="stat-lbl">exercícios</div></div></div>
        </div>
      </section>

      <section class="card fade-in" style="margin-bottom:24px">
        <div class="ring-wrap" style="flex-wrap:wrap;justify-content:space-between">
          <div class="ring-wrap">
            ${ring(overall)}
            <div>
              <div style="font-size:13px;color:var(--muted)">Progresso geral do curso</div>
              <div style="font-size:30px;font-weight:800">${overall}%</div>
              <div style="font-size:13px;color:var(--muted)">${doneCount}/${MODS.length} módulos concluídos</div>
            </div>
          </div>
          <div style="display:flex;gap:22px;flex-wrap:wrap">
            ${miniStat("🏅", "Nível", li.level)}
            ${miniStat("⚡", "XP", S.xp)}
            ${miniStat("🔥", "Sequência", S.streak.count + " d")}
            ${miniStat("🎖️", "Conquistas", unlocked + "/" + ACHS.length)}
          </div>
        </div>
      </section>

      <h2 class="section-title">Módulos do curso ${evalFilterBar()}</h2>
      <div class="grid grid-mods" id="modGrid"></div>

      <h2 class="section-title" style="margin-top:34px">Conquistas</h2>
      <div class="ach-grid" id="achGrid"></div>
    `;
    bindEvalFilter(() => viewHome());
    const grid = $("#modGrid");
    filteredMods().forEach((m) => {
      const p = moduleProgress(m.id);
      const card = document.createElement("div");
      card.className = "mod-card pop";
      card.innerHTML = `
        <span class="mod-n">${String(m.module).padStart(2, "0")}</span>
        ${p.done ? '<span class="mod-badge-done">✅</span>' : ""}
        <span class="eval-badge eval-badge-${m.eval === "A2" ? "a2" : "a1"}">${m.eval || "A1"}</span>
        <span class="mod-ico">${m.icon}</span>
        <h3>${esc(m.title)}</h3>
        <p>${esc(m.summary)}</p>
        <div class="mod-meta">
          <span>🎴 ${m.flashcards.length}</span><span>❓ ${m.quiz.length}</span><span>✍️ ${m.exercises.length}</span>
          <span style="margin-left:auto;font-weight:700;color:var(--muted)">${p.pct}%</span>
        </div>
        <div class="mod-prog"><i style="width:${p.pct}%"></i></div>`;
      card.addEventListener("click", () => go(`#mod/${m.id}`));
      grid.appendChild(card);
    });
    const ag = $("#achGrid");
    ACHS.forEach((a) => {
      const on = !!S.ach[a.id];
      const el = document.createElement("div");
      el.className = "ach " + (on ? "unlocked" : "locked");
      el.innerHTML = `<div class="ach-ico">${on ? a.ico : "🔒"}</div><div class="ach-ttl">${esc(a.ttl)}</div><div class="ach-desc">${esc(a.desc)}</div>`;
      ag.appendChild(el);
    });
  }
  function miniStat(ico, lbl, val) {
    return `<div style="text-align:center"><div style="font-size:22px">${ico}</div><div style="font-size:22px;font-weight:800">${val}</div><div style="font-size:11px;color:var(--muted)">${lbl}</div></div>`;
  }
  function ring(pct) {
    const r = 52, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return `<div class="ring">
      <svg width="120" height="120">
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="11"/>
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="url(#g)" stroke-width="11" stroke-linecap="round"
          stroke-dasharray="${c}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset 1s"/>
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#22d3ee"/>
        </linearGradient></defs>
      </svg>
      <div class="ring-num"><b>${pct}%</b><span>concluído</span></div>
    </div>`;
  }

  /* ---------------------------------------------------------- PDF BUTTONS */
  function pdfButtons(m) {
    if (!m.pdfs || !m.pdfs.length) return "";
    return `<div class="pdf-btns">${m.pdfs.map((p) =>
      `<a class="btn btn-sm pdf-btn" href="pdfs/${p.file}" target="_blank" rel="noopener">📄 ${esc(p.label)}</a>`
    ).join("")}</div>`;
  }

  /* --------------------------------------------------------- VIEW: MODULE */
  function viewModule() {
    const m = byId(route.id);
    if (!m) { go("#home"); return; }
    if (!S.mods[route.id]) { ms(route.id); save(); renderSidebar(); checkAchievements(); }
    const p = moduleProgress(m.id);
    const tabs = [
      ["conteudo", "📄", "Conteúdo", null],
      ["pontos", "🔑", "Pontos-chave", m.keyPoints.length],
      ["flashcards", "🎴", "Flashcards", m.flashcards.length],
      ["quiz", "❓", "Quiz", m.quiz.length],
      ["exercicios", "✍️", "Exercícios", m.exercises.length],
    ];
    main.innerHTML = `
      <div class="breadcrumb fade-in"><a href="#home">Início</a> › <span>Módulo ${m.module}</span></div>
      <div class="page-head fade-in">
        <h1>${m.icon} ${esc(m.title)} <span class="eval-badge eval-badge-${m.eval === "A2" ? "a2" : "a1"}" style="font-size:14px;vertical-align:middle">${m.eval || "A1"}</span></h1>
        <div style="color:var(--muted);font-size:14.5px;max-width:75ch">${esc(m.summary)}</div>
        <div style="margin-top:12px">${m.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap">
          <div style="flex:1;max-width:340px" class="mod-prog"><i style="width:${p.pct}%"></i></div>
          <span class="pill">${p.pct}% concluído</span>
          ${p.done ? '<span class="pill" style="color:var(--grn)">✅ módulo dominado</span>' : ""}
        </div>
        ${pdfButtons(m)}
      </div>
      <div class="tabs" id="tabs">
        ${tabs.map(([k, ico, lbl, cnt]) => `<div class="tab ${route.tab === k ? "active" : ""}" data-tab="${k}">${ico} ${lbl}${cnt != null ? ` <span class="cnt">${cnt}</span>` : ""}</div>`).join("")}
      </div>
      <div id="tabPane" class="fade-in"></div>`;
    $$("#tabs .tab").forEach((t) => t.addEventListener("click", () => go(`#mod/${m.id}/${t.dataset.tab}`)));
    const pane = $("#tabPane");
    const tab = route.tab;
    if (tab === "conteudo") paneContent(m, pane);
    else if (tab === "pontos") panePontos(m, pane);
    else if (tab === "flashcards") paneFlashcards(m, pane);
    else if (tab === "quiz") paneQuiz(m, pane);
    else if (tab === "exercicios") paneExercicios(m, pane);
  }

  function paneContent(m, pane) {
    const div = document.createElement("div");
    div.className = "md";
    pane.appendChild(div);
    renderMarkdown(div, m.markdown);
    const st = ms(m.id);
    if (!st.read) { st.read = true; save(); renderSidebar(); addXP(5); toast("xp", "📖", "+5 XP", "Conteúdo aberto pela primeira vez"); checkAchievements(); }
  }

  function panePontos(m, pane) {
    if (!m.keyPoints.length) return pane.innerHTML = empty("Sem pontos-chave neste módulo.");
    pane.innerHTML = `<div class="kp-list">${m.keyPoints.map((k, i) => `<div class="kp"><div class="kp-num">${i + 1}</div><p>${inlineMd(k)}</p></div>`).join("")}</div>`;
  }

  /* ------- Flashcards (componente) ------- */
  function paneFlashcards(m, pane) { flashDeck(m, pane, m.flashcards, "mod"); }
  function flashDeck(m, pane, cards, scope) {
    if (!cards.length) return pane.innerHTML = empty("Sem flashcards.");
    let i = 0, flipped = false;
    pane.innerHTML = `
      <div class="fc-stage">
        <div class="fc-progress"><span id="fcPos"></span><div class="bar"><i id="fcBar"></i></div><span id="fcKnown"></span></div>
        <div class="flashcard" id="fcard">
          <div class="flashcard-inner">
            <div class="fc-face fc-front"><div class="fc-tag">Pergunta</div><div class="fc-q" id="fcFront"></div><div class="fc-hint">clique para virar ↻</div></div>
            <div class="fc-face fc-back"><div class="fc-tag">Resposta</div><div class="fc-a" id="fcBack"></div><div class="fc-hint">clique para virar ↻</div></div>
          </div>
        </div>
        <div class="fc-state" id="fcState"></div>
        <div class="fc-controls">
          <button class="btn btn-sm" id="fcPrev">‹ Anterior</button>
          <button class="btn btn-sm fc-known" id="fcKnow">✓ Já sei</button>
          <button class="btn btn-sm btn-ghost" id="fcReview">↻ Revisar</button>
          <button class="btn btn-sm" id="fcNext">Próximo ›</button>
        </div>
      </div>`;
    const card = $("#fcard", pane);
    const draw = () => {
      const c = cards[i];
      flipped = false; card.classList.remove("flipped");
      $("#fcFront", pane).innerHTML = inlineMd(c.front);
      $("#fcBack", pane).innerHTML = inlineMd(c.back);
      $("#fcPos", pane).textContent = `${i + 1}/${cards.length}`;
      $("#fcBar", pane).style.width = ((i + 1) / cards.length * 100) + "%";
      const st = ms(m.id);
      const key = scope + ":" + (c._k != null ? c._k : i);
      const known = st.fc[key] === "known";
      $("#fcState", pane).innerHTML = known ? '<span style="color:var(--grn)">✓ você marcou como dominado</span>' : "&nbsp;";
      $("#fcKnown", pane).textContent = `🎴 ${countFC()} dominados`;
    };
    card.addEventListener("click", () => { flipped = !flipped; card.classList.toggle("flipped", flipped); blip("flip"); });
    $("#fcPrev", pane).addEventListener("click", () => { i = (i - 1 + cards.length) % cards.length; draw(); });
    $("#fcNext", pane).addEventListener("click", () => { i = (i + 1) % cards.length; draw(); });
    $("#fcReview", pane).addEventListener("click", () => { const c = cards[i]; const st = ms(m.id); const key = scope + ":" + (c._k != null ? c._k : i); delete st.fc[key]; save(); draw(); renderSidebar(); });
    $("#fcKnow", pane).addEventListener("click", (e) => {
      const c = cards[i]; const st = ms(m.id); const key = scope + ":" + (c._k != null ? c._k : i);
      if (st.fc[key] !== "known") { st.fc[key] = "known"; save(); addXP(5, e); blip("ok"); renderSidebar(); checkAchievements(); }
      draw();
      if (i < cards.length - 1) { i++; draw(); }
    });
    draw();
  }

  /* ------- Quiz (componente) ------- */
  function paneQuiz(m, pane) { quizRunner(pane, m.quiz, { scope: "mod", mod: m }); }
  function quizRunner(pane, questions, opts) {
    if (!questions.length) return pane.innerHTML = empty("Sem questões.");
    let i = 0, correct = 0, answered = false, picks = [];
    const N = questions.length;
    const shell = document.createElement("div");
    shell.className = "quiz-wrap";
    pane.appendChild(shell);
    function drawQ() {
      answered = false;
      const q = questions[i];
      shell.innerHTML = `
        <div class="quiz-bar"><span>Questão ${i + 1}/${N}</span><div class="bar"><i style="width:${(i / N * 100)}%"></i></div><span>✔ ${correct}</span></div>
        <div class="quiz-q"><span class="qn">${i + 1}.</span>${inlineMd(q.question)}</div>
        <div id="opts"></div>
        <div id="postq"></div>`;
      const optsEl = $("#opts", shell);
      q.options.forEach((opt, idx) => {
        const b = document.createElement("button");
        b.className = "opt"; b.innerHTML = `<span class="key">${String.fromCharCode(65 + idx)}</span><span>${inlineMd(opt)}</span>`;
        b.addEventListener("click", (e) => pick(idx, e));
        optsEl.appendChild(b);
      });
    }
    function pick(idx, e) {
      if (answered) return;
      answered = true; picks[i] = idx;
      const q = questions[i];
      const ok = idx === q.answer;
      if (ok) correct++;
      $$("#opts .opt", shell).forEach((b, k) => {
        b.disabled = true;
        if (k === q.answer) b.classList.add("correct");
        else if (k === idx) b.classList.add("wrong");
        else b.classList.add("dim");
      });
      if (ok) { addXP(10, e); addPoints(5); blip("ok"); }
      else { addXP(2); blip("no"); }
      const post = $("#postq", shell);
      post.innerHTML = `
        <div class="explain"><span class="feedback ${ok ? "ok" : "no"}">${ok ? "✔ Correto!" : "✗ Quase!"}</span> &nbsp;${q.explanation ? "<b>Por quê:</b> " + inlineMd(q.explanation) : ""}</div>
        <div class="quiz-foot"><span class="muted">${ok ? "+10 XP · +5 ⭐" : "+2 XP"}</span><button class="btn btn-primary" id="qNext">${i < N - 1 ? "Próxima ›" : "Ver resultado 🏁"}</button></div>`;
      $("#qNext", shell).addEventListener("click", () => { if (i < N - 1) { i++; drawQ(); } else finish(); });
    }
    function finish() {
      const pct = Math.round(correct / N * 100);
      let emoji = "😺", msg = "Continue praticando!";
      if (pct === 100) { emoji = "🏆"; msg = "Perfeito! Gabaritou!"; }
      else if (pct >= 80) { emoji = "🌟"; msg = "Excelente desempenho!"; }
      else if (pct >= 60) { emoji = "👍"; msg = "Bom trabalho!"; }
      else if (pct >= 40) { emoji = "📚"; msg = "Revise e tente de novo."; }
      else { emoji = "🌱"; msg = "Todo mestre começou assim."; }
      if (opts.scope === "mod") {
        const st = ms(opts.mod.id);
        const prev = st.quizBest || 0;
        if (pct > prev) { st.quizBest = pct; save(); renderSidebar(); }
        if (pct === 100) toast("ach", "🏆", "Quiz perfeito!", `${opts.mod.title}: 100%`);
      } else if (opts.scope === "sim" && pct >= 80) {
        if (pct === 100) S.ach.simulado100 = true;
        S.ach.simuladoPass = true; save();
      }
      if (pct >= 80) confetti();
      checkAchievements();
      shell.innerHTML = `
        <div class="result pop">
          <div class="emoji">${emoji}</div>
          ${ring(pct)}
          <div class="big" style="margin-top:6px">${correct}/${N}</div>
          <div class="sub">${msg}</div>
          <div class="muted" style="margin:6px 0 18px">Você acertou ${pct}% das questões.</div>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            <button class="btn btn-primary" id="qRetry">↻ Refazer</button>
            ${opts.scope === "mod" ? `<button class="btn" id="qBack">Voltar ao módulo</button>` : `<button class="btn" id="qHome">Início</button>`}
          </div>
        </div>`;
      const rb = $("#qRetry", shell);
      rb.addEventListener("click", () => { i = 0; correct = 0; picks = []; if (opts.reshuffle) opts.reshuffle(); drawQ(); });
      const qb = $("#qBack", shell); if (qb) qb.addEventListener("click", () => go(`#mod/${opts.mod.id}/conteudo`));
      const qh = $("#qHome", shell); if (qh) qh.addEventListener("click", () => go("#home"));
    }
    drawQ();
  }

  /* ------- Exercícios ------- */
  function paneExercicios(m, pane) {
    if (!m.exercises.length) return pane.innerHTML = empty("Sem exercícios.");
    const wrap = document.createElement("div");
    pane.appendChild(wrap);
    m.exercises.forEach((ex, idx) => {
      const st = ms(m.id);
      const done = !!st.exDone[idx];
      const el = document.createElement("div");
      el.className = "ex";
      el.innerHTML = `
        <div class="ex-head"><span class="ex-ico">${done ? "✅" : "✍️"}</span><span class="ex-title">${esc(ex.title || "Exercício " + (idx + 1))}</span><span class="ex-chev">▶</span></div>
        <div class="ex-body">
          <div class="ex-prompt">${inlineMd(ex.prompt || "")}</div>
          <div class="ex-solwrap"></div>
        </div>`;
      const head = $(".ex-head", el), body = $(".ex-body", el), solw = $(".ex-solwrap", el);
      head.addEventListener("click", () => el.classList.toggle("open"));
      const sol = document.createElement("div");
      sol.innerHTML = `<button class="btn btn-sm btn-primary" data-x="reveal">🔍 Ver resolução</button>`;
      solw.appendChild(sol);
      sol.querySelector("[data-x=reveal]").addEventListener("click", (e) => {
        const md = document.createElement("div"); md.className = "ex-sol md";
        md.innerHTML = `<h5>Resolução</h5>`;
        const body2 = document.createElement("div");
        renderMarkdown(body2, ex.solution || "_(sem resolução)_");
        md.appendChild(body2);
        if (ex.answer) md.innerHTML += `<div class="ex-ans"><b>Resposta:</b> ${inlineMd(ex.answer)}</div>`;
        solw.innerHTML = ""; solw.appendChild(md);
        const st = ms(m.id);
        if (!st.exDone[idx]) { st.exDone[idx] = true; save(); $(".ex-ico", el).textContent = "✅"; addXP(8, e); blip("ok"); renderSidebar(); checkAchievements(); }
      });
      wrap.appendChild(el);
    });
  }

  /* ------------------------------------------------------- VIEW: SIMULADO */
  function viewSimulado() {
    const mods = filteredMods();
    const totalQ = mods.reduce((n, m) => n + m.quiz.length, 0);
    main.innerHTML = `
      <div class="page-head fade-in">
        <h1>🎯 Simulado Geral</h1>
        <div class="muted" style="max-width:70ch;margin-bottom:12px">Uma seleção aleatória de questões. Ótimo para testar seu conhecimento geral. Pronto?</div>
        ${evalFilterBar()}
      </div>
      <div id="simHost" class="fade-in"></div>`;
    bindEvalFilter(() => viewSimulado());
    const host = $("#simHost");
    const SIZE = Math.min(15, totalQ);
    function build() {
      const pool = [];
      mods.forEach((m) => m.quiz.forEach((q) => pool.push({ q, mod: m.title })));
      shuffle(pool);
      return pool.slice(0, SIZE).map((x) => ({ question: `*(${x.mod})* ${x.q.question}`, options: x.q.options, answer: x.q.answer, explanation: x.q.explanation }));
    }
    let questions = build();
    host.innerHTML = `<div class="card" style="text-align:center">
      <div style="font-size:46px">🧠</div>
      <h3 style="margin:8px 0">${SIZE} questões aleatórias</h3>
      <p class="muted">Acerte ≥ 80% para a conquista <b>Simulado Mestre</b>.</p>
      <button class="btn btn-primary" id="simStart">▶ Iniciar simulado</button>
    </div>`;
    $("#simStart").addEventListener("click", () => {
      host.innerHTML = "";
      quizRunner(host, questions, { scope: "sim", reshuffle: () => { questions.length = 0; build().forEach((q) => questions.push(q)); } });
    });
  }

  /* ---------------------------------------------------- VIEW: CARDS GERAIS */
  function viewCards() {
    const mods = filteredMods();
    const totalFc = mods.reduce((n, m) => n + m.flashcards.length, 0);
    main.innerHTML = `
      <div class="page-head fade-in">
        <h1>🎴 Flashcards Gerais</h1>
        <div class="muted" style="margin-bottom:12px">${totalFc} flashcards · vire, teste-se e marque os que já domina.</div>
        ${evalFilterBar()}
      </div>
      <div id="cardsHost" class="fade-in"></div>`;
    bindEvalFilter(() => viewCards());
    const all = [];
    mods.forEach((m) => m.flashcards.forEach((c, idx) => all.push(Object.assign({ _k: idx, _mod: m.id }, c))));
    shuffle(all);
    // usa um "módulo virtual" para escopo de gravação por módulo de origem
    const host = $("#cardsHost");
    if (!all.length) { host.innerHTML = empty("Sem flashcards."); return; }
    let i = 0, flipped = false;
    host.innerHTML = `
      <div class="fc-stage">
        <div class="fc-progress"><span id="fcPos"></span><div class="bar"><i id="fcBar"></i></div><span id="fcKnown"></span></div>
        <div class="flashcard" id="fcard"><div class="flashcard-inner">
          <div class="fc-face fc-front"><div class="fc-tag" id="fcTag">Pergunta</div><div class="fc-q" id="fcFront"></div><div class="fc-hint">clique para virar ↻</div></div>
          <div class="fc-face fc-back"><div class="fc-tag">Resposta</div><div class="fc-a" id="fcBack"></div><div class="fc-hint">clique para virar ↻</div></div>
        </div></div>
        <div class="fc-state" id="fcState"></div>
        <div class="fc-controls">
          <button class="btn btn-sm" id="fcPrev">‹ Anterior</button>
          <button class="btn btn-sm fc-known" id="fcKnow">✓ Já sei</button>
          <button class="btn btn-sm btn-ghost" id="fcReview">↻ Revisar</button>
          <button class="btn btn-sm" id="fcNext">Próximo ›</button>
        </div>
      </div>`;
    const card = $("#fcard", host);
    const draw = () => {
      const c = all[i]; flipped = false; card.classList.remove("flipped");
      const mod = byId(c._mod);
      $("#fcTag", host).textContent = mod ? mod.title : "Pergunta";
      $("#fcFront", host).innerHTML = inlineMd(c.front);
      $("#fcBack", host).innerHTML = inlineMd(c.back);
      $("#fcPos", host).textContent = `${i + 1}/${all.length}`;
      $("#fcBar", host).style.width = ((i + 1) / all.length * 100) + "%";
      const st = ms(c._mod); const known = st.fc["mod:" + c._k] === "known";
      $("#fcState", host).innerHTML = known ? '<span style="color:var(--grn)">✓ dominado</span>' : "&nbsp;";
      $("#fcKnown", host).textContent = `🎴 ${countFC()} dominados`;
    };
    card.addEventListener("click", () => { flipped = !flipped; card.classList.toggle("flipped", flipped); blip("flip"); });
    $("#fcPrev", host).addEventListener("click", () => { i = (i - 1 + all.length) % all.length; draw(); });
    $("#fcNext", host).addEventListener("click", () => { i = (i + 1) % all.length; draw(); });
    $("#fcReview", host).addEventListener("click", () => { const c = all[i]; const st = ms(c._mod); delete st.fc["mod:" + c._k]; save(); draw(); renderSidebar(); });
    $("#fcKnow", host).addEventListener("click", (e) => {
      const c = all[i]; const st = ms(c._mod);
      if (st.fc["mod:" + c._k] !== "known") { st.fc["mod:" + c._k] = "known"; save(); addXP(5, e); blip("ok"); renderSidebar(); checkAchievements(); }
      if (i < all.length - 1) { i++; } draw();
    });
    draw();
  }

  /* ---------------------------------------------------- VIEW: TIMELINE */
  function viewTimeline() {
    const mods = filteredMods();
    main.innerHTML = `
      <div class="page-head fade-in">
        <h1>📅 Linha do Tempo</h1>
        <div class="muted" style="margin-bottom:12px">Conteúdo do curso em ordem cronológica. Clique nos botões de PDF para abrir o material original em nova aba.</div>
        ${evalFilterBar()}
      </div>
      <div class="timeline fade-in" id="tlRoot"></div>`;
    bindEvalFilter(() => viewTimeline());

    const root = $("#tlRoot");
    let lastEval = null;
    mods.forEach((m, idx) => {
      if (m.eval !== lastEval) {
        lastEval = m.eval;
        const div = document.createElement("div");
        div.className = "tl-group-label";
        div.innerHTML = m.eval === "A2"
          ? `<span class="eval-badge eval-badge-a2">A2</span> Segunda Avaliação`
          : `<span class="eval-badge eval-badge-a1">A1</span> Primeira Avaliação`;
        root.appendChild(div);
      }

      const p = moduleProgress(m.id);
      const item = document.createElement("div");
      item.className = "tl-item fade-in";
      item.innerHTML = `
        <div class="tl-dot ${p.done ? "done" : p.pct > 0 ? "partial" : ""}"></div>
        <div class="tl-line"></div>
        <div class="tl-card">
          <div class="tl-card-head">
            <span class="tl-num">${String(m.module).padStart(2,"0")}</span>
            <span class="tl-ico">${m.icon}</span>
            <div class="tl-card-title">
              <strong>${esc(m.title)}</strong>
              <span class="eval-badge eval-badge-${m.eval === "A2" ? "a2" : "a1"}">${m.eval}</span>
            </div>
            <button class="btn btn-sm tl-study-btn" data-id="${m.id}">📖 Estudar</button>
          </div>
          <p class="tl-summary">${esc(m.summary)}</p>
          <div class="tl-meta">
            <span>🎴 ${m.flashcards.length} fc</span>
            <span>❓ ${m.quiz.length} quiz</span>
            <span>✍️ ${m.exercises.length} ex</span>
            <span class="tl-pct">${p.pct}%</span>
          </div>
          ${m.pdfs && m.pdfs.length ? `<div class="pdf-btns tl-pdfs">${m.pdfs.map((pdf) =>
            `<a class="btn btn-sm pdf-btn" href="pdfs/${pdf.file}" target="_blank" rel="noopener">📄 ${esc(pdf.label)}</a>`
          ).join("")}</div>` : ""}
        </div>`;
      item.querySelector(".tl-study-btn").addEventListener("click", () => go(`#mod/${m.id}`));
      root.appendChild(item);
    });
  }

  /* -------------------------------------------------------------- SEARCH */
  function highlight(text, q) {
    const s = esc(String(text || ""));
    if (!q) return s;
    const re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return s.replace(re, "<mark>$1</mark>");
  }
  function viewSearch() {
    main.innerHTML = `
      <div class="page-head fade-in">
        <h1>🔍 Busca</h1>
        <div class="muted">Pesquise em módulos, flashcards, quizzes e exercícios. Atalho: <kbd>Ctrl+K</kbd></div>
      </div>
      <div class="search-wrap fade-in">
        <input class="search-input" id="searchInput" type="search"
          placeholder="Digite um termo… ex: autômato, δ, pilha, gramática"
          autocomplete="off" spellcheck="false" />
      </div>
      <div id="searchResults"></div>`;
    const input = $("#searchInput");
    input.focus();
    let timer;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => renderSearchResults(input.value.trim(), $("#searchResults")), 180);
    });
  }
  function renderSearchResults(q, container) {
    if (!q) { container.innerHTML = ""; return; }
    const term = q.toLowerCase();
    const modR = [], fcR = [], qzR = [], exR = [];
    MODS.forEach((m) => {
      const inMod = m.title.toLowerCase().includes(term) || m.summary.toLowerCase().includes(term) ||
        m.tags.some((t) => t.toLowerCase().includes(term)) ||
        m.keyPoints.some((k) => k.toLowerCase().includes(term));
      if (inMod) {
        const snippet = m.keyPoints.find((k) => k.toLowerCase().includes(term)) || m.summary;
        modR.push({ m, snippet: String(snippet).slice(0, 200) });
      }
      m.flashcards.forEach((fc, idx) => {
        if (fc.front.toLowerCase().includes(term) || fc.back.toLowerCase().includes(term))
          fcR.push({ fc, idx, m });
      });
      m.quiz.forEach((qz, idx) => {
        if (qz.question.toLowerCase().includes(term) || (qz.explanation || "").toLowerCase().includes(term))
          qzR.push({ qz, idx, m });
      });
      m.exercises.forEach((ex, idx) => {
        if ((ex.title || "").toLowerCase().includes(term) || (ex.prompt || "").toLowerCase().includes(term))
          exR.push({ ex, idx, m });
      });
    });
    const total = modR.length + fcR.length + qzR.length + exR.length;
    if (!total) {
      container.innerHTML = `<div class="search-empty"><div>🔍</div><p>Nenhum resultado para <b>${esc(q)}</b></p><p class="muted">Tente outro termo.</p></div>`;
      return;
    }
    function group(ico, label, items, mapper) {
      if (!items.length) return "";
      const shown = items.slice(0, 8);
      const more = items.length - shown.length;
      return `<div class="search-group">
        <h3 class="search-group-title">${ico} ${label} <span class="cnt">${items.length}</span></h3>
        ${shown.map(mapper).join("")}
        ${more ? `<div class="search-more">+${more} item${more !== 1 ? "s" : ""} — refine o termo para ver mais.</div>` : ""}
      </div>`;
    }
    let html = `<p class="search-summary">${total} resultado${total !== 1 ? "s" : ""} para <b>${esc(q)}</b></p>`;
    html += group("📚", "Módulos", modR, ({ m, snippet }) =>
      `<div class="search-item" data-h="#mod/${m.id}">
        <span class="search-item-ico">${m.icon}</span>
        <div class="search-item-body">
          <div class="search-item-title">${highlight(m.title, q)}</div>
          <div class="search-item-sub">${highlight(snippet, q)}</div>
          <div class="search-item-tags">${m.tags.slice(0, 5).map((t) => `<span class="tag">#${esc(t)}</span>`).join("")}</div>
        </div><span class="search-item-arr">›</span></div>`
    );
    html += group("🎴", "Flashcards", fcR, ({ fc, m }) =>
      `<div class="search-item" data-h="#mod/${m.id}/flashcards">
        <span class="search-item-ico">🎴</span>
        <div class="search-item-body">
          <div class="search-item-title">${highlight(fc.front, q)}</div>
          <div class="search-item-sub">${highlight(fc.back.slice(0, 180), q)}</div>
          <div class="search-item-mod">${esc(m.title)}</div>
        </div><span class="search-item-arr">›</span></div>`
    );
    html += group("❓", "Quiz", qzR, ({ qz, m }) =>
      `<div class="search-item" data-h="#mod/${m.id}/quiz">
        <span class="search-item-ico">❓</span>
        <div class="search-item-body">
          <div class="search-item-title">${highlight(qz.question.slice(0, 160), q)}</div>
          <div class="search-item-mod">${esc(m.title)}</div>
        </div><span class="search-item-arr">›</span></div>`
    );
    html += group("✍️", "Exercícios", exR, ({ ex, m }) =>
      `<div class="search-item" data-h="#mod/${m.id}/exercicios">
        <span class="search-item-ico">✍️</span>
        <div class="search-item-body">
          <div class="search-item-title">${highlight(ex.title || "Exercício", q)}</div>
          <div class="search-item-sub">${highlight((ex.prompt || "").slice(0, 160), q)}</div>
          <div class="search-item-mod">${esc(m.title)}</div>
        </div><span class="search-item-arr">›</span></div>`
    );
    container.innerHTML = html;
    $$(".search-item[data-h]", container).forEach((el) =>
      el.addEventListener("click", () => go(el.dataset.h))
    );
  }

  /* --------------------------------------------------------------- UTILS */
  function inlineMd(s) {
    // Markdown inline simples e seguro (negrito, itálico, código). Escapa HTML antes.
    let t = esc(s == null ? "" : s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    t = t.replace(/\n/g, "<br>");
    return t;
  }
  function empty(msg) { return `<div class="empty"><div class="big">🗒️</div>${esc(msg)}</div>`; }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ----------------------------------------------------------- NAV / UI */
  function openNav() { document.body.classList.add("nav-open"); }
  function closeNav() { document.body.classList.remove("nav-open"); }
  $("#menuBtn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("#backdrop").addEventListener("click", closeNav);
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault(); go("#search");
      setTimeout(() => { const inp = $("#searchInput"); if (inp) inp.focus(); }, 80);
    }
  });
  $("#searchBtn").addEventListener("click", () => go("#search"));
  $("#soundBtn").addEventListener("click", () => { S.settings.sound = !S.settings.sound; save(); updateHUD(); if (S.settings.sound) blip("ok"); toast("xp", S.settings.sound ? "🔊" : "🔈", "Som " + (S.settings.sound ? "ativado" : "desativado"), ""); });
  $("#resetBtn").addEventListener("click", () => {
    if (confirm("Zerar TODO o seu progresso (XP, níveis, flashcards, quizzes, conquistas)? Esta ação não pode ser desfeita.")) {
      S = defaultState(); save(); touchStreak(); render(); toast("xp", "↺", "Progresso zerado", "Bons estudos do começo!");
    }
  });

  /* --------------------------------------------------------------- INIT */
  route = parseHash();
  updateHUD();
  touchStreak();
  render();
  console.log("%cATC Estudo Interativo", "color:#8b5cf6;font-weight:bold;font-size:14px", "· módulos:", MODS.length);
})();
