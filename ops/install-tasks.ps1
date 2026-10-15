# Windows 작업 스케줄러에 두 작업을 등록합니다(현재 사용자, 관리자 권한 불필요).
#   SaekimMES-Start : 로그인할 때 서버(와 터널) 시작
#   SaekimMES-Backup: 매일 12:30, 18:30 구글 드라이브로 백업
# 제거: Unregister-ScheduledTask -TaskName SaekimMES-Start,SaekimMES-Backup -Confirm:$false
$ErrorActionPreference = 'Stop'
$ps = 'powershell.exe'
$start = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSScriptRoot\start-mes.ps1`""
$backup = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSScriptRoot\backup-mes.ps1`""
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'SaekimMES-Start' -Action $start -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME) -Settings $settings -Force | Out-Null
Register-ScheduledTask -TaskName 'SaekimMES-Backup' -Action $backup -Trigger @((New-ScheduledTaskTrigger -Daily -At '12:30'), (New-ScheduledTaskTrigger -Daily -At '18:30')) -Settings $settings -Force | Out-Null
Write-Output '등록 완료: SaekimMES-Start, SaekimMES-Backup'
