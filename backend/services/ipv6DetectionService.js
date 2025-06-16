const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execPromise = promisify(exec);

/**
 * IPv6检测服务
 * 检测系统是否支持IPv6并提供相关功能
 */
class IPv6DetectionService {
  constructor() {
    this.cache = {
      ipv6Supported: null,
      ipv6Addresses: null,
      lastCheck: null,
      cacheTimeout: 5 * 60 * 1000 // 5分钟缓存
    };
  }

  /**
   * 检测系统是否支持IPv6
   * @returns {Promise<boolean>}
   */
  async isIPv6Supported() {
    // 检查缓存
    if (this.cache.ipv6Supported !== null && 
        this.cache.lastCheck && 
        Date.now() - this.cache.lastCheck < this.cache.cacheTimeout) {
      return this.cache.ipv6Supported;
    }

    try {
      let supported = false;

      // 方法1：检查网络接口
      const interfaces = os.networkInterfaces();
      for (const name in interfaces) {
        const iface = interfaces[name];
        for (const addr of iface) {
          if (addr.family === 'IPv6' && !addr.internal) {
            supported = true;
            break;
          }
        }
        if (supported) break;
      }

      // 方法2：尝试创建IPv6套接字（如果方法1失败）
      if (!supported) {
        try {
          if (process.platform === 'win32') {
            // Windows: 检查IPv6是否启用
            const { stdout } = await execPromise('netsh interface ipv6 show global');
            supported = !stdout.includes('Disabled');
          } else {
            // Linux/Mac: 检查IPv6模块是否加载
            const { stdout } = await execPromise('cat /proc/net/if_inet6 2>/dev/null || echo ""');
            supported = stdout.trim().length > 0;
          }
        } catch (error) {
          console.warn('IPv6检测方法2失败:', error.message);
        }
      }

      // 方法3：尝试解析IPv6地址（最后的检查）
      if (!supported) {
        try {
          const net = require('net');
          supported = net.isIPv6('::1');
        } catch (error) {
          console.warn('IPv6检测方法3失败:', error.message);
        }
      }

      // 更新缓存
      this.cache.ipv6Supported = supported;
      this.cache.lastCheck = Date.now();

      console.log(`IPv6支持检测结果: ${supported ? '支持' : '不支持'}`);
      return supported;

    } catch (error) {
      console.error('IPv6支持检测失败:', error);
      // 检测失败时默认不支持
      this.cache.ipv6Supported = false;
      this.cache.lastCheck = Date.now();
      return false;
    }
  }

  /**
   * 获取系统IPv6地址列表
   * @returns {Promise<Array>}
   */
  async getIPv6Addresses() {
    // 检查缓存
    if (this.cache.ipv6Addresses !== null && 
        this.cache.lastCheck && 
        Date.now() - this.cache.lastCheck < this.cache.cacheTimeout) {
      return this.cache.ipv6Addresses;
    }

    try {
      const addresses = [];
      const interfaces = os.networkInterfaces();

      for (const name in interfaces) {
        const iface = interfaces[name];
        for (const addr of iface) {
          if (addr.family === 'IPv6') {
            addresses.push({
              interface: name,
              address: addr.address,
              internal: addr.internal,
              scopeid: addr.scopeid,
              description: addr.internal ? '本地回环' : '外部接口'
            });
          }
        }
      }

      // 更新缓存
      this.cache.ipv6Addresses = addresses;
      this.cache.lastCheck = Date.now();

      return addresses;

    } catch (error) {
      console.error('获取IPv6地址失败:', error);
      this.cache.ipv6Addresses = [];
      this.cache.lastCheck = Date.now();
      return [];
    }
  }

  /**
   * 获取推荐的IPv6监听地址
   * @returns {Promise<string>}
   */
  async getRecommendedIPv6ListenAddress() {
    const isSupported = await this.isIPv6Supported();
    if (!isSupported) {
      return null;
    }

    const addresses = await this.getIPv6Addresses();
    
    // 优先返回本地回环地址
    const loopback = addresses.find(addr => addr.internal && addr.address === '::1');
    if (loopback) {
      return '::1';
    }

    // 如果没有回环地址，返回通配符地址
    return '::';
  }

  /**
   * 验证IPv6地址格式
   * @param {string} address - IPv6地址
   * @returns {boolean}
   */
  isValidIPv6Address(address) {
    try {
      const net = require('net');
      return net.isIPv6(address);
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取系统网络配置信息
   * @returns {Promise<Object>}
   */
  async getNetworkInfo() {
    const ipv6Supported = await this.isIPv6Supported();
    const ipv6Addresses = await this.getIPv6Addresses();
    const recommendedIPv6 = await this.getRecommendedIPv6ListenAddress();

    return {
      ipv6Supported,
      ipv6Addresses,
      recommendedIPv6,
      recommendedIPv4: '127.0.0.1',
      supportedListenModes: ipv6Supported ? ['ipv4', 'ipv6'] : ['ipv4']
    };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache = {
      ipv6Supported: null,
      ipv6Addresses: null,
      lastCheck: null,
      cacheTimeout: 5 * 60 * 1000
    };
  }
}

// 创建单例实例
const ipv6DetectionService = new IPv6DetectionService();

module.exports = {
  IPv6DetectionService,
  ipv6DetectionService
};
