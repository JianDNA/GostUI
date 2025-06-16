import axios from 'axios';
import { ElMessage } from 'element-plus';
import store from '@/store';
import router from '@/router';
import { API_BASE_URL, API_CONFIG } from '@/config/api';

// 创建 axios 实例
const request = axios.create({
  baseURL: API_BASE_URL, // 使用动态 API 配置
  timeout: 15000 // 请求超时时间
});

// 在开发环境下显示当前 API 配置
if (import.meta.env.DEV) {
  console.log('🔧 当前 API 配置:', API_CONFIG);
  console.log('📡 API 基础地址:', API_BASE_URL);
}

// 请求拦截器
request.interceptors.request.use(
  config => {
    // 在请求发送之前做一些处理
    const token = store.getters['user/token'];
    if (token) {
      // 让每个请求携带token
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => {
    // 处理请求错误
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// 防止401死循环的标志
let isLoggingOut = false;

// 智能容错标志
let isAutoSwitching = false;

// 响应拦截器
request.interceptors.response.use(
  response => {
    return response;
  },
  async error => {
    console.error('Response error:', error);
    const { response, config } = error;

    if (response) {
      // 处理 HTTP 错误
      switch (response.status) {
        case 401:
          // 防止死循环：如果正在登出或者请求本身就是登出请求，则不再处理
          if (isLoggingOut || config.url?.includes('/auth/logout')) {
            console.log('🔄 跳过401处理，避免死循环');
            break;
          }

          // 设置登出标志，防止重复处理
          isLoggingOut = true;

          console.log('🔐 收到401错误，开始清理用户状态');

          // 直接清理本地状态，不发送logout请求
          store.commit('user/CLEAR_USER_STATE');

          // 跳转到登录页面
          if (router.currentRoute.value.name !== 'Login') {
            router.push('/login');
            ElMessage.error('登录已过期，请重新登录');
          }

          // 重置标志
          setTimeout(() => {
            isLoggingOut = false;
          }, 1000);

          break;
        case 403:
          ElMessage.error('没有权限访问该资源');
          break;
        case 404:
          // 智能处理404错误：如果是GOST代理模式且6443端口不可用，自动切换回直连模式
          await handleGostProxyFailure(config, error);
          break;
        case 500:
          ElMessage.error('服务器内部错误');
          break;
        default:
          ElMessage.error(response.data?.message || '请求失败');
      }
    } else {
      // 网络错误 - 可能是GOST代理不可用
      await handleNetworkError(config, error);
    }

    return Promise.reject(error);
  }
);

/**
 * 处理GOST代理失败的情况
 */
async function handleGostProxyFailure(config, error) {
  const currentMode = localStorage.getItem('api_mode');

  // 如果当前是GOST模式且还没有在自动切换中
  if (currentMode === 'gost' && !isAutoSwitching) {
    console.warn('🔄 检测到GOST代理不可用，尝试自动切换到直连模式...');

    isAutoSwitching = true;

    try {
      // 切换到直连模式
      localStorage.setItem('api_mode', 'direct');

      // 更新axios实例的baseURL
      const { API_CONFIGS } = await import('@/config/api');
      request.defaults.baseURL = API_CONFIGS.direct.baseURL;

      ElMessage.warning({
        message: '检测到GOST代理不可用，已自动切换到直连模式',
        duration: 5000,
        showClose: true
      });

      console.log('✅ 已自动切换到直连模式');

      // 重试当前请求
      setTimeout(async () => {
        try {
          const retryResponse = await request(config);
          console.log('✅ 请求重试成功');
          return retryResponse;
        } catch (retryError) {
          console.error('❌ 请求重试失败:', retryError);
        } finally {
          isAutoSwitching = false;
        }
      }, 1000);

    } catch (switchError) {
      console.error('❌ 自动切换失败:', switchError);
      ElMessage.error('GOST代理不可用，请手动切换到直连模式');
      isAutoSwitching = false;
    }
  } else {
    ElMessage.error('请求的资源不存在');
  }
}

/**
 * 处理网络错误
 */
async function handleNetworkError(config, error) {
  const currentMode = localStorage.getItem('api_mode');

  // 如果当前是GOST模式且是连接错误
  if (currentMode === 'gost' && !isAutoSwitching &&
      (error.code === 'ECONNREFUSED' || error.message.includes('Network Error'))) {

    console.warn('🔄 检测到GOST代理连接失败，尝试自动切换到直连模式...');

    isAutoSwitching = true;

    try {
      // 切换到直连模式
      localStorage.setItem('api_mode', 'direct');

      // 更新axios实例的baseURL
      const { API_CONFIGS } = await import('@/config/api');
      request.defaults.baseURL = API_CONFIGS.direct.baseURL;

      ElMessage.warning({
        message: 'GOST代理连接失败，已自动切换到直连模式',
        duration: 5000,
        showClose: true
      });

      console.log('✅ 已自动切换到直连模式');

      // 重试当前请求
      setTimeout(async () => {
        try {
          const retryResponse = await request(config);
          console.log('✅ 请求重试成功');
          return retryResponse;
        } catch (retryError) {
          console.error('❌ 请求重试失败:', retryError);
        } finally {
          isAutoSwitching = false;
        }
      }, 1000);

    } catch (switchError) {
      console.error('❌ 自动切换失败:', switchError);
      ElMessage.error('网络连接失败，请检查GOST服务状态');
      isAutoSwitching = false;
    }
  } else {
    ElMessage.error('网络错误，请检查您的网络连接');
  }
}

export default request;
