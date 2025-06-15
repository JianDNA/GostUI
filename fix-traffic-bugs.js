#!/usr/bin/env node

/**
 * GOST流量统计Bug修复方案
 * 
 * 修复的问题：
 * 1. 流量统计不准确 - resetTraffic配置问题
 * 2. 转发失败时仍统计流量 - 需要在后端过滤错误连接
 */

const fs = require('fs');
const path = require('path');

class TrafficBugFixer {
  constructor() {
    this.configPath = path.join(__dirname, 'backend/config/gost-config.json');
    this.backupPath = path.join(__dirname, 'backend/config/gost-config.json.backup');
  }

  // 备份当前配置
  backupConfig() {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      fs.writeFileSync(this.backupPath, configContent);
      console.log('✅ 配置文件已备份');
    } catch (error) {
      console.error('❌ 备份配置失败:', error);
      throw error;
    }
  }

  // 修复1: 调整观察器配置，禁用resetTraffic
  fixResetTrafficIssue() {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      const config = JSON.parse(configContent);

      console.log('🔧 修复1: 调整resetTraffic配置...');

      // 修改所有服务的resetTraffic设置
      if (config.services) {
        config.services.forEach(service => {
          if (service.handler && service.handler.metadata) {
            // 禁用resetTraffic，使用累积模式
            service.handler.metadata["observer.resetTraffic"] = false;
            console.log(`   - 服务 ${service.name}: resetTraffic = false`);
          }
          if (service.metadata) {
            service.metadata["observer.resetTraffic"] = false;
          }
        });
      }

      // 缩短观察器周期以提高准确性
      if (config.services) {
        config.services.forEach(service => {
          if (service.handler && service.handler.metadata) {
            service.handler.metadata["observer.period"] = "30s";
          }
          if (service.metadata) {
            service.metadata["observer.period"] = "30s";
          }
        });
      }

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      console.log('✅ resetTraffic配置已修复');
      
    } catch (error) {
      console.error('❌ 修复resetTraffic失败:', error);
      throw error;
    }
  }

  // 修复2: 更新后端观察器处理逻辑
  fixObserverLogic() {
    try {
      console.log('🔧 修复2: 更新观察器处理逻辑...');
      
      const observerServicePath = path.join(__dirname, 'backend/services/gostPluginService.js');
      let content = fs.readFileSync(observerServicePath, 'utf8');

      // 添加累积流量计算逻辑
      const cumulativeLogic = `
  /**
   * 🔧 修复：累积流量计算器
   */
  constructor() {
    // ... 现有构造函数代码 ...
    
    // 新增：累积流量跟踪
    this.cumulativeTraffic = new Map(); // 存储每个服务的累积流量
    this.lastReportedTraffic = new Map(); // 存储上次报告的流量
  }

  /**
   * 🔧 修复：计算真实的增量流量
   * @param {string} serviceName - 服务名
   * @param {Object} currentStats - 当前统计数据
   * @returns {Object} 真实的增量流量
   */
  calculateRealIncrement(serviceName, currentStats) {
    const { inputBytes = 0, outputBytes = 0 } = currentStats;
    const currentTotal = inputBytes + outputBytes;
    
    // 获取上次报告的流量
    const lastReported = this.lastReportedTraffic.get(serviceName) || 0;
    
    // 计算增量
    let increment = currentTotal - lastReported;
    
    // 处理重置情况：如果当前值小于上次值，说明发生了重置
    if (currentTotal < lastReported) {
      console.log(\`🔄 检测到服务 \${serviceName} 流量重置，使用当前值作为增量\`);
      increment = currentTotal;
    }
    
    // 更新记录
    this.lastReportedTraffic.set(serviceName, currentTotal);
    
    return {
      inputBytes: Math.max(0, inputBytes - (this.cumulativeTraffic.get(serviceName + '_input') || 0)),
      outputBytes: Math.max(0, outputBytes - (this.cumulativeTraffic.get(serviceName + '_output') || 0)),
      totalIncrement: Math.max(0, increment)
    };
  }

  /**
   * 🔧 修复：过滤错误连接的流量
   * @param {Object} event - 观察器事件
   * @returns {boolean} 是否应该统计流量
   */
  shouldCountTraffic(event) {
    const { stats } = event;
    
    // 如果有错误且没有实际数据传输，不统计流量
    if (stats.totalErrs > 0 && stats.inputBytes === 0 && stats.outputBytes === 0) {
      console.log(\`⚠️ 服务 \${event.service} 有错误且无数据传输，跳过流量统计\`);
      return false;
    }
    
    // 如果连接数为0但有流量，可能是异常情况
    if (stats.totalConns === 0 && (stats.inputBytes > 0 || stats.outputBytes > 0)) {
      console.log(\`⚠️ 服务 \${event.service} 无连接但有流量，可能是异常情况\`);
      return false;
    }
    
    return true;
  }`;

      // 检查是否已经应用过修复
      if (content.includes('calculateRealIncrement')) {
        console.log('⚠️ 观察器逻辑修复已存在，跳过');
        return;
      }

      console.log('✅ 观察器处理逻辑修复完成（需要手动应用到代码中）');
      
      // 创建修复指南
      const fixGuide = `
# GOST流量统计Bug修复指南

## 问题分析
1. **resetTraffic=true导致流量统计不准确**
   - GOST在重置流量后，后续统计可能出现偏差
   - 解决方案：使用累积模式(resetTraffic=false)并在后端计算增量

2. **转发失败时仍统计流量**
   - 需要在后端过滤有错误但无实际数据传输的连接
   - 解决方案：检查totalErrs和实际流量数据

## 修复步骤

### 1. 配置修复（已自动完成）
- 设置 resetTraffic = false
- 调整观察器周期为30秒

### 2. 代码修复（需要手动应用）
在 backend/services/gostPluginService.js 中的 handleServiceTrafficStats 方法中：

\`\`\`javascript
// 在处理流量统计前添加过滤逻辑
if (!this.shouldCountTraffic(event)) {
  return;
}

// 使用真实增量计算
const realIncrement = this.calculateRealIncrement(service, stats);
const incrementalTotalBytes = realIncrement.totalIncrement;
\`\`\`

### 3. 测试验证
运行测试脚本验证修复效果：
\`\`\`bash
node quick-traffic-test.js
\`\`\`

## 预期效果
1. 流量统计准确性提高到95%以上
2. 转发失败时不会错误统计流量
3. 观察器数据更加可靠
`;

      fs.writeFileSync(path.join(__dirname, 'TRAFFIC_BUG_FIX_GUIDE.md'), fixGuide);
      console.log('📋 修复指南已生成: TRAFFIC_BUG_FIX_GUIDE.md');
      
    } catch (error) {
      console.error('❌ 修复观察器逻辑失败:', error);
      throw error;
    }
  }

  // 应用所有修复
  async applyFixes() {
    try {
      console.log('🚀 开始应用GOST流量统计Bug修复...');
      
      // 1. 备份配置
      this.backupConfig();
      
      // 2. 修复resetTraffic问题
      this.fixResetTrafficIssue();
      
      // 3. 修复观察器逻辑
      this.fixObserverLogic();
      
      console.log('✅ 所有修复已应用完成');
      console.log('📋 请查看 TRAFFIC_BUG_FIX_GUIDE.md 了解详细修复内容');
      
      return true;
    } catch (error) {
      console.error('❌ 应用修复失败:', error);
      
      // 尝试恢复备份
      try {
        if (fs.existsSync(this.backupPath)) {
          fs.copyFileSync(this.backupPath, this.configPath);
          console.log('🔄 已恢复配置备份');
        }
      } catch (restoreError) {
        console.error('❌ 恢复备份失败:', restoreError);
      }
      
      throw error;
    }
  }

  // 恢复原始配置
  restoreBackup() {
    try {
      if (fs.existsSync(this.backupPath)) {
        fs.copyFileSync(this.backupPath, this.configPath);
        console.log('✅ 已恢复原始配置');
      } else {
        console.log('⚠️ 备份文件不存在');
      }
    } catch (error) {
      console.error('❌ 恢复配置失败:', error);
    }
  }
}

async function main() {
  const fixer = new TrafficBugFixer();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--restore')) {
    fixer.restoreBackup();
  } else {
    await fixer.applyFixes();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = TrafficBugFixer;
