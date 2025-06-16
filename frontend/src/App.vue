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
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  #app {
    height: 100%;
  }

  * {
    box-sizing: border-box;
  }
</style>
