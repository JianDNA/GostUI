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
    state.status = statusData;
    state.error = null;
    
    if (statusData && statusData.portForwards) {
      state.portForwards = statusData.portForwards;
    }
    
    if (statusData && statusData.systemInfo) {
      state.systemInfo = statusData.systemInfo;
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
  async fetchStatus({ commit }) {
    try {
      commit('SET_LOADING', true);
      const response = await request.get('/gost/status');
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