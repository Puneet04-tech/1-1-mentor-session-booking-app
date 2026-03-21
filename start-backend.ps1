#!/usr/bin/env pwsh

Write-Host "🧹 Cleaning up old processes..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host "⏳ Waiting 2 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

Write-Host "`n🚀 Starting Backend Server..." -ForegroundColor Cyan
Write-Host "=" * 80
Write-Host "Watch this window for logs!" -ForegroundColor Green
Write-Host "=" * 80
Write-Host ""

cd d:\1-1-mentor-session-booking-app\backend
npm run dev 2>&1 | Tee-Object -FilePath backend-logs.txt

Write-Host "`n✅ Logs saved to: backend-logs.txt" -ForegroundColor Green
