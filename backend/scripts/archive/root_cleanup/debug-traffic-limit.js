/**
 * 流量限制调试脚本
 * 用于测试和验证流量限制功能是否正常工作
 */

const { User, UserForwardRule } = require('./models');
const multiInstanceCacheService = require('./services/multiInstanceCacheService');
const gostLimiterService = require('./services/gostLimiterService');
const gostAuthService = require('./services/gostAuthService');

async function debugTrafficLimit() {
  console.log('🔍 开始调试流量限制功能...\n');

  try {
    // 1. 查找 test 用户
    console.log('📋 步骤 1: 查找 test 用户');
    const testUser = await User.findOne({ where: { username: 'test' } });
    if (!testUser) {
      console.log('❌ 未找到 test 用户');
      return;
    }

    console.log(`✅ 找到用户: ${testUser.username} (ID: ${testUser.id})`);
    console.log(`   - 流量配额: ${testUser.trafficQuota} GB`);
    console.log(`   - 已用流量: ${formatBytes(testUser.usedTraffic || 0)}`);
    console.log(`   - 用户状态: ${testUser.userStatus}`);
    console.log(`   - 是否激活: ${testUser.isActive}\n`);

    // 2. 查找用户的转发规则
    console.log('📋 步骤 2: 查找用户的转发规则');
    const userRules = await UserForwardRule.findAll({
      where: { userId: testUser.id },
      include: [{ model: User, as: 'user' }]
    });

    // 使用计算属性过滤激活的规则
    const activeRules = userRules.filter(rule => {
      rule.user = rule.user || testUser; // 确保用户关联存在
      return rule.isActive; // isActive 现在是计算属性
    });

    if (activeRules.length === 0) {
      console.log('❌ 用户没有激活的转发规则');
      console.log(`   总规则数: ${userRules.length}, 激活规则数: ${activeRules.length}`);
      return;
    }

    console.log(`✅ 找到 ${activeRules.length} 个激活的转发规则:`);
    activeRules.forEach(rule => {
      console.log(`   - 规则: ${rule.name} (端口: ${rule.sourcePort} -> ${rule.targetAddress})`);
    });
    console.log('');

    // 3. 检查缓存服务中的用户数据
    console.log('📋 步骤 3: 检查缓存服务中的用户数据');
    await multiInstanceCacheService.syncCache(); // 强制同步缓存

    const userCache = multiInstanceCacheService.getUserCache(testUser.id);
    if (!userCache) {
      console.log('❌ 用户缓存不存在，尝试重新同步...');
      await multiInstanceCacheService.syncCache();
      const retryCache = multiInstanceCacheService.getUserCache(testUser.id);
      if (!retryCache) {
        console.log('❌ 重新同步后仍然没有用户缓存');
        return;
      }
      console.log('✅ 重新同步后找到用户缓存');
    } else {
      console.log('✅ 找到用户缓存');
    }

    const currentCache = multiInstanceCacheService.getUserCache(testUser.id);
    console.log('缓存数据:');
    console.log(`   - 用户ID: ${currentCache.id}`);
    console.log(`   - 用户名: ${currentCache.username}`);
    console.log(`   - 角色: ${currentCache.role}`);
    console.log(`   - 状态: ${currentCache.status}`);
    console.log(`   - 流量配额: ${currentCache.trafficQuota} GB`);
    console.log(`   - 流量限制字节: ${formatBytes(currentCache.trafficLimitBytes || 0)}`);
    console.log(`   - 已用流量: ${formatBytes(currentCache.usedTraffic || 0)}`);
    console.log('');

    // 4. 测试认证器功能
    console.log('📋 步骤 4: 测试认证器功能');
    const testRule = userRules[0];
    const authRequest = {
      service: `forward-tcp-${testRule.sourcePort}`,
      network: 'tcp',
      addr: 'test.com:443',
      src: '127.0.0.1:12345'
    };

    console.log(`测试认证请求: ${authRequest.service}`);
    const authResponse = await gostAuthService.handleAuthRequest(authRequest);
    console.log('认证响应:', authResponse);
    console.log('');

    // 5. 测试限制器功能
    console.log('📋 步骤 5: 测试限制器功能');
    const limiterRequest = {
      scope: 'client',
      service: `forward-tcp-${testRule.sourcePort}`,
      network: 'tcp',
      addr: 'test.com:443',
      client: authResponse.ok ? authResponse.id : undefined,
      src: '127.0.0.1:12345'
    };

    console.log(`测试限制器请求:`);
    console.log(`   - 服务: ${limiterRequest.service}`);
    console.log(`   - 客户端: ${limiterRequest.client}`);

    const limiterResponse = await gostLimiterService.handleLimiterRequest(limiterRequest);
    console.log('限制器响应:', limiterResponse);
    console.log('');

    // 6. 分析结果
    console.log('📋 步骤 6: 分析结果');
    const quotaBytes = (testUser.trafficQuota || 0) * 1024 * 1024 * 1024;
    const usedBytes = testUser.usedTraffic || 0;
    const usagePercent = quotaBytes > 0 ? (usedBytes / quotaBytes * 100) : 0;

    console.log('流量分析:');
    console.log(`   - 配额: ${formatBytes(quotaBytes)}`);
    console.log(`   - 已用: ${formatBytes(usedBytes)}`);
    console.log(`   - 使用率: ${usagePercent.toFixed(2)}%`);
    console.log(`   - 是否超限: ${usedBytes >= quotaBytes ? '是' : '否'}`);
    console.log('');

    console.log('预期行为:');
    if (quotaBytes === 0) {
      console.log('   - 无流量限制，应该允许通过');
    } else if (usedBytes >= quotaBytes) {
      console.log('   - 流量已超限，应该禁止通过 (in: 0, out: 0)');
    } else {
      console.log('   - 流量未超限，应该允许通过 (in: -1, out: -1)');
    }

    console.log('实际行为:');
    if (limiterResponse.in === 0 && limiterResponse.out === 0) {
      console.log('   - 限制器禁止通过');
    } else if (limiterResponse.in === -1 && limiterResponse.out === -1) {
      console.log('   - 限制器允许通过');
    } else {
      console.log(`   - 限制器返回: in=${limiterResponse.in}, out=${limiterResponse.out}`);
    }

    // 7. 检查是否存在问题
    console.log('\n🔍 问题诊断:');

    if (!authResponse.ok) {
      console.log('❌ 认证失败 - 检查端口映射和用户状态');
    } else if (!limiterRequest.client) {
      console.log('❌ 客户端ID为空 - 认证器没有返回正确的用户标识');
    } else if (quotaBytes > 0 && usedBytes >= quotaBytes) {
      if (limiterResponse.in !== 0 || limiterResponse.out !== 0) {
        console.log('❌ 流量超限但限制器没有阻止 - 这是一个BUG!');
        console.log('可能的原因:');
        console.log('   1. 限制器缓存没有及时更新');
        console.log('   2. 用户数据不一致');
        console.log('   3. 限制器逻辑有问题');
      } else {
        console.log('✅ 流量超限且限制器正确阻止');
      }
    } else {
      if (limiterResponse.in === -1 && limiterResponse.out === -1) {
        console.log('✅ 流量未超限且限制器正确允许');
      } else {
        console.log('⚠️ 流量未超限但限制器行为异常');
      }
    }

    // 8. 提供修复建议
    console.log('\n🔧 修复建议:');
    console.log('1. 清理限制器缓存: curl -X POST http://localhost:3000/api/gost-plugin/clear-limiter-cache');
    console.log('2. 强制同步缓存: curl -X POST http://localhost:3000/api/gost-plugin/force-sync');
    console.log('3. 重启 Gost 服务以重新加载配置');
    console.log('4. 检查 Gost 配置文件中的限制器插件配置');

  } catch (error) {
    console.error('❌ 调试过程中发生错误:', error);
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)}${units[unitIndex]}`;
}

// 运行调试
if (require.main === module) {
  debugTrafficLimit().then(() => {
    console.log('\n🎉 调试完成');
    process.exit(0);
  }).catch(error => {
    console.error('❌ 调试失败:', error);
    process.exit(1);
  });
}

module.exports = { debugTrafficLimit };
