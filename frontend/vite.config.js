import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 添加Element Plus优化插件
    {
      name: 'element-plus-resolver',
      config(config) {
        // 确保Element Plus正确解析
        config.resolve = config.resolve || {};
        config.resolve.alias = config.resolve.alias || {};
        // 移除可能导致路径冲突的别名
      }
    }
  ],
  
  // 路径别名配置
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  
  // 开发服务器配置
  server: {
    host: '0.0.0.0',
    port: 8080,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  
  // 构建配置
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    chunkSizeWarningLimit: 2000,
    // 增加内存限制和优化设置
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: {
        // 避免变量名冲突
        safari10: true,
      },
    },
    // 构建时的优化设置
    target: 'es2015',
    cssTarget: 'chrome80',
    // 避免构建时的内存问题
    assetsInlineLimit: 4096,
    rollupOptions: {
      // 优化输出配置
      output: {
        // 手动分割chunks，避免循环依赖
        manualChunks: (id) => {
          // Vue核心库
          if (id.includes('vue') && !id.includes('vue-router') && !id.includes('vuex')) {
            return 'vue-core';
          }
          // Vue路由和状态管理
          if (id.includes('vue-router') || id.includes('vuex')) {
            return 'vue-ecosystem';
          }
          // Element Plus UI库
          if (id.includes('element-plus')) {
            return 'element-plus';
          }
          // ECharts图表库
          if (id.includes('echarts')) {
            return 'echarts';
          }
          // Chart.js相关
          if (id.includes('chart.js') || id.includes('vue-chartjs')) {
            return 'chartjs';
          }
          // HTTP请求库
          if (id.includes('axios')) {
            return 'http-client';
          }
          // 工具库
          if (id.includes('dayjs') || id.includes('lodash')) {
            return 'utils';
          }
          // 其他第三方库
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
        // 优化文件名
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId ? chunkInfo.facadeModuleId.split('/').pop() : 'chunk';
          return `assets/[name]-[hash].js`;
        },
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      },
      // 外部依赖优化
      external: [],
      // 减少并发处理，提高稳定性
      maxParallelFileOps: 1
    },
    // 构建时的内存和性能优化
    reportCompressedSize: false,
    // 增加构建超时时间
    timeout: 300000
  },
  
  // CSS 配置
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/variables.scss" as *;`,
        charset: false
      }
    }
  },
  
  // 定义全局常量
  define: {
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  },
  
  // 优化依赖预构建
  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      'vuex',
      'axios',
      'element-plus',
      'element-plus/es',
      'element-plus/es/components',
      'echarts/core',
      'echarts/charts',
      'echarts/components',
      'echarts/renderers',
      'chart.js',
      'vue-chartjs',
      'dayjs'
    ],
    // 排除有问题的依赖
    exclude: [
      'element-plus/es/locale'
    ]
  }
})
