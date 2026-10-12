# Code Bridge 0.3.1 — Trung tâm kết nối ChatGPT / Gemini / Claude / Grok

Ứng dụng local cho mô hình **ChatGPT Web → OpenAI Secure MCP Tunnel → Filesystem MCP → workspace trên máy**.

Hỗ trợ thêm **Gemini Web → URL HTTPS public → cổng MCP có OAuth → workspace**. Trang chủ có hai ô ChatGPT và Gemini, mỗi ô dẫn tới không gian quản lý riêng. Cả hai dịch vụ có thể hoạt động đồng thời, dùng chung workspace và công cụ của bridge.

Xem [hướng dẫn ChatGPT và Gemini](docs/HUONG_DAN_CHATGPT_GEMINI.md) hoặc [hướng dẫn Claude, Grok và tình trạng Meta AI](docs/HUONG_DAN_CLAUDE_GROK_META.md). Meta AI hiện chỉ có chương trình Connectors dạng developer preview, nên bridge không hiển thị kết nối trực tiếp chưa được hỗ trợ.

Muốn chạy trên máy Windows khác, dùng [bản Windows x64 portable](docs/PHAN_PHOI_WINDOWS.md): giải nén ZIP, mở `CodeBridge.exe`. Gói này đã kèm Node, Filesystem MCP, tunnel-client và cloudflared; máy nhận không cần cài Node hoặc Git.

## Chạy bản đã cài

Yêu cầu Node.js 22+ và Git. Linux/macOS cần `unzip` để cài tunnel runtime.

```bash
cd chatgpt-code-bridge
bash START-BRIDGE-LINUX.sh
```

Mở **http://127.0.0.1:3213**. Trang chủ hiển thị hai ô lớn; chọn từng ô để thiết lập và xem trạng thái kết nối. Workspace mặc định là `demo-project/`; chọn dự án bằng đường dẫn tuyệt đối trong **Dự án & file**.

Windows từ mã nguồn: chạy `START-BRIDGE-WINDOWS.bat`. Nếu đã cài dependency bằng Node.js trong WSL, hãy chạy bằng WSL với `bash START-BRIDGE-LINUX.sh`; tránh dùng chung node_modules giữa Windows và Linux. Bản portable `.exe` đã được kiểm tra chạy native trên Windows, gồm dashboard và Filesystem MCP.

## Hai dịch vụ và nhiều kết nối

- Từ trang chủ, chọn **ChatGPT** hoặc **Gemini** để vào không gian quản lý tương ứng. Trong mỗi không gian có **Hướng dẫn kết nối**, **Quản lý kết nối**, **Cách sử dụng**. Bật cổng Gemini không dừng ChatGPT; bắt đầu thêm ChatGPT cũng không đóng Gemini. Khóa và quyền truy cập không tự khôi phục sau khi khởi động lại.
- **ChatGPT:** tối đa 12 cấu hình trong bridge. Mỗi cấu hình có tên, Tunnel ID riêng, tiến trình và cổng health riêng được cấp tự động. Runtime API Key truyền bằng biến môi trường, không lưu vào config. Một tunnel có thể phục vụ người dùng/workspace được OpenAI cho phép; một tunnel không tương đương một tài khoản. Các giới hạn này là lựa chọn của bridge, không phải hạn mức tài khoản do OpenAI công bố.
- **Gemini:** tối đa 30 quyền kết nối còn hạn trong bridge. Mỗi tài khoản đủ điều kiện có thể thêm cùng URL MCP và duyệt riêng. Danh sách chỉ tính kết nối sau khi đổi mã OAuth lấy token thành công; refresh token không tăng bộ đếm. Có đổi tên và thu hồi riêng từng kết nối. Một tài khoản kết nối lại có thể tạo nhiều quyền; bridge không tự biết đó là cùng người dùng.
- **Số liệu:** tunnel ChatGPT được kiểm tra readiness khoảng mỗi 2,5 giây; có thể bấm **Kiểm tra ngay** để cập nhật. Gemini “Đã cấp quyền” là quyền OAuth còn hạn, không chứng minh tài khoản đang mở trang chat. “Vừa hoạt động” = có yêu cầu MCP trong 5 phút qua. “Chờ duyệt” = yêu cầu OAuth chưa được chấp thuận. Bridge không nhận danh tính/email từ nhà cung cấp, nên không thể xác định số tài khoản duy nhất hoặc trạng thái đang đăng nhập trên website.
- **Sửa đồng thời:** các lệnh công cụ trong tiến trình bridge được xếp hàng chạy lần lượt. Điều này tránh thao tác chồng lên nhau, nhưng không ngăn một nội dung cũ ghi đè thay đổi mới. Nên đọc lại file và xem diff trước khi ghi. Không có khóa liên tiến trình giữa bridge mới, phiên cũ hoặc editor ngoài.

