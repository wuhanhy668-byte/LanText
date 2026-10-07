import SwiftUI

struct ContentView: View {
    @StateObject private var model = SyncModel()
    @AppStorage("computerIP") private var ip = ""
    @AppStorage("computerPort") private var port = "8765"
    @AppStorage("fontSize") private var fontSize = 48.0
    @State private var pairingCode = ""
    @State private var fullScreen = false
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(spacing: 0) {
            if !fullScreen {
                VStack(alignment: .leading, spacing: 12) {
                    Text("LanText · 局域网文字屏").font(.title2.bold())
                    HStack {
                        TextField("电脑 IPv4，例如 192.168.1.8", text: $ip)
                            .keyboardType(.decimalPad).textInputAutocapitalization(.never).autocorrectionDisabled()
                        TextField("端口", text: $port).keyboardType(.numberPad).frame(width: 90)
                        SecureField("8 位配对码", text: $pairingCode).keyboardType(.numberPad).frame(width: 150)
                        Button(model.wantsConnection ? "重新连接" : "连接") {
                            model.connect(ip: ip, port: port, pairingCode: pairingCode)
                        }.buttonStyle(.borderedProminent)
                        if model.wantsConnection { Button("断开") { model.disconnect() } }
                    }.textFieldStyle(.roundedBorder)
                    HStack {
                        Text("字号 \(Int(fontSize))").monospacedDigit()
                        Slider(value: $fontSize, in: 18...160, step: 1).frame(maxWidth: 350)
                        Spacer()
                        Button("全屏显示") { fullScreen = true }
                    }
                }.padding()
                Divider()
            }
            HStack {
                Circle().fill(model.connected ? Color.green : Color.orange).frame(width: 8, height: 8)
                Text(model.status).font(.caption)
                Spacer()
                if fullScreen {
                    Button("−") { fontSize = max(18, fontSize - 4) }.accessibilityLabel("减小字号")
                    Button("＋") { fontSize = min(160, fontSize + 4) }.accessibilityLabel("增大字号")
                    Button("退出全屏") { fullScreen = false }
                }
            }.padding(.horizontal).padding(.vertical, 8)
            ScrollView(.vertical) {
                Text(model.text.isEmpty ? (model.connected ? "" : "连接电脑后，文字将在这里显示") : model.text)
                    .font(.system(size: fontSize)).foregroundStyle(model.text.isEmpty ? .secondary : .primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(24)
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color(uiColor: .systemBackground))
        .persistentSystemOverlays(fullScreen ? .hidden : .automatic)
        .onChange(of: scenePhase) { phase in model.setActive(phase == .active) }
        .onAppear { model.setActive(scenePhase == .active) }
    }
}
