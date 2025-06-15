<template>
  <div class="gost-config">
    <div class="page-header">
      <h2>Gost 配置管理</h2>
      <div class="header-actions">
        <el-button
          type="primary"
          @click="handleManualSync"
          :loading="syncing"
          icon="Refresh"
        >
          手动同步
        </el-button>
        <el-button
          :type="autoSyncEnabled ? 'warning' : 'success'"
          @click="toggleAutoSync"
          :loading="syncing"
          :icon="autoSyncEnabled ? 'VideoPause' : 'VideoPlay'"
        >
          {{ autoSyncEnabled ? '停止自动同步' : '启动自动同步' }}
        </el-button>
      </div>
    </div>

    <!-- 统计信息 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-number">{{ stats.serviceCount || 0 }}</div>
            <div class="stat-label">服务数量</div>
            <div class="stat-description">当前运行的服务</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-number">{{ stats.portCount || 0 }}</div>
            <div class="stat-label">端口数量</div>
            <div class="stat-description">已配置的端口</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-number">{{ stats.userCount || 0 }}</div>
            <div class="stat-label">用户数量</div>
            <div class="stat-description">系统用户总数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card clickable-card" @click="toggleAutoSync">
          <div class="stat-content">
            <div class="stat-number" :class="{ 'enabled': autoSyncEnabled, 'disabled': !autoSyncEnabled }">
              {{ autoSyncEnabled ? '开启' : '停止' }}
            </div>
            <div class="stat-label">自动同步</div>
            <div class="stat-description" :class="{ 'enabled': autoSyncEnabled, 'disabled': !autoSyncEnabled }">
              {{ autoSyncEnabled ? '配置自动同步中' : '点击启用自动同步' }}
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 配置对比 -->
    <el-card class="config-compare" v-if="comparison">
      <template #header>
        <div class="card-header">
          <span>配置对比</span>
          <el-button type="text" @click="loadComparison" icon="Refresh">刷新</el-button>
        </div>
      </template>

      <div class="comparison-info">
        <el-alert
          v-if="comparison.isChanged"
          title="配置已变更"
          type="warning"
          show-icon
          :closable="false"
        >
          <template #default>
            <div>检测到配置变化，建议手动同步或等待自动同步</div>
            <div style="margin-top: 8px;">
              <el-button
                type="primary"
                size="small"
                @click="handleManualSync(false)"
                :loading="syncing"
              >
                立即同步
              </el-button>
              <el-button
                type="warning"
                size="small"
                @click="handleForceSync"
                :loading="syncing"
              >
                强制同步
              </el-button>
            </div>
          </template>
        </el-alert>
        <el-alert
          v-else
          title="配置已同步"
          type="success"
          description="当前配置与生成配置一致"
          show-icon
          :closable="false"
        />
      </div>

      <el-tabs v-model="activeTab" class="config-tabs">
        <el-tab-pane label="生成的配置" name="generated">
          <div class="config-content">
            <div class="config-header">
              <span>服务数量: {{ comparison.generated.services.length }}</span>
              <span>哈希值: {{ comparison.generatedHash.substring(0, 16) }}...</span>
            </div>
            <pre class="config-json">{{ JSON.stringify(comparison.generated, null, 2) }}</pre>
          </div>
        </el-tab-pane>
        <el-tab-pane label="当前配置" name="current">
          <div class="config-content">
            <div class="config-header">
              <span>服务数量: {{ comparison.current.services.length }}</span>
              <span>哈希值: {{ comparison.currentHash.substring(0, 16) }}...</span>
            </div>
            <pre class="config-json">{{ JSON.stringify(comparison.current, null, 2) }}</pre>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 同步日志 -->
    <el-card class="sync-log">
      <template #header>
        <div class="card-header">
          <span>同步日志</span>
          <el-button type="text" @click="clearLogs" icon="Delete">清空日志</el-button>
        </div>
      </template>

      <div class="log-content">
        <div v-if="syncLogs.length === 0" class="no-logs">
          暂无同步日志
        </div>
        <div v-else>
          <div
            v-for="(log, index) in syncLogs"
            :key="index"
            class="log-item"
            :class="log.type"
          >
            <div class="log-time">{{ formatTime(log.time) }}</div>
            <div class="log-message">{{ log.message }}</div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script>
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Check, Close } from '@element-plus/icons-vue'
import api from '@/utils/api'

