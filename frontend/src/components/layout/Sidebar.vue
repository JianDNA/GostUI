﻿﻿﻿<template>
  <el-menu
    class="sidebar-menu"
    :default-active="activeMenu"
    :router="true"
    :collapse="isCollapse"
  >
    <el-menu-item index="/dashboard">
      <el-icon><Monitor /></el-icon>
      <template #title>仪表盘</template>
    </el-menu-item>

    <el-menu-item index="/rules">
      <el-icon><Connection /></el-icon>
      <template #title>端口转发</template>
    </el-menu-item>

    <el-menu-item index="/traffic">
      <el-icon><TrendCharts /></el-icon>
      <template #title>流量统计</template>
    </el-menu-item>

    <el-menu-item v-if="isAdmin" index="/admin">
      <el-icon><User /></el-icon>
      <template #title>用户管理</template>
    </el-menu-item>

    <el-menu-item v-if="isAdmin" index="/gost-config">
      <el-icon><Setting /></el-icon>
      <template #title>Gost 配置</template>
    </el-menu-item>
  </el-menu>
</template>

<script>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useStore } from 'vuex';
import { Monitor, Connection, Switch, TrendCharts, User, Setting } from '@element-plus/icons-vue';

export default {
  name: 'Sidebar',
  components: {
    Monitor,
    Connection,
    TrendCharts,
    User,
    Setting
  },
  props: {
    isCollapse: {
      type: Boolean,
      default: false
    }
  },
  setup() {
    const route = useRoute();
    const store = useStore();

    const activeMenu = computed(() => route.path);
    const isAdmin = computed(() => store.getters['user/isAdmin']);

    return {
      activeMenu,
      isAdmin
    };
  }
};
</script>

<style scoped>
.sidebar-menu {
  height: 100%;
  border-right: none;
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 200px;
}
</style>
