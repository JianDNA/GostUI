#!/usr/bin/env node

/**
 * GOST热加载详细测试脚本
 * 用于排查热加载功能是否正常工作
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const GOST_API_BASE = 'http://localhost:18080';
const CONFIG_FILE = path.join(__dirname, 'config/gost-config.json');

class GostHotReloadTester {
    constructor() {
        this.testResults = [];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : '🔍';
        const logMessage = `${prefix} [${timestamp}] ${message}`;
        console.log(logMessage);
        this.testResults.push({ timestamp, type, message });
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async makeRequest(method, url, data = null) {
        return new Promise((resolve) => {
            const postData = data ? JSON.stringify(data) : null;

            const options = {
                hostname: 'localhost',
                port: 18080,
                path: url,
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            if (postData) {
                options.headers['Content-Length'] = Buffer.byteLength(postData);
            }

            this.log(`发送请求: ${method} ${url}`);

            const req = http.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    this.log(`响应状态: ${res.statusCode}, 内容长度: ${responseData.length}`);
                    this.log(`响应内容前100字符: ${responseData.substring(0, 100)}`);

                    try {
                        const parsedData = responseData ? JSON.parse(responseData) : null;
                        this.log(`请求成功: ${res.statusCode}`, 'success');
                        resolve({ success: true, data: parsedData, status: res.statusCode });
                    } catch (error) {
                        this.log(`响应解析失败: ${error.message}`, 'error');
                        this.log(`原始响应: ${responseData}`);
                        resolve({ success: false, error: error.message, status: res.statusCode, rawData: responseData });
                    }
                });
            });

            req.on('error', (error) => {
                this.log(`请求失败: ${error.message}`, 'error');
                resolve({ success: false, error: error.message });
            });

            req.setTimeout(10000, () => {
                this.log('请求超时', 'error');
                req.destroy();
                resolve({ success: false, error: 'Request timeout' });
            });

            if (postData) {
                req.write(postData);
            }

            req.end();
        });
    }

    async getCurrentConfig() {
        this.log('=== 获取当前GOST配置 ===');
        const result = await this.makeRequest('GET', '/api/config');
        if (result.success) {
            this.log(`当前配置包含 ${result.data.services?.length || 0} 个服务`);
            if (result.data.services) {
                result.data.services.forEach(service => {
                    this.log(`  - 服务: ${service.name}, 地址: ${service.addr}`);
                });
            }
        }
        return result;
    }

    async testCreateService() {
        this.log('=== 测试创建新服务 ===');
        const testService = {
            name: 'test-service-12345',
            addr: ':12345',
            handler: { type: 'tcp' },
            listener: { type: 'tcp' }
        };

        const result = await this.makeRequest('POST', '/api/config/services', testService);
        if (result.success) {
            this.log('新服务创建成功', 'success');
            await this.sleep(2000); // 等待服务启动
            return true;
        }
        return false;
    }

    async testDeleteService() {
        this.log('=== 测试删除服务 ===');
        const result = await this.makeRequest('DELETE', '/api/config/services/test-service-12345');
        if (result.success) {
            this.log('服务删除成功', 'success');
            await this.sleep(2000); // 等待服务停止
            return true;
        }
        return false;
    }

    async testUpdateConfig() {
        this.log('=== 测试更新整个配置 ===');

        // 读取当前配置文件
        if (!fs.existsSync(CONFIG_FILE)) {
            this.log('配置文件不存在', 'error');
            return false;
        }

        const configContent = fs.readFileSync(CONFIG_FILE, 'utf8');
        const config = JSON.parse(configContent);

        this.log(`配置文件包含 ${config.services?.length || 0} 个服务`);

        const result = await this.makeRequest('PUT', '/api/config', config);
        if (result.success) {
            this.log('配置更新成功', 'success');
            await this.sleep(2000);
            return true;
        }
        return false;
    }

    async testServiceRemoval() {
        this.log('=== 测试服务移除场景 ===');

        // 1. 创建测试服务
        const testServices = [
            {
                name: 'test-port-6443',
                addr: ':6443',
                handler: { type: 'tcp' },
                listener: { type: 'tcp' }
            },
            {
                name: 'test-port-2365',
                addr: ':2365',
                handler: { type: 'tcp' },
                listener: { type: 'tcp' }
            }
        ];

        this.log('创建测试服务...');
        for (const service of testServices) {
            await this.makeRequest('POST', '/api/config/services', service);
            await this.sleep(1000);
        }

        // 2. 获取当前配置
        const currentConfig = await this.getCurrentConfig();
        if (!currentConfig.success) return false;

        // 3. 创建只包含一个服务的新配置
        const newConfig = {
            services: [
                {
                    name: 'test-port-9080',
                    addr: ':9080',
                    handler: { type: 'tcp' },
                    listener: { type: 'tcp' }
                }
            ]
        };

        this.log('更新配置，移除6443和2365服务...');
        const updateResult = await this.makeRequest('PUT', '/api/config', newConfig);

        if (updateResult.success) {
            await this.sleep(3000);

            // 4. 检查配置是否真正生效
            const finalConfig = await this.getCurrentConfig();
            if (finalConfig.success) {
                const serviceNames = finalConfig.data.services?.map(s => s.name) || [];
                this.log(`最终配置包含服务: ${serviceNames.join(', ')}`);

                if (serviceNames.includes('test-port-6443') || serviceNames.includes('test-port-2365')) {
                    this.log('❌ 服务移除失败！6443或2365仍然存在', 'error');
                    return false;
                } else {
                    this.log('✅ 服务移除成功', 'success');
                    return true;
                }
            }
        }

        return false;
    }

    async runAllTests() {
        this.log('🚀 开始GOST热加载详细测试');

        const tests = [
            { name: '获取当前配置', fn: () => this.getCurrentConfig() },
            { name: '创建新服务', fn: () => this.testCreateService() },
            { name: '删除服务', fn: () => this.testDeleteService() },
            { name: '更新整个配置', fn: () => this.testUpdateConfig() },
            { name: '服务移除场景', fn: () => this.testServiceRemoval() }
        ];

        const results = {};

        for (const test of tests) {
            this.log(`\n📋 执行测试: ${test.name}`);
            try {
                const result = await test.fn();
                results[test.name] = result;
                this.log(`测试 "${test.name}" ${result ? '通过' : '失败'}`, result ? 'success' : 'error');
            } catch (error) {
                this.log(`测试 "${test.name}" 异常: ${error.message}`, 'error');
                results[test.name] = false;
            }
            await this.sleep(1000);
        }

        this.log('\n📊 测试结果汇总:');
        Object.entries(results).forEach(([name, passed]) => {
            this.log(`  ${passed ? '✅' : '❌'} ${name}`);
        });

        return results;
    }
}

// 运行测试
async function main() {
    const tester = new GostHotReloadTester();
    await tester.runAllTests();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = GostHotReloadTester;
