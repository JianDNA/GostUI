<template>
  <Layout>
    <div class="traffic-container">
      <div class="traffic-header">
        <h2>Traffic Statistics</h2>
        <el-radio-group v-model="period" size="large">
          <el-radio-button label="day">Day</el-radio-button>
          <el-radio-button label="week">Week</el-radio-button>
          <el-radio-button label="month">Month</el-radio-button>
        </el-radio-group>
      </div>

      <el-row :gutter="20">
        <!-- 总流量统计卡片 -->
        <el-col :span="8">
          <el-card class="traffic-card">
            <template #header>
              <div class="card-header">
                <span>Total Traffic</span>
              </div>
            </template>
            <div class="traffic-stats">
              <h3>{{ formattedTotalTraffic }}</h3>
              <div class="stats-details">
                <p>
                  <i class="el-icon-download"></i>
                  In: {{ formattedInTraffic }}
                </p>
                <p>
                  <i class="el-icon-upload"></i>
                  Out: {{ formattedOutTraffic }}
                </p>
              </div>
            </div>
          </el-card>
        </el-col>

        <!-- 流量限制卡片 -->
        <el-col :span="8">
          <el-card class="traffic-card">
            <template #header>
              <div class="card-header">
                <span>Traffic Usage</span>
              </div>
            </template>
            <div class="traffic-stats">
              <el-progress type="dashboard" :percentage="usagePercentage" :color="usageColor" />
              <p class="usage-text">{{ formattedUsedTraffic }} / {{ formattedLimitTraffic }}</p>
            </div>
          </el-card>
        </el-col>

        <!-- 活跃规则卡片 -->
        <el-col :span="8">
          <el-card class="traffic-card">
            <template #header>
              <div class="card-header">
                <span>Active Rules</span>
              </div>
            </template>
            <div class="traffic-stats">
              <h3>{{ activeRulesCount }}</h3>
              <p>Port Forwarding Rules</p>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 流量图表 -->
      <el-row :gutter="20" class="chart-row">
        <el-col :span="24">
          <el-card>
            <template #header>
              <div class="card-header">
                <span>Traffic History</span>
              </div>
            </template>
            <div class="chart-container">
              <LineChart v-if="chartData" :chart-data="chartData" :options="chartOptions" />
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 规则流量表格 -->
      <el-row :gutter="20" class="table-row">
        <el-col :span="24">
          <el-card>
            <template #header>
              <div class="card-header">
                <span>Rule Traffic Details</span>
              </div>
            </template>
            <el-table :data="ruleTrafficData" border style="width: 100%">
              <el-table-column prop="name" label="Rule Name" />
              <el-table-column prop="sourcePort" label="Source Port" width="120" />
              <el-table-column prop="targetHost" label="Target Host" />
              <el-table-column prop="targetPort" label="Target Port" width="120" />
              <el-table-column label="Inbound" width="150">
                <template #default="{ row }">
                  {{ formatBytes(row.bytesIn) }}
                </template>
              </el-table-column>
              <el-table-column label="Outbound" width="150">
                <template #default="{ row }">
                  {{ formatBytes(row.bytesOut) }}
                </template>
              </el-table-column>
              <el-table-column label="Total" width="150">
                <template #default="{ row }">
                  {{ formatBytes(row.bytesIn + row.bytesOut) }}
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </Layout>
</template>

