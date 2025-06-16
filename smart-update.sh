#!/bin/bash

echo "🚀 GOST管理系统智能更新脚本"
echo "================================"
echo "💡 此脚本会自动处理Git冲突，无需手动操作"
echo ""

# 检查是否在正确的目录
if [ ! -f "deploy.sh" ]; then
    echo "❌ 请在GostUI项目根目录运行此脚本"
    exit 1
fi

# 检查是否有部署目录
DEPLOY_DIR="/root/gost-management"
if [ ! -d "$DEPLOY_DIR" ]; then
    echo "❌ 未找到部署目录 $DEPLOY_DIR"
    echo "💡 请先运行 ./deploy.sh 进行初始部署"
    exit 1
fi

echo "📋 更新信息:"
echo "   📁 源码目录: $(pwd)"
echo "   📁 部署目录: $DEPLOY_DIR"
echo ""

# 确认更新
read -p "🤔 确认开始智能更新？(y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 更新已取消"
    exit 0
fi

# 1. 智能更新源码（完全无冲突）
echo "📥 步骤1: 智能更新源码..."

# 创建临时目录
TEMP_DIR="/tmp/gost-smart-update-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$TEMP_DIR"

echo "📁 临时目录: $TEMP_DIR"

# 克隆最新代码到临时目录
echo "🔄 获取最新代码..."
git clone https://github.com/JianDNA/GostUI.git "$TEMP_DIR/GostUI"

if [ ! -d "$TEMP_DIR/GostUI" ]; then
    echo "❌ 获取最新代码失败"
    exit 1
fi

echo "✅ 最新代码获取完成"

# 2. 备份当前部署的用户数据
echo ""
echo "💾 步骤2: 备份用户数据..."

BACKUP_DIR="/tmp/gost-deploy-backup-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# 备份数据库
if [ -f "$DEPLOY_DIR/backend/database/database.sqlite" ]; then
    cp "$DEPLOY_DIR/backend/database/database.sqlite" "$BACKUP_DIR/"
    echo "✅ 已备份数据库"
fi

# 备份配置文件
if [ -f "$DEPLOY_DIR/backend/.env" ]; then
    cp "$DEPLOY_DIR/backend/.env" "$BACKUP_DIR/"
    echo "✅ 已备份环境配置"
fi

if [ -f "$DEPLOY_DIR/backend/config/config.js" ]; then
    cp "$DEPLOY_DIR/backend/config/config.js" "$BACKUP_DIR/"
    echo "✅ 已备份应用配置"
fi

# 备份GOST配置
if [ -f "$DEPLOY_DIR/backend/config/gost-config.json" ]; then
    cp "$DEPLOY_DIR/backend/config/gost-config.json" "$BACKUP_DIR/"
    echo "✅ 已备份GOST配置"
fi

# 备份日志目录（如果不大的话）
if [ -d "$DEPLOY_DIR/backend/logs" ]; then
    LOG_SIZE=$(du -sm "$DEPLOY_DIR/backend/logs" | cut -f1)
    if [ "$LOG_SIZE" -lt 50 ]; then
        cp -r "$DEPLOY_DIR/backend/logs" "$BACKUP_DIR/"
        echo "✅ 已备份日志文件"
    else
        echo "⚠️ 日志文件过大(${LOG_SIZE}MB)，跳过备份"
    fi
fi

echo "📁 备份目录: $BACKUP_DIR"

# 3. 停止服务
echo ""
echo "🛑 步骤3: 停止服务..."

SERVICE_RUNNING=false
if pm2 list | grep -q "gost-management.*online"; then
    echo "🔄 停止PM2服务..."
    pm2 stop gost-management
    SERVICE_RUNNING=true
    echo "✅ 服务已停止"
else
    echo "ℹ️ 服务未运行"
fi

# 4. 更新部署目录
echo ""
echo "🔄 步骤4: 更新部署文件..."

# 删除旧的代码文件（保留用户数据目录）
cd "$DEPLOY_DIR"
find . -maxdepth 1 -type f -delete
find . -maxdepth 1 -type d ! -name "." ! -name "backend" -exec rm -rf {} + 2>/dev/null || true

# 复制新代码
cp -r "$TEMP_DIR/GostUI/"* .

# 保护用户数据目录
mkdir -p backend/database backend/logs backend/backups backend/cache

echo "✅ 代码文件更新完成"

