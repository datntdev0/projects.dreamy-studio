# Dreamy Studio

Dreamy Studio là phần mềm desktop gom các công đoạn dịch thuật, phân tích tri thức, viết kịch bản và sản xuất audiobook từ tiểu thuyết vào một studio duy nhất. Dữ liệu dự án nằm trên máy của bạn, chạy tốt trên phần cứng khiêm tốn và tích hợp được với các công cụ AI bên ngoài.

- Trang chủ: https://datntdev0.github.io/projects.dreamy-studio/
- Tài liệu hướng dẫn: https://datntdev0.github.io/projects.dreamy-studio/docs/
- Bản phát hành: https://github.com/datntdev0/projects.dreamy-studio/releases/latest

## Cài đặt

Yêu cầu Windows 10 (1803 trở lên) hoặc Windows 11, 64-bit. Không cần quyền quản trị.

Mở PowerShell, dán lệnh sau và nhấn Enter:

```powershell
irm https://datntdev0.github.io/projects.dreamy-studio/install.ps1 | iex
```

Script tải bản portable mới nhất từ GitHub Releases, kiểm tra SHA-256, giải nén vào `%LOCALAPPDATA%\Programs\DreamyStudio` và tạo shortcut ở Start menu và Desktop. Muốn cập nhật, chạy lại lệnh trên; dữ liệu trong thư mục cài đặt được giữ nguyên.

Nếu thích tải thủ công, vào trang [Releases](https://github.com/datntdev0/projects.dreamy-studio/releases/latest) để lấy bộ cài `.exe`, `.msi` hoặc bản portable `.zip`. Do ứng dụng chưa có chữ ký số, Windows có thể hiện cảnh báo SmartScreen: bấm “More info” rồi chọn “Run anyway”.

## Tính năng

| Công đoạn | Mô tả |
| --- | --- |
| Nguồn | Nhập, đọc và chỉnh sửa tiểu thuyết theo chương trong workspace cục bộ. |
| Dịch thuật | Dịch bằng LLM với từ điển, hướng dẫn và cảnh báo để rà soát. |
| Tri thức | Trích xuất nhân vật, sự kiện, bằng chứng và kiểm tra tính nhất quán. |
| Kịch bản | Soạn kịch bản từng chương, phân vai và gán giọng cho nhân vật. |
| Audiobook | Tổng hợp giọng nói cục bộ, nghe duyệt và xuất WAV kèm phụ đề SRT. |

Ngoài ra còn có:

- **Trợ lý AI**: viết lại kịch bản ngay cạnh trình soạn, bạn duyệt rồi mới áp dụng. Dùng Claude Code, Codex hoặc Antigravity CLI với tài khoản của bạn, tải ngay trong phần Cài đặt.
- **Giọng đọc**: chọn giọng mẫu có sẵn hoặc nhân bản giọng từ âm thanh mẫu.
- **Giọng đọc cloud**: ElevenLabs với API key của bạn (key lưu trong Windows Credential Manager) hoặc Microsoft Edge Read Aloud miễn phí, không cần key.
- **Pipelines**: dịch, phân tích và tạo audio chạy nền với hàng đợi, giới hạn đồng thời, nút hủy và log.
- **Thư viện tài nguyên**: ảnh, âm thanh, video và prompt với bộ sưu tập, tag và xem trước.
- **Backend & GPU**: backend TTS cục bộ, tự nhận GPU NVIDIA và tải CUDA runtime, model ngay trong app.

## Phát triển

### Cấu trúc thư mục

| Thư mục | Nội dung |
| --- | --- |
| `angular/` | Giao diện người dùng (Angular). |
| `desktop/` | Ứng dụng desktop (Tauri, Rust). |
| `backend/` | Backend TTS (Python). |
| `playwright/` | Kiểm thử end-to-end. |
| `landing/` | Trang giới thiệu, tài liệu và script cài đặt, deploy lên GitHub Pages. |
| `_scripts/` | Script build, lint, format và coverage. |

### Yêu cầu

- Node.js 22 và pnpm
- Rust (stable)
- Python 3.12
- Visual Studio Build Tools (MSVC) để build và đóng gói Visual C++ runtime

### Lệnh thường dùng

```powershell
pnpm install          # cài dependencies
pnpm start            # chạy ứng dụng ở chế độ dev
pnpm lint             # kiểm tra lint
pnpm format           # kiểm tra format
pnpm build:prepare    # chuẩn bị backend và Visual C++ runtime để đóng gói
pnpm build:installer  # build bộ cài .exe và .msi vào _output/installer
pnpm build:portable   # build bản portable .zip vào _output/portable
```

### Phát hành

Workflow **Continuous Deployment** chạy thủ công trên GitHub Actions, với hai lựa chọn:

- **Build Application**: build bộ cài và bản portable, tạo tag `v<version>` theo `desktop/tauri.conf.json` và đăng lên GitHub Releases. Nếu có file `.github/releases/v<version>.md` thì dùng làm mô tả release.
- **Deploy Landing Page**: deploy thư mục `landing/` lên GitHub Pages.

## Lưu ý

Dreamy Studio cung cấp công cụ để người dùng tạo và phân phối nội dung từ tài nguyên do họ tự chọn. Người dùng chịu trách nhiệm bảo đảm mình có quyền sử dụng tài nguyên cho mục đích dự kiến và quyết định nội dung được gửi đến dịch vụ bên ngoài hoặc đăng lên tài khoản của mình. Dreamy Studio không xác minh hay cấp quyền sử dụng đối với các tài nguyên đó; đồng thời vẫn chịu trách nhiệm đối với việc bảo mật ứng dụng, xử lý dữ liệu và vận hành các tích hợp do mình cung cấp.

## Giấy phép

Dreamy Studio phát hành theo giấy phép [MIT](LICENSE).
