/*
 * Nhập novel từ package: wizard 3 bước.
 *  1. Chọn file (.dsnovel / .zip) + cấu trúc gợi ý
 *  2. Kiểm tra package (mô phỏng) và kết quả
 *  3. Xem trước, chỉnh sửa metadata rồi nhập
 * Mọi dữ liệu là giả lập; package không thực sự được đọc.
 */
(function () {
  const A = window.DSApp;
  const U = window.NVU;
  const { esc, ic } = A;

  const CAP = window.DS.CAP["02"];
  const LANGS = [["EN", "Tiếng Anh"], ["VI", "Tiếng Việt"], ["ZH", "Tiếng Trung"], ["JA", "Tiếng Nhật"], ["KO", "Tiếng Hàn"]];
  const COVERS = [
    ["var(--acc-midnight)", "var(--primary)", "var(--acc-twilight)"],
    ["var(--acc-sunset)", "var(--secondary)", "var(--acc-midnight)"],
    ["var(--acc-midnight)", "var(--acc-breeze)", "var(--acc-sunset)"],
  ];
  const SAMPLE = { name: "ember-harbor-chronicle.dsnovel", size: 184320, sample: true };
  const STEPS = ["Chọn file", "Kiểm tra", "Xem trước và chỉnh sửa"];
  const TREE = "<tên>.dsnovel | <tên>.zip\n├─ manifest.json    tên, tác giả, ngôn ngữ\n├─ cover.jpg        tùy chọn\n└─ chapters\\\n   ├─ 001.md\n   ├─ 002.md\n   └─ …";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const IW = { step: 1, file: null, token: 0, state: "idle", checks: [], pct: 0, error: "", info: null, form: null };

  const sizeText = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const titleFrom = (name) => name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  const langName = (code) => LANGS.find((l) => l[0] === code)?.[1] || code;
  const alive = (token) => token === IW.token && !!A.$("#layer .modal.imw");

  /* ---------------- thanh bước ---------------- */
  function stepsBar() {
    return `<ol class="imw-steps" aria-label="Các bước nhập novel">${STEPS.map((label, i) => {
      const n = i + 1;
      const cls = n === IW.step ? "is-active" : n < IW.step ? "is-done" : "";
      return `<li class="imw-step ${cls}" ${n === IW.step ? 'aria-current="step"' : ""}><span class="imw-n">${n < IW.step ? ic("check") : n}</span><span class="imw-l">${label}</span></li>`;
    }).join("")}</ol>`;
  }

  /* ---------------- bước 1 ---------------- */
  function stepFile() {
    const f = IW.file;
    const drop = f
      ? `<div class="imw-file">${ic("package")}<div class="imw-file-t"><div class="t-ink imw-file-n">${esc(f.name)}</div><div class="t-sm t-mute">${sizeText(f.size)}${f.sample ? " · package mẫu" : ""}</div></div>
          <button type="button" class="btn btn-sm btn-ghost" data-act="imw-clear">${ic("x")}Bỏ chọn</button></div>`
      : `${ic("upload", "imw-up")}<div class="imw-drop-t">Kéo thả file vào đây</div><div class="t-sm t-mute">hoặc</div>
          <label class="btn">Chọn file…<input type="file" accept=".dsnovel,.zip" hidden data-change="imw-file"></label>
          <div class="t-sm t-mute">Chấp nhận .dsnovel hoặc .zip</div>`;
    return `<div class="imw-drop ${f ? "has-file" : ""}" role="group" aria-label="Vùng chọn file package">${drop}</div>
      <div class="field"><span class="eyebrow">Cấu trúc package gợi ý</span><pre class="tree-block">${esc(TREE)}</pre>
        <span class="field-hint">Chưa có package? <a data-act="imw-sample" tabindex="0">Dùng package mẫu</a> để thử nhanh.</span></div>`;
  }

  /* ---------------- bước 2 ---------------- */
  function stepCheck() {
    const icon = (s) => (s === "done" ? ic("check") : s === "warn" ? ic("alert") : s === "error" ? ic("x") : `<span class="dot dot-running"></span>`);
    const rows = IW.checks.map((c) => `<div class="ld-step is-${c.state}">${icon(c.state)}<span>${esc(c.label)}</span>${c.note ? `<span class="ld-detail">${esc(c.note)}</span>` : ""}</div>`).join("");
    let result = "";
    if (IW.state === "ok") {
      const warns = IW.checks.filter((c) => c.state === "warn").length;
      result = `<div class="imw-result is-ok">${ic("check")}<div><b>Package hợp lệ</b>
        <div class="t-sm">${IW.info.chapters} chương · ${U.fmt(IW.info.words)} từ · ngôn ngữ phát hiện: ${esc(langName(IW.info.lang))}${warns ? ` · ${warns} cảnh báo không chặn việc nhập` : ""}</div></div></div>`;
    } else if (IW.state === "fail") {
      result = `<div class="imw-result is-bad">${ic("x")}<div><b>Package không hợp lệ</b><div class="t-sm">${esc(IW.error)}</div></div></div>`;
    }
    return `<div class="field"><span class="eyebrow">Kiểm tra: <span class="path">${esc(IW.file.name)}</span></span>
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
      ["Kiểm tra định dạng file (.dsnovel / .zip)", valid ? "" : "fail", `“${f.name}” không phải package Dreamy Studio. Chỉ chấp nhận file .dsnovel hoặc .zip.`],
      ["Mở package", ""],
      ["Đọc manifest.json", ""],
      ["Kiểm tra thư mục chapters\\", ""],
      ["Đọc danh sách chương", ""],
      ["Tìm ảnh bìa (cover.jpg)", hasCover ? "" : "warn", "", hasCover ? "" : "không có, dùng bìa mặc định"],
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

  /* ---------------- bước 3 ---------------- */
  const parseTags = (text) => {
    const out = [];
    String(text).split(",").forEach((t) => { const n = U.normTag(t); if (n && !out.includes(n)) out.push(n); });
    return out.slice(0, 12);
  };
  const dupText = (title) => {
    const t = title.trim().toLowerCase();
    return t && U.N().novels.some((n) => n.title.trim().toLowerCase() === t) ? "Đã có novel trùng tên này. Bạn vẫn có thể nhập, nhưng nên đổi tên để dễ phân biệt." : "";
  };
  const previewNovel = () => ({ cover: COVERS[U.N().novels.length % COVERS.length] });

  function stepPreview() {
    const f = IW.form;
    const info = IW.info;
    const dup = dupText(f.title);
    return `<div class="imw-form">
      <div class="imw-pv">${U.cover(previewNovel(), "cover-lg")}
        ${U.kv([["Chương", info.chapters], ["Số từ", U.fmt(info.words)]])}</div>
      <div class="imw-fields">
        <div class="field"><label for="imw-display">Tên hiển thị</label><input id="imw-display" class="input" value="${esc(f.display)}" placeholder="Để trống thì dùng tên gốc" data-on="imw-f" data-f="display" autocomplete="off"></div>
        <div class="field"><label for="imw-title">Tên gốc</label><input id="imw-title" class="input" value="${esc(f.title)}" data-on="imw-f" data-f="title" autocomplete="off">
          <p class="field-err" id="imw-err" hidden>Nhập tên gốc của tác phẩm.</p><p class="field-err imw-dup" id="imw-dup" ${dup ? "" : "hidden"}>${esc(dup)}</p></div>
        <div class="form-2"><div class="field"><label for="imw-author">Tác giả</label><input id="imw-author" class="input" value="${esc(f.author)}" data-on="imw-f" data-f="author" autocomplete="off"></div>
          <div class="field"><label for="imw-lang">Ngôn ngữ gốc</label><select id="imw-lang" class="select" data-on="imw-f" data-f="lang">${U.options(LANGS, f.lang)}</select></div></div>
        <div class="field"><label for="imw-desc">Mô tả</label><textarea id="imw-desc" class="textarea" rows="3" data-on="imw-f" data-f="desc">${esc(f.desc)}</textarea></div>
        <div class="field"><label for="imw-tags">Tags</label><input id="imw-tags" class="input" value="${esc(f.tags)}" placeholder="fantasy, dark, harbor" data-on="imw-f" data-f="tags" autocomplete="off">
          <span class="field-hint">Cách nhau bằng dấu phẩy, tối đa 12 tag.</span></div>
      </div></div>`;
  }

  /* ---------------- vẽ ---------------- */
  function draw() {
    let body;
    let foot;
    if (IW.step === 1) {
      body = stepFile();
      foot = `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-act="imw-check" ${IW.file ? "" : "disabled"}>Kiểm tra</button>`;
    } else if (IW.step === 2) {
      body = stepCheck();
      const running = IW.state === "running";
      foot = `<button class="btn" data-act="close-modal">Hủy</button><span class="spacer"></span>
        <button class="btn" data-act="imw-back1" ${running ? "disabled" : ""}>Chọn file khác</button>
        <button class="btn btn-primary" data-act="imw-next" ${IW.state === "ok" ? "" : "disabled"}>Tiếp</button>`;
    } else {
      body = stepPreview();
      foot = `<button class="btn" data-act="close-modal">Hủy</button><span class="spacer"></span>
        <button class="btn" data-act="imw-back2">Quay lại</button><button class="btn btn-primary" data-act="imw-import">Nhập novel</button>`;
    }
    A.modal({ title: "Nhập novel từ package", eyebrow: CAP, cls: "modal-lg imw", body: `${stepsBar()}${body}`, foot });
  }

  function open() {
    Object.assign(IW, { step: 1, file: null, token: IW.token + 1, state: "idle", checks: [], pct: 0, error: "", info: null, form: null });
    draw();
  }

  function setFile(name, size, sample = false) {
    IW.file = { name, size, sample };
    draw();
  }

  /* ---------------- hành động ---------------- */
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
      id: U.nextNovelId(), title, display: f.display.trim() === title ? "" : f.display.trim(), author: f.author.trim() || "Chưa rõ", lang: f.lang, langName: langName(f.lang),
      chapters: IW.info.chapters, words: IW.info.words, updated: A.stamp(), origin: "Nhập từ package",
      desc: f.desc.trim() || "Novel nhập từ package. Nội dung chương không có trong prototype.", cover: COVERS[list.length % COVERS.length], tags: parseTags(f.tags),
    });
    A.closeModal();
    A.rerender();
    A.renderExplorer();
    A.toast(`Đã nhập “${title}” (${IW.info.chapters} chương).`);
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

  /* ---------------- kéo thả ---------------- */
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
