<template>
  <div class="user-forward-rules">
    <div class="header">
      <h2>转发规则管理</h2>
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

    <!-- 用户信息卡片 -->
    <el-card class="user-info-card" v-if="userInfo">
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
        <div class="info-item">
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
            :disabled="userExpired"
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
            :min="userInfo?.portRangeStart || 1"
            :max="userInfo?.portRangeEnd || 65535"
            placeholder="请输入源端口"
            style="width: 100%"
          />
          <div class="form-tip" v-if="userInfo?.portRangeStart && userInfo?.portRangeEnd">
            可用端口范围: {{ userInfo.portRangeStart }}-{{ userInfo.portRangeEnd }}
          </div>
        </el-form-item>
        
        <el-form-item label="目标地址" prop="targetAddress">
          <el-input
            v-model="ruleForm.targetAddress"
            placeholder="例如: 192.168.1.1:8080 或 [::1]:8080"
          />
          <div class="form-tip">
            支持 IPv4:端口 或 [IPv6]:端口 格式
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
import { ref, reactive, onMounted, computed } from 'vue'
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
    const loading = ref(false)
    const saving = ref(false)
    const rules = ref([])
    const selectedRules = ref([])
    const showCreateDialog = ref(false)
    const editingRule = ref(null)
    const userInfo = ref(null)
    const ruleFormRef = ref(null)

    const ruleForm = reactive({
      name: '',
      sourcePort: null,
      targetAddress: '',
      protocol: 'tcp',
      description: ''
    })

    const userExpired = computed(() => {
      return userInfo.value?.isExpired || false
    })

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
          pattern: /^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$|^\[([0-9a-fA-F:]+)\]:\d{1,5}$/,
          message: '请输入正确的地址格式，如 192.168.1.1:8080 或 [::1]:8080',
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
        const response = await api.get('/user-forward-rules')
        rules.value = response.data.rules
        userInfo.value = response.data.user
        
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
        if (editingRule.value) {
          await api.put(`/user-forward-rules/${editingRule.value.id}`, ruleForm)
          ElMessage.success('规则更新成功')
        } else {
          await api.post('/user-forward-rules', ruleForm)
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

    onMounted(() => {
      loadRules()
    })

    return {
      loading,
      saving,
      rules,
      selectedRules,
      showCreateDialog,
      editingRule,
      userInfo,
      userExpired,
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
      resetForm,
      getProtocolType
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

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
