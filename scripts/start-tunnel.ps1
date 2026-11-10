# Launches the Destiny admin console tunnel as a fully detached background
# process on Windows, so it survives the parent shell exiting.
#
#   powershell -ExecutionPolicy Bypass -File scripts\start-tunnel.ps1
#
# Writes:
#   logs/tunnel.log   - console output
#   logs/tunnel.url   - the published https://*.trycloudflare.com URL

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$logFile = Join-Path $logDir 'tunnel.log'
$urlFile = Join-Path $logDir 'tunnel.url'

# Stop any previous instance.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*tunnel-admin*' -or $_.CommandLine -like '*api/server.ts*' -or $_.CommandLine -like '*next*start*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Remove-Item $urlFile -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$stdout = Join-Path $logDir 'tunnel.out.log'
$stderr = Join-Path $logDir 'tunnel.err.log'

$proc = Start-Process -FilePath 'node' `
  -ArgumentList @('scripts/tunnel-admin.mjs', '--log', 'logs/tunnel.log', '--url-file', 'logs/tunnel.url') `
  -WorkingDirectory $root `
  -RedirectStandardOutput $stdout `
  -RedirectStandardError $stderr `
  -WindowStyle Hidden `
  -PassThru

Write-Host "Started tunnel launcher (PID $($proc.Id))."

# Wait for the URL to be published.
$deadline = (Get-Date).AddSeconds(120)
while ((Get-Date) -lt $deadline) {
  if (Test-Path $urlFile) {
    $url = (Get-Content $urlFile -Raw).Trim()
    if ($url) {
      Write-Host ''
      Write-Host '  ============================================================' -ForegroundColor DarkMagenta
      Write-Host '   DESTINY ADMIN CONSOLE IS LIVE' -ForegroundColor Magenta
      Write-Host "   $url" -ForegroundColor Magenta
      Write-Host '  ============================================================' -ForegroundColor DarkMagenta
      Write-Host ''
      Write-Host '   Password: DASHBOARD_ADMIN_PASSWORD from .env' -ForegroundColor DarkGray
      Write-Host "   Logs:     $logFile" -ForegroundColor DarkGray
      Write-Host ''
      exit 0
    }
  }
  if ($proc.HasExited) {
    Write-Host "Tunnel launcher exited early (code $($proc.ExitCode))." -ForegroundColor Red
    Get-Content $stderr -Tail 20 -ErrorAction SilentlyContinue
    exit 1
  }
  Start-Sleep -Seconds 2
}

Write-Host 'Timed out waiting for the tunnel URL. Check logs/tunnel.log' -ForegroundColor Red
exit 1
