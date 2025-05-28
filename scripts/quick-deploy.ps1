# Gost 管理系统 Windows 一键部署脚本
# PowerShell 脚本，支持 Windows 10/11 和 Windows Server

param(
    [string]$InstallPath = "C:\gost-manager",
    [string]$RepoUrl = "https://github.com/your-repo/gost-manager.git",
    [int]$Port = 3000,
    [switch]$SkipNodeInstall,
    [switch]$Help
)

# 显示帮助信息
if ($Help) {
    Write-Host @"
Gost 管理系统 Windows 一键部署脚本

用法:
    .\quick-deploy.ps1 [参数]

参数:
    -InstallPath <路径>     安装路径 (默认: C:\gost-manager)
    -RepoUrl <URL>          Git 仓库地址
    -Port <端口>            应用端口 (默认: 3000)
    -SkipNodeInstall        跳过 Node.js 安装
    -Help                   显示此帮助信息

示例:
    .\quick-deploy.ps1
    .\quick-deploy.ps1 -InstallPath "D:\apps\gost-manager" -Port 8080
    .\quick-deploy.ps1 -SkipNodeInstall

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
    Gost 管理系统 Windows 一键部署脚本
    支持 Windows 10/11 和 Windows Server
==================================================
"@ "Cyan"
}

# 检查管理员权限
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 检查并安装 Chocolatey
function Install-Chocolatey {
    if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
        Write-Step "安装 Chocolatey 包管理器..."
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        Write-Success "Chocolatey 安装完成"
    } else {
        Write-Info "Chocolatey 已安装"
    }
}

# 检查并安装 Node.js
function Install-NodeJS {
    if ($SkipNodeInstall) {
        Write-Info "跳过 Node.js 安装"
        return
    }

    Write-Step "检查 Node.js..."
    
    $nodeVersion = $null
    try {
        $nodeVersion = node --version 2>$null
    } catch {}
    
    if ($nodeVersion) {
        $version = $nodeVersion.TrimStart('v').Split('.')[0]
        if ([int]$version -ge 16) {
            Write-Info "Node.js 已安装 (版本: $nodeVersion)"
            return
        }
    }
    
    Write-Step "安装 Node.js..."
    choco install nodejs -y
    
    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Success "Node.js 安装完成"
}

# 安装 PM2
function Install-PM2 {
    Write-Step "检查 PM2..."
    
    try {
        $pm2Version = pm2 --version 2>$null
        if ($pm2Version) {
            Write-Info "PM2 已安装 (版本: $pm2Version)"
            return
        }
    } catch {}
    
    Write-Step "安装 PM2..."
    npm install -g pm2
    npm install -g pm2-windows-startup
    
    Write-Success "PM2 安装完成"
}

# 安装 Git
function Install-Git {
    Write-Step "检查 Git..."
    
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Info "Git 已安装"
        return
    }
    
    Write-Step "安装 Git..."
    choco install git -y
    
    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    Write-Success "Git 安装完成"
}