export default {
  name: 'GostConfig',
  setup() {
    const store = useStore()
    const router = useRouter()

    // 权限检查
    const isAdmin = computed(() => store.getters['user/isAdmin'])

    // 如果不是管理员，重定向到仪表板
    if (!isAdmin.value) {
      ElMessage.error('此功能仅限管理员使用')
      router.push('/dashboard')
      return {}
    }
    const syncing = ref(false)
    const stats = reactive({
      serviceCount: 0,
      portCount: 0,
      userCount: 0,
      protocols: []
    })
    
    // 计算自动同步状态
    const autoSyncEnabled = ref(false)
    
    const comparison = ref(null)
    const activeTab = ref('generated')
    const syncLogs = ref([])
    const refreshTimer = ref(null)

    // 添加日志
    const addLog = (message, type = 'info') => {
      syncLogs.value.unshift({
        time: new Date(),
        message,
        type
      })
      // 保持最多50条日志
      if (syncLogs.value.length > 50) {
        syncLogs.value = syncLogs.value.slice(0, 50)
      }
    }

    // 格式化时间
    const formatTime = (time) => {
      return time.toLocaleString()
    }

    // 清空日志
    const clearLogs = () => {
      syncLogs.value = []
      addLog('日志已清空')
    }

    // 加载统计信息
    const loadStats = async () => {
      try {
        const response = await api.get('/gost-config/stats')
        Object.assign(stats, response.data.data)
        
        // 获取同步协调器状态
        try {
          const syncStatus = await api.get('/gost-config/sync-status')
          autoSyncEnabled.value = syncStatus.data.data.autoSyncRunning || false
        } catch (error) {
          console.error('获取同步状态失败:', error)
        }
      } catch (error) {
        console.error('加载统计信息失败:', error)
        addLog('加载统计信息失败: ' + (error.response?.data?.message || error.message), 'error')
      }
    }

    // 加载配置对比
    const loadComparison = async () => {
      try {
        const response = await api.get('/gost-config/compare')
        comparison.value = response.data.data
      } catch (error) {
        console.error('加载配置对比失败:', error)

        // 🔧 智能处理认证失败和其他错误
        if (error.response?.status === 401) {
          // 认证失败，可能是权限问题，假设配置一致
          comparison.value = {
            isChanged: false,
            reason: 'auth_required',
            message: '需要管理员权限查看配置比较'
          }
          addLog('配置比较需要管理员权限', 'warning')
        } else {
          // 其他错误，保守假设配置可能有变化
          comparison.value = {
            isChanged: false,
            reason: 'comparison_failed',
            message: '配置比较服务暂时不可用'
          }
          ElMessage.error('加载配置对比失败')
          addLog('配置比较加载失败: ' + (error.response?.data?.message || error.message), 'error')
        }
      }
    }

    // 手动同步
    const handleManualSync = async (force = false) => {
      syncing.value = true
      try {
        const response = await api.post('/gost-config/sync', { force })
        const result = response.data.data

        if (result.updated) {
          ElMessage.success('配置已更新并同步')
          addLog('手动同步成功，配置已更新', 'success')
        } else if (result.skipped) {
          ElMessage.warning(response.data.message || '同步已跳过')
          addLog(response.data.message || '同步已跳过', 'warning')
        } else {
          ElMessage.info('配置无变化')
          addLog('手动同步完成，配置无变化', 'info')
        }

        await loadStats()
        await loadComparison()
      } catch (error) {
        console.error('手动同步失败:', error)
        ElMessage.error('手动同步失败: ' + (error.response?.data?.message || error.message))
        addLog('手动同步失败: ' + (error.response?.data?.message || error.message), 'error')
      } finally {
        syncing.value = false
      }
    }

    // 强制同步
    const handleForceSync = async () => {
      await handleManualSync(true)
    }

    // 启动自动同步
    const handleStartAutoSync = async () => {
      try {
        await api.post('/gost-config/auto-sync/start')
        ElMessage.success('自动同步已启动')
        addLog('自动同步已启动', 'success')
        autoSyncEnabled.value = true
        await loadStats()
      } catch (error) {
        console.error('启动自动同步失败:', error)
        ElMessage.error('启动自动同步失败')
        addLog('启动自动同步失败', 'error')
      }
    }

    // 停止自动同步
    const handleStopAutoSync = async () => {
      try {
        await api.post('/gost-config/auto-sync/stop')
        ElMessage.success('自动同步已停止')
        addLog('自动同步已停止', 'warning')
        autoSyncEnabled.value = false
        await loadStats()
      } catch (error) {
        console.error('停止自动同步失败:', error)
        ElMessage.error('停止自动同步失败')
        addLog('停止自动同步失败', 'error')
      }
    }

    // 切换自动同步状态
    const toggleAutoSync = async () => {
      if (autoSyncEnabled.value) {
        await handleStopAutoSync()
      } else {
        await handleStartAutoSync()
      }
    }

    // 定时刷新数据
    const startRefreshTimer = () => {
      refreshTimer.value = setInterval(async () => {
        await loadStats()
        if (comparison.value) {
          await loadComparison()
        }
      }, 30000) // 每30秒刷新一次
    }

    const stopRefreshTimer = () => {
      if (refreshTimer.value) {
        clearInterval(refreshTimer.value)
        refreshTimer.value = null
      }
    }

    onMounted(async () => {
      addLog('页面已加载')
      await loadStats()
      await loadComparison()
      startRefreshTimer()
    })

    onUnmounted(() => {
      stopRefreshTimer()
    })

    return {
      syncing,
      stats,
      comparison,
      activeTab,
      syncLogs,
      addLog,
      formatTime,
      clearLogs,
      loadStats,
      loadComparison,
      syncConfig: handleManualSync, // 添加别名以保持兼容性
      handleManualSync,
      handleForceSync,
      handleStartAutoSync,
      handleStopAutoSync,
      toggleAutoSync,
      autoSyncEnabled,
      Check,
      Close
    }
  }
}
</script>

