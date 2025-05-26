<template>
  <Layout>
    <div class="admin-panel">
      <div class="header">
        <h2>用户管理</h2>
        <el-button type="primary" @click="showCreateDialog">
          创建用户
        </el-button>
      </div>

      <el-table v-loading="loading" :data="users" border style="width: 100%">
        <el-table-column prop="username" label="用户名" width="150" />
        <el-table-column prop="email" label="邮箱" width="200" />
        <el-table-column prop="role" label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'danger' : 'success'">
              {{ row.role === 'admin' ? '管理员' : '用户' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="trafficLimit" label="流量限制" width="150">
          <template #default="{ row }">
            <span>{{ formatTrafficLimit(row.trafficLimit) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="portLimit" label="端口数量限制" width="150">
          <template #default="{ row }">
            <span>{{ row.portLimit || '不限制' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="200">
          <template #default="{ row }">
            <el-button-group>
              <el-button size="small" type="primary" @click="handleEdit(row)">
                编辑
              </el-button>
              <el-button 
                size="small" 
                type="danger" 
                @click="handleDelete(row)"
                :disabled="row.role === 'admin'"
              >
                删除
              </el-button>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>

      <!-- 创建/编辑用户对话框 -->
      <el-dialog 
        :title="isEdit ? '编辑用户' : '创建用户'" 
        v-model="dialogVisible" 
        width="500px"
      >
        <el-form 
          ref="userFormRef" 
          :model="userForm" 
          :rules="formRules" 
          label-width="120px"
        >
          <el-form-item label="用户名" prop="username">
            <el-input v-model="userForm.username" :disabled="isEdit" />
          </el-form-item>

          <el-form-item label="邮箱" prop="email">
            <el-input v-model="userForm.email" />
          </el-form-item>

          <el-form-item label="密码" prop="password" v-if="!isEdit">
            <el-input v-model="userForm.password" type="password" show-password />
          </el-form-item>

          <el-form-item label="角色" prop="role">
            <el-select v-model="userForm.role" :disabled="isEdit && userForm.role === 'admin'">
              <el-option label="普通用户" value="user" />
              <el-option label="管理员" value="admin" />
            </el-select>
          </el-form-item>

          <el-form-item label="流量限制" prop="trafficLimit">
            <el-radio-group v-model="trafficLimitType">
              <el-radio label="limited">限制</el-radio>
              <el-radio label="unlimited">不限制</el-radio>
            </el-radio-group>
            <template v-if="trafficLimitType === 'limited'">
              <el-input-number 
                v-model="userForm.trafficLimit" 
                :min="0" 
                :max="2000" 
                :step="1"
                style="margin-left: 10px"
              >
                <template #suffix>GB</template>
              </el-input-number>
            </template>
          </el-form-item>

          <el-form-item label="端口数量限制" prop="portLimit">
            <el-radio-group v-model="portLimitType">
              <el-radio label="limited">限制</el-radio>
              <el-radio label="unlimited">不限制</el-radio>
            </el-radio-group>
            <template v-if="portLimitType === 'limited'">
              <el-input-number 
                v-model="userForm.portLimit" 
                :min="1" 
                :max="100" 
                :step="1"
                style="margin-left: 10px"
              />
            </template>
          </el-form-item>
        </el-form>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="dialogVisible = false">取消</el-button>
            <el-button type="primary" @click="handleSubmit" :loading="submitting">
              {{ isEdit ? '更新' : '创建' }}
            </el-button>
          </span>
        </template>
      </el-dialog>
    </div>
  </Layout>
</template>

<script>
import { ref, reactive, computed, onMounted } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import Layout from '@/components/layout/Layout.vue';

export default {
  name: 'AdminPanel',
  components: {
    Layout
  },
  setup() {
    const store = useStore();
    const router = useRouter();
    const loading = ref(false);
    const submitting = ref(false);
    const dialogVisible = ref(false);
    const isEdit = ref(false);
    const userFormRef = ref(null);
    const trafficLimitType = ref('limited');
    const portLimitType = ref('limited');

    // 检查是否是管理员
    const isAdmin = computed(() => store.getters['user/isAdmin']);
    const users = computed(() => store.getters['user/allUsers']);

    // 如果不是管理员，重定向到仪表盘
    onMounted(async () => {
      if (!isAdmin.value) {
        ElMessage.error('没有访问权限');
        router.push('/dashboard');
        return;
      }

      loading.value = true;
      try {
        await store.dispatch('user/fetchUsers');
      } catch (error) {
        console.error('Fetch users error:', error);
        ElMessage.error(error.message || '获取用户列表失败');
      } finally {
        loading.value = false;
      }
    });

    const userForm = reactive({
      username: '',
      email: '',
      password: '',
      role: 'user',
      trafficLimit: 100,
      portLimit: 5
    });

    const formRules = {
      username: [
        { required: true, message: '请输入用户名', trigger: 'blur' },
        { min: 3, max: 20, message: '长度在 3 到 20 个字符', trigger: 'blur' }
      ],
      email: [
        { required: true, message: '请输入邮箱地址', trigger: 'blur' },
        { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }
      ],
      password: [
        { required: true, message: '请输入密码', trigger: 'blur' },
        { min: 6, message: '密码长度不能小于 6 个字符', trigger: 'blur' }
      ],
      role: [
        { required: true, message: '请选择角色', trigger: 'change' }
      ]
    };

    const resetForm = () => {
      userForm.username = '';
      userForm.email = '';
      userForm.password = '';
      userForm.role = 'user';
      userForm.trafficLimit = 100;
      userForm.portLimit = 5;
      trafficLimitType.value = 'limited';
      portLimitType.value = 'limited';
      if (userFormRef.value) {
        userFormRef.value.resetFields();
      }
    };

    const showCreateDialog = () => {
      isEdit.value = false;
      resetForm();
      dialogVisible.value = true;
    };

    const handleEdit = (row) => {
      isEdit.value = true;
      Object.assign(userForm, row);
      trafficLimitType.value = row.trafficLimit === null ? 'unlimited' : 'limited';
      portLimitType.value = row.portLimit === null ? 'unlimited' : 'limited';
      dialogVisible.value = true;
    };

    const handleDelete = async (row) => {
      if (row.role === 'admin') {
        ElMessage.warning('不能删除管理员账户');
        return;
      }

      try {
        await ElMessageBox.confirm(
          '确定要删除该用户吗？此操作将无法恢复。',
          '警告',
          {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning'
          }
        );
        
        await store.dispatch('user/deleteUser', row.id);
        ElMessage.success('删除成功');
        // 重新加载用户列表
        await store.dispatch('user/fetchUsers');
      } catch (error) {
        if (error !== 'cancel') {
          console.error('Delete error:', error);
          ElMessage.error(error.message || '删除失败');
        }
      }
    };

    const handleSubmit = async () => {
      if (!userFormRef.value) return;

      try {
        await userFormRef.value.validate();
        
        submitting.value = true;
        const userData = { ...userForm };
        
        // 处理流量限制
        if (trafficLimitType.value === 'unlimited') {
          userData.trafficLimit = null;
        }
        
        // 处理端口限制
        if (portLimitType.value === 'unlimited') {
          userData.portLimit = null;
        }

        if (isEdit.value) {
          await store.dispatch('user/updateUser', {
            id: userForm.id,
            data: userData
          });
          ElMessage.success('更新成功');
        } else {
          await store.dispatch('user/createUser', userData);
          ElMessage.success('创建成功');
        }
        
        // 重新加载用户列表
        await store.dispatch('user/fetchUsers');
        dialogVisible.value = false;
      } catch (error) {
        console.error('Operation error:', error);
        ElMessage.error(error.message || '操作失败');
      } finally {
        submitting.value = false;
      }
    };

    const formatTrafficLimit = (limit) => {
      if (limit === null) return '不限制';
      return `${limit} GB`;
    };

    return {
      loading,
      submitting,
      users,
      dialogVisible,
      isEdit,
      userForm,
      userFormRef,
      formRules,
      trafficLimitType,
      portLimitType,
      showCreateDialog,
      handleEdit,
      handleDelete,
      handleSubmit,
      formatTrafficLimit
    };
  }
};
</script>

<style scoped>
.admin-panel {
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
}

.dialog-footer {
  text-align: right;
}
</style>
