/**
 * 端口转发调试脚本
 */

const net = require('net');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function checkPortStatus(port) {
  console.log(`🔍 检查端口 ${port} 状态...`);
  
  try {
    // 检查端口是否被监听
    const { stdout } = await execAsync(`netstat -an | findstr :${port}`);
    if (stdout.trim()) {
      console.log(`✅ 端口 ${port} 正在被监听:`);
      console.log(stdout.trim());
    } else {
      console.log(`❌ 端口 ${port} 未被监听`);
    }
  } catch (error) {
    console.log(`❌ 端口 ${port} 未被监听`);
  }
}

function testConnection(port) {
  return new Promise((resolve) => {
    console.log(`🔗 测试连接到端口 ${port}...`);
    
    const client = new net.Socket();
    client.setTimeout(3000);
    
    client.connect(port, 'localhost', () => {
      console.log(`✅ 成功连接到端口 ${port}`);
      client.destroy();
      resolve(true);
    });
    
    client.on('error', (error) => {
      console.log(`❌ 连接端口 ${port} 失败:`, error.message);
      resolve(false);
    });
    
    client.on('timeout', () => {
      console.log(`❌ 连接端口 ${port} 超时`);
      client.destroy();
      resolve(false);
    });
  });
}

async function debugPortForward() {
  console.log('🔧 开始端口转发调试...\n');
  
  const ports = [3000, 6443, 8080, 2999];
  
  for (const port of ports) {
    console.log(`\n=== 调试端口 ${port} ===`);
    await checkPortStatus(port);
    await testConnection(port);
  }
  
  console.log('\n🔧 端口转发调试完成');
}

if (require.main === module) {
  debugPortForward();
}

module.exports = debugPortForward;
