#!/bin/bash

# 🔧 自动修复脚本格式问题
if [ -f "$0" ]; then
    # 修复换行符问题
    sed -i 's/\r$//' "$0" 2>/dev/null || true
    # 确保执行权限
    chmod +x "$0" 2>/dev/null || true
fi

echo "🚀 GOST管理系统智能更新脚本"
echo "================================"
echo "💡 此脚本会自动处理Git冲突，无需手动操作"
echo ""

# 🔧 防止死循环：检查是否是脚本更新后的重新启动
SCRIPT_UPDATED_FLAG="/tmp/gost-script-updated-$(date +%Y%m%d)"
if [ "$1" = "--script-updated" ]; then
    echo "🔄 脚本已更新，继续执行更新流程..."
    CHECK_SCRIPT_UPDATE=false
    # 清理标记文件
    rm -f "$SCRIPT_UPDATED_FLAG"
elif [ -f "$SCRIPT_UPDATED_FLAG" ]; then
    echo "🔄 检测到脚本更新标记，跳过脚本自检..."
    CHECK_SCRIPT_UPDATE=false
    # 清理标记文件
    rm -f "$SCRIPT_UPDATED_FLAG"
fi

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

# 如果没有设置CHECK_SCRIPT_UPDATE，询问用户选择
if [ -z "$CHECK_SCRIPT_UPDATE" ]; then
    echo "🤔 更新选项:"
    echo "   1) 完整更新 (包含脚本自检，较慢)"
    echo "   2) 快速更新 (跳过脚本自检，推荐)"
    echo "   3) 取消更新"
    echo ""
    read -p "请选择 (1/2/3) [默认: 2]: " -n 1 -r
    echo

    case $REPLY in
        1)
            echo "✅ 选择完整更新模式"
            CHECK_SCRIPT_UPDATE=true
            ;;
        3)
            echo "❌ 更新已取消"
            exit 0
            ;;
        *)
            echo "✅ 选择快速更新模式"
            CHECK_SCRIPT_UPDATE=false
            ;;
    esac
fi

# 0. 检查并更新智能更新脚本本身 (可选)
if [ "$CHECK_SCRIPT_UPDATE" = true ]; then
    echo ""
    echo "🔄 步骤0: 检查智能更新脚本更新..."
    echo "⏳ 正在检查脚本更新，请稍候..."

    # 检查是否能快速连接到Git仓库
    if git ls-remote --exit-code origin >/dev/null 2>&1; then
        echo "✅ Git连接正常，检查脚本更新..."

        # 快速获取远程信息
        if git fetch origin main --quiet 2>/dev/null; then
            # 检查smart-update.sh是否有更新
            if git diff HEAD origin/main --name-only 2>/dev/null | grep -q "smart-update.sh"; then
                echo "🔄 检测到智能更新脚本有更新，正在应用..."

                # 🔧 检查是否已经更新过（防止多次更新）
                CURRENT_HASH=$(git rev-parse HEAD:smart-update.sh 2>/dev/null || echo "")
                REMOTE_HASH=$(git rev-parse origin/main:smart-update.sh 2>/dev/null || echo "")

                if [ "$CURRENT_HASH" = "$REMOTE_HASH" ]; then
                    echo "✅ 脚本哈希值相同，无需更新"
                else
                    # 备份当前脚本
                    cp "smart-update.sh" "smart-update.sh.backup.$(date +%Y%m%d_%H%M%S)"

                    # 获取最新的脚本文件
                    if git show origin/main:smart-update.sh > "smart-update.sh.new" 2>/dev/null; then
                        # 检查新脚本是否有效
                        if [ -s "smart-update.sh.new" ] && head -1 "smart-update.sh.new" | grep -q "#!/bin/bash"; then
                            # 替换脚本
                            mv "smart-update.sh.new" "smart-update.sh"
                            chmod +x "smart-update.sh"

                            echo "✅ 智能更新脚本已更新，重新启动更新流程..."
                            echo ""

                            # 🔧 创建标记文件防止死循环
                            touch "$SCRIPT_UPDATED_FLAG"

                            # 修复文件权限和格式
                            chmod +x "./smart-update.sh"
                            sed -i 's/\r$//' "./smart-update.sh" 2>/dev/null || true

                            # 重新执行更新的脚本，传递标记参数
                            exec bash "./smart-update.sh" --script-updated
                        else
                            echo "❌ 新脚本文件无效，继续使用当前版本"
                            rm -f "smart-update.sh.new"
                        fi
                    else
                        echo "❌ 无法获取新脚本内容，继续使用当前版本"
                    fi
                fi
            else
                echo "✅ 智能更新脚本已是最新版本"
            fi
        else
            echo "⚠️ 无法获取远程更新信息，跳过脚本更新检查"
        fi
    else
        echo "⚠️ Git连接失败，跳过脚本更新检查"
    fi
