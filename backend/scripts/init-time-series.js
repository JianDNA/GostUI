/**
 * 时序数据服务初始化脚本
 */

const timeSeriesService = require('../services/timeSeriesService');

async function initTimeSeries() {
  console.log('🔄 初始化时序数据服务...\n');
  
  try {
    await timeSeriesService.initialize();
    console.log('✅ 时序数据服务初始化成功');
    
    // 测试写入数据
    console.log('\n🧪 测试数据写入...');
    await timeSeriesService.recordTrafficStats(1, 1024, 2048);
    console.log('✅ 测试数据写入成功');
    
    // 测试读取数据
    console.log('\n🧪 测试数据读取...');
    const stats = await timeSeriesService.getTrafficStats(1, new Date(Date.now() - 24*60*60*1000), new Date());
    console.log('✅ 测试数据读取成功:', stats.length, '条记录');
    
  } catch (error) {
    console.error('❌ 时序数据服务初始化失败:', error);
  } finally {
    await timeSeriesService.close();
  }
}

if (require.main === module) {
  initTimeSeries();
}

module.exports = initTimeSeries;
