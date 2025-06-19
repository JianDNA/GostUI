<template>
  <div class="system-settings">
    <div class="page-header">
      <h1>系统设置</h1>
      <p>管理系统全局配置和安全策略</p>
    </div>

    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>🔒 安全配置</span>
        </div>
      </template>

      <div class="settings-section">
        <div class="setting-item">
          <div class="setting-info">
            <h3>普通用户外部访问控制</h3>
            <p class="setting-description">
              控制普通用户创建的转发规则是否允许外部IP访问。
              <br>
              <strong>启用</strong>：普通用户规则监听所有接口 (0.0.0.0)，外部可访问
              <br>
              <strong>禁用</strong>：普通用户规则仅监听本地接口 (127.0.0.1)，仅本地访问
              <br>
              <em>注意：管理员用户不受此限制，始终允许外部访问</em>
            </p>
          </div>
          <div class="setting-control">
            <el-switch
              v-model="allowUserExternalAccess"
              :loading="switchLoading"
              active-text="允许"
              inactive-text="禁止"
              active-color="#67C23A"
              inactive-color="#F56C6C"
              @change="handleExternalAccessChange"
            />
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <h3>当前配置状态</h3>
            <div class="status-info">
              <el-tag :type="allowUserExternalAccess ? 'success' : 'warning'" size="large">
                {{ allowUserExternalAccess ? '✅ 允许外部访问' : '🔒 仅本地访问' }}
              </el-tag>
              <div class="status-details">
                <p><strong>管理员用户规则：</strong></p>
                <ul>
                  <li>IPv4: <code>0.0.0.0:端口</code> (所有接口)</li>
                  <li>IPv6: <code>[::]:端口</code> (所有接口)</li>
                </ul>
                <p><strong>普通用户规则：</strong></p>
                <ul v-if="allowUserExternalAccess">
                  <li>IPv4: <code>0.0.0.0:端口</code> (所有接口)</li>
                  <li>IPv6: <code>[::]:端口</code> (所有接口)</li>
                </ul>
                <ul v-else>
                  <li>IPv4: <code>127.0.0.1:端口</code> (仅本地)</li>
                  <li>IPv6: <code>[::1]:端口</code> (仅本地)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>ℹ️ 配置说明</span>
        </div>
      </template>

      <div class="help-section">
        <h3>网络监听地址说明</h3>
        <el-table :data="addressExplanation" style="width: 100%">
          <el-table-column prop="address" label="监听地址" width="200">
            <template #default="scope">
              <code>{{ scope.row.address }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="类型" width="100" />
          <el-table-column prop="external" label="外部访问" width="100">
            <template #default="scope">
              <el-tag :type="scope.row.external ? 'success' : 'danger'" size="small">
                {{ scope.row.external ? '✅ 可访问' : '❌ 不可访问' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="说明" />
        </el-table>

        <div class="security-notice">
          <el-alert
            title="安全提醒"
            type="warning"
            :closable="false"
            show-icon
          >
            <template #default>
              <p><strong>启用外部访问的安全考虑：</strong></p>
              <ul>
                <li>普通用户的转发端口将直接暴露到公网</li>
                <li>请确保用户创建的转发规则是安全的</li>
                <li>建议配合防火墙和端口范围限制使用</li>
                <li>可以随时通过此开关禁用普通用户的外部访问</li>
              </ul>
            </template>
          </el-alert>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { systemConfig } from '@/utils/api'

// 响应式数据
const allowUserExternalAccess = ref(true)
const switchLoading = ref(false)
const isLoadingConfig = ref(false)  // 防止加载配置时触发change事件

// 地址说明表格数据
const addressExplanation = [
  {
    address: '0.0.0.0:端口',
    type: 'IPv4',
    external: true,
    description: '监听所有IPv4接口，外部设备可以访问'
  },
  {
    address: '127.0.0.1:端口',
    type: 'IPv4',
    external: false,
    description: '仅监听IPv4回环接口，只有本机可以访问'
  },
  {
    address: '[::]:端口',
    type: 'IPv6',
    external: true,
    description: '监听所有IPv6接口，外部设备可以访问'
  },
  {
    address: '[::1]:端口',
    type: 'IPv6',
    external: false,
    description: '仅监听IPv6回环接口，只有本机可以访问'
  }
]

// 加载配置
const loadConfig = async () => {
  try {
    isLoadingConfig.value = true  // 标记正在加载配置
    const response = await systemConfig.getConfig('allowUserExternalAccess')

    // 🔧 强化数据类型转换逻辑
    const rawValue = response.data.value
    let convertedValue = false  // 默认为false

    // 处理各种可能的数据类型
    if (rawValue === true || rawValue === 'true' || rawValue === 1 || rawValue === '1') {
      convertedValue = true
    } else if (rawValue === false || rawValue === 'false' || rawValue === 0 || rawValue === '0') {
      convertedValue = false
    } else {
      // 对于其他值，尝试转换为布尔值
      convertedValue = Boolean(rawValue)
    }

    console.log('🔧 加载外部访问配置:', {
      raw: rawValue,
      rawType: typeof rawValue,
      converted: convertedValue,
      currentValue: allowUserExternalAccess.value,
      willChange: allowUserExternalAccess.value !== convertedValue
    })

    // 直接设置值，不检查是否改变（因为我们有isLoadingConfig保护）
    allowUserExternalAccess.value = convertedValue

  } catch (error) {
    console.error('加载配置失败:', error)
    ElMessage.error('加载配置失败')
    // 出错时设置为默认值
    allowUserExternalAccess.value = false
  } finally {
    isLoadingConfig.value = false  // 加载完成
  }
}

// 处理外部访问开关变化
const handleExternalAccessChange = async (value) => {
  // 如果正在加载配置，忽略change事件
  if (isLoadingConfig.value) {
    console.log('🔧 忽略配置加载期间的change事件')
    return
  }

  console.log('🔧 处理开关变化:', { value, loading: switchLoading.value })

  try {
    await ElMessageBox.confirm(
      `确定要${value ? '启用' : '禁用'}普通用户外部访问吗？\n\n` +
      `${value ? 
        '启用后，普通用户的转发规则将监听所有网络接口，外部设备可以访问。' : 
        '禁用后，普通用户的转发规则将仅监听本地接口，外部设备无法访问。'
      }\n\n` +
      '此操作将立即生效并重新生成GOST配置。',
      '确认配置变更',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    switchLoading.value = true

    const updateResponse = await systemConfig.updateConfig('allowUserExternalAccess', {
      value: value,
      description: '允许普通用户的转发规则被外部访问',
      category: 'security'
    })

    console.log('🔧 配置更新API响应:', {
      request: value,
      response: updateResponse.data,
      currentSwitchValue: allowUserExternalAccess.value
    })

    // 🔧 确保前端状态与请求值一致
    allowUserExternalAccess.value = value

    ElMessage.success(`已${value ? '启用' : '禁用'}普通用户外部访问`)
  } catch (error) {
    if (error !== 'cancel') {
      console.error('更新配置失败:', error)
      ElMessage.error('更新配置失败')
      // 重新加载配置以恢复正确状态
      await loadConfig()
    } else {
      // 用户取消，重新加载配置以恢复正确状态
      await loadConfig()
    }
  } finally {
    switchLoading.value = false
  }
}

// 页面可见性变化处理
const handleVisibilityChange = () => {
  if (!document.hidden && !isLoadingConfig.value && !switchLoading.value) {
    console.log('🔧 页面重新可见，重新加载配置')
    loadConfig()
  }
}

// 组件挂载时加载配置
onMounted(() => {
  loadConfig()
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

// 组件卸载时清理事件监听
onUnmounted(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<style scoped>
.system-settings {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
}

.page-header h1 {
  margin: 0 0 8px 0;
  color: #303133;
  font-size: 24px;
  font-weight: 600;
}

.page-header p {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

.settings-card {
  margin-bottom: 24px;
}

.card-header {
  display: flex;
  align-items: center;
  font-weight: 600;
  font-size: 16px;
}

.settings-section {
  padding: 16px 0;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px 0;
  border-bottom: 1px solid #f0f0f0;
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-info {
  flex: 1;
  margin-right: 24px;
}

.setting-info h3 {
  margin: 0 0 8px 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.setting-description {
  margin: 0;
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
}

.setting-control {
  flex-shrink: 0;
}

.status-info {
  margin-top: 16px;
}

.status-details {
  margin-top: 16px;
  padding: 16px;
  background-color: #f8f9fa;
  border-radius: 6px;
}

.status-details p {
  margin: 0 0 8px 0;
  font-weight: 600;
  color: #303133;
}

.status-details ul {
  margin: 8px 0 16px 20px;
  padding: 0;
}

.status-details li {
  margin: 4px 0;
  color: #606266;
  font-size: 14px;
}

.status-details code {
  background-color: #e6f7ff;
  color: #1890ff;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
}

.help-section h3 {
  margin: 0 0 16px 0;
  color: #303133;
  font-size: 16px;
  font-weight: 600;
}

.security-notice {
  margin-top: 24px;
}

.security-notice ul {
  margin: 8px 0 0 20px;
  padding: 0;
}

.security-notice li {
  margin: 4px 0;
  color: #606266;
  font-size: 14px;
}
</style>