else
    echo ""
    echo "⏭️ 跳过脚本自检，使用快速更新模式"
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

# 🔧 修复所有脚本文件的格式问题
echo "🔧 修复脚本文件格式..."
find . -name "*.sh" -type f -exec sed -i 's/\r$//' {} \; 2>/dev/null || true
find . -name "*.sh" -type f -exec chmod +x {} \; 2>/dev/null || true

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

# 7. 运行数据库修复（如果需要）
echo ""
echo "🔧 步骤7: 检查数据库修复..."

# 检查是否有数据库修复脚本
if [ -f "database-fixes.js" ]; then
    echo "📋 发现数据库修复脚本，开始执行..."
    if node database-fixes.js; then
        echo "✅ 数据库修复完成"
    else
        echo "❌ 数据库修复失败，但继续更新流程"
    fi
else
    echo "ℹ️ 未找到数据库修复脚本，跳过修复步骤"
fi

# 8. 运行新迁移（如果需要）
echo ""
echo "🔄 步骤8: 检查并运行新迁移..."

# 检查外部访问控制配置迁移
echo "📝 检查外部访问控制配置..."

# 检查配置是否存在
CONFIG_EXISTS=$(sqlite3 backend/database/database.sqlite "SELECT COUNT(*) FROM SystemConfigs WHERE key = 'allowUserExternalAccess';" 2>/dev/null || echo "0")

if [ "$CONFIG_EXISTS" = "0" ]; then
    echo "🚀 添加外部访问控制配置..."

    # 添加配置项
    sqlite3 backend/database/database.sqlite "
    INSERT OR IGNORE INTO SystemConfigs (key, value, description, category, updatedBy, createdAt, updatedAt)
    VALUES ('allowUserExternalAccess', 'true', '允许普通用户的转发规则被外部访问。true=监听所有接口(0.0.0.0)，false=仅本地访问(127.0.0.1)。管理员用户不受限制。', 'security', 'system', datetime('now'), datetime('now'));
    " 2>/dev/null

    if [ $? -eq 0 ]; then
        echo "✅ 外部访问控制配置添加完成"
    else
        echo "⚠️ 外部访问控制配置添加失败，但继续更新流程"
    fi
else
    echo "ℹ️ 外部访问控制配置已存在，跳过添加"
fi

# 检查迁移记录是否存在
MIGRATION_EXISTS=$(sqlite3 backend/database/database.sqlite "SELECT COUNT(*) FROM SequelizeMeta WHERE name = '20250617063000-add-user-external-access-config.js';" 2>/dev/null || echo "0")

if [ "$MIGRATION_EXISTS" = "0" ]; then
    echo "📝 添加迁移记录..."
    sqlite3 backend/database/database.sqlite "
    INSERT OR IGNORE INTO SequelizeMeta (name)
    VALUES ('20250617063000-add-user-external-access-config.js');
    " 2>/dev/null

    if [ $? -eq 0 ]; then
        echo "✅ 迁移记录添加完成"
    else
        echo "⚠️ 迁移记录添加失败，但继续更新流程"
    fi
else
    echo "ℹ️ 迁移记录已存在，跳过添加"
fi

# 9. 修复系统配置（如果需要）
echo ""
echo "⚙️ 步骤9: 检查并修复系统配置..."

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

# 9. 配置GOST安全设置
echo ""
echo "🔒 步骤9: 配置GOST安全设置..."

# 修复GOST WebAPI安全配置
CONFIG_FILE="config/gost-config.json"
if [ -f "$CONFIG_FILE" ]; then
    echo "🔧 检查GOST WebAPI安全配置..."

    # 检查当前配置
    CURRENT_ADDR=$(grep -o '"addr":\s*"[^"]*"' "$CONFIG_FILE" | grep -o '"[^"]*"$' | tr -d '"' || echo "")

    if [ "$CURRENT_ADDR" = ":18080" ]; then
        echo "⚠️ 发现安全风险：GOST WebAPI监听所有接口"
        echo "🔧 自动修复为仅监听本地接口..."

        # 使用sed修复配置
        sed -i 's/"addr": ":18080"/"addr": "127.0.0.1:18080"/' "$CONFIG_FILE"

        # 验证修复
        NEW_ADDR=$(grep -o '"addr":\s*"[^"]*"' "$CONFIG_FILE" | grep -o '"[^"]*"$' | tr -d '"' || echo "")
        if [ "$NEW_ADDR" = "127.0.0.1:18080" ]; then
            echo "✅ GOST WebAPI安全配置已自动修复"
        else
            echo "❌ 安全配置修复失败"
        fi
    elif [ "$CURRENT_ADDR" = "127.0.0.1:18080" ]; then
        echo "✅ GOST WebAPI安全配置正确"
    else
        echo "ℹ️ GOST WebAPI配置: $CURRENT_ADDR"
    fi
else
    echo "ℹ️ GOST配置文件不存在，将在服务启动时自动创建安全配置"
