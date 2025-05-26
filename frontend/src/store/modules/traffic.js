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
      const { data } = await request.get('/traffic/stats');
      commit('SET_STATS', data);
      return data;
    } catch (error) {
      console.error('Fetch traffic stats error:', error);
      commit('SET_ERROR', error.response?.data?.message || '获取流量统计失败');
      throw error;
    } finally {
      commit('SET_LOADING', false);
    }
  },

  async fetchTopUsers({ commit }, { period, limit }) {
    try {
      commit('SET_LOADING', true);
      const users = await request.get('/traffic/top-users', { params: { period, limit } });
      commit('SET_TOP_USERS', users);
      return users;
    } catch (error) {
      commit('SET_ERROR', error.message);
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
