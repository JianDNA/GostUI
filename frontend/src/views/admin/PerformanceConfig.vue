<template>
  <div class="performance-config">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1>🎛️ 性能配置管理</h1>
      <p class="description">管理GOST系统的性能参数和运行模式</p>
    </div>

    <!-- 系统模式切换 -->
    <el-card class="mode-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>🔧 系统运行模式</span>
          <el-tag :type="currentMode === 'simple' ? 'danger' : 'success'">
            {{ currentMode === 'simple' ? '单机模式' : '自动模式' }}
          </el-tag>
        </div>
      </template>
      
      <div class="mode-content">
        <div class="mode-description">
          <div v-if="currentMode === 'simple'" class="simple-mode-info">
            <el-alert
              title="单机模式已启用"
              type="warning"
              description="所有自动化功能已禁用，需要手动重启GOST服务来同步配置"
              show-icon
              :closable="false"
            />
            <div class="manual-sync-section">
              <el-button 
                type="primary" 
                size="large"
                :loading="manualSyncLoading"
                @click="handleManualSync"
              >
                <i class="el-icon-refresh"></i>
                手动同步GOST配置
              </el-button>
              <p class="sync-tip">点击此按钮将重新生成GOST配置并重启服务</p>
            </div>
          </div>
          
          <div v-else class="auto-mode-info">
            <el-alert
              title="自动模式已启用"
              type="success"
              description="所有自动化功能正常运行，配置变更将自动同步"
              show-icon
              :closable="false"
            />
          </div>
        </div>
        
        <div class="mode-switch">
          <el-switch
            v-model="isSimpleMode"
            active-text="单机模式"
            inactive-text="自动模式"
            active-color="#f56c6c"
            inactive-color="#67c23a"
            :loading="modeSwitchLoading"
            @change="handleModeSwitch"
          />
        </div>
      </div>
    </el-card>

    <!-- 预设配置 - 只在自动模式下显示 -->
    <el-card v-if="!isSimpleMode" class="preset-card" shadow="hover">
      <template #header>
        <span>🎯 性能预设配置</span>
      </template>

      <div class="preset-buttons">
        <el-button
          v-for="(preset, key) in presets"
          :key="key"
          :type="getPresetButtonType(key)"
          :loading="presetLoading === key"
          @click="applyPreset(key)"
        >
          {{ preset.name }}
        </el-button>
      </div>

      <div class="preset-descriptions">
        <div v-for="(preset, key) in presets" :key="key" class="preset-item">
          <h4>{{ preset.name }}</h4>
          <p>{{ preset.description }}</p>
        </div>
      </div>

      <el-alert
        title="提示"
        type="info"
        description="性能预设会覆盖当前的详细配置参数，应用后可以在下方详细配置中进一步调整"
        show-icon
        :closable="false"
        style="margin-top: 15px;"
      />
    </el-card>

    <!-- 协议屏蔽配置 -->
    <el-card class="protocol-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>🚫 协议屏蔽配置</span>
          <el-button type="primary" size="small" @click="saveProtocolConfig" :loading="protocolSaveLoading">
            保存配置
          </el-button>
        </div>
      </template>
      
      <div class="protocol-content">
        <p class="section-desc">选择需要禁用的转发协议，被禁用的协议将无法创建新规则或转发流量</p>
        
        <div class="protocol-checkboxes">
          <el-checkbox-group v-model="disabledProtocols">
            <el-checkbox label="socks">SOCKS 协议</el-checkbox>
            <el-checkbox label="http">HTTP 协议</el-checkbox>
            <el-checkbox label="tls">TLS 协议</el-checkbox>
          </el-checkbox-group>
        </div>
        
        <el-alert
          v-if="disabledProtocols.length > 0"
          title="警告：禁用协议将立即生效"
          type="warning"
          description="禁用协议后，所有使用该协议的转发规则将停止工作，直到重新启用该协议"
          show-icon
          :closable="false"
          style="margin-top: 15px;"
        />
      </div>
    </el-card>

    <!-- 详细配置 -->
    <el-card v-if="!isSimpleMode" class="config-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>⚙️ 详细配置参数</span>
          <el-button type="primary" size="small" @click="saveConfig" :loading="saveLoading">
            保存配置
          </el-button>
        </div>
      </template>
      
      <el-tabs v-model="activeTab" type="border-card">
        <!-- GOST插件配置 -->
        <el-tab-pane label="🔌 GOST插件" name="plugins">
          <div class="config-section">
            <h3>插件超时配置</h3>
            <p class="section-desc">控制GOST插件的响应超时时间，直接影响转发性能</p>
            
            <el-row :gutter="20">
              <el-col :span="8">
                <div class="config-item">
                  <label>认证器超时 (秒)</label>
                  <el-input-number
                    v-model="configForm.gostPlugins.authTimeout"
                    :min="1"
                    :max="60"
                    size="small"
                  />
                  <p class="param-help">{{ getParamHelp('gostPlugins', 'authTimeout') }}</p>
                </div>
              </el-col>
              
              <el-col :span="8">
                <div class="config-item">
                  <label>观察器超时 (秒)</label>
                  <el-input-number
                    v-model="configForm.gostPlugins.observerTimeout"
                    :min="1"
                    :max="60"
                    size="small"
                  />
                  <p class="param-help">{{ getParamHelp('gostPlugins', 'observerTimeout') }}</p>
                </div>
              </el-col>
            </el-row>

            <el-row :gutter="20" style="margin-top: 20px;">
              <el-col :span="8">
                <div class="config-item">
                  <label>观察器周期 (秒)</label>
                  <el-input-number
                    v-model="observerPeriodSeconds"
                    :min="5"
                    :max="300"
                    size="small"
                    @change="updateObserverPeriod"
                  />
                  <p class="param-help">GOST观察器报告流量统计的周期，影响流量统计的实时性</p>
                </div>
              </el-col>
              
              <el-col :span="8">
                <div class="config-item">
                  <label>限制器超时 (秒)</label>
                  <el-input-number
                    v-model="configForm.gostPlugins.limiterTimeout"
                    :min="1"
                    :max="60"
                    size="small"
                  />
                  <p class="param-help">{{ getParamHelp('gostPlugins', 'limiterTimeout') }}</p>
                </div>
              </el-col>
            </el-row>
          </div>
        </el-tab-pane>

        <!-- 缓存配置 -->
        <el-tab-pane label="💾 缓存配置" name="cache">
          <div class="config-section">
            <h3>缓存超时配置</h3>
            <p class="section-desc">控制各种缓存的生存时间，影响查询性能和实时性</p>
            
            <el-row :gutter="20">
              <el-col :span="8">
                <div class="config-item">
                  <label>认证器缓存 (分钟)</label>
                  <el-input-number
                    v-model="authCacheMinutes"
                    :min="1"
                    :max="60"
                    size="small"
                    @change="updateAuthCacheTimeout"
                  />
                  <p class="param-help">{{ getParamHelp('cacheConfig', 'authCacheTimeout') }}</p>
                </div>
              </el-col>
              
              <el-col :span="8">
                <div class="config-item">
                  <label>限制器缓存 (分钟)</label>
                  <el-input-number
                    v-model="limiterCacheMinutes"
                    :min="0.5"
                    :max="30"
                    :step="0.5"
                    size="small"
                    @change="updateLimiterCacheTimeout"
                  />
                  <p class="param-help">{{ getParamHelp('cacheConfig', 'limiterCacheTimeout') }}</p>
                </div>
              </el-col>
              
              <el-col :span="8">
                <div class="config-item">
                  <label>多实例缓存 (分钟)</label>
                  <el-input-number
                    v-model="multiInstanceCacheMinutes"
                    :min="0.5"
                    :max="10"
                    :step="0.5"
                    size="small"
                    @change="updateMultiInstanceCacheTTL"
                  />
                  <p class="param-help">多实例缓存的生存时间</p>
                </div>
              </el-col>
            </el-row>
          </div>
        </el-tab-pane>

        <!-- 同步配置 -->
        <el-tab-pane label="🔄 同步配置" name="sync">
          <div class="config-section">
            <h3>同步频率配置</h3>
            <p class="section-desc">控制各种自动同步的频率，影响系统响应速度和资源消耗</p>
            
            <el-row :gutter="20">
              <el-col :span="12">
                <div class="config-item">
                  <label>自动同步间隔 (分钟)</label>
                  <el-input-number
                    v-model="autoSyncMinutes"
                    :min="1"
                    :max="60"
                    size="small"
                    @change="updateAutoSyncInterval"
                  />
                  <p class="param-help">{{ getParamHelp('syncConfig', 'autoSyncInterval') }}</p>
                </div>
              </el-col>
              
              <el-col :span="12">
                <div class="config-item">
                  <label>健康检查间隔 (分钟)</label>
                  <el-input-number
                    v-model="healthCheckMinutes"
                    :min="0.5"
                    :max="10"
                    :step="0.5"
                    size="small"
                    @change="updateHealthCheckInterval"
                  />
                  <p class="param-help">{{ getParamHelp('syncConfig', 'healthCheckInterval') }}</p>
                </div>
              </el-col>
            </el-row>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 系统状态 -->
    <el-card class="status-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span>📊 系统状态</span>
          <el-button size="small" @click="refreshStatus" :loading="statusLoading">
            刷新状态
          </el-button>
        </div>
      </template>
      
      <div class="status-content">
        <el-row :gutter="20">
          <el-col :span="8">
            <div class="status-item">
              <h4>🎛️ 运行模式</h4>
              <el-tag :type="systemStatus.mode?.isSimpleMode ? 'danger' : 'success'">
                {{ systemStatus.mode?.isSimpleMode ? '单机模式' : '自动模式' }}
              </el-tag>
            </div>
          </el-col>
          
          <el-col :span="8">
            <div class="status-item">
              <h4>🚀 GOST服务</h4>
              <el-tag :type="systemStatus.services?.gost?.isRunning ? 'success' : 'danger'">
                {{ systemStatus.services?.gost?.isRunning ? '运行中' : '已停止' }}
              </el-tag>
            </div>
          </el-col>
          
          <el-col :span="8">
            <div class="status-item">
              <h4>🔧 配置版本</h4>
              <span>v{{ systemStatus.config?.configVersion || 0 }}</span>
            </div>
          </el-col>
        </el-row>
        
        <div v-if="systemStatus.config?.lastUpdated" class="last-updated">
          <p>最后更新: {{ formatTime(systemStatus.config.lastUpdated) }}</p>
          <p>更新者: {{ systemStatus.config.lastUpdatedBy || '未知' }}</p>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script>
