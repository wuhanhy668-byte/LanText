# LanText：电脑输入，iPad 网页实时显示

现在无需在 iPad 安装 App。Windows 运行桌面 EXE，iPad Safari 打开电脑提供的局域网网址，输入 8 位配对码即可。文字仅在本地 Wi-Fi 传输，不连接云端，不加载外部网页资源。

## 直接使用

1. 双击 `LanText-Web.exe`。这是 Windows 10/11 x64 的桌面程序，使用系统自带 .NET Framework 4.8，不需要 Node.js。
2. 如果 Windows 防火墙询问是否允许访问，允许“专用网络”。电脑和 iPad 连接同一个 Wi-Fi，避免访客网络和隔离网络。
3. 在 iPad Safari 地址栏输入桌面显示的完整网址，例如 `http://192.168.0.104:8765`。多个地址时优先使用 Wi-Fi 网卡的地址。
4. 输入桌面显示的完整 8 位配对码，点“连接”。电脑输入、修改、粘贴或清空文字，网页自动同步。
5. 网页可调整字号，点“全屏显示”。浏览器不支持系统全屏时，会使用隐藏工具栏的阅读模式，点“退出全屏”返回。
6. 需要常亮时，在 iPad“设置 → 显示与亮度 → 自动锁定”选择“永不”。局域网 HTTP 页面受浏览器权限限制，不能保证自动阻止锁屏；如果设备管理不允许改自动锁定，此限制无法由网页解除。

网页会自动重连，恢复连接后显示最新文字。后台标签页可能被 Safari 暂停，切回页面后重新同步。电脑停止服务或关闭程序后无法继续同步。更换配对码后，已连接网页必须重新输入新码。配对码不存入浏览器存储、网址或日志；字号偏好保存在浏览器本地。

如果打不开网页：检查网址包含 `http://`、服务已启动、端口一致、防火墙允许专用网络、Wi-Fi 没有客户端隔离。如果端口被旧版占用，关闭旧版或使用 8877。不要同时启动多个使用同一端口的版本。

配对码用于限制读取；局域网 HTTP 不加密，请在可信的 Wi-Fi 使用。网页仅能读取，不能修改电脑文字。最多 256 KiB UTF-8 文字，错误配对尝试受限。

## 本机编译

在项目目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1
```

产物为 `build/desktop/LanText-Desktop.exe`。网页 HTML/CSS/JS 嵌入 EXE，无需额外目录。双击 `Start-Desktop.cmd` 也可从源码编译并启动。

## GitHub Actions

`Build and test LanText` 在 Windows runner 编译桌面程序，运行原生服务测试，再上传 `LanText-Web.exe`。下载 Actions 的 `LanText-Web-Windows` 产物解压即可使用。网页版无需 Apple 开发者账号或签名 Secrets。

旧版 SwiftUI 工程保留在 `ipad/`，其构建工作流改为仅手动运行的 `ipad-legacy.yml`，不影响网页版。当前推荐使用网页版。

## 验证范围

参见 TESTING.md。已完成本机 EXE 编译、原生服务测试和真实服务上的浏览器测试。iPad Safari 真机、Windows 防火墙提示、多台设备和 iPad 的自动锁定设置仍需实际设备验证。
