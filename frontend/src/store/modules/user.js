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
    console.log('🔐 [Store] 初始化认证状态');
    console.log('🔐 [Store] 本地存储的token:', state.token ? state.token.substring(0, 20) + '...' : 'null');
    console.log('🔐 [Store] 本地存储的用户:', state.currentUser ? state.currentUser.username : 'null');

    if (state.token) {
      try {
        console.log('🔐 [Store] 尝试获取当前用户信息');
        await dispatch('getCurrentUser');
        console.log('🔐 [Store] 认证状态初始化成功');
      } catch (error) {
        console.error('🔐 [Store] 认证状态初始化失败:', error);
        dispatch('logout');
      }
    } else {
      console.log('🔐 [Store] 没有token，跳过认证初始化');
    }
  },

  async login({ commit, dispatch }, credentials) {
    try {
      console.log('🔐 [Store] 开始登录:', credentials.username);
      const { data } = await request.post('/auth/login', credentials);
      console.log('🔐 [Store] 登录成功，收到token:', data.token ? data.token.substring(0, 20) + '...' : 'null');
      console.log('🔐 [Store] 登录成功，收到用户:', data.user.username);

      commit('SET_TOKEN', data.token);
      commit('SET_CURRENT_USER', data.user);

      console.log('🔐 [Store] Token和用户信息已保存到store');
      return data.user;
    } catch (error) {
      console.error('🔐 [Store] 登录失败:', error);
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
      const response = await request.get('/users/me');
      const userData = response.data.success ? response.data.data : response.data;
      commit('SET_CURRENT_USER', userData);
      return userData;
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
    console.log('🔐 [Store] 设置token:', token ? token.substring(0, 20) + '...' : 'null');
    state.token = token;
    if (token) {
      localStorage.setItem('token', token);
      console.log('🔐 [Store] Token已保存到localStorage');
    } else {
      localStorage.removeItem('token');
      console.log('🔐 [Store] Token已从localStorage移除');
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
