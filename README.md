# LanText：电脑输入，iPad 实时显示

完整源码：Windows 输入界面 + 无第三方依赖的 Node.js 局域网服务 + 原生 SwiftUI iPad App + GitHub Actions 构建与可选签名导出。

适用环境：Windows 10/11（x64 或 ARM64）、iPadOS 17 及以上、同一可互通的 Wi-Fi。不需要 Mac；Apple 编译在 GitHub 托管 macOS runner 上完成。Windows 输入界面使用系统浏览器，iPad 端是编译安装的原生 App。

## 1. 在 Windows 上运行

已交付独立 **LanText-Windows-x64.exe**（在项目目录外的 outputs 中），双击即可运行，不需要安装 Node.js、解压源码或联网下载。它打开系统浏览器作为输入界面，命令窗口承载服务；关闭窗口停止服务。也提供 ZIP 便携包，包含 EXE、防火墙脚本与第三方许可证。EXE 尚未使用 Windows 代码签名证书签名。

以下是源码运行方式：

1. 将整个项目解压到可写目录，双击 **Start-Windows.cmd**。
2. 首次启动自动下载官方 Node.js 22.23.3 便携运行时，校验代码中固定的 SHA-256 后解压到 `runtime/`。无需管理员安装，不使用 npm 依赖。首次下载需要互联网，此后启动和文字传输都能离线运行。
3. 浏览器自动打开本机输入页面，保留启动命令窗口。页面显示电脑 IPv4、端口、随机 8 位配对码与最近在线设备数。
4. 首次弹出 Windows 防火墙提示时，允许“专用网络”。如果没有弹窗或连接被阻止，在**管理员 PowerShell** 中切换到项目目录，运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\Allow-Firewall.ps1
```

该脚本只开放专用网络、LocalSubnet 来源的 TCP 8765。Wi-Fi 的网络配置文件需为“专用”，只在可信网络这样设置。撤销规则：

```powershell
Remove-NetFirewallRule -Name LanText-8765
```

5. 输入中文或多行文字，停止输入约 150 ms 后自动同步；中文输入法组词期间不提交未完成文字。点击“清空文字”立即提交空文本。
6. 关闭命令窗口或按 Ctrl+C 停止服务。文字仅存于内存，重启后清空，配对码与本机管理凭据也重新生成。

如果已有 Node.js 22+，也可直接启动，无需下载便携运行时：

```powershell
node windows/server.mjs
```

端口冲突时，在 PowerShell 中设置端口再启动（同时修改 iPad 的端口）：

```powershell
$env:LANTEXT_PORT = '8877'
.\Start-Windows.cmd
# 如需防火墙规则，在同样设置 LANTEXT_PORT 的管理员终端运行 Allow-Firewall.ps1
```

多个电脑 IPv4 地址时，选择 Wi-Fi 网卡地址，通常是 `192.168.x.x`、`10.x.x.x` 或 `172.16`–`172.31` 网段；可用 `ipconfig` 确认。当前 iPad 端支持私有/链路本地 IPv4，不支持公网 IP、域名或 IPv6。

浏览器关闭后重新启动服务即可重新打开输入页。浏览器刷新保留本机会话。不要将输入页复制给其他设备；它只允许本机访问。正常运行不会把配对码、文字或管理凭据输出到日志。

## 2. 用 GitHub Actions 无签名构建

当前交付目录本身不预设远程仓库。创建自己的 GitHub 仓库，把 **LanText 目录内的内容** 上传到仓库根目录，确保 `.github/workflows/build.yml` 位于根目录的 `.github/workflows/` 下，而不是嵌套在 `outputs/LanText/` 中。不要上传 `runtime/`、签名材料或 `build/`。

如果用 Git，可在此项目目录执行（需要本机安装 Git；将地址换成自己的仓库）：

```powershell
git init
git add .
git commit -m "Add LanText Windows and native iPad app"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

Push / Pull Request 自动执行：

- Windows runner：Node.js 22，运行协议和权限自动化测试，打包 Windows 源码。
- macOS 15 runner：验证 plist / Xcode 工程，编译执行 Swift IP 校验与中文 JSON 解码测试。
- Xcode：分别执行 iPad 模拟器 Debug 与 ARM64 真机 Release **无签名编译**，均关闭 Code Signing。

不需要任何 Apple Secrets 即可运行上面全部步骤。也可以在仓库 Actions → **Build and test LanText** → Run workflow 手动运行，不勾选 `signed`。

运行成功后下载 artifacts：

| 产物 | 用途 |
| --- | --- |
| LanText-Windows | Windows 源码启动包 |
| LanText-unsigned / LanText-unsigned-device.zip | 无签名 ARM64 `.app`，用于编译结果检查或交给自己的签名流程；不能直接安装 |
| LanText-unsigned / LanText-unsigned.ipa | 无签名 IPA（含 `Payload/LanText.app`），供你用自己的工具签名后安装；未签名前不能安装 |
| LanText-unsigned / LanText-simulator.zip | 模拟器 `.app`，仅供有 Mac 的环境使用，不能装到真机 |

