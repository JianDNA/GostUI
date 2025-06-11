// 测试流量限制的自动化脚本
const axios = require('axios');

// 配置
const CONFIG = {
    BACKEND_URL: 'http://localhost:3000',
    TEST_PORT: 6443,
    TRAFFIC_SIZE: 100, // MB
    INTERVAL: 800, // ms
    USER_ID: 2, // test用户
    ADMIN_TOKEN: null
};

let testCount = 0;
let totalTraffic = 0;
let isRunning = false;

// 获取管理员token
async function getAdminToken() {
    try {
        const response = await axios.post(`${CONFIG.BACKEND_URL}/api/auth/login`, {
            username: 'admin',
            password: 'admin123'
        });
        CONFIG.ADMIN_TOKEN = response.data.token;
        console.log('✅ 管理员登录成功');
        return true;
    } catch (error) {
        console.error('❌ 管理员登录失败:', error.message);
        return false;
    }
}

// 重置test用户流量
async function resetUserTraffic() {
    try {
        const response = await axios.post(
            `${CONFIG.BACKEND_URL}/api/users/${CONFIG.USER_ID}/reset-traffic`,
            { reason: '自动化流量限制测试' },
            { headers: { Authorization: `Bearer ${CONFIG.ADMIN_TOKEN}` } }
        );
        console.log('🔄 用户流量已重置:', response.data.message);
        return true;
    } catch (error) {
        console.error('❌ 重置用户流量失败:', error.message);
        return false;
    }
}

// 发送流量测试请求
async function sendTrafficTest() {
    try {
        const startTime = Date.now();
        console.log(`🚀 [${testCount + 1}] 开始发送 ${CONFIG.TRAFFIC_SIZE}MB 流量到端口 ${CONFIG.TEST_PORT}...`);

        // 创建新的axios实例，禁用连接池和缓存
        const axiosInstance = axios.create({
            timeout: 5000,
            maxRedirects: 0,
            httpAgent: false,
            httpsAgent: false,
            headers: {
                'Connection': 'close',
                'Cache-Control': 'no-cache'
            }
        });

        const response = await axiosInstance.get(
            `http://localhost:${CONFIG.TEST_PORT}/api/test/traffic-custom?size=${CONFIG.TRAFFIC_SIZE}`
        );
        const endTime = Date.now();
        const duration = endTime - startTime;

        testCount++;
        totalTraffic += CONFIG.TRAFFIC_SIZE;

        console.log(`✅ [${testCount}] 流量测试成功: ${CONFIG.TRAFFIC_SIZE}MB, 耗时: ${duration}ms, 累计: ${totalTraffic}MB`);

        // 检查是否超过配额
        if (totalTraffic > 512) {
            console.log(`🚨 警告: 已超过512MB配额! 当前累计: ${totalTraffic}MB - 但端口仍然可用!`);
        }

        return true;
    } catch (error) {
        console.error(`❌ [${testCount + 1}] 流量测试失败:`, error.message);

        // 如果是连接被拒绝，可能是流量限制生效了
        if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
            console.log('🛑 连接被拒绝 - 流量限制可能生效了!');
            return false;
        }

        if (error.code === 'ETIMEDOUT') {
            console.log('⏰ 请求超时 - 可能是流量限制导致的');
            return false;
        }

        return true; // 其他错误继续测试
    }
}

// 独立的端口连接测试
async function testPortConnection() {
    try {
        console.log(`🔌 独立测试端口 ${CONFIG.TEST_PORT} 连接性...`);

        const axiosInstance = axios.create({
            timeout: 3000,
            maxRedirects: 0,
            headers: { 'Connection': 'close' }
        });

        const response = await axiosInstance.get(
            `http://localhost:${CONFIG.TEST_PORT}/api/test/traffic-custom?size=1`
        );

        console.log(`✅ 端口 ${CONFIG.TEST_PORT} 连接成功 - 这可能表明流量限制未生效`);
        return true;
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log(`🛑 端口 ${CONFIG.TEST_PORT} 连接被拒绝 - 流量限制已生效`);
            return false;
        } else {
            console.log(`⚠️ 端口 ${CONFIG.TEST_PORT} 连接测试异常: ${error.message}`);
            return false;
        }
    }
}

// 获取用户流量统计
async function getUserTraffic() {
    try {
        const response = await axios.get(
            `${CONFIG.BACKEND_URL}/api/users/${CONFIG.USER_ID}`,
            { headers: { Authorization: `Bearer ${CONFIG.ADMIN_TOKEN}` } }
        );

        // 修复API返回结构问题
        const user = response.data.data || response.data;

        // 调试输出原始数据
        console.log(`🔍 [DEBUG] 原始用户数据: usedTraffic=${user.usedTraffic}, userStatus=${user.userStatus}`);

        // 处理可能的null/undefined值 - 使用正确的字段名
        const usedTrafficBytes = user.usedTraffic || 0;
        const trafficMB = Math.round(usedTrafficBytes / 1024 / 1024 * 100) / 100;
        const percentage = Math.round(trafficMB/512*100);
        console.log(`📊 数据库流量: ${trafficMB}MB / 512MB (${percentage}%) | 状态: ${user.userStatus}`);

        // 检查用户状态 - 使用正确的字段名
        if (user.userStatus === 'suspended' && totalTraffic > 512) {
            console.log('🔒 用户已被暂停，但端口仍然可用 - 这是问题所在!');
        }

        return trafficMB;
    } catch (error) {
        console.error('❌ 获取用户流量失败:', error.message);
        if (error.response) {
            console.error('❌ 响应状态:', error.response.status);
            console.error('❌ 响应数据:', JSON.stringify(error.response.data, null, 2));
        }
        return 0;
    }
}

