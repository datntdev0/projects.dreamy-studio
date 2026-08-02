# _proto

Prototype giao diện của Dreamy Studio. Mở trực tiếp `index.html` trong trình duyệt (không cần build, không cần backend). Mọi dữ liệu là giả lập.

Màn hình chức năng chưa làm hiển thị **Coming soon** kèm danh sách requirement mà màn đó sẽ phủ.

## Cấu trúc

```
_proto/
├─ index.html          Khung trang + icon sprite
├─ design.html         Design system: màu, typography, spacing, radius, component (mở trực tiếp trong trình duyệt)
├─ assets/             Logo
├─ css/
│  ├─ tokens.css       Token màu / typography / spacing / radius / component cơ bản
│  ├─ app.css          Layout: splash, title bar, rail, explorer, tabs, inspector, bottom panel, status bar
│  └─ novel.css        Các màn hình Novel, pipeline list, toast
└─ js/
   ├─ data.js          Mô hình điều hướng (capability → màn hình → requirement), các bước khởi động, workspace mẫu
   ├─ app.js           Splash, main layout, dialog, menu, phím tắt, pipeline nền, toast, đăng ký màn hình
   ├─ novel-data.js    Dữ liệu mẫu của Novel (nội dung chương, bản dịch, từ điển, tri thức)
   ├─ novel-common.js  Tiện ích dùng chung và hiệu ứng chéo giữa các màn hình Novel
   ├─ novel-mgmt.js    Novel management (list / grid, chọn nhiều, xóa), màn hình Chapters → Reading, explorer nhóm theo novel + Filters
   ├─ novel-import.js  Wizard nhập novel từ package (3 bước: chọn file → kiểm tra → xem trước và chỉnh sửa)
   ├─ novel-translation.js  Novel translation: luồng lặp từ điển → hướng dẫn → dịch → kết quả → cảnh báo
   ├─ novel-kb-check.js     Bộ kiểm tra xung đột tất định + sinh ontology.yml từ định nghĩa ontology
   ├─ novel-kb-graph.js     Đồ thị tri thức kiểu Obsidian (force-directed, pan / zoom / kéo nút)
   ├─ novel-kb-edit.js      Dialog sửa entity / fact theo mô hình draft (hoàn tác, xem trước xung đột)
   └─ novel-knowledge.js    Novel knowledgebase: Graph · List · Review, dialog phân tích / ontology / sửa
```

## Quy ước giao diện

- Design system được mô tả đầy đủ trong [`design.html`](design.html) (dùng chính `css/tokens.css` và `css/app.css`, nên luôn khớp với prototype).
- Mật độ dày (control cao 28 / 24 px) và radius nhỏ (2 / 3 / 4 / 6 px). Toàn bộ nằm ở các biến `--sp-*`, `--r-*`, `--ctl-h*` trong `css/tokens.css`.

## Đã có

