# Gost 管理系统 Windows 卸载脚本
# PowerShell 脚本，用于完全卸载 Gost 管理系统及其相关组件

param(
    [string]$InstallPath = "C:\gost-manager",
    [switch]$KeepData,
    [switch]$KeepDeps,
    [switch]$Force,
    [switch]$Help
)

# 显示帮助信息
if ($Help) {
    Write-Host @"
Gost 管理系统 Windows 卸载脚本

用法:
    .\uninstall.ps1 [参数]

参数:
    -InstallPath <路径>     安装路径 (默认: C:\gost-manager)
    -KeepData               保留用户数据和配置文件
    -KeepDeps               保留依赖包 (Node.js, PM2)
    -Force                  强制卸载，不询问确认
    -Help                   显示此帮助信息

示例:
    .\uninstall.ps1                                    # 完全卸载 (会询问确认)
    .\uninstall.ps1 -KeepData                          # 卸载但保留数据
    .\uninstall.ps1 -KeepDeps                          # 卸载但保留依赖包
    .\uninstall.ps1 -Force                             # 强制卸载，不询问
    .\uninstall.ps1 -InstallPath "D:\apps\gost-manager" # 指定安装路径

警告: 卸载操作不可逆，请确保已备份重要数据！

"@
    exit 0
}

# 颜色函数
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Info {
    param([string]$Message)
    Write-ColorOutput "[INFO] $Message" "Green"
}

function Write-Warn {
    param([string]$Message)
    Write-ColorOutput "[WARN] $Message" "Yellow"
}

function Write-Error {
    param([string]$Message)
    Write-ColorOutput "[ERROR] $Message" "Red"
}

function Write-Step {
    param([string]$Message)
    Write-ColorOutput "[STEP] $Message" "Cyan"
}

function Write-Success {
    param([string]$Message)
    Write-ColorOutput "[SUCCESS] $Message" "Green"
}

function Write-Danger {
    param([string]$Message)
    Write-ColorOutput "[DANGER] $Message" "Red"
}

# 显示横幅
function Show-Banner {
    Write-ColorOutput @"
==================================================
    Gost 管理系统 Windows 卸载脚本
    ⚠️  警告: 此操作将删除所有相关文件！
==================================================
"@ "Red"
}

# 检查管理员权限
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 确认卸载
function Confirm-Uninstall {
    if ($Force) {
        Write-Warn "强制卸载模式，跳过确认"
        return
    }
    
    Write-Host ""
    Write-Danger "⚠️  警告: 即将卸载 Gost 管理系统！"
    Write-Host ""
    Write-Host "将要删除的内容:"
    Write-Host "  📁 应用目录: $InstallPath"
    Write-Host "  🔧 PM2 应用: gost-manager"
    Write-Host "  🔥 防火墙规则: Gost Manager 相关规则"
    Write-Host "  🚀 开机自启: PM2 startup 配置"
    
    if (!$KeepData) {
        Write-Host "  💾 用户数据: 数据库和配置文件"
    } else {
        Write-Host "  💾 用户数据: 将保留"
    }
    
    if (!$KeepDeps) {
        Write-Host "  📦 依赖包: PM2 (将询问是否删除)"
    } else {
        Write-Host "  📦 依赖包: 将保留"
    }
    
    Write-Host ""
    Write-Danger "此操作不可逆！请确保已备份重要数据！"
    Write-Host ""
    
    $confirmation = Read-Host "确定要继续卸载吗? 请输入 'YES' 确认"
    if ($confirmation -ne "YES") {
        Write-Info "卸载已取消"
        exit 0
    }
    
    Write-Host ""
    Write-Warn "开始卸载..."
    Start-Sleep -Seconds 2
}

