# 새김 MES 매일 백업: 실행 중인 서버의 /api/backup(JSON, 첨부·성적서 포함)을 받아 구글 드라이브 폴더에 저장합니다.
# 백업에는 거래처 계좌와 첨부 원본이 암호화되지 않은 상태로 들어 있습니다. 백업 폴더를 다른 사람과 공유하지 마세요.
param(
  [int]$Port = $(if ($env:MES_PORT) { [int]$env:MES_PORT } else { 8792 }),
  [string]$Target = 'G:\내 드라이브\saekim-mes-backup',
  [int]$KeepDays = 60
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Target | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$file = Join-Path $Target "mes-backup-$stamp.json"
$tmp = "$file.part"
Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/api/backup" -OutFile $tmp -TimeoutSec 120
# 서버가 오류 JSON을 돌려준 경우 백업으로 남기지 않습니다.
$head = Get-Content -LiteralPath $tmp -TotalCount 1 -Encoding UTF8
if ($head -match '"error"') { Remove-Item -LiteralPath $tmp; throw "백업 실패: $head" }
Move-Item -LiteralPath $tmp -Destination $file -Force
Get-ChildItem -LiteralPath $Target -Filter 'mes-backup-*.json' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } |
  Remove-Item
Write-Output "백업 완료: $file"
