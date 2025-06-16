/**
 * 生产环境安全配置
 * 
 * 此文件定义了生产环境中的安全策略和限制
 * 
 * ⚠️ 重要: 在生产环境中部署时，请仔细审查这些安全设置
 */

const productionSecurity = {
  // 🔒 禁用的功能列表
  disabledFeatures: {
    // 测试相关功能
    testScripts: true,
    testDataGeneration: true,
    integrationChecks: true,
    
    // 调试功能
    debugEndpoints: true,
    verboseLogging: false,
    
    // 危险操作
    bulkDataOperations: true,
    configComparison: false, // 可以查看但需要特殊授权
    manualSync: false        // 可以执行但需要特殊授权
  },

  // 🛡️ 需要特殊授权的操作
  restrictedOperations: [
    '/api/gost-config/sync',
    '/api/gost-config/compare',
    '/api/gost-config/auto-sync/start',
    '/api/gost-config/auto-sync/stop'
  ],

  // 🔐 安全头配置
  securityHeaders: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"
  },

  // 📝 审计日志配置
  auditLogging: {
    enabled: true,
    logSensitiveOperations: true,
    logFailedAttempts: true,
    retentionDays: 90
  },

  // 🚨 告警配置
  alerting: {
    enabled: true,
    alertOnTestScriptAttempt: true,
    alertOnUnauthorizedAccess: true,
    alertOnConfigChanges: true
  },

  // 🔍 监控配置
  monitoring: {
    trackApiUsage: true,
    trackConfigChanges: true,
    trackUserActions: true
  }
};

/**
 * 检查当前环境是否为生产环境
 */
function isProductionEnvironment() {
  const env = process.env.NODE_ENV;
  const productionIndicators = [
    env === 'production',
    process.env.PM2_HOME,
    process.env.PRODUCTION,
    process.env.PROD,
    process.env.DATABASE_URL
  ];
  
  return productionIndicators.some(indicator => indicator);
}

/**
 * 验证生产环境授权令牌
 */
function validateProductionAuth(token) {
  const requiredToken = process.env.PRODUCTION_AUTH_TOKEN;
  
  if (!requiredToken) {
    console.warn('⚠️ 警告: 未设置 PRODUCTION_AUTH_TOKEN 环境变量');
    return false;
  }
  
  return token === requiredToken;
}

/**
 * 记录安全事件
 */
function logSecurityEvent(event, details = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    environment: process.env.NODE_ENV,
    ...details
  };
  
  console.log('🔒 安全事件:', JSON.stringify(logEntry));
  
  // 在生产环境中，这里应该发送到专门的安全日志系统
  if (isProductionEnvironment()) {
    // TODO: 发送到安全监控系统
    // securityMonitor.log(logEntry);
  }
}

/**
 * 阻止测试脚本在生产环境中运行
 */
function blockTestScripts(scriptName) {
  if (isProductionEnvironment()) {
    logSecurityEvent('TEST_SCRIPT_BLOCKED', {
      scriptName,
      reason: 'Production environment detected'
    });
    
    console.error('🚨 安全警告: 测试脚本在生产环境中被阻止');
    console.error(`   脚本名称: ${scriptName}`);
    console.error('   原因: 检测到生产环境');
    console.error('   建议: 请在开发或测试环境中运行测试脚本');
    
    process.exit(1);
  }
}

/**
 * 生产环境安全中间件
 */
function createProductionSafetyMiddleware() {
  return (req, res, next) => {
    if (!isProductionEnvironment()) {
      return next();
    }

    // 添加安全头
    Object.entries(productionSecurity.securityHeaders).forEach(([header, value]) => {
      res.setHeader(header, value);
    });

    // 检查是否为受限操作
    const isRestricted = productionSecurity.restrictedOperations.some(
      operation => req.path.includes(operation.replace('/api', ''))
    );

    if (isRestricted) {
      const authToken = req.headers['x-production-auth'];
      
      if (!validateProductionAuth(authToken)) {
        logSecurityEvent('UNAUTHORIZED_RESTRICTED_ACCESS', {
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        
        return res.status(403).json({
          success: false,
          message: '生产环境中此操作需要特殊授权',
          error: 'PRODUCTION_SAFETY_BLOCK',
          hint: '请联系系统管理员获取生产环境授权令牌'
        });
      }
      
      logSecurityEvent('AUTHORIZED_RESTRICTED_ACCESS', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
    }

    next();
  };
}

module.exports = {
  productionSecurity,
  isProductionEnvironment,
  validateProductionAuth,
  logSecurityEvent,
  blockTestScripts,
  createProductionSafetyMiddleware
};
