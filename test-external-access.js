// 测试外部访问控制功能（IPv4和IPv6）
console.log('=== 外部访问控制测试 ===');
console.log('');

// 模拟用户数据
const adminUser = {
  id: 1,
  username: 'admin',
  role: 'admin'
};

const normalUser = {
  id: 2,
  username: 'user1',
  role: 'user'
};

// 模拟规则数据
const ipv4Rule = {
  sourcePort: 53267,
  listenAddressType: 'ipv4'
};

const ipv6Rule = {
  sourcePort: 53268,
  listenAddressType: 'ipv6'
};

// 模拟getGostListenAddress函数
function getGostListenAddress(rule, user, allowUserExternalAccess) {
  // 管理员用户可以绑定到所有接口
  if (user && user.role === 'admin') {
    if (rule.listenAddressType === 'ipv6') {
      return `[::]:${rule.sourcePort}`;  // IPv6所有接口
    } else {
      return `0.0.0.0:${rule.sourcePort}`;  // IPv4所有接口
    }
  }
  
  // 普通用户：根据系统配置决定是否允许外部访问
  if (allowUserExternalAccess) {
    // 允许外部访问：监听所有接口
    if (rule.listenAddressType === 'ipv6') {
      return `[::]:${rule.sourcePort}`;  // IPv6所有接口
    } else {
      return `0.0.0.0:${rule.sourcePort}`;  // IPv4所有接口
    }
  } else {
    // 仅本地访问：监听回环接口
    if (rule.listenAddressType === 'ipv6') {
      return `[::1]:${rule.sourcePort}`;  // IPv6回环
    } else {
      return `127.0.0.1:${rule.sourcePort}`;  // IPv4回环
    }
  }
}

console.log('🔧 测试场景1: 允许普通用户外部访问 (allowUserExternalAccess = true)');
console.log('');

// 管理员用户 - IPv4
const adminIPv4Allow = getGostListenAddress(ipv4Rule, adminUser, true);
console.log(`管理员用户 IPv4: ${adminIPv4Allow}`);

// 管理员用户 - IPv6
const adminIPv6Allow = getGostListenAddress(ipv6Rule, adminUser, true);
console.log(`管理员用户 IPv6: ${adminIPv6Allow}`);

// 普通用户 - IPv4
const userIPv4Allow = getGostListenAddress(ipv4Rule, normalUser, true);
console.log(`普通用户 IPv4: ${userIPv4Allow}`);

// 普通用户 - IPv6
const userIPv6Allow = getGostListenAddress(ipv6Rule, normalUser, true);
console.log(`普通用户 IPv6: ${userIPv6Allow}`);

console.log('');
console.log('🔒 测试场景2: 禁止普通用户外部访问 (allowUserExternalAccess = false)');
console.log('');

// 管理员用户 - IPv4
const adminIPv4Deny = getGostListenAddress(ipv4Rule, adminUser, false);
console.log(`管理员用户 IPv4: ${adminIPv4Deny}`);

// 管理员用户 - IPv6
const adminIPv6Deny = getGostListenAddress(ipv6Rule, adminUser, false);
console.log(`管理员用户 IPv6: ${adminIPv6Deny}`);

// 普通用户 - IPv4
const userIPv4Deny = getGostListenAddress(ipv4Rule, normalUser, false);
console.log(`普通用户 IPv4: ${userIPv4Deny}`);

// 普通用户 - IPv6
const userIPv6Deny = getGostListenAddress(ipv6Rule, normalUser, false);
console.log(`普通用户 IPv6: ${userIPv6Deny}`);

console.log('');
console.log('=== 验证结果 ===');

// 验证场景1
const scenario1Pass = 
  adminIPv4Allow === '0.0.0.0:53267' &&
  adminIPv6Allow === '[::]:53268' &&
  userIPv4Allow === '0.0.0.0:53267' &&
  userIPv6Allow === '[::]:53268';

console.log(`场景1 (允许外部访问): ${scenario1Pass ? '✅ 通过' : '❌ 失败'}`);

// 验证场景2
const scenario2Pass = 
  adminIPv4Deny === '0.0.0.0:53267' &&
  adminIPv6Deny === '[::]:53268' &&
  userIPv4Deny === '127.0.0.1:53267' &&
  userIPv6Deny === '[::1]:53268';

console.log(`场景2 (禁止外部访问): ${scenario2Pass ? '✅ 通过' : '❌ 失败'}`);

console.log('');
console.log('📋 功能说明:');
console.log('- 管理员用户始终可以外部访问（不受配置限制）');
console.log('- 普通用户根据系统配置决定是否允许外部访问');
console.log('- IPv4: 0.0.0.0 (所有接口) vs 127.0.0.1 (回环)');
console.log('- IPv6: [::] (所有接口) vs [::1] (回环)');
