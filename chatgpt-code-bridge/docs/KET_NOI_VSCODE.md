# Dùng Code Bridge trong VS Code

Code Bridge có thể cấp **công cụ MCP** cho chat Agent trong VS Code. Nó không phải model AI và không chuyển session token từ ChatGPT/Gemini Web thành model trong VS Code. Danh sách model trong ảnh do extension IDE cung cấp và phụ thuộc tài khoản đăng nhập ở extension đó.

1. Mở Code Bridge và giữ ứng dụng chạy. Trong **Dự án & file**, chọn thư mục muốn agent dùng và quyền đọc/ghi phù hợp.
2. Mở trang **VS Code / Codex** trong Code Bridge để sao chép URL MCP local, thường là `http://127.0.0.1:3213/mcp` ở bản đóng gói. Nếu bạn chạy mã nguồn với cổng khác, dùng URL hiển thị trong ứng dụng.
3. Với GitHub Copilot Chat, bấm **Thêm MCP vào dự án đã chọn** trên dashboard để tạo hoặc cập nhật `.vscode/mcp.json` mà vẫn giữ các server khác. Bạn cũng có thể mở Command Palette của VS Code → **MCP: Add Server** → **HTTP** và dán URL. Mở chat Agent, bật công cụ `code-bridge` trong Tools, rồi yêu cầu thử liệt kê file.
4. Với [Codex extension chính thức](https://learn.chatgpt.com/docs/ide) trong VS Code, đăng nhập bằng tài khoản ChatGPT trong extension. Thêm đoạn `[mcp_servers.code_bridge]` mà Code Bridge hiển thị vào `~/.codex/config.toml`, mở phiên Codex mới rồi kiểm tra công cụ bằng cách yêu cầu liệt kê file. Model được chọn trong Codex, theo quyền tài khoản của bạn.
5. Muốn dùng tài khoản Google AI Pro và Gemini 4 Argon ngay trong VS Code, cài [Google Antigravity extension chính thức](https://antigravity.google/docs/ide/extensions/vscode/), đăng nhập Google và chọn Argon trong menu model nếu tài khoản được cấp. Dùng cùng cấu hình MCP của Code Bridge theo [hướng dẫn Antigravity](KET_NOI_ANTIGRAVITY.md).

MCP kết nối theo hướng **IDE agent → Code Bridge → file/công cụ trên máy**. Các kết nối ChatGPT/Gemini/Claude/Grok Web hiện có đi theo hướng ngược lại (**website AI → Code Bridge**). Bật kết nối web không khiến Copilot hoặc Codex tự dùng tài khoản web đó làm model. Để dùng model khác trong IDE, hãy dùng cách đăng nhập hoặc provider chính thức mà extension đó hỗ trợ.

Nếu không thấy công cụ: kiểm tra Code Bridge còn chạy, URL/cổng đúng, MCP server đã được bật trong IDE và workspace đã được chọn. `127.0.0.1` là máy nơi agent chạy; nếu agent chạy trong container/remote SSH, URL localhost của Windows không tự trỏ về Windows.
