using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace LanText {
    static class ProtocolTests {
        static void Check(bool valid, string name) { if (!valid) throw new Exception("FAILED: " + name); }
        public static int Run(string resultPath) {
            try { Test().GetAwaiter().GetResult(); File.WriteAllText(resultPath, "PASS: native desktop protocol, UTF-8 multiline, change, clear, pairing, revocation, heartbeat, size limit, restart epoch, no remote writes, throttle.\r\n"); return 0; }
            catch (Exception e) { File.WriteAllText(resultPath, e.ToString()); return 1; }
        }
        static async Task Test() {
            using (var server = new LanServer(100))
            using (var handler = new HttpClientHandler { UseProxy = false })
            using (var client = new HttpClient(handler)) {
                server.Start(0); client.Timeout = TimeSpan.FromSeconds(5);
                string root = "http://127.0.0.1:" + server.Port;
                string code = server.PairingCode;
                var page = await client.GetAsync(root + "/");
                Check(page.IsSuccessStatusCode && (await page.Content.ReadAsStringAsync()).Contains("viewer.js"), "embedded viewer");
                Check((await client.GetAsync(root + "/viewer.js")).IsSuccessStatusCode, "embedded JavaScript");
                Check((await client.GetAsync(root + "/viewer.css")).IsSuccessStatusCode, "embedded stylesheet");
                Check((int)(await client.GetAsync(root + "/v1/text")).StatusCode == 401, "anonymous text rejected");
                Func<string, string, Task<HttpResponseMessage>> read = async (pair, since) => {
                    var req = new HttpRequestMessage(HttpMethod.Get, root + "/v1/text" + (since == null ? "" : "?since=" + Uri.EscapeDataString(since)));
                    req.Headers.Add("X-Pairing-Code", pair); req.Headers.Add("X-Client-ID", "native-test-ipad");
                    return await client.SendAsync(req);
                };
                Func<HttpResponseMessage, Task<Snapshot>> decode = async response => new JavaScriptSerializer().Deserialize<Snapshot>(await response.Content.ReadAsStringAsync());
                Check((int)(await read("00000000", null)).StatusCode == 401, "wrong pairing rejected");
                var empty = await decode(await read(code, null)); Check(empty.text == "", "initial empty");
                var pending = read(code, empty.revision);
                await Task.Delay(25); Check(server.SetText("中文第一行\n第二行 😀"), "set text");
                var update = await decode(await pending); Check(update.text == "中文第一行\n第二行 😀", "long poll and UTF-8");
                server.SetText("修改后的文字"); Check((await decode(await read(code, null))).text == "修改后的文字", "edit/reconnect latest");
                server.SetText(""); Check((await decode(await read(code, null))).text == "", "clear");
                var current = server.Current; Check((await decode(await read(code, current.revision))).revision == current.revision, "heartbeat");
                Check(!server.SetText(new string('中', 90000)), "size limit");
                var revoked = read(code, current.revision); await Task.Delay(25); server.RotateCode();
                Check((int)(await revoked).StatusCode == 401, "pending revocation");
                Check((int)(await read(code, null)).StatusCode == 401, "old code rejected");
                Check((int)(await read(server.PairingCode, null)).StatusCode == 200, "new code accepted");
                Check((int)(await client.PostAsync(root + "/v1/text", new StringContent("attack"))).StatusCode == 400, "no remote writes");
                Check((int)(await client.GetAsync(root + "/admin/status")).StatusCode == 404, "no admin API");
                Check(server.ConnectedDevices == 1, "device count");
                for (int i = 0; i < 10; i++) Check((int)(await read("00000000", null)).StatusCode == 401, "wrong attempt");
                Check((int)(await read(server.PairingCode, null)).StatusCode == 429, "throttle");
                using (var second = new LanServer()) Check(second.Current.revision != server.Current.revision, "restart epoch");
            }
        }
    }
}
