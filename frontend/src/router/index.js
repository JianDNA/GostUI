import { createRouter, createWebHistory } from 'vue-router';
import store from '@/store';
import { isApiTestEnabled } from '@/utils/env';

// 布局组件
import Layout from '@/components/layout/Layout.vue';

// 路由组件
const Login = () => import('@/views/Login.vue');
const Dashboard = () => import('@/views/Dashboard.vue');
const UserManagement = () => import('@/views/UserManagement.vue');
const UserForwardRules = () => import('@/views/UserForwardRules.vue');
const TrafficStats = () => import('@/views/TrafficStats.vue');
const GostConfig = () => import('@/views/GostConfig.vue');
const SimpleTestPanel = () => import('@/views/SimpleTestPanel.vue');

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    children: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: Dashboard,
        meta: {
          requiresAuth: true,
          title: '仪表盘'
        }
      },
      {
        path: '/admin',
        name: 'Admin',
        component: UserManagement,
        meta: {
          requiresAuth: true,
          requiresAdmin: true,
          title: '用户管理'
        }
      },
      {
        path: '/rules',
        name: 'Rules',
        component: UserForwardRules,
        meta: {
          requiresAuth: true,
          title: '规则管理'
        }
      },
      {
        path: '/user-forward-rules',
        name: 'UserForwardRules',
        component: UserForwardRules,
        meta: {
          requiresAuth: true,
          title: '转发规则'
        }
      },
      {
        path: '/stats',
        name: 'Stats',
        component: TrafficStats,
        meta: {
          requiresAuth: true,
          title: '流量统计'
        }
      },
      {
        path: '/gost-config',
        name: 'GostConfig',
        component: GostConfig,
        meta: {
          requiresAuth: true,
          requiresAdmin: true,
          title: 'Gost 配置'
        }
      },
      {
        path: '/simple/test',
        name: 'SimpleTestPanel',
        component: SimpleTestPanel,
        meta: {
          requiresAuth: true,
          requiresAdmin: true,
          title: 'API 测试面板'
        }
      }
    ]
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// 导航守卫
router.beforeEach(async (to, from, next) => {
  // 如果有token但没有用户信息，尝试获取用户信息
  if (store.getters['user/token'] && !store.getters['user/currentUser']) {
    await store.dispatch('user/initializeAuth');
  }

  const isAuthenticated = store.getters['user/isAuthenticated'];
  const isAdmin = store.getters['user/isAdmin'];

  // 需要认证的路由
  if (to.matched.some(record => record.meta.requiresAuth)) {
    if (!isAuthenticated) {
      next({
        name: 'Login',
        query: { redirect: to.fullPath }
      });
      return;
    }

    // 需要管理员权限的路由
    if (to.matched.some(record => record.meta.requiresAdmin) && !isAdmin) {
      next({ name: 'Dashboard' });
      return;
    }

    // 测试面板需要特殊权限检查
    if (to.name === 'AdminTestPanel') {
      const currentUser = store.getters['user/currentUser'];
      if (!isApiTestEnabled(currentUser)) {
        next({ name: 'Dashboard' });
        return;
      }
    }
  }

  // 已登录用户访问登录页时重定向到首页
  if (to.name === 'Login' && isAuthenticated) {
    next({ name: isAdmin ? 'Admin' : 'Dashboard' });
    return;
  }

  next();
});

export default router;
