using System;
using System.Drawing;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Windows.Forms;

namespace LanText {
    public sealed class DesktopWindow : Form {
        readonly TextBox editor = new TextBox();
        readonly Label address = new Label(), code = new Label(), status = new Label(), count = new Label();
        readonly NumericUpDown port = new NumericUpDown();
        readonly Button start = new Button();
        readonly Timer typing = new Timer(), activity = new Timer();
        LanServer server;
        string[] addresses;
        public DesktopWindow(int initialPort = 8765) {
            Text = "LanText · 电脑输入，iPad 显示";
            StartPosition = FormStartPosition.CenterScreen; Size = new Size(980, 690); MinimumSize = new Size(760, 540);
            Font = new Font("Microsoft YaHei UI", 11); BackColor = Color.FromArgb(245, 247, 251);
            var grid = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(22), ColumnCount = 1, RowCount = 6 };
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
            grid.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 35));
            grid.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            grid.RowStyles.Add(new RowStyle(SizeType.Absolute, 48));
            grid.Controls.Add(new Label { Text = "电脑写什么，iPad 就显示什么", Font = new Font(Font.FontFamily, 20, FontStyle.Bold), Dock = DockStyle.Fill }, 0, 0);
            var connection = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, AutoSizeMode = AutoSizeMode.GrowAndShrink, ColumnCount = 2, RowCount = 1, Padding = new Padding(0, 4, 0, 8) };
            connection.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            connection.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 65)); connection.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 35));
            address.AutoSize = true; address.Dock = DockStyle.Top; address.Text = "正在启动局域网服务…";
            code.AutoSize = true; code.Dock = DockStyle.Top; code.Font = new Font(Font.FontFamily, 19, FontStyle.Bold); code.ForeColor = Color.FromArgb(36, 95, 222);
            connection.Controls.Add(address, 0, 0); connection.Controls.Add(code, 1, 0); grid.Controls.Add(connection, 0, 1);
            var toolbar = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
            toolbar.Controls.Add(new Label { Text = "端口", AutoSize = true, Padding = new Padding(0, 7, 0, 0) });
            port.Minimum = 1024; port.Maximum = 65535; port.Value = initialPort; port.Width = 95; toolbar.Controls.Add(port);
            start.Text = "启动服务"; start.AutoSize = true; start.Click += delegate { if (server == null) StartServer(); else StopServer(); }; toolbar.Controls.Add(start);
            var rotate = new Button { Text = "更换配对码", AutoSize = true }; rotate.Click += delegate { if (server != null) { server.RotateCode(); code.Text = "配对码\n" + server.PairingCode; } }; toolbar.Controls.Add(rotate);
            var copy = new Button { Text = "复制连接信息", AutoSize = true }; copy.Click += delegate { if (server != null) Clipboard.SetText("iPad Safari 打开：http://" + (addresses.Length > 0 ? addresses[0] : "电脑IP") + ":" + server.Port + "\r\n配对码：" + server.PairingCode); }; toolbar.Controls.Add(copy);
            var preview = new Button { Text = "打开显示网页", AutoSize = true }; preview.Click += delegate { if (server != null) System.Diagnostics.Process.Start("http://localhost:" + server.Port); }; toolbar.Controls.Add(preview);
            grid.Controls.Add(toolbar, 0, 2);
            grid.Controls.Add(new Label { Text = "iPad 用 Safari 打开上方网址，输入配对码；电脑在下面写字，自动同步。", Dock = DockStyle.Fill }, 0, 3);
            editor.Multiline = true; editor.AcceptsReturn = true; editor.AcceptsTab = true; editor.ScrollBars = ScrollBars.Vertical;
            editor.Font = new Font("Microsoft YaHei", 20); editor.Dock = DockStyle.Fill; editor.BorderStyle = BorderStyle.FixedSingle; editor.AccessibleName = "要显示在 iPad 的文字";
            editor.TextChanged += delegate { typing.Stop(); typing.Start(); count.Text = editor.Text.Length + " 字符"; };
            grid.Controls.Add(editor, 0, 4);
            var footer = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, Padding = new Padding(0, 8, 0, 0) };
            footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 115)); footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); footer.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100));
            var clear = new Button { Text = "清空文字", Dock = DockStyle.Fill }; clear.Click += delegate { editor.Clear(); typing.Stop(); SyncText(); editor.Focus(); }; footer.Controls.Add(clear, 0, 0);
            status.Dock = DockStyle.Fill; status.Padding = new Padding(12, 5, 0, 0); footer.Controls.Add(status, 1, 0); count.Dock = DockStyle.Fill; footer.Controls.Add(count, 2, 0);
            grid.Controls.Add(footer, 0, 5); Controls.Add(grid);
            typing.Interval = 120; typing.Tick += delegate { typing.Stop(); SyncText(); };
            activity.Interval = 1000; activity.Tick += delegate { if (server != null && Encoding.UTF8.GetByteCount(editor.Text) <= 262144) status.Text = "服务已启动 · 最近在线 iPad：" + server.ConnectedDevices + " · 输入自动同步"; }; activity.Start();
            Shown += delegate { StartServer(); editor.Focus(); };
            FormClosing += delegate { typing.Stop(); activity.Stop(); StopServer(); };
        }
        void SyncText() {
            if (server == null) { status.Text = "服务未启动，文字将在启动后同步"; return; }
            if (!server.SetText(editor.Text)) { status.Text = "文字超过 256 KiB，请缩短后再同步"; status.ForeColor = Color.Firebrick; }
            else { status.Text = "已同步到服务 · 最近在线 iPad：" + server.ConnectedDevices; status.ForeColor = Color.FromArgb(30, 110, 70); }
        }
        void StartServer() {
            var next = new LanServer();
            try {
                next.Start((int)port.Value); server = next; server.SetText(editor.Text);
                var list = new System.Collections.Generic.List<string>();
                foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces()) {
                    if (adapter.OperationalStatus != OperationalStatus.Up || adapter.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    foreach (var ip in adapter.GetIPProperties().UnicastAddresses) if (ip.Address.AddressFamily == AddressFamily.InterNetwork && !ip.Address.ToString().StartsWith("169.254.")) list.Add(ip.Address.ToString());
                }
                addresses = list.ToArray();
                address.Text = "iPad Safari 打开（优先选择 Wi-Fi 地址）\n" + (addresses.Length == 0 ? "未找到可用 IPv4，请检查 Wi-Fi" : String.Join("\n", Array.ConvertAll(addresses, ip => "http://" + ip + ":" + server.Port)));
                code.Text = "配对码\n" + server.PairingCode; start.Text = "停止服务"; port.Enabled = false; SyncText();
            } catch (Exception ex) {
                next.Dispose(); status.Text = "启动失败，请换一个端口重试"; status.ForeColor = Color.Firebrick;
                MessageBox.Show(this, "无法启动局域网服务。端口可能被旧版程序占用，请关闭旧版或改用 8877。\n\n" + ex.Message, "LanText 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        void StopServer() {
            if (server != null) { server.Dispose(); server = null; }
            start.Text = "启动服务"; port.Enabled = true; code.Text = "配对码\n—"; status.Text = "服务已停止";
        }
    }
    static class Program {
        [STAThread] static int Main(string[] args) {
            if (args.Length > 0 && args[0] == "--self-test") return ProtocolTests.Run(args.Length > 1 ? args[1] : "LanText-test-result.txt");
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object sender, System.Threading.ThreadExceptionEventArgs e) { MessageBox.Show(e.Exception.Message, "LanText 错误", MessageBoxButtons.OK, MessageBoxIcon.Error); };
            int initialPort = 8765, parsedPort;
            if (args.Length == 2 && args[0] == "--port" && Int32.TryParse(args[1], out parsedPort) && parsedPort >= 1024 && parsedPort <= 65535) initialPort = parsedPort;
            try { Application.Run(new DesktopWindow(initialPort)); return 0; }
            catch (Exception e) { MessageBox.Show(e.Message, "LanText 无法打开", MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
        }
    }
}