import { ref, reactive, onMounted, computed } from 'vue'
import { useStore } from 'vuex'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/utils/api'

export default {
  name: 'PerformanceConfig',
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
    // 响应式数据
    const loading = ref(false)
    const saveLoading = ref(false)
    const statusLoading = ref(false)
    const modeSwitchLoading = ref(false)
    const manualSyncLoading = ref(false)
    const presetLoading = ref('')
    const protocolSaveLoading = ref(false)
    const activeTab = ref('plugins')
    
    // 禁用协议配置
    const disabledProtocols = ref([])
    
    // 配置数据
    const config = ref({})
    const configForm = reactive({
      systemMode: { isSimpleMode: false },
      gostPlugins: {
        authTimeout: 5,
        observerTimeout: 10,
        limiterTimeout: 5
      },
      cacheConfig: {
        authCacheTimeout: 600000,
        limiterCacheTimeout: 300000,
        multiInstanceCacheTTL: 120000
      },
      syncConfig: {
        autoSyncInterval: 300000,
        healthCheckInterval: 120000
      },
      observerPeriod: 120
    })
    
    // 系统状态
    const systemStatus = ref({})
    const presets = ref({})
    const parameterHelp = ref({})
    
    // 计算属性
    const isSimpleMode = computed({
      get: () => configForm.systemMode.isSimpleMode,
      set: (value) => {
        configForm.systemMode.isSimpleMode = value
      }
    })
    
    const currentMode = computed(() => {
      return isSimpleMode.value ? 'simple' : 'auto'
    })
    
    // 缓存时间转换 (毫秒 <-> 分钟)
    const authCacheMinutes = computed({
      get: () => Math.round(configForm.cacheConfig.authCacheTimeout / 60000),
      set: (value) => {
        configForm.cacheConfig.authCacheTimeout = value * 60000
      }
    })
    
    const limiterCacheMinutes = computed({
      get: () => configForm.cacheConfig.limiterCacheTimeout / 60000,
      set: (value) => {
        configForm.cacheConfig.limiterCacheTimeout = value * 60000
      }
    })
    
    const multiInstanceCacheMinutes = computed({
      get: () => configForm.cacheConfig.multiInstanceCacheTTL / 60000,
      set: (value) => {
        configForm.cacheConfig.multiInstanceCacheTTL = value * 60000
      }
    })
    
    const autoSyncMinutes = computed({
      get: () => configForm.syncConfig.autoSyncInterval / 60000,
      set: (value) => {
        configForm.syncConfig.autoSyncInterval = value * 60000
      }
    })
    
    const healthCheckMinutes = computed({
      get: () => configForm.syncConfig.healthCheckInterval / 60000,
      set: (value) => {
        configForm.syncConfig.healthCheckInterval = value * 60000
      }
    })

    // 观察器周期 (秒)
    const observerPeriodSeconds = computed({
      get: () => configForm.gostPlugins?.observerPeriod || 120,
      set: (value) => {
        if (!configForm.gostPlugins) {
          configForm.gostPlugins = {}
        }
        configForm.gostPlugins.observerPeriod = value
      }
    })

    // 方法
    const loadConfig = async () => {
      try {
        loading.value = true
        const response = await api.get('/performance-config')

        if (response.data.success) {
          config.value = response.data.data.config
          systemStatus.value = response.data.data.modeStatus

          // 更新表单数据
          Object.assign(configForm, response.data.data.config)
        }
        
        // 加载禁用协议配置
        await loadProtocolConfig()
      } catch (error) {
        ElMessage.error('加载配置失败: ' + error.message)
      } finally {
        loading.value = false
      }
    }
    
    // 加载禁用协议配置
    const loadProtocolConfig = async () => {
      try {
        const response = await api.get('/system-config/disabledProtocols')
        if (response.data.success && response.data.data) {
          disabledProtocols.value = response.data.data.value || []
        }
      } catch (error) {
        console.warn('加载禁用协议配置失败:', error)
        disabledProtocols.value = [] // 默认不禁用任何协议
      }
    }
    
    // 保存禁用协议配置
    const saveProtocolConfig = async () => {
      try {
        protocolSaveLoading.value = true
        
        const response = await api.put('/system-config/disabledProtocols', {
          value: disabledProtocols.value,
          description: '管理员更新禁用协议配置',
          category: 'security'
        })
        
        if (response.data.success) {
          ElMessage.success('协议屏蔽配置保存成功')
          await loadProtocolConfig() // 重新加载确认更新
        }
      } catch (error) {
        ElMessage.error('保存协议屏蔽配置失败: ' + error.message)
      } finally {
        protocolSaveLoading.value = false
      }
    }

    const loadHelp = async () => {
      try {
        const response = await api.get('/performance-config/help')
        if (response.data.success) {
          presets.value = response.data.data.presets || {}
          parameterHelp.value = response.data.data.parameterHelp || {}
        }
      } catch (error) {
        console.warn('加载帮助信息失败:', error)
      }
    }

    const refreshStatus = async () => {
      try {
        statusLoading.value = true
        const response = await api.get('/performance-config/status')

        if (response.data.success) {
          systemStatus.value = response.data.data
        }
      } catch (error) {
        ElMessage.error('刷新状态失败: ' + error.message)
      } finally {
        statusLoading.value = false
      }
    }

    const saveConfig = async () => {
      try {
        saveLoading.value = true

        const response = await api.put('/performance-config', {
          ...configForm,
          description: '管理员更新性能配置'
        })

        if (response.data.success) {
          ElMessage.success('配置保存成功')
          await loadConfig()

          if (response.data.data.modeChanged) {
            ElMessage.info(`系统模式已切换到${response.data.data.newMode === 'simple' ? '单机模式' : '自动模式'}`)
          }
        }
      } catch (error) {
        ElMessage.error('保存配置失败: ' + error.message)
      } finally {
        saveLoading.value = false
      }
    }

    const handleModeSwitch = async (value) => {
      try {
        modeSwitchLoading.value = true

        const result = await ElMessageBox.confirm(
          `确定要切换到${value ? '单机模式' : '自动模式'}吗？\n\n${
            value
              ? '单机模式将禁用所有自动化功能，需要手动同步配置'
              : '自动模式将启用所有自动化功能，配置变更将自动同步'
          }`,
          '确认模式切换',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )

        const response = await api.post('/performance-config/switch-mode', {
          isSimpleMode: value,
          description: `管理员切换到${value ? '单机模式' : '自动模式'}`
        })

        if (response.data.success) {
          ElMessage.success(response.data.message)
          await loadConfig()
          await refreshStatus()
        }
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('切换模式失败: ' + error.message)
        }
        // 恢复开关状态
        configForm.systemMode.isSimpleMode = !value
      } finally {
        modeSwitchLoading.value = false
      }
    }

    const handleManualSync = async () => {
      try {
        manualSyncLoading.value = true

        const result = await ElMessageBox.confirm(
          '确定要手动同步GOST配置吗？\n\n这将重新生成配置文件并重启GOST服务，可能会短暂中断现有连接。',
          '确认手动同步',
          {
            confirmButtonText: '确定同步',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )

        const response = await api.post('/performance-config/manual-sync')

        if (response.data.success) {
          ElMessage.success('GOST配置同步成功')
          await refreshStatus()
        }
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('手动同步失败: ' + error.message)
        }
      } finally {
        manualSyncLoading.value = false
      }
    }

    const applyPreset = async (presetName) => {
      try {
        presetLoading.value = presetName

        // 检查是否为自动模式
        if (isSimpleMode.value) {
          ElMessage.error('性能预设只能在自动模式下应用，请先切换到自动模式')
          return
        }

        const preset = presets.value[presetName]
        const result = await ElMessageBox.confirm(
          `确定要应用"${preset.name}"预设配置吗？\n\n${preset.description}\n\n这将覆盖当前的详细配置参数。`,
          '确认应用预设',
          {
            confirmButtonText: '确定应用',
            cancelButtonText: '取消',
            type: 'info'
          }
        )

        const response = await api.post('/performance-config/apply-preset', {
          presetName,
          description: `应用预设配置: ${preset.name}`
        })

        if (response.data.success) {
          ElMessage.success(`预设配置"${preset.name}"应用成功`)
          await loadConfig()
          await refreshStatus()
        }
      } catch (error) {
        if (error !== 'cancel') {
          const errorMessage = error.response?.data?.message || error.message || '应用预设失败'
          ElMessage.error(errorMessage)
        }
      } finally {
        presetLoading.value = ''
      }
    }

    const getPresetButtonType = (presetName) => {
      if (presetName === 'highPerformance') return 'danger'
      if (presetName === 'balanced') return 'primary'
      if (presetName === 'highAvailability') return 'success'
      return 'default'
    }

    const getParamHelp = (section, param) => {
      return parameterHelp.value[section]?.[param]?.description || ''
    }

    const formatTime = (timeString) => {
      if (!timeString) return '未知'
      return new Date(timeString).toLocaleString('zh-CN')
    }

    // 更新方法
    const updateAuthCacheTimeout = (value) => {
      configForm.cacheConfig.authCacheTimeout = value * 60000
    }

    const updateLimiterCacheTimeout = (value) => {
      configForm.cacheConfig.limiterCacheTimeout = value * 60000
    }

    const updateMultiInstanceCacheTTL = (value) => {
      configForm.cacheConfig.multiInstanceCacheTTL = value * 60000
    }

    const updateAutoSyncInterval = (value) => {
      configForm.syncConfig.autoSyncInterval = value * 60000
    }

    const updateHealthCheckInterval = (value) => {
      configForm.syncConfig.healthCheckInterval = value * 60000
    }

    const updateObserverPeriod = () => {
      // 观察器周期已通过计算属性自动更新
    }

    // 生命周期
    onMounted(async () => {
      await loadConfig()
      await loadHelp()
      await refreshStatus()
    })

    return {
      loading,
      saveLoading,
      statusLoading,
      modeSwitchLoading,
      manualSyncLoading,
      presetLoading,
      protocolSaveLoading,
      activeTab,
      config,
      configForm,
      systemStatus,
      presets,
      parameterHelp,
      isSimpleMode,
      currentMode,
      authCacheMinutes,
      limiterCacheMinutes,
      multiInstanceCacheMinutes,
      autoSyncMinutes,
      healthCheckMinutes,
      observerPeriodSeconds,
      disabledProtocols,
      loadConfig,
      loadProtocolConfig,
      refreshStatus,
      saveConfig,
      saveProtocolConfig,
      handleModeSwitch,
      handleManualSync,
      applyPreset,
      getPresetButtonType,
      getParamHelp,
      formatTime,
      updateAuthCacheTimeout,
      updateLimiterCacheTimeout,
      updateMultiInstanceCacheTTL,
      updateAutoSyncInterval,
      updateHealthCheckInterval,
      updateObserverPeriod
    }
  }
}
</script>

