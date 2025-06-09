/**
 * GOST 服务健康检查和自动恢复服务
 * 监控 GOST 服务状态，在服务异常时自动恢复
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

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
    this.gostBinaryPath = this.getGostBinaryPath();
  }

  /**
   * 获取 GOST 二进制文件路径
   */
  getGostBinaryPath() {
    const platform = process.platform;
    const assetsDir = path.join(__dirname, '../assets/gost');
    
    if (platform === 'win32') {
      return path.join(assetsDir, 'gost-windows.exe');
    } else {
      return path.join(assetsDir, 'gost-linux');
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

      // 分析健康检查结果
      const failedPorts = [];
      healthResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          failedPorts.push(criticalPorts[index]);
        }
      });

      if (failedPorts.length > 0) {
        console.warn(`⚠️ 检测到 ${failedPorts.length} 个端口不可用: ${failedPorts.join(', ')}`);
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
   */
  checkPortHealth(port) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: port,
        method: 'GET',
        timeout: 5000
      };

      const req = http.request(options, (res) => {
        resolve({ port, status: 'healthy', statusCode: res.statusCode });
      });

      req.on('error', (error) => {
        reject({ port, status: 'unhealthy', error: error.message });
      });

      req.on('timeout', () => {
        req.destroy();
        reject({ port, status: 'timeout', error: 'Request timeout' });
      });

      req.end();
    });
  }

  /**
   * 处理不健康的服务
   */
  async handleUnhealthyService(failedPorts) {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      console.error(`❌ GOST 服务重启次数已达上限 (${this.maxRestartAttempts})，停止自动恢复`);
      return;
    }

    this.restartAttempts++;
    console.log(`🔄 尝试重启 GOST 服务 (第 ${this.restartAttempts}/${this.maxRestartAttempts} 次)...`);

    try {
      // 停止现有的 GOST 进程
      await this.stopGostProcess();
      
      // 等待一段时间
      await this.sleep(2000);
      
      // 重新启动 GOST 服务
      await this.startGostProcess();
      
      console.log('✅ GOST 服务重启完成');
      
      // 等待服务启动后再次检查
      setTimeout(async () => {
        const recheckResults = await Promise.allSettled(
          failedPorts.map(port => this.checkPortHealth(port))
        );
        
        const stillFailed = recheckResults.filter(result => result.status === 'rejected');
        if (stillFailed.length === 0) {
          console.log('✅ GOST 服务重启后健康检查通过');
          this.restartAttempts = 0;
        } else {
          console.warn(`⚠️ GOST 服务重启后仍有 ${stillFailed.length} 个端口不可用`);
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
      
      // 强制杀死可能残留的 GOST 进程
      const platform = process.platform;
      let killCommand;
      
      if (platform === 'win32') {
        killCommand = spawn('taskkill', ['/F', '/IM', 'gost-windows.exe'], { stdio: 'ignore' });
      } else {
        killCommand = spawn('pkill', ['-f', 'gost'], { stdio: 'ignore' });
      }
      
      killCommand.on('close', () => {
        console.log('🛑 GOST 进程已停止');
        resolve();
      });
      
      // 超时处理
      setTimeout(resolve, 3000);
    });
  }

  /**
   * 启动 GOST 进程
   */
  async startGostProcess() {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.gostBinaryPath)) {
        reject(new Error(`GOST 二进制文件不存在: ${this.gostBinaryPath}`));
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
