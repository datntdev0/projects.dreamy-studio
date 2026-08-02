(function () {
  const A = window.DSApp;
  const PJ = window.PJ;
  const U = window.NVU;
  const LB = window.LB;
  const { esc, ic } = A;
  const api = PJ.api;
  const CAP = window.DS.CAP["06"];

  const st = () => PJ.state;
  const BAD = /[<>:"/\\|?*]/;
  const ORDER = Object.keys(PJ.MODULES);
  const pad4 = (n) => String(n).padStart(4, "0");
  let D = null;

  const trCode = () => ({ "Tiếng Việt": "VI", "Tiếng Anh": "EN" }[U.N().tr.lang] || String(U.N().tr.lang).slice(0, 2).toUpperCase());
  const versionsOf = (n) => {
    const list = [["original", `Bản gốc · ${n.langName}`]];
    const pg = U.progress(n);
    if (pg.tr) list.push(["translation", `Bản dịch ${trCode()} · ${pg.tr}/${n.chapters} chương đã dịch (bản nháp)`]);
    return list;
  };
  const uniqueFolder = (name) => {
    const base = PJ.slug(name);
    const taken = new Set(st().projects.map((p) => p.folder.toLowerCase()));
    let f = `projects\\${base}`;
    for (let i = 2; taken.has(f.toLowerCase()); i++) f = `projects\\${base}-${i}`;
    return f;
  };
  const uniqueName = (name) => {
    const taken = new Set(st().projects.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; ; i++) if (!taken.has(`${name} ${i}`.toLowerCase())) return `${name} ${i}`;
  };

  function pickNovel(id) {
    D.novel = id;
    const n = U.novelById(id);
    if (!n) { D.ver = ""; D.all = true; return; }
    D.ver = versionsOf(n).at(-1)[0];
    D.all = true;
    D.from = 1;
    D.to = n.chapters;
  }

  function openCreate(from) {
    if (from) {
      D = { dup: true, tpl: from.template, name: uniqueName(`${from.name} (bản sao)`), novel: from.novel || "", ver: from.src?.kind || "", all: !from.range, from: from.range?.[0] || 1, to: from.range?.[1] || 1, modules: [...from.modules] };
      if (D.novel && !U.novelById(D.novel)) pickNovel("");
    } else D = { dup: false, tpl: "audiobook-video", name: "", novel: "", ver: "", all: true, from: 1, to: 1, modules: [...PJ.TEMPLATES["audiobook-video"].modules] };
    draw();
  }

  function draw() {
    const y = A.$("#layer .modal-body")?.scrollTop || 0;
    const n = D.novel ? U.novelById(D.novel) : null;
    const vers = n ? versionsOf(n) : [];
    const cards = Object.entries(PJ.TEMPLATES).map(([k, x]) => `<label class="opt ${D.tpl === k ? "is-on" : ""}" data-testid="pj-create-template-${k}"><input type="radio" name="pj-tpl" value="${k}" ${D.tpl === k ? "checked" : ""} data-change="pj-c-tpl">
        <div class="opt-b"><span class="t-ink pjc-t">${ic(x.icon)}${esc(x.label)}</span><span class="t-sm t-mute">${esc(x.blurb)}</span><span class="pjc-mods">${esc(x.modules.map((m) => PJ.MODULES[m].label).join(" · ") || "Tự chọn module")}</span></div></label>`).join("");
    const mods = ORDER.map((m) => `<label class="check pj-chk-row"><input type="checkbox" data-testid="pj-create-module-${m}" data-change="pj-c-mod" data-m="${m}" ${D.modules.includes(m) ? "checked" : ""}>${ic(PJ.MODULES[m].icon)}<span>${esc(PJ.MODULES[m].label)}</span><span class="t-sm t-mute">${esc(PJ.STAGES.find((s) => s[0] === PJ.MODULES[m].stage)[1])}</span></label>`).join("");
    const trPartial = D.ver === "translation" && n && U.progress(n).tr < ((D.all ? n.chapters : D.to - D.from + 1) || 0);
    A.modal({
      title: D.dup ? "Nhân bản project" : "Tạo project", eyebrow: CAP, cls: "modal-xl", testid: D.dup ? "pj-duplicate-dialog" : "pj-create-dialog",
      body: `<div class="pjc">
        <div class="pjc-l"><span class="eyebrow">Template</span><div class="opts">${cards}</div></div>
        <div class="pjc-r">
          <div class="field"><label for="pj-c-name">Tên project</label><input id="pj-c-name" data-testid="pj-create-name" class="input" value="${esc(D.name)}" placeholder="Ví dụ: Harrowmere — Audiobook" data-on="pj-c-name" autocomplete="off">
            <span class="field-hint">Thư mục: <span class="path" id="pj-c-folder">${esc(uniqueFolder(D.name || "project"))}\\</span></span></div>
          <div class="form-2">
            <div class="field"><label for="pj-c-novel">Nguồn nội dung</label><select id="pj-c-novel" data-testid="pj-create-novel" class="select" data-change="pj-c-novel"><option value="">Không gắn novel</option>${U.N().novels.map((x) => `<option value="${x.id}" ${x.id === D.novel ? "selected" : ""}>${esc(U.nameOf(x))}</option>`).join("")}</select></div>
            <div class="field"><label for="pj-c-ver">Phiên bản văn bản</label><select id="pj-c-ver" data-testid="pj-create-version" class="select" data-change="pj-c-ver" ${n ? "" : "disabled"}>${n ? U.options(vers, D.ver) : `<option>—</option>`}</select></div>
          </div>
          ${n ? `<div class="field"><label>Chương dùng cho project</label><div class="pjc-range"><label class="check"><input type="checkbox" data-testid="pj-create-all-chapters" data-change="pj-c-all" ${D.all ? "checked" : ""}>Tất cả ${n.chapters} chương</label>
              <span class="pjc-rg ${D.all ? "is-off" : ""}">từ <input class="input" type="number" min="1" max="${n.chapters}" value="${Number.isInteger(D.from) ? D.from : ""}" data-testid="pj-create-from" data-change="pj-c-from" ${D.all ? "disabled" : ""} aria-label="Từ chương"> đến <input class="input" type="number" min="1" max="${n.chapters}" value="${Number.isInteger(D.to) ? D.to : ""}" data-testid="pj-create-to" data-change="pj-c-to" ${D.all ? "disabled" : ""} aria-label="Đến chương"></span></div>
            <span class="field-hint">Project gắn với đúng phiên bản đã chọn. Khi văn bản đó thay đổi, kết quả liên quan được đánh dấu cần xem lại.</span>
            ${trPartial ? `<span class="field-hint pjc-warn">${ic("alert")}Một số chương trong phạm vi chưa có bản dịch. Chúng sẽ chưa có văn bản để dựng kịch bản.</span>` : ""}</div>` : ""}
          <div class="field"><label>Modules</label><div class="pj-chk-list is-cols">${mods}</div></div>
          ${D.dup ? `<p class="t-sm t-mute">Chỉ sao chép cấu hình project. Kịch bản, audio, hình ảnh và video đã tạo không được sao chép.</p>` : ""}
          <p class="field-err" id="pj-c-err" data-testid="pj-create-error" hidden></p>
        </div></div>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="pj-create-submit-btn" data-act="pj-c-submit">${ic(D.dup ? "copy" : "plus")}${D.dup ? "Nhân bản" : "Tạo project"}</button>`,
    });
    const b = A.$("#layer .modal-body");
    if (b) b.scrollTop = y;
    if (!y) A.$("#pj-c-name")?.focus();
  }

  function validate() {
    const name = D.name.trim();
    const n = D.novel ? U.novelById(D.novel) : null;
    if (!name) return ["#pj-c-name", "Nhập tên project."];
    if (name.length > 60) return ["#pj-c-name", "Tên project tối đa 60 ký tự."];
    if (BAD.test(name)) return ["#pj-c-name", "Tên project không được chứa các ký tự < > : \" / \\ | ? *"];
    if (st().projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) return ["#pj-c-name", "Đã có project trùng tên này."];
    if (n && !D.all) {
      const ok = Number.isInteger(D.from) && Number.isInteger(D.to) && D.from >= 1 && D.to >= D.from && D.to <= n.chapters;
      if (!ok) return [null, `Phạm vi chương không hợp lệ. Novel này có ${n.chapters} chương; “từ” phải nhỏ hơn hoặc bằng “đến”.`];
    }
    if (!D.modules.length) return [null, "Chọn ít nhất một module."];
    return null;
  }

  function submit() {
    const err = validate();
    const box = A.$("#pj-c-err");
    A.$("#pj-c-name")?.classList.remove("is-invalid");
    if (err) {
      box.textContent = err[1];
      box.hidden = false;
      if (err[0]) A.$(err[0])?.classList.add("is-invalid");
      return;
    }
    const n = D.novel ? U.novelById(D.novel) : null;
    const now = A.stamp();
    const id = `PRJ-${pad4(++st().seq)}`;
    const name = D.name.trim();
    const p = {
      id, name, folder: uniqueFolder(name), template: D.tpl, desc: "", novel: n ? n.id : null,
      src: n ? { kind: D.ver, lang: D.ver === "translation" ? trCode() : n.lang } : null, range: n ? (D.all ? [1, n.chapters] : [D.from, D.to]) : null,
      modules: [...D.modules], prog: Object.fromEntries(D.modules.map((m) => [m, { state: "idle", done: 0, total: 0, note: "" }])),
      outputs: [], attention: [], activity: [[now, D.dup ? "Nhân bản cấu hình từ project khác" : `Tạo project từ template ${PJ.TEMPLATES[D.tpl].label}`]], archived: false, created: now, updated: now, opened: now,
    };
    st().projects.unshift(p);
    const dup = D.dup;
    D = null;
    A.closeModal();
    api.catalog().sel = [id];
    api.openProject(id);
    A.toast(dup ? `Đã nhân bản thành “${name}”.` : `Đã tạo project “${name}”.`);
  }

  let pendingDel = [];
  function openDelete(ids) {
    pendingDel = ids.filter(api.byId);
    if (!pendingDel.length) return;
    const list = pendingDel.map(api.byId);
    const one = list.length === 1;
    const pk = window.DT ? window.DT.state.packages.filter((k) => pendingDel.includes(k.projectId)) : [];
    const posted = pk.filter((k) => ["published", "partial"].includes(window.DT.pkgStatus(k))).length;
    const outs = list.reduce((a, p) => a + p.outputs.length, 0);
    A.modal({
      title: one ? "Xóa project" : `Xóa ${list.length} project`, eyebrow: CAP, testid: "pj-delete-dialog",
      body: `<div class="del-list">${list.slice(0, 8).map((p) => `<div class="del-row"><span class="pj-th is-md" style="background:${esc(api.bgOf(p))}"></span><div><div class="t-ink">${esc(p.name)}</div><div class="t-sm t-mute">${esc(api.tpl(p).label)} · ${(PJ.sizeOf(p) ? LB.bytes(PJ.sizeOf(p)) : "0 B")} · <span class="path">${esc(p.folder)}\\</span></div></div></div>`).join("")}${list.length > 8 ? `<span class="t-sm t-mute">và ${list.length - 8} project khác</span>` : ""}</div>
        <div class="ld-warn">${ic("alert")}<span>Thư mục project và mọi tài nguyên bên trong (kịch bản, audio, hình ảnh${outs ? `, ${outs} video thành phẩm` : ""}) sẽ bị xóa khỏi máy. Không thể hoàn tác.</span></div>
        ${pk.length ? `<div class="ld-warn">${ic("alert")}<span>${pk.length} package của ${one ? "project này" : "các project này"} cũng bị xóa.${posted ? ` Các bài đã đăng trên nền tảng (${posted} package) không bị gỡ, bạn cần xóa chúng trực tiếp trên nền tảng.` : ""}</span></div>` : ""}
        <p class="t-sm t-mute">Tài nguyên trong thư viện chung và novel nguồn không bị ảnh hưởng.</p>
        <label class="check"><input type="checkbox" id="pj-del-ok" data-testid="pj-delete-confirm-check" data-change="pj-del-ok"><span>Tôi hiểu việc này sẽ xóa vĩnh viễn ${one ? "project" : `${list.length} project`}.</span></label>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-danger" id="pj-del-go" data-testid="pj-delete-submit-btn" data-act="pj-del-confirm" disabled>${ic("trash")}Xóa${one ? "" : ` ${list.length}`}</button>`,
    });
  }

  Object.assign(A.ACT, {
    "pj-new": () => openCreate(),
    "pj-dup": (el) => { const p = api.byId(el.dataset.id); if (p) openCreate(p); },
    "pj-c-submit": submit,
    "pj-del": (el) => openDelete(el?.dataset?.id ? [el.dataset.id] : api.selIds()),
    "pj-del-confirm": () => {
      const ids = new Set(pendingDel);
      const first = api.byId(pendingDel[0])?.name;
      const n = ids.size;
      window.DT?.dropProjects([...ids]);
      st().projects = st().projects.filter((p) => !ids.has(p.id));
      [...A.S.tabs].filter((t) => t.startsWith("package:") && !window.DT?.pkgById(t.split(":")[1])).forEach((t) => { A.closeTab(t); delete A.ITEMS[t]; });
      [...A.S.tabs].filter((t) => [...ids].some((id) => t === `project:${id}` || t.startsWith(`pmod:${id}:`))).forEach((t) => { A.closeTab(t); delete A.ITEMS[t]; });
      api.catalog().sel = api.catalog().sel.filter((i) => !ids.has(i));
      pendingDel = [];
      A.closeModal();
      api.refresh();
      A.toast(n === 1 ? `Đã xóa “${first}”.` : `Đã xóa ${n} project.`);
    },
  });

  Object.assign(A.ON, {
    "pj-c-tpl": (el) => { D.tpl = el.value; D.modules = [...PJ.TEMPLATES[el.value].modules]; draw(); },
    "pj-c-name": (el) => {
      D.name = el.value;
      const f = A.$("#pj-c-folder");
      if (f) f.textContent = `${uniqueFolder(D.name.trim() || "project")}\\`;
      el.classList.remove("is-invalid");
      const e = A.$("#pj-c-err");
      if (e) e.hidden = true;
    },
    "pj-c-novel": (el) => { pickNovel(el.value); draw(); },
    "pj-c-ver": (el) => { D.ver = el.value; draw(); },
    "pj-c-all": (el) => { D.all = el.checked; draw(); },
    "pj-c-from": (el) => { D.from = parseInt(el.value, 10); draw(); },
    "pj-c-to": (el) => { D.to = parseInt(el.value, 10); draw(); },
    "pj-c-mod": (el) => {
      const m = el.dataset.m;
      D.modules = el.checked ? [...new Set([...D.modules, m])].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)) : D.modules.filter((x) => x !== m);
      draw();
    },
    "pj-del-ok": (el) => { const b = A.$("#pj-del-go"); if (b) b.disabled = !el.checked; },
  });
})();
