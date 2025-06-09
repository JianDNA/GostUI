/**
 * PM2 配置文件 - 支持多实例部署
 */

module.exports = {
  apps: [
    {
      name: 'gost-manager',
      script: './app.js',
      instances: 'max', // 或者指定数字，如 4
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      // 日志配置
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // 进程管理
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      
      // 监控配置
      watch: false, // 生产环境不建议开启
      ignore_watch: ['node_modules', 'logs', 'cache'],
      
      // 多实例配置
      instance_var: 'INSTANCE_ID',
      
      // 优雅关闭
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 3000
    }
  ]
};
