const express = require('express');
const router = express.Router();
const gostService = require('../services/gostService');
const fs = require('fs');
const path = require('path');
const { getGostExecutablePath } = require('../utils/platform');
const { auth, adminAuth } = require('../middleware/auth');

/**
 * 获取 Go-Gost 基本状态信息 - 所有用户可访问
 */
router.get('/status/basic', auth, async (req, res) => {
  try {
    const status = await gostService.getStatus();

    // 只返回基本状态信息，隐藏敏感信息
    const basicStatus = {
      isRunning: status.isRunning,
      pid: status.isRunning ? '****' : null, // 隐藏真实PID
      startTime: status.isRunning ? '****' : null, // 隐藏启动时间
      portForwards: status.portForwards ? status.portForwards.map(pf => ({
        name: '****', // 隐藏服务名称
        protocol: pf.protocol,
        localPort: pf.localPort,
        targetHost: '****', // 隐藏目标主机
        targetPort: '****', // 隐藏目标端口
        status: pf.status
      })) : [],
      systemInfo: status.systemInfo ? {
        uptime: status.isRunning ? '****' : null, // 隐藏运行时间
        connections: status.isRunning ? '****' : null // 隐藏连接数
      } : null
    };

    res.json({
      success: true,
      data: basicStatus
    });
  } catch (error) {
    console.error('获取Gost基本状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取Gost服务状态失败'
    });
  }
});

/**
 * 获取 Go-Gost 运行状态，包含详细信息 - 仅管理员
 */
router.get('/status', auth, adminAuth, async (req, res) => {
  try {
    const status = await gostService.getStatus();
    const configPath = path.join(__dirname, '../config/gost-config.json');
    let configExists = false;
    let config = null;

    if (fs.existsSync(configPath)) {
      configExists = true;
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }

    // 🔧 使用统一的动态平台检测
    const executablePath = getGostExecutablePath();
    const executableExists = fs.existsSync(executablePath);

    res.json({
      success: true,
      data: {
        ...status,
        executablePath,
        executableExists,
        configPath,
        configExists,
        config
      }
    });
  } catch (error) {
    console.error('获取状态详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取状态失败',
      error: error.message
    });
  }
});

/**
 * 获取当前配置 - 仅管理员
 */
router.get('/config', auth, adminAuth, (req, res) => {
  try {
    const configPath = path.join(__dirname, '../config/gost-config.json');
    if (!fs.existsSync(configPath)) {
      return res.json({
        success: true,
        data: gostService.defaultConfig
      });
    }

    // 读取配置
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取配置失败',
      error: error.message
    });
  }
});

/**
 * 更新配置 - 热加载优化版 - 仅管理员
 */
router.post('/config', auth, adminAuth, async (req, res) => {
  try {
    const newConfig = req.body;
    const result = await gostService.updateConfig(newConfig);
    res.json({
      success: true,
      message: '配置已更新（使用热加载技术，无需重启）',
      method: 'hot_reload',
      updated: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '更新配置失败',
      error: error.message
    });
  }
});

/**
 * 启动服务 - 增强版 - 仅管理员
 */
