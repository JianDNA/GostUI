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

    // 🔧 管理员权限：admin用户可以使用任何端口，跳过所有限制检查
    // 获取当前操作用户的角色（如果存在）
    const currentUserRole = global.currentRequestUser?.role;
    if (userRole === 'admin' || currentUserRole === 'admin') {
      // 仍然检查端口占用，但跳过其他限制
      const isInUse = await this.isPortInUse(port);
      if (isInUse) {
        result.valid = false;
        result.errors.push(this.formatMessage('portInUse', { port }));
      } else {
        result.warnings.push(`管理员权限：可以使用端口 ${port}`);
      }
      return result;
    }
    
    // 🔧 管理员为普通用户创建规则时的特殊处理：只检查端口是否在用户允许的范围内
    if (userRole === 'admin_for_user' && userId) {
      console.log(`管理员为用户 ${userId} 创建规则，检查端口 ${port} 是否在用户允许范围内`);
      
      // 检查端口是否被占用
      const isInUse = await this.isPortInUse(port);
      if (isInUse) {
        result.valid = false;
        result.errors.push(this.formatMessage('portInUse', { port }));
        return result;
      }
      
      // 获取用户信息
      try {
        const { models } = require('./dbService');
        const User = models.User;
        
        const user = await User.findByPk(userId);
        if (!user) {
          result.valid = false;
          result.errors.push(`用户 ${userId} 不存在`);
          return result;
        }
        
        // 检查端口是否在用户允许的范围内
        if (user.isPortInRange(port)) {
          result.warnings.push(`管理员为用户创建规则：使用用户允许的端口 ${port}`);
          return result;
        } else {
          result.valid = false;
          
          // 生成详细的错误信息
          let errorMsg = `端口 ${port} 不在用户允许的范围内`;
          
          if (user.portRangeStart && user.portRangeEnd) {
            errorMsg += `。用户端口范围：${user.portRangeStart}-${user.portRangeEnd}`;
          }
          
          const additionalPorts = await user.getAdditionalPortsAsync();
          if (additionalPorts && additionalPorts.length > 0) {
            errorMsg += `，额外端口：${additionalPorts.join(', ')}`;
          }
          
          result.errors.push(errorMsg);
          return result;
        }
      } catch (error) {
        console.error(`检查用户 ${userId} 端口范围失败:`, error);
        result.valid = false;
        result.errors.push(`检查用户端口范围失败：${error.message}`);
        return result;
      }
    }

    // 3. 特权端口检查（仅对非admin用户）
    if (port < 1024 && !this.config.security.allowPrivilegedPorts) {
      result.valid = false;
      result.errors.push(this.formatMessage('privilegedPort', { port }));
    }

    // 4. 保留端口检查（仅对非admin用户）
    const reservedCheck = this.isReservedPort(port);
    if (reservedCheck.reserved) {
      result.valid = false;
      result.errors.push(reservedCheck.detail);
    }

    // 5. 端口范围检查（仅对非admin用户）
    const isInRange = await this.isInAllowedRange(port, userRole, userId);
    if (!isInRange) {
      result.valid = false;

      // 生成更详细的错误信息，包含范围描述
      const userRanges = this.config.allowedRanges.user.map(r =>
        `${r.start}-${r.end}(${r.description})`
      ).join(', ');

      // 检查是否为特殊端口但角色不匹配
      const specialPorts = this.config.specialPorts;
      if (specialPorts && specialPorts.testing && specialPorts.testing.ports.includes(port)) {
        if (!specialPorts.testing.allowedRoles.includes(userRole)) {
          result.errors.push(`端口 ${port} 是${specialPorts.testing.description}，但您的角色 (${userRole}) 无权使用。允许的角色：${specialPorts.testing.allowedRoles.join(', ')}`);
        }
      } else {
        // 🔧 如果有用户ID，也显示用户的额外端口信息
        let errorMessage = `端口 ${port} 不在允许范围内。用户端口范围：${userRanges}`;
        if (userId) {
          const additionalPorts = await this.getUserAdditionalPorts(userId);
          if (additionalPorts.length > 0) {
            errorMessage += `，额外端口：${additionalPorts.join(', ')}`;
          }
        }
        result.errors.push(errorMessage);
      }
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
   * @param {number} port - 端口号
   * @returns {Object} - {reserved: boolean, category: string, description: string, detail: string}
   */
  isReservedPort(port) {
    const reserved = this.config.reservedPorts;

    // 检查各类保留端口
    for (const [categoryName, category] of Object.entries(reserved)) {
      if (category.ports && category.ports.includes(port)) {
        return {
          reserved: true,
          category: categoryName,
          description: category.description,
          detail: `端口 ${port} 是${category.description}，禁止用户使用`
        };
      }

      // 检查端口范围
      if (category.ranges) {
        for (const range of category.ranges) {
          if (port >= range.start && port <= range.end) {
            return {
              reserved: true,
              category: categoryName,
              description: range.description || category.description,
              detail: `端口 ${port} 属于${range.description || category.description}，禁止用户使用`
            };
          }
        }
      }
    }

    return {
      reserved: false,
      category: null,
      description: null,
      detail: null
    };
  }

  /**
   * 检查端口是否在允许范围内
   */
  async isInAllowedRange(port, userRole, userId = null) {
    const allowedRanges = this.config.allowedRanges;
    const ranges = allowedRanges[userRole] || allowedRanges.user;

    // 首先检查常规端口范围
    for (const range of ranges) {
      if (port >= range.start && port <= range.end) {
        return true;
      }
    }

    // 检查特殊端口（如测试端口）
    if (this.isSpecialPort(port, userRole)) {
      return true;
    }

    // 🔧 检查用户的额外端口（如果提供了userId）
    if (userId) {
      const userAdditionalPorts = await this.getUserAdditionalPorts(userId);
      if (userAdditionalPorts.includes(port)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 检查是否为特殊端口（如测试端口）
   */
  isSpecialPort(port, userRole) {
    const specialPorts = this.config.specialPorts;
    if (!specialPorts) return false;

    // 检查测试端口
    if (specialPorts.testing && specialPorts.testing.ports.includes(port)) {
      return specialPorts.testing.allowedRoles.includes(userRole);
    }

    return false;
  }

  /**
   * 获取用户的额外端口列表
   * @param {string} userId - 用户ID
   * @returns {Promise<number[]>} - 额外端口列表
   */
  async getUserAdditionalPorts(userId) {
    try {
      const { models } = require('./dbService');
      const User = models.User;

      const user = await User.findByPk(userId);
      if (!user) {
        console.warn(`⚠️ 获取用户额外端口: 用户 ${userId} 不存在`);
        return [];
      }

      const additionalPorts = await user.getAdditionalPortsAsync();
      console.log(`✅ 用户 ${userId} 额外端口: ${JSON.stringify(additionalPorts)}`);
      return additionalPorts;
    } catch (error) {
      console.warn(`⚠️ 获取用户 ${userId} 额外端口失败:`, error.message);
      return [];
    }
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
      const models = require('./dbService');
      const UserForwardRules = models.UserForwardRules;

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
      result.warnings.push(this.formatWarningMessage('commonPort', { port }));
    }

    // 开发端口警告
    const devPorts = [3001, 4000, 5000, 5173, 8000, 8081, 9229];
    if (devPorts.includes(port)) {
      result.warnings.push(this.formatWarningMessage('developmentPort', { port }));
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
   * 格式化警告消息
   */
  formatWarningMessage(messageKey, params = {}) {
    const messages = this.config.messages?.warnings || {};
    let message = messages[messageKey] || `未知警告: ${messageKey}`;

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

  /**
   * 验证目标地址是否允许访问
   * @param {string} targetAddress - 目标地址 (IP:端口 或 [IPv6]:端口)
   * @param {string} userRole - 用户角色 (user/admin)
   * @returns {Promise<{valid: boolean, errors: string[], warnings: string[]}>}
   */
  async validateTargetAddress(targetAddress, userRole = 'user') {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!targetAddress) {
      result.valid = false;
      result.errors.push('目标地址不能为空');
      return result;
    }

    // 解析目标地址
    const parsedTarget = this.parseTargetAddress(targetAddress);
    if (!parsedTarget) {
      result.valid = false;
      result.errors.push('目标地址格式无效，请使用 IP:端口 格式');
      return result;
    }

    const { ip, port } = parsedTarget;

    // 验证端口范围
    if (port < 1 || port > 65535) {
      result.valid = false;
      result.errors.push(`目标端口 ${port} 无效，必须在 1-65535 范围内`);
    }

    // 🔧 Admin用户可以访问任何地址
    if (userRole === 'admin') {
      result.warnings.push('管理员权限：可以转发任何地址');
      return result;
    }

    // 🔧 非Admin用户只能转发公网IPv4地址
    const addressCheck = this.checkAddressType(ip);

    if (!addressCheck.isPublicIPv4) {
      result.valid = false;

      if (addressCheck.isLocalhost) {
        result.errors.push('普通用户不能转发本地地址 (127.0.0.1, localhost, ::1)');
      } else if (addressCheck.isPrivateNetwork) {
        result.errors.push(`普通用户不能转发内网地址 (${ip})`);
      } else if (addressCheck.isIPv6) {
        result.errors.push('普通用户不能转发IPv6地址，请使用公网IPv4地址');
      } else if (addressCheck.isReserved) {
        result.errors.push(`普通用户不能转发保留地址 (${ip})`);
      } else {
        result.errors.push(`普通用户只能转发公网IPv4地址，当前地址 ${ip} 不被允许`);
      }

      result.errors.push('提示：请使用公网IPv4地址，如 8.8.8.8、1.1.1.1 等');
    }

    return result;
  }

  /**
   * 解析目标地址
   * @param {string} targetAddress - 目标地址
   * @returns {Object|null} - {ip, port} 或 null
   */
  parseTargetAddress(targetAddress) {
    try {
      // IPv4:port 格式
      if (targetAddress.includes('.') && !targetAddress.includes('[')) {
        const parts = targetAddress.split(':');
        if (parts.length === 2) {
          const ip = parts[0].trim();
          const port = parseInt(parts[1].trim(), 10);
          return { ip, port };
        }
      }

      // [IPv6]:port 格式
      if (targetAddress.includes('[')) {
        const match = targetAddress.match(/^\[([0-9a-fA-F:]+)\]:(\d+)$/);
        if (match) {
          return { ip: match[1], port: parseInt(match[2], 10) };
        }
      }

      // 域名:port 格式
      if (targetAddress.includes(':')) {
        const parts = targetAddress.split(':');
        if (parts.length === 2) {
          const ip = parts[0].trim();
          const port = parseInt(parts[1].trim(), 10);
          // 简单验证域名格式
          if (ip.match(/^[a-zA-Z0-9.-]+$/)) {
            return { ip, port };
          }
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 检查地址类型
   * @param {string} ip - IP地址或域名
   * @returns {Object} - 地址类型信息
   */
  checkAddressType(ip) {
    const net = require('net');

    const result = {
      isLocalhost: false,
      isPrivateNetwork: false,
      isIPv6: false,
      isReserved: false,
      isPublicIPv4: false,
      isDomain: false
    };

    // 检查是否为域名
    if (!net.isIP(ip)) {
      // 检查localhost域名
      if (ip.toLowerCase() === 'localhost') {
        result.isLocalhost = true;
        return result;
      }

      // 其他域名暂时允许（实际部署时可能需要DNS解析检查）
      result.isDomain = true;
      result.isPublicIPv4 = true; // 假设域名指向公网地址
      return result;
    }

    // IPv6地址
    if (net.isIPv6(ip)) {
      result.isIPv6 = true;

      // 检查IPv6本地地址
      if (ip === '::1' || ip.toLowerCase().startsWith('fe80:')) {
        result.isLocalhost = true;
      }

      return result;
    }

    // IPv4地址
    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number);

      // 本地地址
      if (ip === '127.0.0.1' || parts[0] === 127) {
        result.isLocalhost = true;
        return result;
      }

      // 私有网络地址
      if (
        (parts[0] === 10) || // 10.0.0.0/8
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
        (parts[0] === 192 && parts[1] === 168) // 192.168.0.0/16
      ) {
        result.isPrivateNetwork = true;
        return result;
      }

      // 保留地址
      if (
        (parts[0] === 0) || // 0.0.0.0/8
        (parts[0] === 169 && parts[1] === 254) || // 169.254.0.0/16 (链路本地)
        (parts[0] >= 224 && parts[0] <= 239) || // 224.0.0.0/4 (多播)
        (parts[0] >= 240) // 240.0.0.0/4 (保留)
      ) {
        result.isReserved = true;
        return result;
      }

      // 公网IPv4地址
      result.isPublicIPv4 = true;
    }

    return result;
  }
}

// 创建单例实例
const portSecurityService = new PortSecurityService();

module.exports = {
  PortSecurityService,
  portSecurityService
};
