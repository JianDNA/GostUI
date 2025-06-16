/**
 * 规则安全校验服务
 * 确保用户无法绕过配额限制激活转发规则
 */

const { User, UserForwardRule } = require('../models');
const quotaCoordinatorService = require('./quotaCoordinatorService');

class RuleSecurityService {
  constructor() {
    this.securityChecks = {
      quotaCheck: true,
      userStatusCheck: true,
      portPermissionCheck: true,
      ruleValidityCheck: true,
      operationLogCheck: true
    };
    
    this.operationLog = new Map(); // 记录用户操作
    this.suspiciousOperations = new Map(); // 记录可疑操作
    
    console.log('🔒 规则安全校验服务已初始化');
  }

  /**
   * 安全校验规则激活请求
   * @param {number} ruleId - 规则ID
   * @param {number} userId - 用户ID
   * @param {string} userRole - 用户角色
   * @param {boolean} isActive - 目标状态
   * @returns {Object} 校验结果
   */
  async validateRuleActivation(ruleId, userId, userRole, isActive) {
    const checkId = `rule_${ruleId}_${Date.now()}`;
    
    try {
      console.log(`🔒 [规则安全] 开始校验规则激活: ${checkId} (规则: ${ruleId}, 用户: ${userId}, 目标状态: ${isActive})`);

      // 1. 基础权限检查
      const permissionCheck = await this.checkBasicPermissions(ruleId, userId, userRole);
      if (!permissionCheck.allowed) {
        return this.createSecurityResult(false, permissionCheck.reason, 'PERMISSION_DENIED');
      }

      // 2. 规则有效性检查
      const rule = await this.getRuleWithUser(ruleId);
      if (!rule) {
        return this.createSecurityResult(false, '规则不存在', 'RULE_NOT_FOUND');
      }

      const validityCheck = await this.checkRuleValidity(rule);
      if (!validityCheck.allowed) {
        return this.createSecurityResult(false, validityCheck.reason, 'RULE_INVALID');
      }

      // 3. 如果是激活操作，进行配额安全检查
      if (isActive) {
        const quotaCheck = await this.checkQuotaSecurity(rule.userId, rule);
        if (!quotaCheck.allowed) {
          // 记录可疑操作
          this.recordSuspiciousOperation(userId, 'QUOTA_BYPASS_ATTEMPT', {
            ruleId,
            quotaReason: quotaCheck.reason,
            timestamp: new Date()
          });
          
          return this.createSecurityResult(false, quotaCheck.reason, 'QUOTA_EXCEEDED');
        }
      }

      // 4. 端口权限检查
      const portCheck = await this.checkPortPermissions(rule);
      if (!portCheck.allowed) {
        return this.createSecurityResult(false, portCheck.reason, 'PORT_PERMISSION_DENIED');
      }

      // 5. 操作频率检查
      const frequencyCheck = this.checkOperationFrequency(userId, ruleId);
      if (!frequencyCheck.allowed) {
        this.recordSuspiciousOperation(userId, 'HIGH_FREQUENCY_OPERATION', {
          ruleId,
          frequency: frequencyCheck.frequency,
          timestamp: new Date()
        });
        
        return this.createSecurityResult(false, frequencyCheck.reason, 'OPERATION_TOO_FREQUENT');
      }

      // 6. 记录正常操作
      this.recordOperation(userId, ruleId, isActive);

      console.log(`✅ [规则安全] 校验通过: ${checkId}`);
      return this.createSecurityResult(true, '校验通过', 'VALIDATION_PASSED');

    } catch (error) {
      console.error(`❌ [规则安全] 校验失败: ${checkId}`, error);
      return this.createSecurityResult(false, `校验异常: ${error.message}`, 'VALIDATION_ERROR');
    }
  }

