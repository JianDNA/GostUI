/**
 * 完整的流量处理流程诊断
 */

async function diagnoseTrafficFlow() {
  console.log('🔍 完整的流量处理流程诊断...\n');

  try {
    // 1. 检查数据库状态
    console.log('1. 检查数据库状态...');
    const { User } = require('./models');
    
    const user = await User.findByPk(2);
    console.log(`📊 数据库中的用户信息:`);
    console.log(`   用户名: ${user.username}`);
    console.log(`   配额: ${user.trafficQuota}GB`);
    console.log(`   已用流量: ${user.usedTraffic} bytes`);

    // 2. 检查端口映射
    console.log('\n2. 检查端口映射...');
    const multiInstanceCacheService = require('./services/multiInstanceCacheService');
    
    // 强制刷新端口映射
    await multiInstanceCacheService.refreshPortUserMapping();
    const portMapping = await multiInstanceCacheService.getPortUserMapping();
    
    console.log('📊 端口映射状态:');
    Object.entries(portMapping).forEach(([port, userInfo]) => {
      console.log(`   端口${port}: 用户${userInfo.userId} (${userInfo.username})`);
    });

    if (portMapping[2999]) {
      console.log('✅ 端口2999映射正常');
    } else {
      console.log('❌ 端口2999没有映射');
      return;
    }

    // 3. 直接测试观察器服务
    console.log('\n3. 直接测试观察器服务...');
    const gostPluginService = require('./services/gostPluginService');
    
    // 模拟观察器事件
    const mockEvent = {
      kind: "service",
      service: "forward-tcp-2999",
      type: "stats",
      stats: {
        totalConns: 1,
        currentConns: 1,
        inputBytes: 1024 * 1024,   // 1MB
        outputBytes: 1024 * 1024,  // 1MB
        totalErrs: 0
      }
    };

    console.log('📤 发送模拟观察器事件:', JSON.stringify(mockEvent, null, 2));

    // 直接调用处理方法
    await gostPluginService.processServiceStats(mockEvent);

    // 4. 检查处理结果
    console.log('\n4. 检查处理结果...');
    const updatedUser = await User.findByPk(2);
    console.log(`📊 处理后的用户流量: ${updatedUser.usedTraffic} bytes`);

    if (updatedUser.usedTraffic > user.usedTraffic) {
      console.log('✅ 流量更新成功');
    } else {
      console.log('❌ 流量没有更新');
    }

    // 5. 测试HTTP接口
    console.log('\n5. 测试HTTP接口...');
    const http = require('http');
    
    const testData = {
      events: [mockEvent]
    };

    const response = await new Promise((resolve, reject) => {
      const data = JSON.stringify(testData);
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/gost-plugin/observer',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body });
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });

    console.log(`📊 HTTP接口响应: ${response.statusCode}`);
    console.log(`📊 响应内容: ${response.body}`);

    // 6. 再次检查数据库
    console.log('\n6. 再次检查数据库...');
    const finalUser = await User.findByPk(2);
    console.log(`📊 最终用户流量: ${finalUser.usedTraffic} bytes`);

    // 7. 检查观察器服务的内部状态
    console.log('\n7. 检查观察器服务的内部状态...');
    const bufferStatus = gostPluginService.getBufferStatus();
    console.log('📊 观察器缓冲区状态:', bufferStatus);

    // 8. 检查是否有错误日志
    console.log('\n8. 总结诊断结果...');
    
    if (finalUser.usedTraffic > user.usedTraffic) {
      console.log('✅ 流量统计功能正常工作');
    } else {
      console.log('❌ 流量统计功能异常');
      console.log('🔧 可能的问题:');
      console.log('   - 观察器处理逻辑被跳过');
      console.log('   - 端口映射问题');
      console.log('   - 数据库更新失败');
      console.log('   - 服务名格式不匹配');
    }

  } catch (error) {
    console.error('❌ 诊断过程中发生错误:', error);
  } finally {
    process.exit(0);
  }
}

diagnoseTrafficFlow();
