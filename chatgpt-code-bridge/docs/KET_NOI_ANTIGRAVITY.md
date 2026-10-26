# Dùng Code Bridge với Google Antigravity

Code Bridge có thể thêm công cụ MCP vào Antigravity. Người dùng đăng nhập Google và chọn model trong Antigravity; Code Bridge không mượn session Gemini Web để thay model của Antigravity.

1. Chạy Code Bridge, chọn dự án trong **Dự án & file** và giữ ứng dụng mở.
2. Vào mục **Antigravity**, bấm **Thêm Code Bridge MCP**. Ứng dụng thêm entry `code-bridge` vào `.agents/mcp_config.json` của dự án đã chọn, giữ lại các MCP server hiện có. Bạn cũng có thể sao chép cấu hình thủ công vào file đó hoặc `~/.gemini/config/mcp_config.json`.
3. Trong Antigravity IDE, mở menu `…` ở agent side panel → **MCP Servers** → **Manage MCP Servers** → **View raw config** để kiểm tra. Tải lại server, sau đó yêu cầu agent liệt kê file bằng Code Bridge.
4. Đăng nhập tài khoản Google trong Antigravity và chọn model ở menu dưới ô nhập chat. Nếu muốn làm việc trong VS Code như ảnh tham khảo, dùng [Antigravity extension chính thức cho VS Code](https://antigravity.google/docs/ide/extensions/vscode/) rồi đăng nhập Google ngay trong extension. Danh sách model thực tế do Google quyết định theo tài khoản và bề mặt ứng dụng.

Theo [bảng model chính thức của Google](https://www.antigravity.google/docs/models/), Gemini 4 Argon có trong **Antigravity App, CLI và extension IDE**, nhưng **không có trong Antigravity IDE độc lập**. Cần Google AI Pro trả phí hoặc Ultra; bản Pro dùng thử chỉ có Argon nếu Google xác nhận thiết bị cao cấp đủ điều kiện. Cấu hình MCP chỉ thêm công cụ, không thêm model hoặc chuyển quyền dùng model từ Gemini Web sang IDE.

Để trò chuyện với Argon ngay trong editor: mở dự án bằng **VS Code**, cài extension **Google Antigravity do Google phát hành**, đăng nhập đúng tài khoản được cấp Argon, rồi chọn Argon trong menu model của extension. Nếu không thấy Argon, kiểm tra gói/quyền với Google; Code Bridge không thể mở khóa hoặc đưa Argon vào menu model. Muốn dùng Argon trên Gemini Web, hãy chọn Argon trên `gemini.google.com` rồi dùng connector **Gemini** của Code Bridge.

Một đường khác là tự xây panel chat trong IDE bằng [Gemini API `gemini-4-argon`](https://ai.google.dev/gemini-api/docs/latest-model). Đường này cần dự án API ở **paid tier** và tính phí API riêng; gói Google AI Pro không bao gồm quyền dùng Argon qua API.

MCP dùng Streamable HTTP tại URL local Code Bridge hiển thị, ví dụ `http://127.0.0.1:3213/mcp` trong bản đóng gói. Nếu Antigravity chạy ở container hoặc máy khác, địa chỉ `127.0.0.1` của nó không trỏ về máy chạy Code Bridge.
