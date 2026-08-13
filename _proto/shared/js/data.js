/*
 * Dreamy Studio prototype — static data.
 * Navigation model mirrors _docs/1.Product-Capabilities.md (capabilities + high-level requirements).
 * Every functional screen is "coming soon" for now; each one lists the requirements it will cover.
 * Workspaces below are fake and only exist so the splash screen has something to show.
 */
window.DS = (function () {
  const CAP = {
    "01": "CAP-01 · Workspace Management",
    "02": "CAP-02 · Novel Management",
    "03": "CAP-03 · Novel Translation",
    "04": "CAP-04 · Novel Knowledgebase",
    "05": "Library Management",
    "06": "CAP-06 · Project Management",
    "07": "CAP-07 · Pre-Production",
    "08": "CAP-08 · Production Modules",
    "09": "CAP-09 · Post-Production",
    "10": "CAP-10 · Distribution",
    "11": "CAP-11 · Smart Assistant",
    "12": "CAP-12 · Configuration",
  };

  /** Rail → explorer sections → items. Item = a tab that can be opened in the editor area. */
  const NAV = {
    projects: {
      label: "Projects",
      icon: "folder",
      sections: [
        {
          id: "projects", title: "Projects", headless: true,
          items: [{
            id: "projects", title: "Danh mục project", icon: "folder", cap: CAP["06"],
            blurb: "Tạo project từ template, quản lý danh mục project trong workspace và mở không gian làm việc của từng project.",
            reqs: [
              ["REQ-06-001", "Tạo mới project từ template và quản lý danh mục project trong workspace"],
              ["REQ-06-002", "Không gian làm việc của project với các modules và công cụ cần thiết"],
            ],
          }],
        },
        { id: "pfilters", title: "Filters", items: [] },
        {
          id: "pre", title: "Pre-Production", hidden: true,
          items: [
            {
              id: "scripting", title: "Scripting", icon: "pen", cap: CAP["07"],
              blurb: "Lên kịch bản cho dự án audiobook và filmseries.",
              reqs: [
                ["REQ-07-001", "SCRIPTING: lên kịch bản cho dự án audiobook"],
                ["REQ-07-002", "SCRIPTING: lên kịch bản cho dự án filmseries"],
              ],
            },
            {
              id: "character", title: "Character", icon: "user", cap: CAP["07"],
              blurb: "Tạo tham chiếu hình ảnh cho nhân vật để dùng nhất quán giữa các cảnh.",
              reqs: [["REQ-07-003", "CHARACTER: tạo tham chiếu hình ảnh cho nhân vật"]],
            },
            {
              id: "world", title: "World", icon: "cube", cap: CAP["07"],
              blurb: "Xây dựng thế giới ba chiều bằng mô hình clays.",
              reqs: [["REQ-07-004", "WORLD: xây dựng thế giới ba chiều bằng mô hình clays"]],
            },
            {
              id: "storyboard", title: "Storyboard", icon: "frames", cap: CAP["07"],
              blurb: "Chia phân cảnh từ nội dung và vẽ storyboard với các frames.",
              reqs: [["REQ-07-005", "STORYBOARD: chia phân cảnh từ nội dung và vẽ storyboard với các frames"]],
            },
          ],
        },
        {
          id: "prod", title: "Production", hidden: true,
          items: [
            {
              id: "audiobook", title: "Audiobook", icon: "mic", cap: CAP["08"],
              blurb: "Tạo audio dựa trên kịch bản đã chốt và kiểm tra kết quả.",
              reqs: [["REQ-08-001", "AUDIOBOOK: tạo audio dựa trên kịch bản đã chốt và kiểm tra kết quả"]],
            },
            {
              id: "canvas", title: "Canvas", icon: "nodes", cap: CAP["08"],
              blurb: "Thiết kế workflow tự do theo cơ chế canvas để sản xuất tài nguyên chất lượng cao.",
              reqs: [
                ["REQ-08-002", "CANVAS: Dựng canvas workflow từ các tài nguyên chuẩn bị ở trước đó"],
                ["REQ-08-003", "CANVAS: Khởi chạy canvas workflow để tạo ra tài nguyên chất lượng cao"],
              ],
            },
          ],
        },
        {
          id: "post", title: "Post-Production", hidden: true,
          items: [{
            id: "video", title: "Video editor", icon: "film", cap: CAP["09"],
            blurb: "Dựng video hậu kỳ từ các tài nguyên của project, áp dụng hiệu ứng và kết xuất thành phẩm.",
            reqs: [
              ["REQ-09-001", "Tổng hợp các tài nguyên trong dự án lên trình chỉnh sửa video hậu kỳ"],
              ["REQ-09-002", "Áp dụng một số hiệu ứng hình ảnh lên video hậu kỳ"],
              ["REQ-09-003", "Áp dụng một số hiệu ứng âm thanh lên video hậu kỳ"],
              ["REQ-09-004", "Kết xuất kết quả cuối cùng của giai đoạn hậu kỳ"],
            ],
          }],
        },
      ],
    },

    novels: {
      label: "Novels",
      icon: "book",
      sections: [
        {
          id: "novels", title: "Novels", headless: true,
          items: [{
            id: "novels", title: "Novel management", icon: "frames", cap: CAP["02"],
            blurb: "Danh sách novel của workspace. Mỗi novel có ba màn hình: Chapters (đọc, chỉnh sửa), Translation và Knowledgebase.",
            reqs: [
              ["REQ-02-001", "Tạo mới, hoặc nhập novel từ một file package theo cấu trúc của phần mềm"],
              ["REQ-02-002", "Trình đọc và chỉnh sửa nội dung của novel đã có trong phần mềm"],
              ["REQ-03-001", "Cấu hình hướng dẫn dịch và từ điển dịch thuật để AI sử dụng"],
              ["REQ-04-001", "Phân tích nội dung novel theo ontology được định nghĩa"],
            ],
          }],
        },
        { id: "filters", title: "Filters", items: [] },
      ],
    },

    library: {
      label: "Library",
      icon: "library",
      sections: [
        {
          id: "assets", title: "Tài nguyên", headless: true,
          items: [
            {
              id: "images", title: "Images", icon: "image", cap: CAP["05"],
              blurb: "Upload và quản lý ảnh trong thư viện tài nguyên chung của workspace.",
              reqs: [["REQ-05-001", "Upload IMAGES lên thư viện tài nguyên chung của workspace"]],
            },
            {
              id: "sounds", title: "Sounds", icon: "music", cap: CAP["05"],
              blurb: "Upload và quản lý âm thanh trong thư viện tài nguyên chung của workspace.",
              reqs: [["REQ-05-002", "Upload SOUNDS lên thư viện tài nguyên chung của workspace"]],
            },
            {
              id: "videos", title: "Videos", icon: "film", cap: CAP["05"],
              blurb: "Upload và quản lý video trong thư viện tài nguyên chung của workspace.",
              reqs: [["REQ-05-003", "Upload VIDEOS lên thư viện tài nguyên chung của workspace"]],
            },
            {
              id: "prompts", title: "Prompts", icon: "prompt", cap: CAP["05"],
              blurb: "Upload và quản lý prompt dùng chung trong workspace.",
              reqs: [["REQ-05-004", "Upload PROMPTS lên thư viện tài nguyên chung của workspace"]],
            },
            {
              id: "voices", title: "Voices", icon: "voice", cap: CAP["05"],
              blurb: "Clone voice từ audio file hoặc tự ghi âm, nghe thử với default voice hoặc cloned voice.",
              reqs: [
                ["REQ-05-006", "Clone voice từ một audio file hoặc tự ghi âm"],
                ["REQ-05-007", "Preview voice với default voice hoặc cloned voice"],
              ],
            },
          ],
        },
        {
          id: "organize", title: "Phân loại",
          items: [{
            id: "collections", title: "Collections & tags", icon: "tag", cap: CAP["05"],
            blurb: "Hệ thống phân loại và quản lý tài nguyên bằng collections và tags.",
            reqs: [["REQ-05-005", "Hệ thống phân loại và quản lý tài nguyên gồm collections và tags"]],
          }],
        },
        { id: "libfilters", title: "Filters", items: [] },
      ],
    },

    distribution: {
      label: "Distribution",
      icon: "send",
      sections: [
        {
          id: "dist", title: "Distribution", headless: true,
          items: [
            {
              id: "channels", title: "Channels", icon: "globe", cap: CAP["10"],
              blurb: "Kết nối và quản lý các kênh phân phối nội dung.",
              reqs: [["REQ-10-001", "Kết nối và quản lý các kênh phân phối đã kết nối thành công"]],
            },
            {
              id: "packages", title: "Packages", icon: "package", cap: CAP["10"],
              blurb: "Chuẩn bị package cho một project để đăng tải lên các kênh phân phối.",
              reqs: [["REQ-10-002", "Chuẩn bị package cho một project để có thể đăng tải lên các kênh phân phối"]],
            },
          ],
        },
      ],
    },
  };

  /** Pseudo-items (not in the explorer) — Assistant panel and Settings dialog. */
  const ASSISTANT = {
    cap: CAP["11"],
    blurb: "Trợ lý thông minh hỗ trợ bạn trong mọi công việc.",
    reqs: [
      ["REQ-11-001", "Yêu cầu Assistant rà soát kết quả theo yêu cầu mặc định hoặc yêu cầu cụ thể"],
      ["REQ-11-002", "Khám phá thêm tri thức với Assistant và ra lệnh chỉnh sửa, thực thi"],
    ],
  };

  const SETTINGS = [
    { id: "general", title: "General", icon: "settings", reqs: [["REQ-12-001", "Dialog chung để cài đặt và cấu hình các chức năng của phần mềm - cơ bản"]] },
    { id: "llm", title: "LLM providers", icon: "nodes", reqs: [["REQ-12-002", "Cấu hình sử dụng các LLM providers: CLI đã cài trên máy hoặc dịch vụ cloud"]] },
    { id: "backend", title: "Python backend", icon: "server", reqs: [["REQ-12-004", "Tải xuống và cài đặt mô hình TTS chạy trên python local backend"]] },
    { id: "analysis", title: "Analysis providers", icon: "spark", reqs: [["REQ-12-006", "Cấu hình provider dùng cho dịch và phân tích tri thức"]] },
    { id: "tts", title: "Local TTS models", icon: "cpu", reqs: [["REQ-12-004", "Tải xuống và cài đặt mô hình TTS chạy trên python local backend"]] },
    { id: "speech", title: "Speech providers", icon: "cloud", reqs: [["REQ-12-005", "Cấu hình sử dụng các speech providers từ cloud services"]] },
  ];

  /** Mock local TTS state used by the status bar and settings (not part of the loading splash). */
  const STARTUP_STEPS = [
    { id: "folder", label: "Kiểm tra thư mục workspace", detail: "Quyền đọc / ghi", result: "ok" },
    { id: "config", label: "Đọc cấu hình workspace", detail: "workspace.json", result: "ok" },
    { id: "index", label: "Nạp danh mục project, novel và thư viện", detail: "Quét thư mục", result: "ok" },
    { id: "cli", label: "Phát hiện CLI providers đã cài", detail: "Tìm trên máy này", result: "ok" },
    { id: "executor", label: "Khởi động pipeline executor", detail: "Concurrency mặc định", result: "ok" },
    { id: "tts", label: "Kiểm tra local TTS backend", detail: "FastAPI backend & mô hình", result: "warn", note: "Chưa cài mô hình TTS. Có thể cài sau trong Settings." },
  ];

  const seedWorkspaces = [
    { path: "D:\\DreamyWorkspace", name: "DreamyWorkspace", lastOpened: "2026-11-09 21:12", projects: 6, size: "48.2 GB" },
    { path: "E:\\Archive\\Dreamy-2025", name: "Dreamy-2025", lastOpened: "2026-09-18 21:40", projects: 14, size: "212.7 GB" },
    { path: "C:\\Program Files\\Locked", name: "Locked", lastOpened: "2026-08-21 09:30", projects: 0, size: "1.2 MB", fail: { step: "workspace", code: "folder_not_writable", detail: "Access is denied. (os error 5)" } },
    { path: "F:\\USB\\dreamy-test", name: "dreamy-test", lastOpened: "2026-07-02 10:03", projects: 1, size: "—", status: "not_found", reason: "missing" },
    { path: "D:\\Documents\\novels.txt", name: "novels.txt", lastOpened: "2026-06-11 18:45", projects: 0, size: "—", status: "not_found", reason: "not_a_directory" },
    { path: "E:\\Private\\Dreamy", name: "Dreamy", lastOpened: "2026-05-27 14:20", projects: 2, size: "—", status: "not_found", reason: "no_access" },
  ];

  return { version: "0.1.0-dev", CAP, NAV, ASSISTANT, SETTINGS, STARTUP_STEPS, seedWorkspaces };
})();
