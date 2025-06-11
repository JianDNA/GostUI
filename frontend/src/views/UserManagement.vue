<template>
  <div class="user-management">
    <div class="page-header">
      <h2>用户管理</h2>
      <el-button type="primary" @click="handleAdd" v-if="isAdmin">
        <el-icon><Plus /></el-icon>
        添加用户
      </el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="displayUsers"
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
          <span v-if="row.trafficQuota">{{ formatQuota(row.trafficQuota) }}</span>
          <span v-else class="text-muted">未设置</span>
        </template>
      </el-table-column>
      <el-table-column label="流量使用 (双向)" width="180">
        <template #default="{ row }">
          <div v-if="row.trafficStats">
            <div class="traffic-usage">
              <span class="used">{{ row.trafficStats.usedTrafficGB }}GB</span>
              <span class="separator">/</span>
              <span class="quota">{{ formatQuota(row.trafficStats.trafficQuotaGB) || 'Unlimited' }}</span>
            </div>
            <el-progress
              :percentage="row.trafficStats.usagePercent"
              :status="row.trafficStats.usagePercent >= 90 ? 'exception' : (row.trafficStats.usagePercent >= 70 ? 'warning' : 'success')"
              :stroke-width="6"
              :show-text="false"
            />
            <div class="remaining">
              剩余: {{ row.trafficStats.remainingGB }}
            </div>
            <div class="traffic-type">
              <el-tooltip content="包含上行流量(客户端→服务器)和下行流量(服务器→客户端)" placement="top">
                <el-tag size="small" type="info">双向流量</el-tag>
              </el-tooltip>
            </div>
          </div>
          <span v-else class="text-muted">无数据</span>
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
              v-if="canEditUser(row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="row.role !== 'admin' && isAdmin"
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
              v-if="isAdmin"
              type="warning"
              size="small"
              @click="handleResetTraffic(row)"
              :title="`重置 ${row.username} 的流量统计`"
            >
              重置流量
            </el-button>
            <el-button
              v-if="row.username !== 'admin' && isAdmin"
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

        <!-- 密码编辑 - Admin可以编辑任何用户的密码 -->
        <el-form-item
          v-if="isEdit && isAdmin"
          label="重置密码"
          prop="newPassword"
        >
          <el-input
            v-model="form.newPassword"
            type="password"
            placeholder="输入新密码（留空表示不修改）"
            show-password
            clearable
          />
          <div class="form-tip">
            留空表示不修改密码，输入新密码将重置用户密码
          </div>
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
              @change="checkPortConflictsDebounced"
            />
            <span>-</span>
            <el-input-number
              v-model="form.portRangeEnd"
              :min="1"
              :max="65535"
              placeholder="结束端口"
              style="width: 150px"
              @change="checkPortConflictsDebounced"
            />
          </div>
          <div class="form-tip">
            必须设置端口范围，例如：10001-10100
          </div>
          <div v-if="portConflictMessage" class="conflict-message">
            {{ portConflictMessage }}
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
            :min="0.001"
            :max="10240"
            :step="0.001"
            :precision="3"
            placeholder="GB"
            style="width: 100%"
          />
          <div class="form-tip">
            必须设置流量限额，单位：GB，范围：0.001-10240（支持小数，如0.1GB=100MB）
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
        <el-button
          type="primary"
          @click="handleSubmit"
          :loading="submitting"
          :disabled="hasPortConflict"
        >
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

    <!-- 重置流量对话框 -->
    <el-dialog
      title="重置用户流量统计"
      v-model="resetTrafficDialogVisible"
      width="500px"
    >
      <div class="reset-traffic-content">
        <el-alert
          title="重要提醒"
          type="warning"
          :closable="false"
          show-icon
        >
          <template #default>
            <p>此操作将重置用户的所有流量统计数据，包括：</p>
            <ul>
              <li>✅ 用户总流量归零</li>
              <li>✅ 所有规则流量归零</li>
              <li>✅ 清理历史流量记录</li>
              <li>🔒 <strong>保留所有转发规则</strong></li>
            </ul>
            <p><strong>此操作不可撤销，请谨慎操作！</strong></p>
          </template>
        </el-alert>

        <el-form label-width="100px" style="margin-top: 20px;">
          <el-form-item label="用户名">
            <span class="user-info">{{ resetTrafficUser?.username }}</span>
          </el-form-item>
          <el-form-item label="当前流量">
            <span class="traffic-info">
              {{ resetTrafficUser?.trafficStats?.usedTrafficGB || 0 }}GB
              / {{ formatQuota(resetTrafficUser?.trafficStats?.trafficQuotaGB) || 'Unlimited' }}
            </span>
          </el-form-item>
          <el-form-item label="转发规则">
            <span class="rules-info">
              {{ resetTrafficUser?.forwardRuleCount || 0 }} 个规则将被保留
            </span>
          </el-form-item>
          <el-form-item label="重置原因">
            <el-input
              v-model="resetTrafficReason"
              type="textarea"
              :rows="3"
              placeholder="请输入重置原因（可选）"
              maxlength="200"
              show-word-limit
            />
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <el-button @click="resetTrafficDialogVisible = false">取消</el-button>
        <el-button
          type="danger"
          @click="confirmResetTraffic"
          :loading="resettingTraffic"
        >
          确认重置
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import api from '@/utils/api'

