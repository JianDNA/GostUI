<template>
  <el-container class="app-wrapper">
    <el-aside width="200px" class="sidebar-container">
      <el-menu
        :router="true"
        :default-active="$route.path"
        class="el-menu-vertical"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409EFF"
      >
        <el-menu-item index="/dashboard">
          <el-icon><Monitor /></el-icon>
          <span>仪表盘</span>
        </el-menu-item>
        <el-menu-item v-if="isAdmin" index="/admin">
          <el-icon><User /></el-icon>
          <span>用户管理</span>
        </el-menu-item>
        <el-menu-item index="/rules">
          <el-icon><List /></el-icon>
          <span>规则管理</span>
        </el-menu-item>
        <el-menu-item index="/profile">
          <el-icon><UserFilled /></el-icon>
          <span>个人信息</span>
        </el-menu-item>

        <el-menu-item v-if="canUseTrafficTest" index="/traffic-test">
          <el-icon><Connection /></el-icon>
          <span>🧪 API测试</span>
        </el-menu-item>
        <el-menu-item v-if="isAdmin" index="/gost-config">
          <el-icon><Setting /></el-icon>
          <span>Gost配置</span>
        </el-menu-item>
        <el-menu-item v-if="isAdmin" index="/system-status">
          <el-icon><Monitor /></el-icon>
          <span>系统状态</span>
        </el-menu-item>
        <el-menu-item v-if="isAdmin" index="/performance-config">
          <el-icon><Tools /></el-icon>
          <span>性能配置</span>
        </el-menu-item>

      </el-menu>
    </el-aside>

    <el-container>
      <el-header height="60px" class="header">
        <Navbar />
      </el-header>

      <el-main>
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { Monitor, User, UserFilled, List, TrendCharts, Connection, Setting, Tools } from '@element-plus/icons-vue';
import Navbar from './Navbar.vue';

const store = useStore();
const isAdmin = computed(() => store.getters['user/isAdmin']);
const currentUser = computed(() => store.getters['user/currentUser']);
const canUseTrafficTest = computed(() => {
  const username = currentUser.value?.username;
  return username === 'admin' || username === 'test';
});
</script>

<style scoped>
.app-wrapper {
  min-height: 100vh;
}

.sidebar-container {
  background-color: #304156;
  height: 100%;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
}

.el-menu {
  border: none;
  height: 100%;
  width: 100%;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.el-main {
  padding: 0;
  margin-left: 200px;
  background: #f5f7fa;
  min-height: calc(100vh - 60px);
  overflow-y: auto; /* 确保内容可以滚动 */
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
