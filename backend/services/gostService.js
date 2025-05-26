const { exec } = require('child_process');
const { models } = require('./dbService');
const { ForwardRule } = models;
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config/gost');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const execPromise = promisify(exec);

class GostService {
  constructor() {
    this.gostProcess = null;
    this.configPath = path.join(__dirname, '../config/gost-config.json');
    this.process = null;
    this.isRunning = false;
    this.defaultConfig = {
      services: [
        {
          name: "tcp-forward",
          addr: ":6443",
          handler: {
            type: "tcp",
            chain: "tcp-forward-chain"
          },
          listener: {
            type: "tcp"
          }
        }
      ],
      chains: [
        {
          name: "tcp-forward-chain",
          hops: [
            {
              name: "hop-0",
              nodes: [
                {
                  addr: "127.0.0.1:3000",
                  connector: {
                    type: "tcp"
                  }
                }
              ]
            }
          ]
        }
      ]
    };
  }

  async createRule(ruleData) {
    try {
      const rule = await ForwardRule.create(ruleData);
      await this.reloadConfig();
      return rule;
    } catch (error) {
      throw new Error(`Failed to create forward rule: ${error.message}`);
    }
  }

  async updateRule(ruleId, updateData) {
    try {
      const rule = await ForwardRule.findByPk(ruleId);
      if (!rule) {
        throw new Error('Rule not found');
      }

      await rule.update(updateData);
      await this.reloadConfig();
      return rule;
    } catch (error) {
      throw new Error(`Failed to update forward rule: ${error.message}`);
    }
  }

  async deleteRule(ruleId) {
    try {
      const rule = await ForwardRule.findByPk(ruleId);
      if (!rule) {
        throw new Error('Rule not found');
      }

      await rule.destroy();
      await this.reloadConfig();
      return true;
    } catch (error) {
      throw new Error(`Failed to delete forward rule: ${error.message}`);
    }
  }

  async getRules(query = {}) {
    try {
      const rules = await ForwardRule.findAll({
        where: query,
        include: [{
          model: models.User,
          as: 'user',
          attributes: ['username', 'email']
        }]
      });
      return rules;
    } catch (error) {
      throw new Error(`Failed to fetch forward rules: ${error.message}`);
    }
  }

  async generateConfig() {
    try {
      const rules = await ForwardRule.findAll({
        where: { isActive: true }
      });

      const config = {
        services: rules.map(rule => ({
          name: rule.name,
          addr: `:${rule.sourcePort}`,
          handler: {
            type: rule.protocol,
            chain: [{
              name: 'forward',
              addr: `${rule.targetHost}:${rule.targetPort}`
            }]
          }
        }))
      };

      return config;
    } catch (error) {
      throw new Error(`Failed to generate GOST config: ${error.message}`);
    }
  }

  async reloadConfig() {
    try {
      const config = await this.generateConfig();
      const fs = require('fs').promises;
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
      
      if (this.gostProcess) {
        this.gostProcess.kill();
      }

      this.gostProcess = exec(`gost -C ${this.configPath}`, (error) => {
        if (error) {
          console.error('Error starting GOST:', error);
        }
      });

      return true;
    } catch (error) {
      throw new Error(`Failed to reload GOST config: ${error.message}`);
    }
  }

  async validatePort(port, excludeRuleId = null) {
    try {
      const existingRule = await ForwardRule.findOne({
        where: {
          sourcePort: port,
          id: { [models.Sequelize.Op.ne]: excludeRuleId }
        }
      });

      return !existingRule;
    } catch (error) {
      throw new Error(`Failed to validate port: ${error.message}`);
    }
  }

