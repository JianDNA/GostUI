#!/usr/bin/env node

const axios = require('axios');
const { User, UserForwardRule } = require('./models');

class UserExpiryTester {
  constructor() {
    this.baseURL = 'http://localhost:3000/api';
    this.adminToken = null;
    this.testUserId = 2; // test用户
  }

  async login() {
    try {
      const response = await axios.post(`${this.baseURL}/auth/login`, {
        username: 'admin',
        password: 'admin123'
      });
      this.adminToken = response.data.token;
      console.log('✅ 管理员登录成功');
      return true;
    } catch (error) {
      console.error('❌ 登录失败:', error.message);
      return false;
    }
  }

  async getCurrentUserStatus() {
    try {
      const user = await User.findByPk(this.testUserId, {
        attributes: ['id', 'username', 'userStatus', 'isActive', 'expiryDate', 'trafficQuota', 'usedTraffic']
      });

      if (!user) {
        console.error('❌ 测试用户不存在');
        return null;
      }

      const isExpired = user.isExpired();
      const canUseService = user.canUseService();

      console.log(`📊 用户状态信息:`);
      console.log(`   - 用户名: ${user.username}`);
      console.log(`   - 数据库状态: ${user.userStatus}`);
      console.log(`   - 激活状态: ${user.isActive}`);
      console.log(`   - 过期时间: ${user.expiryDate ? user.expiryDate.toLocaleString() : '无'}`);
      console.log(`   - 是否过期: ${isExpired}`);
      console.log(`   - 可使用服务: ${canUseService}`);
      console.log(`   - 流量配额: ${user.trafficQuota}GB`);
      console.log(`   - 已用流量: ${(user.usedTraffic / 1024 / 1024 / 1024).toFixed(3)}GB`);

      return { user, isExpired, canUseService };
    } catch (error) {
      console.error('❌ 获取用户状态失败:', error);
      return null;
    }
  }

  async getUserRules() {
    try {
      const rules = await UserForwardRule.findAll({
        where: { userId: this.testUserId },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'userStatus', 'isActive', 'expiryDate', 'role']
        }]
      });

      console.log(`📋 用户转发规则 (${rules.length}个):`);
      rules.forEach(rule => {
        const computedActive = rule.isActive; // 计算属性
        console.log(`   - 规则: ${rule.name} (端口${rule.sourcePort})`);
        console.log(`     数据库isActive: ${rule.getDataValue('isActive')}`);
        console.log(`     计算属性isActive: ${computedActive}`);
      });

      return rules;
    } catch (error) {
      console.error('❌ 获取用户规则失败:', error);
      return [];
    }
  }

  async setUserExpiry(expiryDate) {
    try {
      const user = await User.findByPk(this.testUserId);
      if (!user) {
        console.error('❌ 用户不存在');
        return false;
      }

      await user.update({ expiryDate });
      console.log(`✅ 用户过期时间已设置为: ${expiryDate ? expiryDate.toLocaleString() : '无'}`);
      return true;
    } catch (error) {
      console.error('❌ 设置用户过期时间失败:', error);
      return false;
    }
  }

  async checkGostConfig() {
    try {
      const gostConfigService = require('./services/gostConfigService');
      const config = await gostConfigService.generateGostConfig();
      
      console.log(`🔧 GOST配置生成结果:`);
      console.log(`   - 服务数量: ${config.services.length}`);
      
      const testUserServices = config.services.filter(service => 
        service.metadata && service.metadata.userId == this.testUserId
      );
      
      console.log(`   - test用户服务数量: ${testUserServices.length}`);
      testUserServices.forEach(service => {
        console.log(`     * ${service.name} (端口${service.addr.replace(':', '')})`);
      });

      return config;
    } catch (error) {
      console.error('❌ 检查GOST配置失败:', error);
      return null;
    }
  }

  async testExpiryScenarios() {
    console.log('\n🧪 开始测试用户过期场景...\n');

    // 场景1: 用户未过期
    console.log('📝 场景1: 用户未过期');
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1); // 一个月后过期
    
    await this.setUserExpiry(futureDate);
    await this.getCurrentUserStatus();
    await this.getUserRules();
    await this.checkGostConfig();

    console.log('\n' + '='.repeat(60) + '\n');

    // 场景2: 用户已过期
    console.log('📝 场景2: 用户已过期');
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // 昨天过期
    
    await this.setUserExpiry(pastDate);
    await this.getCurrentUserStatus();
    await this.getUserRules();
    await this.checkGostConfig();

    console.log('\n' + '='.repeat(60) + '\n');

    // 场景3: 用户从过期恢复
    console.log('📝 场景3: 用户从过期恢复');
    const newFutureDate = new Date();
    newFutureDate.setMonth(newFutureDate.getMonth() + 2); // 两个月后过期
    
    await this.setUserExpiry(newFutureDate);
    await this.getCurrentUserStatus();
    await this.getUserRules();
    await this.checkGostConfig();

    console.log('\n' + '='.repeat(60) + '\n');

    // 场景4: 永不过期
    console.log('📝 场景4: 永不过期');
    await this.setUserExpiry(null);
    await this.getCurrentUserStatus();
    await this.getUserRules();
    await this.checkGostConfig();
  }

  async run() {
    console.log('🧪 用户过期时间处理测试\n');

    if (!(await this.login())) {
      return;
    }

    console.log('📊 当前用户状态:');
    await this.getCurrentUserStatus();
    console.log('\n');

    await this.testExpiryScenarios();

    console.log('\n🎉 测试完成');
  }
}

// 运行测试
if (require.main === module) {
  const tester = new UserExpiryTester();
  tester.run().catch(console.error);
}

module.exports = UserExpiryTester;