export default {
  name: 'UserManagement',
  components: {
    Plus
  },
  setup() {
    const router = useRouter()
    const store = useStore()
    const loading = ref(false)
    const submitting = ref(false)
    const extending = ref(false)
    const resettingTraffic = ref(false)
    const users = ref([])
    const dialogVisible = ref(false)
    const extendDialogVisible = ref(false)
    const resetTrafficDialogVisible = ref(false)
    const isEdit = ref(false)
    const currentUser = ref(null)
    const resetTrafficUser = ref(null)
    const extendMonths = ref(1)
    const resetTrafficReason = ref('')
    const formRef = ref(null)
    const portConflictMessage = ref('')
    const hasPortConflict = ref(false)

    // 当前登录用户信息
    const currentLoginUser = computed(() => store.getters['user/currentUser'])
    const isAdmin = computed(() => store.getters['user/isAdmin'])

    // 显示的用户列表（普通用户只能看到自己）
    const displayUsers = computed(() => {
      if (isAdmin.value) {
        return users.value
      } else {
        return users.value.filter(user => user.id === currentLoginUser.value?.id)
      }
    })

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

    // 检查用户是否可以编辑
    const canEditUser = (user) => {
      if (isAdmin.value) {
        return true // 管理员可以编辑所有用户
      }
      return user.id === currentLoginUser.value?.id // 普通用户只能编辑自己
    }

    const rules = computed(() => {
      const baseRules = {
        username: [
          { required: true, message: '请输入用户名', trigger: ['blur', 'change'] },
          { min: 3, max: 30, message: '用户名长度在 3 到 30 个字符', trigger: ['blur', 'change'] }
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
            trigger: ['blur', 'change']
          }
        ]

        baseRules.trafficQuota = [
          { required: true, message: '请设置流量限额', trigger: 'blur' },
          { type: 'number', min: 0.001, max: 10240, message: '流量限额范围在 0.001-10240 GB', trigger: 'blur' }
        ]
      }

      return baseRules
    })

    // 防抖函数
    let debounceTimer = null
    const checkPortConflictsDebounced = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        checkPortConflicts()
      }, 500)
    }

    const checkPortConflicts = async () => {
      if (!form.portRangeStart || !form.portRangeEnd || form.role !== 'user') {
        portConflictMessage.value = ''
        hasPortConflict.value = false
        return
      }

      if (form.portRangeStart >= form.portRangeEnd) {
        portConflictMessage.value = '起始端口必须小于结束端口'
        hasPortConflict.value = true
        return
      }

      try {
        const excludeUserId = isEdit.value ? currentUser.value.id : null
        const response = await api.post('/users/check-port-conflicts', {
          portRangeStart: form.portRangeStart,
          portRangeEnd: form.portRangeEnd,
          excludeUserId
        })

        if (response.data.hasConflict) {
          const conflictMessages = response.data.conflicts.map(conflict => {
            if (conflict.type === 'user_range') {
              return `与用户 "${conflict.username}" 的端口范围 ${conflict.portRange} 重叠`
            } else if (conflict.type === 'used_port') {
              return `端口 ${conflict.port} 已被用户 "${conflict.username}" 的规则占用`
            }
            return conflict.message
          })

          portConflictMessage.value = `端口配置冲突：${conflictMessages.join('；')}`
          hasPortConflict.value = true
        } else {
          portConflictMessage.value = ''
          hasPortConflict.value = false
        }
      } catch (error) {
        console.error('检查端口冲突失败:', error)
        portConflictMessage.value = ''
        hasPortConflict.value = false
      }
    }

    const loadUsers = async () => {
      loading.value = true
      try {
        const response = await api.users.getUsers()
        // 处理用户数据，添加流量统计信息
        users.value = response.data.map(user => {
          const usedTrafficGB = (user.usedTraffic / (1024 * 1024 * 1024)).toFixed(2)
          const trafficQuotaGB = user.trafficQuota || 0
          const usagePercent = trafficQuotaGB > 0 ? Math.min((user.usedTraffic / (trafficQuotaGB * 1024 * 1024 * 1024)) * 100, 100) : 0
          const remainingGB = trafficQuotaGB > 0 ? Math.max(trafficQuotaGB - parseFloat(usedTrafficGB), 0).toFixed(2) + 'GB' : 'Unlimited'

          return {
            ...user,
            trafficStats: {
              usedTrafficGB: parseFloat(usedTrafficGB),
              trafficQuotaGB: trafficQuotaGB,
              usagePercent: Math.round(usagePercent),
              remainingGB: remainingGB
            }
          }
        })
        console.log('📊 Users with traffic stats:', users.value)
      } catch (error) {
        ElMessage.error('获取用户列表失败: ' + (error.response?.data?.message || error.message))
      } finally {
        loading.value = false
      }
    }

    const handleAdd = () => {
      if (!isAdmin.value) {
        ElMessage.error('没有权限添加用户')
        return
      }
      isEdit.value = false
      dialogVisible.value = true
    }

    const handleEdit = (user) => {
      if (!canEditUser(user)) {
        ElMessage.error('没有权限编辑此用户')
        return
      }

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
        trafficQuota: user.trafficQuota || 1,
        isActive: user.isActive
      })

      // 清除之前的校验状态
      portConflictMessage.value = ''
      hasPortConflict.value = false

      dialogVisible.value = true

      // 在下一个tick中清除表单校验状态，确保表单已经渲染完成
      nextTick(() => {
        if (formRef.value) {
          formRef.value.clearValidate()

          // 延迟一点时间再进行校验，确保数据已经完全绑定
          setTimeout(() => {
            // 手动触发必填字段的校验，确保有数据的字段不会显示错误
            if (form.username) {
              formRef.value.validateField('username')
            }
            if (form.role === 'user' && form.portRangeStart && form.portRangeEnd) {
              formRef.value.validateField('portRange')
              checkPortConflictsDebounced()
            }
            if (form.role === 'user' && form.trafficQuota) {
              formRef.value.validateField('trafficQuota')
            }
          }, 100)
        }
      })
    }

    const handleSubmit = async () => {
      if (!formRef.value) return

      try {
        await formRef.value.validate()
      } catch {
        return
      }

      if (hasPortConflict.value) {
        ElMessage.error('存在端口冲突，请修改端口范围')
        return
      }

      submitting.value = true
      try {
        const data = { ...form }

        if (isEdit.value) {
          // 编辑时处理密码 - Admin可以重置任何用户的密码
          if (isAdmin.value && form.newPassword) {
            data.password = form.newPassword
            console.log(`🔑 Admin正在重置用户 ${form.username} 的密码`)
          } else {
            delete data.password
          }
          delete data.newPassword

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
      if (!isAdmin.value) {
        ElMessage.error('没有权限删除用户')
        return
      }

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
      if (!isAdmin.value) {
        ElMessage.error('没有权限延长用户过期时间')
        return
      }

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

    const handleResetTraffic = (user) => {
      if (!isAdmin.value) {
        ElMessage.error('没有权限重置用户流量')
        return
      }

      resetTrafficUser.value = user
      resetTrafficReason.value = ''
      resetTrafficDialogVisible.value = true
    }

    const confirmResetTraffic = async () => {
      if (!resetTrafficUser.value) {
        return
      }

      try {
        await ElMessageBox.confirm(
          `确定要重置用户 "${resetTrafficUser.value.username}" 的流量统计吗？\n\n此操作将：\n• 用户总流量归零\n• 所有规则流量归零\n• 清理历史流量记录\n• 保留所有转发规则\n\n此操作不可撤销！`,
          '确认重置流量',
          {
            confirmButtonText: '确认重置',
            cancelButtonText: '取消',
            type: 'warning',
            dangerouslyUseHTMLString: false
          }
        )

        resettingTraffic.value = true

        const response = await api.users.resetUserTraffic(resetTrafficUser.value.id, {
          reason: resetTrafficReason.value || '管理员重置'
        })

        if (response.data.success) {
          ElMessage.success({
            message: `成功重置用户 ${resetTrafficUser.value.username} 的流量统计`,
            duration: 5000
          })

          // 显示重置详情
          const summary = response.data.data.resetSummary
          console.log('🔄 流量重置完成:', summary)

          resetTrafficDialogVisible.value = false
          await loadUsers() // 刷新用户列表
        } else {
          ElMessage.error('重置流量失败: ' + (response.data.message || '未知错误'))
        }

      } catch (error) {
        if (error !== 'cancel') {
          ElMessage.error('重置流量失败: ' + (error.response?.data?.message || error.message))
        }
      } finally {
        resettingTraffic.value = false
      }
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
        trafficQuota: 1,
        isActive: true
      })
      portConflictMessage.value = ''
      hasPortConflict.value = false
      if (formRef.value) {
        formRef.value.clearValidate()
      }
    }

    // 格式化配额显示
    const formatQuota = (quota) => {
      if (!quota || quota === 0) return '0GB'

      // 如果是整数GB，直接显示
      if (quota >= 1 && quota % 1 === 0) {
        return `${quota}GB`
      }

      // 如果是小数GB，显示更友好的格式
      if (quota >= 1) {
        return `${quota}GB`
      } else if (quota >= 0.001) {
        const mb = quota * 1024
        if (mb >= 1 && mb % 1 === 0) {
          return `${mb}MB`
        } else {
          return `${quota}GB`
        }
      } else {
        return `${quota}GB`
      }
    }

    onMounted(() => {
      loadUsers()
    })

    return {
      loading,
      submitting,
      extending,
      resettingTraffic,
      users,
      displayUsers,
      dialogVisible,
      extendDialogVisible,
      resetTrafficDialogVisible,
      isEdit,
      isAdmin,
      currentUser,
      resetTrafficUser,
      extendMonths,
      resetTrafficReason,
      form,
      rules,
      formRef,
      dialogTitle,
      portConflictMessage,
      hasPortConflict,
      canEditUser,
      loadUsers,
      handleAdd,
      handleEdit,
      handleSubmit,
      handleDelete,
      handleExtendExpiry,
      confirmExtendExpiry,
      viewUserRules,
      handleResetTraffic,
      confirmResetTraffic,
      resetForm,
      checkPortConflictsDebounced,
      formatQuota
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

.conflict-message {
  font-size: 12px;
  color: #F56C6C;
  margin-top: 4px;
  padding: 4px 8px;
  background: #FEF0F0;
  border: 1px solid #FBC4C4;
  border-radius: 4px;
}

.traffic-usage {
  display: flex;
  align-items: center;
  font-size: 12px;
  margin-bottom: 4px;
}

.traffic-usage .used {
  color: #409eff;
  font-weight: bold;
}

.traffic-usage .separator {
  margin: 0 4px;
  color: #909399;
}

.traffic-usage .quota {
  color: #606266;
}

.remaining {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

/* 重置流量对话框样式 */
.reset-traffic-content .user-info {
  font-weight: bold;
  color: #409eff;
}

.reset-traffic-content .traffic-info {
  font-weight: bold;
  color: #e6a23c;
}

.reset-traffic-content .rules-info {
  font-weight: bold;
  color: #67c23a;
}

.reset-traffic-content ul {
  margin: 10px 0;
  padding-left: 20px;
}

.reset-traffic-content li {
  margin: 5px 0;
}
</style>
