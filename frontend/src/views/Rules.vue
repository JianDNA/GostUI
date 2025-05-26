<template>
  <Layout>
    <div class="rules-container">
      <div class="rules-header">
        <h2>Port Forwarding Rules</h2>
        <el-button type="primary" @click="showCreateDialog">Create New Rule</el-button>
      </div>

      <el-table v-loading="loading" :data="rules" border style="width: 100%">
        <el-table-column prop="name" label="Name" />
        <el-table-column prop="sourcePort" label="Source Port" width="120" />
        <el-table-column prop="targetHost" label="Target Host" />
        <el-table-column prop="targetPort" label="Target Port" width="120" />
        <el-table-column prop="protocol" label="Protocol" width="100">
          <template #default="{ row }">
            <el-tag :type="row.protocol === 'tcp' ? 'success' : 'warning'">
              {{ row.protocol.toUpperCase() }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="isActive" label="Status" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.isActive" @change="handleStatusChange(row)" />
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="150" fixed="right">
          <template #default="{ row }">
            <el-button-group>
              <el-button size="small" type="primary" @click="handleEdit(row)">Edit</el-button>
              <el-button size="small" type="danger" @click="handleDelete(row)">Delete</el-button>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>

      <!-- 创建/编辑规则对话框 -->
      <el-dialog :title="dialogTitle" v-model="dialogVisible" width="500px">
        <el-form ref="ruleForm" :model="ruleForm" :rules="formRules" label-width="120px">
          <el-form-item label="Name" prop="name">
            <el-input v-model="ruleForm.name" />
          </el-form-item>

          <el-form-item label="Source Port" prop="sourcePort">
            <el-input-number v-model="ruleForm.sourcePort" :min="1" :max="65535" />
          </el-form-item>

          <el-form-item label="Target Host" prop="targetHost">
            <el-input v-model="ruleForm.targetHost" />
          </el-form-item>

          <el-form-item label="Target Port" prop="targetPort">
            <el-input-number v-model="ruleForm.targetPort" :min="1" :max="65535" />
          </el-form-item>

          <el-form-item label="Protocol" prop="protocol">
            <el-select v-model="ruleForm.protocol">
              <el-option label="TCP" value="tcp" />
              <el-option label="UDP" value="udp" />
              <el-option label="TLS" value="tls" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="dialogVisible = false">Cancel</el-button>
            <el-button type="primary" @click="handleSubmit">
              {{ isEdit ? 'Update' : 'Create' }}
            </el-button>
          </span>
        </template>
      </el-dialog>
    </div>
  </Layout>
</template>

<script>
  import { ref, computed, onMounted } from 'vue';
  import { useStore } from 'vuex';
  import { ElMessage, ElMessageBox } from 'element-plus';
  import Layout from '@/components/layout/Layout.vue';

  export default {
    name: 'Rules',
    components: {
      Layout
    },
    setup() {
      const store = useStore();
      const loading = ref(false);
      const dialogVisible = ref(false);
      const isEdit = ref(false);
      const currentId = ref(null);

      const ruleForm = ref({
        name: '',
        sourcePort: 1024,
        targetHost: '',
        targetPort: 80,
        protocol: 'tcp'
      });

      const formRules = {
        name: [
          { required: true, message: 'Please enter rule name', trigger: 'blur' },
          { min: 3, message: 'Length should be at least 3 characters', trigger: 'blur' }
        ],
        sourcePort: [
          { required: true, message: 'Please enter source port', trigger: 'blur' },
          { type: 'number', min: 1, max: 65535, message: 'Port should be between 1 and 65535', trigger: 'blur' }
        ],
        targetHost: [{ required: true, message: 'Please enter target host', trigger: 'blur' }],
        targetPort: [
          { required: true, message: 'Please enter target port', trigger: 'blur' },
          { type: 'number', min: 1, max: 65535, message: 'Port should be between 1 and 65535', trigger: 'blur' }
        ],
        protocol: [{ required: true, message: 'Please select protocol', trigger: 'change' }]
      };

      const dialogTitle = computed(() => (isEdit.value ? 'Edit Rule' : 'Create New Rule'));
      const rulesData = computed(() => store.getters['rules/allRules']);

      const resetForm = () => {
        ruleForm.value = {
          name: '',
          sourcePort: 1024,
          targetHost: '',
          targetPort: 80,
          protocol: 'tcp'
        };
        currentId.value = null;
        isEdit.value = false;
      };

      const showCreateDialog = () => {
        resetForm();
        dialogVisible.value = true;
      };

      const handleEdit = row => {
        currentId.value = row.id;
        isEdit.value = true;
        ruleForm.value = { ...row };
        dialogVisible.value = true;
      };

      const handleDelete = async row => {
        try {
          await ElMessageBox.confirm('Are you sure you want to delete this rule?', 'Warning', {
            confirmButtonText: 'OK',
            cancelButtonText: 'Cancel',
            type: 'warning'
          });

          await store.dispatch('rules/deleteRule', row.id);
          ElMessage.success('Rule deleted successfully');
        } catch (error) {
          if (error !== 'cancel') {
            ElMessage.error(error.message || 'Failed to delete rule');
          }
        }
      };

      const handleStatusChange = async row => {
        try {
          await store.dispatch('rules/updateRule', {
            id: row.id,
            data: { isActive: row.isActive }
          });
          ElMessage.success('Rule status updated successfully');
        } catch (error) {
          ElMessage.error(error.message || 'Failed to update rule status');
          row.isActive = !row.isActive; // Revert the change
        }
      };

      const handleSubmit = async () => {
        try {
          if (isEdit.value) {
            await store.dispatch('rules/updateRule', {
              id: currentId.value,
              data: ruleForm.value
            });
            ElMessage.success('Rule updated successfully');
          } else {
            await store.dispatch('rules/createRule', ruleForm.value);
            ElMessage.success('Rule created successfully');
          }
          dialogVisible.value = false;
        } catch (error) {
          ElMessage.error(error.message || 'Operation failed');
        }
      };

      onMounted(async () => {
        loading.value = true;
        try {
          await store.dispatch('rules/fetchRules');
        } catch (error) {
          ElMessage.error(error.message || 'Failed to load rules');
        } finally {
          loading.value = false;
        }
      });

      return {
        loading,
        rules: rulesData,
        dialogVisible,
        dialogTitle,
        ruleForm,
        isEdit,
        showCreateDialog,
        handleEdit,
        handleDelete,
        handleStatusChange,
        handleSubmit,
        formRules
      };
    }
  };
</script>

<style scoped>
  .rules-container {
    padding: 20px;
  }

  .rules-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .rules-header h2 {
    margin: 0;
  }

  .dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
</style>
