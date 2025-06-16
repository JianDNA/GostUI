/**
 * 增强版清理脚本 - 整理和删除无用的调试和测试脚本
 */

const fs = require('fs');
const path = require('path');

// 脚本分类
const ESSENTIAL_SCRIPTS = [
  // 核心系统文件
  'app.js',                       // 主应用入口
  'package.json',                 // 项目配置
  'package-lock.json',            // 依赖锁定
  
  // 官方脚本目录中的脚本不会被移动或删除
];

const VALUABLE_SCRIPTS = [
  // 系统诊断和工具脚本
  'check-migration-status.js',    // 迁移状态检查
  'diagnose-system.js',          // 系统诊断工具
  'check-port-mapping.js',        // 端口映射检查工具
  'fix-port-mapping.js',          // 端口映射修复工具
  'create-test-users.js',         // 测试用户创建工具
  'force-refresh-cache.js',       // 强制刷新缓存工具
  
  // 有价值的测试脚本
  'debug-observer-simple.js',     // 简单观察器测试
  'test-observer-simple.js',      // 观察器测试
  'debug-observer-detailed.js',   // 详细观察器调试
  'test-streaming-pressure.js',   // 流媒体压力测试
  'test-real-1tb.js',            // 1TB极限测试
  'test-port-security.js',        // 端口安全测试
  'test-performance-config.js',   // 性能配置测试
  'test-quota-basic.js',          // 基础配额测试
  'test-cache-sync-system.js',    // 缓存同步系统测试
  'diagnose-quota-issue.js',      // 配额问题诊断
  
  // 管理员工具
  'reset-admin-password.js',      // 重置管理员密码
];

// 废弃脚本（直接删除）
const DEPRECATED_SCRIPTS = [
  // 重复或无用的测试脚本
  'simple-test.js',               // 被更好的测试替代
  'test-api.js',                  // 被更完整测试替代
  'test-simple.js',               // 被更好的测试替代
  'test-emergency-fix.js',        // 紧急修复脚本，已不再需要
  'test-emergency-sync.js',       // 紧急同步脚本，已不再需要
  'test-emergency-control-fix.js',// 紧急控制修复，已不再需要
  'test-switch-fix.js',           // 开关修复脚本，已不再需要
  'test-isactive-fix.js',         // 活动状态修复，已不再需要
  'verify-fix.js',               // 验证修复脚本，已不再需要
  'demo-security-fix.js',         // 安全演示修复，已不再需要
  'test-sync-optimization.js',    // 同步优化测试已被纳入正式功能
  
  // 废弃工具
  'demo-100mb-limit.js',          // 测试脚本，功能已被正式集成
  'demo-traffic-interruption.js', // 测试脚本，功能已被正式集成
  'debug-simple.js',              // 简单调试脚本，功能重复
  'realtime-debug-traffic-test.js',// 实时调试流量测试，功能重复
  'simple-traffic-test.js',       // 简单流量测试，被更全面测试替代
];

// 存档脚本（移动到archive目录）
const ARCHIVE_SCRIPTS = [
  // 这些脚本可能偶尔有用，但不需要放在根目录
  'test-api-rules.js',            // API规则测试
  'test-admin-create-rule.js',    // 管理员创建规则测试
  'simple-api-test.js',           // 简单API测试
  'test-complete-ports.js',       // 完整端口测试
  'test-additional-ports.js',     // 额外端口测试
  'test-mode-compatibility.js',   // 模式兼容性测试
  'simple-mode-test.js',          // 简单模式测试
  'reset-test-password.js',       // 测试密码重置
  'test-auto-mode-compatibility.js',// 自动模式兼容性测试
  'test-gost-real-usage-latency.js',// GOST真实使用延迟测试
  'test-user-edit-cache-clear.js',// 用户编辑缓存清理测试
  'test-cache-optimization.js',   // 缓存优化测试
  'test-auth-performance.js',     // 认证性能测试
  'test-config-sync-optimization.js',// 配置同步优化测试
  'test-traffic-bugs.js',         // 流量Bug测试
  'strict-6-round-test.js',       // 严格6轮测试
  'comprehensive-traffic-test.js',// 综合流量测试
  'comprehensive-6-round-traffic-test.js',// 综合6轮流量测试
  'simulate-traffic-test.js',     // 模拟流量测试
  'fix-auto-restore-rules.js',    // 修复自动恢复规则
  'test-performance-optimization.js',// 性能优化测试
  'test-hot-reload.js',           // 热重载测试
  'test-optimized-system.js',     // 优化系统测试
  'test-simplified-architecture.js',// 简化架构测试
  'test-password-reset.js',       // 密码重置测试
  'test-limiter-final.js',        // 最终限制器测试
  'test-limiter-precise.js',      // 精确限制器测试
  'test-association.js',          // 关联测试
  'create-test-rules.js',         // 创建测试规则
  'check-rules.js',               // 检查规则
  'test-basic-traffic.js',        // 基础流量测试
  'debug-observer-pipeline.js',   // 观察器管道调试
  'debug-observer-processing.js', // 观察器处理调试
  'test-complete-quota-system.js',// 完整配额系统测试
  'test-phase3-events.js',        // 第3阶段事件测试
  'test-phase1-plugins.js',       // 第1阶段插件测试
  'test-phase1-simple.js',        // 第1阶段简单测试
  'test-phase2-quota.js',         // 第2阶段配额测试
  'test-user-expiry.js',          // 用户到期测试
  'test-traffic-limit.js',        // 流量限制测试
  'test-real-traffic-limit.js',   // 真实流量限制测试
  'debug-quota-calculation.js',   // 配额计算调试
];

