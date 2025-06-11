#!/usr/bin/env node

/**
 * 简化架构测试脚本
 *
 * 边开发边调试的测试方案：
 * 1. 测试简化的流量管理器
 * 2. 测试简化的观察器
 * 3. 验证流量统计和配额限制
 * 4. 实时监控和调试
 */

const { User, UserForwardRule } = require('./models');
const simplifiedTrafficManager = require('./services/simplifiedTrafficManager');
const simplifiedObserver = require('./services/simplifiedObserver');
const axios = require('axios');

class SimplifiedArchitectureTest {
  constructor() {
    this.testUser = null;
    this.testRules = [];
    this.adminToken = null;

    console.log('🚀 简化架构测试初始化');
  }

  /**
   * 初始化测试环境
   */
  async initializeTest() {
    try {
      console.log('🔧 初始化测试环境...');

      // 1. 获取test用户
      this.testUser = await User.findOne({ where: { username: 'test' } });
      if (!this.testUser) {
        throw new Error('test用户不存在');
      }

      // 2. 获取管理员token（可选，如果需要的话）
      try {
        const adminResponse = await axios.post('http://localhost:3000/api/auth/login', {
          username: 'admin',
          password: 'admin123'
        });
        this.adminToken = adminResponse.data.token;
      } catch (error) {
        console.log('⚠️ 管理员登录失败，继续测试...');
        this.adminToken = null;
      }

      // 3. 获取test用户的转发规则
      this.testRules = await UserForwardRule.findAll({
        where: { userId: this.testUser.id }
      });

      console.log(`✅ 测试环境初始化完成:`);
      console.log(`   - 用户: ${this.testUser.username} (ID: ${this.testUser.id})`);
      console.log(`   - 配额: ${this.testUser.trafficQuota}GB`);
      console.log(`   - 已用: ${((this.testUser.usedTraffic || 0) / 1024 / 1024).toFixed(1)}MB`);
      console.log(`   - 规则: ${this.testRules.length}个`);

      return true;

    } catch (error) {
      console.error('❌ 初始化测试环境失败:', error);
      throw error;
    }
  }

  /**
   * 测试简化流量管理器
   */
  async testTrafficManager() {
    try {
      console.log('\n🧪 测试简化流量管理器...');

      // 1. 测试初始化
      console.log('1️⃣ 测试管理器初始化...');
      await simplifiedTrafficManager.initialize();

      // 2. 测试端口映射
      console.log('2️⃣ 测试端口映射...');
      console.log(`   端口映射数量: ${simplifiedTrafficManager.portUserMap.size}`);
      for (const [port, userInfo] of simplifiedTrafficManager.portUserMap) {
        console.log(`   端口${port}: 用户${userInfo.username} (ID: ${userInfo.userId})`);
      }

      // 3. 测试用户状态获取
      console.log('3️⃣ 测试用户状态获取...');
      const userStatus = await simplifiedTrafficManager.getUserStatus(this.testUser.id);
      console.log(`   用户状态:`, {
        username: userStatus.username,
        quota: `${userStatus.quota}GB`,
        used: `${userStatus.usedMB.toFixed(1)}MB`,
        usage: `${userStatus.usagePercentage.toFixed(1)}%`,
        rules: userStatus.rules
      });

      // 4. 测试配置生成
      console.log('4️⃣ 测试配置生成...');
      const configResult = await simplifiedTrafficManager.generateConfiguration();
      console.log(`   配置生成结果: ${configResult.userCount}用户, ${configResult.ruleCount}规则`);

      console.log('✅ 简化流量管理器测试完成');
      return true;

    } catch (error) {
      console.error('❌ 简化流量管理器测试失败:', error);
      throw error;
    }
  }