  /**
   * 检查基础权限
   */
  async checkBasicPermissions(ruleId, userId, userRole) {
    try {
      // Admin用户有所有权限
      if (userRole === 'admin') {
        return { allowed: true, reason: 'admin_privilege' };
      }

      // 普通用户只能操作自己的规则
      const rule = await UserForwardRule.findByPk(ruleId);
      if (!rule) {
        return { allowed: false, reason: '规则不存在' };
      }

      if (rule.userId !== userId) {
        return { allowed: false, reason: '无权限操作其他用户的规则' };
      }

      return { allowed: true, reason: 'permission_granted' };
    } catch (error) {
      return { allowed: false, reason: `权限检查失败: ${error.message}` };
    }
  }

  /**
   * 检查规则有效性
   */
  async checkRuleValidity(rule) {
    try {
      // 检查用户状态
      if (!rule.user.isActive || rule.user.userStatus !== 'active') {
        return { 
          allowed: false, 
          reason: `用户状态异常: ${rule.user.userStatus}, 激活状态: ${rule.user.isActive}` 
        };
      }

      // 检查用户过期时间
      if (rule.user.role !== 'admin' && rule.user.expiryDate && new Date(rule.user.expiryDate) <= new Date()) {
        return { 
          allowed: false, 
          reason: `用户已过期: ${rule.user.expiryDate}` 
        };
      }

      return { allowed: true, reason: 'rule_valid' };
    } catch (error) {
      return { allowed: false, reason: `规则有效性检查失败: ${error.message}` };
    }
  }

  /**
   * 检查配额安全性
   */
  async checkQuotaSecurity(userId, rule) {
    try {
      // 使用统一配额协调器进行实时检查
      const quotaResult = await quotaCoordinatorService.checkUserQuota(userId, 'rule_activation_check');
      
      if (!quotaResult.allowed) {
        console.log(`🚫 [规则安全] 用户 ${userId} 配额检查失败: ${quotaResult.reason}`);
        return { 
          allowed: false, 
          reason: `流量配额限制: ${quotaResult.reason}` 
        };
      }

      // 额外的安全检查：如果用户接近配额限制，给出警告
      if (quotaResult.usagePercentage && quotaResult.usagePercentage > 95) {
        console.log(`⚠️ [规则安全] 用户 ${userId} 接近配额限制: ${quotaResult.usagePercentage}%`);
        return { 
          allowed: false, 
          reason: `流量使用率过高 (${quotaResult.usagePercentage.toFixed(1)}%)，为避免立即超限，暂时禁止激活规则` 
        };
      }

      return { allowed: true, reason: 'quota_check_passed' };
    } catch (error) {
      console.error(`❌ [规则安全] 配额检查异常:`, error);
      return { allowed: false, reason: `配额检查异常: ${error.message}` };
    }
  }

  /**
   * 检查端口权限
   */
  async checkPortPermissions(rule) {
    try {
      const user = rule.user;
      const sourcePort = rule.sourcePort;

      // 获取当前操作用户的角色（如果存在）
      const currentUserRole = global.currentRequestUser?.role;

      // 🔧 Admin用户不受任何端口限制，可以使用任何端口
      if (user.role === 'admin' || currentUserRole === 'admin') {
        return { allowed: true, reason: 'admin_port_privilege' };
      }

      // 检查端口范围（仅对非admin用户）
      if (user.portRangeStart && user.portRangeEnd) {
        if (sourcePort < user.portRangeStart || sourcePort > user.portRangeEnd) {
          return {
            allowed: false,
            reason: `端口 ${sourcePort} 超出允许范围 ${user.portRangeStart}-${user.portRangeEnd}`
          };
        }
      }

      // 检查危险端口（仅对非admin用户）
      const dangerousPorts = [22, 80, 443, 8080, 3306, 5432, 6379, 27017];
      if (dangerousPorts.includes(sourcePort)) {
        return {
          allowed: false,
          reason: `端口 ${sourcePort} 为系统保留端口，禁止使用`
        };
      }

      return { allowed: true, reason: 'port_permission_granted' };
    } catch (error) {
      return { allowed: false, reason: `端口权限检查失败: ${error.message}` };
    }
  }

