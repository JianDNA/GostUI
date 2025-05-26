/**
 * 重置端口并杀死占用进程的辅助脚本
 * 用于解决顽固的端口占用问题
 */
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const execPromise = promisify(exec);

// 要检查的默认端口
const DEFAULT_PORT = 6443;
const PORTS_TO_CHECK = [DEFAULT_PORT];

// 检查端口占用
async function checkPort(port) {
  try {
    console.log(`检查端口 ${port} 是否被占用...`);
    if (process.platform === 'win32') {
      const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
      if (stdout.trim()) {
        console.log(`端口 ${port} 状态:\n${stdout}`);
        return { isUsed: true, output: stdout };
      }
    } else {
      // Linux系统下尝试多种方式检查端口
      let portStatus = false;
      let portOutput = '';
      
      // 方法1: lsof
      try {
        const { stdout } = await execPromise(`lsof -i :${port} 2>/dev/null || echo ""`);
        if (stdout.trim()) {
          portStatus = true;
          portOutput = stdout;
          console.log(`端口 ${port} 状态 (lsof):\n${stdout}`);
        }
      } catch (e) {
        // 忽略lsof错误
      }
      
      // 方法2: netstat
      if (!portStatus) {
        try {
          const { stdout } = await execPromise(`netstat -tuln 2>/dev/null | grep :${port} || echo ""`);
          if (stdout.trim()) {
            portStatus = true;
            portOutput = stdout;
            console.log(`端口 ${port} 状态 (netstat):\n${stdout}`);
          }
        } catch (e) {
          // 忽略netstat错误
        }
      }
      
      // 方法3: ss命令 (现代Linux系统)
      if (!portStatus) {
        try {
          const { stdout } = await execPromise(`ss -tuln 2>/dev/null | grep :${port} || echo ""`);
          if (stdout.trim()) {
            portStatus = true;
            portOutput = stdout;
            console.log(`端口 ${port} 状态 (ss):\n${stdout}`);
          }
        } catch (e) {
          // 忽略ss错误
        }
      }
      
      if (portStatus) {
        return { isUsed: true, output: portOutput };
      }
    }
    console.log(`端口 ${port} 空闲`);
    return { isUsed: false };
  } catch (err) {
    console.log(`端口 ${port} 空闲`);
    return { isUsed: false };
  }
}

// 强力释放端口，使用更多方法尝试终止占用进程
async function forceReleasePort(port) {
  console.log(`====== 正在强力释放端口 ${port} ======`);
  
  try {
    if (process.platform === 'win32') {
      // Windows系统 - 提取并终止PID
      const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      const pids = new Set();
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5) {
          const pid = parts[4];
          if (pid && pid !== '0' && !pids.has(pid)) {
            pids.add(pid);
            console.log(`发现端口 ${port} 被进程 PID=${pid} 占用`);
            
            // 收集进程信息
            try {
              const { stdout: processInfo } = await execPromise(`tasklist /FI "PID eq ${pid}" /FO LIST`);
              console.log(`进程信息:\n${processInfo}`);
            } catch (e) {
              console.log(`无法获取进程 ${pid} 的详细信息`);
            }
            
            // 尝试终止进程
            console.log(`正在终止进程 PID=${pid}...`);
            try {
              await execPromise(`taskkill /F /PID ${pid}`);
              console.log(`已成功终止进程 PID=${pid}`);
            } catch (error) {
              console.error(`无法终止进程 PID=${pid}: ${error.message}`);
            }
          }
        }
      }
      
      // 如果是 Go-Gost，使用进程名称终止
      try {
        await execPromise('taskkill /F /IM gost.exe 2>NUL');
        console.log('已终止所有 gost.exe 进程');
      } catch (e) {
        // 忽略错误
      }
      
    } else {
      // Linux系统 - 尝试多种方法强制结束进程
      
      // 方法1: 使用 lsof 查找进程
      try {
        const { stdout } = await execPromise(`lsof -ti:${port} 2>/dev/null || echo ""`);
        const pids = stdout.trim().split('\n').filter(p => p.trim());
        
        for (const pid of pids) {
          if (pid) {
            // 获取进程信息
            try {
              const { stdout: processInfo } = await execPromise(`ps -f -p ${pid} 2>/dev/null || echo ""`);
              console.log(`进程信息:\n${processInfo}`);
            } catch (e) {
              console.log(`无法获取进程 ${pid} 的详细信息`);
            }
            
            // 尝试终止进程
            console.log(`正在终止进程 PID=${pid}...`);
            try {
              await execPromise(`kill -9 ${pid}`);
              console.log(`已成功终止进程 PID=${pid}`);
            } catch (error) {
              console.error(`无法终止进程 ${pid} 失败:`, error.message);
            }
          }
        }
      } catch (error) {
        // 忽略lsof错误
      }
      
      // 方法2: 使用 netstat 查找进程 (如果lsof不可用)
      try {
        const { stdout } = await execPromise(`netstat -tulnp 2>/dev/null | grep :${port} || echo ""`);
        const lines = stdout.trim().split('\n');
        
        for (const line of lines) {
          // 提取PID/程序名，如 "tcp 0 0 0.0.0.0:6443 0.0.0.0:* LISTEN 1234/gost"
          const match = line.match(/LISTEN\s+(\d+)\/(\S+)/);
          if (match && match[1]) {
            const pid = match[1];
            console.log(`发现端口 ${port} 被进程 PID=${pid} (${match[2]}) 占用`);
            
            // 尝试终止进程
            try {
              await execPromise(`kill -9 ${pid}`);
              console.log(`已成功终止进程 PID=${pid}`);
            } catch (error) {
              console.error(`无法终止进程 ${pid}:`, error.message);
            }
          }
        }
      } catch (error) {
        // 忽略netstat错误
      }
      
      // 方法3: 使用 fuser
      try {
        // fuser先尝试显示占用端口的进程
        const { stdout } = await execPromise(`fuser -v ${port}/tcp 2>/dev/null || echo ""`);
        console.log(`fuser检测结果:\n${stdout}`);
        
        // 然后尝试杀死占用端口的进程
        await execPromise(`fuser -k -n tcp ${port} 2>/dev/null || true`);
        console.log(`已尝试使用fuser终止占用端口${port}的进程`);
      } catch (error) {
        // 忽略fuser错误
      }
      
      // 如果是 Go-Gost，尝试使用进程名称终止
      try {
        await execPromise('pkill -9 -f gost 2>/dev/null || true');
        console.log('已尝试终止所有 gost 进程');
      } catch (e) {
        // 忽略错误
      }
      
      try {
        await execPromise('killall -9 gost 2>/dev/null || true');
        console.log('已尝试使用killall终止所有gost进程');
      } catch (e) {
        // 忽略错误
      }
    }

    // 检查端口是否已释放
    await new Promise(resolve => setTimeout(resolve, 1000));
    const status = await checkPort(port);
    
    if (status.isUsed) {
      console.log(`警告: 端口 ${port} 仍被占用，可能需要重启系统以完全释放`);
      return false;
    } else {
      console.log(`端口 ${port} 已成功释放`);
      return true;
    }
  } catch (error) {
    console.error(`释放端口 ${port} 时发生错误:`, error.message);
    return false;
  }
}

