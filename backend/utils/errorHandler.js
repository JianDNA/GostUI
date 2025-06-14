/**
 * 统一错误处理工具
 * 用于简化错误处理流程，减少嵌套的 try-catch 结构
 */

const { defaultLogger } = require('./logger');
const util = require('util');

/**
 * 自定义错误类，用于区分不同类型的错误
 */
class AppError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code || 'UNKNOWN_ERROR';
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 配置错误
 */
class ConfigError extends AppError {
  constructor(message, details = {}) {
    super(message, 'CONFIG_ERROR', details);
  }
}

/**
 * 服务错误
 */
class ServiceError extends AppError {
  constructor(message, details = {}) {
    super(message, 'SERVICE_ERROR', details);
  }
}

/**
 * 数据库错误
 */
class DatabaseError extends AppError {
  constructor(message, details = {}) {
    super(message, 'DB_ERROR', details);
  }
}

/**
 * 安全包装异步函数，统一处理错误
 * @param {Function} fn 要执行的异步函数
 * @param {Object} options 选项
 * @param {boolean} options.throwError 是否抛出错误，默认为 true
 * @param {Function} options.onError 错误处理回调
 * @param {any} options.defaultValue 发生错误时的默认返回值
 * @returns {Function} 包装后的函数
 */
function safeAsync(fn, options = {}) {
  const {
    throwError = true,
    onError = null,
    defaultValue = null,
    logError = true
  } = options;

  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      // 记录错误
      if (logError) {
        const errorDetails = util.inspect(error, { depth: 2, colors: false });
        defaultLogger.error(`[safeAsync] 错误: ${error.message}\n${errorDetails}`);
}

      // 执行错误回调
      if (onError && typeof onError === 'function') {
        onError(error, ...args);
      }

      // 决定是抛出错误还是返回默认值
      if (throwError) {
        throw error;
      }

      return defaultValue;
    }
  };
}

/**
 * 安全执行同步函数，统一处理错误
 */
function safeSync(fn, options = {}) {
  const {
    throwError = true,
    onError = null,
    defaultValue = null,
    logError = true
  } = options;

  return function(...args) {
    try {
      return fn.apply(this, args);
    } catch (error) {
      // 记录错误
      if (logError) {
        const errorDetails = util.inspect(error, { depth: 2, colors: false });
        defaultLogger.error(`[safeSync] 错误: ${error.message}\n${errorDetails}`);
      }

      // 执行错误回调
      if (onError && typeof onError === 'function') {
        onError(error, ...args);
      }

      // 决定是抛出错误还是返回默认值
      if (throwError) {
        throw error;
      }

      return defaultValue;
    }
  };
}

/**
 * 格式化错误对象为可读字符串
 */
function formatError(error) {
  if (!error) return '未知错误';
  
  const message = error.message || '未知错误消息';
  const code = error.code || '';
  const stack = error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '';
  
  return `${code ? `[${code}] ` : ''}${message}\n${stack}`;
}

/**
 * 格式化错误对象为详细信息
 */
function inspectError(error, depth = 2) {
  if (!error) return '未知错误';
  return util.inspect(error, { depth, colors: false });
}

/**
 * API错误处理工具函数
 * @param {string} operation 操作名称
 * @param {Error} error 错误对象
 * @param {Response} res Express响应对象
 * @param {number} defaultStatus 默认HTTP状态码
 */
function handleApiError(operation, error, res, defaultStatus = 500) {
  // 记录错误
  defaultLogger.error(`API错误 [${operation}]: ${error.message}`, error.stack);
  
  // 确定HTTP状态码
  const statusCode = error.statusCode || defaultStatus;
  
  // 构建错误响应
  const errorResponse = {
    success: false,
    message: `${operation}失败: ${error.message}`,
    error: {
      code: error.code || 'SERVER_ERROR',
      details: error.details || {}
    }
  };
  
  // 发送错误响应
  res.status(statusCode).json(errorResponse);
}

/**
 * Express 错误处理中间件
 */
function errorMiddleware(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const errorMessage = err.message || '服务器内部错误';
  
  defaultLogger.error(`API错误: ${errorMessage}`, err.stack);
  
  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    code: err.code || 'SERVER_ERROR'
  });
}

module.exports = {
  AppError,
  ConfigError,
  ServiceError,
  DatabaseError,
  safeAsync,
  safeSync,
  formatError,
  inspectError,
  errorMiddleware,
  handleApiError
}; 