| Requirement | Nội dung | Ở đâu |
|---|---|---|
| REQ-01-001 | Splash tạo mới / mở lại workspace, danh sách workspace gần đây, workspace bị mất thư mục | Splash (welcome) |
| REQ-01-002 | Splash loading: kiểm tra và khởi động (thư mục, cấu hình, danh mục, CLI providers, pipeline executor, local TTS). Cảnh báo không chặn việc vào app | Splash (loading) |
| REQ-01-003 | Dialog đổi workspace sau khi đã mở | Title bar, status bar, `File → Đổi workspace…` |
| REQ-12-001..005 | Settings dialog với đủ 5 nhóm (nội dung coming soon) | Rail dưới cùng, `Ctrl ,` |
| REQ-11-001/002 | Assistant panel (coming soon); rà soát bản dịch và hỏi đáp tri thức đã dùng được ở màn Novel | Rail dưới cùng, tab Assistant bên phải |
| REQ-02-001 | Tạo novel mới; nhập từ package `.dsnovel` / `.zip` qua wizard 3 bước (chọn file và xem cấu trúc gợi ý → kiểm tra → xem trước, sửa metadata rồi xác nhận); danh sách dạng lưới hoặc bảng, chọn nhiều và xóa | Novel management |
| REQ-02-002 | Mỗi novel có hai màn hình: **Chapters** (danh sách chương) → **Reading**. Tùy chỉnh hiển thị (phông, cỡ chữ, giãn dòng, độ rộng, nền, số đoạn, căn đều) nằm ở Inspector; thanh công cụ chọn ngôn ngữ đọc (gốc / bản dịch) và bố cục (một ngôn ngữ / song song); chương chưa dịch hiện thông báo kèm nút Dịch chương; chế độ Sửa từng đoạn | Explorer → novel → Chapters |
| REQ-03-001 | Từ điển và hướng dẫn dịch (mục đích, độc giả, giọng văn, xưng hô, quy ước) là hai bước đầu của luồng dịch; từ điển sửa trực tiếp trên từng dòng (lưu khi rời ô hoặc Enter), thêm mục bằng dòng nháp ở đầu bảng | Translation, bước 1–2 |
| REQ-03-002 | Chọn chương, ước tính chi phí, dịch thử, chạy pipeline và theo dõi tiến độ | Translation, bước 3 |
| REQ-03-003 | Đọc song song, sửa bản dịch trực tiếp, ghi chú theo đoạn, thêm quyết định vào từ điển | Translation, bước 4 |
| REQ-03-004 | Cảnh báo khi nguồn, hướng dẫn hoặc từ điển đổi; xem đoạn, mở từ điển / hướng dẫn, dịch lại, đã xem xét, bỏ qua | Translation, bước 5 |
| REQ-11-001 | Nhờ Assistant rà soát bản dịch (mặc định hoặc theo yêu cầu), gợi ý có dẫn chứng, áp dụng hoặc bỏ qua | Translation, bước 4 |
| REQ-04-001 | Phân tích theo khoảng chương (còn thiếu / khoảng / toàn bộ, có tùy chọn ghi đè) từ **ngôn ngữ nguồn** chọn được (bản gốc hoặc bản dịch đã có; chương chưa có nội dung ở ngôn ngữ đó bị bỏ qua), xem `ontology.yml` và mở bằng trình soạn thảo mặc định (prototype: tải file xuống) | Knowledgebase, dialog Phân tích và ontology.yml |
| REQ-04-002 | Graph kiểu Obsidian; List entity / fact; sửa entity, fact bằng dialog draft (thêm / sửa / xóa / gộp / tách, hoàn tác từng thay đổi, xem trước kết quả kiểm tra xung đột, chỉ cho xác nhận khi ổn); Review chạy 7 quy tắc tất định trên kết quả của LLM | Knowledgebase, tab Graph · List · Review |
| REQ-04-003 | Nhận định gắn với nguồn đã đổi hiện ở Review (quy tắc `source_stale`), giữ nguyên hoặc phân tích lại | Knowledgebase, tab Review |
| REQ-12-003 | Pipeline executor chạy nền, concurrency 2, theo dõi và hủy | Bottom panel, status bar |

## Main layout

| Vùng | Ghi chú |
|---|---|
| Title bar | Menu File / View / Help, workspace hiện tại, bật/tắt panel |
| Activity rail | Projects · Novels · Library · Distribution, phía dưới là Assistant và Settings |
| Explorer | Cây màn hình theo từng nhóm; mỗi mục mở một tab |
| Editor tabs + breadcrumb | Tab `Home` luôn có khi không còn tab nào |
| Inspector / Assistant | Panel phải, đổi tab bằng header |
| Bottom panel | `Pipelines` (REQ-12-003) và `Output` (log khởi động) |
| Status bar | Workspace, trạng thái pipeline, cảnh báo local TTS, theme, phiên bản |

### Màn hình còn coming soon theo capability

| Rail | Màn hình | Capability |
|---|---|---|
| Projects | Danh mục project | CAP-06 |
| Projects | Scripting, Character, World, Storyboard | CAP-07 |
| Projects | Audiobook, Canvas | CAP-08 |
| Projects | Video editor | CAP-09 |
| Library | Images, Sounds, Videos, Prompts, Collections & tags, Voices | CAP-05 |
| Distribution | Channels, Packages | CAP-10 |

## Mẹo khi xem

- Thêm `?first-run` vào URL để xem splash khi chưa có workspace nào.
- Danh sách workspace gần đây được lưu ở `localStorage` (khóa `ds.recent`); xóa khóa này để quay về dữ liệu mẫu.
- Theme sáng / tối đổi bằng nút ở status bar hoặc `View`; lựa chọn được nhớ lại.
- Phím tắt: `Ctrl B` Explorer · `Ctrl Alt B` Inspector · `Ctrl J` Pipelines · `Ctrl W` đóng tab · `Ctrl ,` Settings · `Esc` đóng dialog.
- Kéo cạnh Explorer, Inspector và Bottom panel để đổi kích thước.

## Màn hình Novel

