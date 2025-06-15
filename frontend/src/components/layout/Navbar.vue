<template>
  <div class="navbar">
    <div class="left">
      <h2>GOST 管理系统</h2>
    </div>
    <div class="right">
      <el-dropdown @command="handleCommand">
        <span class="el-dropdown-link">
          {{ currentUser?.username }}
          <el-icon class="el-icon--right"><arrow-down /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="logout">退出登录</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useStore } from 'vuex';
import { useRouter } from 'vue-router';
import { ArrowDown } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';

const store = useStore();
const router = useRouter();

const currentUser = computed(() => store.getters['user/currentUser']);

const handleCommand = async (command) => {
  if (command === 'logout') {
    try {
      await store.dispatch('user/logout');
      router.push('/login');
    } catch (error) {
      ElMessage.error('退出登录失败');
    }
  }
};
</script>

<style scoped>
.navbar {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.left h2 {
  margin: 0;
  color: #ffffff;
  font-weight: 600;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.right {
  display: flex;
  align-items: center;
}

.el-dropdown-link {
  cursor: pointer;
  display: flex;
  align-items: center;
  color: #ffffff;
  font-weight: 500;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.el-dropdown-link:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}

.el-icon--right {
  margin-left: 8px;
}
</style>
