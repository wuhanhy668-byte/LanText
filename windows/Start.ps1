param([switch]$CheckRuntime)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeRoot = Join-Path $projectRoot 'runtime'
$nodeVersion = '22.23.3'
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$packageName = "node-v$nodeVersion-win-$arch"
$nodePath = Join-Path $runtimeRoot "$packageName\node.exe"
try {
    if (-not (Test-Path -LiteralPath $nodePath)) {
        Write-Host 'Preparing portable Node.js (first launch requires Internet)...'
        New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
        $zipPath = Join-Path $runtimeRoot "$packageName.zip"
        $expectedHash = if ($arch -eq 'arm64') { '33dad22e4cef5ee8f9fbb1b0d037fdacd0e56d12a4580f0d63f68b894deab535' } else { '2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71' }
        Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$nodeVersion/$packageName.zip" -OutFile $zipPath
        if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw 'Node.js checksum mismatch. Download rejected.' }
        Expand-Archive -LiteralPath $zipPath -DestinationPath $runtimeRoot -Force
        Remove-Item -LiteralPath $zipPath
    }
    if ($CheckRuntime) { & $nodePath --version; exit $LASTEXITCODE }
    Write-Host 'Starting LanText. Keep this window open; Ctrl+C stops the service.'
    & $nodePath (Join-Path $PSScriptRoot 'server.mjs')
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host 'You can install Node.js 22+ manually, then run: node windows/server.mjs'
    exit 1
}
