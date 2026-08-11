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
        <td>${checking.has(c.id) ? `<span class="dt-chk"><span class="dot dot-running"></span>Đang kiểm tra…</span>` : chBadges(c)}</td>
        <td class="t-sm">${esc(visLabel(c, c.defaults.vis))}</td>
        <td class="num mono t-mute">${pkgsOf(c.id).length}</td>
        <td class="mono t-mute">${esc(c.lastUsed.slice(0, 10))}</td>
        <td class="row-actions">${c.status === "expired" ? `<button class="btn btn-sm btn-primary" data-testid="ch-reconnect-btn-${c.id}" data-act="ch-reconnect" data-id="${c.id}">${ic("link")}Kết nối lại</button>` : `<button class="btn btn-sm" data-testid="ch-check-btn-${c.id}" data-act="ch-check" data-id="${c.id}" ${checking.has(c.id) ? "disabled" : ""}>${ic("refresh")}Kiểm tra</button>`}</td></tr>`).join("");
    const body = list.length
      ? `<table class="table is-nw" data-testid="ch-table"><thead><tr><th>Kênh</th><th>Nền tảng</th><th>Trạng thái</th><th>Mặc định</th><th class="num">Package</th><th>Dùng gần nhất</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
      : `<div class="dt-empty">${U.empty("Chưa kết nối kênh nào", "Kết nối tài khoản YouTube hoặc TikTok của bạn để đăng video thành phẩm. Bạn vẫn có thể chuẩn bị package trước.", `<div class="empty-act"><button class="btn btn-primary" data-testid="ch-empty-connect-btn" data-act="ch-connect">${ic("link")}Kết nối kênh</button></div>`)}</div>`;
    const plats = Object.values(P).map((p) => `<div data-testid="ch-platform-${p.key}" class="dt-plat ${p.live ? "" : "is-soon"}">
        <span class="dt-av tone-3">${ic(p.icon)}</span><div class="dt-plat-b"><div class="t-ink">${esc(p.label)}${p.live ? "" : ` <span class="badge badge-info">SẮP CÓ</span>`}</div><div class="t-sm t-mute">${esc(p.blurb)}</div></div>
        ${p.live ? `<button class="btn btn-sm" data-testid="ch-platform-connect-btn-${p.key}" data-act="ch-connect" data-v="${p.key}">${ic("plus")}Kết nối</button>` : ""}</div>`).join("");
    return `<div class="nv">
      ${U.bar(`<span class="nv-ttl">${ic("globe")}<span class="t-ink">Kênh phân phối</span></span><span class="t-sm t-mute">${list.length} kênh${bad ? ` · ${bad} cần kết nối lại` : ""}</span>`,
        `<button class="btn btn-sm" data-testid="ch-check-all-btn" data-act="ch-check-all" ${list.length ? "" : "disabled"}>${ic("refresh")}Kiểm tra tất cả</button><button class="btn btn-sm btn-primary" data-testid="ch-connect-btn" data-act="ch-connect">${ic("link")}Kết nối kênh</button>`)}
      <div class="nv-body"><div class="nv-scroll" data-keep="ch">${body}
        <section class="dt-sec" data-testid="ch-platforms"><span class="eyebrow">Nền tảng</span><div class="dt-plats">${plats}</div>
          <p class="t-sm t-mute dt-note">${ic("lock")}<span>Dreamy Studio dùng đăng nhập chính thức (OAuth) của từng nền tảng. Mật khẩu không đi qua ứng dụng, token được lưu mã hóa trên máy bạn, và nội dung chỉ được gửi đi khi bạn xác nhận đăng.</span></p></section></div></div></div>`;
  }

  const field = (label, id, control) => `<div class="field"><label for="${id}">${label}</label>${control}</div>`;
  function channelPanel(c) {
    const p = P[c.platform];
    const kv = [["Nền tảng", esc(p.label)], ["Tài khoản", esc(c.account)], ["Kết nối lúc", `<span class="mono">${esc(c.connected)}</span>`], ["Kiểm tra lúc", `<span class="mono">${esc(c.checked)}</span>`], ["Dùng gần nhất", `<span class="mono">${esc(c.lastUsed)}</span>`]];
    const d = c.defaults;
    return `<section class="ins-sec dt-ins-top" data-testid="ch-inspector-summary">${avatar(c, "is-lg")}<div class="dt-ins-b"><div class="ins-hero-t">${esc(c.name)}</div><div class="t-sm t-mute">${esc(c.handle)}</div>${chBadges(c)}</div></section>
      ${c.status === "expired" ? `<section class="ins-sec"><div class="ld-warn">${ic("alert")}<span>${esc(c.error)}</span></div><button class="btn btn-primary" data-act="ch-reconnect" data-id="${c.id}">${ic("link")}Kết nối lại</button></section>` : ""}
      ${U.insSec("Thông tin", U.kv(kv))}
      ${U.insSec("Quyền đã cấp", `<div class="dt-scopes" data-testid="ch-scopes">${c.scopes.map((s) => `<div class="dt-scope"><span class="mono">${esc(s)}</span><span class="t-sm t-mute">${esc(p.scopes.find((x) => x[0] === s)?.[1] || "")}</span></div>`).join("")}</div><span class="field-hint">Chỉ xin quyền cần để đăng video. Không đọc hay xóa video hiện có của bạn.</span>`)}
      <section class="ins-sec ins-form"><span class="eyebrow">Mặc định cho package mới</span>
        ${field("Chế độ hiển thị", "ch-d-vis", `<select id="ch-d-vis" data-testid="ch-default-visibility" class="select" data-change="ch-def" data-id="${c.id}" data-f="vis">${U.options(p.vis, d.vis)}</select>`)}
        ${field("Ngôn ngữ", "ch-d-lang", `<select id="ch-d-lang" data-testid="ch-default-language" class="select" data-change="ch-def" data-id="${c.id}" data-f="lang">${U.options(DT.LANGS, d.lang)}</select>`)}
        ${c.platform === "youtube" ? field("Danh mục", "ch-d-cat", `<select id="ch-d-cat" data-testid="ch-default-category" class="select" data-change="ch-def" data-id="${c.id}" data-f="cat">${U.options(DT.CATEGORIES, d.cat)}</select>`) : ""}
        <label class="check"><input type="checkbox" data-testid="ch-default-ai" data-change="ch-def" data-id="${c.id}" data-f="ai" ${d.ai ? "checked" : ""}><span>Gắn nhãn nội dung do AI tạo hoặc chỉnh sửa</span></label></section>
      ${U.insSec("Package", pkgsOf(c.id).length ? pkgsOf(c.id).map((k) => `<button type="button" class="nm-recent" data-act="pk-open" data-id="${k.id}">${ic("package")}<span class="tree-label">${esc(k.title)}</span>${DT.statusBadge(k)}</button>`).join("") : `<span class="t-sm t-mute">Chưa có package nào nhắm tới kênh này.</span>`)}
      <section class="ins-sec"><span class="field-hint">${ic("key")} Token được lưu mã hóa trên máy này (Windows Credential Manager), không gửi cho ai khác.</span></section>
      <section class="ins-sec ins-actions" data-testid="ch-inspector-actions"><button class="btn" data-testid="ch-inspector-check-btn" data-act="ch-check" data-id="${c.id}" ${checking.has(c.id) ? "disabled" : ""}>${ic("refresh")}Kiểm tra</button><button class="btn" data-testid="ch-inspector-reconnect-btn" data-act="ch-reconnect" data-id="${c.id}">${ic("link")}Kết nối lại</button><button class="btn btn-danger" data-testid="ch-disconnect-btn" data-act="ch-disconnect" data-id="${c.id}">${ic("unlink")}Ngắt kết nối</button></section>`;
  }
  function overviewPanel() {
    const list = st().channels;
    return `${U.insSec("Kênh phân phối", U.kv([["Kênh", list.length], ["Hoạt động", list.filter((c) => c.status === "ok").length], ["Cần kết nối lại", list.filter((c) => c.status !== "ok").length], ["Package", st().packages.length]]))}
      <section class="ins-sec"><span class="eyebrow">Kết nối kênh</span><button class="btn btn-block btn-primary" data-act="ch-connect">${ic("link")}Kết nối kênh…</button>
        <span class="field-hint">Chọn một kênh trong danh sách để xem quyền đã cấp và đặt giá trị mặc định cho package.</span></section>
      <section class="ins-sec"><span class="eyebrow">Dữ liệu rời máy khi nào</span><p class="t-sm t-mute">Chỉ khi bạn bấm xác nhận đăng. Trước đó ứng dụng chỉ giữ token để biết tài khoản nào đang được kết nối.</p></section>`;
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
      A.toast(bad.length ? `${bad.length} kênh cần kết nối lại.` : todo.length === 1 ? `Kênh “${byId(todo[0])?.name}” kết nối bình thường.` : `${todo.length} kênh kết nối bình thường.`, bad.length ? "warning" : "success");
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
      body = `${re ? `<div class="dt-re">${avatar(re)}<div><div class="t-ink">${esc(re.name)}</div><div class="t-sm t-mute">${esc(re.handle)} · cần đăng nhập lại để cấp quyền mới</div></div></div>` : ""}${cards}
        <div class="field"><span class="eyebrow">Quyền sẽ được yêu cầu</span><div class="dt-scopes">${scopesFor().map(([s, d]) => `<div class="dt-scope"><span class="mono">${esc(s)}</span><span class="t-sm">${esc(d)}</span></div>`).join("")}</div></div>
        ${CN.platform === "tiktok" ? `<label class="check"><input type="checkbox" data-testid="cn-tiktok-publish" data-change="cn-publish" ${CN.publish ? "checked" : ""}><span>Cho phép đăng trực tiếp (<span class="mono">video.publish</span>). Bỏ chọn để chỉ gửi video vào hộp thư nháp trên TikTok và tự đăng trong ứng dụng TikTok.</span></label>
          <div class="ld-warn">${ic("alert")}<span>Luồng đăng nhập TikTok đang chờ rà soát kiến trúc (cần giữ client secret an toàn) trước khi hứa tính năng đăng trực tiếp.</span></div>` : ""}
        <ul class="dt-how"><li>Trình duyệt mặc định mở trang đăng nhập của ${esc(p.label)}. Mật khẩu không đi qua Dreamy Studio.</li><li>Token được lưu mã hóa trên máy bạn. Bạn có thể ngắt kết nối bất cứ lúc nào.</li><li>Nội dung chỉ được gửi đi khi bạn xác nhận ở bước đăng.</li></ul>`;
      foot = `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="cn-go-btn" data-act="cn-go">${ic("external")}Tiếp tục đăng nhập</button>`;
    } else if (CN.step === "wait") {
      body = `<div class="dt-wait"><span class="dot dot-running"></span><div><div class="t-ink">Đang chờ bạn đăng nhập và cấp quyền trên trình duyệt…</div>
          <div class="t-sm t-mute">Ứng dụng đang lắng nghe phản hồi tại <span class="path">http://127.0.0.1:53682/callback</span>. Chỉ nhập mật khẩu trên trang <span class="path">${DOMAIN[CN.platform]}</span>.</div></div></div>
        <div class="dt-sim"><span class="eyebrow">Prototype · mô phỏng kết quả</span><div class="empty-act"><button class="btn btn-sm btn-primary" data-testid="cn-sim-ok-btn" data-act="cn-ok">${ic("check")}Đã cấp quyền</button><button class="btn btn-sm" data-testid="cn-sim-deny-btn" data-act="cn-deny">${ic("x")}Từ chối</button><button class="btn btn-sm" data-testid="cn-sim-timeout-btn" data-act="cn-timeout">${ic("clock")}Hết thời gian</button></div></div>`;
      foot = `<button class="btn" data-act="close-modal">Hủy</button>`;
    } else if (CN.step === "pick") {
      const found = FOUND[CN.platform];
      const free = found.filter(([, h]) => !exists(h));
      body = `<p class="t-sm">Tài khoản <span class="path">dreamy•••@gmail.com</span> có ${found.length} ${p.unit}. Chọn ${p.unit} muốn dùng để đăng.</p>
        <div class="opts">${found.map(([n, h]) => { const dup = exists(h); return `<label class="opt ${dup ? "is-off" : CN.picked.has(h) ? "is-on" : ""}"><input type="checkbox" data-testid="cn-pick-${esc(h)}" data-change="cn-pick" data-h="${esc(h)}" ${dup ? "disabled checked" : CN.picked.has(h) ? "checked" : ""}><div class="opt-b"><span class="t-ink">${esc(n)}</span><span class="t-sm t-mute">${esc(h)}${dup ? " · đã kết nối" : ""}</span></div></label>`; }).join("")}</div>
        ${free.length ? "" : `<p class="field-hint">Mọi ${p.unit} của tài khoản này đã được kết nối.</p>`}`;
      foot = `<button class="btn" data-testid="cn-retry-btn" data-act="cn-retry">${ic("arrow-left")}Quay lại</button><span class="spacer"></span><button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-primary" data-testid="cn-add-btn" data-act="cn-add" ${CN.picked.size ? "" : "disabled"}>Thêm ${CN.picked.size || ""} ${p.unit}</button>`;
    } else {
      body = `<div class="ld-warn">${ic("alert")}<span>${esc(CN.error)}</span></div><p class="t-sm t-mute">Chưa có gì được lưu. Bạn có thể thử lại bất cứ lúc nào.</p>`;
      foot = `<button class="btn" data-act="close-modal">Đóng</button><button class="btn btn-primary" data-testid="cn-retry-btn" data-act="cn-retry">${ic("refresh")}Thử lại</button>`;
    }
    A.modal({ title: re ? `Kết nối lại ${re.name}` : "Kết nối kênh", eyebrow: CAP, cls: "modal-lg", body, foot, testid: `cn-dialog-${CN.step}` });
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
    A.toast(`Đã kết nối lại “${c.name}”.`);
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
    A.toast(added.length === 1 ? `Đã kết nối “${added[0].name}”.` : `Đã kết nối ${added.length} ${p.unit}.`);
  }

  let pendingDis = null;
  function openDisconnect(id) {
    const c = byId(id);
    if (!c) return;
    pendingDis = id;
    const pk = pkgsOf(id).filter((k) => !["published", "partial"].includes(DT.pkgStatus(k)));
    A.modal({
      title: "Ngắt kết nối kênh", eyebrow: CAP, testid: "ch-disconnect-dialog",
      body: `<div class="dt-re">${avatar(c)}<div><div class="t-ink">${esc(c.name)}</div><div class="t-sm t-mute">${esc(c.handle)} · ${esc(P[c.platform].label)}</div></div></div>
        <p class="t-sm">Token của kênh sẽ bị xóa khỏi máy này. Các bài đã đăng không bị ảnh hưởng.</p>
        ${pk.length ? `<div class="ld-warn">${ic("alert")}<span>${pk.length} package chưa đăng đang nhắm tới kênh này. Chúng sẽ báo lỗi cho đến khi bạn gỡ hoặc kết nối lại kênh.</span></div>` : ""}
        <p class="field-hint">Để thu hồi hoàn toàn quyền của Dreamy Studio, hãy xóa ứng dụng khỏi phần quyền truy cập trong cài đặt tài khoản ${esc(P[c.platform].label)}.</p>`,
      foot: `<button class="btn" data-act="close-modal">Hủy</button><button class="btn btn-danger" data-testid="ch-disconnect-confirm-btn" data-act="ch-disconnect-confirm">${ic("unlink")}Ngắt kết nối</button>`,
    });
  }

  A.EXPLORER_EXTRA.dist = () => {
    const chs = st().channels.map((c) => `<div data-testid="ch-xrow-${c.id}" class="tree-row nx-child ${ui().sel === c.id && A.S.active === "channels" ? "is-selected" : ""}" tabindex="0" role="treeitem" data-act="ch-open" data-id="${c.id}">${ic(P[c.platform].icon)}<span class="tree-label">${esc(c.name)}</span><span class="dot dot-${c.status === "ok" ? "success" : "danger"}"></span></div>`).join("");
    const pks = [...st().packages].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 5).map((k) => `<div data-testid="pk-xrow-${k.id}" class="tree-row nx-child ${A.S.active === `package:${k.id}` ? "is-selected" : ""}" tabindex="0" role="treeitem" data-act="pk-open" data-id="${k.id}">${ic("package")}<span class="tree-label">${esc(k.title)}</span></div>`).join("");
    return `<div class="nx-sep"></div><div class="nf-label">Kênh đã kết nối</div>${chs || `<div class="nx-empty">Chưa kết nối kênh nào</div>`}
      <div class="tree-row nx-child lb-xnew" tabindex="0" data-act="ch-connect">${ic("plus")}<span class="tree-label">Kết nối kênh</span></div>
      <div class="nx-sep"></div><div class="nf-label">Package gần đây</div>${pks || `<div class="nx-empty">Chưa có package nào</div>`}`;
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
      A.toast(`Đã ngắt kết nối “${c?.name}”.`);
    },
    "cn-go": () => { CN.step = "wait"; drawConnect(); },
    "cn-ok": () => {
      if (CN.re) { finishReconnect(); return; }
      const free = FOUND[CN.platform].filter(([, h]) => !exists(h));
      if (CN.platform === "tiktok") {
        if (!free.length) { CN.step = "error"; CN.error = "Tài khoản TikTok này đã được kết nối trước đó."; drawConnect(); return; }
        addChannels(new Set([free[0][1]]));
        return;
      }
      CN.step = "pick";
      CN.picked = new Set(free.length ? [free[0][1]] : []);
      drawConnect();
    },
    "cn-deny": () => { CN.step = "error"; CN.error = "access_denied: Bạn đã từ chối cấp quyền trên trang đăng nhập."; drawConnect(); },
    "cn-timeout": () => { CN.step = "error"; CN.error = "Hết thời gian chờ (5 phút) mà chưa nhận được phản hồi từ trình duyệt."; drawConnect(); },
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
