# Kết nối Claude Web và Grok Web với Code Bridge

Code Bridge dùng cùng một workspace cho ChatGPT, Gemini, Claude và Grok. Claude/Grok có cổng OAuth riêng: Claude dùng `127.0.0.1:3214`, Grok dùng `127.0.0.1:3215`. Mỗi cổng cần một URL HTTPS public riêng. Không dùng Tunnel ID hoặc Runtime API Key của ChatGPT cho hai dịch vụ này, và không dán URL của dashboard `3213` vào connector.

## Chuẩn bị chung

1. Khởi động Code Bridge như bình thường và mở giao diện local `http://127.0.0.1:3213`. Chọn đúng dự án ở **Dự án & file**; nếu chỉ muốn thử đọc, tắt **Cho phép sửa file** trước khi duyệt quyền.
2. Giữ ứng dụng Code Bridge chạy trong suốt phiên kết nối. Nút **Tạo URL và kết nối** sẽ tự cài cloudflared từ bản phát hành chính thức nếu máy chưa có bản đi kèm, sau khi kiểm tra SHA-256.
3. Chọn ô **Claude** hoặc **Grok** trên trang chủ và làm theo hai cột hướng dẫn. Mỗi dịch vụ có một tunnel riêng; có thể bật đồng thời ngay trong giao diện.

## Claude Web

1. Trong không gian Claude, bấm **Tạo URL và kết nối Claude** rồi chờ URL HTTPS sẵn sàng. Code Bridge tự chạy tunnel và bật cổng Claude.
2. Bấm **Copy URL MCP** ở cột bên phải. URL có dạng `https://abc.trycloudflare.com/mcp`. Nếu dùng domain hoặc reverse proxy riêng, mở mục **Dùng URL HTTPS cố định để kết nối lại sau khi bật máy**.
3. Trên [Claude → Customize → Connectors](https://claude.ai/customize/connectors), chọn **+ Add → Add custom connector**. Nhập tên, dán URL MCP có `/mcp`, rồi tiếp tục. Với Team/Enterprise, chủ sở hữu tổ chức phải thêm connector ở Organization Settings trước.
4. Chọn **Sign in now** hoặc **Sign in when needed**. Ở mục OAuth client, chọn **Register automatically** để Claude đăng ký với cổng OAuth của Code Bridge. Hoàn tất Add rồi Connect. Nếu Claude báo không đăng ký được OAuth, kiểm tra trạng thái URL tự động và URL MCP trước khi thử lại.
5. Khi trang xin quyền mở, giữ trang đó. Trở lại Code Bridge → Claude → **Yêu cầu kết nối**, đối chiếu mã yêu cầu và địa chỉ trả về, đặt tên để nhận biết rồi bấm **Cho phép**. Trở lại Claude; trong cuộc chat bật connector qua nút **+ → Connectors**. Thử yêu cầu: “Hãy dùng Code Bridge để liệt kê các thư mục được phép và đọc index.html trong dự án. Chưa sửa file.”

[Tài liệu chính thức của Anthropic](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) mô tả Custom connector qua remote MCP; tài khoản Free có giới hạn một custom connector. Cổng phải truy cập được từ hạ tầng Claude trên Internet.

## Grok Web

1. Trong không gian Grok, bấm **Tạo URL và kết nối Grok** rồi chờ URL HTTPS sẵn sàng.
2. Copy URL MCP có `/mcp` từ bảng bên phải. Nếu dùng URL HTTPS riêng, nhập trong mục **Dùng URL HTTPS cố định để kết nối lại sau khi bật máy**.
3. Mở [Grok Connectors](https://grok.com/connectors) → **New Connector → Custom**. Dán URL MCP và hoàn tất bước xác thực mà Grok yêu cầu. Với Grok Business/Enterprise, quản trị viên có thể phải cấp connector trước.
4. Nếu trang xin quyền mở, đối chiếu mã và địa chỉ trả về trong Code Bridge → Grok → **Yêu cầu kết nối**, rồi duyệt. Trở lại cuộc chat Grok, bật connector và thử đọc file như ví dụ ở trên.

[Tài liệu xAI về Custom MCP](https://docs.x.ai/grok/connectors) xác nhận cần URL public; [hướng dẫn tunnel](https://docs.x.ai/grok/connectors/custom-mcp-tunneling) nêu Cloudflare Quick Tunnel dùng được với Streamable HTTP. Tùy phiên bản tài khoản/giao diện, tên nút có thể thay đổi.

## Kiểm tra trạng thái và thu hồi quyền

- **Cổng MCP đang bật** nghĩa là listener local đã chạy. Chưa có nghĩa tài khoản đã xác thực.
- **Đã cấp quyền** đếm các quyền OAuth còn hạn, không phải số tài khoản duy nhất hoặc trạng thái website đang đăng nhập.
- **Hoạt động trong 5 phút** là số kết nối có lệnh MCP đã xác thực gần đây. Nếu chưa có, hãy thử câu lệnh đọc file từ chat.
- **Yêu cầu chờ duyệt** chỉ xuất hiện khi website bắt đầu OAuth. Đối chiếu mã và callback URL trước khi bấm Cho phép; tên client do bên gọi tự khai báo.
- **Tạm dừng** chặn một kết nối nhưng giữ quyền OAuth; **Kết nối lại** dùng tiếp trong thời hạn quyền mà không thêm connector mới. Dùng **Thu hồi** trên từng kết nối hoặc **Thu hồi toàn bộ quyền** trong không gian dịch vụ để hủy quyền. **Dừng URL** đóng tunnel tự động, listener và thu hồi quyền của riêng dịch vụ đó. Đổi workspace thu hồi mọi quyền Claude/Grok/Gemini.
- Quick Tunnel tạo URL mới sau khi khởi động lại. Xóa/cập nhật connector cũ trên website và kết nối lại bằng URL mới. Access token tồn tại tối đa 15 phút; quyền và refresh token Quick Tunnel tối đa 8 giờ, chỉ giữ trong bộ nhớ. Muốn dùng lại đúng connector cũ sau khi bật máy, thiết lập hostname HTTPS cố định trỏ đến cổng local tương ứng; Code Bridge tự bật lại cổng local và nạp quyền còn hạn, còn tunnel/reverse proxy bên ngoài cần chạy lại. Quyền với hostname cố định được gia hạn tối đa 30 ngày từ lần cấp/làm mới token gần nhất.

## Meta AI Web

[FAQ chính thức của Meta](https://developers.meta.com/wearables/faq/) mô tả **Meta AI Connectors** đang ở **developer preview**. Tài liệu công khai hiện chưa đưa ra luồng tự thêm một URL MCP tùy chỉnh vào `meta.ai` như Claude/Grok. Vì vậy ô Meta AI trong Code Bridge chỉ hiển thị tình trạng và đường dẫn tài liệu; không tạo kết nối giả hoặc yêu cầu người dùng nhập cookie/session token. Khi Meta cung cấp quyền truy cập và đặc tả tích hợp cho tài khoản của bạn, cần triển khai adapter riêng rồi kiểm thử với tài khoản thật.

## Giới hạn đã kiểm chứng

Code Bridge đã có cổng OAuth và giao diện riêng cho Claude/Grok, dùng lại kiểm soát workspace, duyệt quyền local và công cụ MCP hiện có. Bộ kiểm thử tự động dùng client MCP/OAuth mô phỏng; chưa xác nhận luồng end-to-end bằng tài khoản Claude hoặc Grok thực tế. Nếu website báo lỗi khác với các trường hợp trên, lưu nguyên văn thông báo lỗi và thời điểm thử để đối chiếu với nhật ký Code Bridge.
