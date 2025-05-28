/**
 * Gost 配置服务测试脚本
 * 用于测试配置生成和同步功能
 *
 * ⚠️ 安全警告: 此脚本仅用于开发和测试环境，禁止在生产环境中运行！
 */

const path = require('path');

// 🔒 生产环境安全检查
function checkProductionSafety() {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'production') {
    console.error('🚨 安全警告: 此测试脚本禁止在生产环境中运行！');
    console.error('   当前环境: production');
    console.error('   此脚本可能会修改生产数据，存在安全风险。');
    console.error('   请在开发或测试环境中运行此脚本。');
    process.exit(1);
  }

  // 额外检查生产环境特征
  const productionIndicators = [
    process.env.PM2_HOME,
    process.env.PRODUCTION,
    process.env.PROD
  ];

  if (productionIndicators.some(indicator => indicator)) {
    console.error('🚨 安全警告: 检测到生产环境特征，拒绝运行测试脚本！');
    process.exit(1);
  }
}

// 设置环境变量（仅在非生产环境）
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_ENV = 'development';
}

// 初始化数据库连接
const { initDb, models } = require('./services/dbService');
const gostConfigService = require('./services/gostConfigService');

async function testGostConfigService() {
  // 🔒 首先进行安全检查
  checkProductionSafety();

  console.log('=== Gost 配置服务测试 ===\n');

  try {
    // 1. 初始化数据库
    console.log('1. 初始化数据库连接...');
    await initDb();
    console.log('✓ 数据库连接成功\n');

    // 2. 测试配置生成
    console.log('2. 测试配置生成...');
    const generatedConfig = await gostConfigService.generateGostConfig();
    console.log('✓ 配置生成成功');
    console.log(`   - 生成的服务数量: ${generatedConfig.services.length}`);
    console.log(`   - 生成的链数量: ${generatedConfig.chains.length}`);

    if (generatedConfig.services.length > 0) {
      console.log('   - 示例服务:');
      const firstService = generatedConfig.services[0];
      console.log(`     名称: ${firstService.name}`);
      console.log(`     地址: ${firstService.addr}`);
      console.log(`     协议: ${firstService.handler.type}`);
    }
    console.log();

    // 3. 测试配置哈希计算
    console.log('3. 测试配置哈希计算...');
    const configHash = gostConfigService.calculateConfigHash(generatedConfig);
    console.log('✓ 配置哈希计算成功');
    console.log(`   - 哈希值: ${configHash.substring(0, 16)}...`);
    console.log();

    // 4. 测试配置保存
    console.log('4. 测试配置保存...');
    await gostConfigService.saveConfigToFile(generatedConfig);
    console.log('✓ 配置保存成功');
    console.log();

    // 5. 测试配置读取
    console.log('5. 测试配置读取...');
    const currentConfig = await gostConfigService.getCurrentPersistedConfig();
    console.log('✓ 配置读取成功');
    console.log(`   - 当前服务数量: ${currentConfig.services.length}`);
    console.log();

    // 6. 测试配置比较
    console.log('6. 测试配置比较...');
    const isChanged = gostConfigService.isConfigChanged(generatedConfig, currentConfig);
    console.log('✓ 配置比较成功');
    console.log(`   - 配置是否变化: ${isChanged ? '是' : '否'}`);
    console.log();

    // 7. 测试统计信息获取
    console.log('7. 测试统计信息获取...');
    const stats = await gostConfigService.getConfigStats();
    console.log('✓ 统计信息获取成功');
    console.log(`   - 生成的服务数: ${stats.generatedServices}`);
    console.log(`   - 当前服务数: ${stats.currentServices}`);
    console.log(`   - 是否最新: ${stats.isUpToDate ? '是' : '否'}`);
    console.log(`   - 自动同步: ${stats.autoSyncEnabled ? '已启用' : '已停用'}`);
    console.log();

    // 8. 测试手动同步
    console.log('8. 测试手动同步...');
    const syncResult = await gostConfigService.triggerSync();
    console.log('✓ 手动同步成功');
    console.log(`   - 配置是否更新: ${syncResult.updated ? '是' : '否'}`);
    console.log();

    // 9. 显示最终配置内容（如果有服务）
    if (generatedConfig.services.length > 0) {
      console.log('9. 最终配置内容预览:');
      console.log('='.repeat(50));
      console.log(JSON.stringify(generatedConfig, null, 2));
      console.log('='.repeat(50));
    } else {
      console.log('9. 当前没有有效的转发规则，配置为空');
    }

    console.log('\n✅ 所有测试通过！Gost 配置服务工作正常。');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('错误详情:', error);
    process.exit(1);
  }
}

// 运行测试
if (require.main === module) {
  testGostConfigService()
    .then(() => {
      console.log('\n测试完成，退出程序...');
      process.exit(0);
    })
    .catch(error => {
      console.error('测试运行失败:', error);
      process.exit(1);
    });
}

module.exports = { testGostConfigService };
