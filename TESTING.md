# 网页版验证记录

2026-10-07，Windows 本机。

- 已编译：WinForms Windows x64 EXE，HTML/CSS/JS 内嵌，无需 Node.js。
- 已通过原生服务测试：中文多行与 Emoji、即时变更、清空、重连获取最新内容、心跳、配对错误、配对码更换使等待请求失效、限流、文字长度限制、服务重启版本、禁止远程写入。
- 已通过 Edge/Chromium 浏览器测试（820×1180）：页面配对、中文多行与 Emoji、HTML 字符按纯文字显示、修改、清空、断网恢复后最新文字、字号调整、全屏按钮/退出、更换配对码后停止读取。
- 未进行 iPad Safari 真机测试、iPad 系统全屏/自动锁定设置测试、真实 Wi-Fi 防火墙与客户端隔离测试。HTTP 页面无法保证程序保持屏幕常亮，需要 iPad 自动锁定设为“永不”。

本机原生服务测试命令：

```powershell
$p = Start-Process build/desktop/LanText-Desktop.exe -ArgumentList '--self-test', "$PWD/test-result.txt" -Wait -PassThru
Get-Content test-result.txt
if ($p.ExitCode -ne 0) { throw '测试失败' }
```
