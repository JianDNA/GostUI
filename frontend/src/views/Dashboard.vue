<template>
  <div class="dashboard">
    <!-- Gost服务状态卡片 -->
    <el-card class="dashboard-card">
      <template #header>
        <div class="card-header">
          <span>Gost服务状态</span>
          <div>
            <el-button link @click="refreshGostStatus">
              <el-icon><Refresh /></el-icon>
            </el-button>
            <el-button type="success" size="small" @click="startGost" v-if="!gostRunning">
              启动服务
            </el-button>
            <el-button type="danger" size="small" @click="stopGost" v-else>
              停止服务
            </el-button>
            <el-button type="primary" size="small" @click="restartGost">
              重启服务
            </el-button>
          </div>
        </div>
      </template>
      <el-row :gutter="20" v-loading="gostLoading">
        <el-col :span="8">
          <div class="stat-card">
            <div class="stat-title">服务状态</div>
            <div class="stat-value" :class="{'success': gostRunning, 'danger': !gostRunning}">
              {{ gostRunning ? '运行中' : '已停止' }}
            </div>
          </div>
        </el-col>
        <el-col :span="8" v-if="gostRunning">
          <div class="stat-card">
            <div class="stat-title">进程ID</div>
            <div class="stat-value">{{ gostStatus?.pid || 'N/A' }}</div>
          </div>
        </el-col>
        <el-col :span="8" v-if="gostRunning && gostSystemInfo">
          <div class="stat-card">
            <div class="stat-title">运行时间</div>
            <div class="stat-value">{{ formatUptime(gostSystemInfo.uptime) }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 端口转发信息卡片 -->
    <el-card class="dashboard-card" v-if="gostPortForwards?.length > 0">
      <template #header>
        <div class="card-header">
          <span>端口转发详情</span>
          <el-tag effect="dark" size="small" type="success">{{ gostPortForwards.length }} 个活跃规则</el-tag>
        </div>
      </template>
      <el-table :data="gostPortForwards" stripe style="width: 100%" v-loading="gostLoading">
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="protocol" label="协议" />
        <el-table-column label="转发规则">
          <template #default="scope">
            <el-tag type="primary">
              {{ scope.row.sourcePort }}
              <el-icon><Right /></el-icon>
              {{ scope.row.targetHost }}:{{ scope.row.targetPort }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="dashboard-card">
      <template #header>
        <div class="card-header">
          <span>系统概览</span>
          <el-button link @click="refreshStats">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
      </template>
      <el-row :gutter="20" v-loading="loading">
        <el-col :span="8">
          <div class="stat-card">
            <div class="stat-title">活跃用户</div>
            <div class="stat-value">{{ stats?.activeUsers || 0 }}</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="stat-card">
            <div class="stat-title">活跃规则</div>
            <div class="stat-value">{{ stats?.activeRules || 0 }}</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="stat-card">
            <div class="stat-title">总流量</div>
            <div class="stat-value">{{ formatTraffic(stats?.totalTraffic || 0) }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <el-card class="dashboard-card">
      <template #header>
        <div class="card-header">
          <span>流量统计</span>
          <el-select v-model="timeRange" placeholder="选择时间范围" @change="refreshStats">
            <el-option label="今日" value="today" />
            <el-option label="本周" value="week" />
            <el-option label="本月" value="month" />
          </el-select>
        </div>
      </template>
      <!-- 这里可以添加流量图表 -->
      <div class="chart-placeholder">
        流量统计图表将在这里显示
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useStore } from 'vuex';
import { ElMessage } from 'element-plus';
import { Refresh, Right } from '@element-plus/icons-vue';

const store = useStore();
const loading = ref(false);
const stats = ref(null);
const timeRange = ref('today');
const gostLoading = ref(false);
const gostStatus = ref(null);

const gostRunning = computed(() => store.getters['gost/isRunning']);
const gostPortForwards = computed(() => store.getters['gost/portForwards']);
const gostSystemInfo = computed(() => store.getters['gost/systemInfo']);

const refreshStats = async () => {
  try {
    loading.value = true;
    stats.value = await store.dispatch('traffic/fetchStats');
  } catch (error) {
    ElMessage.error(error.message || '获取统计数据失败');
  } finally {
    loading.value = false;
  }
};

const refreshGostStatus = async () => {
  try {
    gostLoading.value = true;
    gostStatus.value = await store.dispatch('gost/fetchStatus');
  } catch (error) {
    ElMessage.error(error.message || '获取Gost服务状态失败');
  } finally {
    gostLoading.value = false;
  }
};

const startGost = async () => {
  try {
    await store.dispatch('gost/startService');
    ElMessage.success('Gost服务启动成功');
  } catch (error) {
    ElMessage.error(error.message || '启动Gost服务失败');
  }
};

const stopGost = async () => {
  try {
    await store.dispatch('gost/stopService');
    ElMessage.success('Gost服务已停止');
  } catch (error) {
    ElMessage.error(error.message || '停止Gost服务失败');
  }
};

const restartGost = async () => {
  try {
    await store.dispatch('gost/restartService');
    ElMessage.success('Gost服务已重启');
  } catch (error) {
    ElMessage.error(error.message || '重启Gost服务失败');
  }
};

const formatTraffic = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUptime = (seconds) => {
  if (!seconds) return '未知';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  let result = '';
  if (days > 0) result += `${days}天 `;
  if (hours > 0 || days > 0) result += `${hours}小时 `;
  result += `${minutes}分钟`;
  
  return result;
};

onMounted(() => {
  refreshStats();
  refreshGostStatus();
});
</script>

<style scoped>
.dashboard {
  padding: 20px;
}

.dashboard-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-card {
  padding: 20px;
  text-align: center;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.stat-title {
  font-size: 14px;
  color: #606266;
  margin-bottom: 10px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #409EFF;
}

.stat-value.success {
  color: #67C23A;
}

.stat-value.danger {
  color: #F56C6C;
}

.chart-placeholder {
  height: 300px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #f8f9fa;
  border-radius: 4px;
  color: #909399;
}
</style>
