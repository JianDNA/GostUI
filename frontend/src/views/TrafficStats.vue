<template>
  <div class="traffic-stats">
    <div class="page-header">
      <h2>流量统计 (双向流量)</h2>
      <div class="header-actions">
        <el-tooltip content="显示上行流量(客户端→服务器)和下行流量(服务器→客户端)的总和" placement="top">
          <el-tag type="info" size="small">包含上行+下行</el-tag>
        </el-tooltip>
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
              <span>总流量 (双向)</span>
              <el-tooltip content="上行+下行流量总和" placement="top">
                <el-tag size="small" type="info">双向</el-tag>
              </el-tooltip>
            </div>
          </template>
          <div class="stat-value">
            <span class="number total">{{ formatTraffic(totalTraffic) }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="stat-card">
          <template #header>
            <div class="card-header">
              <span>上行流量</span>
              <el-tooltip content="客户端→服务器流量" placement="top">
                <el-tag size="small" type="danger">上行</el-tag>
              </el-tooltip>
            </div>
          </template>
          <div class="stat-value">
            <span class="number upload">{{ formatTraffic(uploadTraffic) }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="stat-card">
          <template #header>
            <div class="card-header">
              <span>下行流量</span>
              <el-tooltip content="服务器→客户端流量" placement="top">
                <el-tag size="small" type="success">下行</el-tag>
              </el-tooltip>
            </div>
          </template>
          <div class="stat-value">
            <span class="number download">{{ formatTraffic(downloadTraffic) }}</span>
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
      <el-table-column prop="port" label="端口" width="100" />
      <el-table-column label="上行流量 (客户端→服务器)" width="180">
        <template #default="{ row }">
          <span style="color: #f56c6c;">{{ row.formattedInput }}</span>
        </template>
      </el-table-column>
      <el-table-column label="下行流量 (服务器→客户端)" width="180">
        <template #default="{ row }">
          <span style="color: #67c23a;">{{ row.formattedOutput }}</span>
        </template>
      </el-table-column>
      <el-table-column label="总流量 (双向)" width="120">
        <template #default="{ row }">
          <span style="color: #409eff; font-weight: bold;">{{ row.formattedTotal }}</span>
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
  if (!chart.value || !data) return;

  try {
    // 确保数据存在且格式正确
    const timestamps = data.timestamps || [];
    const uploadData = data.upload || [];
    const downloadData = data.download || [];

    if (timestamps.length === 0) {
      console.log('📊 没有图表数据，显示空图表');
      chart.value.setOption({
        title: {
          text: '暂无数据',
          left: 'center',
          top: 'center',
          textStyle: {
            color: '#999'
          }
        }
      });
      return;
    }

    const option = {
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          label: {
            backgroundColor: '#6a7985'
          }
        },
        formatter: function(params) {
          let result = `${params[0].axisValue}<br/>`;
          params.forEach(param => {
            const color = param.color;
            const value = formatTraffic(param.value || 0);
            result += `<span style="color:${color}">●</span> ${param.seriesName}: ${value}<br/>`;
          });
          return result;
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
        data: timestamps.map(t => {
          try {
            return dayjs(t).format('MM-DD HH:mm');
          } catch (e) {
            return t;
          }
        })
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
          smooth: true,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [{
                offset: 0, color: 'rgba(245, 108, 108, 0.3)'
              }, {
                offset: 1, color: 'rgba(245, 108, 108, 0.1)'
              }]
            }
          },
          lineStyle: {
            color: '#f56c6c'
          },
          emphasis: {
            focus: 'series'
          },
          data: uploadData
        },
        {
          name: '下行流量',
          type: 'line',
          smooth: true,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [{
                offset: 0, color: 'rgba(103, 194, 58, 0.3)'
              }, {
                offset: 1, color: 'rgba(103, 194, 58, 0.1)'
              }]
            }
          },
          lineStyle: {
            color: '#67c23a'
          },
          emphasis: {
            focus: 'series'
          },
          data: downloadData
        }
      ]
    };

    chart.value.setOption(option, true);
    console.log('📊 图表更新成功');
  } catch (error) {
    console.error('❌ 更新图表失败:', error);
    ElMessage.error('图表更新失败');
  }
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
}

.stat-value .number.total {
  color: #409EFF;
}

.stat-value .number.upload {
  color: #f56c6c;
}

.stat-value .number.download {
  color: #67c23a;
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