Xcode 工程已经提交在 `ipad/LanText.xcodeproj`，包含共享 LanText scheme、Swift 源文件、App Icon 和 Info.plist；不依赖 XcodeGen、CocoaPods 或 Swift Package 下载。工作流使用 macOS 15 runner 默认 Xcode，并在日志开头输出实际版本。最低部署版本为 iPadOS 17。

## 3. 生成可安装 IPA：Secrets 和签名

**如果你自行签名，只需运行无签名构建并下载 `LanText-unsigned.ipa`，无需配置任何 Apple Secrets。** 下方 Secrets 只用于让 Actions 代你签名导出。

仓库 Settings → Secrets and variables → Actions → Repository secrets，配置以下 **4 个 Secrets**：

| Secret 名称 | 内容 |
| --- | --- |
| `BUILD_CERTIFICATE_BASE64` | 含私钥的 Apple 签名证书 `.p12` 文件的 Base64；仅包含一个有效签名身份 |
| `P12_PASSWORD` | `.p12` 的导出密码（此流程要求非空） |
| `BUILD_PROVISION_PROFILE_BASE64` | 与证书、Bundle ID、分发方式匹配的 `.mobileprovision` 的 Base64 |
| `KEYCHAIN_PASSWORD` | CI 临时钥匙串随机非空密码，可自行生成，与 Apple ID 密码无关 |

Repository variables 中设置 **`BUNDLE_ID`**，例如 `com.yourname.LanText`，与开发者后台 App ID / provisioning profile 对应；未设置时为 `com.example.LanText`。Team ID 从 profile 读取，无需额外 Secret。不需要 App Store Connect API Key，工作流不自动上传或发布。

在 Windows 中将材料转为 Base64 并复制到剪贴板，不在终端打印：

```powershell
Set-Clipboard -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\certificate.p12')))
# 粘贴到 BUILD_CERTIFICATE_BASE64 后，转换 profile：
Set-Clipboard -Value ([Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\profile.mobileprovision')))
# 配置完成后可清理剪贴板：
Set-Clipboard -Value ''
```

在 Actions → Run workflow 勾选 `signed`，选择匹配的 `export_method`：

| export_method | 所需签名材料与安装方式 |
| --- | --- |
| `release-testing`（默认） | Apple Distribution 证书 + Ad Hoc profile；必须提前登记目标 iPad 的 UDID 并将其加入 profile，导出后通过你自己的 Windows 安装工具或 HTTPS OTA 分发安装 |
| `debugging` | Apple Development 证书 + development profile；目标 iPad 需在 profile 内，根据系统提示启用开发者模式 |
| `app-store-connect` | Apple Distribution 证书 + App Store profile；导出 IPA 供你自行上传 App Store Connect / TestFlight，不可直接侧载 |

签名 job 只有前面 Windows 测试和 Apple 无签名编译成功后才运行。脚本验证 Bundle ID、profile 到期日和分发类型，再导入临时钥匙串、手动 archive / export；成功产物为 `LanText-signed-IPA`（保留 7 天）。构建版本号使用 GitHub run number。证书与 profile 不加入源码或 artifact；脚本不打印密码或文件内容，并在 finally 和工作流 always 清理签名材料。

安装由你自己的签名与安装工具处理。下载 GitHub artifact 得到的是 ZIP，需先解压找到 `.ipa`；不能在 iPad 上仅点击这个 ZIP 完成安装。Ad Hoc 安装时设备必须属于 profile，证书与 profile 过期后需重新构建。当前 Windows 环境不具备 Apple 工具，不能在本机替代 Xcode 完成苹果编译。

签名步骤遵循 [GitHub 官方证书导入流程](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)；注册设备分发条件见 [Apple 官方说明](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices)。

## 4. iPad 连接与显示

1. 安装原生 App 后，输入电脑 IPv4（只填 IP，不填 `http://`）、端口（默认 8765）和 8 位配对码，点击“连接”。
2. 首次弹出局域网访问请求时点“允许”。若曾拒绝，在 iPad 设置 → 隐私与安全性 → 本地网络中允许“局域网文字屏”。
3. 接通后文字自动显示；调整字号滑块，或进入全屏后用 `−` / `＋` 调整。全屏保留小型连接状态栏和退出按钮。
4. 前台连接/重连期间保持屏幕常亮；断开或转入后台时恢复系统休眠。iPadOS 不允许普通 App 在后台持续保持显示，回到前台自动继续连接。
5. 断线期间保留最后一份文字并显示断线状态，重连等待为 1、2、4、8 秒，最高 8 秒。恢复后请求完整最新快照。长轮询空闲心跳为 20 秒；网络中断的识别还需等待请求超时，最多约 40 秒。
6. 电脑“更换配对码”会撤销已有长轮询及新请求，iPad 显示配对失败并停止重试；输入新码后重新连接。电脑重启也会更换配对码，须重新配对。

