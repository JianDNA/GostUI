#!/usr/bin/env node

/**
 * 测试紧急配额禁用的同步抢占机制
 */

const gostSyncCoordinator = require('./services/gostSyncCoordinator');

async function testEmergencySync() {
  try {
    console.log('🧪 测试紧急配额禁用的同步抢占机制...\n');

    // 1. 启动一个长时间运行的同步（模拟定期同步）
    console.log('1. 启动长时间运行的同步（模拟定期同步）...');
    const longSyncPromise = gostSyncCoordinator.requestSync('test_long_sync', false, 3);
    
    // 等待一小段时间确保长同步开始
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 检查同步状态
    const status1 = gostSyncCoordinator.getStatus();
    console.log(`📊 长同步状态: isSyncing=${status1.isSyncing}, queueLength=${status1.queueLength}`);

    // 2. 在长同步进行中触发紧急配额禁用
    console.log('\n2. 在长同步进行中触发紧急配额禁用...');
    const emergencyStartTime = Date.now();
    
    const emergencyResult = await gostSyncCoordinator.requestSync('emergency_quota_disable', true, 10);
    
    const emergencyEndTime = Date.now();
    const emergencyDuration = emergencyEndTime - emergencyStartTime;
    
    console.log(`✅ 紧急同步结果:`, emergencyResult);
    console.log(`⏱️ 紧急同步耗时: ${emergencyDuration}ms`);

    // 3. 等待长同步完成
    console.log('\n3. 等待长同步完成...');
    const longSyncResult = await longSyncPromise;
    console.log(`✅ 长同步结果:`, longSyncResult);

    // 4. 检查最终状态
    const finalStatus = gostSyncCoordinator.getStatus();
    console.log('\n4. 最终状态:');
    console.log(`📊 isSyncing: ${finalStatus.isSyncing}`);
    console.log(`📊 queueLength: ${finalStatus.queueLength}`);
    console.log(`📊 总同步次数: ${finalStatus.stats.totalSyncs}`);
    console.log(`📊 成功同步次数: ${finalStatus.stats.successfulSyncs}`);
    console.log(`📊 跳过同步次数: ${finalStatus.stats.skippedSyncs}`);

    // 5. 测试结果分析
    console.log('\n5. 测试结果分析:');
    if (emergencyDuration < 6000) { // 应该在6秒内完成（包括5秒等待时间）
      console.log(`✅ 紧急同步响应时间正常: ${emergencyDuration}ms`);
    } else {
      console.log(`❌ 紧急同步响应时间过长: ${emergencyDuration}ms`);
    }

    if (emergencyResult.success) {
      console.log(`✅ 紧急同步执行成功`);
    } else {
      console.log(`❌ 紧急同步执行失败: ${emergencyResult.error}`);
    }

    console.log('\n🎯 测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    // 清理资源
    gostSyncCoordinator.cleanup();
    process.exit(0);
  }
}

// 运行测试
testEmergencySync();
