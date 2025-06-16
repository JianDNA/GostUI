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
      // 使用最简单的配置避免循环依赖
      output: {
        // 不进行手动分割，让Rollup自动处理
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
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
      'echarts',
      'dayjs'
    ],
    // 排除有问题的依赖
    exclude: [
      'element-plus/es/locale'
    ],
    // 强制预构建
    force: true
  }
})
