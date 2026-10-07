using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace LanText {
    public sealed class Snapshot {
        public string text { get; set; }
        public string revision { get; set; }
    }

    public sealed class LanServer : IDisposable {
        readonly object gate = new object();
        readonly string epoch = Guid.NewGuid().ToString("N");
        string text = "", code = NewCode();
        long revision;
        TaskCompletionSource<bool> changed = Signal();
        readonly Dictionary<string, DateTime> devices = new Dictionary<string, DateTime>();
        sealed class Attempts { public int Count; public DateTime Until; }
        readonly Dictionary<string, Attempts> failures = new Dictionary<string, Attempts>();
        readonly HashSet<TcpClient> sockets = new HashSet<TcpClient>();
        readonly SemaphoreSlim capacity = new SemaphoreSlim(32, 32);
        readonly CancellationTokenSource stopping = new CancellationTokenSource();
        readonly int heartbeatMs;
        TcpListener listener;
        public int Port { get; private set; }
        public string PairingCode { get { lock (gate) return code; } }
        public bool Running { get; private set; }
        public LanServer(int heartbeatMilliseconds = 20000) { heartbeatMs = heartbeatMilliseconds; }
        static TaskCompletionSource<bool> Signal() {
            return new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        }
        static string NewCode() {
            using (var rng = RandomNumberGenerator.Create()) {
                var bytes = new byte[4]; uint value;
                do { rng.GetBytes(bytes); value = BitConverter.ToUInt32(bytes, 0); }
                while (value >= uint.MaxValue - uint.MaxValue % 90000000u);
                return (10000000u + value % 90000000u).ToString();
            }
        }
        static bool Same(string a, string b) {
            if (a == null || a.Length != b.Length) return false;
            int diff = 0; for (int i = 0; i < b.Length; i++) diff |= a[i] ^ b[i];
            return diff == 0;
        }
        public void Start(int port) {
            listener = new TcpListener(IPAddress.Any, port);
            try { listener.Start(32); Port = ((IPEndPoint)listener.LocalEndpoint).Port; Running = true; }
            catch { listener.Stop(); throw; }
            AcceptLoop();
        }
        void WakeLocked() { var previous = changed; changed = Signal(); previous.TrySetResult(true); }
        public bool SetText(string value) {
            if (Encoding.UTF8.GetByteCount(value) > 262144) return false;
            lock (gate) { if (value != text) { text = value; revision++; WakeLocked(); } }
            return true;
        }
        public void RotateCode() {
            lock (gate) { string next; do { next = NewCode(); } while (next == code); code = next; devices.Clear(); WakeLocked(); }
        }
        Snapshot SnapshotLocked() { return new Snapshot { text = text, revision = epoch + ":" + revision }; }
        public Snapshot Current { get { lock (gate) return SnapshotLocked(); } }
        public int ConnectedDevices {
            get { lock (gate) { PruneDevices(); return devices.Count; } }
        }
        void PruneDevices() {
            var old = new List<string>(); foreach (var item in devices) if (item.Value < DateTime.UtcNow.AddSeconds(-45)) old.Add(item.Key);
            foreach (var id in old) devices.Remove(id);
        }
        int Authenticate(string supplied, string ip) {
            lock (gate) {
                var old = new List<string>(); foreach (var item in failures) if (item.Value.Until <= DateTime.UtcNow) old.Add(item.Key);
                foreach (var key in old) failures.Remove(key);
                Attempts attempt; failures.TryGetValue(ip, out attempt);
                if (attempt != null && attempt.Count >= 10) return 429;
                if (!Same(supplied, code)) {
                    if (attempt == null) {
                        if (failures.Count >= 2048) return 429;
                        attempt = new Attempts { Until = DateTime.UtcNow.AddSeconds(60) }; failures[ip] = attempt;
                    }
                    attempt.Count++; return 401;
                }
                failures.Remove(ip); return 200;
            }
        }
        async void AcceptLoop() {
            try {
                while (!stopping.IsCancellationRequested) {
                    var client = await listener.AcceptTcpClientAsync().ConfigureAwait(false);
                    if (!capacity.Wait(0)) { client.Close(); continue; }
                    lock (gate) sockets.Add(client);
                    Handle(client);
                }
            } catch (ObjectDisposedException) { } catch (SocketException) { }
        }
        async Task<string> ReadHeaders(NetworkStream stream) {
            // Byte-by-byte keeps this tiny GET-only protocol independent of body framing.
            var bytes = new List<byte>(); var one = new byte[1];
            var deadline = Task.Delay(10000, stopping.Token);
            while (bytes.Count < 8192) {
                var read = stream.ReadAsync(one, 0, 1, stopping.Token);
                if (await Task.WhenAny(read, deadline).ConfigureAwait(false) != read) throw new IOException("Header timeout");
                if (await read.ConfigureAwait(false) == 0) throw new IOException("Closed");
                bytes.Add(one[0]);
                int n = bytes.Count;
                if (n >= 4 && bytes[n - 4] == 13 && bytes[n - 3] == 10 && bytes[n - 2] == 13 && bytes[n - 1] == 10)
                    return Encoding.ASCII.GetString(bytes.ToArray());
            }
            throw new IOException("Header too large");
        }
        async Task Send(NetworkStream stream, int status, object value) {
            var serializer = new JavaScriptSerializer { MaxJsonLength = 2000000 };
            var body = Encoding.UTF8.GetBytes(serializer.Serialize(value));
            await SendBytes(stream, status, body, "application/json; charset=utf-8");
        }
        async Task SendBytes(NetworkStream stream, int status, byte[] body, string mime) {
            string reason = status == 200 ? "OK" : status == 401 ? "Unauthorized" : status == 429 ? "Too Many Requests" : status == 503 ? "Service Unavailable" : status == 404 ? "Not Found" : "Bad Request";
            var header = Encoding.ASCII.GetBytes("HTTP/1.1 " + status + " " + reason + "\r\nContent-Type: " + mime + "\r\nContent-Security-Policy: default-src 'self'; frame-ancestors 'none'\r\nContent-Length: " + body.Length + "\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n");
            var write = Write(stream, header, body);
            if (await Task.WhenAny(write, Task.Delay(10000, stopping.Token)).ConfigureAwait(false) != write) throw new IOException("Write timeout");
            await write.ConfigureAwait(false);
        }
        async Task Write(NetworkStream stream, byte[] header, byte[] body) {
            await stream.WriteAsync(header, 0, header.Length, stopping.Token).ConfigureAwait(false);
            await stream.WriteAsync(body, 0, body.Length, stopping.Token).ConfigureAwait(false);
        }
        async void Handle(TcpClient client) {
            try {
                client.NoDelay = true;
                var stream = client.GetStream();
                string raw = await ReadHeaders(stream).ConfigureAwait(false);
                var lines = raw.Split(new[] { "\r\n" }, StringSplitOptions.None);
                var first = lines[0].Split(' ');
                if (first.Length != 3 || first[0] != "GET" || !first[1].StartsWith("/")) { await Send(stream, 400, new { error = "bad_request" }); return; }
                var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                for (int i = 1; i < lines.Length && lines[i].Length > 0; i++) {
                    int colon = lines[i].IndexOf(':');
                    if (colon <= 0) { await Send(stream, 400, new { error = "bad_request" }); return; }
                    string key = lines[i].Substring(0, colon).Trim();
                    if (headers.ContainsKey(key)) { await Send(stream, 400, new { error = "duplicate_header" }); return; }
                    headers.Add(key, lines[i].Substring(colon + 1).Trim());
                }
                var url = new Uri("http://localhost" + first[1]);
                string asset = url.AbsolutePath == "/" ? "index.html" : url.AbsolutePath == "/viewer.js" ? "viewer.js" : url.AbsolutePath == "/viewer.css" ? "viewer.css" : null;
                if (asset != null) {
                    using (var resource = typeof(LanServer).Assembly.GetManifestResourceStream("LanText.Web." + asset))
                    using (var buffer = new MemoryStream()) {
                        resource.CopyTo(buffer);
                        await SendBytes(stream, 200, buffer.ToArray(), asset.EndsWith(".js") ? "text/javascript; charset=utf-8" : asset.EndsWith(".css") ? "text/css; charset=utf-8" : "text/html; charset=utf-8"); return;
                    }
                }
                if (url.AbsolutePath != "/v1/text") { await Send(stream, 404, new { error = "not_found" }); return; }
                string supplied, id; headers.TryGetValue("X-Pairing-Code", out supplied); headers.TryGetValue("X-Client-ID", out id);
                string ip = ((IPEndPoint)client.Client.RemoteEndPoint).Address.ToString();
                int auth = Authenticate(supplied, ip);
                if (auth != 200) { await Send(stream, auth, new { error = auth == 401 ? "invalid_pairing_code" : "too_many_attempts" }); return; }
                if (String.IsNullOrEmpty(id) || id.Length > 64) { await Send(stream, 400, new { error = "client_id_required" }); return; }
                foreach (char c in id) if (!(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-')) { await Send(stream, 400, new { error = "invalid_client_id" }); return; }
                string since = System.Web.HttpUtility.ParseQueryString(url.Query)["since"];
                Task wait = null; bool full;
                lock (gate) {
                    PruneDevices(); full = devices.Count >= 128 && !devices.ContainsKey(id);
                    if (!full) { devices[id] = DateTime.UtcNow; if (since == SnapshotLocked().revision) wait = changed.Task; }
                }
                if (full) { await Send(stream, 503, new { error = "server_busy" }); return; }
                if (wait != null) await Task.WhenAny(wait, Task.Delay(heartbeatMs, stopping.Token)).ConfigureAwait(false);
                auth = Authenticate(supplied, ip);
                if (auth != 200) { await Send(stream, auth, new { error = "invalid_pairing_code" }); return; }
                Snapshot snapshot; lock (gate) { devices[id] = DateTime.UtcNow; snapshot = SnapshotLocked(); }
                await Send(stream, 200, snapshot).ConfigureAwait(false);
            } catch (Exception) { /* Closed/invalid clients cannot terminate the desktop UI. No text/code logging. */ }
            finally { lock (gate) sockets.Remove(client); client.Close(); capacity.Release(); }
        }
        public void Dispose() {
            if (stopping.IsCancellationRequested) return;
            stopping.Cancel(); Running = false;
            if (listener != null) listener.Stop();
            lock (gate) { WakeLocked(); foreach (var socket in sockets) socket.Close(); }
        }
    }
}
