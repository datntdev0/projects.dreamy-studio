(function () {
  const A = window.DSApp;
  const LB = window.LB;
  const { esc, ic } = A;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const PROVIDERS = [
    { id: "vieneu", name: "VieNeu.io", site: "vieneu.io", clone: true, billing: "usd", langs: "Tiếng Việt và tiếng Anh",
      note: "Dịch vụ giọng nói của VieNeu. Điền endpoint theo tài liệu API của dịch vụ.",
      fields: [{ id: "endpoint", label: "Endpoint", ph: "https://…", required: true }] },
    { id: "everai", name: "EverAI.vn", site: "everai.vn", clone: false, billing: "credit", langs: "7 ngôn ngữ, gồm tiếng Việt",
      note: "Xác thực bằng Bearer token tạo ở trang API của EverAI. Kết quả trả về bất đồng bộ: ứng dụng gửi yêu cầu, chờ rồi tải audio về.",
      fields: [{ id: "endpoint", label: "Endpoint", value: "https://www.everai.vn/api/v1/tts", readonly: true }] },
    { id: "elevenlabs", name: "ElevenLabs", site: "elevenlabs.io", clone: true, billing: "usd", langs: "Nhiều ngôn ngữ, gồm tiếng Việt",
      note: "Hỗ trợ clone giọng từ mẫu ngắn. Mẫu giọng sẽ được tải lên tài khoản ElevenLabs của bạn.", fields: [] },
    { id: "google", name: "Google AI Studio", site: "aistudio.google.com", clone: false, billing: "usd", langs: "Nhiều ngôn ngữ, gồm tiếng Việt",
      note: "Dùng API key tạo trong Google AI Studio để gọi Gemini API sinh giọng nói.",
      fields: [{ id: "model", label: "Mô hình TTS", options: [["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-preview-tts"], ["gemini-2.5-pro-preview-tts", "gemini-2.5-pro-preview-tts"]], value: "gemini-2.5-flash-preview-tts" }] },
    { id: "openai", name: "OpenAI", site: "platform.openai.com", clone: false, billing: "usd", langs: "Nhiều ngôn ngữ",
      note: "Dùng endpoint audio/speech. Có thể đổi Base URL nếu bạn dùng cổng tương thích OpenAI.",
      fields: [{ id: "baseUrl", label: "Base URL", value: "https://api.openai.com/v1" }, { id: "model", label: "Mô hình TTS", options: [["gpt-4o-mini-tts", "gpt-4o-mini-tts"], ["tts-1", "tts-1"], ["tts-1-hd", "tts-1-hd"]], value: "gpt-4o-mini-tts" }] },
  ];

  const S = () => LB.state.speech.providers;
  const prov = (id) => PROVIDERS.find((p) => p.id === id);
  const P = (id) => (S()[id] ||= { enabled: true, saved: false, fields: {}, status: "none" });
  const fieldVal = (pr, f) => P(pr.id).fields[f.id] ?? f.value ?? "";
  const ready = (id) => !!id && P(id).status === "ok" && P(id).enabled;

  LB.speech = {
    PROVIDERS,
    ready,
    name: (id) => prov(id)?.name || "Cloud speech",
    billing: (id) => prov(id)?.billing || "usd",
    count: () => PROVIDERS.filter((p) => ready(p.id)).length,
    cloneProviders: () => PROVIDERS.filter((p) => p.clone && ready(p.id)),
  };

  function sync() { if (A.S.screen === "app") A.rerender(); }

  const statusBadge = (p) => {
    const s = P(p.id);
    if (!s.enabled) return `<span class="badge">ĐÃ TẮT</span>`;
    return { none: `<span class="badge">CHƯA CẤU HÌNH</span>`, checking: `<span class="badge badge-running">ĐANG KIỂM TRA</span>`, ok: `<span class="badge badge-success">ĐÃ KẾT NỐI</span>`, error: `<span class="badge badge-danger">LỖI KẾT NỐI</span>` }[s.status];
  };
  const msg = (p) => {
    const s = P(p.id);
    if (s.status === "checking") return `<span class="dot dot-running"></span><span class="t-sm">Đang kiểm tra kết nối tới ${esc(p.name)}…</span>`;
    if (s.status === "ok") return `${ic("check")}<span class="t-sm">Kết nối thành công · ${s.latency} ms · <span class="mono">${esc(s.at)}</span></span>`;
    if (s.status === "error") return `${ic("alert")}<span class="t-sm">${esc(s.error)}</span>`;
    return `<span class="t-sm t-mute">${s.saved ? "Đã lưu khóa, chưa kiểm tra." : "Nhập API key rồi bấm kiểm tra kết nối."}</span>`;
  };

  function field(p, f) {
    const id = `sp-${p.id}-${f.id}`;
    const v = fieldVal(p, f);
    if (f.options) return `<div class="field"><label for="${id}">${esc(f.label)}</label><select id="${id}" class="select" data-change="sp-field" data-p="${p.id}" data-f="${f.id}">${LB.api.opts(f.options, v)}</select></div>`;
    return `<div class="field"><label for="${id}">${esc(f.label)}${f.required ? " *" : ""}</label><input id="${id}" class="input ${f.readonly || f.value ? "mono-in" : ""}" value="${esc(v)}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ""} ${f.readonly ? "readonly" : ""} data-change="sp-field" data-p="${p.id}" data-f="${f.id}" autocomplete="off"></div>`;
  }

  function card(p) {
    const s = P(p.id);
    const busy = s.status === "checking";
    return `<article class="spc-card ${s.enabled ? "" : "is-off"}">
      <header class="spc-h">
        <div class="spc-t"><span class="t-ink spc-name">${esc(p.name)}</span>${statusBadge(p)}</div>
        <label class="check spc-on"><input type="checkbox" data-change="sp-enable" data-p="${p.id}" ${s.enabled ? "checked" : ""}><span>Bật</span></label>
      </header>
      <div class="tts-m-meta"><span class="path t-mute">${esc(p.site)}</span><span class="badge badge-primary">TTS</span>${p.clone ? `<span class="badge badge-primary">CLONE VOICE</span>` : `<span class="badge">KHÔNG CLONE</span>`}<span class="t-sm t-mute">${esc(p.langs)}</span></div>
      <p class="t-sm t-mute">${esc(p.note)}</p>
      <div class="spc-fields">
        <div class="field spc-key ${p.fields.length ? "" : "is-solo"}"><label for="sp-${p.id}-key">API key</label>
          <div class="spc-keyrow"><input id="sp-${p.id}-key" class="input mono-in" type="password" value="${esc(s.draft || "")}" placeholder="${s.saved ? "•••••••••••• (đã lưu, nhập để thay)" : "Dán API key"}" data-on="sp-key" data-p="${p.id}" autocomplete="off" spellcheck="false">
            <button type="button" class="btn btn-icon" data-act="sp-eye" data-p="${p.id}" aria-label="Hiện / ẩn khóa" data-tip="Hiện / ẩn">${ic("eye")}</button></div></div>
        ${p.fields.map((f) => field(p, f)).join("")}
      </div>
      <div class="spc-foot">
        <div class="spc-msg ${s.status === "ok" ? "is-ok" : s.status === "error" ? "is-err" : ""}">${msg(p)}</div>
        <button class="btn btn-sm btn-primary" data-act="sp-test" data-p="${p.id}" ${busy ? "disabled" : ""}>${ic("refresh")}Lưu và kiểm tra</button>
        <button class="btn btn-sm" data-act="sp-clear" data-p="${p.id}" ${s.saved ? "" : "disabled"}>Xóa khóa</button>
      </div>
    </article>`;
  }

  function render() {
    return `<div class="tts">
      <header class="tts-head"><div><h3 class="t-display-xs">Speech providers</h3></div></header>
      <p class="t-sm t-mute">Kết nối các dịch vụ giọng nói cloud để đọc và clone giọng khi không dùng mô hình Local. ${LB.speech.count()} / ${PROVIDERS.length} provider đang kết nối.</p>
      <div class="spc-note">${ic("lock")}<span>API key chỉ lưu trên máy này, không nằm trong workspace và không đi cùng project khi xuất. Khi dùng provider, văn bản cần đọc (và mẫu giọng khi clone) được gửi tới chính provider đó; chi phí do provider tính trực tiếp trên tài khoản của bạn.</span></div>
      <section class="tts-list">${PROVIDERS.map(card).join("")}</section>
      <p class="t-sm t-mute tts-foot">${ic("info")}<span>Prototype: việc kiểm tra kết nối là mô phỏng, không gọi mạng. Khóa ngắn hơn 8 ký tự hoặc bắt đầu bằng “bad” sẽ bị từ chối để bạn thấy trạng thái lỗi.</span></p>
    </div>`;
  }
  A.SETTINGS_VIEWS.speech = { cls: "modal-xl", render };

  async function test(id) {
    const p = prov(id);
    const s = P(id);
    const key = (s.draft || s.key || "").trim();
    if (!key) { A.toast(`Nhập API key của ${p.name}.`, "warning"); A.$(`#sp-${id}-key`)?.focus(); return; }
    const miss = p.fields.find((f) => f.required && !String(fieldVal(p, f)).trim());
    if (miss) { A.toast(`Nhập ${miss.label} của ${p.name}.`, "warning"); A.$(`#sp-${id}-${miss.id}`)?.focus(); return; }
    s.key = key;
    s.draft = "";
    s.saved = true;
    s.status = "checking";
    A.refreshSettings("speech");
    await sleep(900);
    if (key.length < 8 || /^bad/i.test(key)) {
      s.status = "error";
      s.error = id === "google" ? "400 API_KEY_INVALID: khóa không hợp lệ hoặc đã bị thu hồi trong Google AI Studio." : "401 Unauthorized: API key không hợp lệ hoặc đã bị thu hồi.";
    } else {
      s.status = "ok";
      s.latency = 120 + (LB.hash(id + key) % 280);
      s.at = A.stamp();
      A.toast(`Đã kết nối ${p.name}.`);
    }
    A.refreshSettings("speech");
    sync();
  }
  Object.assign(A.ACT, {
    "sp-test": (el) => test(el.dataset.p),
    "sp-clear": (el) => {
      const s = P(el.dataset.p);
      Object.assign(s, { saved: false, key: "", draft: "", status: "none", error: "" });
      A.refreshSettings("speech");
      A.toast(`Đã xóa khóa ${prov(el.dataset.p).name}.`);
      sync();
    },
    "sp-eye": (el) => { const i = A.$(`#sp-${el.dataset.p}-key`); if (i) i.type = i.type === "password" ? "text" : "password"; },
  });
  Object.assign(A.ON, {
    "sp-key": (el) => { P(el.dataset.p).draft = el.value; },
    "sp-field": (el) => { P(el.dataset.p).fields[el.dataset.f] = el.value.trim(); if (P(el.dataset.p).status === "ok") { P(el.dataset.p).status = "none"; A.refreshSettings("speech"); sync(); } },
    "sp-enable": (el) => { P(el.dataset.p).enabled = el.checked; A.refreshSettings("speech"); sync(); },
  });
})();