<style scoped>
.performance-config {
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
  font-size: 28px;
}

.page-header .description {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mode-card {
  margin-bottom: 24px;
}

.mode-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
}

.mode-description {
  flex: 1;
}

.simple-mode-info .manual-sync-section {
  margin-top: 16px;
  padding: 16px;
  background: #fdf6ec;
  border-radius: 8px;
  text-align: center;
}

.sync-tip {
  margin: 8px 0 0 0;
  color: #e6a23c;
  font-size: 12px;
}

.mode-switch {
  flex-shrink: 0;
}

.preset-card {
  margin-bottom: 24px;
}

.preset-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.preset-descriptions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.preset-item {
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
  border-left: 4px solid #409eff;
}

.preset-item h4 {
  margin: 0 0 8px 0;
  color: #303133;
}

.preset-item p {
  margin: 0;
  color: #606266;
  font-size: 14px;
}

.protocol-card {
  margin-bottom: 24px;
}

.protocol-content {
  padding: 15px 0;
}

.protocol-checkboxes {
  margin: 15px 0;
}

.config-card {
  margin-bottom: 24px;
}

.config-section {
  padding: 20px 0;
}

.config-section h3 {
  margin: 0 0 8px 0;
  color: #303133;
}

.section-desc {
  margin: 0 0 20px 0;
  color: #909399;
  font-size: 14px;
}

