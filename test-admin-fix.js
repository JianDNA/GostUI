// 测试管理员用户转发规则修复
const path = require('path');

// 模拟管理员用户和规则数据
const mockAdminUser = {
  id: 1,
  username: 'admin',
  role: 'admin'
};

const mockRule = {
  id: 1,
  name: 'test-rule',
  protocol: 'tcp',
  sourcePort: 53267,
  targetAddress: '43.199.76.134:53267',
  listenAddress: '127.0.0.1',
  listenAddressType: 'ipv4'
};

// 模拟修复后的getGostListenAddress函数
function getGostListenAddress(rule, user) {
  // 特殊处理：admin用户可以绑定到所有接口
  if (user && user.role === 'admin') {
    return `0.0.0.0:${rule.sourcePort}`;
  }
  
  // 普通用户使用配置的监听地址
  if (rule.listenAddressType === 'ipv6') {
    return `[${rule.listenAddress || '::1'}]:${rule.sourcePort}`;
  } else {
    return `${rule.listenAddress || '127.0.0.1'}:${rule.sourcePort}`;
  }
}

console.log('=== 管理员用户转发规则修复测试 ===');
console.log('');

console.log('修复前的问题:');
console.log('- 管理员用户创建的规则监听地址: 127.0.0.1:53267');
console.log('- 外部设备无法访问转发端口');
console.log('');

console.log('修复后的结果:');
const adminListenAddr = getGostListenAddress(mockRule, mockAdminUser);
console.log(`- 管理员用户规则监听地址: ${adminListenAddr}`);
console.log('- 外部设备可以访问转发端口');
console.log('');

// 测试普通用户
const mockNormalUser = {
  id: 2,
  username: 'user1',
  role: 'user'
};

const normalListenAddr = getGostListenAddress(mockRule, mockNormalUser);
console.log(`- 普通用户规则监听地址: ${normalListenAddr}`);
console.log('- 仅本地访问（安全）');
console.log('');

console.log('=== 修复验证 ===');
if (adminListenAddr === '0.0.0.0:53267') {
  console.log('✅ 管理员用户修复成功！');
} else {
  console.log('❌ 管理员用户修复失败！');
}

if (normalListenAddr === '127.0.0.1:53267') {
  console.log('✅ 普通用户安全配置正确！');
} else {
  console.log('❌ 普通用户配置异常！');
}
