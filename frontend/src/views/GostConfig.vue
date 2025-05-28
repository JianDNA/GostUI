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
          v-if="!stats.autoSyncEnabled"
          type="success"
          @click="handleStartAutoSync"
          icon="VideoPlay"
        >
          启动自动同步
        </el-button>
        <el-button
          v-else
          type="warning"
          @click="handleStopAutoSync"
          icon="VideoPause"
        >
          停止自动同步
        </el-button>
      </div>
    </div>

    <!-- 统计信息 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-number">{{ stats.generatedServices || 0 }}</div>
            <div class="stat-label">生成的服务数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-number">{{ stats.currentServices || 0 }}</div>
            <div class="stat-label">当前服务数</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-status" :class="{ 'up-to-date': stats.isUpToDate, 'outdated': !stats.isUpToDate }">
              {{ stats.isUpToDate ? '已同步' : '需要同步' }}
            </div>
            <div class="stat-label">同步状态</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="stat-card">
          <div class="stat-content">
            <div class="stat-status" :class="{ 'enabled': stats.autoSyncEnabled, 'disabled': !stats.autoSyncEnabled }">
              {{ stats.autoSyncEnabled ? '已启用' : '已停用' }}
            </div>
            <div class="stat-label">自动同步</div>
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
          description="检测到配置变化，建议手动同步或等待自动同步"
          show-icon
          :closable="false"
        />
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
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/utils/api'

export default {
  name: 'GostConfig',
  setup() {
    const syncing = ref(false)
    const stats = reactive({
      generatedServices: 0,
      currentServices: 0,
      isUpToDate: true,
      autoSyncEnabled: false
    })
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
        ElMessage.error('加载配置对比失败')
      }
    }

    // 手动同步
    const handleManualSync = async () => {
      syncing.value = true
      try {
        const response = await api.post('/gost-config/sync')
        const result = response.data.data

        if (result.updated) {
          ElMessage.success('配置已更新并同步')
          addLog('手动同步成功，配置已更新', 'success')
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

    // 启动自动同步
    const handleStartAutoSync = async () => {
      try {
        await api.post('/gost-config/auto-sync/start')
        ElMessage.success('自动同步已启动')
        addLog('自动同步已启动', 'success')
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
        await loadStats()
      } catch (error) {
        console.error('停止自动同步失败:', error)
        ElMessage.error('停止自动同步失败')
        addLog('停止自动同步失败', 'error')
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
      handleManualSync,
      handleStartAutoSync,
      handleStopAutoSync
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
}

.stat-content {
  padding: 10px;
}

.stat-number {
  font-size: 32px;
  font-weight: bold;
  color: #409EFF;
  margin-bottom: 5px;
}

.stat-status {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 5px;
}

.stat-status.up-to-date,
.stat-status.enabled {
  color: #67C23A;
}

.stat-status.outdated,
.stat-status.disabled {
  color: #F56C6C;
}

.stat-label {
  font-size: 14px;
  color: #909399;
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
