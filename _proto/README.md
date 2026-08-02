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
│  └─ app.css          Layout: splash, title bar, rail, explorer, tabs, inspector, bottom panel, status bar
└─ js/
   ├─ data.js          Mô hình điều hướng (capability → màn hình → requirement), các bước khởi động, workspace mẫu
   └─ app.js           Splash, main layout, dialog, menu, phím tắt
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
| REQ-11-001/002 | Assistant panel (coming soon) | Rail dưới cùng, tab Assistant bên phải |

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

### Màn hình coming soon theo capability

| Rail | Màn hình | Capability |
|---|---|---|
| Projects | Danh mục project | CAP-06 |
| Projects | Scripting, Character, World, Storyboard | CAP-07 |
| Projects | Audiobook, Canvas | CAP-08 |
| Projects | Video editor | CAP-09 |
| Novels | Novel management | CAP-02 |
| Novels | Novel translation | CAP-03 |
| Novels | Novel knowledgebase | CAP-04 |
| Library | Images, Sounds, Videos, Prompts, Collections & tags, Voices | CAP-05 |
| Distribution | Channels, Packages | CAP-10 |

## Mẹo khi xem

- Thêm `?first-run` vào URL để xem splash khi chưa có workspace nào.
- Danh sách workspace gần đây được lưu ở `localStorage` (khóa `ds.recent`); xóa khóa này để quay về dữ liệu mẫu.
- Theme sáng / tối đổi bằng nút ở status bar hoặc `View`; lựa chọn được nhớ lại.
- Phím tắt: `Ctrl B` Explorer · `Ctrl Alt B` Inspector · `Ctrl J` Pipelines · `Ctrl W` đóng tab · `Ctrl ,` Settings · `Esc` đóng dialog.
- Kéo cạnh Explorer, Inspector và Bottom panel để đổi kích thước.
