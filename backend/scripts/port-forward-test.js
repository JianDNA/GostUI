/**
 * 这是一个简单的端口转发测试脚本
 * 使用配置文件方式启动 Go-Gost
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 定义可执行文件和配置文件路径
const execPath = process.platform === 'win32'
  ? path.join(__dirname, '../bin/gost.exe')
  : path.join(__dirname, '../bin/gost');
const configPath = path.join(__dirname, '../config/gost-config.json');

// 检查可执行文件是否存在
if (!fs.existsSync(execPath)) {
  console.error(`错误: 找不到 Go-Gost 可执行文件: ${execPath}`);
  console.log('请先运行: npm run install-gost');
  process.exit(1);
}

// 创建或确认配置文件
const config = {
  services: [
    {
      name: "tcp-forward",
      addr: ":6443",
      handler: {
        type: "tcp/udp",
        metadata: {
          mode: "tcp",
          address: "127.0.0.1:3000"
        }
      }
    }
  ],
  chains: []
};

// 写入配置文件
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log(`[测试] 已创建配置文件: ${configPath}`);

// 启动 Go-Gost 进行端口转发
console.log(`[测试] 开始测试端口转发 6443 -> 3000...`);
console.log(`[测试] 使用可执行文件: ${execPath}`);
console.log(`[测试] 使用配置文件: ${configPath}`);

// 使用配置文件启动 Go-Gost
const gost = spawn(execPath, ['-C', configPath]);

// 监听输出
gost.stdout.on('data', (data) => {
  console.log(`[Go-Gost 输出] ${data}`);
});

// 监听错误
gost.stderr.on('data', (data) => {
  console.error(`[Go-Gost 错误] ${data}`);
});

// 监听退出
gost.on('close', (code) => {
  console.log(`[测试] Go-Gost 进程退出，代码: ${code}`);
});

console.log('[测试] Go-Gost 端口转发已启动');
console.log('[测试] 现在应该可以通过 http://localhost:6443/api/gost/config 访问到 http://localhost:3000/api/gost/config 的内容');
console.log('[测试] 按 Ctrl+C 停止转发');

// 保持进程运行
process.on('SIGINT', () => {
  console.log('[测试] 收到终止信号，正在停止...');
  gost.kill();
  process.exit(0);
}); 