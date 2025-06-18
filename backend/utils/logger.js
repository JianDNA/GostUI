/**
 * 统一日志系统
 * 提供标准化的日志记录功能，支持不同日志级别和输出格式
 */

const fs = require('fs');
const path = require('path');
const { format } = require('util');

// 日志级别定义
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

// 日志级别颜色（控制台输出）
const LEVEL_COLORS = {
  DEBUG: '\x1b[36m', // 青色
  INFO: '\x1b[32m',  // 绿色
  WARN: '\x1b[33m',  // 黄色
  ERROR: '\x1b[31m', // 红色
  FATAL: '\x1b[35m', // 紫色
  RESET: '\x1b[0m'   // 重置
};

// 默认配置
const DEFAULT_CONFIG = {
  level: 'INFO',           // 默认日志级别
  enableConsole: true,     // 是否输出到控制台
  enableFile: true,        // 是否输出到文件
  logDir: path.join(__dirname, '../logs'),
  logFile: 'application.log',
  errorFile: 'error.log',
  maxFileSize: 20 * 1024 * 1024, // 20MB
  maxFiles: 5,
  dateFormat: true,        // 是否在日志中包含日期
  colorize: true,          // 控制台输出是否着色
  logAsJson: false,        // 是否以JSON格式记录日志
  includeTimestamp: true   // 是否包含时间戳
};

class Logger {
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.currentLevel = LOG_LEVELS[this.config.level] || LOG_LEVELS.INFO;
    
    // 确保日志目录存在
    this.ensureLogDirectory();
    
    // 日志文件路径
    this.logFilePath = path.join(this.config.logDir, this.config.logFile);
    this.errorFilePath = path.join(this.config.logDir, this.config.errorFile);
    