// 检查端口状态
async function checkPortStatus() {
    try {
        const response = await axios.get(
            `${CONFIG.BACKEND_URL}/api/user-forward-rules`,
            { headers: { Authorization: `Bearer ${CONFIG.ADMIN_TOKEN}` } }
        );

        console.log(`🔍 [DEBUG] API响应结构:`, JSON.stringify(response.data, null, 2));

        // 查找所有用户的规则
        let allRules = [];

        // 处理管理员视图的分组数据
        if (response.data.groupedRules && Array.isArray(response.data.groupedRules)) {
            response.data.groupedRules.forEach(group => {
                if (group.rules && Array.isArray(group.rules)) {
                    allRules = allRules.concat(group.rules.map(rule => ({
                        ...rule,
                        User: { username: group.username, userStatus: group.userStatus }
                    })));
                }
            });
        }
        // 处理单用户视图的数据
        else if (response.data.rules && Array.isArray(response.data.rules)) {
            allRules = response.data.rules;
        }

        console.log(`🔍 [DEBUG] 找到 ${allRules.length} 个规则`);

        if (allRules.length > 0) {
            const rules = allRules.filter(rule => rule.sourcePort == CONFIG.TEST_PORT);
            if (rules.length > 0) {
                const rule = rules[0];
                console.log(`🔍 端口${CONFIG.TEST_PORT}状态: isActive=${rule.isActive}, 用户状态=${rule.User?.userStatus || rule.user?.userStatus}`);

                // 详细状态分析
                if (!rule.isActive) {
                    console.log(`🔍 端口${CONFIG.TEST_PORT}被禁用的原因: 用户状态=${rule.User?.userStatus || rule.user?.userStatus}`);
                }
            } else {
                console.log(`🔍 端口${CONFIG.TEST_PORT}: 未找到对应的转发规则`);
            }
        } else {
            console.log(`🔍 端口${CONFIG.TEST_PORT}: 没有找到任何转发规则`);
        }
    } catch (error) {
        console.error('❌ 检查端口状态失败:', error.message);
        if (error.response) {
            console.error('❌ 响应状态:', error.response.status);
            console.error('❌ 响应数据:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

// 主测试循环
async function runTrafficTest() {
    console.log('🎯 开始自动化流量限制测试...');
    console.log(`📋 配置: 端口${CONFIG.TEST_PORT}, 每次${CONFIG.TRAFFIC_SIZE}MB, 间隔${CONFIG.INTERVAL}ms`);
    console.log('🔍 实时监控: 发送流量 -> 检查数据库 -> 检查端口状态');
    console.log('');

    isRunning = true;

    while (isRunning) {
        console.log(`\n--- 第 ${testCount + 1} 轮测试 ---`);

        // 1. 发送流量测试
        const success = await sendTrafficTest();

        // 2. 获取数据库中的流量统计
        await getUserTraffic();

        // 3. 检查端口状态
        await checkPortStatus();

        // 4. 独立连接测试
        const canConnect = await testPortConnection();

        if (!success) {
            console.log('🛑 测试停止 - 连接失败，流量限制可能生效');
            break;
        }

        // 检查连接状态与用户状态的一致性
        if (!canConnect) {
            console.log('🎉 流量限制已生效 - 端口无法连接');
            break;
        }

        // 如果已经发送了很多流量但仍然成功，说明有问题
        if (totalTraffic > 1000) {
            console.log('🚨 严重问题: 已发送超过1GB流量，但流量限制仍未生效!');
        }

        // 等待指定间隔
        console.log(`⏳ 等待 ${CONFIG.INTERVAL}ms 后继续...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.INTERVAL));
    }
}

// 启动测试
async function startTest() {
    console.log('🚀 启动流量限制测试...');
    console.log('📝 测试目标: 验证超过512MB配额后端口是否会被禁用');
    console.log('');

    // 1. 获取管理员token
    if (!(await getAdminToken())) {
        return;
    }

    // 2. 重置用户流量
    console.log('🔄 重置test用户流量...');
    if (!(await resetUserTraffic())) {
        return;
    }

    // 等待重置生效
    console.log('⏳ 等待5秒让重置和配置同步生效...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 3. 开始流量测试
    await runTrafficTest();
}

// 处理退出信号
process.on('SIGINT', () => {
    console.log('\n🛑 收到退出信号，停止测试...');
    console.log(`📊 测试总结: 发送了 ${testCount} 次请求，总计 ${totalTraffic}MB 流量`);
    isRunning = false;
    process.exit(0);
});

// 启动测试
startTest().catch(error => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
});
