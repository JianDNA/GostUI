import request from '@/utils/request';

const state = {
  rules: [],
  loading: false,
  error: null
};

const mutations = {
  SET_RULES(state, rules) {
    state.rules = rules;
  },
  SET_LOADING(state, loading) {
    state.loading = loading;
  },
  SET_ERROR(state, error) {
    state.error = error;
  }
};

const actions = {
  // 获取规则列表
  async fetchRules({ commit }) {
    try {
      commit('SET_LOADING', true);
      const { data } = await request.get('/rules');
      commit('SET_RULES', data);
      return data;
    } catch (error) {
      commit('SET_ERROR', error.message || '获取规则列表失败');
      throw error;
    } finally {
      commit('SET_LOADING', false);
    }
  },

  // 创建规则
  async createRule({ dispatch }, ruleData) {
    try {
      await request.post('/rules', ruleData);
      await dispatch('fetchRules');
    } catch (error) {
      throw error.response?.data?.message || '创建规则失败';
    }
  },

  // 更新规则
  async updateRule({ dispatch }, { id, data }) {
    try {
      await request.put(`/rules/${id}`, data);
      await dispatch('fetchRules');
    } catch (error) {
      throw error.response?.data?.message || '更新规则失败';
    }
  },

  // 删除规则
  async deleteRule({ dispatch }, id) {
    try {
      await request.delete(`/rules/${id}`);
      await dispatch('fetchRules');
    } catch (error) {
      throw error.response?.data?.message || '删除规则失败';
    }
  }
};

const getters = {
  rules: state => state.rules,
  loading: state => state.loading,
  error: state => state.error
};

export default {
  namespaced: true,
  state,
  mutations,
  actions,
  getters
}; 