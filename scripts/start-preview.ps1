$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$python = "C:\Users\jin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$port = 8877

$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Write-Output "Preview server already running: http://127.0.0.1:$port/preview/index.html"
  exit 0
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $python
$psi.Arguments = "-m http.server $port --bind 127.0.0.1"
$psi.WorkingDirectory = $projectRoot
$psi.UseShellExecute = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

$process = [System.Diagnostics.Process]::Start($psi)
Write-Output "Started preview server PID $($process.Id): http://127.0.0.1:$port/preview/index.html"
