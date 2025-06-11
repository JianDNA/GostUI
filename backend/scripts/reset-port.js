/**
 * 端口重置脚本
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const { isWindows } = require('../utils/platform');
const execAsync = promisify(exec);

async function killProcessOnPort(port) {
  console.log(`🔄 尝试释放端口 ${port}...`);

  try {
    // 🔧 使用统一的平台检测
    if (isWindows()) {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[1].includes(`:${port}`)) {
          const pid = parts[4];
          if (pid && pid !== '0') {
            try {
              await execAsync(`taskkill /F /PID ${pid}`);
              console.log(`✅ 已终止进程 PID ${pid} (端口 ${port})`);
            } catch (error) {
              console.log(`⚠️ 无法终止进程 PID ${pid}:`, error.message);
            }
          }
        }
      }
    } else {
      // Linux/Mac 系统
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(pid => pid);

      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          console.log(`✅ 已终止进程 PID ${pid} (端口 ${port})`);
        } catch (error) {
          console.log(`⚠️ 无法终止进程 PID ${pid}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.log(`ℹ️ 端口 ${port} 未被占用或无法检测`);
  }
}

async function resetPorts() {
  console.log('🔄 开始重置端口...\n');

  const ports = [3000, 6443, 8080, 2999];

  for (const port of ports) {
    await killProcessOnPort(port);
  }

  console.log('\n✅ 端口重置完成');
  console.log('💡 现在可以重新启动服务');
}

if (require.main === module) {
  resetPorts();
}

module.exports = resetPorts;