- **Explorer** nhóm theo novel: mỗi novel có `Chapters`, `Translation`, `Knowledgebase`, kèm tiến độ dạng `2/12`. Chỉ có `Novel management` đứng riêng.
- **Explorer** có thêm section **Filters** dưới Novels: tag và ngôn ngữ hiện dạng pill xuống dòng, chọn được nhiều pill (khớp mọi tag đã chọn; ngôn ngữ khớp một trong các ngôn ngữ chọn). Bộ lọc áp cho cả explorer lẫn Novel management.
- **Novel management**: nút chuyển lưới / bảng (lựa chọn được nhớ). Bấm một novel chỉ chọn nó: Inspector hiện bìa (đổi / xóa ảnh), form sửa thông tin và tags, nút **Mở** và **Xóa novel**. Nhấp đúp hoặc Enter để mở thẳng. Mỗi novel có **tên gốc** (hiện trên bìa ở dạng lưới) và **tên hiển thị** tùy chọn (dùng ở explorer, tab, danh sách; để trống thì dùng tên gốc), cả hai sửa được ở Inspector, dialog Tạo novel và wizard Nhập package. Chọn nhiều bằng ô tích, `Ctrl`+bấm, `Shift`+bấm hoặc "Chọn tất cả"; thanh công cụ và Inspector có nút **Xóa** (phím `Delete` cũng được), có hộp thoại xác nhận. Xóa novel đóng các tab của nó.
- **Chapters**: Inspector cho sửa tên, tác giả, ngôn ngữ, mô tả và tags của novel. Reading dùng ô nhảy số chương thay cho select, để chịu được novel hàng nghìn chương.
- **Translation** là luồng năm bước: Từ điển → Hướng dẫn → Dịch → Kết quả → Cảnh báo. Người dùng tự chuyển về bước muốn chỉnh hoặc chạy lại; mỗi bước hiện tóm tắt trạng thái ngay trên thanh luồng. Bước Dịch có ô tìm và bộ lọc chương, ô nhảy số chương thay cho select dài.
- **Knowledgebase** chỉ có một màn hình gồm ba tab. `Phân tích…` và `ontology.yml` là nút trên thanh công cụ; chi tiết của nút / dòng đang chọn nằm ở Inspector. Hỏi đáp tri thức với Assistant (REQ-11-002) đã được gỡ khỏi màn này.
- **Dialog sửa** theo mô hình draft: thêm / sửa / xóa / gộp / tách entity và fact, hoàn tác từng thay đổi, xem trước kết quả kiểm tra xung đột và chỉ cho xác nhận khi ổn. Mở từ một vấn đề ở Review thì phải giải quyết được chính vấn đề đó mới xác nhận được.
- **Review** chạy bằng code, không dùng LLM. Bảy quy tắc được khai báo trong ontology: `evidence_quote`, `relation_signature`, `attribute_single`, `relation_unique`, `entity_duplicate`, `dangling_ref`, `source_stale`. Vấn đề tự biến mất khi dữ liệu được sửa; "Bỏ qua" có thể hoàn tác.
- Đã bỏ các ô xác nhận quyền sử dụng ở màn Translation và Knowledgebase; sẽ thêm lại khi cần.

## Dữ liệu mẫu của Novel

- Các novel mẫu có sẵn tags (ví dụ `fantasy`, `sci-fi`, `drama`) để thử Filters.
- Chỉ novel `The Lantern Keeper of Harrowmere` (tác phẩm bịa) có nội dung: chương 1–3 có đoạn văn, bản dịch tiếng Việt, tri thức. Các chương 4–12 và novel khác chỉ có siêu dữ liệu; Translation và Knowledgebase của novel đó hiện lời mời mở novel mẫu.
- Kết quả "LLM" mẫu cố ý có sẵn bốn lỗi để Review có việc làm: entity trùng (`Maro` / `Maro Quill`), quan hệ sai kiểu (`Bà lão bán trà` nằm trong `Bến Chìm`), dẫn chứng không có trong văn bản, và `Số bậc` có hai giá trị (312 / 321). Cộng thêm hai nhận định gắn với nguồn đã đổi.
- Mọi thay đổi (sửa nguồn, đổi từ điển, xác nhận nhận định, gộp entity) nằm trong bộ nhớ và mất khi tải lại trang hoặc đổi workspace.
- Có sẵn hai cảnh báo dịch. Sửa một đoạn nguồn trong Reading (chế độ Sửa) sẽ tạo thêm cảnh báo ở Translation và đánh dấu nhận định liên quan ở Knowledgebase.
- Package `.dsnovel` là cấu trúc đề xuất cho prototype (zip gồm `manifest.json` và thư mục `chapters\`), chưa phải đặc tả chính thức.