.config-item {
  margin-bottom: 16px;
}

.config-item label {
  display: block;
  margin-bottom: 8px;
  color: #606266;
  font-weight: 500;
}

.param-help {
  margin: 4px 0 0 0;
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
}

.status-card {
  margin-bottom: 24px;
}

.status-content {
  padding: 16px 0;
}

.status-item {
  text-align: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.status-item h4 {
  margin: 0 0 8px 0;
  color: #303133;
  font-size: 14px;
}

.last-updated {
  margin-top: 20px;
  padding: 16px;
  background: #f0f9ff;
  border-radius: 8px;
  text-align: center;
}

.last-updated p {
  margin: 4px 0;
  color: #606266;
  font-size: 14px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .performance-config {
    padding: 16px;
  }

  .mode-content {
    flex-direction: column;
    align-items: stretch;
  }

  .preset-buttons {
    flex-direction: column;
  }

  .preset-descriptions {
    grid-template-columns: 1fr;
  }

  .status-content .el-row {
    flex-direction: column;
  }

  .status-item {
    margin-bottom: 12px;
  }
}

/* 深色模式支持 */
@media (prefers-color-scheme: dark) {
  .preset-item {
    background: #2d2d2d;
    border-left-color: #409eff;
  }

  .status-item {
    background: #2d2d2d;
  }

  .last-updated {
    background: #1e3a5f;
  }

  .simple-mode-info .manual-sync-section {
    background: #3d2f1f;
  }
}
</style>