仅 IP 和字号保存到 iPad 设置；配对码仅保存在 App 内存中，不写入 UserDefaults、磁盘或日志。App 退出后需要重新输入配对码。

工程包含 `NSLocalNetworkUsageDescription` 与 `NSAppTransportSecurity / NSAllowsLocalNetworking`，不请求全局 `NSAllowsArbitraryLoads`。使用明确 IPv4 单播，没有 Bonjour 浏览或组播，因此不需要 Bonjour service 声明和 multicast entitlement。权限依据见 [Apple 局域网隐私说明](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy) 与 [ATS 局域网配置](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking)。实际权限弹窗和 IP HTTP 行为仍需真机确认。

## 5. 传输与权限边界

- iPad 使用 HTTP 长轮询：新文字立刻唤醒等待请求，下一次请求持续等待。不是固定间隔手动刷新，不使用云端或外部服务。
- `GET /v1/text` 只读，必须在 `X-Pairing-Code` 请求头传配对码（不放进 URL），`X-Client-ID` 标识设备；`since` 是服务启动随机 epoch 与递增版本号，因此服务器重启不会误判为“未更新”。
- 配对码为随机 8 位，单一来源 60 秒内 10 次错误后限速。更换配对码立即撤销等待请求。最多 32 个并发等待请求，避免资源无界增长。
- 本机输入端采用独立 256 位随机管理凭据，仅允许 loopback IP、准确的本机 Host 和同源请求；其他设备不能通过配对码写入文字。无 CORS 放行，正文通过文本节点渲染，不执行输入 HTML。
- 正文上限为 UTF-8 256 KiB。发送失败时 Windows 页面保留修改并重试；关闭有未提交内容的页面会提示。
- **配对码是读取访问控制，不是传输加密。HTTP 文字与配对码在局域网上为明文，具有抓包或中间人能力的网络成员仍可能截获。请在可信 Wi-Fi 中使用；不要端口转发到公网。** 如果需抵御局域网主动攻击，应改用带可信证书的 HTTPS 或应用层加密，这是本版本未实现的能力。

## 6. 验证

独立 EXE 可运行内置自检（不启动浏览器、不输出凭据）：

```powershell
.\LanText-Windows-x64.exe --self-test
```

从源码重新构建 EXE（Windows + Node 22，仅构建阶段需要 postject）：

```powershell
npm install --prefix build/tools --no-audit --no-fund postject@1.0.0-alpha.6
node scripts/build-exe.mjs
# 产物：build/exe/LanText.exe
```

自动化测试：

```powershell
node --test tests/*.test.mjs
# 或已有 npm 时：
npm test
```

实际执行的测试与未验证项目请看 [TESTING.md](TESTING.md)。苹果工程在 Windows 上只能做静态配置检查，**提供工作流不代表 GitHub 上已成功编译**。上传仓库后，以 Actions 两个无签名 Xcode build 的绿色结果为编译验证依据。

## 7. 连接失败排查

- 确认电脑启动窗口仍在运行，浏览器输入页面没有报服务断开。
- 确认电脑和 iPad 使用同一 Wi-Fi，避开访客网络 / AP 客户端隔离；同一 SSID 也可能禁止设备互访。
- 检查防火墙专用网络规则、端口、iPad 本地网络权限。VPN 或虚拟网卡可能显示多个 IPv4，优先填 Wi-Fi 地址。
- 配对码错误、轮换、电脑重启：重新填当前页面的码；限速状态等待 60 秒。
- 浏览器报会话失效：重新启动服务；输入页地址凭据已改变。
- Windows 休眠会停止服务响应，需自行调整电脑电源设置。iPad 屏幕常亮不会阻止 Windows 休眠。
- 初次 Node 下载失败：检查能否访问 nodejs.org，或自行安装 Node.js 22+ 并用 `node windows/server.mjs` 启动。`runtime/` 可保留供离线运行，不需提交 Git。

## 目录

```text
Start-Windows.cmd                  双击入口
windows/                           HTTP 服务、输入页面、运行时与防火墙脚本
ipad/LanText.xcodeproj/             完整原生 Xcode 工程与共享 scheme
ipad/LanText/                       SwiftUI、连接模型、权限、App Icon
.github/workflows/build.yml         Windows 测试 / 苹果无签名 / 可选签名构建
scripts/sign.py                    CI 签名、archive、IPA 导出与清理
tests/                             Node 协议测试、Swift 端点与解码测试
TESTING.md                         验证记录及真机验收清单
```
