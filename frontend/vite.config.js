import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  
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
    },
    rollupOptions: {
      // 优化输出配置
      output: {
        // 减少chunk数量，避免内存问题
        manualChunks: {
          // 将 Vue 相关库打包到一个 chunk
          vue: ['vue', 'vue-router', 'vuex'],
          // 将 Element Plus 单独打包
          'element-plus': ['element-plus'],
          // 将图表库单独打包
          charts: ['echarts', 'chart.js', 'vue-chartjs'],
          // 将工具库打包
          utils: ['axios', 'dayjs', 'lodash-es']
        },
        // 优化文件名
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      },
      // 外部依赖优化
      external: [],
      // 减少并发处理
      maxParallelFileOps: 2
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
  
  // 优化依赖
  optimizeDeps: {
    include: [
      'vue',
      'vue-router',
      'vuex',
      'axios',
      'element-plus',
      'echarts',
      'chart.js',
      'vue-chartjs'
    ]
  }
})
