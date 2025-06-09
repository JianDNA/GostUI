/**
 * 测试 GOST 状态同步机制
 */

const gostService = require('../services/gostService');
const fs = require('fs');
const path = require('path');

async function testStatusSync() {
  console.log('🧪 开始测试 GOST 状态同步机制');
  console.log('=====================================');

  try {
    // 1. 测试状态获取
    console.log('\n1. 测试状态获取...');
    const status = await gostService.getStatus();
    console.log('当前状态:', status);

    // 2. 测试配置获取
    console.log('\n2. 测试配置获取...');
    const config = await gostService.getConfig();
    console.log('配置服务数量:', config?.services?.length || 0);

    // 3. 测试持久化
    console.log('\n3. 测试状态持久化...');
    const testPersist = await testPersistenceDirectly();
    console.log('持久化测试:', testPersist ? '✅ 通过' : '❌ 失败');

    console.log('\n✅ 状态同步测试完成');
    return true;

  } catch (error) {
    console.error('❌ 状态同步测试失败:', error);
    return false;
  }
}

async function testPersistenceDirectly() {
  try {
    const statusFile = path.join(__dirname, '../config/gost-status.json');
    
    // 测试写入
    const testStatus = {
      isRunning: true,
      pid: 12345,
      lastUpdate: new Date().toISOString(),
      startTime: new Date().toISOString()
    };
    
    fs.writeFileSync(statusFile, JSON.stringify(testStatus, null, 2));
    console.log('✅ 状态写入成功');
    
    // 测试读取
    const readStatus = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    console.log('✅ 状态读取成功:', readStatus);
    
    return true;
  } catch (error) {
    console.error('❌ 持久化测试失败:', error);
    return false;
  }
}

if (require.main === module) {
  console.log('🧪 GOST 状态同步测试脚本');
  console.log('=====================================');
  
  const testType = process.argv[2] || 'full';
  
  if (testType === 'persist') {
    testPersistenceDirectly()
      .then(success => {
        if (success) {
          console.log('\n🎉 持久化测试完成');
          process.exit(0);
        } else {
          console.log('\n❌ 持久化测试失败');
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('❌ 脚本执行失败:', error);
        process.exit(1);
      });
  } else {
    testStatusSync()
      .then(success => {
        if (success) {
          console.log('\n🎉 状态同步测试完成');
          process.exit(0);
        } else {
          console.log('\n❌ 状态同步测试失败');
          process.exit(1);
        }
      })
      .catch(error => {
        console.error('❌ 脚本执行失败:', error);
        process.exit(1);
      });
  }
}

module.exports = { testStatusSync, testPersistenceDirectly };
