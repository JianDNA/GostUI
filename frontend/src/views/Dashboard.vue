<template>
  <div class="dashboard">
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
import { ref, onMounted } from 'vue';
import { useStore } from 'vuex';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';

const store = useStore();
const loading = ref(false);
const stats = ref(null);
const timeRange = ref('today');

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

const formatTraffic = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

onMounted(() => {
  refreshStats();
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