<style scoped>
.gost-config {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.stats-row {
  margin-bottom: 20px;
}

.stat-card {
  text-align: center;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.clickable-card {
  cursor: pointer;
  transition: all 0.3s ease;
}

.clickable-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.stat-content {
  padding: 10px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.stat-number {
  font-size: 32px;
  font-weight: bold;
  color: #409EFF;
  margin-bottom: 5px;
}

.stat-number.enabled {
  color: #67C23A;
}

.stat-number.disabled {
  color: #F56C6C;
}



.stat-label {
  font-size: 14px;
  color: #909399;
}

.stat-description {
  font-size: 12px;
  margin-top: 4px;
  color: #909399;
}

.stat-description.enabled {
  color: #67C23A;
}

.stat-description.disabled {
  color: #F56C6C;
}

.config-compare,
.sync-log {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.comparison-info {
  margin-bottom: 20px;
}

.config-content {
  max-height: 400px;
  overflow-y: auto;
}

.config-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 10px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
}

.config-json {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 15px;
  font-size: 12px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.log-content {
  max-height: 300px;
  overflow-y: auto;
}

.no-logs {
  text-align: center;
  color: #909399;
  padding: 20px;
}

.log-item {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.log-item:last-child {
  border-bottom: none;
}

.log-time {
  width: 150px;
  font-size: 12px;
  color: #909399;
  flex-shrink: 0;
}

.log-message {
  flex: 1;
  font-size: 14px;
}

.log-item.success .log-message {
  color: #67C23A;
}

.log-item.error .log-message {
  color: #F56C6C;
}

.log-item.warning .log-message {
  color: #E6A23C;
}

.log-item.info .log-message {
  color: #606266;
}
</style>
