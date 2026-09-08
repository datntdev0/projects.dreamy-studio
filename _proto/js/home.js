(function () {
  "use strict";

  const A = window.DSApp;
  const { esc, ic } = A;
  const PJ = window.PJ;
  const NV = window.NV;
  const LB = window.LB;
  const DT = window.DT;

  const RECENT_LIMIT = 3;
  const ACTIVITY_LIMIT = 6;
  const NOVEL_LIMIT = 4;

  const projects = () => PJ.state.projects;
  const liveProjects = () => projects().filter((p) => !p.archived);
  const byRecent = (key) => (a, b) => String(b[key]).localeCompare(String(a[key]));
  const shortDate = (s) => String(s || "").slice(5, 16).replace("-", "/");

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  function hero() {
    const ws = A.S.workspace;
    return `<header class="hm-hero" data-testid="home-hero">
      <div class="hm-hero-text">
        <span class="eyebrow">${esc(greeting())}</span>
        <h1 class="t-display-md" data-testid="home-workspace-name">${esc(ws.name)}</h1>
        <button class="hm-path path" data-act="switch-workspace" data-tip="Switch workspace">${ic("hdd")}<span>${esc(ws.path)}</span>${ic("swap")}</button>
      </div>
      <div class="hm-hero-acts">
        <button class="btn btn-primary" data-act="pj-new" data-testid="home-new-project">${ic("plus")}New project</button>
        <button class="btn" data-act="rail-open" data-v="novels" data-id="novels">${ic("book")}Novels</button>
        <button class="btn" data-act="rail-open" data-v="library" data-id="images">${ic("library")}Library</button>
      </div>
    </header>`;
  }

  function stat({ icon, label, value, note, warn, rail, id, testid }) {
    return `<button class="card hm-stat" data-act="rail-open" data-v="${rail}" data-id="${id}" data-testid="${testid}">
      <span class="hm-stat-top">${ic(icon)}<span class="eyebrow">${esc(label)}</span></span>
      <span class="hm-stat-val t-display-sm">${esc(value)}</span>
      <span class="hm-stat-note t-sm ${warn ? "is-warn" : ""}">${warn ? ic("alert") : ""}${esc(note)}</span>
    </button>`;
  }

  function stats() {
    const live = liveProjects();
    const doing = live.filter((p) => PJ.statusOf(p) === "active").length;
    const novels = NV.state.novels;
    const chapters = novels.reduce((a, n) => a + n.chapters, 0);
    const assets = LB.state.assets.length;
    const voices = LB.state.voices.filter((v) => v.status === "ready").length;
    const channels = DT.state.channels;
    const expired = channels.filter((c) => c.status !== "ok").length;
    return `<section class="hm-stats" aria-label="Workspace at a glance">
      ${stat({ icon: "folder", label: "Projects", value: live.length, note: `${doing} in progress`, rail: "projects", id: "projects", testid: "home-stat-projects" })}
      ${stat({ icon: "book", label: "Novels", value: novels.length, note: `${chapters} chapters`, rail: "novels", id: "novels", testid: "home-stat-novels" })}
      ${stat({ icon: "library", label: "Library", value: assets, note: `${voices} voices ready`, rail: "library", id: "images", testid: "home-stat-library" })}
      ${stat({ icon: "globe", label: "Channels", value: channels.length, note: expired ? `${expired} need reconnecting` : "All connected", warn: expired > 0, rail: "distribution", id: "channels", testid: "home-stat-channels" })}
    </section>`;
  }

  function sectionHead(title, act = "") {
    return `<header class="hm-sec-head"><h2 class="eyebrow">${esc(title)}</h2><span class="spacer"></span>${act}</header>`;
  }

  function moduleDots(p) {
    return p.modules.map((m) => {
      const state = p.prog[m]?.state || "idle";
      return `<span class="hm-mod hm-mod-${state}" title="${esc(`${PJ.MODULES[m].label} · ${PJ.MOD_STATE[state][0]}`)}">${ic(PJ.MODULES[m].icon)}</span>`;
    }).join("");
  }

  function projectRow(p) {
    const pct = PJ.percent(p);
    const [label, cls] = PJ.STATUS[PJ.statusOf(p)];
    const tpl = PJ.TEMPLATES[p.template] || PJ.TEMPLATES.blank;
    return `<button class="hm-proj" data-act="pj-open" data-id="${p.id}" data-testid="home-recent-project">
      <span class="hm-proj-ico">${ic(tpl.icon)}</span>
      <span class="hm-proj-main">
        <span class="hm-proj-title"><span class="hm-proj-name">${esc(p.name)}</span><span class="badge ${cls}">${esc(label)}</span></span>
        <span class="hm-proj-desc t-sm">${esc(p.desc || tpl.blurb)}</span>
        <span class="hm-proj-meta"><span class="hm-mods">${moduleDots(p)}</span><span class="spacer"></span><span class="t-sm t-mute mono">${esc(shortDate(p.opened))}</span></span>
        <span class="hm-proj-pg"><span class="progress ${pct === 100 ? "is-done" : ""}"><i style="width:${pct}%"></i></span><span class="mono t-sm">${pct}%</span></span>
      </span>
    </button>`;
  }

  function recentProjects() {
    const list = [...liveProjects()].sort(byRecent("opened")).slice(0, RECENT_LIMIT);
    const all = `<button class="btn btn-ghost btn-sm" data-act="rail-open" data-v="projects" data-id="projects">View all${ic("chev-r")}</button>`;
    const body = list.length
      ? `<div class="hm-proj-list">${list.map(projectRow).join("")}</div>`
      : `<div class="card hm-empty"><p class="t-sm t-mute">No projects yet. Start from a template below.</p></div>`;
    return `<section class="hm-sec" data-testid="home-recent">${sectionHead("Continue where you left off", all)}${body}</section>`;
  }

  function novelCard(n) {
    const cover = n.coverImg
      ? `<img src="${esc(n.coverImg)}" alt="" loading="lazy">`
      : `<span class="hm-cover-fb" style="background:linear-gradient(160deg, ${n.cover.join(", ")})"></span>`;
    return `<button class="hm-novel" data-act="rail-open" data-v="novels" data-id="novels" title="${esc(n.title)}">
      <span class="hm-cover" style="background:linear-gradient(160deg, ${n.cover.join(", ")})">${cover}<span class="badge">${esc(n.lang)}</span></span>
      <span class="hm-novel-title t-sm">${esc(n.display || n.title)}</span>
      <span class="t-sm t-mute">${esc(n.author)} · ${n.chapters} ch</span>
    </button>`;
  }

  function novels() {
    const list = [...NV.state.novels].sort(byRecent("updated")).slice(0, NOVEL_LIMIT);
    const all = `<button class="btn btn-ghost btn-sm" data-act="rail-open" data-v="novels" data-id="novels">View all${ic("chev-r")}</button>`;
    return `<section class="hm-sec" data-testid="home-novels">${sectionHead("Recent novels", all)}<div class="hm-novels">${list.map(novelCard).join("")}</div></section>`;
  }

  function projectIssues() {
    return liveProjects().flatMap((p) => p.attention.map((a) => ({
      level: a.level, text: a.text, source: `${p.name} · ${PJ.MODULES[a.module]?.label || ""}`, act: `data-act="pj-mod" data-id="${p.id}" data-m="${a.module}"`,
    })));
  }

  function channelIssues() {
    return DT.state.channels.filter((c) => c.status !== "ok").map((c) => ({
      level: "warn", text: `The sign-in for ${c.name} (${c.handle}) has expired. Reconnect it before publishing.`, source: "Distribution · Channels", act: `data-act="rail-open" data-v="distribution" data-id="channels"`,
    }));
  }

  function packageIssues() {
    return DT.state.packages.filter((k) => ["partial", "failed"].includes(k.status)).map((k) => ({
      level: "danger", text: `“${k.title}” was not published to every channel.`, source: "Distribution · Packages", act: `data-act="rail-open" data-v="distribution" data-id="packages"`,
    }));
  }

  function modelIssues() {
    return Object.values(LB.state.tts.models).filter((m) => m.status === "error").map((m) => ({
      level: "danger", text: m.error, source: "Settings · Local TTS", act: `data-act="settings" data-v="tts"`,
    }));
  }

  const LEVEL_RANK = { danger: 0, warn: 1, info: 2 };
  const LEVEL_DOT = { danger: "dot-danger", warn: "dot-warning", info: "dot-info" };

  function issueRow(i) {
    return `<button class="hm-issue" ${i.act} data-testid="home-attention-item">
      <span class="dot ${LEVEL_DOT[i.level]}"></span>
      <span class="hm-issue-main"><span class="t-sm">${esc(i.text)}</span><span class="t-sm t-mute">${esc(i.source)}</span></span>
      ${ic("chev-r")}
    </button>`;
  }

  function attention() {
    const list = [...packageIssues(), ...modelIssues(), ...channelIssues(), ...projectIssues()].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
    const count = list.length ? `<span class="badge badge-warning">${list.length}</span>` : "";
    const body = list.length
      ? `<div class="hm-issues">${list.map(issueRow).join("")}</div>`
      : `<div class="hm-ok t-sm">${ic("check-circle")}Everything is up to date.</div>`;
    return `<section class="card hm-panel" data-testid="home-attention">${sectionHead("Needs attention", count)}${body}</section>`;
  }

  function activityRow([at, text, project]) {
    return `<li class="hm-act-row"><span class="hm-act-dot"></span>
      <span class="hm-act-main"><span class="t-sm">${esc(text)}</span><span class="t-sm t-mute">${esc(project)} · <span class="mono">${esc(shortDate(at))}</span></span></span></li>`;
  }

  function activity() {
    const list = projects().flatMap((p) => p.activity.map(([at, text]) => [at, text, p.name])).sort((a, b) => b[0].localeCompare(a[0])).slice(0, ACTIVITY_LIMIT);
    return `<section class="card hm-panel" data-testid="home-activity">${sectionHead("Recent activity")}<ul class="hm-act">${list.map(activityRow).join("")}</ul></section>`;
  }

  function templateCard([id, t]) {
    const mods = t.modules.length ? t.modules.map((m) => PJ.MODULES[m].label).join(" · ") : "Pick modules yourself";
    return `<button class="card hm-tpl" data-act="pj-new" data-v="${id}" data-testid="home-template">
      <span class="hm-tpl-ico">${ic(t.icon)}</span>
      <span class="hm-tpl-name">${esc(t.label)}</span>
      <span class="t-sm t-mute">${esc(t.blurb)}</span>
      <span class="hm-tpl-mods mono">${esc(mods)}</span>
    </button>`;
  }

  function templates() {
    return `<section class="hm-sec" data-testid="home-templates">${sectionHead("Start a new project")}<div class="hm-tpls">${Object.entries(PJ.TEMPLATES).map(templateCard).join("")}</div></section>`;
  }

  function render() {
    return `<div class="hm" data-testid="home">
      ${hero()}
      ${stats()}
      <div class="hm-cols">
        <div class="hm-col">${recentProjects()}${novels()}</div>
        <aside class="hm-col">${attention()}${activity()}</aside>
      </div>
      ${templates()}
    </div>`;
  }

  A.VIEWS.home = { render };
})();
