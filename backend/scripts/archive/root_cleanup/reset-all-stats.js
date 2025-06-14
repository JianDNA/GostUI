/**
 * 重置所有统计数据脚本
 */

const http = require('http');

function makeHttpRequest(method, url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? require('https') : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 5000
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const data = body ? JSON.parse(body) : {};
          resolve({ statusCode: res.statusCode, data });
        } catch (error) {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function getAuthToken() {
  const loginData = { username: 'admin', password: 'admin123' };
  const response = await makeHttpRequest('POST', 'http://localhost:3000/api/auth/login', loginData);
  
  if (response.statusCode === 200 && response.data.token) {
    return `Bearer ${response.data.token}`;
  } else {
    throw new Error('登录失败: ' + (response.data.message || '未知错误'));
  }
}

async function resetAllStats() {
  console.log('🔄 开始重置所有统计数据...\n');
  
  // 获取认证令牌
  let authToken;
  try {
    console.log('🔐 获取管理员 token...');
    authToken = await getAuthToken();
    console.log('✅ 登录成功\n');
  } catch (error) {
    console.error('❌ 获取 token 失败:', error.message);
    return;
  }
  
  try {
    // 1. 重置所有用户流量
    console.log('1. 重置所有用户流量...');
    
    const usersResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (usersResponse.statusCode === 200) {
      for (const user of usersResponse.data) {
        try {
          const resetResponse = await makeHttpRequest('POST', `http://localhost:3000/api/users/${user.id}/reset-traffic`, {
            reason: '重置所有统计数据'
          }, {
            'Authorization': authToken
          });
          
          if (resetResponse.statusCode === 200) {
            console.log(`✅ 用户 ${user.username} 流量重置成功`);
          } else {
            console.log(`⚠️ 用户 ${user.username} 流量重置失败:`, resetResponse.data);
          }
        } catch (error) {
          console.log(`❌ 重置用户 ${user.username} 流量失败:`, error.message);
        }
      }
    }
    
    // 2. 强制同步缓存
    console.log('\n2. 强制同步缓存...');
    try {
      const syncResponse = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/force-sync', {}, {
        'Authorization': authToken
      });
      
      if (syncResponse.statusCode === 200) {
        console.log('✅ 缓存同步成功');
      } else {
        console.log('⚠️ 缓存同步失败:', syncResponse.data);
      }
    } catch (error) {
      console.log('❌ 缓存同步失败:', error.message);
    }
    
    // 3. 等待处理完成
    console.log('\n3. 等待处理完成...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 4. 验证重置结果
    console.log('\n4. 验证重置结果...');
    const finalResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
      'Authorization': authToken
    });
    
    if (finalResponse.statusCode === 200) {
      console.log('📊 重置后用户流量状态:');
      let totalTraffic = 0;
      for (const user of finalResponse.data) {
        const traffic = user.usedTraffic || 0;
        totalTraffic += traffic;
        console.log(`  ${user.username}: ${traffic} 字节`);
      }
      console.log(`📊 总流量: ${totalTraffic} 字节`);
      
      if (totalTraffic === 0) {
        console.log('\n🎉 所有统计数据重置成功！');
        console.log('✅ 现在可以运行干净的测试了');
      } else {
        console.log('\n⚠️ 仍有残留流量数据');
      }
    }
    
  } catch (error) {
    console.error('❌ 重置过程中发生错误:', error);
  }
}

resetAllStats();
