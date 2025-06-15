/**
 * API 配置文件
 * 
 * 功能说明:
 * 1. 统一管理 API 基础地址
 * 2. 支持开发和生产环境配置
 * 3. 支持通过 GOST 代理测试流量统计
 */

// API 配置选项
const API_CONFIGS = {
  // 直连后端 (开发模式)
  direct: {
    baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
    description: '直连后端服务 (不经过 GOST)',
    useFor: '开发调试'
  },

  // 通过 GOST 代理 (流量测试模式)
  gost: {
    baseURL: 'http://localhost:6443/api',
    description: '通过 GOST 端口 6443 代理',
    useFor: '流量统计测试'
  },

  // 生产环境
  production: {
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
    description: '生产环境相对路径',
    useFor: '生产部署'
  }
};

// 当前使用的配置
// 可以通过环境变量或手动修改来切换
const getCurrentConfig = () => {
  // 检查环境变量
  if (import.meta.env.VITE_API_MODE) {
    const mode = import.meta.env.VITE_API_MODE;
    if (API_CONFIGS[mode]) {
      console.log(`🔧 使用环境变量指定的 API 模式: ${mode}`);
      return API_CONFIGS[mode];
    }
  }
  
  // 检查 localStorage 设置
  const savedMode = localStorage.getItem('api_mode');
  if (savedMode && API_CONFIGS[savedMode]) {
    console.log(`🔧 使用本地存储的 API 模式: ${savedMode}`);
    return API_CONFIGS[savedMode];
  }
  
  // 默认配置
  const defaultMode = import.meta.env.MODE === 'production' ? 'production' : 'direct';
  console.log(`🔧 使用默认 API 模式: ${defaultMode}`);
  return API_CONFIGS[defaultMode];
};

// 切换 API 模式的函数
export const switchApiMode = (mode, autoUpdate = false) => {
  if (!API_CONFIGS[mode]) {
    console.error(`❌ 无效的 API 模式: ${mode}`);
    return false;
  }

  localStorage.setItem('api_mode', mode);
  console.log(`✅ API 模式已切换到: ${mode} (${API_CONFIGS[mode].description})`);

  // 如果是自动更新，立即更新axios实例
  if (autoUpdate) {
    try {
      // 动态导入request实例并更新baseURL
      import('@/utils/request').then(({ default: request }) => {
        request.defaults.baseURL = API_CONFIGS[mode].baseURL;
        console.log(`🔄 已动态更新API基础地址: ${API_CONFIGS[mode].baseURL}`);
      });
    } catch (error) {
      console.error('❌ 动态更新API配置失败:', error);
    }
  } else {
    console.log(`🔄 请刷新页面以应用新配置`);
  }

  return true;
};

// 获取当前 API 模式信息
export const getApiModeInfo = () => {
  const currentConfig = getCurrentConfig();
  const currentMode = Object.keys(API_CONFIGS).find(
    key => API_CONFIGS[key].baseURL === currentConfig.baseURL
  );
  
  return {
    mode: currentMode,
    config: currentConfig,
    allModes: API_CONFIGS
  };
};

// 导出当前配置
const currentConfig = getCurrentConfig();

export const API_BASE_URL = currentConfig.baseURL;
export const API_CONFIG = currentConfig;

// 流量测试相关配置
export const TRAFFIC_TEST_CONFIG = {
  // 测试接口路径
  endpoints: {
    status: '/test/status',
    help: '/test/help',
    traffic1mb: '/test/traffic-1mb',
    traffic5mb: '/test/traffic-5mb',
    traffic10mb: '/test/traffic-10mb',
    trafficCustom: '/test/traffic-custom'
  },
  
  // 推荐的测试场景
  testScenarios: [
    {
      name: '小流量测试',
      endpoint: '/test/traffic-1mb',
      expectedSize: '1 MB',
      description: '测试基础流量统计功能'
    },
    {
      name: '中等流量测试',
      endpoint: '/test/traffic-5mb',
      expectedSize: '5 MB',
      description: '测试中等流量处理能力'
    },
    {
      name: '大流量测试',
      endpoint: '/test/traffic-10mb',
      expectedSize: '10 MB',
      description: '测试大流量统计准确性'
    },
    {
      name: '自定义流量测试',
      endpoint: '/test/traffic-custom?size=2.5',
      expectedSize: '2.5 MB',
      description: '测试自定义大小流量'
    }
  ]
};