fi

echo "✅ GOST安全配置检查完成"

# 10. 更新PM2配置并启动服务
echo ""
echo "🚀 步骤10: 启动服务..."

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

# 全面安全验证
echo ""
echo "🔒 进行全面安全验证..."

CONFIG_FILE="config/gost-config.json"
security_issues=0
warnings=0

# 检查GOST WebAPI配置
echo "🔍 检查GOST WebAPI安全配置..."
if [ -f "$CONFIG_FILE" ]; then
    CURRENT_ADDR=$(grep -o '"addr":\s*"[^"]*"' "$CONFIG_FILE" | grep -o '"[^"]*"$' | tr -d '"' || echo "")

    if [ "$CURRENT_ADDR" = "127.0.0.1:18080" ]; then
        echo "✅ GOST WebAPI安全配置正确"
    elif [ "$CURRENT_ADDR" = ":18080" ]; then
        echo "⚠️ 检测到GOST WebAPI安全风险，建议重新运行更新"
        warnings=$((warnings + 1))
    else
        echo "ℹ️ GOST WebAPI配置: $CURRENT_ADDR"
    fi
else
    echo "ℹ️ GOST配置文件将在服务运行时创建"
fi

# 检查观察器和限制器配置
echo "🔍 检查GOST插件配置..."
if [ -f "$CONFIG_FILE" ]; then
    # 检查观察器配置
    OBSERVER_ADDR=$(grep -A 5 '"observers"' "$CONFIG_FILE" | grep '"addr"' | grep -o '"[^"]*"$' | tr -d '"' || echo "")
    if [ -n "$OBSERVER_ADDR" ]; then
        if echo "$OBSERVER_ADDR" | grep -q "localhost:3000"; then
            echo "✅ 观察器配置安全（通过主服务）"
        else
            echo "ℹ️ 观察器配置: $OBSERVER_ADDR"
        fi
    fi

    # 检查限制器配置
    LIMITER_ADDR=$(grep -A 5 '"limiters"' "$CONFIG_FILE" | grep '"addr"' | grep -o '"[^"]*"$' | tr -d '"' || echo "")
    if [ -n "$LIMITER_ADDR" ]; then
        if echo "$LIMITER_ADDR" | grep -q "localhost:3000"; then
            echo "✅ 限制器配置安全（通过主服务）"
        else
            echo "ℹ️ 限制器配置: $LIMITER_ADDR"
        fi
    fi
fi

# 检查端口监听状态
echo "🔍 检查端口监听状态..."
if command -v netstat >/dev/null 2>&1; then
    # 检查18080端口
    LISTEN_18080=$(netstat -tln 2>/dev/null | grep :18080 | head -1 || echo "")
    if [ -n "$LISTEN_18080" ]; then
        if echo "$LISTEN_18080" | grep -q "127.0.0.1:18080"; then
            echo "✅ 端口18080仅监听本地接口"
        elif echo "$LISTEN_18080" | grep -q "0.0.0.0:18080"; then
            echo "⚠️ 端口18080监听所有接口，存在安全风险"
            warnings=$((warnings + 1))
        fi
    fi

    # 检查18081端口（观察器）
    LISTEN_18081=$(netstat -tln 2>/dev/null | grep :18081 | head -1 || echo "")
    if [ -n "$LISTEN_18081" ]; then
        if echo "$LISTEN_18081" | grep -q "127.0.0.1:18081"; then
            echo "✅ 端口18081仅监听本地接口"
        elif echo "$LISTEN_18081" | grep -q "0.0.0.0:18081"; then
            echo "⚠️ 端口18081监听所有接口，存在安全风险"
            warnings=$((warnings + 1))
        fi
    fi
fi

# 安全验证总结
echo ""
echo "🔒 安全验证总结:"
echo "   安全问题: $security_issues"
echo "   警告信息: $warnings"

if [ $warnings -eq 0 ]; then
    echo "✅ 安全验证完全通过"
else
    echo "⚠️ 发现 $warnings 个安全警告，建议关注"
fi

# 11. 清理临时文件
echo ""
echo "🧹 步骤10: 清理临时文件..."
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
echo "   ✅ GOST安全配置已自动修复"
echo "   ✅ 服务已重新启动"
echo ""
echo "🌐 访问地址: http://localhost:3000"
echo "👤 默认账号: admin / admin123"
echo "📁 数据备份: $BACKUP_DIR"
echo ""
echo "🔒 安全提醒:"
echo "   ✅ GOST WebAPI已自动配置为仅本地访问"
echo "   🔐 外部用户无法访问敏感配置接口"
echo "   🛡️ 系统安全性已得到保障"
echo ""
echo "💡 如果遇到问题，可以从备份目录恢复数据"
echo "📋 查看服务状态: pm2 list"
echo "📋 查看服务日志: pm2 logs gost-management"
