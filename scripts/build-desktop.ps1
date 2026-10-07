param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$buildDir = Join-Path $projectRoot 'build\desktop'
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$nativeRoot = Join-Path $projectRoot 'windows\native'
$target = if ($OutputPath) { [IO.Path]::GetFullPath($OutputPath) } else { Join-Path $buildDir 'LanText-Desktop.exe' }
$webRoot = Join-Path $projectRoot 'windows\web'
& $compiler "/resource:$webRoot\index.html,LanText.Web.index.html" "/resource:$webRoot\viewer.js,LanText.Web.viewer.js" "/resource:$webRoot\viewer.css,LanText.Web.viewer.css" /nologo /target:winexe /platform:x64 /optimize+ "/out:$target" "/win32manifest:$nativeRoot\app.manifest" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.dll /reference:System.Web.Extensions.dll /reference:System.Net.Http.dll "$nativeRoot\LanServer.cs" "$nativeRoot\Desktop.cs" "$nativeRoot\ProtocolTests.cs"
if ($LASTEXITCODE -ne 0) { throw 'Desktop compilation failed' }
Write-Host "Native desktop EXE ready: $target"
