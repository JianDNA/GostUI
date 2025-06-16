const path = require('path');
const { getGostExecutablePath } = require('../utils/platform');

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: '24h'
  },

  // Database Configuration
  database: {
    dialect: 'sqlite',
    storage: path.join(__dirname, '../database/database.sqlite'),
    logging: false,
    // 🔧 SQLite优化配置，提高稳定性
    dialectOptions: {
      // 设置更长的超时时间
      timeout: 30000,
      // 启用外键约束
      foreignKeys: true
    },
    pool: {
      max: 1,        // SQLite只支持单连接
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    // 添加重试配置
    retry: {
      max: 3,
      timeout: 5000
    }
  },

  // GOST Configuration
  gost: {
    configPath: process.env.GOST_CONFIG_PATH || path.join(__dirname, '../config/gost-config.json'),
    executablePath: process.env.GOST_BINARY_PATH || getGostExecutablePath(),
    defaultConfig: {
      services: [],
      chains: []
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || path.join(__dirname, '../logs/app.log')
  }
};

module.exports = config;