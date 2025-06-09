<template>
  <div class="user-forward-rules">
    <div class="header">
      <h2>{{ pageTitle }}</h2>
      <div class="header-actions">
        <el-button 
          type="primary" 
          @click="showCreateDialog = true"
          :disabled="userExpired"
        >
          <el-icon><Plus /></el-icon>
          添加规则
        </el-button>
        <el-button 
          type="danger" 
          @click="batchDelete"
          :disabled="selectedRules.length === 0"
        >
          <el-icon><Delete /></el-icon>
          批量删除
        </el-button>
        <el-button @click="loadRules">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <!-- 用户信息卡片（单用户模式） -->
    <el-card class="user-info-card" v-if="userInfo && !showGroupedView">
      <div class="user-info">
        <div class="info-item">
          <span class="label">用户名:</span>
          <span class="value">{{ userInfo.username }}</span>
        </div>
        <div class="info-item">
          <span class="label">端口范围:</span>
          <span class="value">
            {{ userInfo.portRangeStart && userInfo.portRangeEnd 
                ? `${userInfo.portRangeStart}-${userInfo.portRangeEnd}` 
                : '未设置' }}
          </span>
        </div>
        <div class="info-item" v-if="!isAdmin">
          <span class="label">过期时间:</span>
          <span class="value" :class="{ 'expired': userInfo.isExpired }">
            {{ userInfo.expiryDate 
                ? new Date(userInfo.expiryDate).toLocaleDateString() 
                : '永不过期' }}
            <el-tag v-if="userInfo.isExpired" type="danger" size="small">已过期</el-tag>
          </span>
        </div>
      </div>
    </el-card>

    <!-- 过期提示 -->
    <el-alert
      v-if="userExpired"
      title="用户已过期"
      type="warning"
      description="您的账户已过期，无法创建或修改转发规则。请联系管理员续期。"
      show-icon
      :closable="false"
      style="margin-bottom: 20px;"
    />

    <!-- 规则列表 -->
    <div v-if="showGroupedView">
      <!-- 分组显示（admin直接访问规则管理时） -->
      <div v-for="group in groupedRules" :key="group.userId" class="user-group">
        <div class="group-header">
          <h3>{{ group.username }} ({{ group.rules.length }}个规则)</h3>
          <div class="group-info">
            <span>端口范围: {{ group.portRange }}</span>
            <span v-if="group.isExpired" class="expired-tag">已过期</span>
          </div>
        </div>
        <el-table
          :data="group.rules"
          v-loading="loading"
          @selection-change="(selection) => handleGroupSelectionChange(selection, group.userId)"
          style="width: 100%; margin-bottom: 20px;"
        >
          <el-table-column type="selection" width="55" />
          <el-table-column prop="name" label="规则名称" min-width="120" />
          <el-table-column prop="sourcePort" label="源端口" width="100" />
          <el-table-column prop="targetAddress" label="目标地址" min-width="180" />
          <el-table-column prop="protocol" label="协议" width="80">
            <template #default="{ row }">
              <el-tag :type="getProtocolType(row.protocol)">{{ row.protocol.toUpperCase() }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="isActive" label="状态" width="80">
            <template #default="{ row }">
              <el-switch
                v-model="row.isActive"
                @change="toggleRule(row)"
                :disabled="group.isExpired"
              />
            </template>
          </el-table-column>
          <el-table-column label="流量统计 (双向)" width="140">
            <template #default="{ row }">
              <div v-if="row.trafficStats" class="traffic-stats">
                <div class="traffic-value">
                  <el-tooltip content="上行+下行总流量" placement="top">
                    <span>{{ formatTraffic(row.trafficStats.totalBytes || 0) }}</span>
                  </el-tooltip>
                </div>
                <div class="traffic-detail">
                  <el-tooltip content="上行流量 (客户端→服务器)" placement="top">
                    <span class="upload">↑{{ formatTraffic(row.trafficStats.inputBytes || 0) }}</span>
                  </el-tooltip>
                  <el-tooltip content="下行流量 (服务器→客户端)" placement="top">
                    <span class="download">↓{{ formatTraffic(row.trafficStats.outputBytes || 0) }}</span>
                  </el-tooltip>
                </div>
              </div>
              <span v-else class="text-muted">无数据</span>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="160">
            <template #default="{ row }">
              {{ new Date(row.createdAt).toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <el-button 
                type="primary" 
                size="small" 
                @click="editRule(row)"
                :disabled="group.isExpired"
              >
                编辑
              </el-button>
              <el-button 
                type="danger" 
                size="small" 
                @click="deleteRule(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
    
    <div v-else>
      <!-- 单用户显示（普通用户或从用户管理跳转） -->
      <el-table
        :data="rules"
        v-loading="loading"
        @selection-change="handleSelectionChange"
        style="width: 100%"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="name" label="规则名称" min-width="120" />
        <el-table-column prop="sourcePort" label="源端口" width="100" />
        <el-table-column prop="targetAddress" label="目标地址" min-width="180" />
        <el-table-column prop="protocol" label="协议" width="80">
          <template #default="{ row }">
            <el-tag :type="getProtocolType(row.protocol)">{{ row.protocol.toUpperCase() }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="isActive" label="状态" width="80">
          <template #default="{ row }">
            <el-switch
              v-model="row.isActive"
              @change="toggleRule(row)"
              :disabled="userExpired"
            />
          </template>
        </el-table-column>
        <el-table-column label="流量统计 (双向)" width="140">
          <template #default="{ row }">
            <div v-if="row.trafficStats" class="traffic-stats">
              <div class="traffic-value">
                <el-tooltip content="上行+下行总流量" placement="top">
                  <span>{{ formatTraffic(row.trafficStats.totalBytes || 0) }}</span>
                </el-tooltip>
              </div>
              <div class="traffic-detail">
                <el-tooltip content="上行流量 (客户端→服务器)" placement="top">
                  <span class="upload">↑{{ formatTraffic(row.trafficStats.inputBytes || 0) }}</span>
                </el-tooltip>
                <el-tooltip content="下行流量 (服务器→客户端)" placement="top">
                  <span class="download">↓{{ formatTraffic(row.trafficStats.outputBytes || 0) }}</span>
                </el-tooltip>
              </div>
            </div>
            <span v-else class="text-muted">无数据</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">
            {{ new Date(row.createdAt).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button 
              type="primary" 
              size="small" 
              @click="editRule(row)"
              :disabled="userExpired && !isAdmin"
            >
              编辑
            </el-button>
            <el-button 
              type="danger" 
              size="small" 
              @click="deleteRule(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 创建/编辑规则对话框 -->
    <el-dialog
      :title="editingRule ? '编辑规则' : '创建规则'"
      v-model="showCreateDialog"
      width="600px"
      @close="resetForm"
    >
      <el-form
        ref="ruleFormRef"
        :model="ruleForm"
        :rules="ruleRules"
        label-width="100px"
      >
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="ruleForm.name" placeholder="请输入规则名称" />
        </el-form-item>
        
        <el-form-item label="源端口" prop="sourcePort">
          <el-input-number
            v-model="ruleForm.sourcePort"
            :min="currentUserPortRange.start || 1"
            :max="currentUserPortRange.end || 65535"
            placeholder="请输入源端口"
            style="width: 100%"
          />
          <div class="form-tip" v-if="currentUserPortRange.start && currentUserPortRange.end">
            可用端口范围: {{ currentUserPortRange.start }}-{{ currentUserPortRange.end }}
          </div>
        </el-form-item>
        
        <el-form-item label="目标地址" prop="targetAddress">
          <el-input
            v-model="ruleForm.targetAddress"
            placeholder="例如: 192.168.1.1:8080 或 [::1]:8080 或 example.com:80"
            @blur="validateTargetAddress"
          />
          <div class="form-tip">
            支持 IPv4:端口、[IPv6]:端口 或 域名:端口 格式<br>
            内网地址端口受限制，公网地址端口自由
          </div>
        </el-form-item>
        
        <el-form-item label="协议" prop="protocol">
          <el-select v-model="ruleForm.protocol" style="width: 100%">
            <el-option label="TCP" value="tcp" />
            <el-option label="UDP" value="udp" />
            <el-option label="TLS" value="tls" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="ruleForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入规则描述（可选）"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="saveRule" :loading="saving">
          {{ editingRule ? '更新' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from 'vuex'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Delete, Refresh } from '@element-plus/icons-vue'
import api from '@/utils/api'

export default {
  name: 'UserForwardRules',
  components: {
    Plus,
    Delete,
    Refresh
  },
  setup() {
    const route = useRoute()
    const store = useStore()
    const loading = ref(false)
    const saving = ref(false)
    const rules = ref([])
    const selectedRules = ref([])
    const groupedRules = ref([])
    const showCreateDialog = ref(false)
    const editingRule = ref(null)
    const userInfo = ref(null)
    const ruleFormRef = ref(null)

    // 当前用户信息
    const currentUser = computed(() => store.getters['user/currentUser'])
    const isAdmin = computed(() => store.getters['user/isAdmin'])
    
    // 目标用户ID（管理员查看其他用户时使用）
    const targetUserId = computed(() => {
      return isAdmin.value ? route.query.userId : currentUser.value?.id
    })

    // 是否显示分组视图（admin直接访问规则管理且没有指定userId）
    const showGroupedView = computed(() => {
      return isAdmin.value && !route.query.userId
    })

    // 页面标题
    const pageTitle = computed(() => {
      if (isAdmin.value && route.query.userId) {
        return `规则管理 - ${userInfo.value?.username || '用户'}`
      } else if (showGroupedView.value) {
        return '规则管理 - 所有用户'
      }
      return '规则管理'
    })

    // 当前用户端口范围
    const currentUserPortRange = computed(() => {
      if (showGroupedView.value) {
        return { start: 1, end: 65535 } // admin创建规则时不限制
      }
      return {
        start: userInfo.value?.portRangeStart || 1,
        end: userInfo.value?.portRangeEnd || 65535
      }
    })

    const ruleForm = reactive({
      name: '',
      sourcePort: null,
      targetAddress: '',
      protocol: 'tcp',
      description: ''
    })

    const userExpired = computed(() => {
      return !isAdmin.value && (userInfo.value?.isExpired || false)
    })

    // 验证目标地址
    const validateTargetAddress = () => {
      if (!ruleForm.targetAddress) return

      // 基本格式验证
      const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/
      const ipv6Pattern = /^\[([0-9a-fA-F:]+)\]:\d{1,5}$/
      const domainPattern = /^[a-zA-Z0-9.-]+:\d{1,5}$/

      if (!ipv4Pattern.test(ruleForm.targetAddress) && 
          !ipv6Pattern.test(ruleForm.targetAddress) && 
          !domainPattern.test(ruleForm.targetAddress)) {
        ElMessage.warning('目标地址格式不正确')
        return
      }

      // 检查内网地址端口限制
      const [address, port] = ruleForm.targetAddress.includes('[') 
        ? [ruleForm.targetAddress.split(']:')[0] + ']', ruleForm.targetAddress.split(']:')[1]]
        : ruleForm.targetAddress.split(':')

      const isPrivateIP = checkPrivateIP(address)
      if (isPrivateIP && userInfo.value) {
        const portNum = parseInt(port)
        if (portNum < userInfo.value.portRangeStart || portNum > userInfo.value.portRangeEnd) {
          ElMessage.warning(`内网地址端口必须在您的端口范围内 (${userInfo.value.portRangeStart}-${userInfo.value.portRangeEnd})`)
        }
      }
    }

    // 检查是否为内网IP
    const checkPrivateIP = (address) => {
      // 移除IPv6的方括号
      const ip = address.replace(/[\\[\\]]/g, '')
      
      // IPv4内网地址
      if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
        const parts = ip.split('.').map(Number)
        return (
          parts[0] === 10 ||
          (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
          (parts[0] === 192 && parts[1] === 168) ||
          parts[0] === 127 ||
          ip === 'localhost'
        )
      }
      
      // IPv6内网地址
      if (ip.includes(':')) {
        return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd')
      }
      
      // 域名检查
      if (ip === 'localhost') {
        return true
      }
      
      return false
    }

    const ruleRules = {
      name: [
        { required: true, message: '请输入规则名称', trigger: 'blur' },
        { min: 1, max: 100, message: '规则名称长度在 1 到 100 个字符', trigger: 'blur' }
      ],
      sourcePort: [
        { required: true, message: '请输入源端口', trigger: 'blur' },
        { type: 'number', min: 1, max: 65535, message: '端口范围在 1-65535', trigger: 'blur' }
      ],
      targetAddress: [
        { required: true, message: '请输入目标地址', trigger: 'blur' },
        {
          validator: (rule, value, callback) => {
            if (!value) {
              callback(new Error('请输入目标地址'))
              return
            }
            
            const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/
            const ipv6Pattern = /^\[([0-9a-fA-F:]+)\]:\d{1,5}$/
            const domainPattern = /^[a-zA-Z0-9.-]+:\d{1,5}$/
            
            if (!ipv4Pattern.test(value) && !ipv6Pattern.test(value) && !domainPattern.test(value)) {
              callback(new Error('请输入正确的地址格式'))
              return
            }
            
            callback()
          },
          trigger: 'blur'
        }
      ],
      protocol: [
        { required: true, message: '请选择协议', trigger: 'change' }
      ]
    }

    const loadRules = async () => {
      loading.value = true
      try {
        const params = targetUserId.value ? { userId: targetUserId.value } : {}
        const response = await api.get('/user-forward-rules', { params })
        
        if (showGroupedView.value) {
          // 分组显示
          groupedRules.value = response.data.groupedRules || []
          rules.value = []
        } else {
          // 单用户显示
          rules.value = response.data.rules
          userInfo.value = response.data.user
          groupedRules.value = []
        }
        
        if (response.data.cleanedCount > 0) {
          ElMessage.warning(`清理了 ${response.data.cleanedCount} 个重复端口规则`)
        }
      } catch (error) {
        ElMessage.error('获取规则列表失败: ' + (error.response?.data?.message || error.message))
      } finally {
        loading.value = false
      }
    }

    const saveRule = async () => {
      if (!ruleFormRef.value) return
      
      try {
        await ruleFormRef.value.validate()
      } catch {
        return
      }

      saving.value = true
      try {
        const data = { ...ruleForm }
        if (isAdmin.value && targetUserId.value) {
          data.userId = targetUserId.value
        }

        if (editingRule.value) {
          await api.put(`/user-forward-rules/${editingRule.value.id}`, data)
          ElMessage.success('规则更新成功')
        } else {
          await api.post('/user-forward-rules', data)
          ElMessage.success('规则创建成功')
        }
        
        showCreateDialog.value = false
        await loadRules()
      } catch (error) {
        ElMessage.error('保存规则失败: ' + (error.response?.data?.message || error.message))
      } finally {
        saving.value = false
      }
    }

    const editRule = (rule) => {
      editingRule.value = rule
      Object.assign(ruleForm, {
        name: rule.name,
        sourcePort: rule.sourcePort,
        targetAddress: rule.targetAddress,
        protocol: rule.protocol,
        description: rule.description || ''
      })
      showCreateDialog.value = true
    }

    const deleteRule = async (rule) => {
      try {
        await ElMessageBox.confirm(
          `确定要删除规则 "${rule.name}" 吗？`,
          '确认删除',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        await api.delete(`/user-forward-rules/${rule.id}`)
        ElMessage.success('规则删除成功')
        await loadRules()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除规则失败: ' + (error.response?.data?.message || error.message))
        }
      }
    }

    const toggleRule = async (rule) => {
      try {
        await api.post(`/user-forward-rules/${rule.id}/toggle`)
        ElMessage.success(`规则已${rule.isActive ? '启用' : '禁用'}`)
      } catch (error) {
        rule.isActive = !rule.isActive // 回滚状态
        ElMessage.error('切换规则状态失败: ' + (error.response?.data?.message || error.message))
      }
    }

    const batchDelete = async () => {
      if (selectedRules.value.length === 0) return
      
      try {
        await ElMessageBox.confirm(
          `确定要删除选中的 ${selectedRules.value.length} 个规则吗？`,
          '确认批量删除',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        const ids = selectedRules.value.map(rule => rule.id)
        await api.post('/user-forward-rules/batch-delete', { ids })
        ElMessage.success('批量删除成功')
        await loadRules()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('批量删除失败: ' + (error.response?.data?.message || error.message))
        }
      }
    }

    const handleSelectionChange = (selection) => {
      selectedRules.value = selection
    }

    const handleGroupSelectionChange = (selection, userId) => {
      // 处理分组选择变化
      selectedRules.value = [...selectedRules.value.filter(rule => rule.userId !== userId), ...selection]
    }

    const resetForm = () => {
      editingRule.value = null
      Object.assign(ruleForm, {
        name: '',
        sourcePort: null,
        targetAddress: '',
        protocol: 'tcp',
        description: ''
      })
      if (ruleFormRef.value) {
        ruleFormRef.value.clearValidate()
      }
    }

    const getProtocolType = (protocol) => {
      const types = {
        tcp: 'primary',
        udp: 'success',
        tls: 'warning'
      }
      return types[protocol] || 'info'
    }

    // 格式化流量显示
    const formatTraffic = (bytes) => {
      if (!bytes || bytes === 0) return '0B'

      const units = ['B', 'KB', 'MB', 'GB', 'TB']
      let size = bytes
      let unitIndex = 0

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex++
      }

      return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`
    }

    // 监听路由变化
    watch(() => route.query.userId, () => {
      loadRules()
    })

    onMounted(() => {
      loadRules()
    })

    return {
      loading,
      saving,
      rules,
      selectedRules,
      groupedRules,
      showCreateDialog,
      editingRule,
      userInfo,
      userExpired,
      isAdmin,
      showGroupedView,
      pageTitle,
      currentUserPortRange,
      ruleForm,
      ruleRules,
      ruleFormRef,
      loadRules,
      saveRule,
      editRule,
      deleteRule,
      toggleRule,
      batchDelete,
      handleSelectionChange,
      handleGroupSelectionChange,
      resetForm,
      getProtocolType,
      validateTargetAddress,
      formatTraffic
    }
  }
}
</script>

<style scoped>
.user-forward-rules {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  color: #303133;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.user-info-card {
  margin-bottom: 20px;
}

.user-info {
  display: flex;
  gap: 30px;
  flex-wrap: wrap;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-item .label {
  font-weight: 500;
  color: #606266;
}

.info-item .value {
  color: #303133;
}

.info-item .value.expired {
  color: #F56C6C;
}

.user-group {
  margin-bottom: 30px;
  border: 1px solid #EBEEF5;
  border-radius: 4px;
  overflow: hidden;
}

.group-header {
  background: #F5F7FA;
  padding: 15px 20px;
  border-bottom: 1px solid #EBEEF5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.group-header h3 {
  margin: 0;
  color: #303133;
  font-size: 16px;
}

.group-info {
  display: flex;
  gap: 15px;
  align-items: center;
  font-size: 14px;
  color: #606266;
}

.expired-tag {
  color: #F56C6C;
  font-weight: 500;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.traffic-stats {
  text-align: center;
}

.traffic-value {
  font-weight: bold;
  color: #409eff;
  font-size: 13px;
}

.traffic-detail {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
  display: flex;
  gap: 8px;
  justify-content: center;
}

.traffic-detail .upload {
  color: #f56c6c;
}

.traffic-detail .download {
  color: #67c23a;
}

.text-muted {
  color: #909399;
  font-size: 12px;
}

.traffic-type {
  margin-top: 4px;
  text-align: center;
}
</style>
