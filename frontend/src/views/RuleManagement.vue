<template>
  <div class="rule-management">
    <div class="page-header">
      <h2>规则管理</h2>
      <el-button type="primary" @click="handleAdd">
        <el-icon><Plus /></el-icon>
        添加规则
      </el-button>
    </div>

    <el-table
      v-loading="loading"
      :data="ruleList"
      border
      style="width: 100%"
    >
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="规则名称" width="150" />
      <el-table-column prop="type" label="类型" width="100">
        <template #default="{ row }">
          <el-tag>{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="localAddress" label="本地地址" width="180" />
      <el-table-column prop="remoteAddress" label="远程地址" width="180" />
      <el-table-column prop="enabled" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'">
            {{ row.enabled ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
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
            >
              删除
            </el-button>
          </el-button-group>
        </template>
      </el-table-column>
    </el-table>

    <!-- 规则表单对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="formType === 'add' ? '添加规则' : '编辑规则'"
      width="600px"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="100px"
      >
        <el-form-item label="规则名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="TCP" value="tcp" />
            <el-option label="UDP" value="udp" />
            <el-option label="HTTP" value="http" />
            <el-option label="HTTPS" value="https" />
          </el-select>
        </el-form-item>
        <el-form-item label="本地地址" prop="localAddress">
          <el-input v-model="form.localAddress" placeholder="例如：:8080" />
        </el-form-item>
        <el-form-item label="远程地址" prop="remoteAddress">
          <el-input v-model="form.remoteAddress" placeholder="例如：example.com:80" />
        </el-form-item>
        <el-form-item label="状态" prop="enabled">
          <el-switch v-model="form.enabled" />
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
import { ref, onMounted } from 'vue';
import { useStore } from 'vuex';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete } from '@element-plus/icons-vue';

const store = useStore();
const loading = ref(false);
const dialogVisible = ref(false);
const formType = ref('add');
const formRef = ref(null);
const ruleList = ref([]);

const form = ref({
  name: '',
  type: 'tcp',
  localAddress: '',
  remoteAddress: '',
  enabled: true
});

const formRules = {
  name: [
    { required: true, message: '请输入规则名称', trigger: 'blur' },
    { min: 3, max: 50, message: '长度在 3 到 50 个字符', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择类型', trigger: 'change' }
  ],
  localAddress: [
    { required: true, message: '请输入本地地址', trigger: 'blur' }
  ],
  remoteAddress: [
    { required: true, message: '请输入远程地址', trigger: 'blur' }
  ]
};

// 获取规则列表
const fetchRules = async () => {
  try {
    loading.value = true;
    ruleList.value = await store.dispatch('rule/fetchRules');
  } catch (error) {
    ElMessage.error(error.message || '获取规则列表失败');
  } finally {
    loading.value = false;
  }
};

// 添加规则
const handleAdd = () => {
  formType.value = 'add';
  form.value = {
    name: '',
    type: 'tcp',
    localAddress: '',
    remoteAddress: '',
    enabled: true
  };
  dialogVisible.value = true;
};

// 编辑规则
const handleEdit = (row) => {
  formType.value = 'edit';
  form.value = { ...row };
  dialogVisible.value = true;
};

// 删除规则
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除规则 "${row.name}" 吗？`,
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await store.dispatch('rule/deleteRule', row.id);
    ElMessage.success('删除成功');
    await fetchRules();
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

    if (formType.value === 'add') {
      await store.dispatch('rule/createRule', form.value);
      ElMessage.success('添加成功');
    } else {
      await store.dispatch('rule/updateRule', {
        id: form.value.id,
        data: form.value
      });
      ElMessage.success('更新成功');
    }

    dialogVisible.value = false;
    await fetchRules();
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || `${formType.value === 'add' ? '添加' : '更新'}失败`);
    }
  }
};

onMounted(() => {
  fetchRules();
});
</script>

<style scoped>
.rule-management {
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