/**
 * 日志记录服务
 * 专门用于流量统计相关的详细日志记录和分析
 */

const fs = require('fs');
const path = require('path');

class LoggerService {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.trafficLogFile = path.join(this.logDir, 'traffic-debug.log');
    this.testLogFile = path.join(this.logDir, 'test-analysis.log');

    // 日志文件大小限制配置
    this.maxFileSize = 20 * 1024 * 1024; // 20MB
    this.maxFiles = 5; // 保留5个文件

    // 确保日志目录存在
    this.ensureLogDirectory();

    // 清理旧日志（保留最近3个文件）
    this.cleanupOldLogs();
  }

  /**
   * 确保日志目录存在
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
      console.log('📁 已创建日志目录:', this.logDir);
    }
  }

  /**
   * 清理旧日志文件
   */
  cleanupOldLogs() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // 如果存在旧的日志文件，重命名为带时间戳的备份
      if (fs.existsSync(this.trafficLogFile)) {
        const backupFile = path.join(this.logDir, `traffic-debug-${timestamp}.log`);
        fs.renameSync(this.trafficLogFile, backupFile);
      }
      
      if (fs.existsSync(this.testLogFile)) {
        const backupFile = path.join(this.logDir, `test-analysis-${timestamp}.log`);
        fs.renameSync(this.testLogFile, backupFile);
      }
      
      // 删除超过3天的日志文件
      const files = fs.readdirSync(this.logDir);
      const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);
      
      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        if (stats.mtime.getTime() < threeDaysAgo) {
          fs.unlinkSync(filePath);
        }
      });
      
    } catch (error) {
      console.error('清理日志文件失败:', error);
    }
  }

  /**
   * 检查并轮转日志文件
   */
  checkAndRotateLogFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        if (stats.size >= this.maxFileSize) {
          const dirname = path.dirname(filePath);
          const basename = path.basename(filePath);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const newPath = path.join(dirname, `${basename}.${timestamp}`);

          fs.renameSync(filePath, newPath);

          // 清理旧文件
          this.cleanupOldLogFilesByPattern(dirname, basename);
        }
      }
    } catch (error) {
      console.error('轮转日志文件失败:', error);
    }
  }

  /**
   * 清理旧的日志文件（按模式）
   */
  cleanupOldLogFilesByPattern(dirname, basename) {
    try {
      const files = fs.readdirSync(dirname)
        .filter(file => file.startsWith(`${basename}.`))
        .map(file => ({
          name: file,
          path: path.join(dirname, file),
          time: fs.statSync(path.join(dirname, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // 保留最新的maxFiles个文件，删除其余的
      if (files.length > this.maxFiles) {
        files.slice(this.maxFiles).forEach(file => {
          fs.unlinkSync(file.path);
        });
      }
    } catch (error) {
      console.error('清理旧日志文件失败:', error);
    }
  }

  /**
   * 写入流量调试日志
   */
  logTrafficDebug(level, message, data = null) {
    // 检查文件大小并轮转（10%概率检查，避免每次都检查）
    if (Math.random() < 0.1) {
      this.checkAndRotateLogFile(this.trafficLogFile);
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      pid: process.pid
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      fs.appendFileSync(this.trafficLogFile, logLine);
    } catch (error) {
      console.error('写入流量日志失败:', error);
    }
  }

  /**
   * 写入测试分析日志
   */
  logTestAnalysis(phase, data) {
    // 检查文件大小并轮转（10%概率检查）
    if (Math.random() < 0.1) {
      this.checkAndRotateLogFile(this.testLogFile);
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      phase,
      data,
      pid: process.pid
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      fs.appendFileSync(this.testLogFile, logLine);
    } catch (error) {
      console.error('写入测试日志失败:', error);
    }
  }

  /**
   * 记录观察器事件
   */
  logObserverEvent(event, processingResult) {
    this.logTrafficDebug('OBSERVER', '观察器事件处理', {
      event: {
        service: event.service,
        kind: event.kind,
        type: event.type,
        stats: event.stats
      },
      result: processingResult
    });
  }

  /**
   * 记录用户流量更新
   */
  logUserTrafficUpdate(userId, incrementalBytes, beforeTraffic, afterTraffic, lockWaitTime = 0) {
    this.logTrafficDebug('USER_UPDATE', '用户流量更新', {
      userId,
      incrementalBytes,
      beforeTraffic,
      afterTraffic,
      lockWaitTime,
      actualIncrement: afterTraffic - beforeTraffic
    });
  }

  /**
   * 记录累积统计计算
   */
  logCumulativeCalculation(userId, port, currentStats, lastStats, incrementalStats) {
    this.logTrafficDebug('CUMULATIVE', '累积统计计算', {
      userId,
      port,
      current: currentStats,
      last: lastStats,
      incremental: incrementalStats,
      statsKey: `${userId}:${port}`
    });
  }

  /**
   * 记录并发检测
   */
  logConcurrencyDetection(userId, isLocked, waitTime = 0) {
    this.logTrafficDebug('CONCURRENCY', '并发检测', {
      userId,
      isLocked,
      waitTime,
      timestamp: Date.now()
    });
  }

  /**
   * 读取并分析流量日志（包括备份文件）
   */
  analyzeTrafficLogs() {
    try {
      let allLines = [];

      // 读取当前日志文件
      if (fs.existsSync(this.trafficLogFile)) {
        const logContent = fs.readFileSync(this.trafficLogFile, 'utf8');
        const lines = logContent.trim().split('\n').filter(line => line);
        allLines = allLines.concat(lines);
      }

      // 读取今天的备份文件
      const today = new Date().toISOString().substr(0, 10); // YYYY-MM-DD
      const files = fs.readdirSync(this.logDir);
      const todayBackups = files.filter(file =>
        file.startsWith('traffic-debug-') &&
        file.includes(today.replace(/-/g, '-')) &&
        file.endsWith('.log')
      );

      // 读取备份文件
      todayBackups.forEach(backupFile => {
        try {
          const backupPath = path.join(this.logDir, backupFile);
          const backupContent = fs.readFileSync(backupPath, 'utf8');
          const backupLines = backupContent.trim().split('\n').filter(line => line);
          allLines = allLines.concat(backupLines);
        } catch (error) {
          console.warn(`读取备份文件 ${backupFile} 失败:`, error.message);
        }
      });

      if (allLines.length === 0) {
        return { error: '没有找到流量日志数据' };
      }

      console.log(`📊 读取了 ${allLines.length} 条日志记录 (包含 ${todayBackups.length} 个备份文件)`);
      const lines = allLines;
      
      const analysis = {
        totalEvents: lines.length,
        userUpdates: [],
        observerEvents: [],
        concurrencyIssues: [],
        cumulativeCalculations: []
      };

      lines.forEach(line => {
        try {
          const entry = JSON.parse(line);
          
          switch (entry.level) {
            case 'USER_UPDATE':
              analysis.userUpdates.push(entry);
              break;
            case 'OBSERVER':
              analysis.observerEvents.push(entry);
              break;
            case 'CONCURRENCY':
              if (entry.data.isLocked) {
                analysis.concurrencyIssues.push(entry);
              }
              break;
            case 'CUMULATIVE':
              analysis.cumulativeCalculations.push(entry);
              break;
          }
        } catch (error) {
          // 忽略解析错误的行
        }
      });

      return analysis;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * 生成分析报告
   */
  generateAnalysisReport() {
    const analysis = this.analyzeTrafficLogs();
    
    if (analysis.error) {
      return `❌ 分析失败: ${analysis.error}`;
    }

    let report = '📊 流量处理分析报告\n';
    report += '='.repeat(50) + '\n\n';
    
    report += `📡 总事件数: ${analysis.totalEvents}\n`;
    report += `👥 用户更新次数: ${analysis.userUpdates.length}\n`;
    report += `📊 观察器事件: ${analysis.observerEvents.length}\n`;
    report += `🔒 并发冲突: ${analysis.concurrencyIssues.length}\n`;
    report += `🧮 累积计算: ${analysis.cumulativeCalculations.length}\n\n`;

    // 分析用户更新模式
    if (analysis.userUpdates.length > 0) {
      const userStats = {};
      let totalIncremental = 0;
      let totalActual = 0;

      analysis.userUpdates.forEach(update => {
        const userId = update.data.userId;
        if (!userStats[userId]) {
          userStats[userId] = {
            updateCount: 0,
            totalIncremental: 0,
            totalActual: 0,
            lockWaitTime: 0
          };
        }
        
        userStats[userId].updateCount++;
        userStats[userId].totalIncremental += update.data.incrementalBytes;
        userStats[userId].totalActual += update.data.actualIncrement;
        userStats[userId].lockWaitTime += update.data.lockWaitTime || 0;
        
        totalIncremental += update.data.incrementalBytes;
        totalActual += update.data.actualIncrement;
      });

      report += '👥 用户更新统计:\n';
      Object.entries(userStats).forEach(([userId, stats]) => {
        const ratio = stats.totalIncremental > 0 ? (stats.totalActual / stats.totalIncremental).toFixed(2) : 0;
        report += `  用户 ${userId}: ${stats.updateCount}次更新, 预期${(stats.totalIncremental/1024/1024/1024).toFixed(2)}GB, 实际${(stats.totalActual/1024/1024/1024).toFixed(2)}GB, 比例${ratio}\n`;
      });
      
      const overallRatio = totalIncremental > 0 ? (totalActual / totalIncremental).toFixed(2) : 0;
      report += `\n📊 总体比例: 预期${(totalIncremental/1024/1024/1024).toFixed(2)}GB, 实际${(totalActual/1024/1024/1024).toFixed(2)}GB, 比例${overallRatio}\n\n`;
    }

    // 分析并发问题
    if (analysis.concurrencyIssues.length > 0) {
      report += '🔒 并发冲突分析:\n';
      const concurrencyByUser = {};
      
      analysis.concurrencyIssues.forEach(issue => {
        const userId = issue.data.userId;
        if (!concurrencyByUser[userId]) {
          concurrencyByUser[userId] = 0;
        }
        concurrencyByUser[userId]++;
      });
      
      Object.entries(concurrencyByUser).forEach(([userId, count]) => {
        report += `  用户 ${userId}: ${count}次并发冲突\n`;
      });
      report += '\n';
    }

    return report;
  }

  /**
   * 保存分析报告到文件
   */
  saveAnalysisReport() {
    const report = this.generateAnalysisReport();
    const reportFile = path.join(this.logDir, `analysis-report-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    
    try {
      fs.writeFileSync(reportFile, report);
      console.log('📄 分析报告已保存:', reportFile);
      return reportFile;
    } catch (error) {
      console.error('保存分析报告失败:', error);
      return null;
    }
  }
}

// 创建单例实例
const loggerService = new LoggerService();

module.exports = loggerService;
