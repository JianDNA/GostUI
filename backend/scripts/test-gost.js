/**
 * GOST 服务测试脚本
 */

const gostService = require('../services/gostService');

async function testGost() {
  console.log('🧪 开始测试 GOST 服务...\n');
  
  try {
    // 测试 GOST 服务状态
    console.log('1. 检查 GOST 服务状态...');
    const status = await gostService.getStatus();
    console.log('GOST 状态:', status);
    
    // 测试 GOST 配置
    console.log('\n2. 检查 GOST 配置...');
    const config = await gostService.getConfig();
    console.log('GOST 配置:', JSON.stringify(config, null, 2));
    
    console.log('\n✅ GOST 服务测试完成');
    
  } catch (error) {
    console.error('❌ GOST 服务测试失败:', error);
  }
}

if (require.main === module) {
  testGost();
}

module.exports = testGost;
