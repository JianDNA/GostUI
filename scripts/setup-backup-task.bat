@echo off
echo Setting up database backup task...

:: 获取脚本所在目录的绝对路径
set SCRIPT_DIR=%~dp0
set BACKUP_SCRIPT=%SCRIPT_DIR%backup.js

:: 创建计划任务
schtasks /create /tn "GostManagerBackup" /tr "node %BACKUP_SCRIPT%" /sc daily /st 00:00 /ru SYSTEM

if %ERRORLEVEL% EQU 0 (
    echo Backup task created successfully!
    echo Task will run daily at midnight
) else (
    echo Failed to create backup task!
    echo Please run this script as administrator
)

pause 