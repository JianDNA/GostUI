const { exec } = require('child_process');
const { models } = require('./dbService');
const { ForwardRule } = models;
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const execPromise = promisify(exec);
const { platformUtils, isWindows, isLinux } = require('../utils/platform');

class GostService {
  constructor() {
    this.gostProcess = null;
    this.configPath = path.join(__dirname, '../config/gost-config.json');
    this.process = null;
    this.isRunning = false;
    this.startTime = null;
    this.userStoppedService = false; // 🔧 标志：用户是否主动停止服务

    // 启动时加载持久化状态
    this.initializeFromPersistedState();
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

  // 从持久化状态初始化
  initializeFromPersistedState() {
    try {
      const persistedStatus = this.loadPersistedStatus();
      if (persistedStatus) {
        this.isRunning = persistedStatus.isRunning;
        if (persistedStatus.startTime) {
          this.startTime = new Date(persistedStatus.startTime).getTime();
        }
        console.log(`🔄 从持久化状态初始化: 运行=${this.isRunning}, 启动时间=${persistedStatus.startTime}`);
      }
    } catch (error) {
      console.error('从持久化状态初始化失败:', error);
    }
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
      // 获取所有规则，然后使用计算属性过滤
      const allRules = await ForwardRule.findAll({
        include: [{
          model: models.User,
          as: 'user',
          attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'expiryDate', 'portRangeStart', 'portRangeEnd']
        }]
      });

      // 使用计算属性过滤有效规则
      const rules = allRules.filter(rule => {
        if (!rule.isActive) return false; // 数据库字段检查

        if (rule.user) {
          rule.user = rule.user; // 确保关联存在
          return rule.getComputedIsActive(); // 计算属性检查
        }
        return rule.isActive; // 如果没有用户信息，使用数据库字段
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

      const config = require('../config/config');
      const executablePath = config.gost.executablePath;
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
    // 🔧 添加超时保护，确保不会无限期阻塞
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        console.log('⏰ 进程清理超时，继续启动服务');
        resolve();
      }, 5000); // 5秒超时
    });

    const cleanupPromise = this._performProcessCleanup();

    try {
      await Promise.race([cleanupPromise, timeoutPromise]);
    } catch (error) {
      console.log('⚠️ 进程清理过程中出现错误:', error.message);
      console.log('🔄 忽略清理错误，继续启动服务...');
    }
  }

  // 实际的进程清理逻辑
  async _performProcessCleanup() {
    try {
      console.log('Checking for existing Go-Gost processes...');
      const gostExecutableName = platformUtils.getGostExecutableName();

      if (isWindows()) {
        // Windows 系统
        const { stdout } = await execPromise(`tasklist /fi "imagename eq ${gostExecutableName}" /fo csv /nh`);
        if (stdout.includes(gostExecutableName)) {
          console.log('Found existing Go-Gost process, killing...');
          await execPromise(`taskkill /f /im ${gostExecutableName}`);
          console.log('Existing Go-Gost process killed');
        }
      } else {
        // Linux/Mac 系统 - 使用更安全的进程清理方式
        try {
          // 🔧 改进：使用更安全的进程查找和清理方式
          console.log('🔍 检查现有 Gost 进程...');

          // 方法1：使用更精确的进程查找（避免误杀）
          try {
            // 🔧 修复：只查找真正的 gost 可执行文件进程，避免误杀 Node.js 等其他进程
            const gostExecutableName = platformUtils.getGostExecutableName();
            const { stdout: pgrepOutput } = await execPromise(`pgrep -f "${gostExecutableName}" 2>/dev/null || echo ""`);
            let pids = pgrepOutput.trim().split('\n').filter(p => p && /^\d+$/.test(p));

            // 🔧 额外安全检查：验证进程确实是 gost 可执行文件
            const validPids = [];
            for (const pid of pids) {
              try {
                const { stdout: cmdline } = await execPromise(`cat /proc/${pid}/cmdline 2>/dev/null | tr '\\0' ' ' || echo ""`);
                // 只有命令行中包含 gost 可执行文件路径的才是真正的 gost 进程
                if (cmdline.includes(gostExecutableName) &&
                    (cmdline.includes('/gost') || cmdline.includes('\\gost')) &&
                    !cmdline.includes('node') &&
                    !cmdline.includes('npm') &&
                    !cmdline.includes('app.js')) {
                  validPids.push(pid);
                  console.log(`✅ 确认 Gost 进程 PID ${pid}: ${cmdline.trim()}`);
                } else {
                  console.log(`⚠️ 跳过非 Gost 进程 PID ${pid}: ${cmdline.trim()}`);
                }
              } catch (e) {
                console.log(`⚠️ 无法验证进程 ${pid}，跳过`);
              }
            }
            pids = validPids;

            if (pids.length > 0) {
              console.log(`🎯 发现 ${pids.length} 个 Gost 进程:`, pids.join(', '));

              for (const pid of pids) {
                try {
                  console.log(`🛑 终止进程 PID: ${pid}`);
                  await execPromise(`kill -TERM ${pid} 2>/dev/null || true`);

                  // 🔧 改进：减少等待时间，避免阻塞启动
                  await new Promise(resolve => setTimeout(resolve, 200));

                  // 检查进程是否还存在，如果存在则强制杀死
                  try {
                    await execPromise(`kill -0 ${pid} 2>/dev/null`);
                    console.log(`🔨 强制终止进程 PID: ${pid}`);
                    await execPromise(`kill -9 ${pid} 2>/dev/null || true`);
                  } catch (e) {
                    // 进程已经不存在了，这是好事
                    console.log(`✅ 进程 ${pid} 已成功终止`);
                  }
                } catch (error) {
                  console.log(`⚠️ 终止进程 ${pid} 时出错:`, error.message);
                }
              }
              console.log('✅ Gost 进程清理完成');
            } else {
              console.log('✅ 未发现运行中的 Gost 进程');
            }
          } catch (pgrepError) {
            console.log('⚠️ pgrep 命令不可用，尝试备用方案');

            // 方法2：使用 ps 命令作为备用方案（更安全的过滤）
            try {
              const gostExecutableName = platformUtils.getGostExecutableName();
              // 🔧 修复：使用更精确的 grep 模式，避免匹配到 Node.js 进程
              const { stdout } = await execPromise(`ps -ef | grep "${gostExecutableName}" | grep -v grep | grep -v node | grep -v npm 2>/dev/null || echo ""`);
              if (stdout.trim()) {
                console.log('🎯 使用 ps 命令发现 Gost 进程，尝试清理...');

                // 提取 PID 并验证
                const lines = stdout.trim().split('\n');
                for (const line of lines) {
                  const parts = line.trim().split(/\s+/);
                  if (parts.length >= 2) {
                    const pid = parts[1];
                    const cmdline = line;

                    // 🔧 额外验证：确保不是 Node.js 或其他非 Gost 进程
                    if (pid && /^\d+$/.test(pid) &&
                        !cmdline.includes('node') &&
                        !cmdline.includes('npm') &&
                        !cmdline.includes('app.js') &&
                        (cmdline.includes('/gost') || cmdline.includes('\\gost'))) {
                      try {
                        console.log(`🛑 终止 Gost 进程 PID: ${pid}`);
                        console.log(`📋 进程信息: ${cmdline}`);
                        await execPromise(`kill -TERM ${pid} 2>/dev/null || true`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await execPromise(`kill -9 ${pid} 2>/dev/null || true`);
                      } catch (e) {
                        console.log(`⚠️ 终止进程 ${pid} 时出错:`, e.message);
                      }
                    } else {
                      console.log(`⚠️ 跳过非 Gost 进程: ${cmdline}`);
                    }
                  }
                }
                console.log('✅ 备用进程清理完成');
              } else {
                console.log('✅ 未发现运行中的 Gost 进程');
              }
            } catch (psError) {
              console.log('⚠️ ps 命令也失败，跳过进程清理');
            }
          }
        } catch (error) {
          // 🔧 改进：即使进程清理完全失败，也不应该中断启动
          console.log('⚠️ 进程清理过程中出现错误:', error.message);
          console.log('🔄 跳过进程清理，继续启动服务...');
        }
      }
    } catch (error) {
      // 🔧 改进：更详细的错误处理，但不中断启动流程
      console.log('⚠️ 进程清理阶段出现异常:', error.message);
      console.log('🔄 忽略清理错误，继续启动服务...');
    }
  }

  // 检查端口是否被占用
  async checkPort(port) {
    try {
      console.log(`Checking if port ${port} is in use...`);

      if (isWindows()) {
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

      if (isWindows()) {
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

      const appConfig = require('../config/config');
      const executablePath = appConfig.gost.executablePath;
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

      // 🔧 添加Web API配置以支持热加载
      const configWithAPI = {
        ...gostConfig,
        api: {
          addr: ':18080',
          pathPrefix: '/api',
          accesslog: false
        }
      };

      // 写入配置文件
      fs.writeFileSync(this.configPath, JSON.stringify(configWithAPI, null, 2));
      console.log('已创建配置文件:', this.configPath);
      console.log('🔧 已启用GOST Web API (端口18080) 支持热加载');

      // 启动 Go-Gost 进程
      const args = ['-C', this.configPath];
      console.log('使用配置文件启动:', this.configPath);
      console.log('完整命令:', executablePath, args.join(' '));

      this.process = spawn(executablePath, args, {
        // 捕获stdout和stderr
        stdio: ['ignore', 'pipe', 'pipe'],
        // 使用shell (在Windows上可能需要)
        shell: isWindows(),
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
        this.startTime = null;
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
        this.startTime = Date.now();
        this.userStoppedService = false; // 🔧 重置用户停止标志
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

      const appConfig = require('../config/config');
      const gostConfig = {
        ...appConfig.gost.defaultConfig,
        ...options
      };
      console.log('Using configuration:', gostConfig);

      const args = [
        '-L', gostConfig.listen,
        '-F', gostConfig.forward,
        '-log', gostConfig.logLevel
      ];
      console.log('Starting with arguments:', args);

      this.process = spawn(appConfig.gost.executablePath, args);
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
        this.startTime = null;
      });

      this.isRunning = true;
      this.startTime = Date.now();
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
        // 🔧 设置标志，防止健康检查自动重启
        this.userStoppedService = true;

        this.process.kill();
        console.log('Go-Gost process terminated');
      } catch (error) {
        console.error('Error stopping Go-Gost process:', error);
      }
      this.process = null;
      this.isRunning = false;
      this.startTime = null;

      // 🔧 持久化停止状态
      this.persistStatus(false, null);

      console.log('Go-Gost service stopped');
    } else {
      console.log('No running Go-Gost service to stop');
    }
  }

  // 重启 Go-Gost (优先使用热加载)
  async restart(options = {}, useConfig = false) {
    console.log('🔄 重启 Go-Gost 服务...');

    // 🔥 如果服务正在运行且使用配置文件，尝试热加载
    if (this.isRunning && useConfig) {
      try {
        console.log('🔥 尝试使用热加载重启...');
        const currentConfig = await this.getCurrentConfig();
        if (currentConfig) {
          const success = await this.hotReloadConfig(currentConfig);
          if (success) {
            console.log('✅ 热加载重启成功！');
            return;
          }
        }
      } catch (error) {
        console.warn('⚠️ 热加载重启失败，回退到完全重启:', error.message);
      }
    }

    // 回退到传统重启方式
    console.log('🔄 执行完全重启...');
    await this.forceRestart(useConfig);
  }

  // 强制完全重启 (不使用热加载)
  async forceRestart(useConfig = false) {
    console.log('🔄 强制完全重启 Go-Gost 服务...');
    this.stop();
    if (useConfig) {
      await this.startWithConfig();
    } else {
      await this.start();
    }
  }

  // 获取运行状态
  async getStatus() {
    // 实际检测进程状态
    let actuallyRunning = false;
    let actualPid = null;
    let statusChanged = false;

    // 如果有进程对象，检查进程是否真的在运行
    if (this.process && this.process.pid) {
      try {
        // 发送信号0检查进程是否存在
        process.kill(this.process.pid, 0);
        actuallyRunning = true;
        actualPid = this.process.pid;

        // 检查状态是否需要同步
        if (!this.isRunning) {
          console.log(`🔄 检测到 GOST 进程 ${this.process.pid} 正在运行，但内存状态为未运行，同步状态`);
          this.isRunning = true;
          if (!this.startTime) {
            this.startTime = Date.now();
          }
          statusChanged = true;
        }
      } catch (e) {
        // 进程不存在
        if (this.isRunning) {
          console.log(`❌ GOST 进程 ${this.process.pid} 已不存在，但内存状态为运行中，同步状态`);
          statusChanged = true;
        }
        this.isRunning = false;
        this.process = null;
        this.startTime = null;
      }
    } else {
      // 没有进程对象，但可能有其他 GOST 进程在运行
      const runningProcess = await this.detectRunningGostProcess();
      if (runningProcess) {
        console.log(`🔍 检测到外部 GOST 进程 ${runningProcess.pid} 正在运行`);
        actuallyRunning = true;
        actualPid = runningProcess.pid;

        if (!this.isRunning) {
          console.log(`🔄 发现外部 GOST 进程，更新内存状态`);
          this.isRunning = true;
          this.startTime = Date.now();
          statusChanged = true;

          // 尝试关联到这个进程 (如果可能)
          // 注意：这里不能直接关联，因为我们没有创建这个进程
          console.log(`⚠️ 检测到外部 GOST 进程，建议重启服务以获得完整控制`);
        }
      } else {
        // 确实没有 GOST 进程运行
        if (this.isRunning) {
          console.log(`🔄 没有检测到 GOST 进程，但内存状态为运行中，同步状态`);
          statusChanged = true;
        }
        this.isRunning = false;
        this.startTime = null;
      }
    }

    // 如果状态发生变化，持久化到配置文件
    if (statusChanged) {
      await this.persistStatus(actuallyRunning, actualPid);
    }

    // 获取基本状态 (使用实际检测的状态)
    const baseStatus = {
      isRunning: actuallyRunning,
      pid: actualPid
    };

    // 获取配置信息
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));

        // 提取服务信息和端口使用情况
        const services = configData.services || [];
        const portForwards = services.map(service => {
          const sourcePort = service.addr ? parseInt(service.addr.replace(':', ''), 10) : null;

          // 提取目标地址
          let targetHost = null;
          let targetPort = null;

          if (service.handler && service.handler.chain) {
            // 检查chain是否为字符串（链名称）还是对象（直接配置）
            if (typeof service.handler.chain === 'string') {
              // 这是链名称，需要在chains中查找
              const chainName = service.handler.chain;
              if (configData.chains) {
                const chain = configData.chains.find(c => c.name === chainName);
                if (chain && chain.hops && chain.hops.length > 0 && chain.hops[0].nodes && chain.hops[0].nodes.length > 0) {
                  const firstNode = chain.hops[0].nodes[0];
                  if (firstNode.addr) {
                    const addrParts = firstNode.addr.split(':');
                    if (addrParts.length === 2) {
                      targetHost = addrParts[0];
                      targetPort = parseInt(addrParts[1], 10);
                    }
                  }
                }
              }
            } else if (Array.isArray(service.handler.chain)) {
              // 直接是配置数组
              const firstChain = service.handler.chain[0];
              if (firstChain && firstChain.addr) {
                const addrParts = firstChain.addr.split(':');
                if (addrParts.length === 2) {
                  targetHost = addrParts[0];
                  targetPort = parseInt(addrParts[1], 10);
                }
              }
            }
          }

          return {
            name: service.name || `端口${sourcePort}服务`,
            protocol: service.listener ? service.listener.type : (service.handler ? service.handler.type : 'unknown'),
            sourcePort,
            targetHost,
            targetPort
          };
        });

        // 系统信息 - 使用统一的平台工具
        const systemInfo = {
          platform: platformUtils.osInfo.platform,
          distro: platformUtils.osInfo.distro,
          hostname: os.hostname(),
          uptime: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
          startTime: this.startTime ? new Date(this.startTime).toISOString() : null
        };

        return {
          ...baseStatus,
          portForwards,
          config: configData,
          systemInfo,
          configPath: this.configPath
        };
      }
    } catch (error) {
      console.error('获取详细状态信息出错:', error);
    }

    return baseStatus;
  }

  // 检测是否有外部 GOST 进程在运行
  async detectRunningGostProcess() {
    try {
      const gostExecutableName = platformUtils.getGostExecutableName();

      if (isWindows()) {
        // Windows 系统
        const { stdout } = await execPromise(`tasklist /fi "imagename eq ${gostExecutableName}" /fo csv /nh`);
        if (stdout.includes(gostExecutableName)) {
          // 解析输出获取 PID
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            if (line.includes(gostExecutableName)) {
              const parts = line.split(',');
              if (parts.length >= 2) {
                const pid = parseInt(parts[1].replace(/"/g, ''), 10);
                if (!isNaN(pid)) {
                  return { pid, name: gostExecutableName };
                }
              }
            }
          }
        }
      } else {
        // Linux/Mac 系统 - 更精确地检测GOST可执行文件
        const { stdout } = await execPromise(`ps -ef | grep "${gostExecutableName}" | grep -v grep | grep -v node || echo ""`);
        if (stdout.trim()) {
          const lines = stdout.trim().split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 8) {
              const pid = parseInt(parts[1], 10);
              const command = parts.slice(7).join(' '); // 获取完整命令行

              // 确保这是真正的GOST可执行文件，而不是包含gost路径的其他进程
              if (!isNaN(pid)) {
                // 更严格的检查：必须是真正的GOST可执行文件
                const isRealGost = (
                  // 1. 命令行以gost可执行文件开头
                  command.startsWith(gostExecutableName) ||
                  command.includes(`/${gostExecutableName} `) ||
                  command.includes(`\\${gostExecutableName}.exe`) ||
                  // 2. 或者是完整路径的gost可执行文件
                  (command.includes('/gost') && (command.includes(' -C ') || command.includes(' -L ')))
                ) && (
                  // 3. 排除明显的非GOST进程
                  !command.includes('curl') &&
                  !command.includes('node') &&
                  !command.includes('npm') &&
                  !command.includes('vue-cli-service') &&
                  !command.includes('http://') &&
                  !command.includes('https://')
                );

                if (isRealGost) {
                  console.log(`🔍 检测到真正的 GOST 进程: PID=${pid}, 命令=${command}`);
                  return { pid, name: gostExecutableName };
                } else {
                  console.log(`⚠️ 跳过非 Gost 进程 PID ${pid}: ${command}`);
                }
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.log('检测外部 GOST 进程时出错:', error.message);
      return null;
    }
  }

  // 持久化状态到配置文件
  async persistStatus(isRunning, pid) {
    try {
      const statusFile = path.join(__dirname, '../config/gost-status.json');
      const statusData = {
        isRunning,
        pid,
        lastUpdate: new Date().toISOString(),
        startTime: this.startTime ? new Date(this.startTime).toISOString() : null
      };

      fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2));
      console.log(`💾 GOST 状态已持久化: 运行=${isRunning}, PID=${pid}`);

      return true;
    } catch (error) {
      console.error('持久化 GOST 状态失败:', error);
      return false;
    }
  }

  // 从配置文件加载状态
  loadPersistedStatus() {
    try {
      const statusFile = path.join(__dirname, '../config/gost-status.json');
      if (fs.existsSync(statusFile)) {
        const statusData = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        console.log(`📂 加载持久化的 GOST 状态:`, statusData);

        // 验证持久化的进程是否仍在运行
        if (statusData.isRunning && statusData.pid) {
          try {
            process.kill(statusData.pid, 0);
            console.log(`✅ 持久化的进程 ${statusData.pid} 仍在运行`);
            return statusData;
          } catch (e) {
            console.log(`❌ 持久化的进程 ${statusData.pid} 已不存在`);
            // 清理过期的状态文件
            this.persistStatus(false, null);
          }
        }
      }
    } catch (error) {
      console.error('加载持久化状态失败:', error);
    }

    return null;
  }

  // 🔥 新增：GOST热加载方法 (高性能，无重启) - 增强版
  async hotReloadConfig(newConfig, options = {}) {
    try {
      console.log('🔥 开始GOST热加载配置...');

      // 检查配置是否真的有变化
      const currentConfig = await this.getCurrentConfig();
      const configChanged = this.isConfigurationChanged(currentConfig, newConfig);

      // 强制更新模式：某些关键场景必须更新
      const forceUpdate = process.env.FORCE_GOST_UPDATE === 'true' || options.force;

      // 🔧 新增：用户过期等关键场景强制同步
      const criticalScenarios = ['user_expired', 'emergency_quota_disable', 'traffic_reset'];
      const isCriticalUpdate = options.trigger && criticalScenarios.includes(options.trigger);

      if (!configChanged && !forceUpdate && !isCriticalUpdate) {
        console.log('📋 配置无变化，跳过热加载');
        return false;
      }

      if ((forceUpdate || isCriticalUpdate) && !configChanged) {
        console.log(`🔥 ${isCriticalUpdate ? '关键场景' : '强制更新'}模式，即使配置无变化也执行热加载 (触发源: ${options.trigger || 'manual'})`);
      }

      console.log('📝 配置发生变化，执行热加载...');

      // 🔧 添加Web API配置以支持热加载
      const configWithAPI = {
        ...newConfig,
        api: {
          addr: ':18080',
          pathPrefix: '/api',
          accesslog: false
        }
      };

      // 保存新配置
      fs.writeFileSync(this.configPath, JSON.stringify(configWithAPI, null, 2));
      console.log('✅ 配置文件已更新');

      // 🔥 使用GOST Web API进行热加载
      if (this.isRunning) {
        try {
          console.log('🔥 通过Web API执行热加载...');

          // 使用Node.js内置的http模块进行热加载
          const http = require('http');

          const options = {
            hostname: 'localhost',
            port: 18080,
            path: '/api/config/reload',  // 🔧 使用正确的reload API
            method: 'POST',  // 🔧 根据GOST官方文档，使用POST方法重新加载配置文件
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 5000
          };

          const success = await new Promise((resolve) => {
            const req = http.request(options, (res) => {
              let responseData = '';

              res.on('data', (chunk) => {
                responseData += chunk;
              });

              res.on('end', () => {
                if (res.statusCode === 200) {
                  console.log('✅ GOST热加载成功！配置文件已重新加载');
                  resolve(true);
                } else {
                  console.warn(`⚠️ 热加载失败，状态码: ${res.statusCode}, 响应: ${responseData}`);
                  resolve(false);
                }
              });
            });

            req.on('error', (error) => {
              console.warn('⚠️ 热加载API调用失败:', error.message);
              resolve(false);
            });

            req.on('timeout', () => {
              console.warn('⚠️ 热加载API调用超时');
              req.destroy();
              resolve(false);
            });

            req.end();  // 不需要发送数据，只是触发重新加载
          });

          if (success) {
            // 🔧 新增：热加载后验证配置同步状态
            const verificationResult = await this.verifyConfigSync(configWithAPI);
            if (!verificationResult.success) {
              console.warn('⚠️ 热加载后配置验证失败，强制重启GOST服务');
              console.warn('验证失败原因:', verificationResult.reason);
              await this.forceRestart(true);
              return true;
            }
            console.log('✅ 热加载后配置验证通过');
            return true;
          } else {
            console.warn('⚠️ 热加载失败，强制重启GOST服务以确保配置生效');
            await this.forceRestart(true);
            return true; // 重启成功后返回true
          }
        } catch (error) {
          console.warn('⚠️ 热加载异常，强制重启GOST服务:', error.message);
          await this.forceRestart(true);
          return true; // 重启成功后返回true
        }
      } else if (newConfig.services && newConfig.services.length > 0) {
        console.log('🚀 服务未运行但有有效配置，启动GOST服务...');
        await this.startWithConfig(configWithAPI);
      } else {
        console.log('📋 服务未运行且无有效配置，配置已保存');
      }

      return true;
    } catch (error) {
      console.error('❌ GOST热加载失败:', error);
      throw error;
    }
  }

  // 🔧 新增：验证GOST实际运行状态与配置文件一致性
  async verifyConfigSync(expectedConfig, maxRetries = 3) {
    try {
      console.log('🔍 开始验证GOST配置同步状态...');

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // 等待一段时间让GOST完成配置加载
          if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }

          // 获取GOST实际运行的配置
          const actualConfig = await this.getGostRunningConfig();
          if (!actualConfig) {
            console.warn(`⚠️ 验证尝试 ${attempt}/${maxRetries}: 无法获取GOST运行配置`);
            continue;
          }

          // 比较服务数量
          const expectedServices = expectedConfig.services || [];
          const actualServices = actualConfig.services || [];

          if (expectedServices.length !== actualServices.length) {
            console.warn(`⚠️ 验证尝试 ${attempt}/${maxRetries}: 服务数量不匹配 - 期望: ${expectedServices.length}, 实际: ${actualServices.length}`);
            if (attempt === maxRetries) {
              return {
                success: false,
                reason: `服务数量不匹配: 期望 ${expectedServices.length}, 实际 ${actualServices.length}`
              };
            }
            continue;
          }

          // 比较服务端口
          const expectedPorts = expectedServices.map(s => s.addr.replace(':', '')).sort();
          const actualPorts = actualServices.map(s => s.addr.replace(':', '')).sort();

          const portsMatch = JSON.stringify(expectedPorts) === JSON.stringify(actualPorts);
          if (!portsMatch) {
            console.warn(`⚠️ 验证尝试 ${attempt}/${maxRetries}: 端口不匹配 - 期望: [${expectedPorts.join(', ')}], 实际: [${actualPorts.join(', ')}]`);
            if (attempt === maxRetries) {
              return {
                success: false,
                reason: `端口不匹配: 期望 [${expectedPorts.join(', ')}], 实际 [${actualPorts.join(', ')}]`
              };
            }
            continue;
          }

          console.log(`✅ 验证成功 (尝试 ${attempt}/${maxRetries}): GOST配置已正确同步`);
          console.log(`📊 同步状态: ${actualServices.length} 个服务, 端口: [${actualPorts.join(', ')}]`);
          return { success: true };

        } catch (error) {
          console.warn(`⚠️ 验证尝试 ${attempt}/${maxRetries} 异常:`, error.message);
          if (attempt === maxRetries) {
            return {
              success: false,
              reason: `验证异常: ${error.message}`
            };
          }
        }
      }

      return {
        success: false,
        reason: `验证失败: 超过最大重试次数 ${maxRetries}`
      };

    } catch (error) {
      console.error('❌ 配置同步验证失败:', error);
      return {
        success: false,
        reason: `验证异常: ${error.message}`
      };
    }
  }

  // 🔧 新增：获取GOST实际运行的配置
  async getGostRunningConfig() {
    try {
      const http = require('http');

      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'localhost',
          port: 18080,
          path: '/api/config',
          method: 'GET',
          timeout: 3000
        };

        const req = http.request(options, (res) => {
          let data = '';

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              if (res.statusCode === 200) {
                const config = JSON.parse(data);
                resolve(config);
              } else {
                console.warn(`获取GOST运行配置失败，状态码: ${res.statusCode}`);
                resolve(null);
              }
            } catch (error) {
              console.warn('解析GOST运行配置失败:', error.message);
              resolve(null);
            }
          });
        });

        req.on('error', (error) => {
          console.warn('获取GOST运行配置异常:', error.message);
          resolve(null);
        });

        req.on('timeout', () => {
          console.warn('获取GOST运行配置超时');
          req.destroy();
          resolve(null);
        });

        req.end();
      });

    } catch (error) {
      console.warn('获取GOST运行配置异常:', error.message);
      return null;
    }
  }

  // 更新配置文件（优化版本 - 使用热加载）
  async updateConfig(newConfig, options = {}) {
    try {
      console.log('🔄 开始更新GOST配置...');

      // 🔧 优先使用热加载，传递选项参数
      return await this.hotReloadConfig(newConfig, options);

    } catch (error) {
      console.error('❌ 更新GOST配置失败:', error);
      throw error;
    }
  }

  // 获取当前配置
  async getCurrentConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configContent = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(configContent);
      }
      return null;
    } catch (error) {
      console.warn('读取当前配置失败:', error);
      return null;
    }
  }

  // 检查配置是否有实质性变化
  isConfigurationChanged(oldConfig, newConfig) {
    if (!oldConfig || !newConfig) {
      return true; // 如果无法比较，假设有变化
    }

    try {
      // 比较关键配置项
      const oldServices = oldConfig.services || [];
      const newServices = newConfig.services || [];

      // 服务数量变化
      if (oldServices.length !== newServices.length) {
        console.log(`🔍 服务数量变化: ${oldServices.length} -> ${newServices.length}`);
        return true;
      }

      // 逐个比较服务配置
      for (let i = 0; i < newServices.length; i++) {
        const oldService = oldServices[i];
        const newService = newServices[i];

        if (!oldService ||
            oldService.name !== newService.name ||
            oldService.addr !== newService.addr ||
            JSON.stringify(oldService.handler) !== JSON.stringify(newService.handler)) {
          console.log(`🔍 服务配置变化: ${newService.name}`);
          return true;
        }
      }

      // 比较观察器配置
      const oldObservers = oldConfig.observers || [];
      const newObservers = newConfig.observers || [];

      if (JSON.stringify(oldObservers) !== JSON.stringify(newObservers)) {
        console.log('🔍 观察器配置变化');
        return true;
      }

      console.log('📋 配置无实质性变化');
      return false;
    } catch (error) {
      console.warn('配置比较失败，假设有变化:', error);
      return true;
    }
  }
}

module.exports = new GostService();