import request from '@/utils/request';

const state = {
  rules: [],
  loading: false,
  error: null
};

const getters = {
  allRules: state => state.rules,
  isLoading: state => state.loading,
  error: state => state.error
};

const actions = {
  async fetchRules({ commit }) {
    try {
      commit('setLoading', true);
      const { data } = await request.get('/rules');
      commit('setRules', data);
      return data;
    } catch (error) {
      console.error('Fetch rules error:', error);
      commit('setError', error.response?.data?.message || '获取规则列表失败');
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },

  async createRule({ commit }, ruleData) {
    try {
      const { data } = await request.post('/rules', { data: ruleData });
      commit('addRule', data);
      return data;
    } catch (error) {
      console.error('Create rule error:', error);
      throw error.response?.data?.message || '创建规则失败';
    }
  },

  async updateRule({ commit }, { id, data }) {
    try {
      const response = await request.put(`/rules/${id}`, { data });
      commit('updateRuleInList', response.data);
      return response.data;
    } catch (error) {
      console.error('Update rule error:', error);
      throw error.response?.data?.message || '更新规则失败';
    }
  },

  async deleteRule({ commit }, id) {
    try {
      await request.delete(`/rules/${id}`);
      commit('removeRule', id);
    } catch (error) {
      console.error('Delete rule error:', error);
      throw error.response?.data?.message || '删除规则失败';
    }
  }
};

const mutations = {
  setRules(state, rules) {
    state.rules = rules;
    state.error = null;
  },
  addRule(state, rule) {
    state.rules.push(rule);
    state.error = null;
  },
  updateRuleInList(state, updatedRule) {
    const index = state.rules.findIndex(rule => rule.id === updatedRule.id);
    if (index !== -1) {
      state.rules.splice(index, 1, updatedRule);
    }
    state.error = null;
  },
  removeRule(state, id) {
    state.rules = state.rules.filter(rule => rule.id !== id);
    state.error = null;
  },
  setLoading(state, loading) {
    state.loading = loading;
  },
  setError(state, error) {
    state.error = error;
  }
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations
};
