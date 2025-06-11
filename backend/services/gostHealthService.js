/**
 * GOST 服务健康检查和自动恢复服务
 * 监控 GOST 服务状态，在服务异常时自动恢复
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getGostExecutablePath, validateGostExecutable, isWindows, getGostExecutableName } = require('../utils/platform');

class GostHealthService {
  constructor() {
    this.isRunning = false;
    this.checkInterval = 30000; // 30秒检查一次
    this.healthTimer = null;
    this.gostProcess = null;
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.lastHealthCheck = null;

    // GOST 配置路径
    this.configPath = path.join(__dirname, '../config/gost-config.json');
    this.gostBinaryPath = getGostExecutablePath();
  }

  /**
   * 验证 GOST 二进制文件
   */
  validateGostBinary() {
    try {
      validateGostExecutable(this.gostBinaryPath);
      return true;
    } catch (error) {
      console.error('❌ GOST 二进制文件验证失败:', error.message);
      return false;
    }
  }

  /**
   * 启动健康检查服务
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ GOST 健康检查服务已在运行');
      return;
    }

    this.isRunning = true;
    console.log('🏥 启动 GOST 健康检查服务...');

    // 立即执行一次健康检查
    this.performHealthCheck();

    // 设置定时健康检查
    this.healthTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.checkInterval);

    console.log(`✅ GOST 健康检查服务已启动，检查间隔: ${this.checkInterval / 1000}秒`);
  }

  /**
   * 停止健康检查服务
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    console.log('🏥 GOST 健康检查服务已停止');
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck() {
    try {
      this.lastHealthCheck = new Date();

      // 检查配置文件是否存在
      if (!fs.existsSync(this.configPath)) {
        console.warn('⚠️ GOST 配置文件不存在，跳过健康检查');
        return;
      }

      // 读取配置文件
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));

      if (!config.services || config.services.length === 0) {
        console.log('📋 GOST 配置中没有服务，跳过健康检查');
        return;
      }

      // 检查关键端口（如6443）的可用性
      const criticalPorts = this.getCriticalPorts(config);
      const healthResults = await Promise.allSettled(
        criticalPorts.map(port => this.checkPortHealth(port))
      );

      // 🔧 分析健康检查结果，区分不同类型的问题
      const failedPorts = [];
      const healthyPorts = [];
      const warningPorts = [];

      healthResults.forEach((result, index) => {
        const port = criticalPorts[index];
        if (result.status === 'fulfilled') {
          healthyPorts.push({ port, ...result.value });
        } else {
          const reason = result.reason;
          if (reason.status === 'not_listening') {
            failedPorts.push({ port, ...reason });
          } else {
            warningPorts.push({ port, ...reason });
          }
        }
      });

      // 输出详细的健康检查结果
      if (healthyPorts.length > 0) {
        console.log(`✅ 健康端口 (${healthyPorts.length}): ${healthyPorts.map(p => p.port).join(', ')}`);
      }

      if (warningPorts.length > 0) {
        console.log(`⚠️ 警告端口 (${warningPorts.length}): ${warningPorts.map(p => `${p.port}(${p.error})`).join(', ')}`);
        console.log('💡 提示：转发端口的连接重置是正常现象');
      }

      if (failedPorts.length > 0) {
        console.warn(`🚨 失败端口 (${failedPorts.length}): ${failedPorts.map(p => p.port).join(', ')}`);
        await this.handleUnhealthyService(failedPorts);
      } else {
        console.log('✅ GOST 服务健康检查通过');
        this.restartAttempts = 0; // 重置重启计数
      }

    } catch (error) {
      console.error('❌ GOST 健康检查失败:', error);
    }
  }

  /**
   * 获取关键端口列表
   */
  getCriticalPorts(config) {
    const ports = [];

    if (config.services) {
      config.services.forEach(service => {
        if (service.addr) {
          const match = service.addr.match(/:(\d+)$/);
          if (match) {
            const port = parseInt(match[1]);
            // 6443 是关键端口，优先检查
            if (port === 6443 || ports.length < 3) {
              ports.push(port);
            }
          }
        }
      });
    }

    return ports;
  }

  /**
   * 检查单个端口的健康状态
   * 🔧 修复：使用TCP连接检查而不是HTTP请求
   */
  checkPortHealth(port) {
    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();

      const timeout = setTimeout(() => {
        socket.destroy();
        reject({ port, status: 'timeout', error: 'Connection timeout' });
      }, 3000);

      socket.connect(port, 'localhost', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({ port, status: 'healthy', message: 'Port is listening' });
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        // 🔧 区分不同的错误类型
        if (error.code === 'ECONNREFUSED') {
          reject({ port, status: 'not_listening', error: 'Port not listening' });
        } else if (error.code === 'ECONNRESET') {
          // TCP连接被重置，但端口在监听（这对于转发端口是正常的）
          resolve({ port, status: 'healthy', message: 'Port is listening (connection reset is normal for forwarding)' });
        } else {
          reject({ port, status: 'unhealthy', error: error.message });
        }
      });
    });
  }

  /**
   * 处理不健康的服务
   * 🔧 优化：更智能的健康检查和重启逻辑
   */
  async handleUnhealthyService(failedPorts) {
    // 🔧 检查用户是否主动停止了服务
    const gostService = require('./gostService');
    if (gostService.userStoppedService) {
      console.log('🛑 用户主动停止了服务，跳过自动重启');
      return;
    }

    // 🔧 更智能的失败分析
    const criticalFailures = failedPorts.filter(portInfo => {
      // 1. 检查是否是真正的服务问题
      if (portInfo.status === 'connection_refused') {
        // 连接被拒绝可能是目标服务不可用，这是正常的
        console.log(`📋 端口 ${portInfo.port} 连接被拒绝，可能是目标服务不可用（正常现象）`);
        return false;
      }

      // 2. 检查是否是端口未监听
      if (portInfo.status === 'not_listening') {
        // 只有管理端口（如6443）未监听才是关键问题
        const isManagementPort = this.isManagementPort(portInfo.port);
        if (!isManagementPort) {
          console.log(`📋 端口 ${portInfo.port} 未监听，但不是管理端口（可能正常）`);
          return false;
        }
      }

      // 3. 检查是否是网络超时
      if (portInfo.status === 'timeout') {
        console.log(`📋 端口 ${portInfo.port} 超时，可能是网络问题（暂不重启）`);
        return false;
      }

      // 4. 只有真正的服务级别问题才认为是关键失败
      return portInfo.status === 'service_error' ||
             (portInfo.status === 'not_listening' && this.isManagementPort(portInfo.port));
    });

    if (criticalFailures.length === 0) {
      console.log('📋 检测到的端口问题不是关键问题，跳过重启');
      console.log('💡 提示：转发端口的目标地址不可用或网络问题是正常现象');
      return;
    }

    if (this.restartAttempts >= this.maxRestartAttempts) {
      console.error(`❌ GOST 服务重启次数已达上限 (${this.maxRestartAttempts})，停止自动恢复`);
      return;
    }

    this.restartAttempts++;
    console.log(`🔄 检测到关键端口问题，尝试重启 GOST 服务 (第 ${this.restartAttempts}/${this.maxRestartAttempts} 次)...`);
    console.log(`🎯 关键失败端口: ${criticalFailures.map(p => p.port).join(', ')}`);

    try {
      // 🔥 优先尝试热加载重启
      const gostService = require('./gostService');

      console.log('🔥 尝试热加载重启 GOST 服务...');
      try {
        await gostService.restart({}, true);
        // 🔧 重启成功后重置用户停止标志
        gostService.userStoppedService = false;
        console.log('✅ GOST 服务热加载重启完成');
      } catch (hotReloadError) {
        console.warn('⚠️ 热加载重启失败，回退到完全重启:', hotReloadError.message);

        // 回退到传统重启方式
        await this.stopGostProcess();
        await this.sleep(2000);
        await this.startGostProcess();
        // 🔧 重启成功后重置用户停止标志
        gostService.userStoppedService = false;
        console.log('✅ GOST 服务完全重启完成');
      }

      // 等待服务启动后再次检查
      setTimeout(async () => {
        const recheckResults = await Promise.allSettled(
          criticalFailures.map(portInfo => this.checkPortHealth(portInfo.port))
        );

        const stillFailed = recheckResults.filter(result => result.status === 'rejected');
        if (stillFailed.length === 0) {
          console.log('✅ GOST 服务重启后健康检查通过');
          this.restartAttempts = 0;
        } else {
          console.warn(`⚠️ GOST 服务重启后仍有 ${stillFailed.length} 个关键端口不可用`);
        }
      }, 5000);

    } catch (error) {
      console.error('❌ GOST 服务重启失败:', error);
    }
  }

  /**
   * 停止 GOST 进程
   */
  async stopGostProcess() {
    return new Promise((resolve) => {
      if (this.gostProcess) {
        this.gostProcess.kill('SIGTERM');
        this.gostProcess = null;
      }

      // 🔧 使用更安全和精确的进程清理方式
      let killCommand;

      if (isWindows()) {
        // Windows: 只杀死 gost.exe 进程
        killCommand = spawn('taskkill', ['/F', '/IM', 'gost.exe'], { stdio: 'ignore' });
      } else {
        // Linux: 使用更精确的命令，避免误杀其他进程
        const gostExecutableName = getGostExecutableName();
        killCommand = spawn('sh', ['-c', `pgrep -f "${gostExecutableName}" | xargs -r kill -TERM || true`], { stdio: 'ignore' });
      }

      killCommand.on('close', (code) => {
        console.log(`🛑 GOST 进程清理完成，退出码: ${code}`);
        resolve();
      });

      killCommand.on('error', (error) => {
        console.log(`⚠️ 进程清理命令执行失败: ${error.message}，继续启动`);
        resolve(); // 即使清理失败也继续
      });

      // 超时处理
      setTimeout(() => {
        console.log('⏰ 进程清理超时，继续启动');
        resolve();
      }, 3000);
    });
  }

  /**
   * 启动 GOST 进程
   */
  async startGostProcess() {
    return new Promise((resolve, reject) => {
      // 使用动态平台检测验证二进制文件
      if (!this.validateGostBinary()) {
        reject(new Error(`GOST 二进制文件验证失败: ${this.gostBinaryPath}`));
        return;
      }

      if (!fs.existsSync(this.configPath)) {
        reject(new Error(`GOST 配置文件不存在: ${this.configPath}`));
        return;
      }

      console.log(`🚀 启动 GOST 进程: ${this.gostBinaryPath}`);

      this.gostProcess = spawn(this.gostBinaryPath, ['-C', this.configPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });

      this.gostProcess.stdout.on('data', (data) => {
        console.log(`GOST stdout: ${data.toString().trim()}`);
      });

      this.gostProcess.stderr.on('data', (data) => {
        console.log(`GOST stderr: ${data.toString().trim()}`);
      });

      this.gostProcess.on('error', (error) => {
        console.error('❌ GOST 进程启动失败:', error);
        reject(error);
      });

      this.gostProcess.on('close', (code) => {
        console.log(`🛑 GOST 进程退出，代码: ${code}`);
        this.gostProcess = null;
      });

      // 给进程一些时间启动
      setTimeout(() => {
        if (this.gostProcess && !this.gostProcess.killed) {
          console.log('✅ GOST 进程启动成功');
          resolve();
        } else {
          reject(new Error('GOST 进程启动失败'));
        }
      }, 2000);
    });
  }

  /**
   * 检查是否是管理端口
   * @param {number} port - 端口号
   * @returns {boolean} 是否是管理端口
   */
  isManagementPort(port) {
    // 管理端口列表（这些端口的失败才是真正的问题）
    const managementPorts = [
      6443, // 默认管理端口
      9080, // 备用管理端口
      3000  // API端口
    ];

    return managementPorts.includes(port);
  }

  /**
   * 延迟函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取健康状态
   */
  getHealthStatus() {
    return {
      isRunning: this.isRunning,
      lastHealthCheck: this.lastHealthCheck,
      restartAttempts: this.restartAttempts,
      maxRestartAttempts: this.maxRestartAttempts,
      gostProcessRunning: this.gostProcess && !this.gostProcess.killed
    };
  }
}

// 创建单例实例
const gostHealthService = new GostHealthService();

module.exports = gostHealthService;