<script>
  import { ref, computed, onMounted, watch } from 'vue';
  import { useStore } from 'vuex';
  import Layout from '@/components/layout/Layout.vue';
  import { Line as LineChart } from 'vue-chartjs';
  import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
  } from 'chart.js';

  ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

  export default {
    name: 'Traffic',
    components: {
      Layout,
      LineChart
    },
    setup() {
      const store = useStore();
      const period = ref('day');
      const stats = ref(null);

      const formatBytes = bytes => {
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) return '0 B';
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
      };

      // 计算总流量
      const formattedTotalTraffic = computed(() => {
        if (!stats.value) return '0 B';
        return formatBytes(stats.value.totalBytesIn + stats.value.totalBytesOut);
      });

      const formattedInTraffic = computed(() => {
        if (!stats.value) return '0 B';
        return formatBytes(stats.value.totalBytesIn);
      });

      const formattedOutTraffic = computed(() => {
        if (!stats.value) return '0 B';
        return formatBytes(stats.value.totalBytesOut);
      });

      // 计算使用百分比
      const user = computed(() => store.getters['user/currentUser']);
      const usagePercentage = computed(() => {
        if (!stats.value || !user.value) return 0;
        const used = stats.value.totalBytesIn + stats.value.totalBytesOut;
        const limit = user.value.trafficLimit;
        return Math.min(Math.round((used / limit) * 100), 100);
      });

      const usageColor = computed(() => {
        const percentage = usagePercentage.value;
        if (percentage < 70) return '#67C23A';
        if (percentage < 90) return '#E6A23C';
        return '#F56C6C';
      });

      const formattedUsedTraffic = computed(() => {
        if (!stats.value) return '0 B';
        return formatBytes(stats.value.totalBytesIn + stats.value.totalBytesOut);
      });

      const formattedLimitTraffic = computed(() => {
        if (!user.value) return '0 B';
        return formatBytes(user.value.trafficLimit);
      });

      // 活跃规则数
      const rules = computed(() => store.getters['rules/allRules']);
      const activeRulesCount = computed(() => rules.value.filter(rule => rule.isActive).length);

      // 图表数据
      const chartData = computed(() => ({
        labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
        datasets: [
          {
            label: 'Inbound Traffic',
            data: [65, 59, 80, 81, 56, 55],
            borderColor: '#409EFF',
            tension: 0.4
          },
          {
            label: 'Outbound Traffic',
            data: [28, 48, 40, 19, 86, 27],
            borderColor: '#67C23A',
            tension: 0.4
          }
        ]
      }));

      const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        }
      };

      // 规则流量数据
      const ruleTrafficData = computed(() => {
        if (!stats.value || !stats.value.byRule) return [];
        return Object.entries(stats.value.byRule).map(([id, data]) => ({
          id,
          ...data
        }));
      });

      // 加载数据
      const loadData = async () => {
        try {
          await store.dispatch('rules/fetchRules');
          const response = await store.dispatch('traffic/fetchStats', {
            userId: user.value.id,
            period: period.value
          });
          stats.value = response;
        } catch (error) {
          console.error('Failed to load traffic data:', error);
        }
      };

      onMounted(loadData);
      watch(period, loadData);

      return {
        period,
        formatBytes,
        formattedTotalTraffic,
        formattedInTraffic,
        formattedOutTraffic,
        usagePercentage,
        usageColor,
        formattedUsedTraffic,
        formattedLimitTraffic,
        activeRulesCount,
        chartData,
        chartOptions,
        ruleTrafficData
      };
    }
  };
</script>

<style scoped>
  .traffic-container {
    padding: 20px;
  }

  .traffic-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }

  .traffic-header h2 {
    margin: 0;
  }

  .traffic-card {
    margin-bottom: 20px;
    height: 100%;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .traffic-stats {
    text-align: center;
    padding: 20px 0;
  }

  .traffic-stats h3 {
    font-size: 24px;
    margin: 0 0 10px;
    color: #409eff;
  }

  .stats-details {
    text-align: left;
    margin-top: 20px;
  }

  .stats-details p {
    margin: 5px 0;
    color: #606266;
  }

  .stats-details i {
    margin-right: 8px;
  }

  .usage-text {
    margin-top: 15px;
    color: #606266;
  }

  .chart-row {
    margin-top: 20px;
  }

  .chart-container {
    height: 400px;
  }

  .table-row {
    margin-top: 20px;
  }
</style>
