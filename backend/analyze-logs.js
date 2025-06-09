/**
 * 日志分析脚本
 * 分析流量处理日志，找出数据不一致的原因
 */

const loggerService = require('./services/loggerService');

async function analyzeLogs() {
  console.log('📊 开始分析流量处理日志...\n');
  
  try {
    // 生成分析报告
    const report = loggerService.generateAnalysisReport();
    console.log(report);
    
    // 保存报告到文件
    const reportFile = loggerService.saveAnalysisReport();
    if (reportFile) {
      console.log(`\n📄 详细分析报告已保存到: ${reportFile}`);
    }
    
    // 获取详细分析数据
    const analysis = loggerService.analyzeTrafficLogs();
    
    if (analysis.error) {
      console.error('❌ 分析失败:', analysis.error);
      return;
    }
    
    // 详细分析并发问题
    if (analysis.concurrencyIssues.length > 0) {
      console.log('\n🔍 并发问题详细分析:');
      console.log('='.repeat(40));
      
      const concurrencyByTime = {};
      analysis.concurrencyIssues.forEach(issue => {
        const timeKey = new Date(issue.timestamp).toISOString().substr(0, 16); // 精确到分钟
        if (!concurrencyByTime[timeKey]) {
          concurrencyByTime[timeKey] = [];
        }
        concurrencyByTime[timeKey].push(issue);
      });
      
      Object.entries(concurrencyByTime).forEach(([time, issues]) => {
        console.log(`⏰ ${time}: ${issues.length}次并发冲突`);
        issues.forEach(issue => {
          console.log(`   用户 ${issue.data.userId}, 等待时间: ${issue.data.waitTime || 0}ms`);
        });
      });
    }
    
    // 分析用户更新模式
    if (analysis.userUpdates.length > 0) {
      console.log('\n🔍 用户更新模式分析:');
      console.log('='.repeat(40));
      
      // 按时间排序
      const sortedUpdates = analysis.userUpdates.sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
      );
      
      // 分析更新频率
      const updatesBySecond = {};
      sortedUpdates.forEach(update => {
        const timeKey = new Date(update.timestamp).toISOString().substr(0, 19); // 精确到秒
        if (!updatesBySecond[timeKey]) {
          updatesBySecond[timeKey] = [];
        }
        updatesBySecond[timeKey].push(update);
      });
      
      // 找出高频更新的时间段
      const highFrequencyPeriods = Object.entries(updatesBySecond)
        .filter(([time, updates]) => updates.length > 2)
        .sort((a, b) => b[1].length - a[1].length);
      
      if (highFrequencyPeriods.length > 0) {
        console.log('\n⚡ 高频更新时间段 (每秒>2次):');
        highFrequencyPeriods.slice(0, 10).forEach(([time, updates]) => {
          console.log(`⏰ ${time}: ${updates.length}次更新`);
          updates.forEach(update => {
            const data = update.data;
            console.log(`   用户 ${data.userId}: 增量${(data.incrementalBytes/1024/1024).toFixed(2)}MB, 实际${(data.actualIncrement/1024/1024).toFixed(2)}MB`);
          });
        });
      }
    }
    
    // 分析累积计算异常
    if (analysis.cumulativeCalculations.length > 0) {
      console.log('\n🔍 累积计算异常分析:');
      console.log('='.repeat(40));
      
      const anomalies = analysis.cumulativeCalculations.filter(calc => {
        const data = calc.data;
        // 检查是否有异常的增量计算
        return data.incremental.totalBytes > data.current.totalBytes || 
               data.incremental.totalBytes < 0;
      });
      
      if (anomalies.length > 0) {
        console.log(`发现 ${anomalies.length} 个累积计算异常:`);
        anomalies.forEach(anomaly => {
          const data = anomaly.data;
          console.log(`⚠️ 用户 ${data.userId} 端口 ${data.port}:`);
          console.log(`   当前: ${(data.current.totalBytes/1024/1024).toFixed(2)}MB`);
          console.log(`   上次: ${(data.last.totalBytes/1024/1024).toFixed(2)}MB`);
          console.log(`   增量: ${(data.incremental.totalBytes/1024/1024).toFixed(2)}MB`);
        });
      } else {
        console.log('✅ 未发现累积计算异常');
      }
    }
    
    console.log('\n📊 分析完成！');
    
  } catch (error) {
    console.error('❌ 分析过程中发生错误:', error);
  }
}

if (require.main === module) {
  analyzeLogs();
}

module.exports = analyzeLogs;
