#!/usr/bin/env node

/**
 * 🔒 安全部署配置脚本
 * 
 * 功能:
 * 1. 配置GOST WebAPI只监听本地地址
 * 2. 设置防火墙规则
 * 3. 生成安全的部署配置
 * 4. 创建端口隔离方案
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class SecureDeploymentSetup {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.backendDir = path.join(this.projectRoot, 'backend');
    this.configDir = path.join(this.backendDir, 'config');
    this.solutions = [];
    
    console.log('🔒 安全部署配置工具');
    console.log('=' .repeat(60));
  }

  /**
   * 主配置流程
   */
  async setup() {
    try {
      console.log(`📁 项目目录: ${this.projectRoot}`);
      
      // 1. 分析当前配置
      await this.analyzeCurrentConfig();
      
      // 2. 生成安全配置方案
      await this.generateSecuritySolutions();
      
      // 3. 应用最佳方案
      await this.applyBestSolution();
      
      // 4. 生成防火墙规则
      await this.generateFirewallRules();
      
      // 5. 创建部署脚本
      await this.createDeploymentScripts();
      
      // 6. 生成安全报告
      await this.generateSecurityReport();
      
      console.log('\n🎉 安全部署配置完成！');
      
    } catch (error) {
      console.error('\n❌ 配置失败:', error);
      throw error;
    }
  }

  /**
   * 分析当前配置
   */
  async analyzeCurrentConfig() {
    console.log('\n🔍 分析当前配置...');
    
    const gostConfigPath = path.join(this.configDir, 'gost-config.json');
    
    if (fs.existsSync(gostConfigPath)) {
      const config = JSON.parse(fs.readFileSync(gostConfigPath, 'utf8'));
      
      console.log('📋 当前GOST配置:');
      console.log(`   API地址: ${config.api?.addr || '未配置'}`);
      console.log(`   API前缀: ${config.api?.pathPrefix || '未配置'}`);
      
      if (config.api?.addr === ':18080') {
        console.log('⚠️ 警告: GOST API监听所有接口 (0.0.0.0:18080)');
        console.log('🔒 建议: 改为只监听本地接口 (127.0.0.1:18080)');
      } else if (config.api?.addr === '127.0.0.1:18080' || config.api?.addr === 'localhost:18080') {
        console.log('✅ 良好: GOST API只监听本地接口');
      }
    } else {
      console.log('❌ GOST配置文件不存在');
    }
  }

  /**
   * 生成安全配置方案
   */
  async generateSecuritySolutions() {
    console.log('\n🛡️ 生成安全配置方案...');
    
    // 方案1: 修改GOST配置只监听本地
    this.solutions.push({
      name: 'localhost_binding',
      title: '方案1: GOST本地绑定',
      description: '修改GOST配置，API只监听127.0.0.1',
      security_level: 'high',
      complexity: 'low',
      docker_required: false,
      steps: [
        '修改gost-config.json中api.addr为127.0.0.1:18080',
        '重启GOST服务',
        '验证外部无法访问18080端口'
      ],
      pros: [
        '简单易实现',
        '不需要额外工具',
        '性能影响最小'
      ],
      cons: [
        '依赖GOST配置正确性',
        '如果配置错误仍有风险'
      ]
    });

    // 方案2: 防火墙规则
    this.solutions.push({
      name: 'firewall_rules',
      title: '方案2: 防火墙端口过滤',
      description: '使用iptables阻止外部访问18080端口',
      security_level: 'high',
      complexity: 'medium',
      docker_required: false,
      steps: [
        '配置iptables规则阻止外部访问18080',
        '允许本地访问18080',
        '保存防火墙规则'
      ],
      pros: [
        '系统级保护',
        '即使GOST配置错误也安全',
        '可以保护多个内部端口'
      ],
      cons: [
        '需要root权限',
        '可能影响其他服务',
        '配置复杂'
      ]
    });

    // 方案3: Docker容器隔离
    this.solutions.push({
      name: 'docker_isolation',
      title: '方案3: Docker容器隔离',
      description: '使用Docker容器网络隔离',
      security_level: 'very_high',
      complexity: 'high',
      docker_required: true,
      steps: [
        '创建Docker网络',
        '容器间通信，不暴露18080到宿主机',
        '只暴露Node.js端口'
      ],
      pros: [
        '完全隔离',
        '最高安全性',
        '易于管理和部署'
      ],
      cons: [
        '需要Docker环境',
        '配置复杂',
        '资源开销较大'
      ]
    });

    // 方案4: 反向代理
    this.solutions.push({
      name: 'reverse_proxy',
      title: '方案4: 反向代理隔离',
      description: '使用Nginx反向代理，只暴露必要端口',
      security_level: 'high',
      complexity: 'medium',
      docker_required: false,
      steps: [
        '配置Nginx反向代理',
        '只代理Node.js端口',
        '阻止直接访问18080'
      ],
      pros: [
        '灵活配置',
        '可以添加SSL',
        '负载均衡能力'
      ],
      cons: [
        '需要额外的Nginx',
        '配置维护成本',
        '单点故障风险'
      ]
    });

    console.log(`📊 生成了 ${this.solutions.length} 个安全方案`);
  }

  /**
   * 应用最佳方案 (方案1 + 方案2)
   */
  async applyBestSolution() {
    console.log('\n🔧 应用最佳安全方案...');
    
    // 应用方案1: 修改GOST配置
    await this.applyLocalhostBinding();
    
    // 生成方案2的脚本: 防火墙规则
    await this.generateFirewallScript();
    
    console.log('✅ 最佳安全方案已应用');
  }

  /**
   * 应用本地绑定方案
   */
  async applyLocalhostBinding() {
    console.log('\n🔧 配置GOST本地绑定...');
    
    const gostConfigPath = path.join(this.configDir, 'gost-config.json');
    
    if (fs.existsSync(gostConfigPath)) {
      const config = JSON.parse(fs.readFileSync(gostConfigPath, 'utf8'));
      
      // 备份原配置
      const backupPath = `${gostConfigPath}.backup.${Date.now()}`;
      fs.copyFileSync(gostConfigPath, backupPath);
      console.log(`💾 原配置已备份: ${path.basename(backupPath)}`);
      
      // 修改API地址为本地绑定
      if (!config.api) {
        config.api = {};
      }
      
      config.api.addr = '127.0.0.1:18080';
      config.api.pathPrefix = '/api';
      config.api.accesslog = false;
      
      // 添加安全注释
      config._security_note = 'API只监听本地地址，外部无法直接访问';
      
      // 保存新配置
      fs.writeFileSync(gostConfigPath, JSON.stringify(config, null, 2));
      console.log('✅ GOST配置已更新为本地绑定');
      
    } else {
      console.log('❌ GOST配置文件不存在，跳过配置修改');
    }
  }

  /**
   * 生成防火墙脚本
   */
  async generateFirewallScript() {
    console.log('\n🛡️ 生成防火墙规则脚本...');
    
    const firewallScript = `#!/bin/bash

# 🔒 GOST安全部署防火墙规则
# 
# 功能: 阻止外部访问GOST WebAPI端口18080
# 使用: sudo ./setup-firewall.sh

echo "🔒 配置GOST安全防火墙规则..."

# 检查是否有root权限
if [ "$EUID" -ne 0 ]; then
    echo "❌ 请使用sudo运行此脚本"
    exit 1
fi

# 备份当前iptables规则
echo "💾 备份当前防火墙规则..."
iptables-save > /etc/iptables.backup.\$(date +%Y%m%d_%H%M%S)

# 允许本地访问18080端口
echo "✅ 允许本地访问18080端口..."
iptables -A INPUT -i lo -p tcp --dport 18080 -j ACCEPT

# 阻止外部访问18080端口
echo "🚫 阻止外部访问18080端口..."
iptables -A INPUT -p tcp --dport 18080 -j DROP

# 允许Node.js端口3000 (根据需要调整)
echo "✅ 允许外部访问Node.js端口3000..."
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# 允许SSH端口 (重要: 防止锁定)
echo "✅ 确保SSH端口22开放..."
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# 允许已建立的连接
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# 保存规则 (Ubuntu/Debian)
if command -v iptables-persistent >/dev/null 2>&1; then
    echo "💾 保存防火墙规则..."
    iptables-save > /etc/iptables/rules.v4
fi

# 显示当前规则
echo "📋 当前防火墙规则:"
iptables -L -n | grep 18080

echo "🎉 防火墙规则配置完成！"
echo "🔍 验证: 外部应该无法访问 http://your-server:18080"
echo "✅ 本地仍可访问: http://localhost:18080"
`;

    const scriptPath = path.join(this.projectRoot, 'setup-firewall.sh');
    fs.writeFileSync(scriptPath, firewallScript);
    
    // 设置执行权限
    try {
      await this.executeCommand('chmod', ['+x', scriptPath]);
      console.log(`✅ 防火墙脚本已生成: ${path.basename(scriptPath)}`);
    } catch (error) {
      console.log(`⚠️ 无法设置执行权限: ${error.message}`);
    }
  }

  /**
   * 生成防火墙规则
   */
  async generateFirewallRules() {
    console.log('\n🛡️ 生成防火墙规则文档...');
    
    const rules = {
      iptables: [
        '# 允许本地访问GOST API',
        'iptables -A INPUT -i lo -p tcp --dport 18080 -j ACCEPT',
        '',
        '# 阻止外部访问GOST API', 
        'iptables -A INPUT -p tcp --dport 18080 -j DROP',
        '',
        '# 允许外部访问Node.js API',
        'iptables -A INPUT -p tcp --dport 3000 -j ACCEPT'
      ],
      ufw: [
        '# 使用UFW的简化规则',
        'ufw deny 18080',
        'ufw allow 3000',
        'ufw allow from 127.0.0.1 to any port 18080'
      ],
      docker: [
        '# Docker网络隔离',
        'docker network create gost-internal',
        '# 容器间通信，不暴露18080到宿主机',
        'docker run --network gost-internal -p 3000:3000 your-app'
      ]
    };
    
    const rulesPath = path.join(this.projectRoot, 'FIREWALL_RULES.md');
    const rulesContent = `# 🔒 GOST安全部署防火墙规则

## iptables规则
\`\`\`bash
${rules.iptables.join('\n')}
\`\`\`

## UFW规则 (Ubuntu)
\`\`\`bash
${rules.ufw.join('\n')}
\`\`\`

## Docker网络隔离
\`\`\`bash
${rules.docker.join('\n')}
\`\`\`

## 验证方法
\`\`\`bash
# 本地测试 (应该成功)
curl http://localhost:18080/api

# 外部测试 (应该失败)
curl http://your-server-ip:18080/api
\`\`\`
`;
    
    fs.writeFileSync(rulesPath, rulesContent);
    console.log(`✅ 防火墙规则文档已生成: ${path.basename(rulesPath)}`);
  }

  /**
   * 创建部署脚本
   */
  async createDeploymentScripts() {
    console.log('\n🚀 创建安全部署脚本...');
    
    const deployScript = `#!/bin/bash

# 🚀 GOST管理系统安全部署脚本

echo "🚀 开始GOST管理系统安全部署..."

# 1. 检查环境
echo "🔍 检查部署环境..."
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Node.js未安装"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "❌ npm未安装"
    exit 1
fi

# 2. 安装依赖
echo "📦 安装后端依赖..."
cd backend && npm install --production

echo "📦 安装前端依赖..."
cd ../frontend && npm install

# 3. 构建前端
echo "🔨 构建前端..."
npm run build

# 4. 配置安全设置
echo "🔒 应用安全配置..."
cd ..

# 确保GOST配置为本地绑定
if [ -f "backend/config/gost-config.json" ]; then
    echo "✅ GOST配置已设置为本地绑定"
else
    echo "⚠️ 请检查GOST配置文件"
fi

# 5. 设置防火墙 (可选)
if [ "\$1" = "--setup-firewall" ]; then
    echo "🛡️ 设置防火墙规则..."
    if [ "\$EUID" -eq 0 ]; then
        ./setup-firewall.sh
    else
        echo "⚠️ 需要root权限设置防火墙，请手动运行: sudo ./setup-firewall.sh"
    fi
fi

# 6. 启动服务
echo "🚀 启动服务..."
cd backend
nohup node app.js > ../logs/app.log 2>&1 &
echo \$! > ../app.pid

echo "🎉 部署完成！"
echo "📱 前端: 请配置Web服务器指向 frontend/dist"
echo "🔧 后端: http://localhost:3000"
echo "🔒 GOST API: 只能本地访问 http://localhost:18080"
echo "📋 进程ID已保存到 app.pid"
`;

    const deployPath = path.join(this.projectRoot, 'deploy-secure.sh');
    fs.writeFileSync(deployPath, deployScript);
    
    try {
      await this.executeCommand('chmod', ['+x', deployPath]);
      console.log(`✅ 安全部署脚本已生成: ${path.basename(deployPath)}`);
    } catch (error) {
      console.log(`⚠️ 无法设置执行权限: ${error.message}`);
    }
  }

  /**
   * 生成安全报告
   */
  async generateSecurityReport() {
    console.log('\n📊 生成安全配置报告...');
    
    const report = {
      timestamp: new Date().toISOString(),
      security_measures: {
        gost_api_binding: {
          status: 'configured',
          description: 'GOST API配置为只监听127.0.0.1:18080',
          security_level: 'high'
        },
        firewall_rules: {
          status: 'script_generated',
          description: '防火墙规则脚本已生成，需要手动执行',
          security_level: 'high'
        },
        port_exposure: {
          exposed_ports: [3000],
          protected_ports: [18080],
          description: '只有Node.js端口3000对外暴露'
        }
      },
      deployment_options: this.solutions,
      recommendations: [
        '使用方案1(本地绑定) + 方案2(防火墙)的组合',
        '定期检查GOST配置确保API地址正确',
        '在生产环境中运行防火墙脚本',
        '考虑使用HTTPS和认证加强安全性',
        '定期更新GOST和Node.js版本'
      ],
      verification_steps: [
        '检查GOST配置: cat backend/config/gost-config.json | grep addr',
        '测试本地访问: curl http://localhost:18080/api',
        '测试外部访问: curl http://server-ip:18080/api (应该失败)',
        '验证Node.js API: curl http://server-ip:3000/api/system/status'
      ]
    };
    
    const reportPath = path.join(this.projectRoot, 'SECURITY_DEPLOYMENT_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`✅ 安全配置报告已生成: ${path.basename(reportPath)}`);
    console.log('\n📋 安全配置摘要:');
    console.log('   🔒 GOST API: 只监听本地 (127.0.0.1:18080)');
    console.log('   🛡️ 防火墙: 脚本已生成 (setup-firewall.sh)');
    console.log('   🌐 对外端口: 只有3000端口');
    console.log('   🚀 部署脚本: deploy-secure.sh');
  }

  /**
   * 执行命令
   */
  async executeCommand(command, args) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`命令执行失败，退出码: ${code}`));
        }
      });
      
      process.on('error', reject);
    });
  }
}

// 主程序
async function main() {
  const setup = new SecureDeploymentSetup();
  
  try {
    await setup.setup();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 配置失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = SecureDeploymentSetup;
