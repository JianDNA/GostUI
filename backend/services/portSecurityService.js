/**
 * 端口安全验证服务
 * 负责验证端口配置的安全性，防止用户配置危险端口
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

class PortSecurityService {
  constructor() {
    this.config = null;
    this.loadConfig();
  }

  /**
   * 加载端口安全配置
   */
  loadConfig() {
    try {
      const configPath = path.join(__dirname, '../config/port-security.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      this.config = JSON.parse(configData);
      console.log('✅ 端口安全配置加载成功');
    } catch (error) {
      console.error('❌ 端口安全配置加载失败:', error.message);
      // 使用默认配置
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * 获取默认安全配置
   */
  getDefaultConfig() {
    return {
      security: {
        enablePortRestrictions: true,
        allowPrivilegedPorts: false,
        maxPortsPerUser: 10,
        portRangeMin: 1024,
        portRangeMax: 65535
      },
      reservedPorts: {
        system: { ports: [22, 23, 25, 53, 80, 110, 143, 443, 993, 995] },
        application: { ports: [3000, 8080, 8443, 9000, 9090] },
        database: { ports: [3306, 5432, 6379, 27017, 1433, 1521] }
      }
    };
  }

  /**
   * 验证端口是否安全可用
   * @param {number} port - 要验证的端口
   * @param {string} userRole - 用户角色 (user/admin)
   * @param {string} userId - 用户ID
   * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
   */
  async validatePort(port, userRole = 'user', userId = null) {
    const result = {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };

    // 1. 基本端口范围验证
    if (!this.isValidPortNumber(port)) {
      result.valid = false;
      result.errors.push(this.formatMessage('invalidPort', { port }));
      return result;
    }

    // 2. 检查是否启用端口限制
    if (!this.config.security.enablePortRestrictions) {
      return result; // 如果禁用限制，直接返回有效
    }

    // 3. 特权端口检查
    if (port < 1024 && !this.config.security.allowPrivilegedPorts && userRole !== 'admin') {
      result.valid = false;
      result.errors.push(this.formatMessage('privilegedPort', { port }));
    }

    // 4. 保留端口检查
    if (this.isReservedPort(port)) {
      result.valid = false;
      result.errors.push(this.formatMessage('portReserved', { port }));
    }

    // 5. 端口范围检查
    if (!this.isInAllowedRange(port, userRole)) {
      result.valid = false;
      result.errors.push(this.formatMessage('portOutOfRange', {
        port,
        min: this.config.security.portRangeMin,
        max: this.config.security.portRangeMax
      }));
    }

    // 6. 端口占用检查
    const isInUse = await this.isPortInUse(port);
    if (isInUse) {
      result.valid = false;
      result.errors.push(this.formatMessage('portInUse', { port }));
    }

    // 7. 用户配额检查
    if (userId) {
      const quotaExceeded = await this.checkUserQuota(userId);
      if (quotaExceeded) {
        result.valid = false;
        result.errors.push(this.formatMessage('quotaExceeded', {
          max: this.config.security.maxPortsPerUser
        }));
      }
    }

    // 8. 添加警告和建议
    this.addWarningsAndSuggestions(port, result);

    return result;
  }

  /**
   * 检查端口号是否有效
   */
  isValidPortNumber(port) {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }

  /**
   * 检查是否为保留端口
   */
  isReservedPort(port) {
    const reserved = this.config.reservedPorts;

    // 检查各类保留端口
    for (const category of Object.values(reserved)) {
      if (category.ports && category.ports.includes(port)) {
        return true;
      }

      // 检查端口范围
      if (category.ranges) {
        for (const range of category.ranges) {
          if (port >= range.start && port <= range.end) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 检查端口是否在允许范围内
   */
  isInAllowedRange(port, userRole) {
    const allowedRanges = this.config.allowedRanges;
    const ranges = allowedRanges[userRole] || allowedRanges.user;

    for (const range of ranges) {
      if (port >= range.start && port <= range.end) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查端口是否被占用
   */
  async isPortInUse(port) {
    try {
      // Linux/Mac 使用 ss 命令检查
      const { stdout } = await execPromise(`ss -tlnp | grep :${port} || echo ""`);
      return stdout.trim().length > 0;
    } catch (error) {
      console.warn(`⚠️ 检查端口 ${port} 占用状态失败:`, error.message);
      return false; // 检查失败时假设端口可用
    }
  }

  /**
   * 检查用户端口配额
   */
  async checkUserQuota(userId) {
    try {
      // 查询数据库获取用户当前使用的端口数量
      const { models } = require('./dbService');
      const { UserForwardRules } = models;

      // 获取用户的所有规则，然后使用计算属性过滤
      const userRules = await UserForwardRules.findAll({
        where: { userId: userId },
        include: [{ model: models.User, as: 'user' }]
      });

      // 使用计算属性计算实际激活的规则数量
      const activeRules = userRules.filter(rule => {
        return rule.isActive && rule.getComputedIsActive();
      });

      const userPortCount = activeRules.length;

      return userPortCount >= this.config.security.maxPortsPerUser;
    } catch (error) {
      console.warn(`⚠️ 检查用户 ${userId} 端口配额失败:`, error.message);
      return false;
    }
  }

  /**
   * 添加警告和建议
   */
  addWarningsAndSuggestions(port, result) {
    // 常用端口警告
    const commonPorts = [80, 443, 8080, 8443, 3000, 5000, 8000, 9000];
    if (commonPorts.includes(port)) {
      result.warnings.push(this.formatMessage('commonPort', { port }));
    }

    // 开发端口警告
    const devPorts = [3001, 4000, 5000, 5173, 8000, 8081, 9229];
    if (devPorts.includes(port)) {
      result.warnings.push(this.formatMessage('developmentPort', { port }));
    }

    // 添加端口建议
    if (!result.valid) {
      result.suggestions = this.getSuggestedPorts();
    }
  }

  /**
   * 获取推荐端口
   */
  getSuggestedPorts() {
    const suggestions = this.config.recommendations?.suggestions;
    if (!suggestions) return [];

    return [
      ...suggestions.web.slice(0, 3),
      ...suggestions.api.slice(0, 2),
      ...suggestions.proxy.slice(0, 2)
    ];
  }

  /**
   * 格式化错误消息
   */
  formatMessage(messageKey, params = {}) {
    const messages = this.config.messages?.errors || {};
    let message = messages[messageKey] || `未知错误: ${messageKey}`;

    // 替换参数
    for (const [key, value] of Object.entries(params)) {
      message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }

    return message;
  }

  /**
   * 批量验证端口列表
   */
  async validatePorts(ports, userRole = 'user', userId = null) {
    const results = [];

    for (const port of ports) {
      const result = await this.validatePort(port, userRole, userId);
      results.push({ port, ...result });
    }

    return results;
  }

  /**
   * 获取可用端口建议
   */
  async getAvailablePorts(count = 5, userRole = 'user') {
    const availablePorts = [];
    const ranges = this.config.allowedRanges[userRole] || this.config.allowedRanges.user;

    for (const range of ranges) {
      for (let port = range.start; port <= range.end && availablePorts.length < count; port++) {
        const result = await this.validatePort(port, userRole);
        if (result.valid) {
          availablePorts.push(port);
        }
      }

      if (availablePorts.length >= count) break;
    }

    return availablePorts;
  }

  /**
   * 获取端口安全配置信息
   */
  getSecurityInfo() {
    return {
      version: this.config.version,
      security: this.config.security,
      reservedPortsCount: this.getReservedPortsCount(),
      allowedRanges: this.config.allowedRanges,
      recommendations: this.config.recommendations
    };
  }

  /**
   * 获取保留端口总数
   */
  getReservedPortsCount() {
    let count = 0;
    const reserved = this.config.reservedPorts;

    for (const category of Object.values(reserved)) {
      if (category.ports) {
        count += category.ports.length;
      }
    }

    return count;
  }
}

// 创建单例实例
const portSecurityService = new PortSecurityService();

module.exports = {
  PortSecurityService,
  portSecurityService
};
