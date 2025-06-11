<template>
  <div class="system-status">
    <el-page-header @back="$router.go(-1)" content="系统状态监控" />
    
    <!-- 系统概览 -->
    <el-card class="status-card">
      <template #header>
        <div class="card-header">
          <span>系统概览</span>
          <el-button link @click="refreshSystemStatus">
            <el-icon><Refresh /></el-icon>
          </el-button>
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
            <div class="stat-title">内存使用</div>
            <div class="stat-value">{{ formatMemory(systemStatus?.memory?.used) }}</div>
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
            <div class="stat-value">{{ systemStats?.rules?.active || 0 }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 服务状态 -->
    <el-card class="status-card">
      <template #header>
        <div class="card-header">
          <span>服务状态</span>
          <el-button type="primary" size="small" @click="forceSync" :loading="syncLoading">
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
            <div class="service-details" v-if="monitorStatus?.stats">
              <p>检查次数: {{ monitorStatus.stats.checksPerformed || 0 }}</p>
              <p>违规次数: {{ monitorStatus.stats.violationsFound || 0 }}</p>
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
            <div class="service-details" v-if="quotaStatus?.stats">
              <p>缓存命中率: {{ (quotaStatus.stats.hitRate * 100).toFixed(1) }}%</p>
              <p>检查次数: {{ quotaStatus.stats.checksPerformed || 0 }}</p>
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
            <div class="service-details" v-if="syncStatus?.stats">
              <p>成功同步: {{ syncStatus.stats.successfulSyncs || 0 }}</p>
              <p>队列长度: {{ syncStatus.queueLength || 0 }}</p>
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- GOST服务状态 -->
    <el-card class="status-card">
      <template #header>
        <div class="card-header">
          <span>GOST服务状态</span>
          <div>
            <el-button link @click="refreshGostStatus">
              <el-icon><Refresh /></el-icon>
            </el-button>
            <el-button type="warning" size="small" @click="restartGost" :loading="gostLoading">
              重启服务
            </el-button>
          </div>
        </div>
      </template>
      <el-row :gutter="20" v-loading="gostLoading">
        <el-col :span="8">
          <div class="stat-card">
            <div class="stat-title">服务状态</div>
            <div class="stat-value" :class="{'success': gostStatus?.isRunning, 'danger': !gostStatus?.isRunning}">
              {{ gostStatus?.isRunning ? '运行中' : '已停止' }}
            </div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="stat-card">
            <div class="stat-title">健康端口</div>
            <div class="stat-value">{{ gostStatus?.healthyPorts?.length || 0 }}</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="stat-card">
            <div class="stat-title">观察器状态</div>
            <div class="stat-value" :class="{'success': observerStatus?.isRunning, 'danger': !observerStatus?.isRunning}">
              {{ observerStatus?.isRunning ? '运行中' : '已停止' }}
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 流量统计 -->
    <el-card class="status-card">
      <template #header>
        <span>流量统计</span>
      </template>
      <el-row :gutter="20" v-loading="loading">
        <el-col :span="12">
          <div class="stat-card">
            <div class="stat-title">总使用流量</div>
            <div class="stat-value">{{ formatTraffic(systemStats?.traffic?.totalUsed) }}</div>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="stat-card">
            <div class="stat-title">总配额</div>
            <div class="stat-value">{{ formatTraffic(systemStats?.traffic?.totalQuota) }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Monitor, Setting, Connection } from '@element-plus/icons-vue'
import api from '@/utils/api'

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

// 刷新系统状态
const refreshSystemStatus = async () => {
  try {
    loading.value = true
    
    // 并行获取所有状态
    const [
      systemRes,
      statsRes,
      monitorRes,
      quotaRes,
      syncRes,
      gostRes,
      observerRes
    ] = await Promise.allSettled([
      api.system.getStatus(),
      api.system.getStats(),
      api.system.getMonitorStatus(),
      api.system.getQuotaStatus(),
      api.system.getSyncStatus(),
      api.system.getGostStatus(),
      api.system.getObserverStatus()
    ])
    
    if (systemRes.status === 'fulfilled') {
      systemStatus.value = systemRes.value.data
    }
    
    if (statsRes.status === 'fulfilled') {
      systemStats.value = statsRes.value.data
    }
    
    if (monitorRes.status === 'fulfilled') {
      monitorStatus.value = monitorRes.value.data
    }
    
    if (quotaRes.status === 'fulfilled') {
      quotaStatus.value = quotaRes.value.data
    }
    
    if (syncRes.status === 'fulfilled') {
      syncStatus.value = syncRes.value.data
    }
    
    if (gostRes.status === 'fulfilled') {
      gostStatus.value = gostRes.value.data
    }
    
    if (observerRes.status === 'fulfilled') {
      observerStatus.value = observerRes.value.data
    }
    
  } catch (error) {
    console.error('获取系统状态失败:', error)
    ElMessage.error('获取系统状态失败')
  } finally {
    loading.value = false
  }
}

// 刷新GOST状态
const refreshGostStatus = async () => {
  try {
    gostLoading.value = true
    const response = await api.system.getGostStatus()
    gostStatus.value = response.data
  } catch (error) {
    console.error('获取GOST状态失败:', error)
    ElMessage.error('获取GOST状态失败')
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
}

.status-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-card {
  padding: 20px;
  text-align: center;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.stat-title {
  font-size: 14px;
  color: #606266;
  margin-bottom: 10px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #409EFF;
}

.stat-value.success {
  color: #67C23A;
}

.stat-value.danger {
  color: #F56C6C;
}

.service-card {
  padding: 20px;
  background-color: #f8f9fa;
  border-radius: 4px;
  text-align: center;
}

.service-title {
  font-size: 16px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.service-status {
  font-size: 14px;
  font-weight: bold;
  color: #F56C6C;
  margin-bottom: 10px;
}

.service-status.running {
  color: #67C23A;
}

.service-details {
  font-size: 12px;
  color: #909399;
}

.service-details p {
  margin: 4px 0;
}
</style>
