const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { sequelize, initDb, models } = require('./services/dbService');
const initGost = require('./scripts/init-gost');
const { quickCheck } = require('./scripts/check-environment');
const { platformUtils } = require('./utils/platform');
const helmet = require('helmet');
const { errorMiddleware } = require('./utils/errorHandler');
const { defaultLogger } = require('./utils/logger');
const path = require('path');
const fs = require('fs');

// 导入新的服务
const multiInstanceCacheService = require('./services/multiInstanceCacheService');
const gostPluginService = require('./services/gostPluginService');
const gostHealthService = require('./services/gostHealthService');
// const { realtimeMonitoringService } = require('./services/realtimeMonitoringService'); // 暂时禁用

// 导入配置
const config = require('./config/config');

// 端口配置优先级：命令行参数 > 环境变量 > 配置文件默认值
let PORT = config.server.port; // 从配置文件读取（已包含环境变量处理）

// 解析命令行参数，命令行参数优先级最高
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && i + 1 < args.length) {
    const portArg = parseInt(args[i + 1], 10);
    if (!isNaN(portArg) && portArg > 0 && portArg < 65536) {
      PORT = portArg;
      defaultLogger.info(`使用命令行指定的端口: ${PORT}`);
    } else {
      defaultLogger.warn(`无效的端口参数: ${args[i + 1]}，使用配置端口 ${PORT}`);
    }
    break;
  }
}

// 显示最终使用的端口和来源
if (process.env.PORT && PORT == process.env.PORT) {
  defaultLogger.info(`使用环境变量指定的端口: ${PORT}`);
} else if (PORT == config.server.port) {
  defaultLogger.info(`使用配置文件默认端口: ${PORT}`);
}

// 创建 Express 应用
const app = express();

// 中间件
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// 配置Helmet安全策略，允许HTTP协议和同源API请求
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"], // 允许同源API请求（相对路径）
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  // 禁用HSTS，允许HTTP访问
  hsts: false,
  // 禁用强制HTTPS升级
  forceHTTPSRedirect: false
}));

// 添加协议控制中间件
app.use((req, res, next) => {
  // 禁用浏览器的HTTPS强制升级
  res.setHeader('Strict-Transport-Security', 'max-age=0');
  // 移除upgrade-insecure-requests，允许HTTP资源
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;");
  next();
});

// 静态文件服务 - 提供前端页面
app.use(express.static(path.join(__dirname, 'public')));

// 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/rules', require('./routes/rules'));
app.use('/api/user-forward-rules', require('./routes/userForwardRules'));
// GOST 服务管理路由
app.use('/api/gost', require('./routes/gost'));
// GOST 插件路由 (认证器、观测器、限制器)
app.use('/api/gost-plugin', require('./routes/gostPlugin'));
app.use('/api/gost-config', require('./routes/gostConfig'));
app.use('/api/traffic', require('./routes/traffic'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/test', require('./routes/test'));
app.use('/api/quota', require('./routes/quota')); // 配额管理路由（完整版）
app.use('/api/port-security', require('./routes/portSecurity')); // 端口安全验证路由
app.use('/api/system', require('./routes/system')); // 系统状态API路由
app.use('/api/performance-config', require('./routes/performanceConfig')); // 性能配置管理路由
app.use('/api/network-config', require('./routes/networkConfig')); // 网络配置检测路由
app.use('/api/system-config', require('./routes/systemConfig')); // 系统配置管理路由

// 添加简单的健康检查接口
app.get('/api/health', (req, res) => {
  const healthStatus = gostHealthService.getHealthStatus();
  res.json({
    status: 'ok',
    message: '服务正常运行',
    gostHealth: healthStatus
  });
});

// 测试端口转发 6443->8080 的接口
app.get('/api/test-forward', (req, res) => {
  res.json({
    status: 'ok',
    message: '如果你能看到这条消息，说明通过 6443 端口成功访问了本服务',
    info: '这条消息由 Node.js 服务通过端口转发提供'
  });
});

// 前端路由回退 - 所有非API请求都返回index.html
app.get('*', (req, res) => {
  // 如果是API请求，返回404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'API endpoint not found' });
  }

  // 其他请求返回前端页面
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend not built. Please run: npm run build in frontend directory');
  }
});