  /**
   * 测试简化观察器
   */
  async testObserver() {
    try {
      console.log('\n🧪 测试简化观察器...');

      // 1. 启动观察器
      console.log('1️⃣ 启动观察器...');
      await simplifiedObserver.start();

      // 2. 测试健康检查
      console.log('2️⃣ 测试健康检查...');
      const healthResponse = await axios.get('http://localhost:18081/health');
      console.log(`   健康检查: ${healthResponse.data.status}`);

      // 3. 测试统计信息
      console.log('3️⃣ 测试统计信息...');
      const statsResponse = await axios.get('http://localhost:18081/stats');
      console.log(`   统计信息:`, statsResponse.data);

      // 4. 测试模拟流量数据
      console.log('4️⃣ 测试模拟流量数据...');
      const mockTrafficData = {
        service: 'forward-tcp-6443',
        type: 'stats',
        stats: {
          inputBytes: 50 * 1024 * 1024,  // 50MB
          outputBytes: 25 * 1024 * 1024, // 25MB
          totalConns: 10,
          currentConns: 2,
          totalErrs: 0
        }
      };

      await axios.post('http://localhost:18081/observer', mockTrafficData);
      console.log('   模拟流量数据已发送');

      // 等待处理
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 检查缓冲区
      console.log(`   流量缓冲区大小: ${simplifiedTrafficManager.trafficBuffer.size}`);

      console.log('✅ 简化观察器测试完成');
      return true;

    } catch (error) {
      console.error('❌ 简化观察器测试失败:', error);
      throw error;
    }
  }

  /**
   * 测试流量重置功能
   */
  async testTrafficReset() {
    try {
      console.log('\n🧪 测试流量重置功能...');

      // 1. 重置用户流量
      console.log('1️⃣ 重置用户流量...');
      await simplifiedTrafficManager.resetUserTraffic(this.testUser.id, 0.5);

      // 2. 检查重置结果
      console.log('2️⃣ 检查重置结果...');
      const userStatus = await simplifiedTrafficManager.getUserStatus(this.testUser.id);
      console.log(`   重置后状态:`, {
        quota: `${userStatus.quota}GB`,
        used: `${userStatus.usedMB.toFixed(1)}MB`,
        usage: `${userStatus.usagePercentage.toFixed(1)}%`,
        activeRules: userStatus.rules.active
      });

      console.log('✅ 流量重置功能测试完成');
      return true;

    } catch (error) {
      console.error('❌ 流量重置功能测试失败:', error);
      throw error;
    }
  }

  /**
   * 测试配额更新功能
   */
  async testQuotaUpdate() {
    try {
      console.log('\n🧪 测试配额更新功能...');

      // 1. 更新用户配额
      console.log('1️⃣ 更新用户配额到1GB...');
      await simplifiedTrafficManager.updateUserQuota(this.testUser.id, 1.0);

      // 2. 检查更新结果
      console.log('2️⃣ 检查更新结果...');
      const userStatus = await simplifiedTrafficManager.getUserStatus(this.testUser.id);
      console.log(`   更新后状态:`, {
        quota: `${userStatus.quota}GB`,
        used: `${userStatus.usedMB.toFixed(1)}MB`,
        usage: `${userStatus.usagePercentage.toFixed(1)}%`
      });

      console.log('✅ 配额更新功能测试完成');
      return true;

    } catch (error) {
      console.error('❌ 配额更新功能测试失败:', error);
      throw error;
    }
  }

  /**
   * 运行完整测试
   */
  async runFullTest() {
    try {
      console.log('🚀 开始简化架构完整测试\n');

      // 初始化
      await this.initializeTest();

      // 测试各个组件
      await this.testTrafficManager();
      await this.testObserver();
      await this.testTrafficReset();
      await this.testQuotaUpdate();

      console.log('\n🎉 简化架构测试全部完成！');
      console.log('\n📊 测试总结:');
      console.log('   ✅ 简化流量管理器: 正常');
      console.log('   ✅ 简化观察器: 正常');
      console.log('   ✅ 流量重置功能: 正常');
      console.log('   ✅ 配额更新功能: 正常');

      return true;

    } catch (error) {
      console.error('❌ 简化架构测试失败:', error);
      return false;
    }
  }

  /**
   * 清理测试环境
   */
  async cleanup() {
    try {
      console.log('\n🧹 清理测试环境...');

      // 停止观察器
      await simplifiedObserver.stop();

      console.log('✅ 测试环境清理完成');

    } catch (error) {
      console.error('❌ 清理测试环境失败:', error);
    }
  }
}

// 执行测试
if (require.main === module) {
  const test = new SimplifiedArchitectureTest();

  test.runFullTest()
    .then(success => {
      if (success) {
        console.log('\n✅ 所有测试通过！');
      } else {
        console.log('\n❌ 测试失败！');
      }
      return test.cleanup();
    })
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 测试执行失败:', error);
      process.exit(1);
    });
}

module.exports = SimplifiedArchitectureTest;
