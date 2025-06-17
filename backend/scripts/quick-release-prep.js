#!/usr/bin/env node

/**
 * 🚀 GOST 代理管理系统 - 快速发布准备脚本
 * 
 * 功能:
 * 1. 数据库初始化（创建干净的生产数据库）
 * 2. 生成发布信息
 * 3. 创建启动脚本
 * 
 * 使用方法:
 * node scripts/quick-release-prep.js
 */

const fs = require('fs');
const path = require('path');
const DatabaseInitializer = require('./init-production-database');

class QuickReleasePrep {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    
    console.log('🚀 GOST 代理管理系统 - 快速发布准备');
    console.log('=' .repeat(60));
  }

  /**
   * 主准备流程
   */
  async prepare() {
    try {
      // 1. 数据库初始化
      await this.initializeDatabase();
      
      // 2. 生成发布信息
      await this.generateReleaseInfo();
      
      // 3. 创建启动脚本
      await this.createStartupScripts();
      
      // 4. 生成使用说明
      await this.generateUsageGuide();
      
      console.log('\n🎉 快速发布准备完成！');
      console.log('📋 接下来你可以：');
      console.log('   1. 启动系统: npm start');
      console.log('   2. 访问: http://localhost:3000');
      console.log('   3. 登录: admin / admin123');
      
    } catch (error) {
      console.error('\n❌ 发布准备失败:', error);
      throw error;
    }
  }

  /**
   * 数据库初始化
   */
  async initializeDatabase() {
    console.log('\n💾 初始化生产数据库...');
    
    const initializer = new DatabaseInitializer();
    await initializer.initialize();
    
    console.log('✅ 数据库初始化完成');
  }

  /**
   * 生成发布信息
   */
  async generateReleaseInfo() {
    console.log('\n📋 生成发布信息...');
    
    const releaseInfo = {
      name: 'GOST 代理管理系统',
      version: '1.0.0',
      description: '基于 GOST 的代理服务管理系统，提供用户管理、流量统计、配置同步等功能',
      build_time: new Date().toISOString(),
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
      
      // 系统特性
      features: [
        '🔐 用户认证和授权管理',
        '📊 实时流量统计和限制',
        '⚙️ 自动配置同步',
        '🎛️ 性能模式管理（高性能/平衡/高可用）',
        '🌐 现代化 Web 管理界面',
        '📈 流量图表和监控',
        '🔄 GOST 服务健康检查',
        '💾 SQLite 数据库存储'
      ],
      
      // 默认配置
      default_config: {
        port: 3000,
        database: 'SQLite',
        admin_credentials: {
          username: 'admin',
          password: 'admin123'
        }
      },
      
      // 系统要求
      requirements: {
        node_version: '>= 14.0.0',
        memory: '>= 512MB',
        disk_space: '>= 100MB',
        network: 'Internet connection for GOST downloads'
      },
      
      // 端口说明
      ports: {
        '3000': 'Web 管理界面',
        '动态端口': '用户配置的代理端口'
      }
    };
    
    const releaseInfoPath = path.join(this.projectRoot, 'RELEASE_INFO.json');
    fs.writeFileSync(releaseInfoPath, JSON.stringify(releaseInfo, null, 2));
    
    console.log(`✅ 发布信息已生成: ${releaseInfoPath}`);
  }

  /**
   * 创建启动脚本
   */
  async createStartupScripts() {
    console.log('\n📜 创建启动脚本...');
    
    // Linux/Mac 启动脚本
    const startScript = `#!/bin/bash

echo "🚀 启动 GOST 代理管理系统"
echo "================================"
echo ""
echo "📋 系统信息:"
echo "   - 版本: 1.0.0"
echo "   - 端口: 3000"
echo "   - 数据库: SQLite"
echo ""
echo "👤 默认管理员账户:"
echo "   - 用户名: admin"
echo "   - 密码: admin123"
echo ""
echo "🌐 访问地址: http://localhost:3000"
echo ""
echo "正在启动服务..."
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js (>= 14.0.0)"
    exit 1
fi

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2)
REQUIRED_VERSION="14.0.0"

if [ "$(printf '%s\\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "❌ 错误: Node.js 版本过低，当前版本: $NODE_VERSION，要求版本: >= $REQUIRED_VERSION"
    exit 1
fi

# 进入后端目录
cd backend

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install --production
fi

# 启动服务
echo "🚀 启动服务..."
node app.js
`;
    
    const startScriptPath = path.join(this.projectRoot, 'start.sh');
    fs.writeFileSync(startScriptPath, startScript);
    fs.chmodSync(startScriptPath, '755');
    
    // Windows 启动脚本
    const startBat = `@echo off
echo 🚀 启动 GOST 代理管理系统
echo ================================
echo.
echo 📋 系统信息:
echo    - 版本: 1.0.0
echo    - 端口: 3000
echo    - 数据库: SQLite
echo.
echo 👤 默认管理员账户:
echo    - 用户名: admin
echo    - 密码: admin123
echo.
echo 🌐 访问地址: http://localhost:3000
echo.
echo 正在启动服务...
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到 Node.js，请先安装 Node.js ^(^>= 14.0.0^)
    pause
    exit /b 1
)

REM 进入后端目录
cd backend

REM 检查依赖
if not exist "node_modules" (
    echo 📦 安装依赖...
    npm install --production
)

REM 启动服务
echo 🚀 启动服务...
node app.js

pause
`;
    
    const startBatPath = path.join(this.projectRoot, 'start.bat');
    fs.writeFileSync(startBatPath, startBat);
    
    console.log('✅ 启动脚本已创建:');
    console.log(`   - Linux/Mac: ${startScriptPath}`);
    console.log(`   - Windows: ${startBatPath}`);
  }

  /**
   * 生成使用说明
   */
  async generateUsageGuide() {
    console.log('\n📖 生成使用说明...');
    
    const usageGuide = `# 🚀 GOST 代理管理系统 - 使用指南

## 📋 系统概述

GOST 代理管理系统是一个基于 GOST 的现代化代理服务管理平台，提供：

- 🔐 用户认证和授权管理
- 📊 实时流量统计和限制
- ⚙️ 自动配置同步
- 🎛️ 性能模式管理
- 🌐 现代化 Web 管理界面

## 🚀 快速开始

### 1. 系统要求

- Node.js >= 14.0.0
- 内存 >= 512MB
- 磁盘空间 >= 100MB
- 网络连接（用于下载 GOST）

### 2. 启动系统

**Linux/Mac:**
\`\`\`bash
./start.sh
\`\`\`

**Windows:**
\`\`\`cmd
start.bat
\`\`\`

**手动启动:**
\`\`\`bash
cd backend
npm install --production
node app.js
\`\`\`

### 3. 访问系统

- 🌐 Web 界面: http://localhost:3000
- 👤 默认账户: admin / admin123

## 📖 功能说明

### 用户管理
- 创建和管理用户账户
- 设置用户权限和配额
- 分配端口范围

### 代理配置
- 创建和管理代理规则
- 支持 TCP/UDP 协议
- 自动配置 GOST 服务

### 流量监控
- 实时流量统计
- 历史数据图表
- 流量限制和告警

### 系统设置
- 性能模式配置
- 自动同步设置
- 系统监控

## 🔧 配置说明

### 性能模式

1. **高性能模式**: 6秒观察器周期，适合高并发场景
2. **平衡模式**: 30秒观察器周期，日常使用推荐
3. **高可用模式**: 60秒观察器周期，节省资源

### 端口配置

- Web 管理界面: 3000
- 代理服务端口: 用户自定义

## 🛠️ 故障排除

### 常见问题

1. **端口占用**
   \`\`\`bash
   lsof -i :3000
   \`\`\`

2. **权限问题**
   \`\`\`bash
   chmod +x start.sh
   \`\`\`

3. **依赖安装失败**
   \`\`\`bash
   cd backend
   rm -rf node_modules package-lock.json
   npm install
   \`\`\`

### 日志查看

系统日志会输出到控制台，包含详细的运行信息。

## 📞 技术支持

如遇问题，请检查：
1. Node.js 版本是否符合要求
2. 端口是否被占用
3. 网络连接是否正常
4. 文件权限是否正确

---

🎉 **祝你使用愉快！**
`;
    
    const usageGuidePath = path.join(this.projectRoot, 'USAGE_GUIDE.md');
    fs.writeFileSync(usageGuidePath, usageGuide);
    
    console.log(`✅ 使用说明已生成: ${usageGuidePath}`);
  }
}

// 主程序
async function main() {
  const prep = new QuickReleasePrep();
  
  try {
    await prep.prepare();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 快速发布准备失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = QuickReleasePrep;
