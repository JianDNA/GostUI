/**
 * 调试端口转发问题的脚本 - 增强版
 */
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { promisify } = require('util');
const execPromise = promisify(exec);

// 定义文件路径
const execPath = process.platform === 'win32'
  ? path.join(__dirname, '../bin/gost.exe')
  : path.join(__dirname, '../bin/gost');
const configPath = path.join(__dirname, '../config/gost-config.json');

// 检查端口占用
async function checkPort(port) {
  try {
    console.log(`[调试] 检查端口 ${port} 是否被占用...`);
    if (process.platform === 'win32') {
      const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
      console.log(`[调试] 端口 ${port} 状态:\n${stdout}`);
      return stdout.includes(`:${port}`);
    } else {
      // Linux系统下尝试多种方式检查端口
      try {
        // 尝试lsof
        const { stdout } = await execPromise(`lsof -i :${port} || echo ""`);
        if (stdout.trim().length > 0) {
          console.log(`[调试] 端口 ${port} 状态 (lsof):\n${stdout}`);
          return true;
        }
      } catch (e) {
        // 忽略lsof失败的情况
      }
      
      try {
        // 尝试netstat
        const { stdout: netstatOut } = await execPromise(`netstat -tuln | grep :${port} || echo ""`);
        if (netstatOut.trim().length > 0) {
          console.log(`[调试] 端口 ${port} 状态 (netstat):\n${netstatOut}`);
          return true;
        }
      } catch (e) {
        // 忽略netstat失败的情况
      }
      
      try {
        // 尝试ss命令 (较新的Linux系统)
        const { stdout: ssOut } = await execPromise(`ss -tuln | grep :${port} || echo ""`);
        if (ssOut.trim().length > 0) {
          console.log(`[调试] 端口 ${port} 状态 (ss):\n${ssOut}`);
          return true;
        }
      } catch (e) {
        // 忽略ss失败的情况
      }
      
      console.log(`[调试] 端口 ${port} 空闲`);
      return false;
    }
  } catch (err) {
    console.log(`[调试] 端口 ${port} 空闲`);
    return false;
  }
}

// 尝试释放被占用的端口
async function releasePort(port) {
  try {
    console.log(`[调试] 尝试释放端口 ${port}...`);
    
    if (process.platform === 'win32') {
      // Windows系统下查找并杀死占用端口的进程
      const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      
      if (lines.length > 0) {
        // 提取PID
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 5) {
            const pid = parts[4];
            if (pid && pid !== '0') {
              console.log(`[调试] 发现端口 ${port} 被进程 ${pid} 占用，正在终止...`);
              try {
                await execPromise(`taskkill /F /PID ${pid}`);
                console.log(`[调试] 已终止进程 ${pid}`);
              } catch (error) {
                console.error(`[警告] 终止进程 ${pid} 失败:`, error.message);
              }
            }
          }
        }
      }
    } else {
      // Linux系统下使用多种方法查找和杀死占用端口的进程
      
      // 尝试方法1：lsof
      try {
        const { stdout } = await execPromise(`lsof -ti:${port} || echo ""`);
        const pids = stdout.trim().split('\n').filter(p => p.trim());
        
        for (const pid of pids) {
          if (pid) {
            console.log(`[调试] 发现端口 ${port} 被进程 ${pid} 占用，正在终止...`);
            try {
              await execPromise(`kill -9 ${pid}`);
              console.log(`[调试] 已终止进程 ${pid}`);
            } catch (error) {
              console.error(`[警告] 终止进程 ${pid} 失败:`, error.message);
            }
          }
        }
      } catch (error) {
        // 忽略lsof命令错误
        console.log(`[调试] lsof命令失败: ${error.message}`);
      }
      
      // 尝试方法2：fuser
      try {
        const { stdout: fuserOut } = await execPromise(`fuser -k -n tcp ${port} 2>/dev/null || echo ""`);
        if (fuserOut.trim()) {
          console.log(`[调试] fuser命令已尝试释放端口 ${port}`);
        }
      } catch (error) {
        // 忽略fuser命令错误
      }
      
      // 尝试方法3：netstat
      try {
        const { stdout: netstatOut } = await execPromise(`netstat -tulnp 2>/dev/null | grep :${port} || echo ""`);
        const lines = netstatOut.trim().split('\n');
        
        for (const line of lines) {
          const match = line.match(/LISTEN\s+(\d+)\/(\S+)/);
          if (match && match[1]) {
            const pid = match[1];
            console.log(`[调试] 发现端口 ${port} 被进程 ${pid} 占用，正在终止...`);
            try {
              await execPromise(`kill -9 ${pid}`);
              console.log(`[调试] 已终止进程 ${pid}`);
            } catch (error) {
              console.error(`[警告] 终止进程 ${pid} 失败:`, error.message);
            }
          }
        }
      } catch (error) {
        // 忽略netstat命令错误
      }
    }
    
    // 等待端口完全释放
    await waitForPortRelease(port);
    
    return true;
  } catch (error) {
    console.error(`[错误] 释放端口 ${port} 失败:`, error.message);
    return false;
  }
}

