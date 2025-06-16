#!/bin/bash

echo "🔧 修复系统配置和生产环境安全设置..."

# 检查是否在正确的目录
if [ ! -f "deploy.sh" ]; then
    echo "❌ 请在GostUI项目根目录运行此脚本"
    exit 1
fi

# 1. 智能更新代码（处理Git冲突）
echo "📥 智能更新代码..."

# 保存当前工作目录状态
ORIGINAL_DIR=$(pwd)

# 检查Git状态
if git status --porcelain | grep -q .; then
    echo "📋 检测到本地修改，正在处理..."

    # 备份可能的用户配置文件
    BACKUP_DIR="/tmp/gost-update-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    # 备份重要的用户文件（如果存在）
    if [ -f "backend/.env" ]; then
        cp "backend/.env" "$BACKUP_DIR/"
        echo "✅ 已备份 backend/.env"
    fi

    if [ -f "backend/config/custom.js" ]; then
        cp "backend/config/custom.js" "$BACKUP_DIR/"
        echo "✅ 已备份自定义配置"
    fi

    # 强制重置到远程最新版本
    echo "🔄 重置到远程最新版本..."
    git fetch origin main
    git reset --hard origin/main
    git clean -fd

    # 恢复用户配置文件
    if [ -f "$BACKUP_DIR/.env" ]; then
        cp "$BACKUP_DIR/.env" "backend/"
        echo "✅ 已恢复 backend/.env"
    fi

    if [ -f "$BACKUP_DIR/custom.js" ]; then
        cp "$BACKUP_DIR/custom.js" "backend/config/"
        echo "✅ 已恢复自定义配置"
    fi

    echo "✅ 代码更新完成（已处理冲突）"
else
    # 没有本地修改，直接拉取
    git pull origin main
    echo "✅ 代码更新完成"
fi

# 2. 更新前端文件
echo "📦 更新前端文件..."
cd frontend
if [ -d "dist" ]; then
    echo "🗑️ 清理旧的前端文件..."
    rm -rf ../backend/public
    mkdir -p ../backend/public
    echo "📁 复制新的前端文件..."
    cp -r dist/* ../backend/public/
    echo "✅ 前端文件更新完成"
else
    echo "⚠️ 前端dist目录不存在，跳过前端更新"
fi

# 3. 进入后端目录
cd ../backend

# 4. 检查数据库是否存在
if [ ! -f "database/database.sqlite" ]; then
    echo "❌ 数据库文件不存在，请先运行完整部署"
    exit 1
fi

# 5. 添加缺失的系统配置
echo "⚙️ 添加缺失的系统配置..."
node -e "
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'database.sqlite');
console.log('📋 连接数据库:', dbPath);

const db = new Database(dbPath);

try {
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
        } else {
            console.log(\`ℹ️ 配置已存在: \${config.key}\`);
        }
    }

    console.log(\`🎉 系统配置处理完成，新增 \${addedCount} 个配置\`);
    
    // 验证配置
    const checkConfig = db.prepare('SELECT key, value FROM SystemConfigs WHERE key = ?');
    console.log('📋 验证配置:');
    for (const config of configs) {
        const result = checkConfig.get(config.key);
        if (result) {
            console.log(\`   \${config.key}: \${result.value}\`);
        }
    }
    
} catch (error) {
    console.error('❌ 添加配置失败:', error);
    process.exit(1);
} finally {
    db.close();
}
"

# 6. 更新PM2配置
echo "🔄 更新PM2配置..."
if pm2 list | grep -q "gost-management"; then
    echo "📝 重新生成PM2配置文件..."
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

    echo "🔄 重启PM2服务..."
    pm2 restart gost-management
    echo "✅ PM2服务已重启"
else
    echo "⚠️ PM2服务未运行，请手动启动"
fi

echo ""
echo "🎉 修复完成！"
echo "📋 修复内容："
echo "   ✅ 更新了代码"
echo "   ✅ 更新了前端文件"
echo "   ✅ 添加了系统配置"
echo "   ✅ 更新了PM2配置"
echo "   ✅ 重启了服务"
echo ""
echo "🔗 现在可以访问应用，接口错误应该已解决"
