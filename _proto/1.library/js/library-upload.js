(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const API = LB.api;
  const { esc, ic } = A;
  const T = LB.TYPES;
  const CAP = window.DS.CAP["05"];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = () => LB.state;

  const UP = { type: "image", tab: "files", files: [], col: "", newCol: "", tags: "", rights: "", phase: "edit", token: 0, prompt: { name: "", kind: "general", text: "" } };

  const alive = (token) => token === UP.token && !!A.$("#layer .modal.lbu");

  function check(f) {
    const t = T[UP.type];
    const e = LB.extOf(f.name);
    if (!f.size) return ["error", "Empty file."];
    if (!t.exts.includes(e)) return ["error", `The .${e || "?"} format is not supported for ${t.noun}.`];
    if (f.size > t.max) return ["error", `Larger than the ${LB.bytes(t.max)} limit for ${t.noun}.`];
    if (st().assets.some((x) => x.type === UP.type && x.name.toLowerCase() === (UP.type === "prompt" ? f.name.replace(/\.(txt|md)$/i, "") : f.name).toLowerCase())) return ["warn", "A resource with the same name already exists; it will be renamed when added."];
    return ["ok", ""];
  }
  function addFiles(list) {
    let skipped = 0;
    [...list].forEach((f) => {
      if (UP.files.some((x) => x.name === f.name && x.size === f.size)) { skipped++; return; }
      const [s, msg] = check(f);
      UP.files.push({ name: f.name, size: f.size, file: f, st: s, msg, run: "" });
    });
    if (skipped) A.toast(`Skipped ${skipped} files already in the list.`, "warning");
  }
  const valid = () => UP.files.filter((f) => f.st !== "error");

  function fieldsBlock() {
    return `<div class="form-2">
        <div class="field"><label for="lbu-col">Collection</label><select id="lbu-col" class="select" data-on="lbu-f" data-f="col"><option value="">Do not add to a collection</option>${st().collections.map((c) => `<option value="${c.id}" ${UP.col === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="lbu-newcol">Or create a new collection</label><input id="lbu-newcol" class="input" value="${esc(UP.newCol)}" placeholder="New collection name" data-on="lbu-f" data-f="newCol" autocomplete="off"></div></div>
      <div class="form-2">
        <div class="field"><label for="lbu-tags">Tags</label><input id="lbu-tags" class="input" value="${esc(UP.tags)}" placeholder="harbor, night, background" data-on="lbu-f" data-f="tags" autocomplete="off" list="lb-tag-sug"><datalist id="lb-tag-sug">${st().tagList.map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist><span class="field-hint">Separated by commas, up to 12 tags.</span></div>
        <div class="field"><label for="lbu-rights">Usage rights</label><select id="lbu-rights" class="select" data-on="lbu-f" data-f="rights" required><option value="" disabled ${UP.rights ? "" : "selected"}>Choose usage rights…</option>${API.opts(Object.entries(LB.RIGHTS), UP.rights)}</select><span class="field-hint">Required before saving.</span></div></div>`;
  }

  function queue() {
    const t = T[UP.type];
    const running = UP.phase === "run";
    const pill = (f) => {
      if (running) return { queued: `<span class="badge">WAITING</span>`, running: `<span class="badge badge-running">UPLOADING</span>`, done: `<span class="badge badge-success">XONG</span>`, error: `<span class="badge badge-danger">ERROR</span>` }[f.run] || "";
      return { ok: `<span class="badge badge-success">VALID</span>`, warn: `<span class="badge badge-warning">RENAME</span>`, error: `<span class="badge badge-danger">INVALID</span>` }[f.st];
    };
    const rows = UP.files.map((f, i) => `<tr class="${f.st === "error" ? "is-muted" : ""}"><td><div class="lbu-fn">${ic(t.icon)}<div class="lb-rname"><div class="t-ink lbu-name">${esc(f.name)}</div>${f.msg ? `<div class="t-sm ${f.st === "error" || f.run === "error" ? "lbu-err" : "t-mute"}">${esc(f.msg)}</div>` : ""}</div></div></td>
        <td class="num t-mute">${LB.bytes(f.size)}</td>
        <td class="lbu-st">${pill(f)}</td>
        <td class="row-actions">${running ? "" : `<button class="btn btn-icon btn-sm" data-act="lbu-remove" data-i="${i}" aria-label="Remove ${esc(f.name)}" data-tip="Remove from list">${ic("x")}</button>`}</td></tr>`).join("");
    return `<div class="lbu-queue"><table class="table"><tbody>${rows}</tbody></table></div>`;
  }

  function dropzone() {
    const t = T[UP.type];
    return `<div class="lb-drop ${UP.files.length ? "is-compact" : ""}" role="group" aria-label="File drop area">
      ${UP.files.length ? "" : `${ic("upload", "lb-drop-ic")}<div class="lb-drop-t">Drag and drop ${t.noun} here</div><div class="t-sm t-mute">or</div>`}
      <div class="lb-drop-act"><label class="btn">${UP.files.length ? "Add files…" : "Choose files…"}<input type="file" hidden multiple accept="${t.exts.map((e) => `.${e}`).join(",")}" data-change="lbu-file"></label></div>
      <div class="t-sm t-mute">${esc(t.hint)}</div></div>`;
  }

  function draw() {
    const t = T[UP.type];
    const write = UP.type === "prompt" && UP.tab === "write";
    const nOk = valid().length;
    let body;
    let foot;
    if (UP.phase === "run") {
      body = `${queue()}<p class="t-sm t-mute">Copying files into the folder <span class="path">library\\</span> of the workspace…</p>`;
      foot = `<button class="btn" data-act="close-modal">Close</button><span class="spacer"></span><button class="btn btn-primary" disabled>Uploading…</button>`;
    } else if (write) {
      const p = UP.prompt;
      const vars = LB.varsOf(p.text);
      body = `${UP.type === "prompt" ? API.seg("lbu-tab", [["files", "From file"], ["write", "Write new"]], UP.tab) : ""}
        <div class="form-2"><div class="field"><label for="lbp-name">Prompt name</label><input id="lbp-name" class="input" value="${esc(p.name)}" placeholder="Example: Harbor scene at sunset" data-on="lbu-p" data-f="name" autocomplete="off"><p class="field-err" id="lbp-err" hidden></p></div>
          <div class="field"><label for="lbp-kind">Prompt type</label><select id="lbp-kind" class="select" data-on="lbu-p" data-f="kind">${API.opts(Object.entries(LB.PROMPT_KINDS), p.kind)}</select></div></div>
        <div class="field"><label for="lbp-text">Content</label><textarea id="lbp-text" class="textarea" rows="7" placeholder="Description… Use {{variable_name}} for the parts to replace when applied." data-on="lbu-p" data-f="text">${esc(p.text)}</textarea>
          <span class="field-hint" id="lbp-vars">${vars.length ? `Detected variables: ${vars.map((v) => `{{${esc(v)}}}`).join(", ")}` : "No variables yet."}</span></div>
        ${fieldsBlock()}`;
      foot = `<button class="btn" data-act="close-modal">Cancel</button><span class="spacer"></span><button class="btn btn-primary" data-act="lbu-save-prompt" ${UP.rights ? "" : "disabled"}>${ic("check")}Save prompt</button>`;
    } else {
      body = `${UP.type === "prompt" ? API.seg("lbu-tab", [["files", "From file"], ["write", "Write new"]], UP.tab) : ""}
        ${dropzone()}${UP.files.length ? queue() : ""}
        ${fieldsBlock()}`;
      foot = `<button class="btn" data-act="close-modal">Cancel</button><span class="spacer"></span><button class="btn btn-primary" data-act="lbu-submit" ${nOk && UP.rights ? "" : "disabled"}>${ic("upload")}Upload ${nOk || ""} ${t.noun}</button>`;
    }
    A.modal({ title: `Upload ${t.noun}`, eyebrow: CAP, cls: "modal-lg lbu", body, foot });
  }

  function open(type, o = {}) {
    const sc = API.scope(A.S.active);
    const col = o.col ?? (sc.col || (LB.filt.col && LB.filt.col !== "none" ? LB.filt.col : ""));
    Object.assign(UP, { type, tab: o.write ? "write" : "files", files: [], col, newCol: "", tags: "", rights: "", phase: "edit", token: UP.token + 1, prompt: { name: "", kind: "general", text: "" } });
    if (o.files) addFiles(o.files);
    draw();
  }

  const readDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("read")); r.readAsDataURL(file); });
  const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("decode")); i.src = src; });
  const shrink = (el, w, h, type = "image/jpeg") => {
    const k = Math.min(1, 960 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
    return c.toDataURL(type, 0.85);
  };
  const mediaMeta = (el, url, wait) => new Promise((res, rej) => {
    const done = () => res(el);
    el.preload = "metadata";
    el.onloadedmetadata = done;
    el.onerror = () => rej(new Error("decode"));
    setTimeout(() => (wait ? res(el) : rej(new Error("timeout"))), 4000);
    el.src = url;
  });
  async function posterOf(video) {
    try {
      await new Promise((res) => {
        video.onseeked = res;
        setTimeout(res, 2500);
        video.currentTime = Math.min(1, (video.duration || 1) / 10);
      });
      return video.videoWidth ? shrink(video, video.videoWidth, video.videoHeight) : "";
    } catch { return ""; }
  }

  async function readMeta(f, type) {
    if (type === "image") {
      const png = /png|gif|webp/i.test(f.file.type);
      const src = await readDataUrl(f.file);
      const im = await loadImage(src);
      return { meta: { w: im.naturalWidth, h: im.naturalHeight }, img: shrink(im, im.naturalWidth, im.naturalHeight, png ? "image/png" : "image/jpeg") };
    }
    if (type === "sound") {
      const url = URL.createObjectURL(f.file);
      const a = await mediaMeta(new Audio(), url, true);
      return { url, meta: { dur: Math.round(a.duration) || 0, rate: "—", ch: "—" } };
    }
    if (type === "video") {
      const url = URL.createObjectURL(f.file);
      const v = document.createElement("video");
      v.muted = true;
      await mediaMeta(v, url, false);
      const img = await posterOf(v);
      return { url, img, bg: LB.bgFor(f.name), meta: { dur: Math.round(v.duration) || 0, w: v.videoWidth || 0, h: v.videoHeight || 0 } };
    }
    const text = (await f.file.text()).trim();
    if (!text) throw new Error("empty");
    return { text, kind: "general" };
  }

  function resolveCollection() {
    const name = UP.newCol.trim();
    if (!name) return UP.col;
    const found = st().collections.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    const id = `COL-${String(++st().seq.col).padStart(2, "0")}`;
    st().collections.push({ id, name, desc: "", created: A.stamp() });
    return id;
  }
  const registerTags = (tags) => { tags.forEach((t) => { if (!st().tagList.includes(t)) st().tagList.push(t); }); st().tagList.sort(); };

  async function submit() {
    const list = valid();
    if (!list.length || !UP.rights) return;
    const token = ++UP.token;
    const type = UP.type;
    const colId = resolveCollection();
    const tags = LB.parseTags(UP.tags);
    registerTags(tags);
    UP.phase = "run";
    list.forEach((f) => { f.run = "queued"; });
    draw();
    let ok = 0;
    for (const f of list) {
      if (!alive(token)) break;
      f.run = "running";
      draw();
      await sleep(300);
      if (!alive(token)) break;
      try {
        const meta = await readMeta(f, type);
        const name = type === "prompt" ? f.name.replace(/\.(txt|md)$/i, "") : f.name;
        const x = { id: API.nextId(type), type, name: API.uniqueName(type, name), size: f.size, tags: [...tags], collectionId: colId || null, rights: UP.rights, origin: "Uploaded from device", added: A.stamp(), seed: `${f.name}${f.size}`, ...meta };
        st().assets.push(x);
        f.run = "done";
        ok++;
      } catch {
        f.run = "error";
        f.msg = "Could not read the file. It may be corrupted or the browser does not support this codec.";
      }
      draw();
    }
    if (!alive(token)) { API.refresh(); if (ok) A.toast(`Uploaded ${ok} ${T[type].noun}.`); return; }
    const failed = list.filter((f) => f.run === "error").length;
    if (failed) { draw(); API.refresh(); A.toast(`Uploaded ${ok}/${list.length} ${T[type].noun}, ${failed} files failed.`, "warning"); return; }
    A.closeModal();
    API.refresh();
    A.toast(`Uploaded ${ok} ${T[type].noun} to the library.`);
  }

  function savePrompt() {
    const p = UP.prompt;
    const err = A.$("#lbp-err");
    if (!p.name.trim() || !p.text.trim()) {
      err.textContent = !p.name.trim() ? "Enter a prompt name." : "Enter the prompt content.";
      err.hidden = false;
      A.$(!p.name.trim() ? "#lbp-name" : "#lbp-text")?.classList.add("is-invalid");
      return;
    }
    if (!UP.rights) return;
    const colId = resolveCollection();
    const tags = LB.parseTags(UP.tags);
    registerTags(tags);
    const x = { id: API.nextId("prompt"), type: "prompt", name: API.uniqueName("prompt", p.name.trim()), kind: p.kind, text: p.text.trim(), size: new Blob([p.text]).size, tags, collectionId: colId || null, rights: UP.rights, origin: "Created in app", added: A.stamp(), seed: p.name };
    st().assets.push(x);
    A.closeModal();
    API.refresh();
    A.toast(`Saved prompt “${x.name}”.`);
  }

  Object.assign(A.ACT, {
    "lb-upload": (el) => open(el.dataset.v, { write: el.dataset.w === "write" }),
    "lbu-tab": (el) => { UP.tab = el.dataset.v; draw(); },
    "lbu-remove": (el) => { UP.files.splice(+el.dataset.i, 1); draw(); },
    "lbu-submit": submit,
    "lbu-save-prompt": savePrompt,
  });
  Object.assign(A.ON, {
    "lbu-file": (el) => { const files = [...el.files]; el.value = ""; if (files.length) { addFiles(files); draw(); } },
    "lbu-f": (el) => { UP[el.dataset.f] = el.value; if (el.dataset.f === "rights") draw(); },
    "lbu-p": (el) => {
      UP.prompt[el.dataset.f] = el.value;
      if (el.dataset.f === "text") {
        const v = LB.varsOf(el.value);
        const hint = A.$("#lbp-vars");
        if (hint) hint.textContent = v.length ? `Detected variables: ${v.map((x) => `{{${x}}}`).join(", ")}` : "No variables yet.";
      }
      if (el.value.trim()) { el.classList.remove("is-invalid"); const e = A.$("#lbp-err"); if (e) e.hidden = true; }
    },
  });

  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  const inDialog = (e) => (UP.phase === "edit" && UP.tab === "files" && A.$("#layer .modal.lbu") ? e.target.closest?.(".lb-drop") : null);
  const page = (e) => (!A.$("#layer .modal") && LB.TAB[A.S.active] ? e.target.closest?.(".lb-body") : null);
  const clearPage = () => A.$$(".lb-body.is-drop").forEach((el) => el.classList.remove("is-drop"));
  document.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    const z = inDialog(e);
    const p = page(e);
    if (!z && !p) return;
    e.preventDefault();
    z?.classList.add("is-over");
    p?.classList.add("is-drop");
  });
  document.addEventListener("dragleave", (e) => {
    const z = inDialog(e);
    if (z && !z.contains(e.relatedTarget)) z.classList.remove("is-over");
    const p = page(e);
    if (p && !p.contains(e.relatedTarget)) p.classList.remove("is-drop");
  });
  document.addEventListener("drop", (e) => {
    const files = e.dataTransfer?.files;
    const z = inDialog(e);
    const p = page(e);
    if (!z && !p) return;
    e.preventDefault();
    z?.classList.remove("is-over");
    clearPage();
    if (!files?.length) return;
    if (z) { addFiles(files); draw(); } else open(LB.TAB[A.S.active], { files });
  });
})();