Mỗi không gian có danh sách và ô tìm kiếm riêng. Các trang **Dự án & file**, **Công cụ MCP**, **Nhật ký** dùng chung một giao diện. Muốn dừng một tunnel ChatGPT, dùng nút **Dừng** trên dòng kết nối; muốn ngắt Gemini, dùng **Tắt** hoặc **Thu hồi**.

### Chạy cùng phiên cũ trong lúc nâng cấp

`START-BRIDGE-LINUX.sh` / `START-BRIDGE-WINDOWS.bat` dùng port 3213 và config `.local/gemini-preview/` để giữ tương thích bản đã cài. Script liên kết trạng thái bridge 0.1/0.2 trên `http://127.0.0.1:3210` qua `BRIDGE_LEGACY_URL`; khóa không được đọc hoặc chuyển sang tiến trình mới. Danh sách ghi rõ workspace của phiên cũ. Dừng phiên cũ bằng nút **Dừng**; muốn kết nối lại ở bridge mới cần nhập lại Runtime API Key.

Khi không còn phiên cũ, có thể bỏ liên kết bằng `BRIDGE_LEGACY_URL='' bash START-BRIDGE-LINUX.sh`. `npm start` vẫn dùng port 3210 và config `.local/` mặc định, trừ khi đặt biến môi trường. Các script `START-GEMINI-*` cũ là launcher tương thích, nên ưu tiên `START-BRIDGE-*`.

## Cài lại từ mã nguồn

```bash
npm ci
npm run setup
npm run setup:tunnel
npm start
```

`setup` clone hai repository vào `upstream/`, ghim revision cho lần clone mới, cài và build Filesystem MCP. `setup:tunnel` tải runtime v0.0.16 từ release chính thức và đối chiếu SHA-256 GitHub trước khi giải nén. Clone source tunnel-client dùng để tham khảo; ứng dụng chạy binary release, không yêu cầu Go.

## Kết nối ChatGPT

1. Tạo Tunnel và Runtime API Key trong OpenAI Platform với quyền dùng Tunnel.
2. Nhập Tunnel ID và key ở giao diện, bấm kết nối; chờ trạng thái **Sẵn sàng**.
3. Thêm custom MCP/app trong ChatGPT với Connection = Tunnel, chọn Tunnel ID, rồi chọn app trong chat.
4. Yêu cầu liệt kê thư mục được phép và đọc `index.html`. Thử `edit_file` với `dryRun=true` để xem diff trước khi sửa.

Quyền tạo/dùng custom MCP và Tunnel phụ thuộc tài khoản, organization và workspace. Xem https://developers.openai.com/api/docs/guides/secure-mcp-tunnels.

Runtime key chỉ giữ trong bộ nhớ, không ghi vào config. Cần nhập lại sau mỗi lần đóng ứng dụng. Không cần session token/cookie của ChatGPT.

## Kết nối Gemini Web

Trong Gemini cần có **Settings → Connected Apps → Custom apps**. Google hiện giới hạn tính năng theo tài khoản/khu vực; kiểm tra trực tiếp tại https://support.google.com/gemini/answer/17209137. Không cần cookie hay Gemini API key cho luồng này.

Để mở giao diện hợp nhất:

```bash
bash START-BRIDGE-LINUX.sh
```

Mở **http://127.0.0.1:3213** và chọn ô **Gemini**; có thể giữ các tunnel ChatGPT đang chạy. Script dùng config riêng tại `.local/gemini-preview/`. Windows native có `START-BRIDGE-WINDOWS.bat` nhưng chưa được kiểm thử; môi trường hiện tại là WSL/Linux.

