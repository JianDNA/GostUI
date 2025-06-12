const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { sequelize, initDb, models } = require('./services/dbService');
const initGost = require('./scripts/init-gost');
const { quickCheck } = require('./scripts/check-environment');
const { platformUtils } = require('./utils/platform');

// 导入新的服务
const multiInstanceCacheService = require('./services/multiInstanceCacheService');
const gostPluginService = require('./services/gostPluginService');
const gostHealthService = require('./services/gostHealthService');
// const { realtimeMonitoringService } = require('./services/realtimeMonitoringService'); // 暂时禁用

// 创建 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: '服务器错误' });
});

// 路由
console.log('🚨🚨🚨 [BREAKPOINT] 注册 /api/auth 路由');
app.use('/api/auth', require('./routes/auth'));
console.log('🚨🚨🚨 [BREAKPOINT] 注册 /api/users 路由');
app.use('/api/users', require('./routes/users'));
console.log('🚨🚨🚨 [BREAKPOINT] 注册 /api/rules 路由');
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
    info: '这条消息由 Node.js 服务通过端口转发提供'  // 🔧 修复：移除具体端口引用
  });
});

// 启动服务器并初始化
(async function startServer() {
  try {
    // 0. 快速环境检查
    console.log('🔍 检查运行环境...');
    platformUtils.printEnvironmentInfo();

    const envCheck = quickCheck();
    if (!envCheck.platformSupported) {
      console.error('❌ 不支持的操作系统平台');
      process.exit(1);
    }
    if (!envCheck.nodeOk) {
      console.error('❌ Node.js 版本过低，需要 14+ 版本');
      process.exit(1);
    }
    if (!envCheck.gostOk) {
      console.warn('⚠️ Gost 二进制文件不存在，请运行 npm run install-gost');
    }
    console.log('✅ 环境检查通过\n');

    // 1. 先初始化数据库
    console.log('正在初始化数据库...');
    const dbSuccess = await initDb();
    if (!dbSuccess) {
      console.warn('数据库初始化存在问题，但服务将继续启动');
    } else {
      console.log('数据库初始化成功');
    }

    // 1.5 初始化新的服务
    console.log('🔄 初始化缓存和监控服务...');

    try {
      // 初始化多实例缓存服务
      await multiInstanceCacheService.initialize();
      console.log('✅ 多实例缓存服务初始化成功');
    } catch (error) {
      console.warn('⚠️ 多实例缓存服务初始化失败，将使用数据库回退:', error.message);
    }

    // 🚀 新增: 初始化性能配置管理器
    try {
      const performanceConfigManager = require('./services/performanceConfigManager');
      await performanceConfigManager.initialize();
      console.log('✅ 性能配置管理器初始化成功');
    } catch (error) {
      console.warn('⚠️ 性能配置管理器初始化失败:', error.message);
    }

    // 🚀 新增: 初始化系统模式管理器
    try {
      const systemModeManager = require('./services/systemModeManager');
      await systemModeManager.initialize();
      console.log('✅ 系统模式管理器初始化成功');
    } catch (error) {
      console.warn('⚠️ 系统模式管理器初始化失败:', error.message);
    }

    // 🚀 新增: 初始化缓存协调器 (根据模式决定是否启动)
    try {
      const systemModeManager = require('./services/systemModeManager');
      if (!systemModeManager.isSimpleMode()) {
        const cacheCoordinator = require('./services/cacheCoordinator');
        await cacheCoordinator.initialize();
        console.log('✅ 缓存协调器初始化成功');
      } else {
        console.log('🎛️ 单击模式下跳过缓存协调器初始化');
      }
    } catch (error) {
      console.warn('⚠️ 缓存协调器初始化失败:', error.message);
    }



    // 2. 启动Web服务器
    const server = app.listen(PORT, () => {
      console.log(`服务器已启动在 http://localhost:${PORT}`);
      console.log(`测试端口转发: http://localhost:6443/api/test-forward`);

      // 2.5 初始化实时监控WebSocket服务 (暂时禁用)
      // try {
      //   realtimeMonitoringService.initialize(server);
      //   console.log('✅ 实时监控WebSocket服务已启动');
      // } catch (error) {
      //   console.warn('⚠️ 实时监控WebSocket服务启动失败:', error.message);
      // }

      // 3. Web服务启动成功后，再启动gost服务
      console.log('正在初始化 Go-Gost 服务...');
      initGost()
        .then(() => {
          console.log('Go-Gost 服务启动成功');

          // 4. 启动 Gost 配置自动同步服务（使用统一协调器）
          setTimeout(() => {
            console.log('启动 Gost 配置自动同步服务...');
            const gostSyncCoordinator = require('./services/gostSyncCoordinator');
            gostSyncCoordinator.startAutoSync();

            // 5. 启动实时流量监控服务
            console.log('启动实时流量监控服务...');
            const realTimeTrafficMonitor = require('./services/realTimeTrafficMonitor');
            realTimeTrafficMonitor.startMonitoring();

            // 5. 启动 GOST 健康检查服务
            setTimeout(() => {
              console.log('启动 GOST 健康检查服务...');
              gostHealthService.start();

              // 6. Phase 2: 启动配额监控服务
              setTimeout(() => {
                console.log('启动流量配额监控服务...');
                const quotaManagementService = require('./services/quotaManagementService');
                quotaManagementService.startQuotaMonitoring();

                // 🔧 7. 启动配额强制执行服务
                setTimeout(() => {
                  console.log('启动配额强制执行服务...');
                  const { quotaEnforcementService } = require('./services/quotaEnforcementService');
                  quotaEnforcementService.start();
                }, 2000); // 等待配额监控服务启动
              }, 3000); // 等待健康检查服务启动
            }, 5000); // 等待GOST服务完全启动
          }, 2000);
        })
        .catch(error => {
          console.error('Go-Gost 服务启动失败:', error.message);
        });
    });

    // 处理服务器关闭
    server.on('close', async () => {
      console.log('服务器正在关闭，停止相关服务...');
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

        // Phase 2: 停止配额监控服务
        const quotaManagementService = require('./services/quotaManagementService');
        quotaManagementService.stopQuotaMonitoring();

        // 停止配额强制执行服务
        const { quotaEnforcementService } = require('./services/quotaEnforcementService');
        quotaEnforcementService.stop();

        // 停止实时监控服务 (暂时禁用)
        // realtimeMonitoringService.stop();

        // 清理新的服务
        console.log('🧹 清理缓存和监控服务...');

        // 清理 GOST 插件服务
        gostPluginService.cleanup();

        // 清理多实例缓存服务
        await multiInstanceCacheService.cleanup();

        // 🚀 新增: 清理缓存协调器
        try {
          const cacheCoordinator = require('./services/cacheCoordinator');
          cacheCoordinator.stop();
          console.log('✅ 缓存协调器已停止');
        } catch (error) {
          console.warn('⚠️ 停止缓存协调器失败:', error.message);
        }



        console.log('✅ 所有服务已清理完成');
      } catch (error) {
        console.error('停止服务失败:', error);
      }
    });

  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
})();
