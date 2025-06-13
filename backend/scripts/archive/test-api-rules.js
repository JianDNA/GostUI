/**
 * 测试API获取转发规则
 */

const axios = require('axios');

async function testAPIRules() {
  try {
    console.log('🧪 测试API获取转发规则...\n');
    
    const baseURL = 'http://localhost:3000/api';
    
    // 1. Admin登录
    console.log('1. Admin用户登录...');
    const loginResponse = await axios.post(`${baseURL}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    
    if (loginResponse.data.success) {
      console.log('✅ Admin登录成功');
      const token = loginResponse.data.token;
      
      // 2. 获取转发规则
      console.log('\n2. 获取转发规则...');
      const rulesResponse = await axios.get(`${baseURL}/user-forward-rules`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (rulesResponse.data.success) {
        const rules = rulesResponse.data.rules || [];
        console.log(`✅ 获取到 ${rules.length} 条转发规则:`);
        
        rules.forEach(rule => {
          console.log(`  - 规则ID: ${rule.id}`);
          console.log(`    用户: ${rule.user?.username} (ID: ${rule.userId})`);
          console.log(`    名称: ${rule.name}`);
          console.log(`    端口: ${rule.sourcePort} -> ${rule.targetAddress}`);
          console.log(`    协议: ${rule.protocol}`);
          console.log(`    状态: ${rule.isActive ? '激活' : '禁用'}`);
          console.log(`    创建时间: ${rule.createdAt}`);
          console.log('');
        });
        
        // 特别检查6443端口规则
        const rule6443 = rules.find(rule => rule.sourcePort === 6443);
        if (rule6443) {
          console.log('🎯 找到6443端口规则:');
          console.log(`  - 用户: ${rule6443.user?.username}`);
          console.log(`  - 名称: ${rule6443.name}`);
          console.log(`  - 目标: ${rule6443.targetAddress}`);
          console.log(`  - 状态: ${rule6443.isActive ? '激活' : '禁用'}`);
        } else {
          console.log('❌ 未找到6443端口规则');
        }
        
      } else {
        console.log('❌ 获取转发规则失败:', rulesResponse.data.message);
      }
      
      // 3. 测试为test用户创建6443规则
      console.log('\n3. 测试为test用户创建6443规则...');
      try {
        const createResponse = await axios.post(`${baseURL}/user-forward-rules`, {
          name: 'Test 6443 New Rule',
          sourcePort: 6443,
          targetAddress: '127.0.0.1:3000',
          protocol: 'tcp',
          description: 'Admin为test用户创建的新6443规则',
          userId: 2  // test用户ID
        }, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (createResponse.data.success) {
          console.log('✅ 规则创建成功');
        } else {
          console.log('❌ 规则创建失败:', createResponse.data.message);
        }
      } catch (createError) {
        console.log('❌ 规则创建失败:', createError.response?.data?.message || createError.message);
      }
      
    } else {
      console.log('❌ Admin登录失败:', loginResponse.data.message);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data?.message || error.message);
    process.exit(1);
  }
}

testAPIRules();
