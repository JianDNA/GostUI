import request from '@/utils/request';

const state = {
  status: null,
  loading: false,
  error: null,
  portForwards: [],
  systemInfo: null
};

const mutations = {
  SET_STATUS(state, statusData) {
    console.log('🔧 Setting GOST status data:', statusData);
    state.status = statusData;
    state.error = null;

    // 处理端口转发数据
    if (statusData && statusData.portForwards) {
      state.portForwards = statusData.portForwards;
      console.log('📊 Port forwards:', statusData.portForwards);
    } else {
      state.portForwards = [];
    }

    // 处理系统信息
    if (statusData && statusData.systemInfo) {
      state.systemInfo = statusData.systemInfo;
      console.log('💻 System info:', statusData.systemInfo);
    } else {
      state.systemInfo = null;
    }
  },
  SET_LOADING(state, loading) {
    state.loading = loading;
  },
  SET_ERROR(state, error) {
    state.error = error;
  }
};

const actions = {
  async fetchStatus({ commit, rootGetters }) {
    try {
      commit('SET_LOADING', true);

      // 根据用户权限选择不同的API端点
      const isAdmin = rootGetters['user/isAdmin'];
      const endpoint = isAdmin ? '/gost/status' : '/gost/status/basic';

      const response = await request.get(endpoint);
      commit('SET_STATUS', response.data.data);
      return response.data.data;
    } catch (error) {
      console.error('获取Gost状态失败:', error);
      commit('SET_ERROR', error.response?.data?.message || '获取Gost服务状态失败');
      throw error;
    } finally {
      commit('SET_LOADING', false);
    }
  },
  
  async startService({ commit, dispatch }) {
    try {
      commit('SET_LOADING', true);
      await request.post('/gost/start');
      return dispatch('fetchStatus');
    } catch (error) {
      commit('SET_ERROR', error.response?.data?.message || '启动Gost服务失败');
      throw error;
    } finally {
      commit('SET_LOADING', false);
    }
  },
  
  async stopService({ commit, dispatch }) {
    try {
      commit('SET_LOADING', true);
      await request.post('/gost/stop');
      return dispatch('fetchStatus');
    } catch (error) {
      commit('SET_ERROR', error.response?.data?.message || '停止Gost服务失败');
      throw error;
    } finally {
      commit('SET_LOADING', false);
    }
  },
  
  async restartService({ commit, dispatch }) {
    try {
      commit('SET_LOADING', true);
      await request.post('/gost/restart');
      return dispatch('fetchStatus');
    } catch (error) {
      commit('SET_ERROR', error.response?.data?.message || '重启Gost服务失败');
      throw error;
    } finally {
      commit('SET_LOADING', false);
    }
  }
};

const getters = {
  isRunning: state => state.status?.isRunning || false,
  pid: state => state.status?.pid,
  portForwards: state => state.portForwards || [],
  systemInfo: state => state.systemInfo,
  isLoading: state => state.loading,
  hasError: state => !!state.error,
  errorMessage: state => state.error
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
}; 