  // 确保 Go-Gost 可执行文件存在
  async ensureExecutable() {
    try {
      console.log('Checking Go-Gost executable...');
      const binDir = path.join(__dirname, '../bin');
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
      }

      const executablePath = config.executablePath;
      if (!fs.existsSync(executablePath)) {
        console.log('Go-Gost executable not found. Installing...');
        // 运行安装脚本
        const installScriptPath = path.join(__dirname, '../scripts/install-gost.js');
        await execPromise(`node "${installScriptPath}"`);
      }
      
      console.log('Go-Gost executable verified');
      return true;
    } catch (error) {
      console.error('Failed to ensure Go-Gost executable:', error);
      throw error;
    }
  }

  // 检查并关闭已存在的 Go-Gost 进程
  async killExistingProcess() {
    try {
      console.log('Checking for existing Go-Gost processes...');
      const isWin = process.platform === 'win32';
      
      if (isWin) {
        // Windows 系统
        const { stdout } = await execPromise('tasklist /fi "imagename eq gost.exe" /fo csv /nh');
        if (stdout.includes('gost.exe')) {
          console.log('Found existing Go-Gost process, killing...');
          await execPromise('taskkill /f /im gost.exe');
          console.log('Existing Go-Gost process killed');
        }
      } else {
        // Linux/Mac 系统
        try {
          // 先尝试 ps 命令
          const { stdout } = await execPromise('ps -ef | grep gost | grep -v grep || echo ""');
          if (stdout.trim()) {
            console.log('Found existing Go-Gost process, killing...');
            
            // 尝试使用 pkill (大多数Linux都支持)
            await execPromise('pkill -f gost || true');
            
            // 备用方案：使用 ps 查找PID后用 kill 命令终止
            try {
              const { stdout: pidOutput } = await execPromise('ps -ef | grep gost | grep -v grep | awk \'{print $2}\' || echo ""');
              const pids = pidOutput.trim().split('\n').filter(p => p);
              for (const pid of pids) {
                if (pid) {
                  await execPromise(`kill -9 ${pid}`);
                }
              }
            } catch (e) {
              // 忽略错误
            }
            
            console.log('Existing Go-Gost process killed');
          }
        } catch (e) {
          console.log('Error finding or killing processes:', e.message);
          // 有些系统可能不支持上述命令，使用兜底方案
          try {
            await execPromise('killall -9 gost 2>/dev/null || true');
          } catch (e2) {
            // 忽略错误
          }
        }
      }
    } catch (error) {
      // 忽略错误，可能是找不到进程
      console.log('No existing Go-Gost process found');
    }
  }

  // 检查端口是否被占用
  async checkPort(port) {
    try {
      console.log(`Checking if port ${port} is in use...`);
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execPromise = promisify(exec);
      
      if (process.platform === 'win32') {
        const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
        const isUsed = stdout.includes(`:${port}`);
        console.log(`Port ${port} is ${isUsed ? 'in use' : 'free'}`);
        return isUsed;
      } else {
        // 尝试多种方式检查端口，适应不同Linux发行版
        try {
          // 方法1：lsof (大多数Linux和MacOS都有)
          const { stdout } = await execPromise(`lsof -i :${port} || echo ""`);
          if (stdout.trim().length > 0) {
            console.log(`Port ${port} is in use (lsof)`);
            return true;
          }
        } catch (e) {
          // 忽略错误，尝试其他方法
        }
        
        try {
          // 方法2：netstat (几乎所有系统都有)
          const { stdout: netstatOut } = await execPromise(`netstat -tuln | grep :${port} || echo ""`);
          if (netstatOut.trim().length > 0) {
            console.log(`Port ${port} is in use (netstat)`);
            return true;
          }
        } catch (e) {
          // 忽略错误，尝试其他方法
        }
        
        try {
          // 方法3：ss 命令 (现代Linux系统)
          const { stdout: ssOut } = await execPromise(`ss -tuln | grep :${port} || echo ""`);
          if (ssOut.trim().length > 0) {
            console.log(`Port ${port} is in use (ss)`);
            return true;
          }
        } catch (e) {
          // 忽略错误
        }
        
        console.log(`Port ${port} is free`);
        return false;
      }
    } catch (err) {
      console.log(`Error checking port ${port}: ${err.message}`);
      return false; // 假设端口是空闲的
    }
  }

  // 寻找空闲端口
  async findFreePort(startPort, endPort = startPort + 100) {
    console.log(`Searching for a free port between ${startPort} and ${endPort}...`);
    for (let port = startPort; port <= endPort; port++) {
      const isUsed = await this.checkPort(port);
      if (!isUsed) {
        console.log(`Found free port: ${port}`);
        return port;
      }
    }
    throw new Error(`Could not find a free port between ${startPort} and ${endPort}`);
  }

  // 尝试释放被占用的端口
  async releasePort(port) {
    try {
      console.log(`正在尝试释放端口 ${port}...`);
      
      if (process.platform === 'win32') {
        // Windows系统下查找并杀死占用端口的进程
        const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
        const lines = stdout.trim().split('\n');
        
        if (lines.length > 0) {
          // 提取PID
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 5) {
              const pid = parts[4];
              if (pid && pid !== '0') {
                console.log(`发现端口 ${port} 被进程 ${pid} 占用，正在终止...`);
                try {
                  await execPromise(`taskkill /F /PID ${pid}`);
                  console.log(`已终止进程 ${pid}`);
                } catch (error) {
                  console.error(`终止进程 ${pid} 失败:`, error.message);
                }
              }
            }
          }
        }
      } else {
        // Linux系统下查找并杀死占用端口的进程
        // 尝试多种方法，兼容不同Linux发行版
        
        // 方法1：使用lsof
        try {
          const { stdout } = await execPromise(`lsof -ti:${port} || echo ""`);
          const pids = stdout.trim().split('\n').filter(p => p);
          
          for (const pid of pids) {
            if (pid) {
              console.log(`发现端口 ${port} 被进程 ${pid} 占用，正在终止...`);
              try {
                await execPromise(`kill -9 ${pid}`);
                console.log(`已终止进程 ${pid}`);
              } catch (error) {
                console.error(`终止进程 ${pid} 失败:`, error.message);
              }
            }
          }
        } catch (error) {
          // 忽略错误，尝试其他方法
        }
        
        // 方法2：使用netstat (如果lsof不可用)
        try {
          const { stdout } = await execPromise(`netstat -tulnp 2>/dev/null | grep :${port} || echo ""`);
          const lines = stdout.trim().split('\n');
          
          for (const line of lines) {
            // 提取进程ID/名称，格式可能是: tcp 0 0 0.0.0.0:6443 0.0.0.0:* LISTEN 12345/gost
            const match = line.match(/LISTEN\s+(\d+)\/(\S+)/);
            if (match && match[1]) {
              const pid = match[1];
              console.log(`发现端口 ${port} 被进程 ${pid} 占用，正在终止...`);
              try {
                await execPromise(`kill -9 ${pid}`);
                console.log(`已终止进程 ${pid}`);
              } catch (error) {
                console.error(`终止进程 ${pid} 失败:`, error.message);
              }
            }
          }
        } catch (error) {
          // 忽略错误
        }
        
        // 方法3：使用fuser (有些系统可能有这个命令)
        try {
          const { stdout } = await execPromise(`fuser -n tcp ${port} 2>/dev/null || echo ""`);
          const pids = stdout.trim().split(/\s+/).filter(p => /^\d+$/.test(p));
          
          for (const pid of pids) {
            if (pid) {
              console.log(`发现端口 ${port} 被进程 ${pid} 占用，正在终止...`);
              try {
                await execPromise(`kill -9 ${pid}`);
                console.log(`已终止进程 ${pid}`);
              } catch (error) {
                console.error(`终止进程 ${pid} 失败:`, error.message);
              }
            }
          }
        } catch (error) {
          // 忽略错误
        }
      }
      
      // 等待端口完全释放
      await this.waitForPortRelease(port);
      
      return true;
    } catch (error) {
      console.error(`释放端口 ${port} 失败:`, error.message);
      return false;
    }
  }
  
  // 等待端口完全释放
  async waitForPortRelease(port, maxAttempts = 10, delayMs = 500) {
    console.log(`等待端口 ${port} 释放...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const isUsed = await this.checkPort(port);
      
      if (!isUsed) {
        console.log(`端口 ${port} 已释放，可以使用`);
        return true;
      }
      
      console.log(`端口 ${port} 仍被占用，等待中... (${attempt}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    console.error(`端口 ${port} 在多次尝试后仍未释放`);
    return false;
  }
  
  // 准备端口以供使用，如果无法释放则直接报错
  async preparePort(port) {
    const isPortUsed = await this.checkPort(port);
    
    if (isPortUsed) {
      console.log(`端口 ${port} 被占用，尝试释放...`);
      const released = await this.releasePort(port);
      
      if (!released) {
        throw new Error(`端口 ${port} 被占用且无法释放，请先手动关闭占用此端口的进程`);
      }
    }
    
    return port;
  }

  // 更新配置文件中的端口
  async updateConfigPort(port) {
    try {
      console.log(`更新配置，使用端口 ${port}...`);
      let config = this.defaultConfig;
      
      if (fs.existsSync(this.configPath)) {
        try {
          const configContent = fs.readFileSync(this.configPath, 'utf8');
          config = JSON.parse(configContent);
        } catch (err) {
          console.error('读取配置文件失败，使用默认配置:', err);
        }
      }
      
      // 准备端口，如果无法释放则直接报错
      await this.preparePort(port);
      
      // 更新端口
      if (config.services && config.services.length > 0) {
        config.services[0].addr = `:${port}`;
        console.log(`配置已更新为使用端口 ${port}`);
      }
      
      // 写入配置文件
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      
      return config;
    } catch (err) {
      console.error('更新配置端口失败:', err);
      throw err;
    }
  }

  // 启动 Go-Gost (使用配置文件)
  async startWithConfig(customConfig = null) {
    try {
      console.log('正在启动 Go-Gost 服务（使用配置文件）...');
      await this.ensureExecutable();
      await this.killExistingProcess();

      const executablePath = config.executablePath;
      console.log('可执行文件路径:', executablePath);

      // 验证可执行文件存在
      if (!fs.existsSync(executablePath)) {
        throw new Error(`Go-Gost 可执行文件不存在: ${executablePath}`);
      }

      // 创建或更新配置文件
      let gostConfig;
      let forwardPort;
      
      if (customConfig) {
        gostConfig = customConfig;
        
        // 从自定义配置中提取端口
        if (gostConfig.services && gostConfig.services.length > 0) {
          const addrStr = gostConfig.services[0].addr;
          forwardPort = parseInt(addrStr.replace(':', ''), 10);
          
          // 确保端口可用
          await this.preparePort(forwardPort);
        }
      } else {
        // 首先尝试从现有配置中获取端口
        if (fs.existsSync(this.configPath)) {
          try {
            const configContent = fs.readFileSync(this.configPath, 'utf8');
            const existingConfig = JSON.parse(configContent);
            
            if (existingConfig.services && existingConfig.services.length > 0) {
              const addrStr = existingConfig.services[0].addr;
              const existingPort = parseInt(addrStr.replace(':', ''), 10);
              
              // 尝试使用现有端口
              if (!isNaN(existingPort) && existingPort > 0) {
                forwardPort = existingPort;
              } else {
                forwardPort = 6443; // 默认端口
              }
            }
          } catch (err) {
            console.error('读取现有配置文件失败:', err);
            forwardPort = 6443; // 默认端口
          }
        } else {
          forwardPort = 6443; // 默认端口
        }
        
        console.log(`将使用端口 ${forwardPort} 进行转发`);
        
        // 更新配置中的端口
        gostConfig = await this.updateConfigPort(forwardPort);
      }

      // 写入配置文件
      fs.writeFileSync(this.configPath, JSON.stringify(gostConfig, null, 2));
      console.log('已创建配置文件:', this.configPath);

      // 启动 Go-Gost 进程
      const args = ['-C', this.configPath];
      console.log('使用配置文件启动:', this.configPath);
      console.log('完整命令:', executablePath, args.join(' '));
      
      this.process = spawn(executablePath, args, {
        // 捕获stdout和stderr
        stdio: ['ignore', 'pipe', 'pipe'],
        // 使用shell (在Windows上可能需要)
        shell: process.platform === 'win32',
        // 分离进程以避免受父进程影响
        detached: false,
        // 环境变量
        env: {...process.env}
      });
      
      console.log('Go-Gost 进程已启动，PID:', this.process.pid);

      // 更详细的输出处理
      this.process.stdout.on('data', (data) => {
        const output = data.toString().trim();
        console.log(`Go-Gost stdout: ${output}`);
      });

      this.process.stderr.on('data', (data) => {
        const error = data.toString().trim();
        console.error(`Go-Gost stderr: ${error}`);
        
        // 特殊处理常见错误
        if (error.includes('address already in use')) {
          console.error('错误: 端口已被占用。请检查是否有其他进程正在使用该端口。');
        }
      });

      // 添加错误事件处理
      this.process.on('error', (err) => {
        console.error('Go-Gost 进程错误:', err);
        this.isRunning = false;
      });

      this.process.on('close', (code) => {
        console.log(`Go-Gost 进程已退出，代码: ${code}`);
        this.isRunning = false;
      });

      // 等待200ms确认进程启动
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 验证进程是否还活着
      if (!this.process || !this.process.pid) {
        throw new Error('Go-Gost 进程未能成功启动');
      }
      
      // 检查进程是否仍在运行
      try {
        process.kill(this.process.pid, 0); // 发送信号0检查进程是否存在
        this.isRunning = true;
        console.log('Go-Gost 服务启动成功');
      } catch (e) {
        throw new Error('Go-Gost 进程启动后立即退出');
      }
      
      return true;
    } catch (error) {
      this.isRunning = false;
      console.error('使用配置启动 Go-Gost 失败:', error);
      throw error;
    }
  }

  // 启动 Go-Gost (使用命令行参数)
  async start(options = {}) {
    try {
      console.log('Starting Go-Gost service with parameters...');
      await this.ensureExecutable();
      await this.killExistingProcess();

      const gostConfig = {
        ...config.defaultConfig,
        ...options
      };
      console.log('Using configuration:', gostConfig);

      const args = [
        '-L', gostConfig.listen,
        '-F', gostConfig.forward,
        '-log', gostConfig.logLevel
      ];
      console.log('Starting with arguments:', args);

      this.process = spawn(config.executablePath, args);
      console.log('Go-Gost process started with PID:', this.process.pid);

      this.process.stdout.on('data', (data) => {
        console.log(`Go-Gost stdout: ${data}`);
      });

      this.process.stderr.on('data', (data) => {
        console.error(`Go-Gost stderr: ${data}`);
      });

      this.process.on('close', (code) => {
        console.log(`Go-Gost process exited with code ${code}`);
        this.isRunning = false;
      });

      this.isRunning = true;
      console.log('Go-Gost service started successfully');
      return true;
    } catch (error) {
      console.error('Failed to start Go-Gost:', error);
      throw error;
    }
  }

  // 停止 Go-Gost
  stop() {
    if (this.process) {
      console.log('Stopping Go-Gost service...');
      try {
        this.process.kill();
        console.log('Go-Gost process terminated');
      } catch (error) {
        console.error('Error stopping Go-Gost process:', error);
      }
      this.process = null;
      this.isRunning = false;
      console.log('Go-Gost service stopped');
    } else {
      console.log('No running Go-Gost service to stop');
    }
  }

  // 重启 Go-Gost
  async restart(options = {}, useConfig = false) {
    console.log('Restarting Go-Gost service...');
    this.stop();
    if (useConfig) {
      await this.startWithConfig();
    } else {
      await this.start(options);
    }
  }

  // 获取运行状态
  getStatus() {
    return {
      isRunning: this.isRunning,
      pid: this.process ? this.process.pid : null
    };
  }
  
  // 更新配置文件
  async updateConfig(newConfig) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(newConfig, null, 2));
      console.log('Configuration file updated');
      
      // 如果正在运行，则重启服务
      if (this.isRunning) {
        await this.restart({}, true);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to update configuration:', error);
      throw error;
    }
  }
}

module.exports = new GostService(); 