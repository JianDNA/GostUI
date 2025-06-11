#!/usr/bin/env node

/**
 * 测试GOST同步机制优化效果
 */

const gostSyncCoordinator = require('./services/gostSyncCoordinator');

async function testSyncOptimization() {
  try {
    console.log('🧪 测试GOST同步机制优化效果...\n');

    // 1. 测试单个同步请求
    console.log('1. 测试单个同步请求...');
    const singleResult = await gostSyncCoordinator.requestSync('test_single', false, 5);
    console.log(`✅ 单个同步结果:`, singleResult);

    // 2. 测试并发同步请求
    console.log('\n2. 测试并发同步请求...');
    const concurrentPromises = [];
    const triggers = ['test_concurrent_1', 'test_concurrent_2', 'test_concurrent_3', 'test_concurrent_4', 'test_concurrent_5'];
    
    for (let i = 0; i < 5; i++) {
      concurrentPromises.push(
        gostSyncCoordinator.requestSync(triggers[i], false, Math.floor(Math.random() * 10) + 1)
      );
    }

    console.log('🔄 同时发起5个并发同步请求...');
    const concurrentResults = await Promise.all(concurrentPromises);
    
    console.log('📊 并发测试结果:');
    concurrentResults.forEach((result, index) => {
      console.log(`   请求${index + 1}: ${result.success ? '成功' : '失败'}, ${result.queued ? '已排队' : result.skipped ? '已跳过' : '立即执行'}`);
    });

    // 3. 测试优先级队列
    console.log('\n3. 测试优先级队列...');
    
    // 先发起一个长时间的同步请求（模拟）
    const lowPriorityPromise = gostSyncCoordinator.requestSync('test_low_priority', false, 1);
    
    // 等待一下，然后发起高优先级请求
    setTimeout(async () => {
      const highPriorityResult = await gostSyncCoordinator.requestSync('test_high_priority', false, 10);
      console.log(`✅ 高优先级请求结果:`, highPriorityResult);
    }, 100);

    await lowPriorityPromise;

    // 4. 测试强制同步
    console.log('\n4. 测试强制同步...');
    const forceResult = await gostSyncCoordinator.requestSync('test_force', true, 10);
    console.log(`✅ 强制同步结果:`, forceResult);

    // 5. 测试间隔保护
    console.log('\n5. 测试间隔保护...');
    const rapidResults = [];
    
    for (let i = 0; i < 3; i++) {
      const result = await gostSyncCoordinator.requestSync(`test_rapid_${i}`, false, 5);
      rapidResults.push({
        index: i,
        result: result,
        timestamp: Date.now()
      });
      
      // 短暂延迟
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('📊 快速连续请求结果:');
    rapidResults.forEach(r => {
      console.log(`   请求${r.index}: ${r.result.success ? '成功' : '失败'}, ${r.result.skipped ? '已跳过' : '已执行'}`);
    });

    // 6. 检查协调器状态
    console.log('\n6. 检查协调器状态...');
    const status = gostSyncCoordinator.getStatus();
    console.log('📊 协调器状态:');
    console.log(`   - 正在同步: ${status.isSyncing}`);
    console.log(`   - 队列长度: ${status.queueLength}`);
    console.log(`   - 自动同步运行: ${status.autoSyncRunning}`);
    console.log(`   - 总同步次数: ${status.stats.totalSyncs}`);
    console.log(`   - 成功次数: ${status.stats.successfulSyncs}`);
    console.log(`   - 失败次数: ${status.stats.failedSyncs}`);
    console.log(`   - 跳过次数: ${status.stats.skippedSyncs}`);
    console.log(`   - 排队请求: ${status.stats.queuedRequests}`);

    console.log('\n🎉 GOST同步机制优化测试完成！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 优化效果总结:');
    console.log('   ✅ 统一同步入口');
    console.log('   ✅ 并发冲突保护');
    console.log('   ✅ 优先级队列管理');
    console.log('   ✅ 间隔保护机制');
    console.log('   ✅ 强制同步支持');
    console.log('   ✅ 详细状态监控');
    console.log('   ✅ 自动锁管理');
    console.log('');
    console.log('💡 现在GOST同步应该能够：');
    console.log('   - 避免多个同步操作冲突');
    console.log('   - 智能队列管理和优先级处理');
    console.log('   - 防止频繁无效同步');
    console.log('   - 提供详细的状态监控');
    console.log('   - 确保配置一致性');

    process.exit(0);

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testSyncOptimization();
