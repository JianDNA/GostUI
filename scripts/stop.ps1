# Gost 管理系统 Windows 停止脚本
# PowerShell 脚本，用于停止正在运行的 Gost 管理系统服务

param(
    [switch]$Force,
    [switch]$Help
)

# 显示帮助信息
if ($Help) {
    Write-Host @"
Gost 管理系统 Windows 停止脚本

用法:
    .\stop.ps1 [参数]

参数:
    -Force      强制停止所有相关进程
    -Help       显示此帮助信息

示例:
    .\stop.ps1          # 正常停止服务
    .\stop.ps1 -Force   # 强制停止所有进程

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

# 显示横幅
function Show-Banner {
    Write-ColorOutput @"
==================================================
    Gost 管理系统 Windows 停止脚本
==================================================
"@ "Cyan"
}

# 停止 PM2 管理的应用
function Stop-PM2Application {
    Write-Step "停止 PM2 管理的应用..."
    
    try {
        # 检查 PM2 是否安装
        $pm2Version = pm2 --version 2>$null
        if (!$pm2Version) {
            Write-Info "PM2 未安装，跳过 PM2 应用停止"
            return
        }
        
        # 获取 PM2 应用列表
        $pm2List = pm2 jlist | ConvertFrom-Json 2>$null
        $gostApp = $pm2List | Where-Object { $_.name -eq "gost-manager" }
        
        if ($gostApp) {
            Write-Info "停止 PM2 应用 (gost-manager)..."
            pm2 stop gost-manager 2>$null
            pm2 delete gost-manager 2>$null
            Write-Success "PM2 应用已停止"
        } else {
            Write-Info "未找到 PM2 应用 (gost-manager)"
        }
    } catch {
        Write-Warn "停止 PM2 应用时出错: $($_.Exception.Message)"
    }
}

# 停止 Node.js 进程
function Stop-NodeJSProcesses {
    Write-Step "停止 Node.js 进程..."
    
    try {
        # 查找相关的 Node.js 进程
        $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
            $_.CommandLine -like "*app.js*" -or $_.CommandLine -like "*gost-manager*"
        }
        
        if ($nodeProcesses) {
            Write-Info "找到 Node.js 进程: $($nodeProcesses.Count) 个"
            
            foreach ($process in $nodeProcesses) {
                Write-Info "停止进程: $($process.Name) (PID: $($process.Id))"
                
                if ($Force) {
                    $process.Kill()
                } else {
                    $process.CloseMainWindow()
                    Start-Sleep -Seconds 2
                    if (!$process.HasExited) {
                        $process.Kill()
                    }
                }
            }
            
            Write-Success "Node.js 进程已停止"
        } else {
            Write-Info "未找到相关的 Node.js 进程"
        }
    } catch {
        Write-Warn "停止 Node.js 进程时出错: $($_.Exception.Message)"
    }
}

# 停止 Gost 进程
function Stop-GostProcesses {
    Write-Step "停止 Gost 进程..."
    
    try {
        # 查找 Gost 进程
        $gostProcesses = Get-Process -Name "gost*" -ErrorAction SilentlyContinue
        
        if ($gostProcesses) {
            Write-Info "找到 Gost 进程: $($gostProcesses.Count) 个"
            
            foreach ($process in $gostProcesses) {
                Write-Info "停止进程: $($process.Name) (PID: $($process.Id))"
                
                if ($Force) {
                    $process.Kill()
                } else {
                    $process.CloseMainWindow()
                    Start-Sleep -Seconds 2
                    if (!$process.HasExited) {
                        $process.Kill()
                    }
                }
            }
            
            Write-Success "Gost 进程已停止"
        } else {
            Write-Info "未找到 Gost 进程"
        }
    } catch {
        Write-Warn "停止 Gost 进程时出错: $($_.Exception.Message)"
    }
}

# 检查端口占用
function Test-PortUsage {
    Write-Step "检查端口占用..."
    
    $ports = @(3000, 80, 443)
    
    foreach ($port in $ports) {
        try {
            $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
            if ($connection) {
                $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
                Write-Warn "端口 $port 仍被占用: $($process.Name) (PID: $($process.Id))"
            } else {
                Write-Info "端口 $port 已释放"
            }
        } catch {
            Write-Info "端口 $port 已释放"
        }
    }
}

# 显示停止状态
function Show-Status {
    Write-Step "检查服务状态..."
    
    Write-Host ""
    Write-Host "=== 服务状态检查 ==="
    
    # 检查 PM2 状态
    try {
        $pm2Version = pm2 --version 2>$null
        if ($pm2Version) {
            Write-Host "PM2 应用状态:"
            $pm2List = pm2 list 2>$null
            if ($pm2List -match "gost-manager") {
                Write-Host $pm2List
            } else {
                Write-Host "  无 PM2 应用运行"
            }
        }
    } catch {
        Write-Host "  PM2 未安装或无法访问"
    }
    
    # 检查进程状态
    Write-Host ""
    Write-Host "相关进程:"
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
    $gostProcesses = Get-Process -Name "gost*" -ErrorAction SilentlyContinue
    
    if ($nodeProcesses -or $gostProcesses) {
        $allProcesses = @()
        if ($nodeProcesses) { $allProcesses += $nodeProcesses }
        if ($gostProcesses) { $allProcesses += $gostProcesses }
        
        $allProcesses | Format-Table Name, Id, CPU, WorkingSet -AutoSize
    } else {
        Write-Host "  无相关进程运行"
    }
    
    # 检查端口状态
    Write-Host ""
    Write-Host "端口监听状态:"
    $ports = @(3000, 80, 443)
    $hasListening = $false
    
    foreach ($port in $ports) {
        try {
            $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            if ($connection) {
                $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
                Write-Host "  端口 $port : $($process.Name) (PID: $($process.Id))"
                $hasListening = $true
            }
        } catch {}
    }
    
    if (!$hasListening) {
        Write-Host "  无相关端口监听"
    }
    
    Write-Host ""
}

# 主函数
function Main {
    try {
        Show-Banner
        
        Write-Info "开始停止 Gost 管理系统..."
        Write-Host ""
        
        Stop-PM2Application
        Stop-NodeJSProcesses
        Stop-GostProcesses
        
        Write-Host ""
        Test-PortUsage
        Show-Status
        
        Write-Host ""
        Write-Success "Gost 管理系统停止完成！"
        
        if ($Force) {
            Write-Warn "使用了强制停止模式"
        }
        
        Write-Host ""
        Write-Info "如需重新启动，请运行相应的启动脚本"
        Write-Info "如需完全卸载，请运行: .\uninstall.ps1"
        
    } catch {
        Write-Error "停止过程中发生错误: $($_.Exception.Message)"
        exit 1
    }
}

# 运行主函数
Main
