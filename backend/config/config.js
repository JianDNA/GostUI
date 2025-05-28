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
    logging: false
  },

  // GOST Configuration
  gost: {
    configPath: process.env.GOST_CONFIG_PATH || path.join(__dirname, '../config/gost-config.json'),
    executablePath: process.env.GOST_BINARY_PATH || getGostExecutablePath(path.join(__dirname, '../bin')),
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