// 等待端口完全释放
async function waitForPortRelease(port, maxAttempts = 10, delayMs = 500) {
  console.log(`[调试] 等待端口 ${port} 释放...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isUsed = await checkPort(port);
    
    if (!isUsed) {
      console.log(`[调试] 端口 ${port} 已释放，可以使用`);
      return true;
    }
    
    console.log(`[调试] 端口 ${port} 仍被占用，等待中... (${attempt}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  
  console.error(`[错误] 端口 ${port} 在多次尝试后仍未释放`);
  return false;
}

// 寻找空闲端口
async function findFreePort(startPort, endPort) {
  console.log(`[调试] 寻找空闲端口 (${startPort}-${endPort})...`);
  for (let port = startPort; port <= endPort; port++) {
    const isUsed = await checkPort(port);
    if (!isUsed) {
      console.log(`[调试] 找到空闲端口: ${port}`);
      return port;
    }
  }
  throw new Error(`在范围 ${startPort}-${endPort} 内找不到空闲端口`);
}

// 测试HTTP请求
async function testRequest(url) {
  return new Promise((resolve, reject) => {
    console.log(`[调试] 测试访问 ${url}...`);
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`[调试] ${url} 响应码: ${res.statusCode}`);
        if (data.length < 200) {
          console.log(`[调试] ${url} 响应内容: ${data}`);
        } else {
          console.log(`[调试] ${url} 响应内容长度: ${data.length} 字节`);
        }
        resolve({ status: res.statusCode, data });
      });
    }).on('error', (err) => {
      console.log(`[调试] ${url} 请求失败: ${err.message}`);
      reject(err);
    });
    
    // 设置超时
    req.setTimeout(5000, () => {
      req.abort();
      reject(new Error('请求超时'));
    });
  });
}

