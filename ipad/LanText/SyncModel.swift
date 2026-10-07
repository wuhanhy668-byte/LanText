import SwiftUI
import UIKit

@MainActor
final class SyncModel: ObservableObject {
    @Published var text = ""
    @Published var status = "未连接"
    @Published var connected = false
    @Published var wantsConnection = false
    private var task: Task<Void, Never>?
    private var endpoint: URL?
    private var code = ""
    private let clientID = UUID().uuidString
    private var revision: String?
    private var active = true
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 35
        config.timeoutIntervalForResource = 40
        config.waitsForConnectivity = false
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        return URLSession(configuration: config)
    }()

    func connect(ip: String, port: String, pairingCode: String) {
        disconnect()
        guard let url = Endpoint.url(ip: ip, port: port) else {
            status = "请输入局域网 IPv4 和 1024–65535 端口"; return
        }
        let trimmed = pairingCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count == 8, trimmed.allSatisfy({ $0 >= "0" && $0 <= "9" }) else {
            status = "请输入电脑显示的 8 位配对码"; return
        }
        endpoint = url; code = trimmed; revision = nil; text = ""
        wantsConnection = true
        resume()
    }

    func disconnect() {
        wantsConnection = false; task?.cancel(); task = nil
        connected = false; status = "未连接"; code = ""; revision = nil
        UIApplication.shared.isIdleTimerDisabled = false
    }

    func setActive(_ value: Bool) {
        active = value
        if value { resume() }
        else {
            task?.cancel(); task = nil; connected = false
            if wantsConnection { status = "后台暂停，返回后自动连接" }
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }

    private func resume() {
        guard active, wantsConnection, task == nil, let endpoint else { return }
        UIApplication.shared.isIdleTimerDisabled = true
        status = "连接中…"
        task = Task { [weak self] in
            guard let self else { return }
            var delay: UInt64 = 1
            while !Task.isCancelled && self.wantsConnection {
                do {
                    var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)!
                    if let revision = self.revision { components.queryItems = [URLQueryItem(name: "since", value: revision)] }
                    var request = URLRequest(url: components.url!)
                    request.setValue(self.code, forHTTPHeaderField: "X-Pairing-Code")
                    request.setValue(self.clientID, forHTTPHeaderField: "X-Client-ID")
                    let (data, response) = try await self.session.data(for: request)
                    try Task.checkCancellation()
                    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
                    if http.statusCode == 401 {
                        self.status = "配对码错误或已更换，请重新连接"
                        self.wantsConnection = false; self.connected = false
                        UIApplication.shared.isIdleTimerDisabled = false
                        break
                    }
                    if http.statusCode == 429 {
                        self.connected = false; self.status = "配对尝试过多，60 秒后重试"
                        try await Task.sleep(nanoseconds: 60_000_000_000); continue
                    }
                    guard http.statusCode == 200, data.count <= 2_000_000 else { throw URLError(.badServerResponse) }
                    let snapshot = try JSONDecoder().decode(TextSnapshot.self, from: data)
                    self.text = snapshot.text; self.revision = snapshot.revision
                    self.connected = true; self.status = "已连接 · 实时同步"; delay = 1
                } catch {
                    if Task.isCancelled { break }
                    self.connected = false
                    self.status = "连接中断，\(delay) 秒后重试 · 检查 Wi-Fi / 局域网权限"
                    // Force a full snapshot after any interruption, including a server restart.
                    self.revision = nil
                    do { try await Task.sleep(nanoseconds: delay * 1_000_000_000) }
                    catch { break }
                    delay = min(delay * 2, 8)
                }
            }
            // A cancelled old task must not clear a newly created connection task.
            if !Task.isCancelled { self.task = nil }
        }
    }
}
