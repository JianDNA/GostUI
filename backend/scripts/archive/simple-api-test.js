/**
 * 简单的API测试
 */

const { User } = require('./models');

async function testUserAPI() {
  try {
    console.log('🧪 测试用户端口配置...\n');
    
    // 1. 获取test用户
    let testUser = await User.findOne({ where: { username: 'test' } });
    if (!testUser) {
      console.log('创建test用户...');
      testUser = await User.create({
        username: 'test',
        password: 'test123',
        email: 'test@example.com',
        role: 'user',
        portRangeStart: 10001,
        portRangeEnd: 10005,
        trafficQuota: 1
      });
    }
    
    console.log('✅ test用户信息:');
    console.log(`  - ID: ${testUser.id}`);
    console.log(`  - 用户名: ${testUser.username}`);
    console.log(`  - 端口范围: ${testUser.portRangeStart}-${testUser.portRangeEnd}`);
    console.log(`  - 额外端口: ${testUser.getAdditionalPorts()}`);
    console.log(`  - 端口摘要: ${JSON.stringify(testUser.getPortSummary())}`);
    
    // 2. 设置额外端口
    console.log('\n🔧 设置额外端口...');
    testUser.setAdditionalPorts([12001, 12005, 12008]);
    await testUser.save();
    
    await testUser.reload();
    console.log('✅ 额外端口设置完成:');
    console.log(`  - 额外端口: ${testUser.getAdditionalPorts()}`);
    console.log(`  - 端口摘要: ${JSON.stringify(testUser.getPortSummary())}`);
    console.log(`  - 所有可用端口: ${testUser.getAvailablePorts()}`);
    
    // 3. 测试端口检查
    console.log('\n🔍 测试端口检查:');
    const testPorts = [10001, 10003, 10006, 12001, 12005, 12009, 15000];
    testPorts.forEach(port => {
      const allowed = testUser.isPortInRange(port);
      console.log(`  - 端口 ${port}: ${allowed ? '✅ 允许' : '❌ 不允许'}`);
    });
    
    // 4. 测试JSON序列化
    console.log('\n📡 测试JSON序列化:');
    const userData = testUser.toJSON();
    console.log(`  - additionalPorts字段: ${userData.additionalPorts}`);
    console.log(`  - getAdditionalPorts(): ${JSON.stringify(testUser.getAdditionalPorts())}`);
    
    console.log('\n🎉 用户端口配置测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误详情:', error);
  }
  
  process.exit(0);
}

testUserAPI();
