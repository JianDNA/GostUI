/**
 * 完整测试端口范围+额外端口功能
 */

const { User } = require('./models');

async function testCompletePorts() {
  try {
    console.log('🧪 完整测试端口范围+额外端口功能...\n');
    
    // 1. 获取test用户
    let testUser = await User.findOne({ where: { username: 'test' } });
    if (!testUser) {
      console.log('❌ 找不到test用户，创建一个测试用户');
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
    
    console.log('✅ 找到test用户:', testUser.username);
    
    // 2. 设置端口范围和额外端口
    testUser.portRangeStart = 10001;
    testUser.portRangeEnd = 10005;
    testUser.setAdditionalPorts([12001, 12005, 12008]);
    await testUser.save();
    
    console.log('✅ 设置完成');
    console.log('📊 端口配置:');
    console.log('  - 端口范围:', testUser.portRangeStart, '-', testUser.portRangeEnd);
    console.log('  - 额外端口:', testUser.getAdditionalPorts());
    console.log('  - 端口摘要:', testUser.getPortSummary());
    console.log('  - 所有可用端口:', testUser.getAvailablePorts());
    
    // 3. 测试端口检查功能
    console.log('\n🔍 测试端口检查功能:');
    const testPorts = [
      10001, 10003, 10005, // 范围内端口
      10006, 10007,        // 范围外端口
      12001, 12005, 12008, // 额外端口
      12002, 12009,        // 不在额外端口中
      8080, 9000           // 完全不相关的端口
    ];
    
    testPorts.forEach(port => {
      const isAllowed = testUser.isPortInRange(port);
      const status = isAllowed ? '✅ 允许' : '❌ 不允许';
      console.log(`  - 端口 ${port}: ${status}`);
    });
    
    // 4. 测试API数据格式
    console.log('\n📡 测试API数据格式:');
    const userData = testUser.toJSON();
    console.log('  - portRangeStart:', userData.portRangeStart);
    console.log('  - portRangeEnd:', userData.portRangeEnd);
    console.log('  - additionalPorts (raw):', userData.additionalPorts);
    console.log('  - getAdditionalPorts():', testUser.getAdditionalPorts());
    console.log('  - getPortSummary():', testUser.getPortSummary());
    
    // 5. 测试边界情况
    console.log('\n🧪 测试边界情况:');
    
    // 测试空额外端口
    testUser.setAdditionalPorts([]);
    await testUser.save();
    await testUser.reload();
    console.log('  - 清空额外端口后:', testUser.getAdditionalPorts());
    console.log('  - 端口摘要:', testUser.getPortSummary());
    
    // 测试重复端口去重
    testUser.setAdditionalPorts([12001, 12001, 12005, 12005, 12008]);
    await testUser.save();
    await testUser.reload();
    console.log('  - 去重后的额外端口:', testUser.getAdditionalPorts());
    
    // 测试端口排序
    testUser.setAdditionalPorts([12008, 12001, 12005]);
    await testUser.save();
    await testUser.reload();
    console.log('  - 排序后的额外端口:', testUser.getAdditionalPorts());
    
    console.log('\n🎉 完整端口功能测试完成！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error('错误详情:', error);
  }
  
  process.exit(0);
}

testCompletePorts();
