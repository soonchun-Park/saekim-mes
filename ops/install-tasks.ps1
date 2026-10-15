# Windows 작업 스케줄러에 세 작업을 등록합니다(현재 사용자, 관리자 권한 불필요).
#   SaekimMES-Start : 로그인할 때 서버(와 터널) 시작
#   SaekimMES-Backup: 매일 12:30, 18:30 구글 드라이브로 백업
#   SaekimMES-View  : 30분마다 외부 조회용 요약 자료를 구글 드라이브로 내보내기
# 제거: Unregister-ScheduledTask -TaskName SaekimMES-Start,SaekimMES-Backup,SaekimMES-View -Confirm:$false
$ErrorActionPreference = 'Stop'
# conhost --headless: 실행할 때 검은 창이 잠깐 뜨지 않게 합니다(Windows 11).
$ps = 'conhost.exe'
$start = New-ScheduledTaskAction -Execute $ps -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSScriptRoot\start-mes.ps1`""
$backup = New-ScheduledTaskAction -Execute $ps -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSScriptRoot\backup-mes.ps1`""
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'SaekimMES-Start' -Action $start -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -Settings $settings -Force | Out-Null
Register-ScheduledTask -TaskName 'SaekimMES-Backup' -Action $backup -Trigger @((New-ScheduledTaskTrigger -Daily -At '12:30'), (New-ScheduledTaskTrigger -Daily -At '18:30')) -Settings $settings -Force | Out-Null
# 외부 조회용 요약 자료(mes-view.json)를 30분마다 구글 드라이브로 내보냅니다.
$node = (Get-Command node -ErrorAction Stop).Source
$root = Split-Path -Parent $PSScriptRoot
$view = New-ScheduledTaskAction -Execute $ps -Argument "--headless `"$node`" `"$PSScriptRoot\export-view.js`"" -WorkingDirectory $root
$every30 = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'SaekimMES-View' -Action $view -Trigger $every30 -Settings $settings -Force | Out-Null
Write-Output '등록 완료: SaekimMES-Start, SaekimMES-Backup, SaekimMES-View'
