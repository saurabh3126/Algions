$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
& (Join-Path $PSScriptRoot 'start-mongo.ps1')
if ($LASTEXITCODE -ne 0) { throw 'MongoDB startup failed' }
npm.cmd start
