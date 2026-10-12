using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

internal static class CodeBridgeLauncher
{
    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(root, "runtime", "node.exe");
        string server = Path.Combine(root, "src", "server.mjs");
        if (!File.Exists(node) || !File.Exists(server))
        {
            Console.Error.WriteLine("Gói Code Bridge thiếu tệp. Hãy giải nén toàn bộ ZIP trước khi chạy CodeBridge.exe.");
            return 1;
        }

        string portText = Environment.GetEnvironmentVariable("BRIDGE_PORT");
        if (String.IsNullOrWhiteSpace(portText)) portText = "3213";
        int port;
        if (!Int32.TryParse(portText, out port) || port < 1024 || port > 65535)
        {
            Console.Error.WriteLine("BRIDGE_PORT phải nằm trong khoảng 1024–65535.");
            return 1;
        }
        using (TcpClient probe = new TcpClient())
        {
            try { probe.Connect(IPAddress.Loopback, port); }
            catch (SocketException) { /* The port is available. */ }
            if (probe.Connected)
            {
                Console.Error.WriteLine("Cổng " + port + " đang được dùng. Hãy đóng phiên cũ hoặc đổi BRIDGE_PORT.");
                return 1;
            }
        }

        string dataDir = Environment.GetEnvironmentVariable("BRIDGE_DATA_DIR");
        if (String.IsNullOrWhiteSpace(dataDir))
            dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodeBridge");
        Directory.CreateDirectory(dataDir);
        string url = "http://127.0.0.1:" + port + "/#overview";
        ProcessStartInfo start = new ProcessStartInfo(node, "\"" + server + "\"");
        start.WorkingDirectory = root;
        start.UseShellExecute = false;
        start.EnvironmentVariables["BRIDGE_PORT"] = port.ToString();
        start.EnvironmentVariables["BRIDGE_DATA_DIR"] = dataDir;
        // A portable build must never inherit a link to an older bridge instance.
        start.EnvironmentVariables.Remove("BRIDGE_LEGACY_URL");
        try
        {
            using (Process child = Process.Start(start))
            {
                if (child == null) throw new InvalidOperationException("Không khởi động được Node.js.");
                Console.WriteLine("Code Bridge đang chạy tại " + url);
                Console.WriteLine("Dữ liệu cấu hình: " + dataDir);
                Console.WriteLine("Đóng cửa sổ này để dừng ứng dụng.");
                bool ready = false;
                for (int attempt = 0; attempt < 80 && !child.HasExited; attempt++)
                {
                    try
                    {
                        HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/health");
                        request.Timeout = 500;
                        using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                            ready = response.StatusCode == HttpStatusCode.OK;
                    }
                    catch (WebException) { /* Wait for the bridge to start. */ }
                    if (ready) break;
                    Thread.Sleep(250);
                }
                if (!ready)
                {
                    Console.Error.WriteLine("Code Bridge chưa sẵn sàng. Kiểm tra lỗi ở trên.");
                    if (!child.HasExited) child.Kill();
                    return 1;
                }
                if (Array.IndexOf(args, "--no-browser") < 0)
                {
                    try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
                    catch (Exception ex) { Console.Error.WriteLine("Không mở được trình duyệt: " + ex.Message); }
                }
                child.WaitForExit();
                return child.ExitCode;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Không khởi động được Code Bridge: " + ex.Message);
            return 1;
        }
    }
}
