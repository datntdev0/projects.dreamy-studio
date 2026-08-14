(function () {
  const A = window.DSApp;
  const DT = window.DT;
  const U = window.NVU;
  const { esc, ic } = A;
  const CAP = window.DS.CAP["10"];
  const P = DT.PLATFORMS;
  const pad = (n, w = 2) => String(n).padStart(w, "0");

  const st = () => DT.state;
  const ui = () => (DT.ui.ch ||= { sel: null });
  const byId = (id) => DT.chById(id);
  const selected = () => (ui().sel && byId(ui().sel)) || null;
  const pkgsOf = (id) => st().packages.filter((k) => k.targets.some((t) => t.ch === id));
  const visLabel = (c, v) => P[c.platform].vis.find((x) => x[0] === v)?.[1] || v;
  const checking = new Set();

  const avatar = (c, cls = "") => `<span class="dt-av tone-${c.tone % 4} ${cls}">${ic(P[c.platform].icon)}</span>`;
  const chBadges = (c) => {
    const [label, cls] = DT.CH_STATUS[c.status];
    return `<span class="row-badges"><span class="badge ${cls}">${label}</span></span>`;
  };

  function channelsView() {
    const list = st().channels;
    const bad = list.filter((c) => c.status !== "ok").length;
    const rows = list.map((c) => `<tr data-testid="ch-row-${c.id}" tabindex="0" data-act="ch-sel" data-id="${c.id}" class="${ui().sel === c.id ? "is-selected" : ""}">
        <td><div class="nm-title">${avatar(c)}<div><div class="t-ink">${esc(c.name)}</div><div class="t-sm t-mute">${esc(c.handle)}</div></div></div></td>
        <td><span class="type-tag">${ic(P[c.platform].icon)}${esc(P[c.platform].label)}</span></td>
        <td>${checking.has(c.id) ? `<span class="dt-chk"><span class="dot dot-running"></span>Checking…</span>` : chBadges(c)}</td>
        <td class="t-sm">${esc(visLabel(c, c.defaults.vis))}</td>
        <td class="num mono t-mute">${pkgsOf(c.id).length}</td>
        <td class="mono t-mute">${esc(c.lastUsed.slice(0, 10))}</td>
        <td class="row-actions">${c.status === "expired" ? `<button class="btn btn-sm btn-primary" data-testid="ch-reconnect-btn-${c.id}" data-act="ch-reconnect" data-id="${c.id}">${ic("link")}Reconnect</button>` : `<button class="btn btn-sm" data-testid="ch-check-btn-${c.id}" data-act="ch-check" data-id="${c.id}" ${checking.has(c.id) ? "disabled" : ""}>${ic("refresh")}Check</button>`}</td></tr>`).join("");
    const body = list.length
      ? `<table class="table is-nw" data-testid="ch-table"><thead><tr><th>Channel</th><th>Platform</th><th>Status</th><th>Default</th><th class="num">Package</th><th>Last used</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="dt-empty">${U.empty("No channels connected yet", "Connect your YouTube or TikTok account to publish finished videos. You can still prepare packages first.", `<div class="empty-act"><button class="btn btn-primary" data-testid="ch-empty-connect-btn" data-act="ch-connect">${ic("link")}Connect channel</button></div>`)}</div>`;
    const plats = Object.values(P).map((p) => `<div data-testid="ch-platform-${p.key}" class="dt-plat ${p.live ? "" : "is-soon"}">
        <span class="dt-av tone-3">${ic(p.icon)}</span><div class="dt-plat-b"><div class="t-ink">${esc(p.label)}${p.live ? "" : ` <span class="badge badge-info">COMING SOON</span>`}</div><div class="t-sm t-mute">${esc(p.blurb)}</div></div>
        ${p.live ? `<button class="btn btn-sm" data-testid="ch-platform-connect-btn-${p.key}" data-act="ch-connect" data-v="${p.key}">${ic("plus")}Connect</button>` : ""}</div>`).join("");
    return `<div class="nv">
      ${U.bar(`<span class="nv-ttl">${ic("globe")}<span class="t-ink">Distribution channels</span></span><span class="t-sm t-mute">${list.length} channels${bad ? ` · ${bad} need reconnecting` : ""}</span>`,
        `<button class="btn btn-sm" data-testid="ch-check-all-btn" data-act="ch-check-all" ${list.length ? "" : "disabled"}>${ic("refresh")}Check all</button><button class="btn btn-sm btn-primary" data-testid="ch-connect-btn" data-act="ch-connect">${ic("link")}Connect channel</button>`)}
      <div class="nv-body"><div class="nv-scroll" data-keep="ch">${body}
        <section class="dt-sec" data-testid="ch-platforms"><span class="eyebrow">Platform</span><div class="dt-plats">${plats}</div>
          <p class="t-sm t-mute dt-note">${ic("lock")}<span>Dreamy Studio uses each platform’s official sign-in (OAuth). Passwords never pass through the app, tokens are stored encrypted on your machine, and content is only sent when you confirm publishing.</span></p></section></div></div></div>`;
  }

  const field = (label, id, control) => `<div class="field"><label for="${id}">${label}</label>${control}</div>`;
  function channelPanel(c) {
    const p = P[c.platform];
    const kv = [["Platform", esc(p.label)], ["Account", esc(c.account)], ["Connected at", `<span class="mono">${esc(c.connected)}</span>`], ["Checked at", `<span class="mono">${esc(c.checked)}</span>`], ["Last used", `<span class="mono">${esc(c.lastUsed)}</span>`]];
    const d = c.defaults;
    return `<section class="ins-sec dt-ins-top" data-testid="ch-inspector-summary">${avatar(c, "is-lg")}<div class="dt-ins-b"><div class="ins-hero-t">${esc(c.name)}</div><div class="t-sm t-mute">${esc(c.handle)}</div>${chBadges(c)}</div></section>
      ${c.status === "expired" ? `<section class="ins-sec"><div class="ld-warn">${ic("alert")}<span>${esc(c.error)}</span></div><button class="btn btn-primary" data-act="ch-reconnect" data-id="${c.id}">${ic("link")}Reconnect</button></section>` : ""}
      ${U.insSec("Information", U.kv(kv))}
      ${U.insSec("Granted permissions", `<div class="dt-scopes" data-testid="ch-scopes">${c.scopes.map((s) => `<div class="dt-scope"><span class="mono">${esc(s)}</span><span class="t-sm t-mute">${esc(p.scopes.find((x) => x[0] === s)?.[1] || "")}</span></div>`).join("")}</div><span class="field-hint">Only asks for the permissions needed to publish videos. Does not read or delete your existing videos.</span>`)}
      <section class="ins-sec ins-form"><span class="eyebrow">Defaults for new packages</span>
        ${field("Visibility", "ch-d-vis", `<select id="ch-d-vis" data-testid="ch-default-visibility" class="select" data-change="ch-def" data-id="${c.id}" data-f="vis">${U.options(p.vis, d.vis)}</select>`)}
        ${field("Language", "ch-d-lang", `<select id="ch-d-lang" data-testid="ch-default-language" class="select" data-change="ch-def" data-id="${c.id}" data-f="lang">${U.options(DT.LANGS, d.lang)}</select>`)}
        ${c.platform === "youtube" ? field("Category", "ch-d-cat", `<select id="ch-d-cat" data-testid="ch-default-category" class="select" data-change="ch-def" data-id="${c.id}" data-f="cat">${U.options(DT.CATEGORIES, d.cat)}</select>`) : ""}
        <label class="check"><input type="checkbox" data-testid="ch-default-ai" data-change="ch-def" data-id="${c.id}" data-f="ai" ${d.ai ? "checked" : ""}><span>Label content generated or edited by AI</span></label></section>
      ${U.insSec("Package", pkgsOf(c.id).length ? pkgsOf(c.id).map((k) => `<button type="button" class="nm-recent" data-act="pk-open" data-id="${k.id}">${ic("package")}<span class="tree-label">${esc(k.title)}</span>${DT.statusBadge(k)}</button>`).join("") : `<span class="t-sm t-mute">No package targets this channel yet.</span>`)}
      <section class="ins-sec"><span class="field-hint">${ic("key")} Tokens are stored encrypted on this machine (Windows Credential Manager), not shared with anyone else.</span></section>
      <section class="ins-sec ins-actions" data-testid="ch-inspector-actions"><button class="btn" data-testid="ch-inspector-check-btn" data-act="ch-check" data-id="${c.id}" ${checking.has(c.id) ? "disabled" : ""}>${ic("refresh")}Check</button><button class="btn" data-testid="ch-inspector-reconnect-btn" data-act="ch-reconnect" data-id="${c.id}">${ic("link")}Reconnect</button><button class="btn btn-danger" data-testid="ch-disconnect-btn" data-act="ch-disconnect" data-id="${c.id}">${ic("unlink")}Disconnect</button></section>`;
  }
  function overviewPanel() {
    const list = st().channels;
    return `${U.insSec("Distribution channels", U.kv([["Channel", list.length], ["Active", list.filter((c) => c.status === "ok").length], ["Needs reconnecting", list.filter((c) => c.status !== "ok").length], ["Package", st().packages.length]]))}
      <section class="ins-sec"><span class="eyebrow">Connect channel</span><button class="btn btn-block btn-primary" data-act="ch-connect">${ic("link")}Connect channel…</button>
        <span class="field-hint">Choose a channel in the list to see its granted permissions and set defaults for packages.</span></section>
      <section class="ins-sec"><span class="eyebrow">When data leaves the machine</span><p class="t-sm t-mute">Only when you click to confirm publishing. Before that the app only keeps the token to know which account is connected.</p></section>`;
  }
  const inspector = () => (selected() ? channelPanel(selected()) : overviewPanel());

  A.VIEWS.channels = { fill: true, render: channelsView, inspector };

  function check(ids) {
    const todo = ids.filter((id) => byId(id) && !checking.has(id));
    if (!todo.length) return;
    todo.forEach((id) => checking.add(id));
    A.rerender();
    setTimeout(() => {
      todo.forEach((id) => { checking.delete(id); const c = byId(id); if (c) c.checked = A.stamp(); });
      A.rerender();
      A.renderExplorer();
      const bad = todo.map(byId).filter((c) => c && c.status !== "ok");
      A.toast(bad.length ? `${bad.length} channels need reconnecting.` : todo.length === 1 ? `Channel “${byId(todo[0])?.name}” is connected normally.` : `${todo.length} channels are connected normally.`, bad.length ? "warning" : "success");
    }, 800 + todo.length * 150);
  }

  let CN = null;
  const DOMAIN = { youtube: "accounts.google.com", tiktok: "www.tiktok.com" };
  const FOUND = {
    youtube: [["Dreamy Tales", "@dreamytales"], ["Dreamy Tales EN", "@dreamytales-en"], ["Dreamy Kids Stories", "@dreamykids"], ["Quiet Harbor Audio", "@quietharbor"]],
    tiktok: [["quiet.harbor", "@quiet.harbor"]],
  };
  const exists = (handle) => st().channels.some((c) => c.handle === handle);

  function openConnect(o = {}) {
    const re = o.reconnect ? byId(o.reconnect) : null;
    CN = { step: "choose", platform: re ? re.platform : o.platform || "youtube", re: re ? re.id : null, publish: true, picked: new Set(), error: "" };
    drawConnect();
  }
  const scopesFor = () => {
    const p = P[CN.platform];
    return CN.platform === "tiktok" ? p.scopes.filter((s) => s[0] === "user.info.basic" || s[0] === (CN.publish ? "video.publish" : "video.upload")) : p.scopes;
  };

  function drawConnect() {
    const p = P[CN.platform];
    const re = CN.re ? byId(CN.re) : null;
    let body = "";
    let foot = "";
    if (CN.step === "choose") {
      const cards = re ? "" : `<div class="opts">${Object.values(P).filter((x) => x.live).map((x) => `<label class="opt ${CN.platform === x.key ? "is-on" : ""}"><input type="radio" name="cn-p" data-testid="cn-platform-${x.key}" value="${x.key}" ${CN.platform === x.key ? "checked" : ""} data-change="cn-platform"><div class="opt-b"><span class="t-ink pjc-t">${ic(x.icon)}${esc(x.label)}</span><span class="t-sm t-mute">${esc(x.blurb)}</span></div></label>`).join("")}</div>`;
      body = `${re ? `<div class="dt-re">${avatar(re)}<div><div class="t-ink">${esc(re.name)}</div><div class="t-sm t-mute">${esc(re.handle)} · sign in again to grant new permissions</div></div></div>` : ""}${cards}
        <div class="field"><span class="eyebrow">Permissions that will be requested</span><div class="dt-scopes">${scopesFor().map(([s, d]) => `<div class="dt-scope"><span class="mono">${esc(s)}</span><span class="t-sm">${esc(d)}</span></div>`).join("")}</div></div>
        ${CN.platform === "tiktok" ? `<label class="check"><input type="checkbox" data-testid="cn-tiktok-publish" data-change="cn-publish" ${CN.publish ? "checked" : ""}><span>Allow direct posting (<span class="mono">video.publish</span>). Uncheck to only send the video to the drafts inbox on TikTok and post it yourself in the TikTok app.</span></label>
          <div class="ld-warn">${ic("alert")}<span>The TikTok sign-in flow is awaiting an architecture review (the client secret must be kept safe) before direct posting is promised.</span></div>` : ""}
        <ul class="dt-how"><li>The default browser opens the ${esc(p.label)} sign-in page. Passwords do not pass through Dreamy Studio.</li><li>Tokens are stored encrypted on your machine. You can disconnect at any time.</li><li>Content is only sent when you confirm at the publish step.</li></ul>`;
      foot = `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-testid="cn-go-btn" data-act="cn-go">${ic("external")}Continue signing in</button>`;
    } else if (CN.step === "wait") {
      body = `<div class="dt-wait"><span class="dot dot-running"></span><div><div class="t-ink">Waiting for you to sign in and grant permissions in the browser…</div>
          <div class="t-sm t-mute">The app is listening for the response at <span class="path">http://127.0.0.1:53682/callback</span>. Only enter your password on the page <span class="path">${DOMAIN[CN.platform]}</span>.</div></div></div>
        <div class="dt-sim"><span class="eyebrow">Prototype · simulate the outcome</span><div class="empty-act"><button class="btn btn-sm btn-primary" data-testid="cn-sim-ok-btn" data-act="cn-ok">${ic("check")}Permissions granted</button><button class="btn btn-sm" data-testid="cn-sim-deny-btn" data-act="cn-deny">${ic("x")}Denied</button><button class="btn btn-sm" data-testid="cn-sim-timeout-btn" data-act="cn-timeout">${ic("clock")}Timed out</button></div></div>`;
      foot = `<button class="btn" data-act="close-modal">Cancel</button>`;
    } else if (CN.step === "pick") {
      const found = FOUND[CN.platform];
      const free = found.filter(([, h]) => !exists(h));
      body = `<p class="t-sm">Account <span class="path">dreamy•••@gmail.com</span> has ${found.length} ${p.unit}. Choose the ${p.unit} you want to use for publishing.</p>
        <div class="opts">${found.map(([n, h]) => { const dup = exists(h); return `<label class="opt ${dup ? "is-off" : CN.picked.has(h) ? "is-on" : ""}"><input type="checkbox" data-testid="cn-pick-${esc(h)}" data-change="cn-pick" data-h="${esc(h)}" ${dup ? "disabled checked" : CN.picked.has(h) ? "checked" : ""}><div class="opt-b"><span class="t-ink">${esc(n)}</span><span class="t-sm t-mute">${esc(h)}${dup ? " · connected" : ""}</span></div></label>`; }).join("")}</div>
        ${free.length ? "" : `<p class="field-hint">All ${p.unit} of this account are already connected.</p>`}`;
      foot = `<button class="btn" data-testid="cn-retry-btn" data-act="cn-retry">${ic("arrow-left")}Back</button><span class="spacer"></span><button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-testid="cn-add-btn" data-act="cn-add" ${CN.picked.size ? "" : "disabled"}>Add ${CN.picked.size || ""} ${p.unit}</button>`;
    } else {
      body = `<div class="ld-warn">${ic("alert")}<span>${esc(CN.error)}</span></div><p class="t-sm t-mute">Nothing has been saved. You can try again at any time.</p>`;
      foot = `<button class="btn" data-act="close-modal">Close</button><button class="btn btn-primary" data-testid="cn-retry-btn" data-act="cn-retry">${ic("refresh")}Try again</button>`;
    }
    A.modal({ title: re ? `Reconnect ${re.name}` : "Connect channel", eyebrow: CAP, cls: "modal-lg", body, foot, testid: `cn-dialog-${CN.step}` });
  }

  function finishReconnect() {
    const c = byId(CN.re);
    if (!c) { A.closeModal(); return; }
    c.status = "ok";
    delete c.error;
    c.checked = A.stamp();
    ui().sel = c.id;
    CN = null;
    A.closeModal();
    A.renderExplorer();
    A.rerender();
    A.toast(`Reconnected “${c.name}”.`);
  }
  function addChannels(handles) {
    const p = P[CN.platform];
    const now = A.stamp();
    const added = [];
    FOUND[CN.platform].filter(([, h]) => handles.has(h)).forEach(([name, handle]) => {
      const c = {
        id: `CH-${pad(++st().seq.ch)}`, platform: CN.platform, name, handle, account: CN.platform === "youtube" ? "dreamy•••@gmail.com" : "TikTok", status: "ok", tone: st().channels.length % 4,
        connected: now, lastUsed: "—", checked: now, scopes: scopesFor().map((s) => s[0]), defaults: { vis: "private", lang: "vi", cat: p.key === "youtube" ? "22" : "", ai: true },
      };
      st().channels.push(c);
      added.push(c);
    });
    if (!added.length) return;
    ui().sel = added[0].id;
    CN = null;
    A.closeModal();
    A.openTab("channels");
    A.toast(added.length === 1 ? `Connected “${added[0].name}”.` : `Connected ${added.length} ${p.unit}.`);
  }

  let pendingDis = null;
  function openDisconnect(id) {
    const c = byId(id);
    if (!c) return;
    pendingDis = id;
    const pk = pkgsOf(id).filter((k) => !["published", "partial"].includes(DT.pkgStatus(k)));
    A.modal({
      title: "Disconnect channel", eyebrow: CAP, testid: "ch-disconnect-dialog",
      body: `<div class="dt-re">${avatar(c)}<div><div class="t-ink">${esc(c.name)}</div><div class="t-sm t-mute">${esc(c.handle)} · ${esc(P[c.platform].label)}</div></div></div>
        <p class="t-sm">The channel’s token will be removed from this machine. Posts already published are not affected.</p>
        ${pk.length ? `<div class="ld-warn">${ic("alert")}<span>${pk.length} unpublished packages target this channel. They will report errors until you remove it or reconnect the channel.</span></div>` : ""}
        <p class="field-hint">To fully revoke Dreamy Studio’s permissions, remove the app from the access section in your ${esc(P[c.platform].label)} account settings.</p>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-danger" data-testid="ch-disconnect-confirm-btn" data-act="ch-disconnect-confirm">${ic("unlink")}Disconnect</button>`,
    });
  }

  A.EXPLORER_EXTRA.dist = () => {
    const chs = st().channels.map((c) => `<div data-testid="ch-xrow-${c.id}" class="tree-row nx-child ${ui().sel === c.id && A.S.active === "channels" ? "is-selected" : ""}" tabindex="0" role="treeitem" data-act="ch-open" data-id="${c.id}">${ic(P[c.platform].icon)}<span class="tree-label">${esc(c.name)}</span><span class="dot dot-${c.status === "ok" ? "success" : "danger"}"></span></div>`).join("");
    const pks = [...st().packages].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 5).map((k) => `<div data-testid="pk-xrow-${k.id}" class="tree-row nx-child ${A.S.active === `package:${k.id}` ? "is-selected" : ""}" tabindex="0" role="treeitem" data-act="pk-open" data-id="${k.id}">${ic("package")}<span class="tree-label">${esc(k.title)}</span></div>`).join("");
    return `<div class="nx-sep"></div><div class="nf-label">Connected channels</div>${chs || `<div class="nx-empty">No channels connected yet</div>`}
      <div class="tree-row nx-child lb-xnew" tabindex="0" data-act="ch-connect">${ic("plus")}<span class="tree-label">Connect channel</span></div>
      <div class="nx-sep"></div><div class="nf-label">Recent packages</div>${pks || `<div class="nx-empty">No packages yet</div>`}`;
  };

  Object.assign(A.ACT, {
    "ch-sel": (el) => { ui().sel = ui().sel === el.dataset.id ? null : el.dataset.id; A.renderExplorer(); A.rerender(); },
    "ch-open": (el) => { ui().sel = el.dataset.id; A.openTab("channels"); },
    "ch-check": (el, e) => { e?.stopPropagation(); check([el.dataset.id]); },
    "ch-check-all": () => check(st().channels.map((c) => c.id)),
    "ch-connect": (el) => openConnect({ platform: el?.dataset?.v }),
    "ch-reconnect": (el, e) => { e?.stopPropagation(); openConnect({ reconnect: el.dataset.id }); },
    "ch-disconnect": (el) => openDisconnect(el.dataset.id),
    "ch-disconnect-confirm": () => {
      const c = byId(pendingDis);
      st().channels = st().channels.filter((x) => x.id !== pendingDis);
      if (ui().sel === pendingDis) ui().sel = null;
      pendingDis = null;
      A.closeModal();
      A.renderExplorer();
      A.rerender();
      A.toast(`Disconnected “${c?.name}”.`);
    },
    "cn-go": () => { CN.step = "wait"; drawConnect(); },
    "cn-ok": () => {
      if (CN.re) { finishReconnect(); return; }
      const free = FOUND[CN.platform].filter(([, h]) => !exists(h));
      if (CN.platform === "tiktok") {
        if (!free.length) { CN.step = "error"; CN.error = "This TikTok account was already connected."; drawConnect(); return; }
        addChannels(new Set([free[0][1]]));
        return;
      }
      CN.step = "pick";
      CN.picked = new Set(free.length ? [free[0][1]] : []);
      drawConnect();
    },
    "cn-deny": () => { CN.step = "error"; CN.error = "access_denied: You denied the permissions on the sign-in page."; drawConnect(); },
    "cn-timeout": () => { CN.step = "error"; CN.error = "Timed out (5 minutes) without receiving a response from the browser."; drawConnect(); },
    "cn-retry": () => { CN.step = "choose"; CN.error = ""; drawConnect(); },
    "cn-add": () => addChannels(CN.picked),
  });

  Object.assign(A.ON, {
    "cn-platform": (el) => { CN.platform = el.value; drawConnect(); },
    "cn-publish": (el) => { CN.publish = el.checked; drawConnect(); },
    "cn-pick": (el) => { if (el.checked) CN.picked.add(el.dataset.h); else CN.picked.delete(el.dataset.h); drawConnect(); },
    "ch-def": (el) => {
      const c = byId(el.dataset.id);
      if (!c) return;
      c.defaults[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value;
      A.rerender();
    },
  });

  DT.chApi = { byId, avatar, chBadges, openConnect };
})();