# 停止所有服务
function Stop-Services {
    Write-Step "停止所有相关服务..."
    
    # 运行停止脚本
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $stopScript = Join-Path $scriptDir "stop.ps1"
    
    if (Test-Path $stopScript) {
        Write-Info "运行停止脚本..."
        & $stopScript -Force
    } else {
        Write-Warn "未找到停止脚本，手动停止服务..."
        
        # 手动停止 PM2 应用
        try {
            pm2 stop gost-manager 2>$null
            pm2 delete gost-manager 2>$null
        } catch {}
        
        # 强制终止相关进程
        Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
            $_.CommandLine -like "*app.js*" -or $_.CommandLine -like "*gost-manager*"
        } | Stop-Process -Force -ErrorAction SilentlyContinue
        
        Get-Process -Name "gost*" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    }
    
    Write-Success "服务停止完成"
}

# 删除 PM2 配置
function Remove-PM2Config {
    Write-Step "删除 PM2 配置..."
    
    try {
        # 检查 PM2 是否安装
        $pm2Version = pm2 --version 2>$null
        if (!$pm2Version) {
            Write-Info "PM2 未安装，跳过"
            return
        }
        
        # 删除 PM2 startup 配置
        pm2 unstartup 2>$null
        
        # 删除保存的 PM2 配置
        $pm2Dir = "$env:USERPROFILE\.pm2"
        if (Test-Path "$pm2Dir\dump.pm2") {
            Remove-Item "$pm2Dir\dump.pm2" -Force -ErrorAction SilentlyContinue
        }
        
        Write-Success "PM2 配置已删除"
    } catch {
        Write-Warn "删除 PM2 配置时出错: $($_.Exception.Message)"
    }
}

# 删除防火墙规则
function Remove-FirewallRules {
    Write-Step "删除防火墙规则..."
    
    try {
        # 删除 Gost Manager 相关的防火墙规则
        $rules = Get-NetFirewallRule -DisplayName "*Gost Manager*" -ErrorAction SilentlyContinue
        
        if ($rules) {
            foreach ($rule in $rules) {
                Remove-NetFirewallRule -DisplayName $rule.DisplayName -ErrorAction SilentlyContinue
                Write-Info "删除防火墙规则: $($rule.DisplayName)"
            }
            Write-Success "防火墙规则已删除"
        } else {
            Write-Info "未找到相关防火墙规则"
        }
    } catch {
        Write-Warn "删除防火墙规则时出错: $($_.Exception.Message)"
    }
}

# 删除应用文件
function Remove-ApplicationFiles {
    Write-Step "删除应用文件..."
    
    if (Test-Path $InstallPath) {
        if ($KeepData) {
            Write-Info "保留数据模式，备份用户数据..."
            
            # 创建备份目录
            $backupDir = "$env:TEMP\gost-manager-backup-$(Get-Date -Format 'yyyyMMdd_HHmmss')"
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
            
            # 备份数据库
            $dbPath = "$InstallPath\data\database.sqlite"
            if (Test-Path $dbPath) {
                Copy-Item $dbPath "$backupDir\database.sqlite" -Force
                Write-Info "数据库已备份到: $backupDir\database.sqlite"
            }
            
            # 备份配置
            $configPath = "$InstallPath\config\gost-config.json"
            if (Test-Path $configPath) {
                Copy-Item $configPath "$backupDir\gost-config.json" -Force
                Write-Info "Gost 配置已备份到: $backupDir\gost-config.json"
            }
            
            $envPath = "$InstallPath\app\backend\.env"
            if (Test-Path $envPath) {
                Copy-Item $envPath "$backupDir\.env" -Force
                Write-Info "环境配置已备份到: $backupDir\.env"
            }
            
            Write-Success "数据备份完成: $backupDir"
        }
        
        # 删除应用目录
        Write-Info "删除应用目录: $InstallPath"
        Remove-Item $InstallPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Success "应用文件已删除"
    } else {
        Write-Info "应用目录不存在，跳过"
    }
}

