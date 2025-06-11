#!/usr/bin/env node

const axios = require('axios');

async function testLogin() {
  try {
    console.log('🧪 简单测试开始...');
    
    const response = await axios.post('http://localhost:3000/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    console.log('✅ 登录成功:', response.data.token ? '有token' : '无token');
    
    const usersResponse = await axios.get('http://localhost:3000/api/users', {
      headers: { Authorization: `Bearer ${response.data.token}` }
    });
    
    console.log('✅ 获取用户列表成功，用户数:', usersResponse.data.length);
    
    const testUser = usersResponse.data.find(user => user.id === 2);
    if (testUser) {
      console.log('✅ 找到测试用户:', testUser.username, '状态:', testUser.userStatus);
    }
    
    console.log('🎉 简单测试完成');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

testLogin();
