/**
 * 测试额外端口功能
 */

const { User } = require('./models');

async function testAdditionalPorts() {
  try {
    console.log('🧪 测试额外端口功能...');
    
    // 1. 测试获取admin用户
    const admin = await User.findOne({ where: { username: 'admin' } });
    if (!admin) {
      console.log('❌ 找不到admin用户');
      return;
    }
    
    console.log('✅ 找到admin用户:', admin.username);
    console.log('📊 当前端口配置:');
    console.log('  - 端口范围:', admin.portRangeStart, '-', admin.portRangeEnd);
    console.log('  - 额外端口:', admin.getAdditionalPorts());
    console.log('  - 端口摘要:', admin.getPortSummary());
    
    // 2. 测试设置额外端口
    console.log('\n🔧 设置额外端口: [12001, 12005, 12008]');
    admin.setAdditionalPorts([12001, 12005, 12008]);
    await admin.save();
    console.log('✅ 额外端口设置成功');
    
    // 3. 重新加载并验证
    await admin.reload();
    console.log('\n📋 验证设置结果:');
    console.log('  - 额外端口:', admin.getAdditionalPorts());
    console.log('  - 端口摘要:', admin.getPortSummary());
    console.log('  - 可用端口总数:', admin.getAvailablePorts().length);
    
    // 4. 测试端口检查功能
    console.log('\n🔍 测试端口检查功能:');
    const testPorts = [12001, 12005, 12008, 12010, 10001];
    testPorts.forEach(port => {
      const isAllowed = admin.isPortInRange(port);
      console.log(`  - 端口 ${port}: ${isAllowed ? '✅ 允许' : '❌ 不允许'}`);
    });
    
    // 5. 测试获取test用户并设置端口配置
    const testUser = await User.findOne({ where: { username: 'test' } });
    if (testUser) {
      console.log('\n🧪 测试普通用户端口配置:');
      console.log('  - 当前端口范围:', testUser.portRangeStart, '-', testUser.portRangeEnd);
      
      // 为test用户设置额外端口
      testUser.setAdditionalPorts([15001, 15002]);
      await testUser.save();
      
      await testUser.reload();
      console.log('  - 设置额外端口后:', testUser.getAdditionalPorts());
      console.log('  - 端口摘要:', testUser.getPortSummary());
      
      // 测试端口检查
      const testUserPorts = [10001, 10002, 15001, 15002, 20001];
      testUserPorts.forEach(port => {
        const isAllowed = testUser.isPortInRange(port);
        console.log(`  - 端口 ${port}: ${isAllowed ? '✅ 允许' : '❌ 不允许'}`);
      });
    }
    
    console.log('\n🎉 额外端口功能测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误详情:', error);
  }
  
  process.exit(0);
}

testAdditionalPorts();
