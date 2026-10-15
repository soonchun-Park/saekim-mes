# 새김 MES 시작: 서버를 127.0.0.1에서 실행하고, 설정돼 있으면 Cloudflare 터널도 함께 실행합니다.
# ops\mes.env 파일(선택)에 아래 값을 둡니다.
#   MES_PORT=8792
#   MES_PUBLIC_HOSTS=mes.example.com
#   CLOUDFLARE_TUNNEL_TOKEN=...   (Cloudflare 터널 화면에서 받은 토큰. git에 올리지 않습니다)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $PSScriptRoot 'mes.env'
if (Test-Path -LiteralPath $envFile) {
  foreach ($line in Get-Content -LiteralPath $envFile -Encoding UTF8) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
  }
}
if (-not $env:MES_PORT) { $env:MES_PORT = '8792' }
$env:PORT = $env:MES_PORT
$logDir = Join-Path $root 'data\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$listening = Get-NetTCPConnection -LocalPort ([int]$env:MES_PORT) -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Start-Process -WindowStyle Hidden -WorkingDirectory $root -FilePath 'node' -ArgumentList 'qa/integrated-server.js' `
    -RedirectStandardOutput (Join-Path $logDir 'server.out.log') -RedirectStandardError (Join-Path $logDir 'server.err.log')
}

if ($env:CLOUDFLARE_TUNNEL_TOKEN -and -not (Get-Process -Name cloudflared -ErrorAction SilentlyContinue)) {
  $cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
  if (-not $cf) { $cf = 'C:\Program Files (x86)\cloudflared\cloudflared.exe' }
  Start-Process -WindowStyle Hidden -FilePath $cf -ArgumentList @('tunnel', '--no-autoupdate', 'run', '--token', $env:CLOUDFLARE_TUNNEL_TOKEN) `
    -RedirectStandardOutput (Join-Path $logDir 'tunnel.out.log') -RedirectStandardError (Join-Path $logDir 'tunnel.err.log')
}
