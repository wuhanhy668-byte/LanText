# Run from an elevated PowerShell. Scope is limited to private networks and local subnet.
$ErrorActionPreference = 'Stop'
$port = if ($env:LANTEXT_PORT) { [int]$env:LANTEXT_PORT } else { 8765 }
if ($port -lt 1024 -or $port -gt 65535) { throw 'Invalid port' }
$name = "LanText-$port"
if (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue) { Remove-NetFirewallRule -Name $name }
New-NetFirewallRule -Name $name -DisplayName "LanText LAN $port" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Private -RemoteAddress LocalSubnet | Out-Null
Write-Host "Private LAN TCP $port allowed. To undo: Remove-NetFirewallRule -Name $name"
