/**
 * Go-Gost 服务初始化脚本
 * 在应用启动时自动安装并启动 Go-Gost 服务
 */

const gostService = require('../services/gostService');

/**
 * 初始化 Go-Gost 服务
 * - 检查和确保可执行文件存在
 * - 关闭已存在的进程
 * - 启动服务
 */
async function initGost() {
  try {
    console.log('===== 初始化 Go-Gost 服务 =====');
    
    // 1. 确保 Go-Gost 可执行文件存在
    await gostService.ensureExecutable();
    console.log('Go-Gost 可执行文件检查完成');
    
    // 2. 关闭已存在的 Go-Gost 进程
    await gostService.killExistingProcess();
    console.log('已清理现有 Go-Gost 进程');
    
    // 3. 使用配置文件启动 Go-Gost
    await gostService.startWithConfig();
    
    const status = gostService.getStatus();
    console.log('Go-Gost 服务状态:', status);
    
    console.log('===== Go-Gost 初始化完成 =====');
    return true;
  } catch (error) {
    console.error('Go-Gost 服务初始化失败:', error);
    return false;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initGost().then(success => {
    if (!success) {
      process.exit(1);
    }
  });
} 

module.exports = initGost; 