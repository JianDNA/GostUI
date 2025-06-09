const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { sequelize, initDb, models } = require('./services/dbService');
const initGost = require('./scripts/init-gost');
const { quickCheck } = require('./scripts/check-environment');
const { platformUtils } = require('./utils/platform');

// 导入新的服务
const multiInstanceCacheService = require('./services/multiInstanceCacheService');
const timeSeriesService = require('./services/timeSeriesService'); // 替换 InfluxDB
const gostPluginService = require('./services/gostPluginService');
const gostHealthService = require('./services/gostHealthService');

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
    info: '这条消息由 Node.js 服务通过 6443->8080 端口转发提供'
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

    try {
      // 初始化时序数据服务 (SQLite)
      await timeSeriesService.initialize();
      console.log('✅ 时序数据服务初始化成功');
    } catch (error) {
      console.warn('⚠️ 时序数据服务初始化失败，流量统计功能将受限:', error.message);
    }

    // 2. 启动Web服务器
    const server = app.listen(PORT, () => {
      console.log(`服务器已启动在 http://localhost:${PORT}`);
      console.log(`测试端口转发: http://localhost:6443/api/test-forward`);

      // 3. Web服务启动成功后，再启动gost服务
      console.log('正在初始化 Go-Gost 服务...');
      initGost()
        .then(() => {
          console.log('Go-Gost 服务启动成功');

          // 4. 启动 Gost 配置自动同步服务
          setTimeout(() => {
            console.log('启动 Gost 配置自动同步服务...');
            const gostConfigService = require('./services/gostConfigService');
            gostConfigService.startAutoSync();

            // 5. 启动 GOST 健康检查服务
            setTimeout(() => {
              console.log('启动 GOST 健康检查服务...');
              gostHealthService.start();
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

        // 停止 Gost 配置同步服务
        const gostConfigService = require('./services/gostConfigService');
        gostConfigService.stopAutoSync();

        // 停止 Gost 服务
        const gostService = require('./services/gostService');
        gostService.stop();

        // 清理新的服务
        console.log('🧹 清理缓存和监控服务...');

        // 清理 GOST 插件服务
        gostPluginService.cleanup();

        // 清理多实例缓存服务
        await multiInstanceCacheService.cleanup();

        // 关闭时序数据服务
        await timeSeriesService.close();

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