// 开发工具函数
export const devTools = {
  // 显示当前 API 配置
  showConfig: () => {
    const info = getApiModeInfo();
    console.log('📊 当前 API 配置信息:');
    console.log(`   模式: ${info.mode}`);
    console.log(`   地址: ${info.config.baseURL}`);
    console.log(`   描述: ${info.config.description}`);
    console.log(`   用途: ${info.config.useFor}`);
    return info;
  },
  
  // 切换到 GOST 模式进行流量测试
  enableTrafficTest: () => {
    const success = switchApiMode('gost');
    if (success) {
      console.log('🧪 流量测试模式已启用');
      console.log('📝 现在所有 API 请求都会通过 GOST 端口 6443');
      console.log('📊 可以在仪表盘中观察流量统计变化');
      console.log('🔄 请刷新页面以应用新配置');
    }
    return success;
  },
  
  // 切换回直连模式
  disableTrafficTest: () => {
    const success = switchApiMode('direct');
    if (success) {
      console.log('🔧 已切换回直连模式');
      console.log('📝 API 请求不再经过 GOST 代理');
      console.log('🔄 请刷新页面以应用新配置');
    }
    return success;
  },
  
  // 测试流量接口
  testTrafficEndpoint: async (size = 1) => {
    try {
      const url = `${API_BASE_URL}/test/traffic-custom?size=${size}`;
      console.log(`🧪 测试流量接口: ${url}`);
      
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('✅ 流量测试完成:');
      console.log(`   请求大小: ${size} MB`);
      console.log(`   实际大小: ${data.actualSize}`);
      console.log(`   生成时间: ${data.generationTime}`);
      
      return data;
    } catch (error) {
      console.error('❌ 流量测试失败:', error);
      return null;
    }
  }
};

// 环境检测和权限控制
import { isDevelopment, isApiTestEnabled } from '@/utils/env';

// 创建受保护的开发工具
const createProtectedDevTools = () => {
  return {
    ...devTools,

    // 检查权限的包装器
    checkPermission(user) {
      if (!isApiTestEnabled(user)) {
        console.warn('⚠️ API 测试功能仅限管理员在开发环境或明确启用时使用');
        return false;
      }
      return true;
    },

    // 受保护的方法
    showConfig(user) {
      if (!this.checkPermission(user)) return null;
      return devTools.showConfig();
    },

    enableTrafficTest(user) {
      if (!this.checkPermission(user)) return false;
      return devTools.enableTrafficTest();
    },

    disableTrafficTest(user) {
      if (!this.checkPermission(user)) return false;
      return devTools.disableTrafficTest();
    },

    async testTrafficEndpoint(size, user) {
      if (!this.checkPermission(user)) return null;
      return await devTools.testTrafficEndpoint(size);
    }
  };
};

// 在开发环境下暴露到全局对象，方便调试
if (isDevelopment()) {
  window.apiDevTools = createProtectedDevTools();
  window.apiConfig = getApiModeInfo();

  console.log('🔧 API 开发工具已加载 (开发环境)');
  console.log('💡 使用 window.apiDevTools 访问开发工具');
  console.log('💡 使用 window.apiConfig 查看当前配置');
  console.log('⚠️ 部分功能需要管理员权限');
}

export default {
  API_BASE_URL,
  API_CONFIG,
  TRAFFIC_TEST_CONFIG,
  switchApiMode,
  getApiModeInfo,
  devTools
};
