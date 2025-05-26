<template>
  <div class="traffic-stats">
    <div class="page-header">
      <h2>流量统计</h2>
      <div class="header-actions">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          :shortcuts="dateShortcuts"
          @change="handleDateChange"
        />
        <el-button type="primary" @click="refreshData">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="stat-card">
          <template #header>
            <div class="card-header">
              <span>总流量</span>
            </div>
          </template>
          <div class="stat-value">
            <span class="number">{{ formatTraffic(totalTraffic) }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="stat-card">
          <template #header>
            <div class="card-header">
              <span>上行流量</span>
            </div>
          </template>
          <div class="stat-value">
            <span class="number">{{ formatTraffic(uploadTraffic) }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="stat-card">
          <template #header>
            <div class="card-header">
              <span>下行流量</span>
            </div>
          </template>
          <div class="stat-value">
            <span class="number">{{ formatTraffic(downloadTraffic) }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <div class="chart-container">
      <el-card>
        <template #header>
          <div class="card-header">
            <span>流量趋势</span>
          </div>
        </template>
        <div ref="chartRef" style="height: 400px"></div>
      </el-card>
    </div>

    <el-table
      v-loading="loading"
      :data="trafficLogs"
      border
      style="width: 100%; margin-top: 20px"
    >
      <el-table-column prop="timestamp" label="时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.timestamp) }}
        </template>
      </el-table-column>
      <el-table-column prop="ruleName" label="规则名称" width="150" />
      <el-table-column prop="sourceIP" label="源IP" width="150" />
      <el-table-column prop="destinationIP" label="目标IP" width="150" />
      <el-table-column prop="upload" label="上行流量" width="120">
        <template #default="{ row }">
          {{ formatTraffic(row.upload) }}
        </template>
      </el-table-column>
      <el-table-column prop="download" label="下行流量" width="120">
        <template #default="{ row }">
          {{ formatTraffic(row.download) }}
        </template>
      </el-table-column>
      <el-table-column prop="protocol" label="协议" width="100">
        <template #default="{ row }">
          <el-tag>{{ row.protocol }}</el-tag>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useStore } from 'vuex';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import * as echarts from 'echarts';
import dayjs from 'dayjs';

const store = useStore();
const loading = ref(false);
const chartRef = ref(null);
const chart = ref(null);
const dateRange = ref([]);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);
const trafficLogs = ref([]);
const totalTraffic = ref(0);
const uploadTraffic = ref(0);
const downloadTraffic = ref(0);

// 日期快捷选项
const dateShortcuts = [
  {
    text: '最近一周',
    value: () => {
      const end = new Date();
      const start = new Date();
      start.setTime(start.getTime() - 3600 * 1000 * 24 * 7);
      return [start, end];
    }
  },
  {
    text: '最近一月',
    value: () => {
      const end = new Date();
      const start = new Date();
      start.setTime(start.getTime() - 3600 * 1000 * 24 * 30);
      return [start, end];
    }
  },
  {
    text: '最近三月',
    value: () => {
      const end = new Date();
      const start = new Date();
      start.setTime(start.getTime() - 3600 * 1000 * 24 * 90);
      return [start, end];
    }
  }
];

// 格式化流量数据
const formatTraffic = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 格式化日期
const formatDate = (timestamp) => {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss');
};

// 获取流量数据
const fetchTrafficData = async () => {
  try {
    loading.value = true;
    const [start, end] = dateRange.value || [];
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      startDate: start?.toISOString(),
      endDate: end?.toISOString()
    };

    const { data } = await store.dispatch('traffic/fetchTrafficLogs', params);
    trafficLogs.value = data.logs;
    total.value = data.total;
    totalTraffic.value = data.stats.total;
    uploadTraffic.value = data.stats.upload;
    downloadTraffic.value = data.stats.download;

    updateChart(data.chartData);
  } catch (error) {
    ElMessage.error(error.message || '获取流量数据失败');
  } finally {
    loading.value = false;
  }
};

// 更新图表
const updateChart = (data) => {
  if (!chart.value) return;

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: {
          backgroundColor: '#6a7985'
        }
      }
    },
    legend: {
      data: ['上行流量', '下行流量']
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.timestamps.map(t => dayjs(t).format('MM-DD HH:mm'))
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: value => formatTraffic(value)
      }
    },
    series: [
      {
        name: '上行流量',
        type: 'line',
        stack: 'Total',
        areaStyle: {},
        emphasis: {
          focus: 'series'
        },
        data: data.upload
      },
      {
        name: '下行流量',
        type: 'line',
        stack: 'Total',
        areaStyle: {},
        emphasis: {
          focus: 'series'
        },
        data: data.download
      }
    ]
  };

  chart.value.setOption(option);
};

// 初始化图表
const initChart = () => {
  if (chartRef.value) {
    chart.value = echarts.init(chartRef.value);
    window.addEventListener('resize', handleResize);
  }
};

// 处理窗口大小变化
const handleResize = () => {
  chart.value?.resize();
};

// 处理日期变化
const handleDateChange = () => {
  currentPage.value = 1;
  fetchTrafficData();
};

// 处理页码变化
const handleCurrentChange = (page) => {
  currentPage.value = page;
  fetchTrafficData();
};

// 处理每页条数变化
const handleSizeChange = (size) => {
  pageSize.value = size;
  currentPage.value = 1;
  fetchTrafficData();
};

// 刷新数据
const refreshData = () => {
  fetchTrafficData();
};

onMounted(() => {
  initChart();
  // 设置默认日期范围为最近一周
  dateRange.value = dateShortcuts[0].value();
  fetchTrafficData();
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  chart.value?.dispose();
});
</script>

<style scoped>
.traffic-stats {
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

.header-actions {
  display: flex;
  gap: 10px;
}

.stat-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-value {
  text-align: center;
  padding: 20px 0;
}

.stat-value .number {
  font-size: 24px;
  font-weight: bold;
  color: #409EFF;
}

.chart-container {
  margin: 20px 0;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style> 