// 创建存档目录（如果不存在）
const archiveDir = path.join(__dirname, 'scripts', 'archive');
if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir, { recursive: true });
  console.log(`📁 创建存档目录: ${archiveDir}`);
}

// 统计
const stats = {
  deleted: 0,
  archived: 0,
  keptEssential: 0,
  keptValuable: 0,
  errors: 0,
  notFound: 0
};

// 获取 scripts 目录中的文件
const scriptsDir = path.join(__dirname, 'scripts');
const officialScripts = fs.readdirSync(scriptsDir)
  .filter(file => file !== 'archive' && !file.startsWith('.') && file.endsWith('.js'))
  .map(file => file);

// 辅助函数: 判断文件是否在指定列表中
function isInList(file, list) {
  return list.includes(file);
}

// 辅助函数: 是否是官方脚本
function isOfficialScript(file) {
  return officialScripts.includes(file);
}

// 处理一个文件
function processFile(file) {
  // 跳过目录和非JS文件
  if (file === 'scripts' || file === 'node_modules' || file === 'services' || 
      file === 'routes' || file === 'models' || file === 'migrations' || 
      file === 'logs' || file === 'cache' || file === 'config' || 
      file === 'database' || file === 'bin' || !file.endsWith('.js')) {
    return;
  }
  
  // 跳过核心文件和官方脚本
  if (isInList(file, ESSENTIAL_SCRIPTS)) {
    console.log(`✅ [保留核心] ${file}`);
    stats.keptEssential++;
    return;
  }
  
  // 保留有价值的脚本
  if (isInList(file, VALUABLE_SCRIPTS)) {
    console.log(`🔍 [保留有价值] ${file}`);
    stats.keptValuable++;
    return;
  }
  
  // 删除废弃的脚本
  if (isInList(file, DEPRECATED_SCRIPTS)) {
    try {
      fs.unlinkSync(path.join(__dirname, file));
      console.log(`🗑️ [已删除] ${file}`);
      stats.deleted++;
    } catch (error) {
      console.error(`❌ [删除失败] ${file}: ${error.message}`);
      stats.errors++;
    }
    return;
  }
  
  // 归档其他测试脚本
  if (isInList(file, ARCHIVE_SCRIPTS)) {
    try {
      const source = path.join(__dirname, file);
      const dest = path.join(archiveDir, file);
      fs.copyFileSync(source, dest);
      fs.unlinkSync(source);
      console.log(`📦 [已归档] ${file}`);
      stats.archived++;
    } catch (error) {
      console.error(`❌ [归档失败] ${file}: ${error.message}`);
      stats.errors++;
    }
    return;
  }
  
  // 如果不是我们已知的脚本，暂时保留
  if (file !== 'enhanced-cleanup.js' && file !== 'cleanup-scripts.js') {
    console.log(`⚠️ [未知脚本] ${file} - 保留`);
  }
}

function enhancedCleanup() {
  console.log('🧹 开始增强版清理 - 整理调试和测试脚本...\n');
  
  // 读取当前目录中的所有文件
  const files = fs.readdirSync(__dirname);
  files.forEach(processFile);
  
  // 输出统计信息
  console.log('\n📊 清理统计:');
  console.log(`   核心文件保留: ${stats.keptEssential} 个文件`);
  console.log(`   有价值脚本保留: ${stats.keptValuable} 个文件`); 
  console.log(`   已删除: ${stats.deleted} 个文件`);
  console.log(`   已归档: ${stats.archived} 个文件`);
  console.log(`   错误: ${stats.errors} 个操作`);
  
  console.log('\n📝 保留的关键测试脚本说明:');
  console.log('   🧪 diagnose-system.js       - 系统诊断工具，用于识别问题');
  console.log('   🧪 test-observer-simple.js  - 验证观察器基本功能');
  console.log('   🧪 test-streaming-pressure.js - 验证流媒体场景处理能力');
  console.log('   🧪 test-real-1tb.js         - 验证企业级大流量处理能力');
  console.log('   🧪 test-port-security.js    - 验证端口安全机制');
  console.log('   🧪 test-quota-basic.js      - 验证配额基础功能');
  
  console.log('\n💡 建议:');
  console.log('   1. 脚本已归档到 scripts/archive 目录，需要时可以从那里找回');
  console.log('   2. 如需要执行特定测试场景，建议使用保留的关键测试脚本');
  console.log('   3. 生产环境部署前，可以运行 diagnose-system.js 进行系统检查');
  
  console.log('\n🎉 脚本整理完成！');
}

// 执行清理
enhancedCleanup(); 