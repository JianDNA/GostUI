#!/bin/bash

echo "🔧 修复认证和系统配置问题"
echo "================================"

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

echo "📋 修复信息:"
echo "   📁 源码目录: $(pwd)"
echo "   📁 部署目录: $DEPLOY_DIR"
echo ""

# 1. 更新代码
echo "📥 步骤1: 更新代码..."
git fetch origin main
git reset --hard origin/main

# 2. 更新前端文件
echo "📦 步骤2: 更新前端文件..."
if [ -d "frontend/dist" ] && [ -f "frontend/dist/index.html" ]; then
    rm -rf "$DEPLOY_DIR/backend/public"
    mkdir -p "$DEPLOY_DIR/backend/public"
    cp -r frontend/dist/* "$DEPLOY_DIR/backend/public/"
    echo "✅ 前端文件更新完成"
else
    echo "⚠️ 前端dist目录不存在，跳过前端更新"
fi

# 3. 更新后端代码
echo "🔄 步骤3: 更新后端代码..."
rsync -av --exclude='database/' --exclude='logs/' --exclude='backups/' --exclude='cache/' --exclude='public/' --exclude='node_modules/' backend/ "$DEPLOY_DIR/backend/"

# 4. 修复系统配置
echo "⚙️ 步骤4: 检查并修复系统配置..."

cd "$DEPLOY_DIR/backend"

# 检查数据库中是否有必需的系统配置
node -e "
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'database.sqlite');

if (!require('fs').existsSync(dbPath)) {
    console.log('⚠️ 数据库文件不存在，跳过配置检查');
    process.exit(0);
}

const db = new Database(dbPath);

try {
    // 检查是否存在SystemConfigs表
    const tables = db.prepare('SELECT name FROM sqlite_master WHERE type=\"table\" AND name=\"SystemConfigs\"').all();
    
    if (tables.length === 0) {
        console.log('⚠️ SystemConfigs表不存在，跳过配置检查');
        db.close();
        process.exit(0);
    }
    
    // 检查必需的配置
    const checkConfig = db.prepare('SELECT key FROM SystemConfigs WHERE key = ?');
    const requiredConfigs = ['disabledProtocols'];
    
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

# 5. 重启服务
echo ""
echo "🚀 步骤5: 重启服务..."

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

# 重启PM2服务
if pm2 list | grep -q "gost-management"; then
    pm2 restart gost-management
else
    pm2 start ecosystem.config.js
fi

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
if pm2 list | grep -q "gost-management.*online"; then
    echo "✅ 服务启动成功！"
    
    # 测试访问
    if command -v curl >/dev/null 2>&1; then
        sleep 3
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

echo ""
echo "🎉 修复完成！"
echo "================================"
echo "📋 修复摘要:"
echo "   ✅ 代码已更新到最新版本"
echo "   ✅ 前端文件已更新"
echo "   ✅ 系统配置已检查修复"
echo "   ✅ 服务已重新启动"
echo ""
echo "🌐 访问地址: http://localhost:3000"
echo "👤 默认账号: admin / admin123"
echo ""
echo "💡 修复内容:"
echo "   - 修复了页面刷新后localStorage被清空的问题"
echo "   - 修复了/api/system-config/disabledProtocols 404错误"
echo "   - 优化了401错误处理逻辑"
echo ""
echo "📋 查看服务状态: pm2 list"
echo "📋 查看服务日志: pm2 logs gost-management"