1. Chọn workspace trên dashboard.
2. Bấm **Tạo URL và kết nối Gemini**. Code Bridge tự cài cloudflared từ bản phát hành chính thức nếu cần, kiểm tra SHA-256, chạy Quick Tunnel và bật cổng MCP/OAuth 3212. URL chỉ được tạo sau khi bạn bấm nút; không trỏ tunnel vào dashboard 3210/3213.
3. Chờ giao diện báo URL sẵn sàng. Nếu đã có domain HTTPS hoặc tunnel riêng, dùng mục **Dùng URL HTTPS riêng (nâng cao)**.
4. Copy URL MCP hiển thị, thêm vào Custom apps của Gemini. Khi trang xác thực xuất hiện, giữ trang đó mở, quay lại dashboard → **Yêu cầu kết nối**, đối chiếu mã và callback URL, bấm **Cho phép**. Tên ứng dụng là thông tin do client tự khai báo, không phải chứng nhận của Google.
5. Trang xác thực tự trở lại Gemini. Dùng `@` chọn app rồi thử yêu cầu đọc file. Nút **Thu hồi toàn bộ quyền** hủy các token hiện tại; **Tắt** đóng cổng Gemini.

Có thể thay Quick Tunnel bằng domain HTTPS cố định và reverse proxy đến `http://127.0.0.1:3212`. Quick Tunnel dành cho thử nghiệm, URL đổi mỗi lần chạy và không hỗ trợ SSE; bridge dùng Streamable HTTP trả JSON. Tham khảo https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/.

OAuth của bridge dùng SDK MCP: discovery metadata, DCR, Authorization Code + PKCE S256, refresh token rotation và revoke. Duyệt kết nối chỉ thực hiện qua dashboard local có CSRF. Quyền đã cấp gắn với workspace và quyền ghi lúc duyệt; bật ghi sau đó không nâng quyền của một token chỉ đọc. Đổi workspace thu hồi toàn bộ quyền Gemini. Access token sống 15 phút, quyền/refresh token tối đa 8 giờ, authorization code dùng một lần trong 60 giây. Mọi trạng thái OAuth nằm trong bộ nhớ; đóng app hoặc đổi URL cần kết nối lại từ Gemini.

Đã chuẩn bị kết nối theo chuẩn MCP/OAuth; luồng Gemini Web cần được kiểm tra lại sau mỗi thay đổi giao diện hoặc URL tunnel. Không dùng OpenAI Tunnel ID cho Gemini.

## Kết nối Claude Web và Grok Web

Từ trang chủ chọn **Claude** hoặc **Grok**, rồi bấm **Tạo URL và kết nối**. Code Bridge tự chạy tunnel đến cổng OAuth/MCP riêng (`3214` và `3215`); copy URL MCP có `/mcp` sang connector trên website. Duyệt yêu cầu OAuth tại trang quản lý tương ứng. Xem [hướng dẫn từng bước](docs/HUONG_DAN_CLAUDE_GROK_META.md). Cổng Gemini hiện có trên `3212` và tunnel ChatGPT vẫn độc lập.

**Meta AI:** ô Meta chỉ hiển thị tình trạng developer preview và tài liệu chính thức; chưa có kết nối Meta AI Web qua URL MCP công khai.

### Khi kết nối chưa hoạt động

- **Không có Custom apps:** kiểm tra điều kiện tài khoản trong tài liệu Google ở trên. Bridge chỉ sử dụng được luồng Gemini Web khi Google cấp tính năng này cho tài khoản.
- **URL tunnel báo 502:** xem trạng thái URL tự động trên trang Gemini và bấm tạo lại nếu tunnel đã ngắt. Nếu dùng URL riêng, kiểm tra reverse proxy trỏ đúng “Cổng đích” hiển thị trên giao diện.
- **Trang xác thực đang chờ:** để trang đó mở, duyệt yêu cầu có cùng mã tại dashboard. Yêu cầu hết hạn sau 5 phút; bắt đầu lại từ Gemini nếu đã hết hạn.
- **Lệnh bị từ chối sau khi đổi dự án hoặc khởi động lại:** kết nối lại custom app từ Gemini để cấp quyền mới. Kiểm tra “Cho phép sửa file” nếu cần ghi; kết nối được cấp quyền chỉ đọc cần được cấp lại quyền để ghi.
- **Cổng đã được sử dụng:** mở lại dashboard đang chạy thay vì mở thêm cùng một phiên. Nếu dùng cổng MCP khác, đặt `GEMINI_GATEWAY_PORT` trước khi chạy Code Bridge; nút tự động sẽ dùng đúng cổng đó.

