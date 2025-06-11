#!/usr/bin/env node

/**
 * 测试紧急配额禁用的修复效果
 */

const axios = require('axios');
const net = require('net');

// 配置
const BASE_URL = 'http://localhost:3000';
const TEST_USER_ID = 2;
const TEST_PORT = 6443;

let authToken = '';

async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    authToken = response.data.token;
    console.log('✅ 登录成功');
    return true;
  } catch (error) {
    console.error('❌ 登录失败:', error.message);
    return false;
  }
}

async function resetUserTraffic() {
  try {
    const response = await axios.post(`${BASE_URL}/api/users/${TEST_USER_ID}/reset-traffic`, {
      reason: '测试紧急配额禁用修复'
    }, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    console.log('✅ 用户流量已重置');
    return true;
  } catch (error) {
    console.error('❌ 重置流量失败:', error.message);
    return false;
  }
}

async function getUserStatus() {
  try {
    const response = await axios.get(`${BASE_URL}/api/users`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const testUser = response.data.find(user => user.id === TEST_USER_ID);
    if (testUser) {
      const usedMB = (testUser.usedTraffic || 0) / (1024 * 1024);
      const quotaGB = testUser.trafficQuota;
      const usagePercent = quotaGB > 0 ? (usedMB / (quotaGB * 1024)) * 100 : 0;

      return {
        username: testUser.username,
        userStatus: testUser.userStatus,
        usedMB: usedMB.toFixed(2),
        quotaGB,
        usagePercent: usagePercent.toFixed(1)
      };
    }
    return null;
  } catch (error) {
    console.error('❌ 获取用户状态失败:', error.message);
    return null;
  }
}

async function testPortConnection(port, timeout = 3000) {
  return new Promise((resolve) => {
    const client = new net.Socket();

    const timer = setTimeout(() => {
      client.destroy();
      resolve(false);
    }, timeout);

    client.connect(port, 'localhost', () => {
      clearTimeout(timer);
      client.destroy();
      resolve(true);
    });

    client.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function sendTraffic(sizeMB) {
  try {
    const response = await axios.get(`http://localhost:${TEST_PORT}/api/test/traffic-custom?size=${sizeMB}`, {
      timeout: 30000
    });
    return response.status === 200;
  } catch (error) {
    console.log(`⚠️ 发送${sizeMB}MB流量失败:`, error.message);
    return false;
  }
}

async function waitForQuotaCheck(seconds = 15) {
  console.log(`⏳ 等待${seconds}秒让配额检查生效...`);
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function main() {
  console.log('🧪 测试紧急配额禁用的修复效果\n');

  // 1. 登录
  if (!await login()) {
    process.exit(1);
  }

  // 2. 重置用户流量
  console.log('\n1️⃣ 重置test用户流量...');
  if (!await resetUserTraffic()) {
    process.exit(1);
  }

  // 等待GOST配置同步完成
  console.log('⏳ 等待5秒让GOST配置同步完成...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 3. 检查初始状态
  console.log('\n2️⃣ 检查初始状态...');
  let userStatus = await getUserStatus();
  if (userStatus) {
    console.log(`📊 用户状态: ${userStatus.username} - ${userStatus.userStatus}`);
    console.log(`📊 流量使用: ${userStatus.usedMB}MB / ${userStatus.quotaGB}GB (${userStatus.usagePercent}%)`);
  }

  // 4. 测试端口连接
  console.log('\n3️⃣ 测试端口连接...');
  const portConnectable = await testPortConnection(TEST_PORT);
  console.log(`📡 端口${TEST_PORT}连接状态: ${portConnectable ? '✅ 可连接' : '❌ 不可连接'}`);

  if (!portConnectable) {
    console.log('❌ 端口不可连接，无法进行流量测试');
    process.exit(1);
  }

  // 5. 发送流量测试（10轮，每轮100MB）
  console.log('\n4️⃣ 发送流量测试（10轮测试）...');
  let totalSent = 0;
  let round = 1;
  const maxRounds = 10;

  while (round <= maxRounds) {
    console.log(`\n📤 第${round}轮: 发送100MB流量...`);

    // 测试端口连接状态
    const portConnectable = await testPortConnection(TEST_PORT);
    if (!portConnectable) {
      console.log(`🛑 第${round}轮: 端口${TEST_PORT}不可连接，流量限制已生效`);
      break;
    }

    const success = await sendTraffic(100);

    if (success) {
      totalSent += 100;
      console.log(`✅ 第${round}轮发送成功，累计: ${totalSent}MB`);

      // 等待一小段时间让统计更新
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 检查用户状态
      userStatus = await getUserStatus();
      if (userStatus) {
        console.log(`📊 数据库显示: ${userStatus.usedMB}MB (${userStatus.usagePercent}%)`);
        console.log(`📊 用户状态: ${userStatus.userStatus}`);
      }

      // 如果用户被暂停，立即测试端口
      if (userStatus && userStatus.userStatus === 'suspended') {
        console.log('\n🚨 用户已被暂停！立即测试端口状态...');

        // 等待一小段时间让GOST配置生效
        await new Promise(resolve => setTimeout(resolve, 3000));

        const portStillConnectable = await testPortConnection(TEST_PORT);
        console.log(`📡 端口${TEST_PORT}状态: ${portStillConnectable ? '❌ 仍可连接（BUG）' : '✅ 已断开（修复成功）'}`);

        if (portStillConnectable) {
          console.log('\n🔍 端口仍可连接，测试是否能发送流量...');
          const canSendMore = await sendTraffic(10);
          console.log(`📤 发送10MB测试: ${canSendMore ? '❌ 成功（BUG存在）' : '✅ 失败（修复生效）'}`);
        }

        break;
      }

      round++;
    } else {
      console.log(`❌ 第${round}轮发送失败，可能端口已被禁用`);
      break;
    }

    // 每轮之间等待一小段时间
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n📊 测试完成: 共进行${round-1}轮，发送${totalSent}MB流量`);

  // 6. 最终状态检查
  console.log('\n5️⃣ 最终状态检查...');
  userStatus = await getUserStatus();
  if (userStatus) {
    console.log(`📊 最终用户状态: ${userStatus.username} - ${userStatus.userStatus}`);
    console.log(`📊 最终流量使用: ${userStatus.usedMB}MB / ${userStatus.quotaGB}GB (${userStatus.usagePercent}%)`);
  }

  const finalPortStatus = await testPortConnection(TEST_PORT);
  console.log(`📡 最终端口${TEST_PORT}状态: ${finalPortStatus ? '❌ 仍可连接' : '✅ 已断开'}`);

  // 7. 结论
  console.log('\n🎯 测试结论:');
  if (userStatus && userStatus.userStatus === 'suspended' && !finalPortStatus) {
    console.log('✅ 紧急配额禁用修复成功！');
    console.log('   - 用户超配额后被正确暂停');
    console.log('   - 端口被正确断开');
    console.log('   - 强制重启机制工作正常');
  } else {
    console.log('❌ 修复可能不完全有效:');
    if (!userStatus || userStatus.userStatus !== 'suspended') {
      console.log('   - 用户未被正确暂停');
    }
    if (finalPortStatus) {
      console.log('   - 端口未被正确断开');
    }
  }

  console.log('\n🏁 测试完成');
}

main().catch(console.error);
