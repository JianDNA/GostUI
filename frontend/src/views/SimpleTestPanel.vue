<template>
  <div class="simple-test-panel">
    <el-card>
      <template #header>
        <h2>🧪 API 测试面板</h2>
      </template>
      
      <!-- API 模式切换 -->
      <el-card style="margin-bottom: 20px;">
        <template #header>
          <span>🔄 API 模式切换</span>
        </template>
        
        <div class="mode-section">
          <p><strong>当前模式:</strong> {{ currentMode }}</p>
          <p><strong>当前地址:</strong> {{ currentBaseURL }}</p>
          
          <div class="mode-buttons">
            <el-button 
              :type="currentMode === 'direct' ? 'primary' : 'default'"
              @click="switchToMode('direct')"
            >
              DIRECT 模式
              <br><small>直连后端</small>
            </el-button>
            
            <el-button 
              :type="currentMode === 'gost' ? 'primary' : 'default'"
              @click="switchToMode('gost')"
            >
              GOST 模式
              <br><small>通过代理</small>
            </el-button>
            
            <el-button 
              :type="currentMode === 'production' ? 'primary' : 'default'"
              @click="switchToMode('production')"
            >
              PRODUCTION 模式
              <br><small>生产环境</small>
            </el-button>
          </div>
          
          <el-alert
            v-if="modeChanged"
            title="模式已切换，请刷新页面生效"
            type="warning"
            style="margin-top: 15px;"
          >
            <el-button type="primary" size="small" @click="reloadPage">
              立即刷新
            </el-button>
          </el-alert>
        </div>
      </el-card>

      <!-- 流量测试 -->
      <el-card style="margin-bottom: 20px;">
        <template #header>
          <span>🚀 流量测试</span>
        </template>
        
        <div class="traffic-section">
          <p><strong>当前状态:</strong> 
            <el-tag :type="currentMode === 'gost' ? 'success' : 'warning'">
              {{ currentMode === 'gost' ? '可以测试' : '需要切换到GOST模式' }}
            </el-tag>
          </p>
          
          <div class="test-controls">
            <el-input-number
              v-model="testSize"
              :min="0.1"
              :max="1024"
              :step="0.1"
              :precision="1"
              style="width: 150px;"
            />
            <span style="margin: 0 10px;">MB</span>
            
            <el-button
              type="primary"
              @click="runTrafficTest"
              :loading="testing"
              :disabled="currentMode !== 'gost'"
            >
              执行测试
            </el-button>
          </div>
          
          <div class="quick-tests" style="margin-top: 15px;">
            <el-button
              size="small"
              @click="runQuickTest(1)"
              :loading="testing"
              :disabled="currentMode !== 'gost'"
            >
              1MB 测试
            </el-button>
            <el-button
              size="small"
              @click="runQuickTest(5)"
              :loading="testing"
              :disabled="currentMode !== 'gost'"
            >
              5MB 测试
            </el-button>
            <el-button
              size="small"
              @click="runQuickTest(10)"
              :loading="testing"
              :disabled="currentMode !== 'gost'"
            >
              10MB 测试
            </el-button>
            <el-button
              size="small"
              type="warning"
              @click="runQuickTest(50)"
              :loading="testing"
              :disabled="currentMode !== 'gost'"
            >
              50MB 测试
            </el-button>
            <el-button
              size="small"
              type="danger"
              @click="runQuickTest(100)"
              :loading="testing"
              :disabled="currentMode !== 'gost'"
            >
              100MB 测试
            </el-button>
          </div>
        </div>
      </el-card>

      <!-- 测试结果 -->
      <el-card v-if="testResults.length > 0">
        <template #header>
          <span>📊 测试结果</span>
        </template>
        
        <el-table :data="testResults" border size="small">
          <el-table-column prop="time" label="时间" width="120" />
          <el-table-column prop="size" label="大小" width="80" />
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
                {{ row.status === 'success' ? '成功' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="result" label="结果" />
        </el-table>
        
        <div style="margin-top: 10px;">
          <el-button size="small" @click="clearResults">清空结果</el-button>
        </div>
      </el-card>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

// 响应式数据
const testSize = ref(1.0)
const testing = ref(false)
const modeChanged = ref(false)
const testResults = ref([])

// API 配置
const apiModes = {
  direct: 'http://localhost:3000/api',
  gost: 'http://localhost:6443/api', 
  production: '/api'
}

// 获取当前模式
const getCurrentMode = () => {
  return localStorage.getItem('api_mode') || 'direct'
}

const currentMode = ref(getCurrentMode())
const currentBaseURL = computed(() => apiModes[currentMode.value])

// 切换模式
const switchToMode = (mode) => {
  localStorage.setItem('api_mode', mode)
  currentMode.value = mode
  modeChanged.value = true
  ElMessage.success(`已切换到 ${mode.toUpperCase()} 模式`)
}

// 刷新页面
const reloadPage = () => {
  window.location.reload()
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
  if (currentMode.value !== 'gost') {
    ElMessage.warning('请先切换到 GOST 模式')
    return
  }

  testing.value = true
  const startTime = new Date()

  try {
    const token = localStorage.getItem('token')

    // 🚀 通过 GOST 代理端口 6443 发送测试请求
    // 关键：需要先获取当前用户信息，确保 GOST 能正确识别用户
    const userResponse = await fetch(`${apiModes.direct}/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!userResponse.ok) {
      const errorText = await userResponse.text()
      console.error(`❌ 获取用户信息失败: ${userResponse.status} ${userResponse.statusText}`)
      console.error(`❌ 错误内容:`, errorText)
      throw new Error(`无法获取用户信息: ${userResponse.status} ${userResponse.statusText}`)
    }

    const currentUser = await userResponse.json()

    console.log(`🧪 当前用户: ${currentUser.username} (ID: ${currentUser.id})`)

    // 通过 GOST 代理发送请求，添加用户标识
    const proxyUrl = `http://localhost:6443/api/test/traffic-custom?size=${size}`

    console.log(`🧪 发送测试请求: ${proxyUrl}`)

    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Test-Mode': 'gost-proxy',
        'X-User-ID': currentUser.id.toString(),
        'X-Username': currentUser.username,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      },
      // 添加超时设置
      signal: AbortSignal.timeout(30000) // 30秒超时
    })

    console.log(`📡 响应状态: ${response.status} ${response.statusText}`)
    console.log(`📡 响应头:`, Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ 请求失败: ${response.status} ${response.statusText}`)
      console.error(`❌ 错误内容:`, errorText)
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`)
    }

    const data = await response.blob()
    const actualSize = (data.size / (1024 * 1024)).toFixed(2)
    const duration = Date.now() - startTime.getTime()

    console.log(`✅ 请求成功: 大小=${actualSize}MB, 耗时=${duration}ms`)

    testResults.value.unshift({
      time: startTime.toLocaleTimeString(),
      size: `${size}MB`,
      status: 'success',
      result: `实际: ${actualSize}MB, 耗时: ${duration}ms, 通过端口: 6443`
    })

    ElMessage.success(`测试成功: ${actualSize}MB (通过 GOST 端口 6443)`)

  } catch (error) {
    console.error('🔥 测试失败:', error)
    testResults.value.unshift({
      time: startTime.toLocaleTimeString(),
      size: `${size}MB`,
      status: 'failed',
      result: error.message
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
onMounted(() => {
  console.log('🧪 简化测试面板已加载')
  console.log('当前模式:', currentMode.value)
  console.log('当前地址:', currentBaseURL.value)
})
</script>

<style scoped>
.simple-test-panel {
  padding: 20px;
  max-width: 1000px;
  margin: 0 auto;
}

.mode-section {
  text-align: center;
}

.mode-buttons {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin: 20px 0;
}

.mode-buttons .el-button {
  height: 60px;
  white-space: normal;
  padding: 10px 20px;
}

.traffic-section {
  text-align: center;
}

.test-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 20px 0;
}

.quick-tests {
  display: flex;
  gap: 10px;
  justify-content: center;
}

@media (max-width: 768px) {
  .mode-buttons {
    flex-direction: column;
    align-items: center;
  }
  
  .test-controls {
    flex-direction: column;
    gap: 10px;
  }
  
  .quick-tests {
    flex-direction: column;
    align-items: center;
  }
}
</style>
