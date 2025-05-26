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
      <el-table-column prop="username" label="用户名" width="150" />
      <el-table-column prop="email" label="邮箱" width="200" />
      <el-table-column prop="trafficQuota" label="流量限额" width="120">
        <template #default="{ row }">
          <span>{{ row.role === 'admin' ? '无限制' : `${row.trafficQuota}GB` }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="portRange" label="端口范围" width="150">
        <template #default="{ row }">
          {{ row.portRange || '未设置' }}
        </template>
      </el-table-column>
      <el-table-column prop="role" label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="row.role === 'admin' ? 'danger' : 'success'">
            {{ row.role === 'admin' ? '管理员' : '普通用户' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="isActive" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'">
            {{ row.isActive ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="250">
        <template #default="{ row }">
          <el-button-group>
            <el-button
              type="primary"
              :icon="Edit"
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              type="danger"
              :icon="Delete"
              @click="handleDelete(row)"
              :disabled="row.role === 'admin'"
            >
              删除
            </el-button>
          </el-button-group>
        </template>
      </el-table-column>
    </el-table>

    <!-- 用户表单对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="formType === 'add' ? '添加用户' : '编辑用户'"
      width="500px"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item label="用户名" prop="username">
          <el-input 
            v-model="form.username"
            :disabled="formType === 'edit' && form.role === 'admin'"
          />
        </el-form-item>
        <el-form-item 
          :label="formType === 'add' ? '密码' : '新密码'" 
          :prop="formType === 'add' ? 'password' : 'newPassword'"
        >
          <el-input 
            v-model="form.password"
            type="password"
            :placeholder="formType === 'add' ? '请输入密码' : '不修改请留空'"
          />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" />
        </el-form-item>
        <el-form-item 
          label="流量限额" 
          prop="trafficQuota"
          v-if="form.role !== 'admin'"
        >
          <el-input-number
            v-model="form.trafficQuota"
            :min="1"
            :max="10240"
            :step="1"
            style="width: 200px"
          >
            <template #append>GB</template>
          </el-input-number>
          <el-tooltip 
            content="流量限额范围为1-10240GB" 
            placement="top"
            style="margin-left: 10px"
          >
            <el-icon><InfoFilled /></el-icon>
          </el-tooltip>
        </el-form-item>
        <el-form-item 
          label="端口范围" 
          prop="portRange"
          v-if="form.role !== 'admin'"
        >
          <el-input 
            v-model="form.portRange"
            placeholder="例如: 10001-20000"
          >
            <template #append>
              <el-tooltip 
                content="端口范围必须在10001-65535之间，且起始端口必须小于结束端口" 
                placement="top"
              >
                <el-icon><InfoFilled /></el-icon>
              </el-tooltip>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select 
            v-model="form.role" 
            style="width: 100%"
            :disabled="form.role === 'admin'"
          >
            <el-option label="管理员" value="admin" />
            <el-option label="普通用户" value="user" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="isActive">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleSubmit">
            确定
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, InfoFilled } from '@element-plus/icons-vue';

const store = useStore();
const router = useRouter();
const loading = ref(false);
const dialogVisible = ref(false);
const formType = ref('add');
const formRef = ref(null);
const users = ref([]);

// 检查管理员权限
const isAdmin = computed(() => store.getters['user/isAdmin']);

const form = ref({
  username: '',
  password: '',
  email: '',
  role: 'user',
  isActive: true,
  portRange: '',
  trafficQuota: 100 // 默认100GB
});

const validatePortRange = (rule, value, callback) => {
  if (!value && form.value.role !== 'admin') {
    callback(new Error('请输入端口范围'));
    return;
  }
  if (!value) {
    callback();
    return;
  }

  // 检查格式
  if (!/^\d+-\d+$/.test(value)) {
    callback(new Error('端口范围格式必须为 "起始端口-结束端口"'));
    return;
  }

  const [start, end] = value.split('-').map(Number);

  // 检查端口范围
  if (start < 10001 || start > 65535 || end < 10001 || end > 65535) {
    callback(new Error('端口必须在 10001-65535 之间'));
    return;
  }

  // 检查起始端口是否小于结束端口
  if (start >= end) {
    callback(new Error('起始端口必须小于结束端口'));
    return;
  }

  callback();
};

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 30, message: '长度在 3 到 30 个字符', trigger: 'blur' }
  ],
  password: [
    { required: formType.value === 'add', message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能小于 6 个字符', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱地址', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }
  ],
  role: [
    { required: true, message: '请选择角色', trigger: 'change' }
  ],
  portRange: [
    { validator: validatePortRange, trigger: 'blur' }
  ],
  trafficQuota: [
    { required: true, message: '请设置流量限额', trigger: 'blur' },
    { type: 'number', message: '流量限额必须为数字', trigger: 'blur' },
    { 
      validator: (rule, value, callback) => {
        if (value < 1 || value > 10240) {
          callback(new Error('流量限额必须在1-10240GB之间'));
        } else {
          callback();
        }
      }, 
      trigger: 'blur' 
    }
  ]
};

onMounted(async () => {
  // 如果不是管理员，重定向到仪表盘
  if (!isAdmin.value) {
    ElMessage.error('没有访问权限');
    router.push('/dashboard');
    return;
  }

  await loadUsers();
});

// 获取用户列表
const loadUsers = async () => {
  try {
    loading.value = true;
    users.value = await store.dispatch('user/fetchUsers');
  } catch (error) {
    ElMessage.error(error.message || '获取用户列表失败');
    if (error.response?.status === 403) {
      router.push('/dashboard');
    }
  } finally {
    loading.value = false;
  }
};

// 添加用户
const handleAdd = () => {
  formType.value = 'add';
  form.value = {
    username: '',
    password: '',
    email: '',
    role: 'user',
    isActive: true,
    portRange: '',
    trafficQuota: 100 // 默认100GB
  };
  dialogVisible.value = true;
};

// 编辑用户
const handleEdit = (row) => {
  formType.value = 'edit';
  form.value = {
    ...row,
    password: '' // 编辑时密码为空
  };
  dialogVisible.value = true;
};

// 删除用户
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除用户 "${row.username}" 吗？`,
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await store.dispatch('user/deleteUser', row.id);
    ElMessage.success('删除成功');
    await loadUsers();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
};

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();
    
    // 如果是编辑模式且密码为空，从提交数据中删除密码字段
    if (formType.value === 'edit') {
      const { password, ...submitData } = form.value;
      if (!password) {
        await store.dispatch('user/updateUser', {
          id: submitData.id,
          data: submitData
        });
      } else {
        await store.dispatch('user/updateUser', {
          id: submitData.id,
          data: form.value
        });
      }
    } else {
      // 创建用户时直接传递表单数据
      await store.dispatch('user/createUser', form.value);
    }

    ElMessage.success(formType.value === 'add' ? '添加成功' : '更新成功');
    dialogVisible.value = false;
    await loadUsers(); // 重新加载用户列表
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || `${formType.value === 'add' ? '添加' : '更新'}失败`);
    }
  }
};
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
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style> 