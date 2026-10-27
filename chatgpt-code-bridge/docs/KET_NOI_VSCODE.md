# Dùng Code Bridge trong VS Code

Code Bridge cấp **công cụ MCP** cho chat Agent trong VS Code. Muốn thấy ChatGPT Web như một model riêng trong Codex, cần thêm cầu nối Responses chạy trên máy. Trang **VS Code / Codex** của Code Bridge tích hợp cầu nối này, cho phép đăng nhập, thêm model và tạm dừng ngay trong ứng dụng.

1. Mở Code Bridge và giữ ứng dụng chạy. Trong **Dự án & file**, chọn thư mục muốn agent dùng và quyền đọc/ghi phù hợp.
2. Mở trang **VS Code / Codex** trong Code Bridge để sao chép URL MCP local, thường là `http://127.0.0.1:3213/mcp` ở bản đóng gói. Nếu bạn chạy mã nguồn với cổng khác, dùng URL hiển thị trong ứng dụng.
3. Với GitHub Copilot Chat, bấm **Thêm MCP vào dự án đã chọn** trên dashboard để tạo hoặc cập nhật `.vscode/mcp.json` mà vẫn giữ các server khác. Bạn cũng có thể mở Command Palette của VS Code → **MCP: Add Server** → **HTTP** và dán URL. Mở chat Agent, bật công cụ `code-bridge` trong Tools, rồi yêu cầu thử liệt kê file.
4. Với [Codex extension chính thức](https://learn.chatgpt.com/docs/ide) trong VS Code, đăng nhập bằng tài khoản ChatGPT trong extension. Thêm đoạn `[mcp_servers.code_bridge]` mà Code Bridge hiển thị vào `~/.codex/config.toml`, mở phiên Codex mới rồi kiểm tra công cụ bằng cách yêu cầu liệt kê file. Model được chọn trong Codex, theo quyền tài khoản của bạn.
5. Muốn dùng tài khoản Google AI Pro và Gemini 4 Argon ngay trong VS Code, cài [Google Antigravity extension chính thức](https://antigravity.google/docs/ide/extensions/vscode/), đăng nhập Google và chọn Argon trong menu model nếu tài khoản được cấp. Dùng cùng cấu hình MCP của Code Bridge theo [hướng dẫn Antigravity](KET_NOI_ANTIGRAVITY.md).

## ChatGPT Web tích hợp trong Code Bridge

Không cần cài ứng dụng của bên khác. Engine mã nguồn mở được ghim phiên bản và chạy như tiến trình con của Code Bridge; runtime được kiểm tra SHA-256 trước khi sử dụng.

1. Mở **VS Code / Codex** → **Đăng nhập ChatGPT**. Lần đầu ứng dụng tự tải runtime và cài các thành phần cần thiết; bản đóng gói đã kèm các thành phần này.
2. Đăng nhập trong cửa sổ Chrome riêng. Khi thấy ô chat ChatGPT, quay lại Code Bridge bấm **Đã đăng nhập, tiếp tục**. Ứng dụng đóng đúng cửa sổ riêng đó, mở bước xác minh, nhận diện quyền model và lưu phiên trong thư mục dữ liệu riêng. Có thể bấm **Hủy đăng nhập** khi bị kẹt hoặc muốn thử lại; thời hạn đăng nhập tối đa 10 phút. Không dán cookie hoặc token vào dashboard.
3. Bấm **Thêm model vào Codex**. Code Bridge chạy Responses bridge ở `http://127.0.0.1:3216/v1`, cập nhật cấu hình Codex và ghi lại giá trị trước đó để khôi phục.
4. Mở phiên Codex mới hoặc chạy **Developer: Reload Window** trong VS Code. Chọn model có hậu tố **(Web)**. Chế độ ban đầu chỉ trò chuyện, chưa thao tác công cụ.
5. Muốn sửa file và chạy terminal: trong phần **Cho model Web dùng công cụ lập trình**, nhập Tunnel ID riêng và Runtime API Key có quyền Tunnels Read + Use, rồi bấm bật công cụ. Không dùng Tunnel ID đang chạy ở trang ChatGPT → Code Bridge.
6. Trong ChatGPT, bật Developer Mode và tạo ứng dụng kết nối dạng Tunnel tên chính xác **Codex Code Bridge**, dùng Tunnel ID vừa nhập, xác thực None, rồi cấp quyền công cụ. Công cụ thực thi theo chính sách phê duyệt của phiên Codex.
7. **Tạm dừng** khôi phục đường kết nối Codex trước đó và dừng engine. **Kết nối lại** dùng phiên ChatGPT đã lưu. Nếu đang bật khi đóng ứng dụng, lần mở sau Code Bridge thử nối lại. **Gỡ model Web khỏi Codex** bỏ tích hợp nhưng giữ phiên đăng nhập.

Nếu chạy Code Bridge trong WSL nhưng muốn điều khiển Chrome Windows, hãy chạy Code Bridge bằng Node Windows, ví dụ qua `START-BRIDGE-WINDOWS.bat`. Playwright Linux không điều khiển trực tiếp Chrome Windows. `BRIDGE_CODEX_HOME` chỉ đổi nơi đọc/ghi cấu hình Codex, không chuyển hệ điều hành cho trình duyệt. Có thể đặt `BRIDGE_WEB_CHROME` đến đường dẫn Chrome khác nếu máy không cài tại vị trí mặc định.

Cơ chế: Codex gửi `/v1/models` và `/v1/responses` đến engine tích hợp trong Code Bridge qua `openai_base_url`. Model thường vẫn được chuyển tiếp theo engine; các model `chatgpt-web/...` dùng phiên trình duyệt của người dùng. Khả năng truy cập và hạn mức giữ theo tài khoản ChatGPT. Đây là tự động hóa Web, có thể cần cập nhật khi giao diện ChatGPT thay đổi.

Engine nguồn: [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web), giấy phép MIT. Phiên bản và thông tin bản quyền nằm tại `vendor/chatgpt-web/UPSTREAM.md` và `LICENSE`.

Nếu không thấy công cụ: kiểm tra Code Bridge còn chạy, URL/cổng đúng, MCP server đã được bật trong IDE và workspace đã được chọn. `127.0.0.1` là máy nơi agent chạy; nếu agent chạy trong container/remote SSH, URL localhost của Windows không tự trỏ về Windows.
