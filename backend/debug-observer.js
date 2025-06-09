/**
 * 调试观察器处理脚本
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

async function debugObserver() {
  console.log('🔍 开始调试观察器处理...\n');

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
    // 测试端口 6443 (admin用户)
    console.log('📤 测试端口 6443 (admin用户)...');
    
    const observerData = {
      events: [
        {
          kind: "service",
          service: "forward-tcp-6443",
          type: "stats",
          stats: {
            totalConns: 1,
            currentConns: 0,
            inputBytes: 50 * 1024 * 1024, // 50MB
            outputBytes: 50 * 1024 * 1024, // 50MB
            totalErrs: 0
          }
        }
      ]
    };

    console.log('发送数据:', JSON.stringify(observerData, null, 2));
    
    const response = await makeHttpRequest('POST', 'http://localhost:3000/api/gost-plugin/observer', observerData);
    
    console.log('响应状态:', response.statusCode);
    console.log('响应数据:', response.data);
    
    if (response.statusCode === 200) {
      console.log('✅ 观察器请求成功');
      
      // 等待处理
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 检查用户流量
      console.log('\n📊 检查用户流量...');
      const userResponse = await makeHttpRequest('GET', 'http://localhost:3000/api/users', null, {
        'Authorization': authToken
      });

      if (userResponse.statusCode === 200) {
        console.log('用户流量状态:');
        userResponse.data.forEach(user => {
          const traffic = user.usedTraffic || 0;
          const trafficMB = (traffic / 1024 / 1024).toFixed(2);
          console.log(`  ${user.username}: ${traffic} 字节 (${trafficMB} MB)`);
        });
      } else {
        console.log('❌ 获取用户流量失败:', userResponse.statusCode, userResponse.data);
      }
    } else {
      console.log('❌ 观察器请求失败');
    }
    
  } catch (error) {
    console.error('❌ 调试失败:', error);
  }
}

debugObserver();