  /**
   * 检查操作频率
   */
  checkOperationFrequency(userId, ruleId) {
    const key = `${userId}_${ruleId}`;
    const now = Date.now();
    const timeWindow = 60000; // 1分钟时间窗口
    const maxOperations = 5; // 最大操作次数

    if (!this.operationLog.has(key)) {
      this.operationLog.set(key, []);
    }

    const operations = this.operationLog.get(key);
    
    // 清理过期操作记录
    const validOperations = operations.filter(time => now - time < timeWindow);
    this.operationLog.set(key, validOperations);

    if (validOperations.length >= maxOperations) {
      return { 
        allowed: false, 
        reason: `操作过于频繁，请稍后再试 (${validOperations.length}/${maxOperations})`,
        frequency: validOperations.length
      };
    }

    return { allowed: true, reason: 'frequency_check_passed' };
  }

  /**
   * 记录操作
   */
  recordOperation(userId, ruleId, isActive) {
    const key = `${userId}_${ruleId}`;
    const now = Date.now();

    if (!this.operationLog.has(key)) {
      this.operationLog.set(key, []);
    }

    this.operationLog.get(key).push(now);
    
    console.log(`📝 [规则安全] 记录操作: 用户 ${userId}, 规则 ${ruleId}, 状态 ${isActive}`);
  }

  /**
   * 记录可疑操作
   */
  recordSuspiciousOperation(userId, type, details) {
    const key = `${userId}_${type}`;
    
    if (!this.suspiciousOperations.has(key)) {
      this.suspiciousOperations.set(key, []);
    }

    this.suspiciousOperations.get(key).push(details);
    
    console.log(`🚨 [规则安全] 记录可疑操作: 用户 ${userId}, 类型 ${type}`, details);
  }

  /**
   * 获取规则和用户信息
   */
  async getRuleWithUser(ruleId) {
    try {
      return await UserForwardRule.findByPk(ruleId, {
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'expiryDate', 'portRangeStart', 'portRangeEnd', 'trafficQuota', 'usedTraffic']
        }]
      });
    } catch (error) {
      console.error('获取规则信息失败:', error);
      return null;
    }
  }

  /**
   * 创建安全检查结果
   */
  createSecurityResult(allowed, reason, code) {
    return {
      allowed,
      reason,
      code,
      timestamp: new Date(),
      checkType: 'rule_activation_security'
    };
  }

  /**
   * 获取可疑操作报告
   */
  getSuspiciousOperationsReport() {
    const report = {};
    
    for (const [key, operations] of this.suspiciousOperations.entries()) {
      report[key] = {
        count: operations.length,
        latestOperation: operations[operations.length - 1],
        operations: operations
      };
    }
    
    return report;
  }

  /**
   * 清理过期记录
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24小时

    // 清理操作记录
    for (const [key, operations] of this.operationLog.entries()) {
      const validOperations = operations.filter(time => now - time < maxAge);
      if (validOperations.length === 0) {
        this.operationLog.delete(key);
      } else {
        this.operationLog.set(key, validOperations);
      }
    }

    // 清理可疑操作记录
    for (const [key, operations] of this.suspiciousOperations.entries()) {
      const validOperations = operations.filter(op => now - new Date(op.timestamp).getTime() < maxAge);
      if (validOperations.length === 0) {
        this.suspiciousOperations.delete(key);
      } else {
        this.suspiciousOperations.set(key, validOperations);
      }
    }

    console.log('🧹 [规则安全] 清理过期记录完成');
  }
}

// 创建单例实例
const ruleSecurityService = new RuleSecurityService();

// 定期清理
setInterval(() => {
  ruleSecurityService.cleanup();
}, 60 * 60 * 1000); // 每小时清理一次

module.exports = ruleSecurityService;
