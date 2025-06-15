/**
 * 环境检测工具
 * 用于判断当前运行环境和权限
 */

/**
 * 检查是否为开发环境
 * @returns {boolean}
 */
export const isDevelopment = () => {
  return import.meta.env.DEV;
};

/**
 * 检查是否为生产环境
 * @returns {boolean}
 */
export const isProduction = () => {
  return import.meta.env.PROD;
};

/**
 * 检查是否为测试环境
 * @returns {boolean}
 */
export const isTesting = () => {
  return import.meta.env.MODE === 'test';
};

/**
 * 检查是否启用调试功能
 * 只有在开发环境或明确启用调试时才返回true
 * @returns {boolean}
 */
export const isDebugEnabled = () => {
  // 开发环境默认启用调试
  if (isDevelopment()) {
    return true;
  }
  
  // 生产环境检查是否有调试标志
  if (isProduction()) {
    // 可以通过URL参数或localStorage启用调试（仅限管理员）
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get('debug');
    const debugStorage = localStorage.getItem('debug_mode');
    
    return debugParam === 'true' || debugStorage === 'true';
  }
  
  return false;
};

/**
 * 检查是否启用API测试功能
 * 只有管理员在开发环境或明确启用时才能使用
 * @param {Object} user - 当前用户对象
 * @returns {boolean}
 */
export const isApiTestEnabled = (user) => {
  // 必须是管理员
  if (!user || user.role !== 'admin') {
    return false;
  }
  
  // 开发环境默认启用
  if (isDevelopment()) {
    return true;
  }
  
  // 生产环境需要明确启用且是管理员
  if (isProduction()) {
    const urlParams = new URLSearchParams(window.location.search);
    const testParam = urlParams.get('api_test');
    const testStorage = localStorage.getItem('api_test_mode');
    
    return (testParam === 'true' || testStorage === 'true') && user.role === 'admin';
  }
  
  return false;
};

/**
 * 启用调试模式（仅管理员）
 * @param {Object} user - 当前用户对象
 * @returns {boolean} 是否成功启用
 */
export const enableDebugMode = (user) => {
  if (!user || user.role !== 'admin') {
    console.warn('⚠️ 只有管理员可以启用调试模式');
    return false;
  }
  
  localStorage.setItem('debug_mode', 'true');
  console.log('🔧 调试模式已启用');
  return true;
};

/**
 * 禁用调试模式
 */
export const disableDebugMode = () => {
  localStorage.removeItem('debug_mode');
  console.log('🔧 调试模式已禁用');
};

/**
 * 启用API测试模式（仅管理员）
 * @param {Object} user - 当前用户对象
 * @returns {boolean} 是否成功启用
 */
export const enableApiTestMode = (user) => {
  if (!user || user.role !== 'admin') {
    console.warn('⚠️ 只有管理员可以启用API测试模式');
    return false;
  }
  
  localStorage.setItem('api_test_mode', 'true');
  console.log('🧪 API测试模式已启用');
  return true;
};

/**
 * 禁用API测试模式
 */
export const disableApiTestMode = () => {
  localStorage.removeItem('api_test_mode');
  console.log('🧪 API测试模式已禁用');
};

/**
 * 获取环境信息
 * @returns {Object} 环境信息对象
 */
export const getEnvironmentInfo = () => {
  return {
    nodeEnv: import.meta.env.MODE,
    isDevelopment: isDevelopment(),
    isProduction: isProduction(),
    isTesting: isTesting(),
    isDebugEnabled: isDebugEnabled(),
    buildTime: import.meta.env.VITE_BUILD_TIME || 'unknown',
    version: import.meta.env.VITE_APP_VERSION || '1.0.0'
  };
};

/**
 * 在控制台显示环境信息
 */
export const showEnvironmentInfo = () => {
  const info = getEnvironmentInfo();
  console.group('🌍 环境信息');
  console.log('环境:', info.nodeEnv);
  console.log('版本:', info.version);
  console.log('构建时间:', info.buildTime);
  console.log('调试模式:', info.isDebugEnabled ? '启用' : '禁用');
  console.groupEnd();
};

// 开发环境下自动显示环境信息
if (isDevelopment()) {
  showEnvironmentInfo();
}
