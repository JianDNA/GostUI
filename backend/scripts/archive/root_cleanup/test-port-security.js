#!/usr/bin/env node

/**
 * 端口安全功能测试脚本
 * 验证端口安全策略是否正确工作
 */

const { portSecurityService } = require('./services/portSecurityService');

async function testPortSecurity() {
  console.log('🔒 端口安全功能测试开始...\n');

  // 测试用例
  const testCases = [
    // 危险端口测试
    { port: 22, role: 'user', expected: false, description: 'SSH端口 (系统保留)' },
    { port: 80, role: 'user', expected: false, description: 'HTTP端口 (系统保留)' },
    { port: 443, role: 'user', expected: false, description: 'HTTPS端口 (系统保留)' },
    { port: 3000, role: 'user', expected: false, description: 'Node.js服务端口 (应用保留)' },
    { port: 8080, role: 'user', expected: false, description: 'Vue前端端口 (应用保留)' },
    { port: 3306, role: 'user', expected: false, description: 'MySQL端口 (数据库保留)' },
    
    // 特权端口测试
    { port: 1023, role: 'user', expected: false, description: '特权端口范围' },
    { port: 1023, role: 'admin', expected: false, description: '特权端口范围 (管理员)' },
    
    // 安全端口测试
    { port: 10000, role: 'user', expected: true, description: '用户安全端口范围' },
    { port: 20000, role: 'user', expected: true, description: '用户安全端口范围' },
    { port: 30000, role: 'user', expected: true, description: '用户安全端口范围' },
    
    // 管理员端口测试
    { port: 2000, role: 'admin', expected: true, description: '管理员端口范围' },
    { port: 6000, role: 'admin', expected: true, description: '管理员端口范围' },
    { port: 7000, role: 'admin', expected: true, description: '管理员端口范围' },
    
    // 边界测试
    { port: 0, role: 'user', expected: false, description: '无效端口 (0)' },
    { port: 65536, role: 'user', expected: false, description: '无效端口 (超出范围)' },
    { port: -1, role: 'user', expected: false, description: '无效端口 (负数)' },
    
    // 已占用端口测试 (8080 被 Vue 占用)
    { port: 8080, role: 'admin', expected: false, description: '已占用端口 (Vue前端)' }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  console.log('📋 测试用例列表:');
  console.log('='.repeat(80));

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const { port, role, expected, description } = testCase;

    try {
      console.log(`\n${i + 1}. 测试端口 ${port} (${role}) - ${description}`);
      
      const result = await portSecurityService.validatePort(port, role, 'test-user-id');
      
      const passed = result.valid === expected;
      const status = passed ? '✅ 通过' : '❌ 失败';
      const expectedStr = expected ? '应该允许' : '应该拒绝';
      const actualStr = result.valid ? '实际允许' : '实际拒绝';
      
      console.log(`   ${status} - ${expectedStr}, ${actualStr}`);
      
      if (result.errors.length > 0) {
        console.log(`   错误: ${result.errors.join(', ')}`);
      }
      
      if (result.warnings.length > 0) {
        console.log(`   警告: ${result.warnings.join(', ')}`);
      }
      
      if (result.suggestions.length > 0) {
        console.log(`   建议: ${result.suggestions.slice(0, 3).join(', ')}`);
      }
      
      if (passed) {
        passedTests++;
      } else {
        console.log(`   ⚠️ 测试失败: 期望 ${expected}, 实际 ${result.valid}`);
      }
      
    } catch (error) {
      console.log(`   ❌ 测试异常: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`📊 测试结果: ${passedTests}/${totalTests} 通过`);
  
  if (passedTests === totalTests) {
    console.log('🎉 所有测试通过！端口安全功能工作正常');
  } else {
    console.log('⚠️ 部分测试失败，请检查端口安全配置');
  }

  // 测试批量验证功能
  console.log('\n📋 测试批量验证功能...');
  const batchPorts = [22, 80, 443, 10000, 20000, 30000];
  
  try {
    const batchResults = await portSecurityService.validatePorts(batchPorts, 'user');
    console.log('批量验证结果:');
    batchResults.forEach(result => {
      const status = result.valid ? '✅' : '❌';
      console.log(`  ${status} 端口 ${result.port}: ${result.valid ? '允许' : '拒绝'}`);
      if (result.errors.length > 0) {
        console.log(`     错误: ${result.errors[0]}`);
      }
    });
  } catch (error) {
    console.log(`❌ 批量验证失败: ${error.message}`);
  }

  // 测试可用端口建议
  console.log('\n📋 测试可用端口建议...');
  try {
    const suggestions = await portSecurityService.getAvailablePorts(5, 'user');
    console.log(`推荐的可用端口: ${suggestions.join(', ')}`);
  } catch (error) {
    console.log(`❌ 获取端口建议失败: ${error.message}`);
  }

  // 测试安全配置信息
  console.log('\n📋 端口安全配置信息:');
  try {
    const securityInfo = portSecurityService.getSecurityInfo();
    console.log(`配置版本: ${securityInfo.version}`);
    console.log(`保留端口数量: ${securityInfo.reservedPortsCount}`);
    console.log(`用户最大端口数: ${securityInfo.security.maxPortsPerUser}`);
    console.log(`允许特权端口: ${securityInfo.security.allowPrivilegedPorts ? '是' : '否'}`);
    console.log(`端口范围: ${securityInfo.security.portRangeMin}-${securityInfo.security.portRangeMax}`);
  } catch (error) {
    console.log(`❌ 获取安全配置失败: ${error.message}`);
  }

  console.log('\n🔒 端口安全功能测试完成');
}

// 运行测试
if (require.main === module) {
  testPortSecurity().then(() => {
    console.log('\n✅ 测试脚本执行完成');
    process.exit(0);
  }).catch(error => {
    console.error('\n❌ 测试脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = { testPortSecurity };