# 创建目录结构
function New-DirectoryStructure {
    Write-Step "创建目录结构..."
    
    $directories = @(
        $InstallPath,
        "$InstallPath\app",
        "$InstallPath\logs",
        "$InstallPath\config",
        "$InstallPath\data"
    )
    
    foreach ($dir in $directories) {
        if (!(Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Info "创建目录: $dir"
        }
    }
    
    Write-Success "目录结构创建完成"
}

# 克隆应用代码
function Get-ApplicationCode {
    Write-Step "下载应用代码..."
    
    $appPath = "$InstallPath\app"
    
    if (Test-Path "$appPath\.git") {
        Write-Info "应用代码已存在，更新中..."
        Set-Location $appPath
        git pull origin main
    } else {
        Write-Info "克隆应用代码..."
        Set-Location $InstallPath
        git clone $RepoUrl app
    }
    
    Write-Success "应用代码下载完成"
}

# 安装应用依赖
function Install-Dependencies {
    Write-Step "安装应用依赖..."
    
    # 安装后端依赖
    Set-Location "$InstallPath\app\backend"
    Write-Info "安装后端依赖..."
    npm install --production
    
    # 安装前端依赖并构建
    Set-Location "$InstallPath\app\frontend"
    Write-Info "安装前端依赖..."
    npm install
    Write-Info "构建前端..."
    npm run build
    
    Write-Success "依赖安装完成"
}

# 设置 Gost 二进制文件
function Set-GostBinary {
    Write-Step "设置 Gost 二进制文件..."
    
    $gostWindows = "$InstallPath\app\backend\assets\gost\gost-windows.exe"
    $gostBinDir = "$InstallPath\app\backend\bin"
    
    if (Test-Path $gostWindows) {
        if (!(Test-Path $gostBinDir)) {
            New-Item -ItemType Directory -Path $gostBinDir -Force | Out-Null
        }
        Copy-Item $gostWindows "$gostBinDir\gost.exe" -Force
        Write-Success "Gost 二进制文件设置完成"
    } else {
        Write-Warn "未找到 Gost 二进制文件: $gostWindows"
        Write-Info "系统将在运行时自动处理 Gost 二进制文件"
    }
}

# 创建环境配置
function New-EnvironmentConfig {
    Write-Step "创建环境配置..."
    
    # 生成随机 JWT 密钥
    $jwtSecret = -join ((1..64) | ForEach {Get-Random -input ([char[]]([char]'a'..[char]'z') + ([char]'A'..[char]'Z') + ([char]'0'..[char]'9'))})
    $productionToken = -join ((1..32) | ForEach {Get-Random -input ([char[]]([char]'a'..[char]'z') + ([char]'A'..[char]'Z') + ([char]'0'..[char]'9'))})
    
    $envContent = @"
# 生产环境配置
NODE_ENV=production
PORT=$Port

# 数据库配置
DATABASE_PATH=$($InstallPath.Replace('\', '\\'))\\data\\database.sqlite

# JWT 配置
JWT_SECRET=$jwtSecret

# Gost 配置
GOST_BINARY_PATH=$($InstallPath.Replace('\', '\\'))\\app\\backend\\bin\\gost.exe
GOST_CONFIG_PATH=$($InstallPath.Replace('\', '\\'))\\config\\gost-config.json

# 日志配置
LOG_LEVEL=info
LOG_FILE=$($InstallPath.Replace('\', '\\'))\\logs\\app.log

# 生产环境特殊授权令牌 (可选)
PRODUCTION_AUTH_TOKEN=$productionToken
"@

    $envPath = "$InstallPath\app\backend\.env"
    $envContent | Out-File -FilePath $envPath -Encoding UTF8
    
    Write-Success "环境配置创建完成"
}

# 创建 PM2 配置
function New-PM2Config {
    Write-Step "创建 PM2 配置..."
    
    $pm2Config = @"
module.exports = {
  apps: [
    {
      name: 'gost-manager',
      script: './backend/app.js',
      cwd: '$($InstallPath.Replace('\', '/').Replace('C:', ''))/app',
      env: {
        NODE_ENV: 'production',
        PORT: $Port
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      error_file: '$($InstallPath.Replace('\', '/').Replace('C:', ''))/logs/pm2-error.log',
      out_file: '$($InstallPath.Replace('\', '/').Replace('C:', ''))/logs/pm2-out.log',
      log_file: '$($InstallPath.Replace('\', '/').Replace('C:', ''))/logs/pm2.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
"@

    $configPath = "$InstallPath\app\ecosystem.config.js"
    $pm2Config | Out-File -FilePath $configPath -Encoding UTF8
    
    Write-Success "PM2 配置创建完成"
}

# 初始化数据库
function Initialize-Database {
    Write-Step "初始化数据库..."
    
    Set-Location "$InstallPath\app\backend"
    $env:NODE_ENV = "production"
    npm run migrate
    
    Write-Success "数据库初始化完成"
}

# 启动应用
function Start-Application {
    Write-Step "启动应用..."
    
    Set-Location "$InstallPath\app"
    pm2 start ecosystem.config.js
    pm2 save
    
    # 设置开机自启
    pm2-startup install
    
    Write-Success "应用启动完成"
}

# 配置防火墙
function Set-FirewallRule {
    Write-Step "配置防火墙规则..."
    
    try {
        $ruleName = "Gost Manager - Port $Port"
        $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        
        if ($existingRule) {
            Write-Info "防火墙规则已存在"
        } else {
            New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
            Write-Success "防火墙规则创建完成"
        }
    } catch {
        Write-Warn "无法创建防火墙规则，请手动配置"
    }
}

# 验证部署
function Test-Deployment {
    Write-Step "验证部署..."
    
    Start-Sleep -Seconds 5
    
    # 检查应用状态
    try {
        $pm2Status = pm2 jlist | ConvertFrom-Json
        if ($pm2Status[0].pm2_env.status -eq "online") {
            Write-Success "✅ 应用运行正常"
        } else {
            Write-Error "❌ 应用未运行"
        }
    } catch {
        Write-Warn "⚠️ 无法检查应用状态"
    }
    
    # 检查端口监听
    try {
        $portCheck = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($portCheck) {
            Write-Success "✅ 应用端口 ($Port) 监听正常"
        } else {
            Write-Error "❌ 应用端口未监听"
        }
    } catch {
        Write-Warn "⚠️ 无法检查端口状态"
    }
    
    # 检查 API 响应
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -TimeoutSec 10 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Success "✅ API 响应正常"
        } else {
            Write-Warn "⚠️ API 响应异常"
        }
    } catch {
        Write-Warn "⚠️ API 无响应 (可能需要等待更长时间)"
    }
}

# 显示部署结果
function Show-Result {
    Write-Host ""
    Write-ColorOutput @"
==================================================
🎉 Gost 管理系统部署完成！
==================================================
"@ "Green"
    
    Write-Host ""
    Write-Host "📋 访问信息:"
    Write-Host "   🌐 Web 界面: http://localhost:$Port"
    Write-Host "   🌐 局域网访问: http://$(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" -or $_.IPAddress -like "172.*"} | Select-Object -First 1 -ExpandProperty IPAddress):$Port"
    Write-Host "   👤 默认账户: admin"
    Write-Host "   🔑 默认密码: admin123"
    Write-Host ""
    
    Write-Host "🔧 管理命令:"
    Write-Host "   查看状态: pm2 status"
    Write-Host "   查看日志: pm2 logs gost-manager"
    Write-Host "   重启应用: pm2 restart gost-manager"
    Write-Host "   停止应用: pm2 stop gost-manager"
    Write-Host ""
    
    Write-Host "📁 重要路径:"
    Write-Host "   应用目录: $InstallPath\app"
    Write-Host "   配置文件: $InstallPath\app\backend\.env"
    Write-Host "   日志目录: $InstallPath\logs"
    Write-Host "   数据目录: $InstallPath\data"
    Write-Host ""
    
    Write-Host "🔒 安全提醒:"
    Write-Host "   1. 请立即登录并修改默认密码"
    Write-Host "   2. 考虑配置 HTTPS"
    Write-Host "   3. 定期备份数据库文件"
    Write-Host ""
    
    Write-Success "部署完成！请访问 Web 界面开始使用。"
}

# 主函数
function Main {
    try {
        Show-Banner
        
        if (!(Test-Administrator)) {
            Write-Error "请以管理员身份运行此脚本"
            Write-Info "右键点击 PowerShell 并选择 '以管理员身份运行'"
            exit 1
        }
        
        Install-Chocolatey
        Install-Git
        Install-NodeJS
        Install-PM2
        New-DirectoryStructure
        Get-ApplicationCode
        Install-Dependencies
        Set-GostBinary
        New-EnvironmentConfig
        New-PM2Config
        Initialize-Database
        Start-Application
        Set-FirewallRule
        Test-Deployment
        Show-Result
        
    } catch {
        Write-Error "部署过程中发生错误: $($_.Exception.Message)"
        Write-Error "请检查错误信息并重试"
        exit 1
    }
}

# 运行主函数
Main
