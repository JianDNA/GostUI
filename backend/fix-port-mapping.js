#!/usr/bin/env node

/**
 * 修复端口映射缓存问题
 * 
 * 问题分析：
 * 1. GOST观察器收到流量统计，但无法映射到用户
 * 2. 端口映射缓存可能没有正确建立
 * 3. 需要确保端口映射与实际转发规则一致
 */

const { User, UserForwardRule } = require('./models');
const multiInstanceCacheService = require('./services/multiInstanceCacheService');

class PortMappingFixer {
  constructor() {
    this.issues = [];
  }

  /**
   * 检查端口映射问题
   */
  async diagnosePortMapping() {
    console.log('🔍 诊断端口映射问题...');

    try {
      // 1. 检查数据库中的活跃规则
      const activeRules = await UserForwardRule.findAll({
        where: { isActive: true },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'expiryDate']
        }]
      });

      console.log(`📊 数据库中的活跃规则: ${activeRules.length}个`);
      activeRules.forEach(rule => {
        console.log(`  规则${rule.id}: 端口${rule.sourcePort} → 用户${rule.user?.username || 'unknown'} (ID: ${rule.userId})`);
      });

      // 2. 检查端口映射缓存
      const portMapping = await multiInstanceCacheService.getPortUserMapping();
      console.log(`📊 端口映射缓存: ${Object.keys(portMapping).length}个端口`);
      
      if (Object.keys(portMapping).length === 0) {
        this.issues.push('端口映射缓存为空');
        console.log('❌ 端口映射缓存为空！');
      } else {
        Object.entries(portMapping).forEach(([port, userInfo]) => {
          console.log(`  端口${port}: 用户${userInfo.username} (ID: ${userInfo.userId})`);
        });
      }

      // 3. 比较数据库规则与缓存映射
      const dbPorts = new Set(activeRules.map(rule => rule.sourcePort.toString()));
      const cachePorts = new Set(Object.keys(portMapping));

      const missingInCache = [...dbPorts].filter(port => !cachePorts.has(port));
      const extraInCache = [...cachePorts].filter(port => !dbPorts.has(port));

      if (missingInCache.length > 0) {
        this.issues.push(`缓存中缺少端口: ${missingInCache.join(', ')}`);
        console.log(`❌ 缓存中缺少端口: ${missingInCache.join(', ')}`);
      }

      if (extraInCache.length > 0) {
        this.issues.push(`缓存中多余端口: ${extraInCache.join(', ')}`);
        console.log(`⚠️ 缓存中多余端口: ${extraInCache.join(', ')}`);
      }

      // 4. 检查特定端口（测试中使用的端口）
      const testPorts = [2365, 6443];
      for (const port of testPorts) {
        const rule = activeRules.find(r => r.sourcePort === port);
        const mapping = portMapping[port];

        console.log(`\n🔍 检查端口${port}:`);
        if (rule) {
          console.log(`  ✅ 数据库规则存在: 用户${rule.user?.username} (ID: ${rule.userId})`);
        } else {
          console.log(`  ❌ 数据库规则不存在`);
          this.issues.push(`端口${port}在数据库中没有活跃规则`);
        }

        if (mapping) {
          console.log(`  ✅ 缓存映射存在: 用户${mapping.username} (ID: ${mapping.userId})`);
        } else {
          console.log(`  ❌ 缓存映射不存在`);
          this.issues.push(`端口${port}在缓存中没有映射`);
        }

        if (rule && mapping && rule.userId !== mapping.userId) {
          console.log(`  ❌ 用户ID不匹配: 数据库${rule.userId} vs 缓存${mapping.userId}`);
          this.issues.push(`端口${port}的用户ID不匹配`);
        }
      }

      return this.issues;

    } catch (error) {
      console.error('❌ 诊断失败:', error);
      this.issues.push(`诊断失败: ${error.message}`);
      return this.issues;
    }
  }

  /**
   * 修复端口映射问题
   */
  async fixPortMapping() {
    console.log('\n🔧 修复端口映射问题...');

    try {
      // 1. 强制刷新缓存
      console.log('🔄 强制刷新端口映射缓存...');
      await multiInstanceCacheService.syncCache();

      // 2. 验证修复结果
      const newPortMapping = await multiInstanceCacheService.getPortUserMapping();
      console.log(`📊 修复后的端口映射: ${Object.keys(newPortMapping).length}个端口`);
      
      Object.entries(newPortMapping).forEach(([port, userInfo]) => {
        console.log(`  端口${port}: 用户${userInfo.username} (ID: ${userInfo.userId})`);
      });

      // 3. 再次检查测试端口
      const testPorts = [2365, 6443];
      let fixedCount = 0;
      
      for (const port of testPorts) {
        if (newPortMapping[port]) {
          console.log(`✅ 端口${port}映射已修复: 用户${newPortMapping[port].username}`);
          fixedCount++;
        } else {
          console.log(`❌ 端口${port}映射仍然缺失`);
        }
      }

      console.log(`\n🎯 修复结果: ${fixedCount}/${testPorts.length} 个测试端口已修复`);
      return fixedCount === testPorts.length;

    } catch (error) {
      console.error('❌ 修复失败:', error);
      return false;
    }
  }

  /**
   * 生成诊断报告
   */
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 端口映射诊断报告');
    console.log('='.repeat(60));

    if (this.issues.length === 0) {
      console.log('✅ 未发现端口映射问题');
    } else {
      console.log(`❌ 发现 ${this.issues.length} 个问题:`);
      this.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
    }

    console.log('\n💡 建议的解决方案:');
    console.log('  1. 确保数据库中的转发规则状态正确');
    console.log('  2. 定期刷新端口映射缓存');
    console.log('  3. 监控端口映射的一致性');
    console.log('  4. 优化缓存同步机制');

    console.log('\n' + '='.repeat(60));
  }
}

// 执行诊断和修复
if (require.main === module) {
  const fixer = new PortMappingFixer();
  
  fixer.diagnosePortMapping()
    .then(issues => {
      fixer.generateReport();
      
      if (issues.length > 0) {
        console.log('\n🔧 尝试修复问题...');
        return fixer.fixPortMapping();
      } else {
        console.log('\n✅ 无需修复');
        return true;
      }
    })
    .then(success => {
      if (success) {
        console.log('\n✅ 端口映射问题已修复');
      } else {
        console.log('\n❌ 端口映射问题修复失败');
      }
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ 执行失败:', error);
      process.exit(1);
    });
}

module.exports = PortMappingFixer;
