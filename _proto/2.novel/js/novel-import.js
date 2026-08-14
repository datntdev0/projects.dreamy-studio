/*
 * Import a novel from a package: 3-step wizard.
 *  1. Choose a file (.dsnovel / .zip) + suggested structure
 *  2. Check the package (simulated) and the result
 *  3. Preview, edit metadata, then import
 * All data is simulated; the package is not actually read.
 */
(function () {
  const A = window.DSApp;
  const U = window.NVU;
  const { esc, ic } = A;

  const CAP = window.DS.CAP["02"];
  const LANGS = [["EN", "English"], ["VI", "Vietnamese"], ["ZH", "Chinese"], ["JA", "Japanese"], ["KO", "Korean"]];
  const COVERS = [
    ["var(--acc-midnight)", "var(--primary)", "var(--acc-twilight)"],
    ["var(--acc-sunset)", "var(--secondary)", "var(--acc-midnight)"],
    ["var(--acc-midnight)", "var(--acc-breeze)", "var(--acc-sunset)"],
  ];
  const SAMPLE = { name: "ember-harbor-chronicle.dsnovel", size: 184320, sample: true };
  const STEPS = ["Choose file", "Check", "Preview and edit"];
  const TREE = "<name>.dsnovel | <name>.zip\n├─ manifest.json    name, author, language\n├─ cover.jpg        optional\n└─ chapters\\\n   ├─ 001.md\n   ├─ 002.md\n   └─ …";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const IW = { step: 1, file: null, token: 0, state: "idle", checks: [], pct: 0, error: "", info: null, form: null };

  const sizeText = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const titleFrom = (name) => name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  const langName = (code) => LANGS.find((l) => l[0] === code)?.[1] || code;
  const alive = (token) => token === IW.token && !!A.$("#layer .modal.imw");

  /* ---------------- step bar ---------------- */
  function stepsBar() {
    return `<ol class="imw-steps" aria-label="Novel import steps">${STEPS.map((label, i) => {
      const n = i + 1;
      const cls = n === IW.step ? "is-active" : n < IW.step ? "is-done" : "";
      return `<li class="imw-step ${cls}" ${n === IW.step ? 'aria-current="step"' : ""}><span class="imw-n">${n < IW.step ? ic("check") : n}</span><span class="imw-l">${label}</span></li>`;
    }).join("")}</ol>`;
  }

  /* ---------------- step 1 ---------------- */
  function stepFile() {
    const f = IW.file;
    const drop = f
      ? `<div class="imw-file">${ic("package")}<div class="imw-file-t"><div class="t-ink imw-file-n">${esc(f.name)}</div><div class="t-sm t-mute">${sizeText(f.size)}${f.sample ? " · sample package" : ""}</div></div>
          <button type="button" class="btn btn-sm btn-ghost" data-act="imw-clear">${ic("x")}Deselect</button></div>`
      : `${ic("upload", "imw-up")}<div class="imw-drop-t">Drag and drop a file here</div><div class="t-sm t-mute">or</div>
          <label class="btn">Choose files…<input type="file" accept=".dsnovel,.zip" hidden data-change="imw-file"></label>
          <div class="t-sm t-mute">Accepts .dsnovel or .zip</div>`;
    return `<div class="imw-drop ${f ? "has-file" : ""}" role="group" aria-label="Package file drop area">${drop}</div>
      <div class="field"><span class="eyebrow">Suggested package structure</span><pre class="tree-block">${esc(TREE)}</pre>
        <span class="field-hint">No package yet? <a data-act="imw-sample" tabindex="0">Use the sample package</a> to try quickly.</span></div>`;
  }

  /* ---------------- step 2 ---------------- */
  function stepCheck() {
    const icon = (s) => (s === "done" ? ic("check") : s === "warn" ? ic("alert") : s === "error" ? ic("x") : `<span class="dot dot-running"></span>`);
    const rows = IW.checks.map((c) => `<div class="ld-step is-${c.state}">${icon(c.state)}<span>${esc(c.label)}</span>${c.note ? `<span class="ld-detail">${esc(c.note)}</span>` : ""}</div>`).join("");
    let result = "";
    if (IW.state === "ok") {
      const warns = IW.checks.filter((c) => c.state === "warn").length;
      result = `<div class="imw-result is-ok">${ic("check")}<div><b>Valid package</b>
        <div class="t-sm">${IW.info.chapters} chapters · ${U.fmt(IW.info.words)} words · detected language: ${esc(langName(IW.info.lang))}${warns ? ` · ${warns} warnings that do not block the import` : ""}</div></div></div>`;
    } else if (IW.state === "fail") {
      result = `<div class="imw-result is-bad">${ic("x")}<div><b>Invalid package</b><div class="t-sm">${esc(IW.error)}</div></div></div>`;
    }
    return `<div class="field"><span class="eyebrow">Checks: <span class="path">${esc(IW.file.name)}</span></span>
        <div class="progress" aria-hidden="true"><i style="width:${IW.pct}%"></i></div></div>
      <div class="ld-steps imw-checks" role="status" aria-live="polite">${rows}</div>${result}`;
  }

  async function runCheck() {
    const token = ++IW.token;
    const f = IW.file;
    Object.assign(IW, { step: 2, state: "running", checks: [], pct: 0, error: "", info: null });
    draw();
    const valid = /\.(dsnovel|zip)$/i.test(f.name);
    const seed = Math.abs([...f.name.replace(/\.[^.]+$/, "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7));
    const chapters = 8 + (seed % 17);
    const hasCover = !f.sample && seed % 2 === 0;
    const defs = [
      ["Check the file format (.dsnovel / .zip)", valid ? "" : "fail", `“${f.name}” is not a Dreamy Studio package. Only .dsnovel or .zip files are accepted.`],
      ["Open package", ""],
      ["Read manifest.json", ""],
      ["Check the chapters\\ folder", ""],
      ["Read the chapter list", ""],
      ["Look for the cover image (cover.jpg)", hasCover ? "" : "warn", "", hasCover ? "" : "none, using the default cover"],
    ];
    for (let i = 0; i < defs.length; i++) {
      const [label, flag, msg, note] = defs[i];
      IW.checks.push({ label, state: "running" });
      draw();
      await sleep(260);
      if (!alive(token)) return;
      const c = IW.checks[i];
      if (flag === "fail") {
        Object.assign(c, { state: "error" });
        Object.assign(IW, { state: "fail", error: msg });
        draw();
        return;
      }
      c.state = flag === "warn" ? "warn" : "done";
      if (note) c.note = note;
      IW.pct = Math.round(((i + 1) / defs.length) * 100);
    }
    IW.info = { chapters, words: chapters * 2300, lang: "EN" };
    IW.state = "ok";
    if (!IW.form || IW.form.src !== f.name) {
      IW.form = { src: f.name, title: titleFrom(f.name), display: "", author: "", lang: "EN", desc: "", tags: "" };
    }
    draw();
  }

  /* ---------------- step 3 ---------------- */
  const parseTags = (text) => {
    const out = [];
    String(text).split(",").forEach((t) => { const n = U.normTag(t); if (n && !out.includes(n)) out.push(n); });
    return out.slice(0, 12);
  };
  const dupText = (title) => {
    const t = title.trim().toLowerCase();
    return t && U.N().novels.some((n) => n.title.trim().toLowerCase() === t) ? "A novel with this name already exists. You can still import it, but consider renaming it to tell them apart." : "";
  };
  const previewNovel = () => ({ cover: COVERS[U.N().novels.length % COVERS.length] });

  function stepPreview() {
    const f = IW.form;
    const info = IW.info;
    const dup = dupText(f.title);
    return `<div class="imw-form">
      <div class="imw-pv">${U.cover(previewNovel(), "cover-lg")}
        ${U.kv([["Chapters", info.chapters], ["Words", U.fmt(info.words)]])}</div>
      <div class="imw-fields">
        <div class="field"><label for="imw-display">Display name</label><input id="imw-display" class="input" value="${esc(f.display)}" placeholder="Leave empty to use the original name" data-on="imw-f" data-f="display" autocomplete="off"></div>
        <div class="field"><label for="imw-title">Original name</label><input id="imw-title" class="input" value="${esc(f.title)}" data-on="imw-f" data-f="title" autocomplete="off">
          <p class="field-err" id="imw-err" hidden>Enter the original name of the work.</p><p class="field-err imw-dup" id="imw-dup" ${dup ? "" : "hidden"}>${esc(dup)}</p></div>
        <div class="form-2"><div class="field"><label for="imw-author">Author</label><input id="imw-author" class="input" value="${esc(f.author)}" data-on="imw-f" data-f="author" autocomplete="off"></div>
          <div class="field"><label for="imw-lang">Source language</label><select id="imw-lang" class="select" data-on="imw-f" data-f="lang">${U.options(LANGS, f.lang)}</select></div></div>
        <div class="field"><label for="imw-desc">Description</label><textarea id="imw-desc" class="textarea" rows="3" data-on="imw-f" data-f="desc">${esc(f.desc)}</textarea></div>
        <div class="field"><label for="imw-tags">Tags</label><input id="imw-tags" class="input" value="${esc(f.tags)}" placeholder="fantasy, dark, harbor" data-on="imw-f" data-f="tags" autocomplete="off">
          <span class="field-hint">Separated by commas, up to 12 tags.</span></div>
      </div></div>`;
  }

  /* ---------------- render ---------------- */
  function draw() {
    let body;
    let foot;
    if (IW.step === 1) {
      body = stepFile();
      foot = `<button class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" data-act="imw-check" ${IW.file ? "" : "disabled"}>Check</button>`;
    } else if (IW.step === 2) {
      body = stepCheck();
      const running = IW.state === "running";
      foot = `<button class="btn" data-act="close-modal">Cancel</button><span class="spacer"></span>
        <button class="btn" data-act="imw-back1" ${running ? "disabled" : ""}>Choose another file</button>
        <button class="btn btn-primary" data-act="imw-next" ${IW.state === "ok" ? "" : "disabled"}>Next</button>`;
    } else {
      body = stepPreview();
      foot = `<button class="btn" data-act="close-modal">Cancel</button><span class="spacer"></span>
        <button class="btn" data-act="imw-back2">Back</button><button class="btn btn-primary" data-act="imw-import">Import novel</button>`;
    }
    A.modal({ title: "Import novel from package", eyebrow: CAP, cls: "modal-lg imw", body: `${stepsBar()}${body}`, foot });
  }

  function open() {
    Object.assign(IW, { step: 1, file: null, token: IW.token + 1, state: "idle", checks: [], pct: 0, error: "", info: null, form: null });
    draw();
  }

  function setFile(name, size, sample = false) {
    IW.file = { name, size, sample };
    draw();
  }

  /* ---------------- actions ---------------- */
  function doImport() {
    const f = IW.form;
    const title = f.title.trim();
    if (!title) {
      const err = A.$("#imw-err");
      if (err) err.hidden = false;
      A.$("#imw-title")?.classList.add("is-invalid");
      A.$("#imw-title")?.focus();
      return;
    }
    const list = U.N().novels;
    list.unshift({
      id: U.nextNovelId(), title, display: f.display.trim() === title ? "" : f.display.trim(), author: f.author.trim() || "Unknown", lang: f.lang, langName: langName(f.lang),
      chapters: IW.info.chapters, words: IW.info.words, updated: A.stamp(), origin: "Imported from package",
      desc: f.desc.trim() || "Novel imported from a package. Chapter content is not in the prototype.", cover: COVERS[list.length % COVERS.length], tags: parseTags(f.tags),
    });
    A.closeModal();
    A.rerender();
    A.renderExplorer();
    A.toast(`Imported “${title}” (${IW.info.chapters} chapters).`);
  }

  Object.assign(A.ACT, {
    "nm-import": open,
    "imw-sample": () => setFile(SAMPLE.name, SAMPLE.size, true),
    "imw-clear": () => { IW.file = null; draw(); },
    "imw-check": () => { if (IW.file) runCheck(); },
    "imw-back1": () => { IW.token++; Object.assign(IW, { step: 1, state: "idle" }); draw(); },
    "imw-next": () => { if (IW.state === "ok") { IW.step = 3; draw(); } },
    "imw-back2": () => { IW.step = 2; draw(); },
    "imw-import": doImport,
  });

  Object.assign(A.ON, {
    "imw-file": (el) => {
      const file = el.files[0];
      if (file) setFile(file.name, file.size);
    },
    "imw-f": (el) => {
      const f = IW.form;
      f[el.dataset.f] = el.value;
      if (el.dataset.f === "title") {
        const dup = A.$("#imw-dup");
        const text = dupText(el.value);
        if (dup) { dup.textContent = text; dup.hidden = !text; }
        if (el.value.trim()) { el.classList.remove("is-invalid"); const e = A.$("#imw-err"); if (e) e.hidden = true; }
      }
    },
  });

  /* ---------------- drag and drop ---------------- */
  const zone = (e) => (IW.step === 1 && A.$("#layer .modal.imw") ? e.target.closest?.(".imw-drop") : null);
  document.addEventListener("dragover", (e) => {
    const z = zone(e);
    if (!z) return;
    e.preventDefault();
    z.classList.add("is-over");
  });
  document.addEventListener("dragleave", (e) => {
    const z = zone(e);
    if (z && !z.contains(e.relatedTarget)) z.classList.remove("is-over");
  });
  document.addEventListener("drop", (e) => {
    const z = zone(e);
    if (!z) return;
    e.preventDefault();
    z.classList.remove("is-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) setFile(file.name, file.size);
  });
})();
