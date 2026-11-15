$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
$dataDir = Join-Path $projectDir '.local/mongo'
New-Item -ItemType Directory -Force $dataDir | Out-Null
$mongoExe = Get-ChildItem 'C:\Program Files\MongoDB\Server\*\bin\mongod.exe' | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $mongoExe) { throw 'Install MongoDB Community Server, or configure a MongoDB Atlas replica-set URI in .env.' }
if (-not (Test-NetConnection 127.0.0.1 -Port 27018 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
  # Never delete MongoDB lock files or silently select a different database directory.
  # MongoDB performs its own recovery and rejects a directory owned by another process.
  Start-Process -FilePath $mongoExe.FullName -ArgumentList @('--dbpath', ('"' + $dataDir + '"'), '--port', '27018', '--bind_ip', '127.0.0.1', '--replSet', 'routerelay', '--logpath', ('"' + (Join-Path $dataDir 'mongod.log') + '"')) -WindowStyle Hidden
}
node (Join-Path $PSScriptRoot 'init-replica.js')
