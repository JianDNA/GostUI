/**
 * 清理无用的调试和测试脚本
 */

const fs = require('fs');
const path = require('path');

// 需要删除的重复/过时脚本
const scriptsToDelete = [
  'analyze-logs.js',              // 临时日志分析工具
  'debug-concurrent-test.js',     // 被更好的测试替代
  'debug-controlled-test.js',     // 被更好的测试替代
  'debug-high-frequency-test.js', // 被更好的测试替代
  'debug-incremental-test.js',    // 被更好的测试替代
  'debug-minimal-extreme.js',     // 被更好的测试替代
  'debug-observer.js',            // 被simple版本替代
  'debug-simple-test.js',         // 被更好的测试替代
  'test-extreme-stress.js',       // 被1TB测试替代
  'test-memory-cache.js',         // 功能已验证，不再需要
  'test-super-extreme.js',        // 被1TB测试替代
  'test-ultimate-1tb.js'          // 被real-1tb替代
];

// 需要保留的重要脚本
const scriptsToKeep = [
  // 核心文件
  'app.js',                      // 主应用入口
  'ecosystem.config.js',         // PM2配置
  'package.json',                // 项目配置
  'package-lock.json',           // 依赖锁定
  'nodemon.json',                // 开发配置

  // 运维工具
  'check-migration-status.js',   // 迁移状态检查
  'check-table-structure.js',    // 表结构检查
  'fix-table-constraints.js',    // 表约束修复
  'create-test-users.js',        // 测试用户创建
  'diagnose-system.js',          // 系统诊断
  'reset-all-stats.js',          // 统计重置

  // 用户测试工具（为其他用户提供）
  'debug-observer-simple.js',    // 简单观察器测试
  'debug-gentle-test.js',        // 温和压力测试
  'test-streaming-pressure.js',  // 流媒体压力测试
  'test-real-1tb.js',           // 1TB极限测试

  // 文档
  'DEPLOYMENT.md'                // 部署文档
];

function cleanupScripts() {
  console.log('🧹 开始清理无用的调试和测试脚本...\n');
  
  let deletedCount = 0;
  let notFoundCount = 0;
  
  scriptsToDelete.forEach(scriptName => {
    const scriptPath = path.join(__dirname, scriptName);
    
    if (fs.existsSync(scriptPath)) {
      try {
        fs.unlinkSync(scriptPath);
        console.log(`✅ 已删除: ${scriptName}`);
        deletedCount++;
      } catch (error) {
        console.log(`❌ 删除失败: ${scriptName} - ${error.message}`);
      }
    } else {
      console.log(`⏭️ 文件不存在: ${scriptName}`);
      notFoundCount++;
    }
  });
  
  console.log(`\n📊 清理统计:`);
  console.log(`   已删除: ${deletedCount} 个文件`);
  console.log(`   未找到: ${notFoundCount} 个文件`);
  
  console.log(`\n✅ 保留的重要脚本:`);
  scriptsToKeep.forEach(scriptName => {
    const scriptPath = path.join(__dirname, scriptName);
    if (fs.existsSync(scriptPath)) {
      console.log(`   ✅ ${scriptName}`);
    } else {
      console.log(`   ⚠️ ${scriptName} (文件不存在)`);
    }
  });
  
  console.log(`\n🎉 脚本清理完成！`);
  console.log(`\n📝 保留的测试脚本说明:`);
  console.log(`   🧪 debug-observer-simple.js  - 验证观察器基本功能`);
  console.log(`   🧪 debug-gentle-test.js      - 验证系统稳定性（60次请求）`);
  console.log(`   🧪 test-streaming-pressure.js - 验证流媒体场景（2.5分钟）`);
  console.log(`   🧪 test-real-1tb.js         - 验证企业级能力（12分钟1TB）`);
  console.log(`\n📝 使用建议:`);
  console.log(`   1. 新用户可以按顺序运行测试脚本验证系统功能`);
  console.log(`   2. 生产环境部署前建议运行所有测试脚本`);
  console.log(`   3. 如有问题可以使用 diagnose-system.js 进行诊断`);
}

// 执行清理
cleanupScripts();
