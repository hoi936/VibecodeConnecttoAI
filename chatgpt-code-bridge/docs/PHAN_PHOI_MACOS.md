# Code Bridge trên macOS

Code Bridge 0.3.3 có hai gói: `CodeBridge-0.3.3-mac-arm64.app.zip` cho Mac Apple Silicon và `CodeBridge-0.3.3-mac-x64.app.zip` cho Mac Intel. Giải nén, kéo `CodeBridge.app` vào Applications rồi mở ứng dụng. Một cửa sổ Terminal sẽ hiện và trình duyệt tự mở `http://127.0.0.1:3213/`. Giữ Terminal mở khi sử dụng; nhấn **Ctrl+C** trong cửa sổ đó để dừng cổng MCP và các tunnel.

Nếu tạo gói **trên Mac**, lệnh đóng gói còn tạo file `.dmg` cùng kiến trúc. Mở DMG rồi kéo `CodeBridge.app` vào biểu tượng Applications. Bản `.app.zip` được tạo trong WSL/Linux là gói macOS có đủ runtime, nhưng **chưa được chạy thử trên macOS**. Ứng dụng chưa được ký số hoặc notarize; tùy cài đặt bảo mật của máy, macOS có thể yêu cầu bạn xác nhận trước khi mở.

Kho mã có workflow **Build Code Bridge macOS**. Mỗi lần push thay đổi Code Bridge lên nhánh `dev`, GitHub Actions chạy trên macOS, tạo và kiểm tra hai DMG, rồi lưu chúng ở phần **Actions → Artifacts** của lần chạy tương ứng. Artifact có thời hạn 14 ngày. Workflow cũng có thể chạy thủ công bằng `workflow_dispatch`.

Sau khi mở, vào **Dự án & file** để chọn thư mục dự án trên Mac. `demo-project` trong gói chỉ là ví dụ. Dữ liệu cấu hình được lưu ở `~/Library/Application Support/CodeBridge`, tách khỏi thư mục ứng dụng. Mỗi tài khoản macOS có cấu hình riêng. Runtime API Key ChatGPT chỉ giữ trong bộ nhớ; quyền OAuth của Gemini/Claude/Grok cần cấp lại sau khi đóng ứng dụng. URL Quick Tunnel có thể thay đổi mỗi lần mở lại.

Nếu cổng 3213 đang được một phiên khác dùng, hãy dừng phiên đó trước khi mở Code Bridge. Bản Mac kèm Node.js, Filesystem MCP, OpenAI tunnel-client và cloudflared đúng kiến trúc; máy nhận không cần cài Node hay Homebrew. Gói chỉ chứa `demo-project/index.html`, không chứa các thư mục dự án cá nhân.

## Tạo lại gói

Trên macOS hoặc WSL/Linux có Node.js 22+, npm, Go 1.25+, `curl`, `tar` và `unzip`:

```bash
cd chatgpt-code-bridge
npm ci
npm run setup
npm run build
npm run package:mac
```

Lệnh mặc định tạo cả `arm64` và `x64`. Dùng `npm run package:mac -- --arch=arm64` hoặc `--arch=x64` để chỉ tạo một loại. Script tải ba runtime từ nguồn chính thức và đối chiếu SHA-256 đã ghim, biên dịch launcher Mach-O cho từng kiến trúc, cài dependency production, kiểm tra không có module native và tạo `.app.zip` cùng file checksum. Trên macOS, script còn dùng `hdiutil` để tạo `.dmg` có lối kéo vào Applications. WSL/Linux không có `hdiutil`, nên không thể tạo hoặc chạy thử DMG tại đó.

Để phát hành rộng rãi, hãy build và kiểm thử trên Mac thật, sau đó ký số và notarize bằng tài khoản Apple Developer của bạn. Không coi file `.app.zip` tạo trên WSL là đã được xác nhận hoạt động trên macOS.