// 重置配置文件确保使用指定端口
async function resetConfigFile() {
  try {
    const configPath = path.join(__dirname, '../config/gost-config.json');
    if (!fs.existsSync(configPath)) {
      console.log('配置文件不存在，跳过重置');
      return;
    }
    
    // 读取配置文件
    let configContent;
    try {
      configContent = fs.readFileSync(configPath, 'utf8');
    } catch (readError) {
      console.error(`读取配置文件失败: ${readError.message}`);
      return;
    }
    
    let config;
    try {
      config = JSON.parse(configContent);
    } catch (parseError) {
      console.error(`解析配置文件JSON失败: ${parseError.message}`);
      return;
    }
    
    // 确保使用默认端口
    if (config.services && config.services.length > 0) {
      const newPort = DEFAULT_PORT;
      config.services[0].addr = `:${newPort}`;
      console.log(`已重置配置为使用默认端口 ${newPort}`);
      
      // 写入配置文件
      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('配置文件已更新');
      } catch (writeError) {
        console.error(`写入配置文件失败: ${writeError.message}`);
      }
    }
  } catch (error) {
    console.error('重置配置文件失败:', error.message);
  }
}

// 主函数
async function main() {
  console.log('\n====== Go-Gost 端口重置工具 ======\n');
  console.log(`运行环境: ${process.platform} (${process.arch})`);

  // 1. 检查端口占用
  for (const port of PORTS_TO_CHECK) {
    const status = await checkPort(port);
    if (status.isUsed) {
      console.log(`\n端口 ${port} 被占用，正在尝试释放...`);
      const released = await forceReleasePort(port);
      if (!released) {
        console.log(`\n警告: 端口 ${port} 无法完全释放，请尝试手动释放或重启系统`);
        console.log('您可以使用以下命令查看占用端口的进程:');
        if (process.platform === 'win32') {
          console.log(`netstat -ano | findstr :${port}`);
        } else {
          console.log(`lsof -i :${port} 或 netstat -tulnp | grep :${port}`);
        }
      }
    } else {
      console.log(`端口 ${port} 当前未被占用，可以使用`);
    }
  }
  
  // 2. 重置配置文件
  await resetConfigFile();
  
  console.log('\n端口检查与重置完成。');
  console.log(`如果端口 ${DEFAULT_PORT} 仍然无法使用，您可能需要重启系统后再试。`);
}

// 执行
main().catch(err => {
  console.error('脚本执行失败:', err);
}); 