## Chức năng

- Chọn một workspace; đọc, ghi, sửa, tìm kiếm file qua mã nguồn Filesystem MCP đã clone.
- Bật/tắt quyền ghi; khi tắt, endpoint MCP chỉ công bố và cho chạy tool được đánh dấu read-only.
- Endpoint MCP Streamable HTTP stateless tại `/mcp`, proxy sang tiến trình Filesystem MCP stdio.
- Xem file, sửa nội dung, thử tool JSON và xem nhật ký trong bộ nhớ (100 mục).
- Preview **HTML tĩnh** trong iframe sandbox; chưa chạy Vite/React dev server, shell, build hoặc test của workspace.
- Start/stop nhiều tunnel-client độc lập; mỗi tiến trình dùng một cổng readiness loopback được cấp tự động.
- Gemini Web: cổng MCP OAuth riêng, duyệt/từ chối kết nối local, thu hồi token và nhật ký lệnh có tiền tố `gemini:`.

API quản trị và MCP chỉ bind loopback. API thao tác yêu cầu CSRF token; kiểm tra Host/Origin chặn website bên ngoài gọi trực tiếp. Preview chặn file ẩn, node_modules và symlink ra ngoài workspace. MCP được cấp quyền trên toàn bộ workspace đã chọn, bao gồm file cấu hình trong đó: hãy chọn đúng thư mục dự án.

Config workspace/quyền ghi/danh sách Tunnel ID/URL Gemini nằm trong thư mục `BRIDGE_DATA_DIR`, không chứa Runtime API Key hoặc OAuth token. Bản này là prototype cho một người dùng, chưa có multi-user, durable audit, checkpoint/undo hoặc trình cài đặt hệ thống. Bản Windows portable không cần cài đặt.

## Kiểm thử

```bash
npm run build
npm test
```

Test tạo workspace tạm và server trên cổng 3220, thử giao thức MCP HTTP thực, đọc/sửa file, dry-run, chặn truy cập ngoài workspace/symlink, quyền ghi và CSRF/Origin. Không cần key hoặc mạng internet.

`test/remote-access.test.mjs` kiểm tra discovery, DCR, consent, PKCE, replay, redirect/resource binding, refresh rotation, thu hồi quyền và token theo workspace. `test/integration.test.mjs` kiểm tra thêm các thao tác file thật qua cổng OAuth bằng MCP SDK client; đây là client mô phỏng giao thức, không phải Gemini đăng nhập thật.

Kết quả hiện tại: **24/24 kiểm thử tự động đạt**. Bộ kiểm thử mô phỏng 12 tiến trình tunnel ChatGPT với readiness riêng, hai quyền Gemini riêng, Claude và Grok có OAuth/tokens độc lập và gọi công cụ MCP, kiểm tra trạng thái theo yêu cầu, phiên bridge cũ đã tắt và giới hạn workspace. Kết nối end-to-end bằng tài khoản Claude/Grok thật vẫn cần được thử trên website của từng dịch vụ.

Bản 0.1 đã được kiểm tra Chromium desktop/mobile cho mở/lưu file, preview, dry-run và quyền ghi. Ảnh nằm trong `artifacts/desktop.png` và `artifacts/mobile.png`. Audit runtime lúc cài bản 0.1 không có cảnh báo; dependency development upstream có cảnh báo trong chuỗi `shx/shelljs`, chưa nâng cấp breaking change.

## Nguồn upstream

- https://github.com/modelcontextprotocol/servers — revision `956d36f8a148908b2e2394669ef5ae1f1230c9e9`; build package `src/filesystem`. Giữ nguyên license trong repository.
- https://github.com/openai/tunnel-client — revision `b91e6c992dfd33e5c5ea94b00449c527c110851e`; runtime release `v0.0.16`, license/NOTICE đi kèm trong `runtime/`.

Mã nguồn giao diện và bridge nằm trong `public/` và `src/`. Không lấy hoặc sửa binary của VibeCode Customer.
