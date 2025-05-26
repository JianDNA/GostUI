import axios from 'axios';
import { ElMessage } from 'element-plus';
import store from '@/store';
import router from '@/router';

// 创建 axios 实例
const request = axios.create({
  baseURL: process.env.VUE_APP_API_URL || 'http://localhost:3000/api', // API 的 base_url
  timeout: 15000 // 请求超时时间
});

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

// 响应拦截器
request.interceptors.response.use(
  response => {
    return response;
  },
  error => {
    console.error('Response error:', error);
    const { response } = error;

    if (response) {
      // 处理 HTTP 错误
      switch (response.status) {
        case 401:
          // 未授权，清除用户信息并跳转到登录页面
          store.dispatch('user/logout');
          router.push('/login');
          ElMessage.error('登录已过期，请重新登录');
          break;
        case 403:
          ElMessage.error('没有权限访问该资源');
          break;
        case 404:
          ElMessage.error('请求的资源不存在');
          break;
        case 500:
          ElMessage.error('服务器内部错误');
          break;
        default:
          ElMessage.error(response.data?.message || '请求失败');
      }
    } else {
      // 网络错误
      ElMessage.error('网络错误，请检查您的网络连接');
    }

    return Promise.reject(error);
  }
);

export default request;
