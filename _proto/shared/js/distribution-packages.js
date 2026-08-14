(function () {
  const A = window.DSApp;
  const DT = window.DT;
  const PJ = window.PJ;
  const U = window.NVU;
  const LB = window.LB;
  const { esc, ic } = A;
  const CAP = window.DS.CAP["10"];
  const P = DT.PLATFORMS;
  const CH = DT.chApi;
  const pad = (n, w = 2) => String(n).padStart(w, "0");

  const st = () => DT.state;
  const byId = (id) => DT.pkgById(id);
  const pui = () => (DT.ui.pk ||= { q: "", status: "", ch: "", sel: null });
  const pkgId = (tabId) => String(tabId).split(":")[1];
  const outOf = (k) => PJ.outputRef(k.outId);
  const locked = (k) => ["publishing", "published"].includes(k.status);
  const ratioOf = (o) => (o.w > o.h ? "16:9" : o.w < o.h ? "9:16" : "1:1");
  const thumbBg = (id) => { const a = LB.state.assets.find((x) => x.id === id); return a ? (a.img ? `url(${a.img}) center / cover no-repeat` : a.bg) : ""; };
  const short = (s, n = 30) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const folderOf = (k) => { const r = outOf(k); return `${r ? r.p.folder : "projects"}\\packages\\${k.id}`; };
  const refresh = () => { A.renderExplorer(); A.rerender(); };
  const touch = (k) => { k.updated = A.stamp(); };

  const secs = (s) => s.split(":").reduce((a, x) => a * 60 + +x, 0);
  function parseChapters(text) {
    const items = [];
    const bad = [];
    String(text).split("\n").forEach((line, i) => {
      if (!line.trim()) return;
      const m = line.match(/^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+?)\s*$/);
      if (m) items.push({ t: secs(m[1]), title: m[2] }); else bad.push(i + 1);
    });
    return { items, bad };
  }
  function chapterIssues(text, dur) {
    const { items, bad } = parseChapters(text);
    const out = [];
    if (bad.length) out.push(`Line ${bad.join(", ")} are not in the “mm:ss Title” format.`);
    if (!items.length) return out;
    if (items[0].t !== 0) out.push("The first timestamp must be 00:00.");
    if (items.length < 3) out.push("At least 3 timestamps are required.");
    if (items.some((x, i) => i && x.t - items[i - 1].t < 10)) out.push("Each timestamp must be in increasing order and at least 10 seconds after the previous one.");
    if (dur && items[items.length - 1].t >= dur) out.push(`The last timestamp exceeds the video duration (${LB.dur(dur)}).`);
    return out;
  }
  const captionOf = (k) => [k.title, k.tags.map((x) => `#${x.replace(/\s+/g, "")}`).join(" ")].join(" ").trim();

  function check(k) {
    const r = [];
    const push = (scope, level, text) => r.push({ scope, level, text });
    const ref = outOf(k);
    if (!ref) push("all", "error", "The finished file is no longer in the project.");
    if (!k.title.trim()) push("all", "error", "No title yet.");
    if (ref && !k.reviewed && !locked(k)) push("all", "warn", "The finished video has not been reviewed before publishing.");
    if (!k.desc.trim()) push("all", "warn", "No description yet.");
    if (!k.targets.length) push("all", "error", "No target channel selected.");
    if (!k.thumb && k.targets.some((t) => DT.chById(t.ch)?.platform === "youtube")) push("all", "warn", "No thumbnail yet. YouTube will pick a frame automatically.");
    k.targets.forEach((t) => {
      const c = DT.chById(t.ch);
      const before = r.length;
      if (!c) { push(t.ch, "error", "The channel was disconnected. Remove it from the package or reconnect."); return; }
      if (c.status !== "ok") push(t.ch, "error", "The channel must be reconnected before publishing.");
      if (c.platform === "youtube") {
        const tagLen = k.tags.join(",").length;
        if (k.title.length > P.youtube.titleMax) push(t.ch, "error", `The title is ${k.title.length}/${P.youtube.titleMax} characters long.`);
        if (k.desc.length > P.youtube.descMax) push(t.ch, "error", `The description is ${k.desc.length}/${P.youtube.descMax} characters long.`);
        if (tagLen > P.youtube.tagsMax) push(t.ch, "error", `The total tag length is ${tagLen}/${P.youtube.tagsMax} characters.`);
        if (!t.kids) push(t.ch, "error", "It has not been declared whether the video is made for kids (required by YouTube).");
        const ci = chapterIssues(k.chapters, ref?.o.dur);
        if (ci.length) push(t.ch, "warn", `YouTube will ignore the timestamps: ${ci[0]}`);
        if (t.sched && new Date(t.sched) <= new Date()) push(t.ch, "error", "The scheduled time must be in the future.");
      } else if (c.platform === "tiktok") {
        if (captionOf(k).length > P.tiktok.titleMax) push(t.ch, "error", `The caption (title and tags) is ${captionOf(k).length}/${P.tiktok.titleMax} characters long.`);
        if (ref && ref.o.w >= ref.o.h) push(t.ch, "warn", `TikTok works best with 9:16 vertical video. This video is ${ratioOf(ref.o)} so it may be letterboxed or cropped.`);
      }
      if (!t.ai) push(t.ch, "warn", "The video has AI-generated visuals and voice but the AI content label is not turned on.");
      if (r.length === before) push(t.ch, "ok", `Ready to publish to ${c.name}.`);
    });
    return r;
  }
  DT.check = check;
  const counts = (k) => { const c = check(k); return { err: c.filter((x) => x.level === "error").length, warn: c.filter((x) => x.level === "warn").length }; };
  DT.statusBadge = (k) => { const [label, cls] = DT.PKG_STATUS[DT.pkgStatus(k)]; return `<span class="badge ${cls}">${label}</span>`; };
  const checkCell = (k) => {
    const { err, warn } = counts(k);
    return err ? `<span class="pk-chk is-err">${ic("x-circle")}${err} errors</span>` : warn ? `<span class="pk-chk is-warn">${ic("alert")}${warn} warnings</span>` : `<span class="pk-chk is-ok">${ic("check-circle")}OK</span>`;
  };
  const chipRow = (k) => `<span class="pk-chs">${k.targets.map((t) => {
    const c = DT.chById(t.ch);
    const r = k.results[t.ch];
    const tone = r ? (r.state === "error" ? "is-err" : "is-ok") : "";
    return c ? `<span class="pk-ch ${tone}" title="${esc(c.name)}${r ? ` · ${r.state === "error" ? "errors" : "published"}` : ""}">${CH.avatar(c, "is-sm")}</span>` : `<span class="pk-ch is-err" title="Channel disconnected">${ic("unlink")}</span>`;
  }).join("")}</span>`;

  function filtered() {
    const u = pui();
    const needle = u.q.trim().toLowerCase();
    return [...st().packages].filter((k) => (!u.status || DT.pkgStatus(k) === u.status) && (!u.ch || k.targets.some((t) => t.ch === u.ch))
      && (!needle || `${k.title} ${outOf(k)?.p.name || ""}`.toLowerCase().includes(needle))).sort((a, b) => b.updated.localeCompare(a.updated));
  }

  function listView() {
    const u = pui();
    const list = filtered();
    const rows = list.map((k) => {
      const ref = outOf(k);
      return `<tr data-testid="pk-row-${k.id}" tabindex="0" data-act="pk-sel" data-id="${k.id}" data-pk-open="${k.id}" class="${u.sel === k.id ? "is-selected" : ""}">
        <td><div class="nm-title"><span class="pk-th" style="background:${esc(thumbBg(k.thumb) || (ref ? LB.bgFor(ref.p.name) : ""))}"></span><div class="pk-t"><div class="t-ink ellip" title="${esc(k.title)}">${esc(k.title)}</div><div class="t-sm t-mute ellip">${esc(ref ? ref.p.name : "Project deleted")}</div></div></div></td>
        <td class="mono t-mute">${ref ? `${LB.dur(ref.o.dur)} · ${ratioOf(ref.o)}` : "—"}</td><td>${chipRow(k)}</td><td>${DT.statusBadge(k)}</td><td>${checkCell(k)}</td><td class="mono t-mute">${esc(k.updated.slice(0, 10))}</td></tr>`;
    }).join("");
    const body = list.length
      ? `<table class="table is-nw" data-testid="pk-table"><thead><tr><th>Package</th><th>Video</th><th>Target channels</th><th>Status</th><th>Check</th><th>Update</th></tr></thead><tbody>${rows}</tbody></table>`
      : st().packages.length
        ? U.empty("No packages match", "Try another keyword or remove the filters.", `<button class="btn" data-act="pk-clear">Clear filters</button>`)
        : U.empty("No packages yet", "A package gathers the finished video, thumbnail, title, description and target channels of a project, ready to publish.", `<div class="empty-act"><button class="btn btn-primary" data-act="pk-new">${ic("plus")}Create package</button></div>`);
    return `<div class="nv">
      ${U.bar(`<label class="search"><span class="sr-only">Search packages</span><input id="pk-q" data-testid="pk-search" class="input" type="search" value="${esc(u.q)}" placeholder="Search by title or project…" data-on="pk-q"></label><span class="t-sm t-mute">${list.length} package</span>`,
        `<select class="select" data-testid="pk-filter-status" data-change="pk-fstatus" aria-label="Filter by status">${U.options([["", "All statuses"], ...Object.entries(DT.PKG_STATUS).map(([k, [l]]) => [k, l.charAt(0) + l.slice(1).toLowerCase()])], u.status)}</select>
         <select class="select" data-testid="pk-filter-channel" data-change="pk-fch" aria-label="Filter by channel">${U.options([["", "All channels"], ...st().channels.map((c) => [c.id, c.name])], u.ch)}</select>
         <button class="btn btn-sm btn-primary" data-testid="pk-create-btn" data-act="pk-new">${ic("plus")}Create package</button>`)}
      <div class="nv-body"><div class="nv-scroll" data-keep="pk-l">${body}</div></div></div>`;
  }

  function checkList(k) {
    const r = check(k);
    const groups = [["all", "Chung"], ...k.targets.map((t) => [t.ch, DT.chById(t.ch)?.name || t.ch])];
    const icn = { error: "x-circle", warn: "alert", ok: "check-circle" };
    return groups.map(([sc, label]) => {
      const rows = r.filter((x) => x.scope === sc);
      return rows.length ? `<div class="pk-cg"><span class="eyebrow">${esc(label)}</span>${rows.map((x) => `<div class="pk-cr is-${x.level}">${ic(icn[x.level])}<span>${esc(x.text)}</span></div>`).join("")}</div>` : "";
    }).join("");
  }
  function summary(k) {
    const { err, warn } = counts(k);
    const s = DT.pkgStatus(k);
    if (s === "published") return { cls: "is-ok", icon: "check-circle", text: "Published" };
    if (s === "publishing") return { cls: "is-warn", icon: "clock", text: "Publishing…" };
    if (err) return { cls: "is-err", icon: "x-circle", text: `${err} errors left to fix` };
    return warn ? { cls: "is-warn", icon: "alert", text: `Ready · ${warn} warnings` } : { cls: "is-ok", icon: "check-circle", text: "Ready to publish" };
  }

  function packagePanel(k, inEditor) {
    const ref = outOf(k);
    const s = summary(k);
    const files = [["video", ref ? ref.o.name : "(file missing)"], ["image", k.thumb ? LB.state.assets.find((x) => x.id === k.thumb)?.name || "thumbnail" : "(no thumbnail yet)"], ["file-code", "metadata.json"], ...(k.chapters.trim() ? [["list", "chapters.txt"]] : [])];
    const act = inEditor
      ? `<button class="btn btn-primary" data-testid="pk-inspector-publish-btn" data-act="pk-publish" data-id="${k.id}" ${locked(k) || counts(k).err ? "disabled" : ""}>${ic("send-up")}${["partial", "failed"].includes(k.status) ? "Republish failed channels…" : "Publish…"}</button>`
      : `<button class="btn btn-primary" data-testid="pk-inspector-open-btn" data-act="pk-open" data-id="${k.id}">${ic("folder-open")}Open</button>`;
    return `<section class="ins-sec pk-ins-top" data-testid="pk-inspector-summary"><div class="pk-ins-thumb" style="background:${esc(thumbBg(k.thumb) || (ref ? LB.bgFor(ref.p.name) : ""))}"></div>
        <div class="ins-hero-t">${esc(k.title)}</div><div class="ins-hero-m">${DT.statusBadge(k)}<span class="mono t-mute">${esc(k.id)}</span></div>
        <div class="pk-sum ${s.cls}">${ic(s.icon)}<span>${s.text}</span></div>
        ${ref ? `<div class="pk-ins-review" data-testid="pk-inspector-review">${k.reviewed ? `<span class="badge badge-success" data-testid="pk-inspector-review-status">REVIEWED</span>` : `<span class="badge badge-warning" data-testid="pk-inspector-review-status">NOT REVIEWED</span>`}<span class="spacer"></span><button class="btn btn-sm" data-testid="pk-inspector-review-btn" data-act="pk-review" data-id="${k.id}">${ic("play")}Review</button></div>` : ""}
        ${DT.pkgStatus(k) === "publishing" && k.plId ? `<div class="progress" data-prog="${k.plId}"><i style="width:0%"></i></div>` : ""}</section>
      ${U.insSec(inEditor ? "Check before publishing" : "Check", `<div class="pk-checks" data-testid="pk-checks">${checkList(k)}</div>`)}
      ${U.insSec("Information", U.kv([["Project", ref ? `<button type="button" class="pk-link" data-act="pj-open" data-id="${ref.p.id}">${esc(ref.p.name)}</button>` : "—"], ["Video", ref ? `${LB.dur(ref.o.dur)} · ${ref.o.w}×${ref.o.h} · ${LB.bytes(ref.o.size)}` : "—"], ["Target channels", k.targets.length || "—"], ["Created at", `<span class="mono">${esc(k.created)}</span>`], ["Update", `<span class="mono">${esc(k.updated)}</span>`]]))}
      ${U.insSec("Package contents", `<div class="pk-files" data-testid="pk-files">${files.map(([i, n]) => `<div class="pk-file-r">${ic(i === "video" ? "film" : i)}<span class="tree-label">${esc(n)}</span></div>`).join("")}</div><div class="path t-mute">${esc(folderOf(k))}\\</div><span class="field-hint">The video is referenced from the project, no extra disk space is copied. You can publish manually from this folder.</span>`)}
      <section class="ins-sec ins-actions" data-testid="pk-inspector-actions">${act}<button class="btn" data-testid="pk-inspector-folder-btn" data-act="pk-open-folder" data-id="${k.id}">${ic("folder-open")}Folder</button><button class="btn" data-testid="pk-inspector-dup-btn" data-act="pk-dup" data-id="${k.id}">${ic("copy")}Duplicate</button><button class="btn btn-danger" data-testid="pk-inspector-delete-btn" data-act="pk-del" data-id="${k.id}">${ic("trash")}Delete</button></section>`;
  }
  function listPanel() {
    const all = st().packages;
    const by = (s) => all.filter((k) => DT.pkgStatus(k) === s).length;
    return `${U.insSec("Package", U.kv([["Total", all.length], ["Draft", by("draft")], ["Ready", by("ready")], ["Published", by("published")], ["Partial / failed", by("partial") + by("failed")]]))}
      <section class="ins-sec"><span class="eyebrow">Create package</span><button class="btn btn-block btn-primary" data-act="pk-new">${ic("plus")}Create package…</button>
        <span class="field-hint">A package represents one distribution: the video, thumbnail, description and target channels.</span></section>
      <section class="ins-sec"><span class="eyebrow">Before publishing</span><p class="t-sm t-mute">Each time you publish you will review the final version, the target account, visibility, the data that will be sent, and confirm the right to publish the resources in the video.</p></section>`;
  }
  const listInspector = () => { const k = pui().sel && byId(pui().sel); return k ? packagePanel(k, false) : listPanel(); };

  const field = (label, id, control, extra = "") => `<div class="field"><label for="${id}">${label}${extra}</label>${control}</div>`;
  const counter = (n, max) => `<span class="pk-cnt ${max && n > max ? "is-over" : ""}">${n}${max ? ` / ${max}` : ""}</span>`;
  const hasYT = (k) => k.targets.some((t) => DT.chById(t.ch)?.platform === "youtube");

  function targetCard(k, t, lock) {
    const c = DT.chById(t.ch);
    const dis = lock ? "disabled" : "";
    const chk = check(k).filter((x) => x.scope === t.ch);
    const res = k.results[t.ch];
    if (!c) return `<div class="pk-tg is-err"><header class="pk-tg-h"><span class="pk-ch is-err">${ic("unlink")}</span><div><div class="t-ink">${esc(res?.name || t.ch)}</div><div class="t-sm t-mute">The channel was disconnected</div></div><span class="spacer"></span>${lock ? "" : `<button class="btn btn-sm" data-act="pk-t-del" data-id="${k.id}" data-ch="${t.ch}">${ic("x")}Remove</button>`}</header></div>`;
    const p = P[c.platform];
    const f = (key, v) => `data-change="pk-tedit" data-id="${k.id}" data-ch="${t.ch}" data-f="${key}" ${dis}`;
    const sched = c.platform === "youtube"
      ? field("Schedule publishing", `pk-s-${t.ch}`, `<input id="pk-s-${t.ch}" data-testid="pk-target-schedule-${t.ch}" class="input" type="datetime-local" value="${esc(t.sched)}" ${f("sched")}>`, "")
      : field("Time", `pk-s-${t.ch}`, `<div class="t-sm t-mute pk-static">Publish immediately. TikTok does not support scheduling via the API.</div>`);
    const yt = c.platform === "youtube"
      ? `<div class="form-2">${field("Category", `pk-c-${t.ch}`, `<select id="pk-c-${t.ch}" data-testid="pk-target-category-${t.ch}" class="select" ${f("cat")}>${U.options(DT.CATEGORIES, t.cat)}</select>`)}
          ${field("Made for kids?", `pk-k-${t.ch}`, `<select id="pk-k-${t.ch}" data-testid="pk-target-kids-${t.ch}" class="select ${t.kids ? "" : "is-invalid"}" ${f("kids")}>${U.options(DT.KIDS, t.kids)}</select>`)}</div>`
      : `<div class="pk-toggles"><label class="check"><input type="checkbox" data-testid="pk-target-comments-${t.ch}" ${f("comments")} ${t.comments ? "checked" : ""}><span>Allow comments</span></label>
          <label class="check"><input type="checkbox" data-testid="pk-target-commercial-${t.ch}" ${f("commercial")} ${t.commercial ? "checked" : ""}><span>Commercial content (with ads or sponsorship)</span></label></div>`;
    const resRow = res ? `<div data-testid="pk-target-result-${t.ch}" class="pk-res is-${res.state === "error" ? "err" : "ok"}">${ic(res.state === "error" ? "x-circle" : "check-circle")}<div class="pk-res-b">${res.state === "error" ? `<div class="t-ink">Publishing failed</div><div class="t-sm t-mute mono">${esc(res.error)}</div>` : res.state === "scheduled" ? `<div class="t-ink">Scheduled for ${esc(res.when)}</div><div class="t-sm t-mute"><span class="path">${esc(res.url)}</span></div>` : `<div class="t-ink">Published</div><div class="t-sm t-mute"><span class="path">${esc(res.url)}</span></div>`}</div><span class="mono t-mute">${esc(res.at)}</span>
        ${res.url ? `<button class="btn btn-sm" data-act="pk-open-url" data-url="${esc(res.url)}">${ic("external")}Open</button>` : ""}</div>` : "";
    return `<div data-testid="pk-target-${t.ch}" class="pk-tg ${chk.some((x) => x.level === "error") ? "is-err" : ""}"><header class="pk-tg-h">${CH.avatar(c)}<div><div class="t-ink">${esc(c.name)}</div><div class="t-sm t-mute">${esc(c.handle)} · ${esc(p.label)}</div></div><span class="spacer"></span>${CH.chBadges(c)}${lock ? "" : `<button class="btn btn-icon btn-sm" data-testid="pk-target-remove-${t.ch}" data-act="pk-t-del" data-id="${k.id}" data-ch="${t.ch}" data-tip="Remove channel from package" aria-label="Remove channel">${ic("x")}</button>`}</header>
      <div class="form-2">${field("Visibility", `pk-v-${t.ch}`, `<select id="pk-v-${t.ch}" data-testid="pk-target-visibility-${t.ch}" class="select" ${f("vis")}>${U.options(p.vis, t.vis)}</select>`)}${sched}</div>
      ${t.sched && c.platform === "youtube" ? `<span class="field-hint">The post stays private until the scheduled time, then automatically switches to “${esc(p.vis.find((x) => x[0] === t.vis)?.[1] || t.vis)}”.</span>` : ""}
      ${yt}
      <label class="check"><input type="checkbox" data-testid="pk-target-ai-${t.ch}" ${f("ai")} ${t.ai ? "checked" : ""}><span>Label content generated or edited by AI on ${esc(p.label)}</span></label>${resRow}</div>`;
  }

  function editorView(tabId) {
    const k = byId(pkgId(tabId));
    if (!k) return U.empty("The package no longer exists", "This package was deleted.", `<button class="btn" data-act="open" data-id="packages">Back to the package list</button>`);
    const lock = locked(k);
    const dis = lock ? "disabled" : "";
    const ref = outOf(k);
    const outs = ref ? ref.p.outputs : [];
    const imgs = LB.state.assets.filter((x) => x.type === "image");
    const yt = hasYT(k);
    const ci = k.chapters.trim() ? chapterIssues(k.chapters, ref?.o.dur) : [];
    const free = st().channels.filter((c) => !k.targets.some((t) => t.ch === c.id));
    const s = DT.pkgStatus(k);
    const banner = s === "published" ? `<div data-testid="pk-banner" class="pk-banner is-ok">${ic("check-circle")}<span>The package was published. Editing here does not update posts already published on the platform. To publish again, duplicate the package.</span><button class="btn btn-sm" data-testid="pk-banner-dup-btn" data-act="pk-dup" data-id="${k.id}">${ic("copy")}Duplicate</button></div>`
      : s === "publishing" ? `<div data-testid="pk-banner" class="pk-banner is-warn">${ic("clock")}<span>Publishing to the channels. Track progress in the Pipelines panel.</span><button class="btn btn-sm" data-act="toggle-bottom">${ic("panel-bottom")}Open Pipelines</button></div>`
      : ["partial", "failed"].includes(s) ? `<div data-testid="pk-banner" class="pk-banner is-warn">${ic("alert")}<span>${s === "partial" ? "Some channels were published, some failed." : "Publishing was not successful."} Fix the error on the corresponding channel then choose “Republish failed channels”. Channels already published will not be published again.</span></div>` : "";
    return `<div class="nv">
      ${U.bar(`<span class="nv-ttl">${ic("package")}<span class="t-ink ellip pk-bar-t" title="${esc(k.title)}">${esc(short(k.title, 60))}</span>${DT.statusBadge(k)}</span><span class="t-sm t-mute">Autosave</span>`,
        `<button class="btn btn-sm" data-testid="pk-open-folder-btn" data-act="pk-open-folder" data-id="${k.id}">${ic("folder-open")}Folder</button><button class="btn btn-sm" data-testid="pk-dup-btn" data-act="pk-dup" data-id="${k.id}">${ic("copy")}Duplicate</button>
         <button class="btn btn-sm btn-primary" data-testid="pk-publish-btn" data-act="pk-publish" data-id="${k.id}" ${lock || counts(k).err ? `disabled data-tip="${lock ? "Package locked" : "Errors still to fix"}"` : ""}>${ic("send-up")}${["partial", "failed"].includes(s) ? "Republish failed channels…" : "Publish…"}</button>`)}
      <div class="nv-body"><div class="nv-scroll pk" data-testid="pk-editor" data-keep="pk-e"><div class="pk-in">
        ${banner}
        <section class="pw-card" data-testid="pk-file-card"><h3 class="t-display-xs">Finished video</h3>
          <div class="pk-file">${ref ? `<span class="pk-file-i">${ic("film")}</span><div class="pk-file-b"><div class="t-ink ellip">${esc(ref.o.name)}</div><div class="t-sm t-mute">${LB.dur(ref.o.dur)} · ${ref.o.w}×${ref.o.h} (${ratioOf(ref.o)}) · ${LB.bytes(ref.o.size)} · project <button type="button" class="pk-link" data-act="pj-open" data-id="${ref.p.id}">${esc(ref.p.name)}</button></div></div>
            ${outs.length > 1 ? `<select class="select" data-testid="pk-output-select" data-change="pk-edit" data-id="${k.id}" data-f="outId" aria-label="Change finished file" ${dis}>${U.options(outs.map((o) => [o.id, o.name]), k.outId)}</select>` : ""}`
        : `<div class="ld-warn">${ic("alert")}<span>The finished file or project no longer exists.</span></div>`}</div>
          <div class="pk-thumbrow"><div class="pk-thumb" data-testid="pk-thumb-preview" style="background:${esc(thumbBg(k.thumb) || (ref ? LB.bgFor(ref.p.name) : ""))}">${k.thumb ? "" : `<span class="t-sm">No thumbnail yet</span>`}</div>
            <div class="pk-thumb-b">${field("Thumbnail", "pk-thumb", `<select id="pk-thumb" data-testid="pk-thumb-select" class="select" data-change="pk-edit" data-id="${k.id}" data-f="thumb" ${dis}><option value="">Do not use a thumbnail</option>${imgs.map((x) => `<option value="${x.id}" ${x.id === k.thumb ? "selected" : ""}>${esc(x.name)} · ${x.meta.w}×${x.meta.h}</option>`).join("")}</select>`)}
              <span class="field-hint">Choose an image from the library. Use an image of 1280×720 or larger for YouTube.</span></div></div></section>
        <section class="pw-card" data-testid="pk-content-card"><h3 class="t-display-xs">Content</h3>
          ${field("Title", "pk-title", `<input id="pk-title" data-testid="pk-title" class="input" value="${esc(k.title)}" data-change="pk-edit" data-on="pk-count" data-max="${yt ? P.youtube.titleMax : 0}" data-id="${k.id}" data-f="title" autocomplete="off" ${dis}>`, counter(k.title.length, yt ? P.youtube.titleMax : 0))}
          ${field("Description", "pk-desc", `<textarea id="pk-desc" data-testid="pk-desc" class="textarea" rows="6" data-change="pk-edit" data-on="pk-count" data-max="${yt ? P.youtube.descMax : 0}" data-id="${k.id}" data-f="desc" ${dis}>${esc(k.desc)}</textarea>`, counter(k.desc.length, yt ? P.youtube.descMax : 0))}
          <div class="field"><label for="pk-tag-in">Tags ${counter(k.tags.join(",").length, yt ? P.youtube.tagsMax : 0)}</label><div class="tags">${k.tags.map((t) => `<span class="tag">${esc(t)}${lock ? "" : `<button type="button" class="tag-x" data-act="pk-tag-del" data-id="${k.id}" data-t="${esc(t)}" aria-label="Remove tag ${esc(t)}">${ic("x")}</button>`}</span>`).join("")}
            <input id="pk-tag-in" data-testid="pk-tag-input" class="input tag-in" placeholder="Add a tag, press Enter…" data-enter="pk-tag-add" data-id="${k.id}" autocomplete="off" ${dis}></div></div>
          ${field("Language", "pk-lang", `<select id="pk-lang" data-testid="pk-lang" class="select" data-change="pk-edit" data-id="${k.id}" data-f="lang" ${dis}>${U.options(DT.LANGS, k.lang)}</select>`)}
          ${field("Timestamps (chapters)", "pk-chap", `<textarea id="pk-chap" data-testid="pk-chapters" class="textarea mono-area" rows="5" placeholder="00:00 Opening&#10;01:42 Chapter one&#10;06:15 Chapter two" data-change="pk-edit" data-id="${k.id}" data-f="chapters" ${dis}>${esc(k.chapters)}</textarea>`)}
          <span class="field-hint ${ci.length ? "pk-bad" : ""}">${ci.length ? esc(ci[0]) : "One per line in the format “mm:ss Title”. YouTube needs the first timestamp at 00:00, at least 3 timestamps, at least 10 seconds apart."}</span></section>
        <section class="pw-card" data-testid="pk-targets-card"><div class="pk-h"><h3 class="t-display-xs">Target channels</h3><span class="t-sm t-mute">${k.targets.length} channels</span></div>
          ${k.targets.map((t) => targetCard(k, t, lock)).join("") || `<p class="t-sm t-mute">No channels selected. Add one below.</p>`}
          ${lock ? "" : `<div class="pk-add"><select class="select" data-testid="pk-target-add" data-change="pk-t-add" data-id="${k.id}" aria-label="Add target channel"><option value="">Add target channel…</option>${free.map((c) => `<option value="${c.id}" ${c.status !== "ok" ? "disabled" : ""}>${esc(c.name)} · ${esc(P[c.platform].label)}${c.status !== "ok" ? " (needs reconnecting)" : ""}</option>`).join("")}</select>
            <button class="btn btn-sm" data-act="ch-connect">${ic("link")}Connect a new channel</button></div>`}</section>
      </div></div></div></div>`;
  }
  const editorInspector = (tabId) => { const k = byId(pkgId(tabId)); return k ? packagePanel(k, true) : ""; };

  A.VIEWS.packages = { fill: true, render: listView, inspector: listInspector };
  A.VIEWS.package = { fill: true, render: editorView, inspector: editorInspector };

  function openPackage(id) {
    const k = byId(id);
    if (!k) return;
    A.openTab(`package:${id}`, { title: k.title, tab: short(k.title, 26), icon: "package", section: "Packages", cap: CAP, rail: "distribution", blurb: "", reqs: [] });
  }

  let NP = null;
  const pretty = (name) => { const s = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
  const eligible = () => PJ.state.projects.filter((p) => !p.archived);

  function openNew(o = {}) {
    const p0 = (o.p && PJ.api.byId(o.p)) || eligible().find((p) => p.outputs.length);
    const out = p0 ? p0.outputs.find((x) => x.id === o.o) || p0.outputs[0] : null;
    NP = { p: p0?.id || "", o: out?.id || "", title: out ? pretty(out.name) : "", touched: false, chs: new Set() };
    drawNew();
  }
  function drawNew() {
    const projects = eligible();
    const p = PJ.api.byId(NP.p);
    const outs = p ? p.outputs : [];
    const chs = st().channels;
    const none = !projects.some((x) => x.outputs.length);
    A.modal({
      title: "Create package", eyebrow: CAP, cls: "modal-lg", testid: "np-dialog",
      body: none ? U.empty("No finished video yet", "A package needs a video rendered from a project’s Video editor. Finish post-production, then come back here.", `<button class="btn" data-act="open" data-id="projects">Back to the project catalog</button>`)
        : `<div class="form-2">
          <div class="field"><label for="np-p">Project</label><select id="np-p" data-testid="np-project" class="select" data-change="np-p">${projects.map((x) => `<option value="${x.id}" ${x.id === NP.p ? "selected" : ""} ${x.outputs.length ? "" : "disabled"}>${esc(x.name)}${x.outputs.length ? "" : " · no finished video yet"}</option>`).join("")}</select></div>
          <div class="field"><label for="np-o">Finished video</label><select id="np-o" data-testid="np-output" class="select" data-change="np-o">${outs.map((o) => `<option value="${o.id}" ${o.id === NP.o ? "selected" : ""}>${esc(o.name)} · ${LB.dur(o.dur)}</option>`).join("")}</select></div></div>
        <div class="field"><label for="np-title">Title</label><input id="np-title" data-testid="np-title" class="input" value="${esc(NP.title)}" data-on="np-title" autocomplete="off"><p class="field-err" id="np-err" data-testid="np-error" hidden></p></div>
        <div class="field"><label>Target channels</label>${chs.length ? `<div class="opts">${chs.map((c) => `<label class="opt ${c.status !== "ok" ? "is-off" : NP.chs.has(c.id) ? "is-on" : ""}"><input type="checkbox" data-testid="np-channel-${c.id}" data-change="np-ch" data-id="${c.id}" ${NP.chs.has(c.id) ? "checked" : ""} ${c.status !== "ok" ? "disabled" : ""}>${CH.avatar(c)}<div class="opt-b"><span class="t-ink">${esc(c.name)}</span><span class="t-sm t-mute">${esc(P[c.platform].label)} · ${esc(c.handle)}${c.status !== "ok" ? " · needs reconnecting" : ""}</span></div></label>`).join("")}</div>`
          : `<div class="ld-warn">${ic("info")}<span>No channels connected yet. <button type="button" class="pk-link" data-act="ch-connect">Connect channel</button> before creating a package.</span></div>`}</div>
        <p class="t-sm t-mute">You will finish the description, thumbnail and each channel’s own options in the next step. Nothing has been sent yet.</p>`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button>${none ? "" : `<button class="btn btn-primary" data-testid="np-submit-btn" data-act="np-submit">${ic("package")}Create package</button>`}`,
    });
  }
  function submitNew() {
    const err = A.$("#np-err");
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    const p = PJ.api.byId(NP.p);
    const out = p?.outputs.find((x) => x.id === NP.o);
    if (!p || !out) return fail("Choose a project with a finished video.");
    if (!NP.title.trim()) { A.$("#np-title").classList.add("is-invalid"); return fail("Enter a title."); }
    if (!NP.chs.size) return fail("Choose at least one target channel.");
    const now = A.stamp();
    const nv = PJ.api.novelOf(p);
    const k = {
      id: `PKG-${pad(++st().seq.pkg, 4)}`, projectId: p.id, outId: out.id, status: "draft", rights: false, reviewed: null, thumb: null, lang: p.src?.lang === "EN" ? "en" : "vi",
      title: NP.title.trim(), desc: nv?.desc || p.desc || "", tags: [], chapters: "",
      targets: [...NP.chs].map((id) => { const c = DT.chById(id); return DT.tgt(id, { vis: c.defaults.vis, cat: c.defaults.cat || "22", ai: c.defaults.ai }); }), results: {}, created: now, updated: now,
    };
    st().packages.unshift(k);
    NP = null;
    A.closeModal();
    pui().sel = k.id;
    openPackage(k.id);
    A.toast(`Created package “${short(k.title, 40)}”.`);
  }

  let pendingDel = null;
  function openDelete(id) {
    const k = byId(id);
    if (!k) return;
    pendingDel = id;
    const posted = Object.values(k.results).some((r) => r.state !== "error");
    A.modal({
      title: "Delete package", eyebrow: CAP, testid: "pk-delete-dialog",
      body: `<p>Delete package <b class="t-ink">${esc(k.title)}</b>?</p>
        <div class="ld-warn">${ic("alert")}<span>Folder <span class="path">${esc(folderOf(k))}\\</span> will be deleted. The finished video and project are not affected.</span></div>
        ${posted ? `<div class="ld-warn">${ic("alert")}<span>Posts already published on the platform are not taken down. Delete them directly on the platform if needed.</span></div>` : ""}
        ${DT.pkgStatus(k) === "publishing" ? `<div class="ld-warn">${ic("alert")}<span>The package is being published. Cancel the process in the Pipelines panel before deleting.</span></div>` : ""}`,
      foot: `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-danger" data-testid="pk-delete-confirm-btn" data-act="pk-del-confirm" ${DT.pkgStatus(k) === "publishing" ? "disabled" : ""}>${ic("trash")}Delete package</button>`,
    });
  }

  Object.assign(A.ACT, {
    "pk-new": (el) => openNew({ p: el?.dataset?.p, o: el?.dataset?.o }),
    "pk-open": (el) => openPackage(el.dataset.id),
    "pk-sel": (el) => {
      pui().sel = pui().sel === el.dataset.id ? null : el.dataset.id;
      A.$$("#editor [data-pk-open]").forEach((r) => r.classList.toggle("is-selected", r.dataset.pkOpen === pui().sel));
      A.renderInspector();
    },
    "pk-clear": () => { Object.assign(pui(), { q: "", status: "", ch: "" }); A.rerender(); },
    "np-submit": submitNew,
    "pk-del": (el) => openDelete(el.dataset.id),
    "pk-del-confirm": () => {
      const k = byId(pendingDel);
      st().packages = st().packages.filter((x) => x.id !== pendingDel);
      A.closeTab(`package:${pendingDel}`);
      delete A.ITEMS[`package:${pendingDel}`];
      if (pui().sel === pendingDel) pui().sel = null;
      pendingDel = null;
      A.closeModal();
      refresh();
      A.toast(`Deleted package “${short(k?.title || "", 40)}”.`);
    },
    "pk-dup": (el) => {
      const k = byId(el.dataset.id);
      if (!k) return;
      const now = A.stamp();
      const c = { ...JSON.parse(JSON.stringify(k)), id: `PKG-${pad(++st().seq.pkg, 4)}`, status: "draft", rights: false, results: {}, plId: null, reviewed: null, created: now, updated: now };
      c.title = `${k.title} (copy)`;
      st().packages.unshift(c);
      openPackage(c.id);
      A.toast("Duplicated the package. The copy is in draft status.");
    },
    "pk-open-folder": (el) => { const k = byId(el.dataset.id); if (k) A.toast(`Opened ${folderOf(k)}\\ in File Explorer (simulated).`); },
    "pk-open-url": (el) => A.toast(`Opened ${el.dataset.url} in the browser (simulated).`),
    "pk-tag-add": (el) => {
      const k = byId(el.dataset.id);
      const t = String(el.value).toLowerCase().replace(/#/g, "").trim().slice(0, 30);
      if (!k || !t) return;
      if (k.tags.includes(t)) { A.toast(`Tag “${t}” already exists.`, "warning"); el.value = ""; return; }
      k.tags.push(t);
      touch(k);
      refresh();
      A.$("#pk-tag-in")?.focus();
    },
    "pk-tag-del": (el) => { const k = byId(el.dataset.id); k.tags = k.tags.filter((t) => t !== el.dataset.t); touch(k); refresh(); },
    "pk-t-del": (el) => { const k = byId(el.dataset.id); k.targets = k.targets.filter((t) => t.ch !== el.dataset.ch); touch(k); refresh(); },
  });

  Object.assign(A.ON, {
    "pk-q": (el) => { pui().q = el.value; A.rerender(); },
    "pk-fstatus": (el) => { pui().status = el.value; A.rerender(); },
    "pk-fch": (el) => { pui().ch = el.value; A.rerender(); },
    "np-p": (el) => { NP.p = el.value; const p = PJ.api.byId(el.value); NP.o = p?.outputs[0]?.id || ""; if (!NP.touched && p?.outputs[0]) NP.title = pretty(p.outputs[0].name); drawNew(); },
    "np-o": (el) => { NP.o = el.value; const o = PJ.api.byId(NP.p)?.outputs.find((x) => x.id === el.value); if (!NP.touched && o) NP.title = pretty(o.name); drawNew(); },
    "np-title": (el) => { NP.title = el.value; NP.touched = true; el.classList.remove("is-invalid"); const e = A.$("#np-err"); if (e) e.hidden = true; },
    "np-ch": (el) => { if (el.checked) NP.chs.add(el.dataset.id); else NP.chs.delete(el.dataset.id); drawNew(); },
    "pk-count": (el) => {
      const max = +el.dataset.max || 0;
      const n = el.value.length;
      const c = el.closest(".field")?.querySelector(".pk-cnt");
      if (c) { c.textContent = `${n}${max ? ` / ${max}` : ""}`; c.classList.toggle("is-over", !!max && n > max); }
    },
    "pk-edit": (el) => {
      const k = byId(el.dataset.id);
      if (!k) return;
      const f = el.dataset.f;
      if (f === "title") {
        k.title = el.value.trim();
        const it = A.ITEMS[`package:${k.id}`];
        if (it) { it.title = k.title || "Package"; it.tab = short(k.title || "Package", 26); }
      } else if (f === "desc" || f === "chapters") k[f] = el.value;
      else if (f === "outId") { k.outId = el.value; k.reviewed = null; }
      else k[f] = el.value || (f === "thumb" ? null : "");
      touch(k);
      refresh();
    },
    "pk-tedit": (el) => {
      const k = byId(el.dataset.id);
      const t = k?.targets.find((x) => x.ch === el.dataset.ch);
      if (!t) return;
      t[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value;
      touch(k);
      refresh();
    },
    "pk-t-add": (el) => {
      const k = byId(el.dataset.id);
      const c = DT.chById(el.value);
      el.value = "";
      if (!k || !c) return;
      k.targets.push(DT.tgt(c.id, { vis: c.defaults.vis, cat: c.defaults.cat || "22", ai: c.defaults.ai }));
      touch(k);
      refresh();
    },
  });

  document.addEventListener("dblclick", (e) => {
    const el = e.target.closest("[data-pk-open]");
    if (el && !e.target.closest("input,button,select")) openPackage(el.dataset.pkOpen);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches?.("[data-pk-open]")) openPackage(e.target.dataset.pkOpen);
  });

  DT.pkApi = { parseChapters, thumbBg, byId, check, counts, outOf, locked, openPackage, refresh, touch, folderOf, ratioOf, captionOf, short };
})();
