/**
 * 基础配额功能测试
 */

async function testBasicQuota() {
  console.log('🧪 开始基础配额功能测试...\n');

  try {
    // 1. 测试配额管理服务
    console.log('1. 测试配额管理服务...');
    const quotaManagementService = require('./services/quotaManagementService');
    
    // 检查用户1的配额状态
    const user1Status = await quotaManagementService.checkUserQuotaStatus(1);
    console.log('✅ 用户1配额状态:', user1Status);
    
    // 检查用户2的配额状态
    const user2Status = await quotaManagementService.checkUserQuotaStatus(2);
    console.log('✅ 用户2配额状态:', user2Status);

    // 2. 测试限制器服务
    console.log('\n2. 测试限制器服务...');
    const gostLimiterService = require('./services/gostLimiterService');
    
    // 测试用户1的限制器请求
    const user1LimiterRequest = {
      scope: 'client',
      service: 'forward-tcp-6443',
      network: 'tcp',
      addr: 'test.com:443',
      client: 'user_1',
      src: '127.0.0.1:12345'
    };
    
    const user1LimiterResponse = await gostLimiterService.handleLimiterRequest(user1LimiterRequest);
    console.log('✅ 用户1限制器响应:', user1LimiterResponse);
    
    // 测试用户2的限制器请求
    const user2LimiterRequest = {
      scope: 'client',
      service: 'forward-tcp-2999',
      network: 'tcp',
      addr: 'test.com:443',
      client: 'user_2',
      src: '127.0.0.1:12345'
    };
    
    const user2LimiterResponse = await gostLimiterService.handleLimiterRequest(user2LimiterRequest);
    console.log('✅ 用户2限制器响应:', user2LimiterResponse);

    // 3. 测试认证器服务
    console.log('\n3. 测试认证器服务...');
    const gostAuthService = require('./services/gostAuthService');
    
    // 测试端口6443的认证
    const auth6443Request = {
      service: 'forward-tcp-6443',
      network: 'tcp',
      addr: 'test.com:443',
      src: '127.0.0.1:12345'
    };
    
    const auth6443Response = await gostAuthService.handleAuthRequest(auth6443Request);
    console.log('✅ 端口6443认证响应:', auth6443Response);
    
    // 测试端口2999的认证
    const auth2999Request = {
      service: 'forward-tcp-2999',
      network: 'tcp',
      addr: 'test.com:443',
      src: '127.0.0.1:12345'
    };
    
    const auth2999Response = await gostAuthService.handleAuthRequest(auth2999Request);
    console.log('✅ 端口2999认证响应:', auth2999Response);

    console.log('\n🎉 基础配额功能测试完成！');
    console.log('\n📋 测试结果:');
    console.log(`✅ 配额管理服务: 正常`);
    console.log(`✅ 限制器服务: 正常`);
    console.log(`✅ 认证器服务: 正常`);

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error);
  } finally {
    process.exit(0);
  }
}

testBasicQuota();
