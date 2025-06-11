import request from './request'

// 用户认证相关API
export const auth = {
  // 登录
  login: (data) => request.post('/auth/login', data),
  // 注册
  register: (data) => request.post('/auth/register', data),
  // 登出
  logout: () => request.post('/auth/logout'),
  // 获取当前用户信息
  getCurrentUser: () => request.get('/auth/profile')
}

// 用户管理相关API
export const users = {
  // 获取用户列表
  getUsers: () => request.get('/users'),
  // 获取当前用户信息
  getCurrentUser: () => request.get('/users/me'),
  // 创建用户
  createUser: (data) => request.post('/users', data),
  // 更新用户
  updateUser: (id, data) => request.put(`/users/${id}`, data),
  // 删除用户
  deleteUser: (id) => request.delete(`/users/${id}`),
  // 延长用户过期时间
  extendUserExpiry: (id, data) => request.post(`/users/${id}/extend-expiry`, data),
  // 获取用户转发规则统计
  getUserForwardRulesStats: (id) => request.get(`/users/${id}/forward-rules-stats`),
  // 重置用户流量统计 (管理员专用)
  resetUserTraffic: (id, data) => request.post(`/users/${id}/reset-traffic`, data)
}

// 规则管理相关API
export const rules = {
  // 获取规则列表
  getRules: () => request.get('/rules'),
  // 创建规则
  createRule: (data) => request.post('/rules', data),
  // 更新规则
  updateRule: (id, data) => request.put(`/rules/${id}`, data),
  // 删除规则
  deleteRule: (id) => request.delete(`/rules/${id}`),
  // 切换规则状态
  toggleRule: (id) => request.post(`/rules/${id}/toggle`)
}

// 用户转发规则相关API
export const userForwardRules = {
  // 获取用户转发规则列表
  getUserForwardRules: (userId) => {
    const params = userId ? { userId } : {}
    return request.get('/user-forward-rules', { params })
  },
  // 创建用户转发规则
  createUserForwardRule: (data) => request.post('/user-forward-rules', data),
  // 更新用户转发规则
  updateUserForwardRule: (id, data) => request.put(`/user-forward-rules/${id}`, data),
  // 删除用户转发规则
  deleteUserForwardRule: (id) => request.delete(`/user-forward-rules/${id}`),
  // 切换用户转发规则状态
  toggleUserForwardRule: (id) => request.post(`/user-forward-rules/${id}/toggle`),
  // 批量删除用户转发规则
  batchDeleteUserForwardRules: (ids) => request.post('/user-forward-rules/batch-delete', { ids })
}

// Gost服务管理相关API
export const gost = {
  // 获取服务状态
  getStatus: () => request.get('/gost/status'),
  // 启动服务
  start: () => request.post('/gost/start'),
  // 停止服务
  stop: () => request.post('/gost/stop'),
  // 重启服务
  restart: () => request.post('/gost/restart'),
  // 获取配置
  getConfig: () => request.get('/gost/config'),
  // 更新配置
  updateConfig: (data) => request.put('/gost/config', data)
}

// 流量统计相关API
export const traffic = {
  // 获取流量统计
  getStats: () => request.get('/traffic/stats'),
  // 获取流量日志
  getLogs: (params) => request.get('/traffic/logs', { params }),
  // 获取图表数据
  getChartData: (params) => request.get('/traffic/chart', { params })
}

// 系统状态相关API
export const system = {
  // 获取系统状态
  getStatus: () => request.get('/system/status'),

  // 获取GOST状态
  getGostStatus: () => request.get('/system/gost-status'),

  // 重启GOST服务
  restartGost: () => request.post('/system/restart-gost'),

  // 获取系统日志
  getLogs: (params) => request.get('/system/logs', { params }),

  // 获取系统统计
  getStats: () => request.get('/system/stats'),

  // 获取实时监控状态
  getMonitorStatus: () => request.get('/system/monitor-status'),

  // 获取配额协调器状态
  getQuotaStatus: () => request.get('/system/quota-status'),

  // 获取同步协调器状态
  getSyncStatus: () => request.get('/system/sync-status'),

  // 强制同步配置
  forceSync: () => request.post('/system/force-sync'),

  // 获取观察器状态
  getObserverStatus: () => request.get('/system/observer-status')
}

// 默认导出一个包含所有API的对象
const api = {
  // 直接使用request实例的方法
  get: (url, config) => request.get(url, config),
  post: (url, data, config) => request.post(url, data, config),
  put: (url, data, config) => request.put(url, data, config),
  delete: (url, config) => request.delete(url, config),
  patch: (url, data, config) => request.patch(url, data, config),

  // 分类的API方法
  auth,
  users,
  rules,
  userForwardRules,
  gost,
  traffic,
  system
}

export default api
