import request from '@/utils/request';

const state = {
  currentUser: JSON.parse(localStorage.getItem('user')) || null,
  token: localStorage.getItem('token') || null,
  users: [],
  loading: false,
  error: null
};

const getters = {
  currentUser: state => state.currentUser,
  allUsers: state => state.users,
  isAdmin: state => state.currentUser?.role === 'admin',
  isLoading: state => state.loading,
  error: state => state.error,
  isAuthenticated: state => !!state.token,
  token: state => state.token
};

const actions = {
  // 初始化用户状态
  async initializeAuth({ dispatch, state }) {
    if (state.token) {
      try {
        await dispatch('getCurrentUser');
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        dispatch('logout');
      }
    }
  },

  async login({ commit, dispatch }, credentials) {
    try {
      const { data } = await request.post('/auth/login', credentials);
      commit('SET_TOKEN', data.token);
      commit('SET_CURRENT_USER', data.user);
      return data.user;
    } catch (error) {
      throw error.response?.data?.message || '登录失败';
    }
  },

  async logout({ commit }, skipRequest = false) {
    try {
      // 如果不跳过请求且有token，则发送logout请求
      if (!skipRequest && commit.state?.token) {
        await request.post('/auth/logout');
      }
    } catch (error) {
      console.error('Logout error:', error);
      // 即使logout请求失败，也要清理本地状态
    } finally {
      commit('CLEAR_USER_STATE');
    }
  },

  async getCurrentUser({ commit }) {
    try {
      const { data } = await request.get('/users/me');
      commit('SET_CURRENT_USER', data);
      return data;
    } catch (error) {
      console.error('Get current user error:', error);
      throw error;
    }
  },

  async fetchUsers({ commit }) {
    try {
      commit('setLoading', true);
      const { data } = await request.get('/users');
      commit('setUsers', data);
      return data;
    } catch (error) {
      console.error('Fetch users error:', error);
      commit('setError', error.response?.data?.message || '获取用户列表失败');
      throw error;
    } finally {
      commit('setLoading', false);
    }
  },

  async createUser({ commit, dispatch }, userData) {
    try {
      const { data } = await request.post('/users', userData);
      commit('addUser', data);
      return data;
    } catch (error) {
      throw error.response?.data?.message || '创建用户失败';
    }
  },

  async updateUser({ commit }, { id, data }) {
    try {
      const response = await request.put(`/users/${id}`, data);
      commit('updateUserInList', response.data);
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || '更新用户失败';
    }
  },

  async deleteUser({ commit }, id) {
    try {
      await request.delete(`/users/${id}`);
      commit('removeUser', id);
    } catch (error) {
      throw error.response?.data?.message || '删除用户失败';
    }
  }
};

const mutations = {
  SET_CURRENT_USER(state, user) {
    state.currentUser = user;
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
    state.error = null;
  },
  SET_TOKEN(state, token) {
    state.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  },
  CLEAR_USER_STATE(state) {
    state.currentUser = null;
    state.token = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
  setUsers(state, users) {
    state.users = users;
    state.error = null;
  },
  addUser(state, user) {
    state.users.push(user);
    state.error = null;
  },
  updateUserInList(state, updatedUser) {
    const index = state.users.findIndex(user => user.id === updatedUser.id);
    if (index !== -1) {
      state.users.splice(index, 1, updatedUser);
    }
    if (state.currentUser?.id === updatedUser.id) {
      state.currentUser = updatedUser;
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
    state.error = null;
  },
  removeUser(state, id) {
    state.users = state.users.filter(user => user.id !== id);
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
