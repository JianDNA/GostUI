/**
 * GOST 服务初始化脚本
 * 负责启动和配置 GOST 服务
 */

const gostService = require('../services/gostService');

/**
 * 初始化 GOST 服务
 * @returns {Promise<void>}
 */
async function initGost() {
  console.log('===== 初始化 Go-Gost 服务 =====');
  
  try {
    // 🔧 修复：使用配置文件启动而不是命令行参数
    // gostService.start() 使用的是旧的命令行参数方式，会导致错误
    // 应该使用 startWithConfig() 方法

    if (typeof gostService.startWithConfig === 'function') {
      // 使用配置文件启动
      const result = await gostService.startWithConfig();
      console.log('Go-Gost 服务启动成功');
      console.log('Go-Gost 服务状态:', result);
    } else {
      // 回退到基本启动方式，但不传递可能导致错误的参数
      console.log('使用基本启动方式...');
      const result = await gostService.start({});
      console.log('Go-Gost 服务启动成功');
    }

    console.log('===== Go-Gost 初始化完成 =====');

  } catch (error) {
    console.error('Go-Gost 初始化失败:', error);
    throw error;
  }
}

module.exports = initGost;