    // 检查日志文件大小，如有必要进行轮转
    this.checkLogFileSize();
  }

  /**
   * 确保日志目录存在
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  /**
   * 检查日志文件大小并在必要时进行轮转
   */
  checkLogFileSize() {
    try {
      // 检查普通日志文件
      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath);
        if (stats.size >= this.config.maxFileSize) {
          this.rotateLogFile(this.logFilePath);
        }
      }
      
      // 检查错误日志文件
      if (fs.existsSync(this.errorFilePath)) {
        const stats = fs.statSync(this.errorFilePath);
        if (stats.size >= this.config.maxFileSize) {
          this.rotateLogFile(this.errorFilePath);
        }
      }
    } catch (error) {
      console.error('检查日志文件大小失败:', error);
    }
  }

  /**
   * 轮转日志文件
   * @param {string} filePath - 日志文件路径
   */
  rotateLogFile(filePath) {
    try {
      const dirname = path.dirname(filePath);
      const basename = path.basename(filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newPath = path.join(dirname, `${basename}.${timestamp}`);
      
      fs.renameSync(filePath, newPath);
      
      // 清理旧的日志文件
      this.cleanupOldLogFiles(dirname, basename);
    } catch (error) {
      console.error('轮转日志文件失败:', error);
    }
  }

  /**
   * 清理旧的日志文件
   * @param {string} dirname - 目录路径
   * @param {string} basename - 基本文件名
   */
  cleanupOldLogFiles(dirname, basename) {
    try {
      const files = fs.readdirSync(dirname)
        .filter(file => file.startsWith(`${basename}.`))
        .map(file => ({
          name: file,
          path: path.join(dirname, file),
          time: fs.statSync(path.join(dirname, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
      
      // 保留最新的maxFiles个文件，删除其余的
      if (files.length > this.config.maxFiles) {
        files.slice(this.config.maxFiles).forEach(file => {
          fs.unlinkSync(file.path);
        });
      }
    } catch (error) {
      console.error('清理旧日志文件失败:', error);
    }
  }

  /**
   * 格式化日志消息
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {object} [meta] - 元数据
   * @returns {string} 格式化后的日志消息
   */
  formatLogMessage(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    
    if (this.config.logAsJson) {
      const logObject = {
        timestamp,
        level,
        message
      };
      
      if (meta) {
        logObject.meta = meta;
      }
      
      return JSON.stringify(logObject);
    }
    
    let formattedMessage = '';
    
    if (this.config.includeTimestamp) {
      formattedMessage += `[${timestamp}] `;
    }
    
    formattedMessage += `[${level}] ${message}`;
    
    if (meta) {
      formattedMessage += ` ${JSON.stringify(meta)}`;
    }
    
    return formattedMessage;
  }

  /**
   * 写入日志到文件
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {object} [meta] - 元数据
   */
  writeToFile(level, message, meta) {
    if (!this.config.enableFile) return;
    
    const logMessage = this.formatLogMessage(level, message, meta) + '\n';
    
    try {
      // 写入到主日志文件
      fs.appendFileSync(this.logFilePath, logMessage);
      
      // 如果是错误或致命错误，也写入到错误日志文件
      if (level === 'ERROR' || level === 'FATAL') {
        fs.appendFileSync(this.errorFilePath, logMessage);
      }
    } catch (error) {
      console.error('写入日志文件失败:', error);
    }
  }

  /**
   * 输出日志到控制台
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {object} [meta] - 元数据
   */
  writeToConsole(level, message, meta) {
    if (!this.config.enableConsole) return;
    
    let consoleMessage = message;
    
    if (meta) {
      if (typeof meta === 'object') {
        consoleMessage += ' ' + JSON.stringify(meta);
      } else {
        consoleMessage += ' ' + meta;
      }
    }
    
    if (this.config.colorize) {
      const color = LEVEL_COLORS[level] || '';
      const timestamp = this.config.includeTimestamp ? `[${new Date().toISOString()}] ` : '';
      console.log(`${timestamp}${color}[${level}]${LEVEL_COLORS.RESET} ${consoleMessage}`);
    } else {
      const timestamp = this.config.includeTimestamp ? `[${new Date().toISOString()}] ` : '';
      console.log(`${timestamp}[${level}] ${consoleMessage}`);
    }
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {object} [meta] - 元数据
   */
  log(level, message, meta) {
    const levelValue = LOG_LEVELS[level];
    
    if (levelValue < this.currentLevel) {
      return; // 低于当前日志级别，不记录
    }
    
    // 检查并轮转日志文件（定期检查）
    if (Math.random() < 0.01) { // 1%的概率检查，避免每次都检查
      this.checkLogFileSize();
    }
    
    this.writeToConsole(level, message, meta);
    this.writeToFile(level, message, meta);
  }

  /**
   * 记录调试级别日志
   * @param {string} message - 日志消息
   * @param {object} [meta] - 元数据
   */
  debug(message, meta) {
    this.log('DEBUG', message, meta);
  }

  /**
   * 记录信息级别日志
   * @param {string} message - 日志消息
   * @param {object} [meta] - 元数据
   */
  info(message, meta) {
    this.log('INFO', message, meta);
  }

  /**
   * 记录警告级别日志
   * @param {string} message - 日志消息
   * @param {object} [meta] - 元数据
   */
  warn(message, meta) {
    this.log('WARN', message, meta);
  }

  /**
   * 记录错误级别日志
   * @param {string} message - 日志消息
   * @param {object} [meta] - 元数据
   */
  error(message, meta) {
    this.log('ERROR', message, meta);
  }

  /**
   * 记录致命错误级别日志
   * @param {string} message - 日志消息
   * @param {object} [meta] - 元数据
   */
  fatal(message, meta) {
    this.log('FATAL', message, meta);
  }

  /**
   * 更改日志级别
   * @param {string} level - 新的日志级别
   */
  setLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      this.currentLevel = LOG_LEVELS[level];
      this.config.level = level;
    }
  }

  /**
   * 获取当前日志级别
   * @returns {string} 当前日志级别
   */
  getLevel() {
    return this.config.level;
  }

  /**
   * 获取日志配置
   * @returns {object} 当前日志配置
   */
  getConfig() {
    return { ...this.config };
  }
}

// 创建默认实例
const defaultLogger = new Logger();

module.exports = {
  Logger,
  defaultLogger,
  LOG_LEVELS
}; 