// 启动服务器并初始化
(async function startServer() {
  try {
    // 0. 快速环境检查
    defaultLogger.info('检查运行环境...');
    platformUtils.printEnvironmentInfo();

    const envCheck = quickCheck();
    if (!envCheck.platformSupported) {
      defaultLogger.error('不支持的操作系统平台');
      process.exit(1);
    }
    if (!envCheck.nodeOk) {
      defaultLogger.error('Node.js 版本过低，需要 14+ 版本');
      process.exit(1);
    }
    if (!envCheck.gostOk) {
      defaultLogger.warn('Gost 二进制文件不存在，将在启动时自动下载');
    }
    defaultLogger.info('环境检查通过');

    // 1. 先初始化数据库
    defaultLogger.info('正在初始化数据库...');
    const dbSuccess = await initDb();
    if (!dbSuccess) {
      defaultLogger.warn('数据库初始化存在问题，但服务将继续启动');
    } else {
      defaultLogger.info('数据库初始化成功');
    }

    // 1.5 初始化新的服务
    defaultLogger.info('初始化缓存和监控服务...');

    try {
      // 初始化多实例缓存服务
      await multiInstanceCacheService.initialize();
      defaultLogger.info('多实例缓存服务初始化成功');
    } catch (error) {
      defaultLogger.warn('多实例缓存服务初始化失败，将使用数据库回退:', error.message);
    }

    // 初始化性能配置管理器
    try {
      const performanceConfigManager = require('./services/performanceConfigManager');
      await performanceConfigManager.initialize();
      defaultLogger.info('性能配置管理器初始化成功');
    } catch (error) {
      defaultLogger.warn('性能配置管理器初始化失败:', error.message);
    }

    // 初始化系统模式管理器
    try {
      const systemModeManager = require('./services/systemModeManager');
      await systemModeManager.initialize();
      defaultLogger.info('系统模式管理器初始化成功');
    } catch (error) {
      defaultLogger.warn('系统模式管理器初始化失败:', error.message);
    }

    // 初始化缓存协调器 (根据模式决定是否启动)
    try {
      const systemModeManager = require('./services/systemModeManager');
      if (!systemModeManager.isSimpleMode()) {
        const cacheCoordinator = require('./services/cacheCoordinator');
        await cacheCoordinator.initialize();
        defaultLogger.info('缓存协调器初始化成功');
      } else {
        defaultLogger.info('单击模式下跳过缓存协调器初始化');
      }
    } catch (error) {
      defaultLogger.warn('缓存协调器初始化失败:', error.message);
    }

    // 2. 启动Web服务器
    const server = app.listen(PORT, () => {
      defaultLogger.info(`服务器已启动在 http://localhost:${PORT}`);
      defaultLogger.info(`测试端口转发: http://localhost:6443/api/test-forward`);

      // 3. Web服务启动成功后，再启动gost服务
      defaultLogger.info('正在初始化 Go-Gost 服务...');
      initGost()
        .then(() => {
          defaultLogger.info('Go-Gost 服务启动成功');

          // 4. 启动 Gost 配置自动同步服务（使用统一协调器）
          setTimeout(() => {
            defaultLogger.info('启动 Gost 配置自动同步服务...');
            const gostSyncCoordinator = require('./services/gostSyncCoordinator');
            gostSyncCoordinator.startAutoSync();

            // 5. 启动实时流量监控服务
            defaultLogger.info('启动实时流量监控服务...');
            const realTimeTrafficMonitor = require('./services/realTimeTrafficMonitor');
            realTimeTrafficMonitor.startMonitoring();

            // 5. 启动 GOST 健康检查服务
            setTimeout(() => {
              defaultLogger.info('启动 GOST 健康检查服务...');
              gostHealthService.start();

              // 6. Phase 2: 启动配额监控服务
              setTimeout(() => {
                defaultLogger.info('启动流量配额监控服务...');
                const quotaManagementService = require('./services/quotaManagementService');
                quotaManagementService.startQuotaMonitoring();

                // 7. 启动配额强制执行服务
                setTimeout(() => {
                  defaultLogger.info('启动配额强制执行服务...');
                  const { quotaEnforcementService } = require('./services/quotaEnforcementService');
                  quotaEnforcementService.start();
                }, 2000); // 等待配额监控服务启动
              }, 3000); // 等待健康检查服务启动
            }, 5000); // 等待GOST服务完全启动
          }, 2000);
        })
        .catch(error => {
          defaultLogger.error('Go-Gost 服务启动失败:', error.message);
        });
    });

    // 处理服务器关闭
    server.on('close', async () => {
      defaultLogger.info('服务器正在关闭，停止相关服务...');
      try {
        // 停止 GOST 健康检查服务
        gostHealthService.stop();

        // 停止 Gost 配置同步服务（使用统一协调器）
        const gostSyncCoordinator = require('./services/gostSyncCoordinator');
        gostSyncCoordinator.stopAutoSync();
        gostSyncCoordinator.cleanup();

        // 停止实时流量监控服务
        const realTimeTrafficMonitor = require('./services/realTimeTrafficMonitor');
        realTimeTrafficMonitor.stopMonitoring();

        // 停止 Gost 服务
        const gostService = require('./services/gostService');
        gostService.stop();

        // 停止配额监控服务
        const quotaManagementService = require('./services/quotaManagementService');
        quotaManagementService.stopQuotaMonitoring();

        // 停止配额强制执行服务
        const { quotaEnforcementService } = require('./services/quotaEnforcementService');
        quotaEnforcementService.stop();

        defaultLogger.info('所有服务已停止');
      } catch (error) {
        defaultLogger.error('停止服务时出错:', error);
      }
    });

    // 处理进程退出
    process.on('SIGINT', async () => {
      defaultLogger.info('收到 SIGINT 信号，正在关闭服务器...');
      if (server) {
        server.close(() => {
          defaultLogger.info('服务器已关闭');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });

    process.on('SIGTERM', async () => {
      defaultLogger.info('收到 SIGTERM 信号，正在关闭服务器...');
      if (server) {
        server.close(() => {
          defaultLogger.info('服务器已关闭');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });

  } catch (error) {
    defaultLogger.error('服务器启动失败:', error);
    process.exit(1);
  }
})();