# 询问是否删除依赖包
function Remove-Dependencies {
    if ($KeepDeps) {
        Write-Info "保留依赖包模式，跳过依赖包删除"
        return
    }
    
    Write-Step "处理依赖包..."
    
    Write-Host ""
    Write-Warn "以下依赖包可能被其他应用使用："
    
    # 检查 PM2
    try {
        $pm2Version = pm2 --version 2>$null
        if ($pm2Version) {
            Write-Host "  📦 PM2 (进程管理器)"
            if (!$Force) {
                $reply = Read-Host "是否删除 PM2? [y/N]"
                if ($reply -eq "y" -or $reply -eq "Y") {
                    npm uninstall -g pm2 2>$null
                    Write-Info "PM2 已删除"
                }
            }
        }
    } catch {}
    
    # Node.js 通常不建议删除，因为可能被其他应用使用
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-Host "  📦 Node.js (JavaScript 运行时)"
            Write-Warn "Node.js 可能被其他应用使用，建议保留"
            if (!$Force) {
                $reply = Read-Host "确定要删除 Node.js 吗? [y/N]"
                if ($reply -eq "y" -or $reply -eq "Y") {
                    Write-Warn "请手动通过控制面板卸载 Node.js"
                }
            }
        }
    } catch {}
    
    # Chocolatey 通常保留
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Host "  📦 Chocolatey (包管理器)"
        Write-Info "Chocolatey 建议保留，可能被其他应用使用"
    }
}

# 清理注册表 (可选)
function Clear-Registry {
    Write-Step "清理注册表..."
    
    try {
        # 清理可能的注册表项
        $regPaths = @(
            "HKCU:\Software\gost-manager",
            "HKLM:\Software\gost-manager"
        )
        
        foreach ($regPath in $regPaths) {
            if (Test-Path $regPath) {
                Remove-Item $regPath -Recurse -Force -ErrorAction SilentlyContinue
                Write-Info "删除注册表项: $regPath"
            }
        }
        
        Write-Success "注册表清理完成"
    } catch {
        Write-Warn "清理注册表时出错: $($_.Exception.Message)"
    }
}

# 显示卸载结果
function Show-UninstallResult {
    Write-Host ""
    Write-ColorOutput @"
==================================================
🗑️  Gost 管理系统卸载完成！
==================================================
"@ "Green"
    
    Write-Host "已删除的内容:"
    Write-Host "  ✅ 应用文件和目录"
    Write-Host "  ✅ PM2 配置和进程"
    Write-Host "  ✅ 防火墙规则"
    Write-Host "  ✅ 开机自启配置"
    Write-Host "  ✅ 注册表项"
    
    if ($KeepData) {
        Write-Host ""
        Write-Host "保留的数据:"
        Write-Host "  💾 用户数据已备份到 $env:TEMP\gost-manager-backup-*"
    }
    
    if ($KeepDeps) {
        Write-Host ""
        Write-Host "保留的依赖:"
        Write-Host "  📦 Node.js, PM2 等依赖包"
    }
    
    Write-Host ""
    Write-Success "卸载完成！感谢使用 Gost 管理系统。"
    
    if ($KeepData) {
        Write-Host ""
        Write-Info "如需重新安装，可以恢复备份的数据文件"
    }
}

# 主函数
function Main {
    try {
        Show-Banner
        
        if (!(Test-Administrator)) {
            Write-Error "此脚本需要管理员权限运行"
            Write-Info "请右键点击 PowerShell 并选择 '以管理员身份运行'"
            exit 1
        }
        
        Confirm-Uninstall
        
        Write-Host ""
        Write-Info "开始卸载 Gost 管理系统..."
        
        Stop-Services
        Remove-PM2Config
        Remove-FirewallRules
        Remove-ApplicationFiles
        Remove-Dependencies
        Clear-Registry
        
        Show-UninstallResult
        
    } catch {
        Write-Error "卸载过程中发生错误: $($_.Exception.Message)"
        Write-Error "请检查错误信息并重试"
        exit 1
    }
}

# 运行主函数
Main
