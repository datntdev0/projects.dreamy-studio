(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const { esc, ic } = A;
  const MB = LB.MB;
  const GB = LB.GB;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const CATALOG = [
    { id: "vieneu-v3", family: "vieneu", familyName: "VieNeu-TTS", name: "VieNeu-TTS v3 Turbo", repo: "pnnbao-ump/VieNeu-TTS-v3-Turbo", size: 400 * MB, approx: true, params: "0.1B", langs: "Tiếng Việt và tiếng Anh (chuyển ngữ giữa câu), 48 kHz", clone: true, design: false, lic: "Apache 2.0", nc: false,
      note: "Clone giọng từ mẫu tham chiếu 3–8 giây, kèm 23 giọng preset (mặc định Minh Quân). Chạy CPU qua ONNX Runtime, hoặc GPU với CUDA 12.8 trở lên.", rec: "Khuyên dùng cho tiếng Việt" },
    { id: "omnivoice", family: "omnivoice", familyName: "OmniVoice", name: "OmniVoice 0.6B", repo: "k2-fsa/OmniVoice", size: 1.3 * GB, approx: true, params: "0.6B", langs: "600+ ngôn ngữ, 24 kHz", clone: true, design: true, lic: "Mã Apache 2.0 · trọng số CC BY-NC", nc: true,
      note: "Zero-shot clone từ mẫu ngắn và voice design (giới tính, độ tuổi, cao độ, giọng vùng miền). Hỗ trợ ký hiệu phi lời như [laughter].", rec: "Khi cần ngôn ngữ ngoài tiếng Việt / Anh" },
    { id: "kokoro", family: "kokoro", familyName: "Kokoro", name: "Kokoro-82M", repo: "hexgrad/Kokoro-82M", size: 330 * MB, approx: true, params: "82M", langs: "Tiếng Anh và một số ngôn ngữ khác (không có tiếng Việt)", clone: false, design: false, lic: "Apache 2.0", nc: false,
      note: "Mô hình rất nhỏ, nhanh, có sẵn giọng đọc. Không clone được giọng.", rec: "Giọng mặc định tiếng Anh" },
  ];

  const T = () => LB.state.tts;
  const ms = (id) => (T().models[id] ||= { status: "none" });
  const model = (id) => CATALOG.find((m) => m.id === id);
  const BE = () => LB.backend;
  const backendOk = () => BE().ok();
  const isReady = (m) => ms(m.id).status === "ready";
  const usedBy = (m) => LB.state.voices.filter((v) => v.kind === "cloned" && v.family === m.family && v.engine === "local").length;
  const pl = (pid) => A.PL.list.find((p) => p.id === pid);
  const refresh = () => A.refreshSettings("tts");

  function sync() {
    const step = window.DS.STARTUP_STEPS.find((x) => x.id === "tts");
    if (step) step.result = LB.tts.ready() ? "ok" : "warn";
    if (A.S.screen === "app") { A.renderStatus(); A.rerender(); }
  }
  LB.tts = {
    CATALOG,
    backendOk,
    ready: () => backendOk() && CATALOG.some(isReady),
    familyReady: (family) => backendOk() && CATALOG.some((m) => m.family === family && isReady(m)),
    familyName: (family) => CATALOG.find((m) => m.family === family)?.familyName || "Local TTS",
    localOk: (v) => LB.tts.familyReady(v.family),
    cloneModels: () => (backendOk() ? CATALOG.filter((m) => m.clone && isReady(m)) : []),
    count: () => (backendOk() ? CATALOG.filter(isReady).length : 0),
    sync,
  };
  const reseed = LB.reseed;
  LB.reseed = function () { reseed.call(this); checks = null; running = false; };

  BE().register({
    id: "tts",
    tab: "tts",
    icon: "cpu",
    label: "Local TTS models",
    summary: () => `${LB.tts.count()}/${CATALOG.length} mô hình sẵn sàng`,
  });
  BE().on(() => {
    CATALOG.forEach((m) => {
      const s = ms(m.id);
      if (s.status === "verifying" && !backendOk()) { s.status = "error"; s.error = "Python backend dừng khi đang kiểm tra mô hình. Hãy tải lại sau khi backend chạy."; }
    });
    checks = null;
    refresh();
    sync();
  });

  let checks = null;
  let running = false;
  const computeChecks = () => {
    const st = BE().status();
    const up = st === "running";
    return [
      { id: "be", label: "Python backend", state: up ? "ok" : "warn", detail: up ? `Đang chạy · ${BE().url()}` : st === "starting" ? "Đang khởi động…" : "Chưa chạy" },
      { id: "rt", label: "Gói TTS trong backend", state: up ? "ok" : "warn", detail: up ? "ONNX Runtime · sẵn sàng" : "Cần backend đang chạy" },
      { id: "dev", label: "Thiết bị suy luận", state: "warn", detail: `${BE().deviceLabel()} · không phát hiện GPU CUDA` },
      { id: "disk", label: "Dung lượng trống", state: "ok", detail: `${BE().free} trống tại ổ chứa mô hình` },
      { id: "net", label: "Kết nối Hugging Face", state: up ? "ok" : "warn", detail: up ? "huggingface.co truy cập được" : "Cần backend đang chạy" },
    ];
  };
  const checkIcon = (s) => (s === "ok" ? ic("check") : s === "warn" ? ic("alert") : s === "error" ? ic("x") : s === "running" ? `<span class="dot dot-running"></span>` : `<span class="dot"></span>`);
  const checkRows = () => (checks || computeChecks()).map((c) => `<div class="ld-step is-${c.state === "ok" ? "done" : c.state}">${checkIcon(c.state)}<span>${esc(c.label)}</span><span class="ld-detail">${esc(c.detail || "")}</span></div>`).join("");
  const paintChecks = () => { const el = A.$("#tts-checks"); if (el) el.innerHTML = checkRows(); };
  async function runChecks() {
    if (running) return;
    running = true;
    const final = computeChecks();
    checks = final.map((c) => ({ ...c, state: "pending", detail: "" }));
    A.$$('[data-act="tts-check"]').forEach((b) => { b.disabled = true; });
    paintChecks();
    for (let i = 0; i < final.length; i++) {
      checks[i].state = "running";
      paintChecks();
      await sleep(240);
      checks[i] = final[i];
      paintChecks();
    }
    running = false;
    T().checked = true;
    A.$$('[data-act="tts-check"]').forEach((b) => { b.disabled = false; });
  }

  function startDownload(id) {
    const m = model(id);
    const s = ms(id);
    const shards = Math.max(2, Math.ceil(m.size / (400 * MB)));
    s.status = "downloading";
    s.error = "";
    BE().req("POST", `/tts/models/${id}/download`, 202, "Accepted");
    const p = A.startPipeline({
      kind: "tts-download", label: `Tải mô hình: ${m.name}`, detail: `${m.repo} · ${LB.bytes(m.size)}`,
      tasks: Array.from({ length: shards }, (_, i) => ({ key: `tts-${id}-${i}`, label: `Tệp ${i + 1}/${shards}` })),
      onDone: () => {
        s.status = "verifying";
        BE().log(`INFO:     ${id}: download complete, verifying sha256`);
        refresh();
        setTimeout(() => finish(id), 1400);
      },
      onCancel: () => { s.status = "none"; BE().log(`WARNING:  ${id}: download cancelled`); refresh(); },
    });
    s.pl = p.id;
    refresh();
  }
  function finish(id) {
    const s = ms(id);
    if (s.status !== "verifying" || !backendOk()) return;
    s.status = "ready";
    s.at = A.stamp();
    BE().log(`INFO:     ${id}: loaded, ready`);
    A.toast(`Mô hình ${model(id).name} đã sẵn sàng.`);
    refresh();
    sync();
  }
  function download(id) {
    if (!backendOk()) { A.toast("Hãy khởi động Python backend trước khi tải mô hình.", "warning"); return; }
    if (["downloading", "verifying", "ready"].includes(ms(id).status)) return;
    startDownload(id);
  }

  const badge = (cls, text, tip = "") => `<span class="badge ${cls}" ${tip ? `data-tip="${esc(tip)}"` : ""}>${esc(text)}</span>`;
  const licenseBadge = (m) => (m.nc === true ? badge("badge-warning", "PHI THƯƠNG MẠI", `${m.lic}. Không dùng cho sản phẩm thương mại.`) : badge("badge-success", m.lic));
  const sizeText = (m) => `${m.approx ? "≈ " : ""}${LB.bytes(m.size)}`;

  function statusBlock(m) {
    const s = ms(m.id);
    if (s.status === "downloading") {
      const p = pl(s.pl);
      const pct = Math.round(p?.progress || 0);
      return `<div class="tts-prog"><div class="progress" data-prog="${esc(s.pl)}"><i style="width:${pct}%"></i></div>
        <span class="t-sm t-mute" data-tts-dl="${m.id}">Đang tải… ${pct}% · ${LB.bytes((m.size * pct) / 100)} / ${LB.bytes(m.size)} · ${14 + (LB.hash(m.id) % 9)} MB/s</span></div>`;
    }
    if (s.status === "verifying") return `<div class="tts-line"><span class="dot dot-running"></span><span class="t-sm">Đang kiểm tra checksum và nạp thử mô hình…</span></div>`;
    if (s.status === "ready") return `<div class="tts-line">${ic("check")}<span class="t-sm">Sẵn sàng · đã tải lúc <span class="mono">${esc(s.at || "—")}</span></span><span class="path t-mute">${esc(BE().dir)}\\models\\tts\\${esc(m.id)}</span></div>`;
    if (s.status === "error") return `<div class="tts-err">${ic("alert")}<span>${esc(s.error || "Tải không thành công.")}</span></div>`;
    return `<div class="tts-line t-sm t-mute">Chưa tải · cần ${sizeText(m)} dung lượng trống · backend tải từ Hugging Face, sau đó dùng offline.</div>`;
  }
  function actions(m) {
    const s = ms(m.id);
    const off = backendOk() ? "" : `disabled data-tip="Cần Python backend đang chạy"`;
    if (s.status === "none" || s.status === "error") return `<button class="btn btn-sm btn-primary" data-act="tts-dl" data-id="${m.id}" ${off}>${ic("download")}${s.status === "error" ? "Tải lại" : `Tải xuống (${sizeText(m)})`}</button>`;
    if (s.status === "downloading") return `<button class="btn btn-sm" data-act="tts-cancel" data-id="${m.id}">Hủy</button>`;
    if (s.status === "verifying") return `<button class="btn btn-sm" disabled>Đang kiểm tra…</button>`;
    if (T().confirm === m.id) {
      const n = usedBy(m);
      return `<span class="tts-confirm">${n ? `${n} giọng đã clone sẽ không dùng được. ` : ""}Xóa mô hình?<button class="btn btn-sm btn-danger" data-act="tts-del-yes" data-id="${m.id}">Xóa</button><button class="btn btn-sm btn-ghost" data-act="tts-del-no">Giữ lại</button></span>`;
    }
    return `<button class="btn btn-sm" data-act="tts-verify" data-id="${m.id}" ${off} data-tip="Kiểm tra lại checksum và nạp thử">${ic("shield")}Kiểm tra</button><button class="btn btn-sm btn-icon" data-act="tts-del" data-id="${m.id}" aria-label="Xóa mô hình" data-tip="Xóa mô hình">${ic("trash")}</button>`;
  }
  function modelCard(m) {
    const s = ms(m.id);
    return `<article class="tts-model is-${s.status}">
      <div class="tts-m-top">
        <div class="tts-m-t"><span class="t-ink tts-m-name">${esc(m.name)}</span>${m.rec ? `<span class="tts-rec">${esc(m.rec)}</span>` : ""}</div>
        <div class="tts-m-act">${actions(m)}</div>
      </div>
      <div class="tts-m-meta"><span class="path t-mute">${esc(m.repo)}</span>
        <span class="badge">${esc(m.params)}</span><span class="badge">${sizeText(m)}</span>${licenseBadge(m)}
        ${m.clone ? badge("badge-primary", "CLONE VOICE") : badge("", "KHÔNG CLONE")}${m.design ? badge("badge-primary", "VOICE DESIGN") : ""}</div>
      <p class="t-sm t-mute">${esc(m.langs)}. ${esc(m.note)}</p>
      ${statusBlock(m)}</article>`;
  }

  function envCard() {
    const st = BE().status();
    const stBadge = { running: badge("badge-success", "BACKEND ĐANG CHẠY"), starting: badge("badge-running", "BACKEND ĐANG KHỞI ĐỘNG"), stopped: badge("badge-warning", "BACKEND ĐÃ DỪNG") }[st];
    return `<section class="tts-card">
        <header class="tts-card-h"><span class="eyebrow">Điều kiện chạy TTS</span>${stBadge}<span class="spacer"></span>
          <button class="btn btn-sm" data-act="tts-check">${ic("refresh")}Kiểm tra lại</button>
          <button class="btn btn-sm ${st === "stopped" ? "btn-primary" : ""}" data-act="settings" data-v="backend">${ic("server")}Python backend</button></header>
        <div class="ld-steps tts-checks" id="tts-checks" role="status" aria-live="polite">${checkRows()}</div>
        ${st === "stopped" ? `<div class="tts-err">${ic("alert")}<span>Python backend đang dừng nên không thể tải, kiểm tra hay chạy mô hình. Khởi động backend ở mục Python backend.</span></div>` : ""}
      </section>`;
  }

  function render() {
    const readyN = LB.tts.count();
    return `<div class="tts">
      <header class="tts-head"><div><h3 class="t-display-xs">Local TTS models</h3></div></header>
      <p class="t-sm t-mute">Mô hình chạy trên Python backend của máy này. Mỗi mô hình tải một lần từ Hugging Face, sau đó đọc và clone giọng offline, không gửi dữ liệu ra ngoài.</p>
      ${envCard()}
      <section class="tts-list">
        <header class="tts-card-h"><span class="eyebrow">Mô hình · ${readyN}/${CATALOG.length} sẵn sàng</span><span class="spacer"></span>
          ${readyN ? `<button class="btn btn-sm" data-act="tts-voices">${ic("voice")}Đến Voices</button>` : ""}</header>
        ${CATALOG.map(modelCard).join("")}
      </section>
      <p class="t-sm t-mute tts-foot">${ic("info")}<span>Dung lượng có dấu ≈ là ước lượng trong prototype. Trọng số OmniVoice dùng giấy phép phi thương mại (CC BY-NC) và model card cấm clone giọng trái phép hoặc mạo danh; hãy đọc model card trước khi dùng cho sản phẩm thương mại. VieNeu-TTS v3 Turbo dùng Apache 2.0, yêu cầu giữ ghi công khi phân phối lại.</span></p>
    </div>`;
  }

  A.SETTINGS_VIEWS.tts = {
    cls: "modal-xl",
    render,
    mount() { if (!T().checked && !checks) runChecks(); },
  };

  Object.assign(A.ACT, {
    "tts-check": runChecks,
    "tts-dl": (el) => download(el.dataset.id),
    "tts-cancel": (el) => { const s = ms(el.dataset.id); if (s.pl) A.cancelPipeline(s.pl); },
    "tts-verify": (el) => {
      const s = ms(el.dataset.id);
      s.status = "verifying";
      BE().req("POST", `/tts/models/${el.dataset.id}/verify`, 200, "OK");
      refresh();
      sleep(1400).then(() => finish(el.dataset.id));
    },
    "tts-del": (el) => { T().confirm = el.dataset.id; refresh(); },
    "tts-del-no": () => { T().confirm = null; refresh(); },
    "tts-del-yes": (el) => {
      const m = model(el.dataset.id);
      T().models[m.id] = { status: "none" };
      T().confirm = null;
      BE().req("DELETE", `/tts/models/${m.id}`, 204, "No Content");
      refresh();
      A.toast(`Đã xóa mô hình ${m.name}.`);
      sync();
    },
    "tts-voices": () => { A.closeModal(); A.ACT["rail-open"]({ dataset: { v: "library", id: "voices" } }); },
  });

  setInterval(() => {
    A.$$("[data-tts-dl]").forEach((el) => {
      const m = model(el.dataset.ttsDl);
      const p = pl(ms(m.id).pl);
      if (!p) return;
      const pct = Math.round(p.progress);
      el.textContent = `Đang tải… ${pct}% · ${LB.bytes((m.size * pct) / 100)} / ${LB.bytes(m.size)} · ${14 + (LB.hash(m.id) % 9)} MB/s`;
    });
  }, 400);
})();
