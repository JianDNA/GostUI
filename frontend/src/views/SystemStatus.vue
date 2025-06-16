<template>
  <div class="system-status">
    <!-- 页面头部 -->
    <div class="page-header">
      <el-page-header @back="$router.go(-1)" content="系统状态监控" />
      <div class="header-actions">
        <el-button type="primary" @click="refreshSystemStatus" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新状态
        </el-button>
      </div>
    </div>

    <!-- 系统概览 -->
    <el-card class="status-card overview-card">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-icon size="20" color="#409EFF"><Monitor /></el-icon>
            <span>系统概览</span>
          </div>
          <el-tag type="success" v-if="isSystemHealthy" size="large">
            <el-icon><CircleCheckFilled /></el-icon>
            系统正常
          </el-tag>
          <el-tag type="danger" v-else size="large">
            <el-icon><CircleCloseFilled /></el-icon>
            系统异常
          </el-tag>
        </div>
      </template>
      <el-row :gutter="20" v-loading="loading">
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-title">系统运行时间</div>
            <div class="stat-value">{{ formatUptime(systemStatus?.uptime) }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-title">总用户数</div>
            <div class="stat-value">{{ systemStats?.users?.total || 0 }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-title">活跃规则</div>
            <div class="stat-value">{{ systemStats?.rules?.total || 0 }}</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="stat-card">
            <div class="stat-title">总流量</div>
            <div class="stat-value">{{ formatTraffic(systemStats?.traffic?.total) }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 服务状态 -->
    <el-card class="status-card services-card">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <el-icon size="20" color="#67C23A"><Setting /></el-icon>
            <span>服务状态</span>
          </div>
          <el-button type="primary" size="small" @click="forceSync" :loading="syncLoading">
            <el-icon><Refresh /></el-icon>
            强制同步
          </el-button>
        </div>
      </template>
      <el-row :gutter="20" v-loading="loading">
        <el-col :span="8">
          <div class="service-card">
            <div class="service-title">
              <el-icon><Monitor /></el-icon>
              实时监控
            </div>
            <div class="service-status" :class="{'running': monitorStatus?.isRunning}">
              {{ monitorStatus?.isRunning ? '运行中' : '已停止' }}
            </div>
            <div class="service-details">
              <p>流量监控服务</p>
            </div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="service-card">
            <div class="service-title">
              <el-icon><Setting /></el-icon>
              配额协调器
            </div>
            <div class="service-status running">
              运行中
            </div>
            <div class="service-details">
              <p>用户配额管理</p>
            </div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="service-card">
            <div class="service-title">
              <el-icon><Connection /></el-icon>
              同步协调器
            </div>
            <div class="service-status" :class="{'running': !syncStatus?.isSyncing}">
              {{ syncStatus?.isSyncing ? '同步中' : '空闲' }}
            </div>
            <div class="service-details">
              <p>配置同步服务</p>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- GOST服务状态 -->
    <el-card class="status-card gost-card">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span>GOST服务状态</span>
            <el-tag
              :type="gostStatus?.isRunning === true ? 'success' : gostStatus?.isRunning === false ? 'danger' : 'warning'"
              size="small"
              style="margin-left: 12px;"
            >
              {{ gostStatus?.isRunning === true ? '运行中' : gostStatus?.isRunning === false ? '已停止' : '状态未知' }}
            </el-tag>
          </div>
          <div class="header-actions">
            <el-button link @click="refreshGostStatus" :loading="gostLoading">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
            <el-button type="warning" size="small" @click="restartGost" :loading="gostLoading">
              <el-icon><RefreshRight /></el-icon>
              重启服务
            </el-button>
          </div>
        </div>
      </template>
      <el-row :gutter="20" v-loading="gostLoading">
        <el-col :span="8">
          <div class="stat-card gost-stat-card">
            <div class="stat-icon">
              <el-icon size="24" :color="gostStatus?.isRunning === true ? '#67C23A' : gostStatus?.isRunning === false ? '#F56C6C' : '#E6A23C'">
                <Monitor />
              </el-icon>
            </div>
            <div class="stat-title">服务状态</div>
            <div class="stat-value" :class="{
              'success': gostStatus?.isRunning === true,
              'danger': gostStatus?.isRunning === false,
              'warning': gostStatus?.isRunning === null
            }">
              {{ gostStatus?.isRunning === true ? '运行中' : gostStatus?.isRunning === false ? '已停止' : '状态未知' }}
            </div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="stat-card gost-stat-card">
            <div class="stat-icon">
              <el-icon size="24" color="#409EFF">
                <Connection />
              </el-icon>
            </div>
            <div class="stat-title">API端口</div>
            <div class="stat-value">{{ gostStatus?.apiPort || '18080' }}</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="stat-card gost-stat-card">
            <div class="stat-icon">
              <el-icon size="24" color="#E6A23C">
                <View />
              </el-icon>
            </div>
            <div class="stat-title">观察器端口</div>
            <div class="stat-value">{{ observerStatus?.port || '18081' }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>


  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Monitor, Setting, Connection, RefreshRight, View, CircleCheckFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import api from '@/utils/api'

const store = useStore()
const router = useRouter()

// 权限检查
const isAdmin = computed(() => store.getters['user/isAdmin'])

// 如果不是管理员，重定向到仪表板
if (!isAdmin.value) {
  ElMessage.error('此功能仅限管理员使用')
  router.push('/dashboard')
}

const loading = ref(false)
const gostLoading = ref(false)
const syncLoading = ref(false)

const systemStatus = ref(null)
const systemStats = ref(null)
const monitorStatus = ref(null)
const quotaStatus = ref(null)
const syncStatus = ref(null)
const gostStatus = ref(null)
const observerStatus = ref(null)

let refreshTimer = null

// 计算系统健康状态
const isSystemHealthy = computed(() => {
  // 如果没有系统状态数据，认为是异常
  if (!systemStatus.value) {
    return false
  }

  // 检查GOST服务状态
  const gostHealthy = gostStatus.value?.isRunning === true

  // 检查关键服务状态
  const monitorHealthy = monitorStatus.value?.isRunning !== false
  const quotaHealthy = quotaStatus.value?.isRunning !== false
  const syncHealthy = syncStatus.value?.isRunning !== false
  const observerHealthy = observerStatus.value?.isRunning !== false

  // 所有关键服务都正常才认为系统健康
  return gostHealthy && monitorHealthy && quotaHealthy && syncHealthy && observerHealthy
})

// 刷新系统状态
const refreshSystemStatus = async () => {
  try {
    loading.value = true
    console.log('🔄 刷新系统状态...')

    // 并行获取所有状态，使用Promise.allSettled确保部分失败不影响其他
    const [
      systemRes,
      statsRes,
      gostRes
    ] = await Promise.allSettled([
      api.system.getStatus(),
      store.dispatch('traffic/fetchStats'), // 使用dashboard API获取统计
      api.system.getGostStatus()
    ])

    // 处理系统状态
    if (systemRes.status === 'fulfilled') {
      systemStatus.value = systemRes.value.data.data
      console.log('✅ 系统状态获取成功:', systemStatus.value)
    } else {
      console.warn('⚠️ 系统状态获取失败:', systemRes.reason)
    }

    // 处理统计数据
    if (statsRes.status === 'fulfilled') {
      systemStats.value = {
        users: {
          total: statsRes.value.totalUsers || 0,
          active: statsRes.value.activeUsers || 0
        },
        rules: {
          total: statsRes.value.activeRules || 0
        },
        traffic: {
          total: statsRes.value.totalTraffic || 0
        }
      }
      console.log('✅ 统计数据获取成功:', systemStats.value)
    } else {
      console.warn('⚠️ 统计数据获取失败:', statsRes.reason)
      // 设置默认值
      systemStats.value = {
        users: { total: 0, active: 0 },
        rules: { total: 0 },
        traffic: { total: 0 }
      }
    }

    // 处理GOST状态
    if (gostRes.status === 'fulfilled') {
      gostStatus.value = gostRes.value.data.data
      console.log('✅ GOST状态获取成功:', gostStatus.value)
    } else {
      console.warn('⚠️ GOST状态获取失败:', gostRes.reason)

      // 检查是否是认证错误
      const isAuthError = gostRes.reason?.response?.status === 401

      if (isAuthError) {
        console.warn('🔐 GOST状态获取失败：认证错误，尝试使用备用API')
        // 认证错误时，尝试使用备用API (gost/status)
        try {
          const fallbackResponse = await api.gost.getStatus()
          gostStatus.value = {
            isRunning: fallbackResponse.data.data.isRunning,
            apiPort: '18080',
            healthyPorts: [],
            fallbackMode: true
          }
          console.log('✅ 使用备用API获取GOST状态成功:', gostStatus.value)
        } catch (fallbackError) {
          console.error('❌ 备用API也失败了:', fallbackError)
          // 保持之前的状态，不设置为false
          if (!gostStatus.value) {
            gostStatus.value = {
              isRunning: null, // null表示未知状态
              apiPort: '18080',
              healthyPorts: [],
              error: '无法获取状态'
            }
          }
        }
      } else {
        // 非认证错误，可能是网络问题等
        console.error('❌ GOST状态获取失败（非认证错误）:', gostRes.reason)
        if (!gostStatus.value) {
          gostStatus.value = {
            isRunning: null, // null表示未知状态
            apiPort: '18080',
            healthyPorts: [],
            error: '网络错误或服务不可用'
          }
        }
      }
    }

    // 设置服务状态的默认值
    monitorStatus.value = { isRunning: true, stats: { checksPerformed: 0, violationsFound: 0 } }
    quotaStatus.value = { isRunning: true, stats: { activeUsers: 0, quotaChecks: 0 } }
    syncStatus.value = { isRunning: true, stats: { lastSync: new Date().toISOString(), syncCount: 0 } }
    observerStatus.value = { isRunning: true, port: 18081 }

  } catch (error) {
    console.error('❌ 获取系统状态失败:', error)
    ElMessage.error('获取系统状态失败: ' + (error.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

// 刷新GOST状态
const refreshGostStatus = async () => {
  try {
    gostLoading.value = true
    const response = await api.system.getGostStatus()
    gostStatus.value = response.data.data
    console.log('✅ GOST状态刷新成功:', gostStatus.value)
  } catch (error) {
    console.error('获取GOST状态失败:', error)

    // 检查是否是认证错误
    const isAuthError = error?.response?.status === 401

    if (isAuthError) {
      console.warn('🔐 GOST状态刷新失败：认证错误，尝试使用备用API')
      try {
        const fallbackResponse = await api.gost.getStatus()
        gostStatus.value = {
          isRunning: fallbackResponse.data.data.isRunning,
          apiPort: '18080',
          healthyPorts: [],
          fallbackMode: true
        }
        console.log('✅ 使用备用API刷新GOST状态成功:', gostStatus.value)
        ElMessage.success('已使用备用方式获取GOST状态')
      } catch (fallbackError) {
        console.error('❌ 备用API也失败了:', fallbackError)
        ElMessage.error('无法获取GOST状态，请检查服务状态')
        // 保持之前的状态，不设置为false
        if (!gostStatus.value) {
          gostStatus.value = {
            isRunning: null,
            apiPort: '18080',
            healthyPorts: [],
            error: '无法获取状态'
          }
        }
      }
    } else {
      ElMessage.error('获取GOST状态失败: ' + (error.message || '未知错误'))
      // 保持之前的状态
      if (!gostStatus.value) {
        gostStatus.value = {
          isRunning: null,
          apiPort: '18080',
          healthyPorts: [],
          error: '网络错误或服务不可用'
        }
      }
    }
  } finally {
    gostLoading.value = false
  }
}

// 强制同步
const forceSync = async () => {
  try {
    syncLoading.value = true
    await api.system.forceSync()
    ElMessage.success('强制同步已触发')
    // 延迟刷新状态
    setTimeout(refreshSystemStatus, 2000)
  } catch (error) {
    console.error('强制同步失败:', error)
    ElMessage.error('强制同步失败')
  } finally {
    syncLoading.value = false
  }
}

// 重启GOST
const restartGost = async () => {
  try {
    gostLoading.value = true
    await api.system.restartGost()
    ElMessage.success('GOST服务重启成功')
    // 延迟刷新状态
    setTimeout(refreshGostStatus, 3000)
  } catch (error) {
    console.error('重启GOST失败:', error)
    ElMessage.error('重启GOST失败')
  } finally {
    gostLoading.value = false
  }
}

// 格式化运行时间
const formatUptime = (seconds) => {
  if (!seconds) return '未知'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  
  let result = ''
  if (days > 0) result += `${days}天 `
  if (hours > 0 || days > 0) result += `${hours}小时 `
  result += `${minutes}分钟`
  
  return result
}

// 格式化内存
const formatMemory = (bytes) => {
  if (!bytes) return '未知'
  return formatTraffic(bytes)
}

// 格式化流量
const formatTraffic = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onMounted(() => {
  refreshSystemStatus()
  
  // 设置定时刷新
  refreshTimer = setInterval(refreshSystemStatus, 30000) // 30秒刷新一次
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})
</script>

<style scoped>
.system-status {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
  background: #f5f7fa;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding: 16px 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.08);
  border: 1px solid #ebeef5;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.status-card {
  margin-bottom: 24px;
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.08);
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
}

.overview-card {
  background: linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%);
}

.services-card {
  background: linear-gradient(135deg, #f0f9eb 0%, #ffffff 100%);
}

.gost-card {
  background: linear-gradient(135deg, #fff7e6 0%, #ffffff 100%);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 16px;
  color: #303133;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.stat-card {
  padding: 24px 20px;
  text-align: center;
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
  border-radius: 12px;
  border: 1px solid #ebeef5;
  transition: all 0.3s ease;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.stat-title {
  font-size: 14px;
  color: #606266;
  margin-bottom: 12px;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #409EFF;
  line-height: 1.2;
}

.stat-value.success {
  color: #67C23A;
}

.stat-value.danger {
  color: #F56C6C;
}

.stat-value.warning {
  color: #E6A23C;
}

.gost-stat-card {
  position: relative;
  padding-top: 32px;
}

.stat-icon {
  position: absolute;
  top: 16px;
  right: 16px;
  opacity: 0.8;
}

.service-card {
  padding: 24px 20px;
  background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
  border-radius: 12px;
  border: 1px solid #ebeef5;
  text-align: center;
  transition: all 0.3s ease;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.service-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
}

.service-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.service-status {
  font-size: 14px;
  font-weight: 600;
  color: #F56C6C;
  margin-bottom: 12px;
  padding: 4px 12px;
  border-radius: 16px;
  background-color: rgba(245, 108, 108, 0.1);
  display: inline-block;
}

.service-status.running {
  color: #67C23A;
  background-color: rgba(103, 194, 58, 0.1);
}

.service-details {
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.service-details p {
  margin: 4px 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .system-status {
    padding: 16px;
  }

  .stat-card,
  .service-card {
    padding: 20px 16px;
  }

  .stat-value {
    font-size: 24px;
  }

  .service-title {
    font-size: 14px;
  }
}

/* 加载状态优化 */
.el-loading-mask {
  border-radius: 8px;
}
</style>
