# Chạy Code Bridge trên máy Windows khác

**Dùng gói `CodeBridge-0.3.7-win-x64.zip`.** Đây là bản portable cho Windows x64, không phải một tệp `.exe` độc lập: Node, Filesystem MCP và các chương trình tunnel phải nằm cạnh `CodeBridge.exe` trong thư mục đã giải nén. Máy nhận không cần cài Node.js hoặc Git. File `.exe` chưa được ký số.

## Trên máy nhận

1. Chép cả file ZIP sang máy Windows x64. Giải nén **toàn bộ** ZIP vào một thư mục, ví dụ `D:\CodeBridge`. Không mở `CodeBridge.exe` trực tiếp bên trong ZIP.
2. Mở `CodeBridge.exe`; giữ cửa sổ này mở khi sử dụng. Trình duyệt sẽ mở `http://127.0.0.1:3213/`. Nếu trình duyệt không tự mở, nhập địa chỉ đó bằng tay. Nếu cổng 3213 đang dùng, đóng phiên cũ trước.
3. Vào **Dự án & file**, chọn thư mục dự án trên máy nhận. Thư mục `demo-project` đi kèm chỉ là ví dụ. Cẩn thận chọn đúng phạm vi dữ liệu bạn muốn cho AI truy cập và bật/tắt **Cho phép sửa file**.
4. Vào ô ChatGPT, Gemini, Claude hoặc Grok trên trang chủ và làm theo hướng dẫn tương ứng. Tài khoản vẫn phải có tính năng MCP/Custom apps mà nhà cung cấp yêu cầu. Với ChatGPT cần Tunnel ID và Runtime API Key; không dùng session token/cookie. Với Gemini/Claude/Grok, bấm **Tạo URL và kết nối**: ứng dụng tự chạy tunnel, bật cổng và hiện URL MCP có `/mcp` để copy sang website AI. Các file `START-...-TUNNEL.cmd` chỉ là phương án thủ công cũ.
5. Đóng cửa sổ Code Bridge và các cửa sổ tunnel để dừng kết nối. Mở lại ứng dụng khi cần; Runtime API Key ChatGPT phải nhập lại. Với URL HTTPS cố định, quyền OAuth Gemini/Claude/Grok còn hạn được khôi phục; tunnel bên ngoài cũng phải chạy lại. Với Quick Tunnel, URL đổi sau mỗi lần chạy nên phải cập nhật connector và duyệt quyền mới.

Nếu nút **Tạo URL và kết nối** báo phiên cũ hoặc hiện lỗi `Unexpected token '<'`, trang giao diện mới đang nói chuyện với tiến trình Code Bridge cũ trên cùng cổng. Hoàn tất phiên đang dùng, đóng cửa sổ Code Bridge cũ, mở `CodeBridge.exe` từ bản 0.3.7 đã giải nén, rồi tải lại trang. Việc chỉ làm mới trang sẽ không cập nhật backend đang chạy.

Cấu hình của bản portable nằm ở `%LOCALAPPDATA%\CodeBridge` của tài khoản Windows đang dùng; không nằm trong ZIP. Mỗi người dùng Windows có cấu hình riêng. Chuyển ZIP sang máy khác không chuyển tài khoản, token hay quyền truy cập. Nếu di chuyển thư mục đã giải nén, vào **Dự án & file** chọn lại workspace vì đường dẫn cũ có thể không còn tồn tại.

Gói ZIP không chứa thư mục dự án cá nhân và không tự mở tunnel public. API quản trị chỉ lắng nghe trên `127.0.0.1`; khi bạn tự bật tunnel và duyệt quyền, người có quyền kết nối có thể dùng công cụ trong workspace theo quyền đã cấp. Đọc [hướng dẫn ChatGPT/Gemini](HUONG_DAN_CHATGPT_GEMINI.md) và [Claude/Grok](HUONG_DAN_CLAUDE_GROK_META.md) trước khi chia sẻ URL MCP.

## Tạo lại gói từ mã nguồn

Trên Windows có WSL, Node.js 22+, npm, `curl`, Python 3 và .NET Framework compiler (`csc.exe`):

```bash
cd chatgpt-code-bridge
npm ci
npm run setup
npm run build
npm run package:win
```

Kết quả là `dist/CodeBridge-0.3.7-win-x64.zip` và file `.zip.sha256` đi kèm. Script tải Node.js, OpenAI tunnel-client và cloudflared từ bản phát hành chính thức, đối chiếu SHA-256 đã ghim; cài dependency production bằng `npm ci`; sau đó đóng gói. `dist/` được bỏ qua bởi Git. Kiểm tra file nhận được bằng SHA-256 trước khi phát cho người khác. Khi cập nhật runtime, sửa cả URL và checksum ghim trong `scripts/package-windows.mjs`, rồi build và kiểm thử lại.

Đây là gói portable, chưa có bộ cài `.msi`, tự cập nhật hoặc chữ ký số. Chúng tôi đã kiểm tra native Windows cho mở dashboard và gọi công cụ Filesystem MCP; kết nối end-to-end tới tài khoản ChatGPT/Gemini/Claude/Grok vẫn cần tài khoản và quyền tương ứng để thử trên từng máy.
