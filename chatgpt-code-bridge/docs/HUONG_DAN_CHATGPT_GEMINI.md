# Hướng dẫn sử dụng Code Bridge với ChatGPT Web và Gemini Web

Áp dụng cho Code Bridge hiện tại. ChatGPT và Gemini dùng chung **một workspace đang chọn** và có thể chạy **đồng thời**. Hai ô trên trang chủ dẫn tới khu vực thiết lập, trạng thái và quản lý riêng của mỗi dịch vụ.

## Trả lời nhanh trước khi kết nối

| Câu hỏi | Trạng thái của bản hiện tại |
| --- | --- |
| Tắt máy rồi bật lại có phải kết nối lại? | **Có.** Mở lại Code Bridge. Với ChatGPT, cấu hình tên và Tunnel ID còn lưu nhưng tunnel đã dừng; nhập lại Runtime API Key và bấm kết nối. Với Gemini, cổng OAuth và các quyền đã cấp chỉ ở bộ nhớ; bật lại cổng và duyệt kết nối mới. |
| Người khác dùng ChatGPT/Gemini có đọc được máy tôi? | **Không chỉ vì họ đang dùng cùng chatbot.** Họ cần thực sự được cấp quyền dùng app/tunnel ChatGPT hoặc được bạn duyệt OAuth Gemini. Khi đã có quyền, họ có thể dùng các công cụ đối với **toàn bộ workspace đang chọn**, theo quyền đọc/ghi của kết nối. |
| Một máy dùng nhiều tài khoản ChatGPT được không? | Bridge hỗ trợ **tối đa 12 cấu hình ChatGPT**, có thể chạy nhiều tunnel cùng lúc. Mỗi cấu hình đang chạy phải có Tunnel ID riêng và Runtime API Key hợp lệ. Việc nhiều tài khoản ChatGPT nhìn thấy/dùng các tunnel đó còn tùy quyền và liên kết organization/workspace của OpenAI. Số cấu hình không phải số tài khoản duy nhất. |
| ChatGPT và Gemini có chạy cùng lúc không? | **Có.** Bật cổng Gemini không dừng tunnel ChatGPT; thêm tunnel ChatGPT không thu hồi quyền Gemini. Cả hai dùng chung workspace và công tắc **Cho phép sửa file**. |

## 1. Chuẩn bị chung

1. Cài Node.js 22+ và Git. Nếu là Linux/WSL/macOS, cần `unzip` cho bước cài tunnel runtime. Lần chạy đầu, launcher sẽ cài dependency và chuẩn bị upstream; cần mạng để tải các thành phần đó.
2. Tại thư mục `chatgpt-code-bridge`, chạy:

   ```bash
   bash START-BRIDGE-LINUX.sh
   ```

   Trên Windows native, chạy `START-BRIDGE-WINDOWS.bat`. Nếu đã cài Node/dependency trong WSL, tiếp tục chạy từ WSL. Bản này đã kiểm thử trên Linux/WSL, chưa xác nhận Windows native.
3. Mở **http://127.0.0.1:3213** trên chính máy chạy ứng dụng. Nếu dùng `npm start` trực tiếp, cổng mặc định là **3210**; hướng dẫn này dùng launcher cổng 3213.
4. Vào **Dự án & file**, nhập đường dẫn tuyệt đối đến **thư mục dự án muốn cấp quyền**. Khi chỉ muốn thử nghiệm, giữ `demo-project/`. Bỏ chọn **Cho phép sửa file** nếu muốn công cụ chỉ đọc. Nên chọn thư mục con cần thiết thay vì toàn bộ thư mục cá nhân, vì công cụ MCP có thể đọc cả file cấu hình và bí mật nằm trong workspace đó.
5. Trở về trang chủ, chọn ô ChatGPT hoặc Gemini để thiết lập. Có thể kết nối cả hai mà không cần chuyển chế độ.

**Ý nghĩa trạng thái trên giao diện:** “Tunnel sẵn sàng” nghĩa là kiểm tra readiness ChatGPT đạt; “Đã cấp quyền” của Gemini nghĩa là quyền OAuth còn hạn, chưa chứng minh tài khoản đang mở chat. “Hoạt động trong 5 phút” nghĩa là bridge mới nhận lệnh MCP gần đây. Bridge tự kiểm tra tunnel khoảng mỗi 2,5 giây; trong **Quản lý kết nối**, bấm **Kiểm tra ngay** để cập nhật và xem thời điểm kiểm tra từng tunnel. Bridge không nhận email đăng nhập nên không thể đếm chính xác số tài khoản riêng biệt.

