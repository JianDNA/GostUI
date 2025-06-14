/**
 * 错误处理工具使用示例
 * 
 * 本文件展示如何使用 errorHandler.js 中的工具来简化错误处理
 */

const { 
  safeAsync, 
  safeSync, 
  AppError, 
  ConfigError, 
  ServiceError, 
  DatabaseError,
  formatError,
  inspectError
} = require('../utils/errorHandler');
const { defaultLogger } = require('../utils/logger');

// ===== 示例 1: 基本用法 =====

// 传统方式
async function traditionalFunction() {
  try {
    const data = await fetchData();
    return processData(data);
  } catch (error) {
    defaultLogger.error(`获取数据失败: ${error.message}`);
    throw error;
  }
}

// 使用 safeAsync 的方式
const improvedFunction = safeAsync(async () => {
  const data = await fetchData();
  return processData(data);
});

// ===== 示例 2: 自定义错误处理 =====

const customErrorHandling = safeAsync(async (userId) => {
  const user = await getUser(userId);
  if (!user) {
    throw new AppError(`用户不存在: ${userId}`, 'USER_NOT_FOUND');
  }
  return user.data;
}, {
  onError: (error, userId) => {
    // 自定义错误处理逻辑
    defaultLogger.warn(`处理用户 ${userId} 时出错: ${error.message}`);
    // 可以在这里进行额外的操作，如发送通知
  }
});

// ===== 示例 3: 返回默认值 =====

const withDefaultValue = safeAsync(async (configName) => {
  const config = await getConfig(configName);
  return config.value;
}, {
  throwError: false, // 不抛出错误
  defaultValue: 'default-value', // 发生错误时返回的默认值
  logError: true // 仍然记录错误
});

// ===== 示例 4: 动态默认值 =====

const withDynamicDefault = safeAsync(async (productId) => {
  const product = await getProduct(productId);
  return product.price;
}, {
  throwError: false,
  defaultValue: (productId) => {
    // 可以根据参数动态生成默认值
    return productId.startsWith('premium') ? 99.99 : 9.99;
  }
});

// ===== 示例 5: 同步函数包装 =====

const safeParse = safeSync((jsonString) => {
  return JSON.parse(jsonString);
}, {
  throwError: false,
  defaultValue: {},
  logError: true
});

// ===== 示例 6: 自定义错误类型 =====

function validateConfig(config) {
  if (!config.apiKey) {
    throw new ConfigError('缺少 API 密钥', { config });
  }
  
  if (!config.endpoint) {
    throw new ConfigError('缺少服务端点', { config });
  }
  
  return true;
}

// 使用自定义错误类型
const configValidator = safeSync(validateConfig, {
  throwError: true, // 重新抛出错误
  onError: (error) => {
    if (error instanceof ConfigError) {
      // 特定于配置错误的处理
      defaultLogger.error(`配置验证失败: ${error.message}`);
    } else {
      // 其他类型的错误
      defaultLogger.error(`未知错误: ${error.message}`);
    }
  }
});

// ===== 示例 7: 错误格式化 =====

try {
  // 一些可能抛出错误的代码
  throw new ServiceError('服务连接失败', { service: 'auth', attempts: 3 });
} catch (error) {
  // 格式化错误以便于日志记录
  const formattedError = formatError(error);
  defaultLogger.error(formattedError);
  
  // 详细检查错误对象
  const detailedError = inspectError(error, 3); // 深度为 3
  defaultLogger.debug(detailedError);
}

// ===== 示例 8: 实际应用场景 =====

// 数据库操作
const getUserData = safeAsync(async (userId) => {
  // 数据库查询可能失败
  const user = await db.users.findById(userId);
  if (!user) {
    throw new DatabaseError(`用户不存在: ${userId}`);
  }
  return user;
}, {
  throwError: false,
  defaultValue: { id: null, name: 'Guest', role: 'visitor' },
  onError: (error, userId) => {
    if (error.code === 'ECONNREFUSED') {
      // 数据库连接错误
      notifyAdmin('数据库连接失败');
    } else {
      // 其他错误
      logToMonitoring(`用户数据查询失败: ${userId}`, error);
    }
  }
});

// API 服务
const fetchExternalData = safeAsync(async (apiKey) => {
  const response = await fetch('https://api.example.com/data', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  
  if (!response.ok) {
    throw new ServiceError(`API 请求失败: ${response.status}`, {
      status: response.status,
      statusText: response.statusText
    });
  }
  
  return response.json();
}, {
  throwError: true, // API 错误应该抛出
  onError: (error) => {
    if (error instanceof ServiceError && error.details.status === 429) {
      // 处理速率限制
      defaultLogger.warn('API 速率限制，将在稍后重试');
      scheduleRetry();
    }
  }
});

// ===== 辅助函数（仅用于示例） =====

async function fetchData() { return { id: 1 }; }
function processData(data) { return data; }
async function getUser(id) { return { id, data: { name: 'User' } }; }
async function getConfig() { return { value: 'config' }; }
async function getProduct() { return { price: 10 }; }
function notifyAdmin() {}
function logToMonitoring() {}
function scheduleRetry() {} 