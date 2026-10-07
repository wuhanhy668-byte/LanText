# 验证记录与真机验收

验证日期：2026-10-07（Asia/Shanghai）。本地为 Windows；已将完整工程上传到 `wuhanhy668-byte/LanText`，并在 GitHub macOS 15 / Xcode 16.4 环境完成 Apple 无签名编译。**签名、安装和 iPad 真机显示尚未执行**，由用户自行签名安装后验收。

## 已实际验证

| 项目 | 方式 / 结果 |
| --- | --- |
| 首次 Windows 运行时准备 | 实际执行 `windows/Start.ps1 -CheckRuntime`，从 nodejs.org 下载，固定 SHA-256 验证通过，成功解压并输出 Node.js v22.23.3 |
| 独立 Windows EXE | Node SEA 构建 x64 PE 可执行文件成功；执行 `--self-test` 验证内嵌页面与 JS、中文多行/表情、修改清空、配对及轮换撤销，通过 |
| EXE 无外部运行依赖 | 在空工作目录、空 PATH 下启动实际 EXE 的正常入口（只禁用自动开浏览器），成功提供内嵌 HTML / JS，未配对读取返回 401；不加载源码或独立 Node |
| 服务端协议自动化 | 随附 `tests/server.test.mjs`，Node.js 22.23.3：11 项通过、0 失败、0 跳过；另在本机 Node.js 24.19.0 执行过测试 |
| 中文、多行、表情、修改、空文本 | 通过真实 HTTP 请求提交与读取，内容一致；分片 UTF-8 中文/表情正文也通过 |
| 更新与心跳 | 长轮询在提交后返回最新内容；没有变化时定时返回当前快照 |
| 重连/服务重启 | 客户端恢复请求时获取最新快照；新服务的 revision epoch 与旧服务不同 |
| 配对与撤销 | 无码 / 错误码拒绝；轮换后旧码及正在等待的请求失效，新码可访问 |
| 防暴力尝试 | 使用缩短的测试窗口验证错误次数限速与窗口结束后恢复 |
| 管理权限 | 配对码不能作为管理令牌写入；跨源与错误 Host 拒绝；非 loopback Wi-Fi IPv4 请求即便提供真实管理令牌也无法访问输入页面、JS 或管理 API |
| 局域网绑定 | 本机通过 Wi-Fi 网卡 IPv4 请求监听服务，配对后可读；这验证了绑定与 IP 权限逻辑，不代表跨设备防火墙已经验证 |
| 边界与取消 | 过大文本 / 错误 JSON / 非字符串拒绝；客户端取消等待后服务继续正常响应 |
| Windows 输入界面 | Playwright 驱动本机 Edge headless：多行中文自动提交、模拟输入法 compositionstart/compositionend、清空、输入 HTML 标签按纯文本处理、刷新保留管理会话、换码撤销；页面脚本错误为 0 |
| JS 与 Python 语法 | Node `--check` 检查服务及浏览器脚本；Python AST 解析签名脚本通过 |
| 工程与构建配置静态检查 | Xcode PBX 工程由独立 parser 解析成功，4 个 Swift 文件引用存在；scheme XML / Info.plist 解析成功；GitHub Actions YAML 解析成功，3 个 job、无签名 flag、签名触发条件存在 |
| 图标 | 已生成并提交 1024 × 1024 无透明通道的 PNG 图标与 asset catalog 配置 |

自动化默认只使用 Node 内建模块，无需 `npm install`：

```powershell
node --test tests/*.test.mjs
```

浏览器 UI 检查和静态第三方 parser 仅用于本次开发验证，不是运行依赖。Windows 不会自动修改系统防火墙，本次没有创建防火墙规则。

## 已在 GitHub macOS runner 实际通过

- `plutil` 验证工程与 Info.plist。
- `swiftc` 编译并执行随附 `tests/ProtocolTests.swift`：有效/无效私有 IPv4、端口边界、中文多行 JSON 解码。
- iPad 模拟器 Debug 无签名 Xcode build。
- ARM64 真机 Release 无签名 Xcode build。
- 未签名 IPA 打包，包内为 `Payload/LanText.app`。

结果见 [成功构建 #2](https://github.com/wuhanhy668-byte/LanText/actions/runs/37601558185)，编译源码 commit 为 `6cee7db19d3480aa5412bcec8487b1bb71d6ffec`。Windows 和 ipad-unsigned job 均成功，签名 job 按预期跳过。

IPA 已下载到 outputs/LanText-unsigned.ipa：71,643 字节；验证外层 artifact 的 SHA-256 与 GitHub 元数据一致、IPA ZIP 完整性通过、包内执行文件为 ARM64 Mach-O、UIDeviceFamily 为 iPad（2）、最低系统 17.0、局域网权限和 ATS 局域网配置均存在。IPA SHA-256：`de52bbb1cd31cc0c9d7abcde71e423c94a0a58cc45857444befb0b8228e35d9c`。

首轮 CI 的 Swift 测试文件与 Endpoint.swift 名称大小写冲突，已通过重命名为 ProtocolTests.swift 修复；第二轮测试与两个 Xcode build 全部成功。现有编译警告为 SwiftUI onChange 旧重载弃用提示，以及未依赖 AppIntents 导致元数据提取跳过，不影响构建成功。

可选签名 archive 和已签名 IPA export 流程尚未执行（4 个 Secrets；见 README）。

## iPad 真机验收清单

安装后的建议顺序：

1. 首次打开，填写电脑 Wi-Fi IPv4、端口和正确配对码；允许局域网权限后接通。拒绝权限时能显示连接失败，设置中重新允许后能恢复。
2. 电脑输入“中文第一行\n第二行😀”，检查 iPad 换行、中文字体和表情；修改前文和清空后检查显示随之更新。
3. 使用真实中文输入法组词，确认未完成拼音不提前显示，确认组词完成后同步。自动化模拟 composition 不能代替真实输入法检查。
4. 字号 18–160、横竖屏、长段自动换行与滚动；进入全屏，调整字号并退出。检查状态和退出按钮在屏幕边缘可用。
5. 前台连接后等待超过系统自动锁屏时间，确认常亮；断开和进入后台后系统正常管理休眠。
6. 暂时关闭 iPad Wi-Fi，观察超时后的断线状态；电脑在离线期间更新，重新开启 Wi-Fi 后检查自动恢复最新文字。
7. iPad 退到后台再返回，确认重新连接和文字更新；完全退出 App 后重新输入配对码。
8. 电脑更换配对码，旧 iPad 会话不再读到更新；输入新码后恢复。
9. 电脑关闭再启动，iPad 保留旧文本但显示断开；使用新配对码连接后同步新的电脑内容（重启初始内容为空）。
10. 用第二台局域网设备尝试无配对码读取及修改文字，确认拒绝；验证实际防火墙规则与路由器设备互访配置。
11. 用自己的签名方式安装 IPA，确认 profile 的 Bundle ID、UDID、有效期与证书匹配；检查图标和首次启动行为。

## 本版本边界

HTTP 明文传输，配对码阻止未经授权的普通请求，不抵御抓包和中间人。显示在后台暂停，回到前台恢复。服务重启后文字不保留，配对码变化。在线设备数量是最近 45 秒活动的 client ID 数量，不是系统网络连接精确计数。未进行多设备压力、长时间稳定性或多种 iPadOS 版本兼容测试。
