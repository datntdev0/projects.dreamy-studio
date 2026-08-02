(function () {
  const A = window.DSApp;
  const DT = window.DT;
  const LB = window.LB;
  const U = window.NVU;
  const { esc, ic } = A;
  const CAP = window.DS.CAP["10"];
  const P = DT.PLATFORMS;
  const PK = DT.pkApi;
  const CH = DT.chApi;

  let PB = null;

  const doneState = (r) => r && (r.state === "ok" || r.state === "scheduled");
  const pending = (k) => k.targets.filter((t) => !doneState(k.results[t.ch]));
  const visLabel = (c, v) => P[c.platform].vis.find((x) => x[0] === v)?.[1] || v;
  const fmtWhen = (s) => String(s).replace("T", " ");
  const rid = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36).padEnd(8, "x").slice(0, 8); };

  function rightsRows(p) {
    const used = LB.state.assets.filter((x) => x.used.some((o) => o.name === p.name));
    const nv = window.NVU.novelById(p.novel);
    const rows = used.map((x) => ({ name: x.name, kind: LB.TYPES[x.type].label, rights: LB.RIGHTS[x.rights], warn: x.rights === "other" }));
    if (nv) rows.unshift({ name: window.NVU.nameOf(nv), kind: "Văn bản gốc", rights: `Tác giả: ${nv.author} · do bạn xác nhận`, warn: false });
    return rows;
  }

  function openPublish(id) {
    const k = PK.byId(id);
    if (!k) return;
    PB = { id, ok: false };
    const ref = PK.outOf(k);
    const errs = PK.check(k).filter((x) => x.level === "error");
    if (errs.length || !ref) {
      A.modal({
        title: "Chưa thể đăng", eyebrow: CAP, testid: "pb-blocked-dialog",
        body: `<p class="t-sm">Package còn ${errs.length} lỗi cần sửa trước khi đăng.</p><div class="pk-checks">${errs.map((x) => `<div class="pk-cr is-error">${ic("x-circle")}<span>${esc(x.text)}</span></div>`).join("")}</div>`,
        foot: `<button class="btn btn-primary" data-act="close-modal">Đóng</button>`,
      });
      return;
    }
    const todo = pending(k);
    const rows = rightsRows(ref.p);
    const anyPublicNow = todo.some((t) => t.vis === "public" && !t.sched);
    const plats = [...new Set(todo.map((t) => P[DT.chById(t.ch).platform].label))];
    const sends = [
      ["film", `Video ${ref.o.name}`, LB.bytes(ref.o.size)],
      ...(k.thumb ? [["image", `Thumbnail ${LB.state.assets.find((x) => x.id === k.thumb)?.name || ""}`, ""]] : []),
      ["pen", "Tiêu đề, mô tả và tags", ""],
      ...(k.chapters.trim() ? [["list", "Mốc thời gian (chapters)", ""]] : []),
      ["shield", "Khai báo nhãn AI và đối tượng người xem", ""],
    ];
    A.modal({
      title: "Xem lại và xác nhận đăng", eyebrow: CAP, cls: "modal-xl", testid: "pb-dialog",
      body: `<div class="pb">
        <section class="pb-sec"><span class="eyebrow">Sẽ đăng lên ${todo.length} kênh</span><div class="pb-tg">${todo.map((t) => {
          const c = DT.chById(t.ch);
          return `<div class="pb-row" data-testid="pb-target-${t.ch}">${CH.avatar(c)}<div class="pb-b"><div class="t-ink">${esc(c.name)} <span class="t-mute t-sm">${esc(c.handle)} · ${esc(P[c.platform].label)}</span></div>
              <div class="t-sm t-mute">${t.sched ? `Hẹn giờ ${esc(fmtWhen(t.sched))}` : "Đăng ngay"}${c.platform === "youtube" ? ` · ${t.kids === "yes" ? "Dành cho trẻ em" : "Không dành cho trẻ em"}` : ""} · Nhãn AI: ${t.ai ? "bật" : "tắt"}</div></div>
            <span class="badge ${t.vis === "public" ? "badge-warning" : ""}">${esc(visLabel(c, t.vis).toUpperCase())}</span></div>`;
        }).join("")}</div>
          ${anyPublicNow ? `<div class="ld-warn">${ic("alert")}<span>Video sẽ hiển thị công khai ngay khi đăng xong.</span></div>` : ""}</section>
        <section class="pb-sec"><span class="eyebrow">Tiêu đề</span><div class="t-ink">${esc(k.title)}</div></section>
        <section class="pb-sec" data-testid="pb-data-section"><span class="eyebrow">Dữ liệu sẽ rời máy tính của bạn</span><div class="pb-send">${sends.map(([i, t, n]) => `<div class="pb-send-r">${ic(i)}<span class="tree-label">${esc(t)}</span><span class="mono t-mute">${esc(n)}</span></div>`).join("")}</div>
          <p class="t-sm t-mute">Nhận bởi: ${esc(plats.join(", "))}, qua tài khoản bạn đã kết nối. Dreamy Studio không lưu bản sao nội dung trên máy chủ.</p></section>
        <section class="pb-sec" data-testid="pb-rights-section"><span class="eyebrow">Quyền sử dụng các tài nguyên trong video</span>
          ${rows.length ? `<table class="table"><tbody>${rows.map((r) => `<tr><td class="t-ink">${esc(r.name)}</td><td class="t-mute">${esc(r.kind)}</td><td>${r.warn ? `<span class="badge badge-warning">${esc(r.rights.toUpperCase())}</span>` : `<span class="t-sm">${esc(r.rights)}</span>`}</td></tr>`).join("")}</tbody></table>` : `<p class="t-sm t-mute">Project không dùng tài nguyên từ thư viện hay novel.</p>`}
          ${rows.some((r) => r.warn) ? `<div class="ld-warn">${ic("alert")}<span>Có tài nguyên chưa xác định quyền sử dụng. Hãy kiểm tra lại trước khi công bố.</span></div>` : ""}
          <p class="t-sm t-mute">Dreamy Studio không xác minh bản quyền. Nếu video dùng giọng clone hoặc hình ảnh mô phỏng người thật, bạn cần có sự đồng ý phù hợp.</p></section>
        ${k.reviewed ? "" : `<div class="ld-warn" data-testid="pb-unreviewed">${ic("alert")}<span>Bạn chưa xem lại thành phẩm. <button type="button" class="pk-link" data-testid="pb-review-btn" data-act="pk-review" data-id="${k.id}">Xem lại ngay</button> (hộp thoại này sẽ đóng, mở lại bằng nút Đăng).</span></div>`}
        <label class="check pb-ok"><input type="checkbox" id="pb-ok" data-testid="pb-confirm-check" data-change="pb-ok"><span>Tôi xác nhận có quyền công bố tất cả tài nguyên trong video này lên ${esc(plats.join(" và "))}, và tôi chịu trách nhiệm về nội dung được đăng lên tài khoản của mình.</span></label>
      </div>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" id="pb-go" data-testid="pb-confirm-btn" data-act="pb-confirm" disabled>${ic("send-up")}Xác nhận và đăng</button>`,
    });
  }

  function finishTarget(k, chId) {
    const t = k.targets.find((x) => x.ch === chId);
    const c = DT.chById(chId);
    const now = A.stamp();
    const base = { name: c ? c.name : chId, at: now };
    if (!c || !t) { k.results[chId] = { ...base, state: "error", error: "channel_not_found" }; return; }
    if (c.status !== "ok") { k.results[chId] = { ...base, state: "error", error: "invalid_grant" }; return; }
    const url = c.platform === "youtube" ? `https://youtu.be/${rid(k.id + chId)}` : `https://www.tiktok.com/${c.handle}/video/${rid(k.id + chId).replace(/[a-z]/g, (x) => x.charCodeAt(0) % 10)}`;
    k.results[chId] = { ...base, state: t.sched ? "scheduled" : "ok", url, when: t.sched ? fmtWhen(t.sched) : "" };
    c.lastUsed = now;
  }
  function finalize(k) {
    const ok = k.targets.filter((t) => doneState(k.results[t.ch])).length;
    k.status = ok === k.targets.length ? "published" : ok ? "partial" : "failed";
    k.plId = null;
    PK.touch(k);
    A.renderExplorer();
    A.rerender();
  }

  function confirmPublish() {
    const k = PK.byId(PB?.id);
    if (!k || !PB.ok) return;
    const todo = pending(k);
    todo.forEach((t) => { delete k.results[t.ch]; });
    k.rights = true;
    k.status = "publishing";
    const pl = A.startPipeline({
      kind: "publish", label: `Đăng “${PK.short(k.title, 36)}”`, detail: todo.map((t) => DT.chById(t.ch)?.name || t.ch).join(", "),
      tasks: todo.map((t) => ({ key: t.ch, label: DT.chById(t.ch)?.name || t.ch })),
      onTask: (task) => finishTarget(k, task.key),
      onDone: () => finalize(k),
      onCancel: () => {
        todo.forEach((t) => { if (!doneState(k.results[t.ch])) delete k.results[t.ch]; });
        k.status = Object.keys(k.results).length ? "partial" : "draft";
        k.plId = null;
      },
    });
    k.plId = pl.id;
    PB = null;
    A.closeModal();
    PK.touch(k);
    A.renderExplorer();
    A.rerender();
  }

  Object.assign(A.ACT, { "pk-publish": (el) => openPublish(el.dataset.id), "pb-confirm": confirmPublish });
  Object.assign(A.ON, {
    "pb-ok": (el) => { if (PB) PB.ok = el.checked; const b = A.$("#pb-go"); if (b) b.disabled = !el.checked; },
  });
})();
