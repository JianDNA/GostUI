const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { sequelize, initDb, models } = require('./services/dbService');
const initGost = require('./scripts/init-gost');

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
app.use('/api/gost', require('./routes/gost'));
app.use('/api/traffic', require('./routes/traffic'));

// 添加简单的健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '服务正常运行' });
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
    // 1. 先初始化数据库
    console.log('正在初始化数据库...');
    const dbSuccess = await initDb();
    if (!dbSuccess) {
      console.warn('数据库初始化存在问题，但服务将继续启动');
    } else {
      console.log('数据库初始化成功');
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
        })
        .catch(error => {
          console.error('Go-Gost 服务启动失败:', error.message);
        });
    });
    
    // 处理服务器关闭
    server.on('close', () => {
      console.log('服务器正在关闭，停止 Go-Gost 服务...');
      try {
        const gostService = require('./services/gostService');
        gostService.stop();
      } catch (error) {
        console.error('停止 Go-Gost 服务失败:', error);
      }
    });
    
  } catch (error) {
    console.error('服务器启动失败:', error);
    process.exit(1);
  }
})(); 