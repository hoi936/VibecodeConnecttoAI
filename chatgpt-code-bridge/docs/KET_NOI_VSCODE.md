# Dùng Code Bridge trong VS Code

Code Bridge cấp **công cụ MCP** cho chat Agent trong VS Code. Muốn thấy ChatGPT Web như một model riêng trong Codex, cần thêm cầu nối Responses chạy trên máy. Trang **VS Code / Codex** của Code Bridge hiện kiểm tra cầu nối đó và liệt kê model Web mà Codex có thể nhận.

1. Mở Code Bridge và giữ ứng dụng chạy. Trong **Dự án & file**, chọn thư mục muốn agent dùng và quyền đọc/ghi phù hợp.
2. Mở trang **VS Code / Codex** trong Code Bridge để sao chép URL MCP local, thường là `http://127.0.0.1:3213/mcp` ở bản đóng gói. Nếu bạn chạy mã nguồn với cổng khác, dùng URL hiển thị trong ứng dụng.
3. Với GitHub Copilot Chat, bấm **Thêm MCP vào dự án đã chọn** trên dashboard để tạo hoặc cập nhật `.vscode/mcp.json` mà vẫn giữ các server khác. Bạn cũng có thể mở Command Palette của VS Code → **MCP: Add Server** → **HTTP** và dán URL. Mở chat Agent, bật công cụ `code-bridge` trong Tools, rồi yêu cầu thử liệt kê file.
4. Với [Codex extension chính thức](https://learn.chatgpt.com/docs/ide) trong VS Code, đăng nhập bằng tài khoản ChatGPT trong extension. Thêm đoạn `[mcp_servers.code_bridge]` mà Code Bridge hiển thị vào `~/.codex/config.toml`, mở phiên Codex mới rồi kiểm tra công cụ bằng cách yêu cầu liệt kê file. Model được chọn trong Codex, theo quyền tài khoản của bạn.
5. Muốn dùng tài khoản Google AI Pro và Gemini 4 Argon ngay trong VS Code, cài [Google Antigravity extension chính thức](https://antigravity.google/docs/ide/extensions/vscode/), đăng nhập Google và chọn Argon trong menu model nếu tài khoản được cấp. Dùng cùng cấu hình MCP của Code Bridge theo [hướng dẫn Antigravity](KET_NOI_ANTIGRAVITY.md).

## ChatGPT Web trong menu model Codex

Đây là phần cài riêng, không dùng Tunnel ID hoặc Runtime API Key của trang ChatGPT trong Code Bridge:

1. Cài và chạy [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web) từ mã nguồn hoặc bản phát hành của dự án đó. Đây là phần mềm bên thứ ba; xem quyền và mã nguồn trước khi cài.
2. Đăng nhập ChatGPT trong trình duyệt do ứng dụng cầu nối mở. Chọn **Install models** trong ứng dụng, rồi mở lại Codex VS Code.
3. Trong Code Bridge → **VS Code / Codex** → **Kiểm tra model Web**, bấm **Kiểm tra lại**. Trạng thái sẵn sàng và tên các model `chatgpt-web/...` xác nhận cầu nối đang trả danh sách model. Sau đó chọn model có hậu tố **(Web)** trong Codex.
4. Để ChatGPT Web thao tác file và terminal trong phiên Codex, làm tiếp hướng dẫn **Full harness / MCP** của chính ứng dụng cầu nối. MCP của Code Bridge là một server công cụ khác và vẫn dùng được riêng; chỉ thấy model Web chưa chứng minh công cụ đã hoạt động.

Cơ chế: Codex gọi `/v1/models` và `/v1/responses` trên máy qua `openai_base_url`; cầu nối chuyển yêu cầu Web qua phiên trình duyệt. Trang ChatGPT/Gemini/Claude/Grok của Code Bridge hiện đi chiều **website AI → Code Bridge**. Không đưa cookie hay session token Web vào Code Bridge.

Nếu không thấy công cụ: kiểm tra Code Bridge còn chạy, URL/cổng đúng, MCP server đã được bật trong IDE và workspace đã được chọn. `127.0.0.1` là máy nơi agent chạy; nếu agent chạy trong container/remote SSH, URL localhost của Windows không tự trỏ về Windows.
