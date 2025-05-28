<template>
  <div class="user-management">
    <div class="page-header">
      <h2>用户管理</h2>
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        添加用户
      </el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="users"
      border
      style="width: 100%"
    >
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="username" label="用户名" width="120" />
      <el-table-column prop="email" label="邮箱" width="180" />
      <el-table-column label="端口范围" width="120">
        <template #default="{ row }">
          <span v-if="row.portRangeStart && row.portRangeEnd">
            {{ row.portRangeStart }}-{{ row.portRangeEnd }}
          </span>
          <span v-else class="text-muted">未设置</span>
        </template>
      </el-table-column>
      <el-table-column label="流量限额" width="100">
        <template #default="{ row }">
          <span v-if="row.trafficQuota">{{ row.trafficQuota }}GB</span>
          <span v-else class="text-muted">未设置</span>
        </template>
      </el-table-column>
      <el-table-column label="过期时间" width="120">
        <template #default="{ row }">
          <span v-if="row.expiryDate" :class="{ 'expired': row.isExpired }">
            {{ new Date(row.expiryDate).toLocaleDateString() }}
          </span>
          <span v-else class="text-muted">永不过期</span>
          <el-tag v-if="row.isExpired" type="danger" size="small" style="margin-left: 5px;">
            已过期
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="转发规则" width="100">
        <template #default="{ row }">
          <span>{{ row.activeRuleCount || 0 }}/{{ row.forwardRuleCount || 0 }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="role" label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="row.role === 'admin' ? 'danger' : 'success'">
            {{ row.role === 'admin' ? '管理员' : '普通用户' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="isActive" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'">
            {{ row.isActive ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button-group>
            <el-button
              type="primary"
              size="small"
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="row.role !== 'admin'"
              type="warning"
              size="small"
              @click="handleExtendExpiry(row)"
            >
              续期
            </el-button>
            <el-button
              type="info"
              size="small"
              @click="viewUserRules(row)"
            >
              规则
            </el-button>
            <el-button
              v-if="row.username !== 'admin'"
              type="danger"
              size="small"
              @click="handleDelete(row)"
              :disabled="row.username === 'admin'"
            >
              删除
            </el-button>
          </el-button-group>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加/编辑用户对话框 -->
    <el-dialog
      :title="dialogTitle"
      v-model="dialogVisible"
      width="600px"
      @close="resetForm"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="120px"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            :disabled="isEdit"
          />
          <div class="form-tip" v-if="isEdit">
            用户名创建后不可修改
          </div>
        </el-form-item>
        
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="请输入邮箱" />
        </el-form-item>
        
        <el-form-item v-if="!isEdit" label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            show-password
          />
        </el-form-item>

        <el-form-item v-if="isEdit && form.username === 'admin'" label="新密码" prop="newPassword">
          <el-input
            v-model="form.newPassword"
            type="password"
            placeholder="留空表示不修改密码"
            show-password
          />
        </el-form-item>
        
        <el-form-item label="角色" prop="role">
          <el-select 
            v-model="form.role" 
            style="width: 100%" 
            :disabled="isEdit"
          >
            <el-option label="普通用户" value="user" />
            <el-option label="管理员" value="admin" />
          </el-select>
          <div class="form-tip">
            角色创建后不可修改，确保只有admin用户为管理员
          </div>
        </el-form-item>
        
        <el-form-item label="端口范围" prop="portRange" v-if="form.role === 'user'">
          <div style="display: flex; gap: 10px; align-items: center;">
            <el-input-number
              v-model="form.portRangeStart"
              :min="1"
              :max="65535"
              placeholder="起始端口"
              style="width: 150px"
            />
            <span>-</span>
            <el-input-number
              v-model="form.portRangeEnd"
              :min="1"
              :max="65535"
              placeholder="结束端口"
              style="width: 150px"
            />
          </div>
          <div class="form-tip">
            必须设置端口范围，例如：10001-10100
          </div>
        </el-form-item>
        
        <el-form-item label="过期时间" v-if="form.role === 'user'">
          <el-date-picker
            v-model="form.expiryDate"
            type="datetime"
            placeholder="选择过期时间"
            format="YYYY-MM-DD HH:mm:ss"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 100%"
          />
          <div class="form-tip">
            留空表示永不过期，新用户默认一个月后过期
          </div>
        </el-form-item>
        
        <el-form-item label="流量限额" prop="trafficQuota" v-if="form.role === 'user'">
          <el-input-number
            v-model="form.trafficQuota"
            :min="1"
            :max="10240"
            placeholder="GB"
            style="width: 100%"
          />
          <div class="form-tip">
            必须设置流量限额，单位：GB，范围：1-10240
          </div>
        </el-form-item>
        
        <el-form-item label="状态" prop="isActive">
          <el-switch 
            v-model="form.isActive" 
            :disabled="form.username === 'admin'"
          />
          <div class="form-tip" v-if="form.username === 'admin'">
            admin用户状态不可禁用
          </div>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          {{ isEdit ? '更新' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 续期对话框 -->
    <el-dialog
      title="延长用户过期时间"
      v-model="extendDialogVisible"
      width="400px"
    >
      <el-form label-width="100px">
        <el-form-item label="用户名">
          <span>{{ currentUser?.username }}</span>
        </el-form-item>
        <el-form-item label="当前过期时间">
          <span>{{ currentUser?.expiryDate ? new Date(currentUser.expiryDate).toLocaleString() : '永不过期' }}</span>
        </el-form-item>
        <el-form-item label="延长月数">
          <el-input-number
            v-model="extendMonths"
            :min="1"
            :max="12"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="extendDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmExtendExpiry" :loading="extending">
          确认延长
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import api from '@/utils/api'

export default {
  name: 'UserManagement',
  components: {
    Plus
  },
  setup() {
    const router = useRouter()
    const loading = ref(false)
    const submitting = ref(false)
    const extending = ref(false)
    const users = ref([])
    const dialogVisible = ref(false)
    const extendDialogVisible = ref(false)
    const isEdit = ref(false)
    const currentUser = ref(null)
    const extendMonths = ref(1)
    const formRef = ref(null)

    const form = reactive({
      username: '',
      email: '',
      password: '',
      newPassword: '',
      role: 'user',
      portRangeStart: null,
      portRangeEnd: null,
      expiryDate: null,
      trafficQuota: 100,
      isActive: true
    })

    const dialogTitle = computed(() => isEdit.value ? '编辑用户' : '添加用户')

    const rules = computed(() => {
      const baseRules = {
        username: [
          { required: true, message: '请输入用户名', trigger: 'blur' },
          { min: 3, max: 30, message: '用户名长度在 3 到 30 个字符', trigger: 'blur' }
        ],
        email: [
          { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }
        ],
        role: [
          { required: true, message: '请选择角色', trigger: 'change' }
        ]
      }

      // 创建用户时密码必填
      if (!isEdit.value) {
        baseRules.password = [
          { required: true, message: '请输入密码', trigger: 'blur' },
          { min: 6, message: '密码长度不能少于 6 个字符', trigger: 'blur' }
        ]
      }

      // 普通用户必须设置端口范围和流量限额
      if (form.role === 'user') {
        baseRules.portRange = [
          {
            validator: (rule, value, callback) => {
              if (!form.portRangeStart || !form.portRangeEnd) {
                callback(new Error('请设置端口范围'))
                return
              }
              if (form.portRangeStart >= form.portRangeEnd) {
                callback(new Error('起始端口必须小于结束端口'))
                return
              }
              callback()
            },
            trigger: 'blur'
          }
        ]
        
        baseRules.trafficQuota = [
          { required: true, message: '请设置流量限额', trigger: 'blur' },
          { type: 'number', min: 1, max: 10240, message: '流量限额范围在 1-10240 GB', trigger: 'blur' }
        ]
      }

      return baseRules
    })

    const loadUsers = async () => {
      loading.value = true
      try {
        const response = await api.users.getUsers()
        users.value = response.data
      } catch (error) {
        ElMessage.error('获取用户列表失败: ' + (error.response?.data?.message || error.message))
      } finally {
        loading.value = false
      }
    }

    const handleAdd = () => {
      isEdit.value = false
      dialogVisible.value = true
    }

    const handleEdit = (user) => {
      isEdit.value = true
      currentUser.value = user
      Object.assign(form, {
        username: user.username,
        email: user.email,
        password: '',
        newPassword: '',
        role: user.role,
        portRangeStart: user.portRangeStart,
        portRangeEnd: user.portRangeEnd,
        expiryDate: user.expiryDate,
        trafficQuota: user.trafficQuota || 100,
        isActive: user.isActive
      })
      dialogVisible.value = true
    }

    const handleSubmit = async () => {
      if (!formRef.value) return
      
      try {
        await formRef.value.validate()
      } catch {
        return
      }

      // 验证端口范围
      if (form.role === 'user' && form.portRangeStart && form.portRangeEnd) {
        if (form.portRangeStart >= form.portRangeEnd) {
          ElMessage.error('起始端口必须小于结束端口')
          return
        }
      }

      submitting.value = true
      try {
        const data = { ...form }
        
        if (isEdit.value) {
          // 编辑时处理密码
          if (form.username === 'admin' && form.newPassword) {
            data.password = form.newPassword
          } else {
            delete data.password
            delete data.newPassword
          }
          
          await api.users.updateUser(currentUser.value.id, data)
          ElMessage.success('用户更新成功')
        } else {
          await api.users.createUser(data)
          ElMessage.success('用户创建成功')
        }
        
        dialogVisible.value = false
        await loadUsers()
      } catch (error) {
        ElMessage.error('操作失败: ' + (error.response?.data?.message || error.message))
      } finally {
        submitting.value = false
      }
    }

    const handleDelete = async (user) => {
      if (user.username === 'admin') {
        ElMessage.error('不能删除admin用户')
        return
      }

      try {
        await ElMessageBox.confirm(
          `确定要删除用户 "${user.username}" 吗？此操作将同时删除该用户的所有转发规则。`,
          '确认删除',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
        
        await api.users.deleteUser(user.id)
        ElMessage.success('用户删除成功')
        await loadUsers()
      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('删除用户失败: ' + (error.response?.data?.message || error.message))
        }
      }
    }

    const handleExtendExpiry = (user) => {
      currentUser.value = user
      extendMonths.value = 1
      extendDialogVisible.value = true
    }

    const confirmExtendExpiry = async () => {
      extending.value = true
      try {
        await api.users.extendUserExpiry(currentUser.value.id, { months: extendMonths.value })
        ElMessage.success(`成功延长 ${extendMonths.value} 个月`)
        extendDialogVisible.value = false
        await loadUsers()
      } catch (error) {
        ElMessage.error('延长过期时间失败: ' + (error.response?.data?.message || error.message))
      } finally {
        extending.value = false
      }
    }

    const viewUserRules = (user) => {
      router.push({
        name: 'UserForwardRules',
        query: { userId: user.id }
      })
    }

    const resetForm = () => {
      Object.assign(form, {
        username: '',
        email: '',
        password: '',
        newPassword: '',
        role: 'user',
        portRangeStart: null,
        portRangeEnd: null,
        expiryDate: null,
        trafficQuota: 100,
        isActive: true
      })
      if (formRef.value) {
        formRef.value.clearValidate()
      }
    }

    onMounted(() => {
      loadUsers()
    })

    return {
      loading,
      submitting,
      extending,
      users,
      dialogVisible,
      extendDialogVisible,
      isEdit,
      currentUser,
      extendMonths,
      form,
      rules,
      formRef,
      dialogTitle,
      loadUsers,
      handleAdd,
      handleEdit,
      handleSubmit,
      handleDelete,
      handleExtendExpiry,
      confirmExtendExpiry,
      viewUserRules,
      resetForm
    }
  }
}
</script>

<style scoped>
.user-management {
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

.text-muted {
  color: #909399;
}

.expired {
  color: #F56C6C;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
