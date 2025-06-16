<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" />
  </router-view>
</template>

<script>
  export default {
    name: 'App',
    async created() {
      // 应用启动时初始化用户状态
      if (this.$store.getters['user/token']) {
        try {
          await this.$store.dispatch('user/initializeAuth');
        } catch (error) {
          console.error('Failed to initialize auth on app start:', error);
        }
      }
    }
  };
</script>

<style>
  html,
  body {
    margin: 0;
    padding: 0;
    min-height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow-x: hidden; /* 防止水平滚动 */
    overflow-y: auto;   /* 允许垂直滚动 */
  }

  #app {
    min-height: 100vh;
    overflow-y: auto; /* 确保应用容器可以滚动 */
  }

  * {
    box-sizing: border-box;
  }
</style>
