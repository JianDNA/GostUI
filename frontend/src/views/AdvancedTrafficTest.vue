<template>
  <div class="advanced-traffic-test">
    <el-card class="header-card">
      <template #header>
        <div class="card-header">
          <h2>🧪 高级流量测试</h2>
          <el-tag :type="currentUser?.role === 'admin' ? 'success' : 'primary'">
            {{ currentUser?.username || '未知用户' }}
          </el-tag>
        </div>
      </template>

      <el-alert
        title="测试说明"
        type="info"
        :closable="false"
        show-icon
      >
        <p>此工具整合了API模式切换和流量测试功能。</p>
        <p><strong>Admin用户</strong>：可以测试任意端口和切换API模式</p>
        <p><strong>Test用户</strong>：可以测试自己的转发规则端口</p>
      </el-alert>
    </el-card>

    <!-- API 模式切换 (仅Admin用户) -->
    <el-card class="api-mode-card" v-if="isAdmin">
      <template #header>
        <h3>🔧 API 模式切换</h3>
      </template>

      <div class="mode-info">
        <p><strong>当前模式：</strong>
          <el-tag :type="currentMode === 'gost' ? 'success' : 'primary'">
            {{ getModeDisplayName(currentMode) }}
          </el-tag>
        </p>
        <p><strong>当前地址：</strong> {{ currentBaseURL }}</p>
      </div>

      <div class="mode-buttons">
        <el-button
          v-for="(config, mode) in apiModes"
          :key="mode"
          :type="currentMode === mode ? 'primary' : 'default'"
          @click="switchMode(mode)"
          :disabled="currentMode === mode"
        >
          {{ getModeDisplayName(mode) }}
          <br>
          <small>{{ config.description }}</small>
        </el-button>
      </div>
    </el-card>

    <!-- 端口选择 -->
    <el-card class="port-selection-card">
      <template #header>
        <h3>🔌 端口选择</h3>
      </template>

      <div class="port-controls">
        <div class="port-input-group">
          <el-input-number
            v-model="selectedPort"
            :min="1"
            :max="65535"
            placeholder="输入端口号"
            style="width: 200px;"
          />
          <el-button
            type="primary"
            @click="validatePort"
            :loading="validatingPort"
          >
            验证端口
          </el-button>
        </div>

        <div class="quick-ports" v-if="availablePorts.length > 0">
          <span>快速选择：</span>
          <el-button
            v-for="port in availablePorts"
            :key="port.port"
            size="small"
            :type="selectedPort === port.port ? 'primary' : 'default'"
            @click="selectedPort = port.port; validatePort()"
          >
            {{ port.port }} ({{ port.name }})
          </el-button>
        </div>
      </div>

      <div v-if="portValidation" class="port-status">
        <el-alert
          :title="portValidation.title"
          :type="portValidation.type"
          :closable="false"
          show-icon
        >
          {{ portValidation.message }}
        </el-alert>
      </div>
    </el-card>

    <!-- 流量测试 -->
    <el-card class="traffic-test-card" v-if="portValidation?.type === 'success'">
      <template #header>
        <h3>📊 流量测试</h3>
      </template>

      <div class="test-controls">
        <div class="size-control">
          <label>测试大小：</label>
          <el-input-number
            v-model="testSize"
            :min="0.1"
            :max="1024"
            :step="0.1"
            :precision="1"
            style="width: 150px;"
          />
          <span>MB</span>
        </div>

        <el-button
          type="primary"
          size="large"
          @click="runTrafficTest"
          :loading="testing"
          :disabled="!selectedPort || portValidation?.type !== 'success'"
        >
          执行测试
        </el-button>
      </div>

      <div class="quick-tests">
        <span>快速测试：</span>
        <el-button
          v-for="size in [1, 5, 10, 50, 100]"
          :key="size"
          size="small"
          @click="runQuickTest(size)"
          :loading="testing"
          :disabled="!selectedPort || portValidation?.type !== 'success'"
        >
          {{ size }}MB
        </el-button>
      </div>
    </el-card>

    <!-- 测试结果 -->
    <el-card class="results-card" v-if="testResults.length > 0">
      <template #header>
        <div class="card-header">
          <h3>📈 测试结果</h3>
          <el-button size="small" @click="clearResults">清空结果</el-button>
        </div>
      </template>

      <el-table :data="testResults" stripe>
        <el-table-column prop="time" label="时间" width="120" />
        <el-table-column prop="port" label="端口" width="80" />
        <el-table-column prop="size" label="请求大小" width="100" />
        <el-table-column prop="actualSize" label="实际大小" width="100" />
        <el-table-column prop="duration" label="耗时" width="100" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'success' ? 'success' : 'danger'">
              {{ row.status === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="详情" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/utils/api'
import { getApiModeInfo, switchApiMode } from '@/config/api'

// 响应式数据
const currentUser = ref(null)
const selectedPort = ref(6443) // 默认端口
const testSize = ref(1)
const testing = ref(false)
const validatingPort = ref(false)
const portValidation = ref(null)
const availablePorts = ref([])
const testResults = ref([])

// API 模式相关
const currentMode = ref('direct')
const currentBaseURL = ref('')
const apiModes = ref({
  direct: { baseURL: 'http://localhost:3000/api', description: '直连后端' },
  gost: { baseURL: 'http://localhost:6443/api', description: '通过GOST代理' },
  production: { baseURL: '/api', description: '生产环境' }
})

// 计算属性
const isAdmin = computed(() => currentUser.value?.role === 'admin')

// API 模式相关方法
const updateApiModeInfo = () => {
  const info = getApiModeInfo()
  currentMode.value = info.mode
  currentBaseURL.value = info.config.baseURL
}

const getModeDisplayName = (mode) => {
  const names = {
    direct: '直连模式',
    gost: 'GOST模式',
    production: '生产模式'
  }
  return names[mode] || mode
}

const switchMode = (mode) => {
  const success = switchApiMode(mode)
  if (success) {
    updateApiModeInfo()
    ElMessage.success(`已切换到${getModeDisplayName(mode)}`)
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  } else {
    ElMessage.error('切换模式失败')
  }
}

// 获取当前用户信息
const getCurrentUser = async () => {
  try {
    const response = await api.get('/users/me')
    currentUser.value = response.data

    // 如果是普通用户，获取其转发规则
    if (!isAdmin.value) {
      await getUserForwardRules()
    }
  } catch (error) {
    ElMessage.error('获取用户信息失败')
  }
}

// 获取用户转发规则
const getUserForwardRules = async () => {
  try {
    const response = await api.get('/user-forward-rules')
    const rules = response.data.rules || []

    availablePorts.value = rules
      .map(rule => ({
        port: rule.sourcePort,
        name: rule.name,
        target: rule.targetAddress,
        // 使用数据库字段，因为前端无法计算复杂的计算属性
        isActive: rule.isActive === true
      }))
      .filter(rule => rule.isActive)

    // 如果有可用端口，默认选择第一个
    if (availablePorts.value.length > 0) {
      selectedPort.value = availablePorts.value[0].port
    }
  } catch (error) {
    ElMessage.error('获取转发规则失败')
  }
}

// 验证端口
const validatePort = async () => {
  if (!selectedPort.value) {
    portValidation.value = {
      type: 'error',
      title: '端口无效',
      message: '请输入有效的端口号'
    }
    return
  }

  validatingPort.value = true

  try {
    if (isAdmin.value) {
      // Admin用户可以测试任意端口
      portValidation.value = {
        type: 'success',
        title: '端口可用',
        message: `Admin用户可以测试端口 ${selectedPort.value}`
      }
    } else {
      // 普通用户只能测试自己的转发规则端口
      const userPort = availablePorts.value.find(p => p.port === selectedPort.value)
      if (userPort) {
        portValidation.value = {
          type: 'success',
          title: '端口可用',
          message: `可以测试您的转发规则端口 ${selectedPort.value} (${userPort.name})`
        }
      } else {
        portValidation.value = {
          type: 'error',
          title: '端口不可用',
          message: `端口 ${selectedPort.value} 不在您的转发规则中，或规则未激活`
        }
      }
    }
  } catch (error) {
    portValidation.value = {
      type: 'error',
      title: '验证失败',
      message: error.message
    }
  } finally {
    validatingPort.value = false
  }
}

// 执行流量测试
const runTrafficTest = async () => {
  await executeTest(testSize.value)
}

// 快速测试
const runQuickTest = async (size) => {
  await executeTest(size)
}

// 执行测试的核心逻辑
const executeTest = async (size) => {
  if (!selectedPort.value || portValidation.value?.type !== 'success') {
    ElMessage.warning('请先选择并验证端口')
    return
  }

  testing.value = true
  const startTime = new Date()

  try {
    const token = localStorage.getItem('token')

    // 通过指定端口发送测试请求
    const testUrl = `http://localhost:${selectedPort.value}/api/test/traffic-custom?size=${size}`

    console.log(`🧪 测试端口 ${selectedPort.value}，大小 ${size}MB`)
    console.log(`🧪 请求URL: ${testUrl}`)

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Test-Mode': 'port-specific',
        'X-User-ID': currentUser.value.id.toString(),
        'X-Username': currentUser.value.username,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      },
      signal: AbortSignal.timeout(60000) // 60秒超时
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.blob()
    const actualSize = (data.size / (1024 * 1024)).toFixed(2)
    const duration = Date.now() - startTime.getTime()

    testResults.value.unshift({
      time: startTime.toLocaleTimeString(),
      port: selectedPort.value,
      size: `${size}MB`,
      actualSize: `${actualSize}MB`,
      duration: `${duration}ms`,
      status: 'success',
      message: `通过端口 ${selectedPort.value} 成功传输`
    })

    ElMessage.success(`测试成功: ${actualSize}MB，耗时 ${duration}ms`)

  } catch (error) {
    console.error('🔥 测试失败:', error)

    testResults.value.unshift({
      time: startTime.toLocaleTimeString(),
      port: selectedPort.value,
      size: `${size}MB`,
      actualSize: '-',
      duration: '-',
      status: 'failed',
      message: error.message
    })

    ElMessage.error(`测试失败: ${error.message}`)
  } finally {
    testing.value = false
  }
}

// 清空结果
const clearResults = () => {
  testResults.value = []
  ElMessage.success('结果已清空')
}

// 初始化
onMounted(async () => {
  updateApiModeInfo()
  await getCurrentUser()
  if (selectedPort.value) {
    await validatePort()
  }
})
</script>

<style scoped>
.advanced-traffic-test {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.port-controls {
  margin-bottom: 20px;
}

.port-input-group {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 15px;
}

.quick-ports {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.port-status {
  margin-top: 15px;
}

.test-controls {
  display: flex;
  gap: 20px;
  align-items: center;
  margin-bottom: 20px;
}

.size-control {
  display: flex;
  gap: 10px;
  align-items: center;
}

.quick-tests {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.header-card,
.api-mode-card,
.port-selection-card,
.traffic-test-card,
.results-card {
  margin-bottom: 20px;
}

.mode-info {
  margin-bottom: 15px;
}

.mode-buttons {
  display: flex;
  gap: 15px;
  justify-content: center;
  flex-wrap: wrap;
}

.mode-buttons .el-button {
  height: 60px;
  white-space: normal;
  padding: 10px 20px;
  text-align: center;
}

@media (max-width: 768px) {
  .test-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .quick-tests {
    justify-content: center;
  }

  .port-input-group {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