// 调试主函数
async function debug() {
  try {
    console.log('\n===== 开始调试端口转发 =====\n');

    // 1. 检查可执行文件
    console.log(`[调试] 检查 Go-Gost 可执行文件...`);
    if (!fs.existsSync(execPath)) {
      console.error(`[错误] Go-Gost 可执行文件不存在: ${execPath}`);
      process.exit(1);
    }
    console.log(`[调试] Go-Gost 可执行文件存在: ${execPath}`);

    // 2. 先杀死可能已存在的 gost 进程
    try {
      if (process.platform === 'win32') {
        await execPromise('taskkill /f /im gost.exe 2>NUL');
      } else {
        // Linux系统下尝试多种方式杀死进程
        try {
          await execPromise('pkill -f gost 2>/dev/null || true');
        } catch (e) {
          // 忽略错误
        }
        
        try {
          await execPromise('killall -9 gost 2>/dev/null || true');
        } catch (e) {
          // 忽略错误
        }
      }
      console.log(`[调试] 已清理现有 gost 进程`);
    } catch (err) {
      console.log('[调试] 没有发现现有 gost 进程');
    }

    // 3. 检查Node服务是否运行
    const port3000Used = await checkPort(3000);
    if (port3000Used) {
      console.log('[调试] 检测到 3000 端口已被占用，这是正常的 (Node服务)');
    } else {
      console.error('[错误] 3000 端口未被占用，Node 服务可能没有运行!');
      process.exit(1);
    }
    
    // 4. 尝试使用端口 6443
    let forwardPort = 6443;
    const port6443Used = await checkPort(6443);
    
    if (port6443Used) {
      console.log(`[调试] 端口 ${forwardPort} 当前被占用，尝试释放...`);
      const released = await releasePort(forwardPort);
      
      if (!released) {
        console.error(`[错误] 无法释放端口 ${forwardPort}，请手动关闭占用该端口的进程后再试`);
        process.exit(1);
      } else {
        console.log(`[调试] 端口 ${forwardPort} 已成功释放，将继续使用`);
      }
    } else {
      console.log(`[调试] 端口 ${forwardPort} 未被占用，可以直接使用`);
    }
    
    console.log(`[调试] 将使用端口 ${forwardPort} 进行转发测试`);

    // 5. 生成配置并写入文件
    const config = {
      services: [
        {
          name: "tcp-forward-test",
          addr: `:${forwardPort}`,
          handler: {
            type: "tcp",
            chain: "tcp-forward-chain"
          },
          listener: {
            type: "tcp"
          }
        }
      ],
      chains: [
        {
          name: "tcp-forward-chain",
          hops: [
            {
              name: "hop-0",
              nodes: [
                {
                  addr: "127.0.0.1:3000",
                  connector: {
                    type: "tcp"
                  }
                }
              ]
            }
          ]
        }
      ]
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`[调试] 已创建配置文件: ${configPath}`);

    // 6. 最后再次确保端口已释放
    await releasePort(forwardPort);

    // 7. 启动 Go-Gost
    console.log('\n[调试] 启动 Go-Gost 进行端口转发...');
    const args = ['-C', configPath];
    console.log(`[调试] 命令: ${execPath} ${args.join(' ')}`);
    
    // 确保可执行文件具有执行权限(Linux系统)
    if (process.platform !== 'win32') {
      try {
        await execPromise(`chmod +x "${execPath}"`);
      } catch (error) {
        console.error(`[警告] 无法设置执行权限:`, error.message);
      }
    }
    
    const gost = spawn(execPath, args, {
      stdio: 'pipe',
      shell: process.platform === 'win32'
    });

    gost.stdout.on('data', (data) => {
      console.log(`[Go-Gost]: ${data.toString().trim()}`);
    });

    gost.stderr.on('data', (data) => {
      console.error(`[Go-Gost 错误]: ${data.toString().trim()}`);
    });

    gost.on('close', (code) => {
      console.log(`[调试] Go-Gost 进程退出，代码: ${code}`);
    });

    // 等待 Go-Gost 启动
    console.log('[调试] 等待 Go-Gost 启动 (3秒)...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 8. 测试直接访问 Node 服务
    try {
      const directResult = await testRequest('http://localhost:3000/api/gost/config');
      console.log('[调试] 直接访问 Node 服务成功');
    } catch (err) {
      console.error('[错误] 直接访问 Node 服务失败，请确认服务是否正常运行');
      console.error(err.message);
    }

    // 9. 测试经过端口转发访问
    try {
      console.log(`\n[调试] 测试通过 ${forwardPort} 端口转发访问...`);
      const forwardResult = await testRequest(`http://localhost:${forwardPort}/api/gost/config`);
      console.log('[调试] 端口转发测试成功！');
    } catch (err) {
      console.error(`[错误] 端口转发测试失败: ${err.message}`);
    }

    // 10. 输出最终配置信息
    console.log(`\n[信息] 最终转发配置: localhost:${forwardPort} -> localhost:3000`);
    console.log(`[信息] 您可以通过访问 http://localhost:${forwardPort}/api/gost/config 测试转发`);
    console.log('\n[调试] Go-Gost 进程将继续运行。测试完成后按 Ctrl+C 终止程序。');
  } catch (err) {
    console.error(`[错误] 调试过程中发生错误:`, err);
  }
}

// 运行调试
debug().catch(err => {
  console.error('[错误] 调试脚本执行失败:', err);
}); 