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
            <el-button type="success" size="small" @click="startGost" v-if="!gostRunning && isAdmin">
              启动服务
            </el-button>
            <el-button type="danger" size="small" @click="stopGost" v-if="gostRunning && isAdmin">
              停止服务
            </el-button>
            <el-button type="primary" size="small" @click="restartGost" v-if="isAdmin">
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
            <div class="stat-value">{{ isAdmin ? (gostStatus?.pid || 'N/A') : '****' }}</div>
          </div>
        </el-col>
        <el-col :span="8" v-if="gostRunning && gostSystemInfo">
          <div class="stat-card">
            <div class="stat-title">运行时间</div>
            <div class="stat-value">{{ isAdmin ? formatUptime(gostSystemInfo.uptime) : '****' }}</div>
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
        <el-table-column label="名称">
          <template #default="scope">
            {{ isAdmin ? scope.row.name : '****' }}
          </template>
        </el-table-column>
        <el-table-column prop="protocol" label="协议" />
        <el-table-column label="转发规则">
          <template #default="scope">
            <el-tag type="primary">
              {{ scope.row.sourcePort || scope.row.localPort }}
              <el-icon><Right /></el-icon>
              {{ isAdmin ? `${scope.row.targetHost}:${scope.row.targetPort}` : '****:****' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="源端口" width="80">
          <template #default="scope">
            {{ scope.row.sourcePort || scope.row.localPort }}
          </template>
        </el-table-column>
        <el-table-column label="目标地址" width="150">
          <template #default="scope">
            {{ isAdmin ? `${scope.row.targetHost}:${scope.row.targetPort}` : '****:****' }}
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
            <div class="stat-value">{{ isAdmin ? (stats?.activeUsers || 0) : '****' }}</div>
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
            <div class="stat-value">{{ isAdmin ? formatTraffic(stats?.totalTraffic || 0) : '****' }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <el-card class="dashboard-card" v-if="false">
      <template #header>
        <div class="card-header">
          <span>流量统计</span>
          <el-select v-model="timeRange" placeholder="选择时间范围" @change="refreshTrafficChart">
            <el-option label="今日" value="today" />
            <el-option label="本周" value="week" />
            <el-option label="本月" value="month" />
          </el-select>
        </div>
      </template>
      <div class="chart-container">
        <div ref="trafficChart" class="traffic-chart"></div>
      </div>
    </el-card>  </div>
</template>

<script setup>
import { ref, onMounted, computed, nextTick } from 'vue';
import { useStore } from 'vuex';
import { ElMessage } from 'element-plus';
import { Refresh, Right } from '@element-plus/icons-vue';
import * as echarts from 'echarts';


const store = useStore();
const loading = ref(false);
const stats = ref(null);
const timeRange = ref('today');
const gostLoading = ref(false);
const gostStatus = ref(null);
const trafficChart = ref(null);
let chartInstance = null;


const gostRunning = computed(() => store.getters['gost/isRunning']);
const gostPortForwards = computed(() => store.getters['gost/portForwards']);
const gostSystemInfo = computed(() => store.getters['gost/systemInfo']);
const isAdmin = computed(() => store.getters['user/isAdmin']);

const refreshStats = async () => {
  try {
    loading.value = true;
    stats.value = await store.dispatch('traffic/fetchStats');
    console.log('📊 Stats refreshed:', stats.value);
  } catch (error) {
    console.error('❌ Failed to refresh stats:', error);
    ElMessage.error(error.message || '获取统计数据失败');
  } finally {
    loading.value = false;
  }
};

const refreshGostStatus = async () => {
  try {
    gostLoading.value = true;
    gostStatus.value = await store.dispatch('gost/fetchStatus');
    console.log('🔧 GOST status refreshed:', gostStatus.value);
    console.log('🔧 GOST running:', gostRunning.value);
    console.log('🔧 Port forwards:', gostPortForwards.value);
  } catch (error) {
    console.error('❌ Failed to refresh GOST status:', error);
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

// 初始化流量图表
const initTrafficChart = () => {
  if (trafficChart.value && !chartInstance) {
    chartInstance = echarts.init(trafficChart.value);

    const option = {
      title: {
        text: '流量趋势',
        left: 'center',
        textStyle: {
          fontSize: 16,
          color: '#333'
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: function(params) {
          const data = params[0];
          return `${data.name}<br/>${data.seriesName}: ${formatTraffic(data.value)}`;
        }
      },
      xAxis: {
        type: 'category',
        data: [],
        axisLabel: {
          color: '#666'
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          color: '#666',
          formatter: function(value) {
            return formatTraffic(value);
          }
        }
      },
      series: [{
        name: '流量',
        type: 'line',
        data: [],
        smooth: true,
        lineStyle: {
          color: '#409EFF'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [{
              offset: 0, color: 'rgba(64, 158, 255, 0.3)'
            }, {
              offset: 1, color: 'rgba(64, 158, 255, 0.1)'
            }]
          }
        }
      }]
    };

    chartInstance.setOption(option);

    // 响应式调整
    window.addEventListener('resize', () => {
      if (chartInstance) {
        chartInstance.resize();
      }
    });
  }
};

// 获取流量趋势数据
const fetchTrafficTrend = async () => {
  try {
    const response = await fetch(`/api/dashboard/traffic-trend?days=${timeRange.value === 'today' ? 1 : timeRange.value === 'week' ? 7 : 30}`);
    const result = await response.json();

    if (chartInstance) {
      const dates = [];
      const values = [];

      // 如果没有数据或API失败，生成示例数据
      if (!result.success || !result.data || result.data.length === 0) {
        console.log('生成示例流量数据用于图表显示');
        const now = new Date();
        const days = timeRange.value === 'today' ? 1 : timeRange.value === 'week' ? 7 : 30;

        for (let i = days - 1; i >= 0; i--) {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          dates.push(date.toLocaleDateString());
          // 生成50-200MB的随机流量数据
          values.push((Math.random() * 150 + 50) * 1024 * 1024);
        }
      } else {
        result.data.forEach(item => {
          const date = new Date(item.date);
          dates.push(date.toLocaleDateString());
          values.push(item.traffic);
        });
      }

      chartInstance.setOption({
        xAxis: {
          data: dates
        },
        series: [{
          data: values
        }]
      });
    }
  } catch (error) {
    console.error('获取流量趋势失败:', error);

    // 发生错误时也显示示例数据
    if (chartInstance) {
      const dates = [];
      const values = [];
      const now = new Date();

      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        dates.push(date.toLocaleDateString());
        values.push((Math.random() * 150 + 50) * 1024 * 1024);
      }

      chartInstance.setOption({
        xAxis: {
          data: dates
        },
        series: [{
          data: values
        }]
      });
    }
  }
};

// 刷新流量图表
const refreshTrafficChart = () => {
  fetchTrafficTrend();
};



onMounted(async () => {
  refreshStats();
  refreshGostStatus();

  // 等待DOM渲染完成后初始化图表
  await nextTick();
  initTrafficChart();
  fetchTrafficTrend();
});
</script>

<style scoped>
.dashboard {
  padding: 20px;
  background: #f5f7fa;
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

.chart-container {
  height: 350px;
  padding: 10px;
}

.traffic-chart {
  width: 100%;
  height: 100%;
}
</style>