## 2. Kết nối ChatGPT Web

### Điều kiện

Bạn cần có quyền tạo/dùng Tunnel trong OpenAI Platform và quyền thêm/dùng custom MCP app trong ChatGPT workspace đích. Hai nhóm quyền này tách biệt. Theo [tài liệu Secure MCP Tunnel của OpenAI](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels), việc tạo/sửa tunnel cần **Tunnels Read + Manage**, còn chạy `tunnel-client` hoặc chọn tunnel khi tạo app cần **Tunnels Read + Use**. Workspace ChatGPT cũng phải được liên kết với tunnel. Không dùng cookie, session token của trang ChatGPT.

### Thiết lập lần đầu

1. Vào [OpenAI Platform → Tunnels](https://platform.openai.com/settings/organization/tunnels) với organization đúng. Tạo tunnel mới và lấy **Tunnel ID** dạng `tunnel_…`. Tạo/lấy **Runtime API Key** được phép chạy tunnel. Không gửi key trong chat hoặc commit vào Git.
2. Trong Code Bridge → ô **ChatGPT** → **Hướng dẫn kết nối**, nhập tên để dễ nhận biết, Tunnel ID và Runtime API Key. Bấm **Kết nối ChatGPT**. Chờ trạng thái **Tunnel sẵn sàng** ở mục **Quản lý kết nối**. Mỗi tunnel đang chạy có một tiến trình riêng.
3. Trên [ChatGPT Plugins](https://chatgpt.com/plugins), chọn dấu **+** → **Add custom MCP server** → Connection **Tunnel**, rồi chọn hoặc nhập đúng Tunnel ID. Xem quyền/cảnh báo và tạo app theo giao diện ChatGPT. Nếu không thấy tunnel, kiểm tra organization, ChatGPT workspace liên kết và quyền **Tunnels Read + Use**.
4. Trong một cuộc trò chuyện ChatGPT, chọn app Code Bridge vừa thêm. Yêu cầu: “Dùng Code Bridge, liệt kê thư mục được phép và đọc `index.html` trong workspace. Chưa sửa file.” Nếu có kết quả, xem mục **Nhật ký hoạt động** để xác nhận lệnh đi qua bridge.
5. Trước khi sửa, yêu cầu `edit_file` với `dryRun=true` để xem diff. Chỉ bật **Cho phép sửa file** khi muốn cho phép ghi/sửa trong workspace.

### Nhiều tài khoản và nhiều kết nối ChatGPT

- Trong ô **ChatGPT**, bấm **Thêm kết nối ChatGPT** hoặc vào **Quản lý kết nối → Thêm kết nối** cho mỗi cấu hình; tối đa **12 cấu hình**. Sau khi thêm một tunnel, mở lại biểu mẫu để nhập Tunnel ID và key của tunnel tiếp theo. Dùng **Tunnel ID khác nhau** cho các cấu hình chạy độc lập; bridge không cho thêm trùng Tunnel ID. Bật thêm ChatGPT không ảnh hưởng cổng Gemini.
- Mỗi tài khoản ChatGPT cần có quyền thấy/dùng app và tunnel theo cài đặt OpenAI. Một tunnel có thể được liên kết với nhiều organization/workspace theo chính sách OpenAI, nên **một tunnel hoặc một dòng “sẵn sàng” không chứng minh có đúng một tài khoản**. Đặt tên cấu hình theo tài khoản/nhóm chỉ để bạn tự quản lý; bridge không xác minh tên đó.
- Các kết nối ChatGPT cùng trỏ vào workspace hiện chọn và cùng chịu công tắc **Cho phép sửa file**. Nếu nhiều người cùng sửa một file, nên đọc lại bản mới và xem diff trước khi lưu.

### Sau khi khởi động lại

1. Chạy lại `START-BRIDGE-LINUX.sh` hoặc launcher Windows và mở cổng 3213.
2. Chọn ô ChatGPT. Ở cấu hình đã lưu, bấm **Kết nối lại**, nhập Runtime API Key, chờ **Tunnel sẵn sàng**. Lặp lại cho các tunnel muốn bật.
3. Thường không cần tạo Tunnel ID mới chỉ vì máy đã tắt. App đã tạo trong ChatGPT có thể vẫn nằm trong danh sách, nhưng sẽ không gọi được công cụ cho đến khi tunnel-client chạy và sẵn sàng. Nếu ChatGPT yêu cầu liên kết lại app, làm theo giao diện ChatGPT.

## 3. Kết nối Gemini Web

### Kiểm tra tính năng trên tài khoản Google

Trên `gemini.google.com`, mở **Cài đặt** (biểu tượng bánh răng ở góc dưới bên trái) → **Ứng dụng đã kết nối / Connected Apps** và tìm **Ứng dụng tùy chỉnh cho Spark / Custom apps for Spark**. Nếu menu Cài đặt chưa hiện Connected Apps, chọn **Trí thông minh cá nhân / Personal Intelligence** → **Connected Apps**. [Tài liệu Google](https://support.google.com/gemini/answer/17209137) hiện nêu điều kiện: tài khoản Google cá nhân, từ 18 tuổi, ở Mỹ, giao diện tiếng Anh và bật **Keep Activity**; tài khoản công việc/trường học chưa được hỗ trợ. Tính năng có thể xuất hiện khác nhau theo tài khoản; hãy kiểm tra trực tiếp trong Gemini. Nếu mục ứng dụng tùy chỉnh không xuất hiện, bridge không thể tự bật tính năng đó. Luồng này không cần cookie Gemini hay Gemini API key. Ngày 12/10/2026, dự án đã xác nhận một tài khoản Gemini Web thực hiện đăng ký OAuth, cấp quyền, đổi token và khởi tạo MCP thành công; việc dùng công cụ đọc file trong chat vẫn cần thử theo bước 6.

### Thiết lập lần đầu

1. Mở Code Bridge cổng **3213** → ô **Gemini** → **Thiết lập Gemini**. Kiểm tra workspace và quyền ghi trước khi duyệt bất kỳ kết nối nào. Tunnel ChatGPT đang chạy sẽ được giữ nguyên.
2. Bấm **Tạo URL và kết nối Gemini**. Code Bridge tự cài `cloudflared` từ bản phát hành chính thức nếu cần, kiểm tra SHA-256, chạy tunnel và bật cổng MCP/OAuth `http://127.0.0.1:3212`. Chờ trạng thái **URL đã sẵn sàng**. Không trỏ URL công khai vào dashboard cổng 3213/3210.
3. URL HTTPS gốc sẽ hiện tự động bên trái. Nếu bạn có URL HTTPS hoặc reverse proxy riêng, mở **Dùng URL HTTPS riêng (nâng cao)** để nhập thủ công; URL gốc ở đó không có `/mcp`.
4. Ở ô bên phải, bấm **Copy URL MCP để dán vào Gemini**. URL được copy phải có dạng `https://abc.trycloudflare.com/mcp`. Trong Gemini Web → **Cài đặt → Ứng dụng đã kết nối** (hoặc **Trí thông minh cá nhân → Ứng dụng đã kết nối**) → **Ứng dụng tùy chỉnh cho Spark**, dán **URL có `/mcp`** vào ô **URL của máy chủ MCP** rồi bấm **Tiếp theo**. Không dán URL gốc `https://abc.trycloudflare.com` vào Gemini: Google sẽ báo đó không phải máy chủ MCP hợp lệ. Nếu trang duyệt kết nối của Code Bridge mở ra, giữ trang đó mở.
5. Quay lại Code Bridge → Gemini → **Yêu cầu kết nối**. Đối chiếu **mã yêu cầu** và **địa chỉ trả về (callback URL)** với trang đang chờ; bấm **Cho phép** nếu đúng yêu cầu của bạn. Tên ứng dụng hiển thị là tên client tự khai, không chứng minh danh tính tài khoản Google. Nếu không nhận ra yêu cầu, bấm **Từ chối**.
6. Trở lại Gemini. Trong chat, gõ `@` và chọn custom app vừa thêm (tên có thể do bạn đặt, chẳng hạn `geminiVibe`); yêu cầu: “Hãy dùng Code Bridge để liệt kê thư mục được phép và đọc `index.html` trong dự án. Chưa sửa file.” Xem **Nhật ký hoạt động** để biết bridge đã nhận lệnh công cụ chưa. “Cổng local đã bật” chỉ nói cổng 3212 đang chạy; “1 quyền đã cấp” nghĩa là một luồng OAuth đã hoàn tất, chưa chứng minh Gemini đã gọi công cụ đọc file.

### Nhiều tài khoản Gemini

Có thể cho nhiều tài khoản **đủ điều kiện** dùng cùng URL MCP; bạn duyệt từng yêu cầu riêng trên máy. Bridge lưu tối đa **30 quyền còn hạn** và cho phép đặt tên, thu hồi riêng từng quyền. Một tài khoản kết nối lại có thể tạo nhiều quyền; bộ đếm không phải số người duy nhất. Quyền gắn với workspace và trạng thái cho phép ghi **khi duyệt**. Nếu đã duyệt chỉ đọc, việc bật ghi sau đó không tự nâng quyền cũ; kết nối lại và duyệt lại nếu muốn cấp quyền ghi.

### Gemini báo “chỉ có quyền đọc” khi bạn muốn sửa file

1. Trong Code Bridge → **Dự án & file**, bật **Cho phép sửa file** và kiểm tra đúng workspace. Công tắc này làm công cụ ghi khả dụng cho những kết nối được duyệt sau đó.
2. Trở lại [Ứng dụng Gemini](https://gemini.google.com/apps), ngắt rồi kết nối lại custom app Code Bridge. Nếu giao diện không có nút kết nối lại, xóa app cũ và thêm lại bằng **URL MCP có `/mcp`** đang hiển thị trong Code Bridge.
3. Giữ trang xin quyền mở. Trên Code Bridge → Gemini → **Yêu cầu kết nối**, đối chiếu mã và callback URL; xác nhận dòng quyền ghi **“Đọc và sửa file”** trước khi bấm **Cho phép**.
4. Trong **Quản lý kết nối**, kiểm tra quyền mới hiển thị **“Đọc và sửa file”**. Quyền cũ **“Chỉ đọc file”** vẫn tồn tại cho đến khi hết hạn hoặc bạn bấm **Thu hồi** trên đúng dòng đó. Trong cuộc chat Gemini, chọn app vừa kết nối lại và yêu cầu sửa một file bằng `edit_file` với `dryRun=true` trước để xem diff.

Không thể nâng quyền cho token đã cấp khi chỉ đọc bằng cách bật công tắc sau đó; cần OAuth mới để tránh tự mở rộng quyền của một kết nối cũ.

### Sau khi khởi động lại

1. Chạy lại Code Bridge, vào ô Gemini và bấm **Tạo URL và kết nối Gemini**.
2. Nếu dùng Cloudflare Quick Tunnel, URL có thể thay đổi sau mỗi lần chạy; cập nhật URL MCP trong Custom apps của Gemini hoặc thêm lại app theo giao diện Google.
3. Bắt đầu kết nối lại từ Gemini và duyệt yêu cầu mới trên dashboard. Các quyền cũ không tồn tại sau khi ứng dụng đóng. Với domain HTTPS cố định, địa chỉ app có thể giữ nguyên nhưng vẫn phải cấp quyền OAuth mới.

Quyền Gemini trong bridge tối đa **8 giờ**; access token sống **15 phút** và có thể được làm mới trong thời hạn quyền. Bấm **Thu hồi** ở từng kết nối hoặc **Thu hồi toàn bộ quyền** để ngắt ngay. Bấm **Dừng URL** để dừng Quick Tunnel và đóng cổng MCP/OAuth.

## 4. Ai thực sự có thể xem file trên máy?

| Trường hợp | Khả năng truy cập qua bridge |
| --- | --- |
| Người lạ chỉ mở ChatGPT/Gemini của họ | Không tự truy cập được máy bạn. |
| Người có quyền dùng custom app/tunnel ChatGPT đã nối với bridge đang chạy | Có thể gọi công cụ đọc workspace; có thể sửa khi **Cho phép sửa file** bật. Bridge hiện **không xác thực từng người dùng ChatGPT** ở đầu MCP local, nên mọi người có quyền dùng cùng app/tunnel được xem như cùng quyền trên workspace. Quyền phân phối app/tunnel phụ thuộc OpenAI workspace/organization. |
| Người có kết nối Gemini đã được bạn duyệt | Có thể gọi công cụ trong workspace gắn với quyền đó đến khi quyền hết hạn hoặc bị thu hồi. Chỉ đọc hay đọc/ghi phụ thuộc quyền lúc duyệt và công tắc ghi hiện tại. |
| Người khác dùng chung tài khoản đăng nhập hệ điều hành/máy của bạn | Có thể truy cập giao diện local và endpoint MCP local khi ứng dụng chạy; bản prototype chưa có đăng nhập riêng cho người dùng local. |

Một cuộc trò chuyện được chia sẻ cho người khác **không tự động cấp** quyền vào máy; khả năng gọi công cụ còn tùy quyền dùng app của người đó trong ChatGPT/Gemini. Vì vậy, nếu dùng workspace/team chung, hãy kiểm tra ai có quyền dùng app/tunnel trước khi nối dự án thật. Nội dung file mà bạn đã yêu cầu trợ lý đọc có thể xuất hiện trong cuộc trò chuyện đó; người được xem lịch sử cuộc trò chuyện có thể đọc nội dung đã được đưa vào chat, kể cả khi bridge sau đó đã tắt.

**Cách giới hạn quyền thực tế:** chỉ chọn thư mục dự án cần thiết; giữ chế độ chỉ đọc khi chưa cần sửa; không đưa `.env`, private key hoặc dữ liệu khách hàng vào workspace đã cấp quyền; không chia sẻ Runtime API Key; chỉ duyệt OAuth Gemini mà bạn vừa khởi tạo và đã đối chiếu callback; dừng tunnel/thu hồi quyền khi xong.

## 5. Quản lý đồng thời và xử lý lỗi

- **Chạy cả hai:** kết nối các tunnel trong ô ChatGPT, sau đó vào ô Gemini để bật cổng và duyệt OAuth. Bạn có thể làm theo thứ tự ngược lại. Dừng một tunnel ChatGPT bằng nút **Dừng** trên dòng kết nối; tắt cổng Gemini bằng nút **Tắt**. Các thao tác này độc lập.
- **Nút “Kết nối ChatGPT” bị mờ ở cổng 3210:** bạn đang mở giao diện của bridge cũ. Mở **http://127.0.0.1:3213/#chatgpt** và nhập lại Runtime API Key tại đây; key đã nhập trong tab cũ không được chuyển sang tab mới. Nếu cổng 3213 chưa chạy, mở `START-BRIDGE-LINUX.sh` hoặc `START-BRIDGE-WINDOWS.bat`.
- **ChatGPT báo “Không tìm thấy điểm cuối MCP”:** vào cổng 3213 → ChatGPT → **Quản lý kết nối**. Nếu tunnel chưa **Sẵn sàng**, bấm **Kết nối lại** hoặc **Thêm kết nối**, nhập đúng Tunnel ID và Runtime API Key, rồi chờ trạng thái sẵn sàng *trước khi* tạo plugin trong ChatGPT. Nếu phiên cũ ở cổng 3210 đã tắt, bridge mới sẽ ghi “Phiên cũ đã tắt” và cho dùng lại Tunnel ID đó. Nếu tunnel đã sẵn sàng mà ChatGPT vẫn báo lỗi, kiểm tra organization/workspace được liên kết và quyền **Tunnels Read + Use** trong OpenAI Platform. OpenAI nêu rằng app discovery và tool call cần `tunnel-client` đang chạy.
- **Gemini báo “URL này có vẻ không phải máy chủ MCP hợp lệ”:** kiểm tra URL dán vào Gemini có đúng đuôi **`/mcp`**. URL gốc của tunnel chỉ dùng để bật cổng trong Code Bridge. Dùng nút **Copy URL MCP** trên giao diện để tránh dán nhầm.
- **Gemini báo đăng ký OAuth tự động thất bại:** dùng Code Bridge mới nhất và thử lại bằng URL MCP; bản cũ giới hạn 5 địa chỉ trả về, trong khi Gemini Spark có thể đăng ký 6. Không nhập Runtime API Key ChatGPT vào các ô OAuth của Gemini. Nếu vẫn lỗi, xem **Nhật ký hoạt động** để xác định yêu cầu dừng ở bước nào.
- **Gemini không có Custom apps:** xem điều kiện tài khoản Google ở mục 3. Nếu URL báo 502, kiểm tra trạng thái URL tự động và tạo lại nếu tunnel đã ngắt. Nếu trang xác thực chờ quá lâu, quay lại Gemini bắt đầu mới; yêu cầu chờ duyệt trong bridge hết hạn sau **5 phút**.
- **Sau khi đổi workspace:** mọi quyền Gemini cũ bị thu hồi; ChatGPT còn dùng tunnel nhưng nay trỏ đến workspace mới. Kiểm tra lại thư mục đang chọn trước khi yêu cầu đọc file.
- **Có phiên cũ ở cổng 3210:** launcher cổng 3213 có thể hiển thị trạng thái phiên ChatGPT cũ và cho dừng riêng. Một Tunnel ID chỉ nên được một tiến trình dùng tại một thời điểm. Nếu cổng 3210 đã tắt khi bridge 3213 còn chạy, bản ghi cũ chuyển sang “Phiên cũ đã tắt” và không ngăn tạo kết nối mới với cùng Tunnel ID; sau khi khởi động lại bridge 3213, bản ghi phiên cũ có thể không còn hiển thị.

## Nguồn tham khảo

- [OpenAI: Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [OpenAI: Add a custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [Google: Connect & manage custom apps for Gemini Apps](https://support.google.com/gemini/answer/17209137)
- [Cloudflare: Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