router.post('/start', auth, adminAuth, async (req, res) => {
  try {
    console.log('收到启动 Go-Gost 服务请求');

    // 先检查可执行文件
    await gostService.ensureExecutable();
    console.log('Go-Gost 可执行文件已确认');

    // 关闭现有进程
    await gostService.killExistingProcess();
    console.log('已清理现有 Go-Gost 进程');

    // 读取配置获取转发端口
    let forwardPort = 6443; // 默认端口
    try {
      const configPath = path.join(__dirname, '../config/gost-config.json');
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);
        if (config.services && config.services.length > 0) {
          const addrStr = config.services[0].addr;
          
          // 修复端口提取逻辑，确保正确处理IP地址和端口
          let port;
          
          // 处理格式为 ":端口" 的情况
          if (addrStr.startsWith(':')) {
            port = parseInt(addrStr.substring(1), 10);
          } 
          // 处理格式为 "IP:端口" 的情况
          else if (addrStr.includes(':')) {
            // 分离IP和端口
            const lastColonIndex = addrStr.lastIndexOf(':');
            port = parseInt(addrStr.substring(lastColonIndex + 1), 10);
          } 
          // 无法识别的格式
          else {
            port = NaN;
          }
          
          if (!isNaN(port) && port > 0 && port <= 65535) {
            forwardPort = port;
          }
        }
      }
    } catch (err) {
      console.warn('读取配置文件失败，将使用默认端口:', err);
    }

    // 确保端口可用
    console.log(`检查并确保端口 ${forwardPort} 可用`);
    try {
      await gostService.preparePort(forwardPort);
      console.log(`端口 ${forwardPort} 已准备就绪`);
    } catch (err) {
      console.warn(`无法准备端口 ${forwardPort}，将自动寻找其他可用端口:`, err.message);
    }

    // 启动服务
    const result = await gostService.startWithConfig();

    if (result) {
      const status = await gostService.getStatus();
      console.log('Go-Gost 服务启动成功', status);

      // 重新读取当前使用的端口
      let currentPort = null;
      try {
        const configContent = fs.readFileSync(path.join(__dirname, '../config/gost-config.json'), 'utf8');
        const config = JSON.parse(configContent);
        if (config.services && config.services.length > 0) {
          const addrStr = config.services[0].addr;
          
          // 修复端口提取逻辑，确保正确处理IP地址和端口
          // 处理格式为 ":端口" 的情况
          if (addrStr.startsWith(':')) {
            currentPort = parseInt(addrStr.substring(1), 10);
          } 
          // 处理格式为 "IP:端口" 的情况
          else if (addrStr.includes(':')) {
            // 分离IP和端口
            const lastColonIndex = addrStr.lastIndexOf(':');
            currentPort = parseInt(addrStr.substring(lastColonIndex + 1), 10);
          }
          
          // 验证端口有效性
          if (isNaN(currentPort) || currentPort <= 0 || currentPort > 65535) {
            currentPort = null;
          }
        }
      } catch (err) {
        console.warn('读取当前配置端口失败:', err);
      }

      res.json({
        success: true,
        message: 'Go-Gost 服务已启动',
        data: {
          ...status,
          port: currentPort || forwardPort
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: '启动服务失败，无法获取进程ID'
      });
    }
  } catch (error) {
    console.error('启动服务失败:', error);
    res.status(500).json({
      success: false,
      message: '启动服务失败',
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * 停止服务 - 仅管理员
 */
router.post('/stop', auth, adminAuth, (req, res) => {
  try {
    gostService.stop();
    res.json({
      success: true,
      message: 'Go-Gost 服务已停止'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '停止服务失败',
      error: error.message
    });
  }
});

/**
 * 重启服务 - 热加载优化版 - 仅管理员
 */
router.post('/restart', auth, adminAuth, async (req, res) => {
  try {
    console.log('收到重启 Go-Gost 服务请求');

    const { force = false } = req.body;

    if (force) {
      console.log('🔄 强制完全重启模式');
      // 强制完全重启
      gostService.stop();
      console.log('Go-Gost 服务已停止');

      await gostService.killExistingProcess();
      console.log('已清理现有 Go-Gost 进程');

      await gostService.startWithConfig();
    } else {
      console.log('🔥 智能重启模式（优先热加载）');
      // 智能重启（优先热加载）
      await gostService.restart({}, true);
    }

    const status = await gostService.getStatus();
    console.log('Go-Gost 服务已重启', status);

    res.json({
      success: true,
      message: force ? 'Go-Gost 服务已强制重启' : 'Go-Gost 服务已智能重启',
      data: status,
      method: force ? 'force_restart' : 'smart_restart'
    });
  } catch (error) {
    console.error('重启服务失败:', error);
    res.status(500).json({
      success: false,
      message: '重启服务失败',
      error: error.message
    });
  }
});

module.exports = router;