# 5. 处理前端文件
echo ""
echo "📦 步骤5: 处理前端文件..."

cd "$DEPLOY_DIR"

# 检查是否有预构建文件
if [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
    HTML_COUNT=$(find frontend/dist -name "*.html" | wc -l)
    JS_COUNT=$(find frontend/dist/assets -name "*.js" 2>/dev/null | wc -l)
    CSS_COUNT=$(find frontend/dist/assets -name "*.css" 2>/dev/null | wc -l)

    if [ "$HTML_COUNT" -ge 1 ] && [ "$JS_COUNT" -ge 5 ] && [ "$CSS_COUNT" -ge 3 ]; then
        echo "✅ 检测到完整的预构建文件"
        echo "📊 文件统计: HTML($HTML_COUNT) JS($JS_COUNT) CSS($CSS_COUNT)"

        # 询问用户选择
        echo ""
        echo "🤔 选择前端更新模式:"
        echo "   1) 使用预构建文件 (推荐，速度快)"
        echo "   2) 服务器端重新构建 (需要更多时间和资源)"
        echo ""
        read -p "请选择模式 (1/2) [默认: 1]: " -n 1 -r
        echo

        if [[ $REPLY =~ ^[2]$ ]]; then
            echo "🔨 选择服务器端构建模式"
            BUILD_NEEDED=true
        else
            echo "📦 选择预构建文件模式"
            # 使用预构建文件
            rm -rf backend/public
            mkdir -p backend/public
            cp -r frontend/dist/* backend/public/
            echo "✅ 前端文件部署完成（使用预构建）"
        fi
    else
        echo "⚠️ 预构建文件不完整，需要重新构建"
        BUILD_NEEDED=true
    fi
else
    echo "⚠️ 未找到预构建文件，需要构建"
    BUILD_NEEDED=true
fi

# 如果需要构建
if [ "$BUILD_NEEDED" = true ]; then
    echo "🔨 构建前端..."
    cd frontend
    
    # 安装依赖并构建
    if command -v yarn >/dev/null 2>&1; then
        yarn install --no-bin-links
        yarn add terser --dev --no-bin-links
        yarn build
    else
        npm install --no-bin-links
        npm install terser --save-dev --no-bin-links
        npm run build
    fi
    
    if [ -f "dist/index.html" ]; then
        rm -rf ../backend/public
        mkdir -p ../backend/public
        cp -r dist/* ../backend/public/
        echo "✅ 前端构建和部署完成"
    else
        echo "❌ 前端构建失败"
        exit 1
    fi
    
    cd ..
fi

# 6. 恢复用户数据
echo ""
echo "🔄 步骤6: 恢复用户数据..."

cd backend

# 恢复数据库
if [ -f "$BACKUP_DIR/database.sqlite" ]; then
    cp "$BACKUP_DIR/database.sqlite" database/
    echo "✅ 数据库已恢复"
fi

# 恢复配置文件
if [ -f "$BACKUP_DIR/.env" ]; then
    cp "$BACKUP_DIR/.env" .
    echo "✅ 环境配置已恢复"
fi

if [ -f "$BACKUP_DIR/config.js" ]; then
    mkdir -p config
    cp "$BACKUP_DIR/config.js" config/
    echo "✅ 应用配置已恢复"
fi

if [ -f "$BACKUP_DIR/gost-config.json" ]; then
    mkdir -p config
    cp "$BACKUP_DIR/gost-config.json" config/
    echo "✅ GOST配置已恢复"
fi

if [ -d "$BACKUP_DIR/logs" ]; then
    cp -r "$BACKUP_DIR/logs/"* logs/ 2>/dev/null || true
    echo "✅ 日志文件已恢复"
fi

# 7. 修复系统配置（如果需要）
echo ""
echo "⚙️ 步骤7: 检查并修复系统配置..."

# 检查数据库中是否有必需的系统配置
node -e "
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database', 'database.sqlite');

if (!fs.existsSync(dbPath)) {
    console.log('⚠️ 数据库文件不存在，跳过配置检查');
    process.exit(0);
}

let db;
try {
    db = new Database(dbPath);

    // 检查是否存在SystemConfigs表
    const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').all('table', 'SystemConfigs');

    if (tables.length === 0) {
        console.log('⚠️ SystemConfigs表不存在，跳过配置检查');
        process.exit(0);
    }

    // 检查表结构
    const columns = db.prepare('PRAGMA table_info(SystemConfigs)').all();
    const columnNames = columns.map(col => col.name);

    if (!columnNames.includes('key') || !columnNames.includes('value')) {
        console.log('⚠️ SystemConfigs表结构不完整，跳过配置检查');
        process.exit(0);
    }

    // 检查必需的配置
    const checkConfig = db.prepare('SELECT key FROM SystemConfigs WHERE key = ?');
    const requiredConfigs = ['disabledProtocols', 'allowedProtocols', 'performanceMode', 'autoSyncEnabled'];

    let missingConfigs = [];
    for (const config of requiredConfigs) {
        const result = checkConfig.get(config);
        if (!result) {
            missingConfigs.push(config);
        }
    }
    
    if (missingConfigs.length > 0) {
        console.log('⚠️ 发现缺失的系统配置:', missingConfigs.join(', '));
        console.log('🔧 正在添加缺失配置...');
        
        const now = new Date().toISOString();
        const insertConfig = db.prepare(\`
            INSERT OR IGNORE INTO SystemConfigs (
                \\\`key\\\`, value, description, category, updatedBy, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        \`);
        
        const configs = [
            {
                key: 'disabledProtocols',
                value: JSON.stringify([]),
                description: '禁用的协议列表',
                category: 'security'
            },
            {
                key: 'allowedProtocols', 
                value: JSON.stringify(['tcp', 'udp', 'http', 'https', 'socks5']),
                description: '允许的协议列表',
                category: 'security'
            },
            {
                key: 'performanceMode',
                value: 'balanced',
                description: '性能模式设置', 
                category: 'performance'
            },
            {
                key: 'autoSyncEnabled',
                value: 'true',
                description: '自动同步开关',
                category: 'sync'
            }
        ];
        
        let addedCount = 0;
        for (const config of configs) {
            if (missingConfigs.includes(config.key)) {
                const result = insertConfig.run(
                    config.key,
                    config.value, 
                    config.description,
                    config.category,
                    'system',
                    now,
                    now
                );
                if (result.changes > 0) {
                    addedCount++;
                    console.log(\`✅ 添加配置: \${config.key}\`);
                }
            }
        }
        
        console.log(\`🎉 系统配置修复完成，新增 \${addedCount} 个配置\`);
    } else {
        console.log('✅ 系统配置完整，无需修复');
    }
    
} catch (error) {
    console.error('❌ 检查系统配置失败:', error.message);
} finally {
    db.close();
}
"

# 8. 更新PM2配置并启动服务
echo ""
echo "🚀 步骤8: 启动服务..."

# 确保PM2配置是最新的
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'gost-management',
    script: 'app.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      NODE_OPTIONS: '--max-old-space-size=4096',
      DISABLE_PRODUCTION_SAFETY: 'true'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
EOF

# 启动或重启服务
if [ "$SERVICE_RUNNING" = true ]; then
    pm2 restart gost-management
else
    pm2 start ecosystem.config.js
fi

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 15

# 检查服务状态
if pm2 list | grep -q "gost-management.*online"; then
    echo "✅ 服务启动成功！"
    
    # 测试访问
    if command -v curl >/dev/null 2>&1; then
        sleep 5
        if curl -f -s http://localhost:3000 >/dev/null; then
            echo "✅ 前端页面访问正常"
        else
            echo "⚠️ 前端页面访问异常，但服务已启动"
        fi
    fi
else
    echo "❌ 服务启动失败"
    echo "📋 查看日志: pm2 logs gost-management"
    exit 1
fi

# 9. 清理临时文件
echo ""
echo "🧹 步骤9: 清理临时文件..."
rm -rf "$TEMP_DIR"
echo "✅ 临时文件清理完成"

# 完成
echo ""
echo "🎉 智能更新完成！"
echo "================================"
echo "📋 更新摘要:"
echo "   ✅ 代码已更新到最新版本"
echo "   ✅ 用户数据已完整保留"
echo "   ✅ 系统配置已检查修复"
echo "   ✅ 服务已重新启动"
echo ""
echo "🌐 访问地址: http://localhost:3000"
echo "👤 默认账号: admin / admin123"
echo "📁 数据备份: $BACKUP_DIR"
echo ""
echo "💡 如果遇到问题，可以从备份目录恢复数据"
echo "📋 查看服务状态: pm2 list"
echo "📋 查看服务日志: pm2 logs gost-management"
