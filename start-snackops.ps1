$ErrorActionPreference = "Continue"
$Root = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
Set-Location -LiteralPath $Root
$Marker = Join-Path $Root ".snackops-dev-port"
$PortStart = 5000
$PortEnd = 5019
$RootKey = $Root.ToLowerInvariant()

function Get-ListeningPortSet {
  $set = New-Object 'System.Collections.Generic.HashSet[int]'
  foreach ($line in (netstat -ano)) {
    if ($line -notmatch 'LISTENING') { continue }
    if ($line -match ':(\d+)\s') { [void]$set.Add([int]$Matches[1]) }
  }
  return $set
}

function Test-TcpOpen([int]$Port, [int]$TimeoutMs = 200) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $ar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    $ok = $ar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
    if (-not $ok) { $client.Close(); return $false }
    $client.EndConnect($ar)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Test-ServerHealthy([int]$Port, [int]$TimeoutMs = 800) {
  if (-not (Test-TcpOpen $Port 200)) { return $false }
  try {
    $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/")
    $req.Proxy = $null
    $req.Timeout = $TimeoutMs
    $req.ReadWriteTimeout = $TimeoutMs
    $req.Method = 'GET'
    $resp = $req.GetResponse()
    $code = [int]$resp.StatusCode
    $resp.Close()
    return ($code -ge 200 -and $code -lt 500)
  } catch {
    return $false
  }
}

function Test-IsSnackOpsCommand([string]$CommandLine) {
  if (-not $CommandLine) { return $false }
  $cmd = $CommandLine.ToLowerInvariant().Replace('/', '\')
  if (-not $cmd.Contains($RootKey)) { return $false }
  return (
    $cmd.Contains('\next\dist\bin\next') -or
    $cmd.Contains('\next\dist\server\lib\start-server.js') -or
    ($cmd.Contains('\node_modules\next\') -and $cmd.Contains('next')) -or
    $cmd.Contains('scripts\dev.mjs') -or
    $cmd.Contains('scripts/dev.mjs') -or
    $cmd.Contains(' next ') -or
    $cmd.EndsWith(' next')
  )
}

function Get-PortFromCommandLine([string]$CommandLine) {
  if ($CommandLine -match '(?i)(?:-p|--port)\s+(\d{2,5})') { return [int]$Matches[1] }
  return $null
}

function Find-RunningSnackOpsPort {
  Write-Host '  Checking existing instance...'

  # Fast path: marker port
  if (Test-Path -LiteralPath $Marker) {
    $raw = (Get-Content -LiteralPath $Marker -ErrorAction SilentlyContinue | Select-Object -First 1)
    $marked = 0
    if ([int]::TryParse("$raw", [ref]$marked) -and $marked -ge $PortStart -and $marked -le $PortEnd) {
      if (Test-ServerHealthy $marked 600) { return $marked }
    }
  }

  # Process path (only if marker missed)
  $candidates = New-Object 'System.Collections.Generic.HashSet[int]'
  $procs = @(
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
      Where-Object { Test-IsSnackOpsCommand ([string]$_.CommandLine) }
  )
  foreach ($proc in $procs) {
    $fromCmd = Get-PortFromCommandLine ([string]$proc.CommandLine)
    if ($fromCmd) { [void]$candidates.Add($fromCmd) }
    try {
      $conns = Get-NetTCPConnection -OwningProcess ([int]$proc.ProcessId) -State Listen -ErrorAction SilentlyContinue
      foreach ($c in $conns) {
        $p = [int]$c.LocalPort
        if ($p -ge $PortStart -and $p -le $PortEnd) { [void]$candidates.Add($p) }
      }
    } catch {}
  }

  foreach ($port in ($candidates | Sort-Object)) {
    if (Test-ServerHealthy $port 600) { return $port }
  }
  return $null
}

function Find-FreePort($ListeningSet) {
  for ($p = $PortStart; $p -le $PortEnd; $p++) {
    if (-not $ListeningSet.Contains($p)) { return $p }
  }
  return $null
}

function Open-Url([string]$Url) {
  try { Start-Process $Url; return } catch {}
  cmd.exe /c "start `"`" `"$Url`""
}

Write-Host ("Project: {0}" -f $Root)

$runningPort = Find-RunningSnackOpsPort
if ($runningPort) {
  $Url = "http://localhost:$runningPort"
  Set-Content -LiteralPath $Marker -Value "$runningPort" -Encoding ascii
  Write-Host ("Already running. Opening {0}" -f $Url)
  Open-Url $Url
  Start-Sleep -Milliseconds 800
  exit 0
}

$listening = Get-ListeningPortSet
$Port = Find-FreePort $listening
if (-not $Port) {
  Write-Host ("No free port from {0}-{1}." -f $PortStart, $PortEnd)
  Read-Host 'Press Enter to exit'
  exit 1
}

if ($Port -ne $PortStart) {
  Write-Host ("Port {0} busy, using {1}." -f $PortStart, $Port)
} else {
  Write-Host ("Using port {0}." -f $Port)
}

$Url = "http://localhost:$Port"
$env:DEPLOY_RUN_PORT = "$Port"
Set-Content -LiteralPath $Marker -Value "$Port" -Encoding ascii

if (-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules'))) {
  Write-Host 'Installing dependencies...'
  if (Get-Command pnpm -ErrorAction SilentlyContinue) { pnpm install } else { npm install }
}

# Fast opener: TCP first (cheap), then open browser; poll every 250ms
$openCmd = @"
`$port = $Port
`$url = '$Url'
for (`$i = 0; `$i -lt 120; `$i++) {
  try {
    `$c = New-Object System.Net.Sockets.TcpClient
    `$ar = `$c.BeginConnect('127.0.0.1', `$port, `$null, `$null)
    if (`$ar.AsyncWaitHandle.WaitOne(150, `$false)) {
      `$c.EndConnect(`$ar)
      `$c.Close()
      Start-Sleep -Milliseconds 400
      Start-Process `$url
      exit 0
    }
    `$c.Close()
  } catch {}
  Start-Sleep -Milliseconds 250
}
"@
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $openCmd
) | Out-Null

Write-Host ("Starting {0}" -f $Url)
Write-Host 'Close this window to stop.'
Write-Host ''

if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  pnpm run dev
} else {
  npm run dev
}

Write-Host ''
Write-Host 'Server stopped.'
if ($LASTEXITCODE -ne 0) { Read-Host 'Press Enter to exit' }
exit 0
