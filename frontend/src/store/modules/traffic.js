import request from '@/utils/request';

const state = {
  stats: null,
  topUsers: [],
  loading: false,
  error: null
};

const mutations = {
  SET_STATS(state, stats) {
    state.stats = stats;
    state.error = null;
  },
  SET_TOP_USERS(state, users) {
    state.topUsers = users;
  },
  SET_LOADING(state, loading) {
    state.loading = loading;
  },
  SET_ERROR(state, error) {
    state.error = error;
  }
};

const actions = {
  async fetchStats({ commit }) {
    try {
      commit('SET_LOADING', true);
      // 使用新的 dashboard API
      const response = await request.get('/dashboard/overview');
      console.log('📊 Dashboard API response:', response.data);

      const dashboardData = response.data.data;

      // 转换数据格式以兼容现有组件
      const stats = {
        activeUsers: dashboardData.users.active,
        totalUsers: dashboardData.users.total,
        activeRules: dashboardData.rules.total,
        totalTraffic: dashboardData.traffic.totalUsed,
        totalBytesIn: Math.floor(dashboardData.traffic.totalUsed * 0.4), // 估算
        totalBytesOut: Math.floor(dashboardData.traffic.totalUsed * 0.6), // 估算
        traffic24h: dashboardData.traffic.total24h,
        activeUsers24h: dashboardData.traffic.activeUsers24h
      };

      console.log('📈 Processed stats:', stats);
      commit('SET_STATS', stats);
      return stats;
    } catch (error) {
      console.error('Fetch traffic stats error:', error);
      commit('SET_ERROR', error.response?.data?.message || '获取流量统计失败');
      throw error;
    } finally {
      commit('SET_LOADING', false);
    }
  },

  async fetchTopUsers({ commit }, { period = 7, limit = 10 }) {
    try {
      commit('SET_LOADING', true);
      // 使用新的 dashboard API
      const response = await request.get('/dashboard/traffic-ranking', {
        params: { days: period, limit }
      });
      const users = response.data.data;
      commit('SET_TOP_USERS', users);
      return users;
    } catch (error) {
      commit('SET_ERROR', error.message);
      throw error;
    } finally {
      commit('SET_LOADING', false);
    }
  },

  async fetchTrafficLogs({ commit }, params = {}) {
    try {
      commit('SET_LOADING', true);
      console.log('📊 Fetching traffic logs with params:', params);

      // 调用真实的流量日志 API
      const response = await request.get('/traffic/logs', { params });
      console.log('📊 Traffic logs API response:', response.data);

      const data = response.data.data;

      // 确保数据格式正确
      const formattedData = {
        logs: data.logs || [],
        total: data.total || 0,
        stats: {
          total: data.stats?.total || 0,
          upload: data.stats?.upload || 0,
          download: data.stats?.download || 0
        },
        chartData: {
          timestamps: data.chartData?.timestamps || [],
          upload: data.chartData?.upload || [],
          download: data.chartData?.download || []
        }
      };

      console.log('📊 Formatted traffic logs data:', formattedData);
      return { data: formattedData };
    } catch (error) {
      console.error('❌ Failed to fetch traffic logs:', error);
      commit('SET_ERROR', error.response?.data?.message || error.message);
      throw error;
    } finally {
      commit('SET_LOADING', false);
    }
  }
};

const getters = {
  trafficStats: state => state.stats,
  topUsers: state => state.topUsers,
  isLoading: state => state.loading,
  hasError: state => !!state.error,
  errorMessage: state => state.error,

  // Helper getters for formatted data
  totalTraffic: state => {
    if (!state.stats) return 0;
    return state.stats.totalBytesIn + state.stats.totalBytesOut;
  },

  formattedTraffic: (state, getters) => {
    const bytes = getters.totalTraffic;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
  }
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
};
