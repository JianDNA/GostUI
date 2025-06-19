#!/bin/bash

# GOST管理系统日志清理脚本
# 清理超过20MB的日志文件，保留最近的日志

echo "🧹 GOST管理系统日志清理"
echo "================================"

DEPLOY_DIR="/root/gost-management"
LOG_DIR="$DEPLOY_DIR/backend/logs"
MAX_SIZE_MB=20

if [ ! -d "$LOG_DIR" ]; then
    echo "❌ 日志目录不存在: $LOG_DIR"
    exit 1
fi

echo "📁 日志目录: $LOG_DIR"
echo "📏 最大文件大小: ${MAX_SIZE_MB}MB"
echo ""

# 检查并清理日志文件
cleanup_log_file() {
    local file="$1"
    local filename=$(basename "$file")
    
    if [ ! -f "$file" ]; then
        return
    fi
    
    local size_mb=$(du -m "$file" | cut -f1)
    echo "📋 检查文件: $filename (${size_mb}MB)"
    
    if [ "$size_mb" -gt "$MAX_SIZE_MB" ]; then
        echo "⚠️ 文件过大，进行清理..."
        
        # 备份最后1000行
        local backup_file="${file}.backup.$(date +%Y%m%d_%H%M%S)"
        tail -1000 "$file" > "$backup_file"
        
        # 清空原文件，保留最后1000行
        mv "$backup_file" "$file"
        
        local new_size_mb=$(du -m "$file" | cut -f1)
        echo "✅ 清理完成: $filename (${new_size_mb}MB)"
    else
        echo "✅ 文件大小正常: $filename"
    fi
}

# 清理PM2日志文件
echo "🔍 检查PM2日志文件..."
cleanup_log_file "$LOG_DIR/pm2-error.log"
cleanup_log_file "$LOG_DIR/pm2-out.log"
cleanup_log_file "$LOG_DIR/pm2-combined.log"

# 清理应用日志文件
echo ""
echo "🔍 检查应用日志文件..."
cleanup_log_file "$LOG_DIR/app.log"
cleanup_log_file "$LOG_DIR/application.log"
cleanup_log_file "$LOG_DIR/error.log"

# 清理旧的备份文件（保留最近5个）
echo ""
echo "🗑️ 清理旧的备份文件..."
find "$LOG_DIR" -name "*.backup.*" -type f -printf '%T@ %p\n' | sort -rn | tail -n +6 | cut -d' ' -f2- | while read file; do
    echo "🗑️ 删除旧备份: $(basename "$file")"
    rm -f "$file"
done

# 显示清理后的状态
echo ""
echo "📊 清理后的日志目录状态:"
echo "================================"
if [ -d "$LOG_DIR" ]; then
    du -sh "$LOG_DIR"/* 2>/dev/null | while read size file; do
        echo "   $size - $(basename "$file")"
    done
    
    echo ""
    echo "📁 总目录大小: $(du -sh "$LOG_DIR" | cut -f1)"
else
    echo "   (日志目录为空)"
fi

echo ""
echo "✅ 日志清理完成！"
echo ""
echo "💡 提示:"
echo "   - 日志文件已限制在${MAX_SIZE_MB}MB以内"
echo "   - 保留了最后1000行重要日志"
echo "   - 旧备份文件已清理（保留最近5个）"
echo "   - 建议定期运行此脚本或设置定时任务"
