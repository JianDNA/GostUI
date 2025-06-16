/**
 * 生产环境安全中间件
 * 在生产环境中，某些危险操作需要额外验证
 */

const { defaultLogger: logger } = require('../utils/logger');

const productionSafetyMiddleware = (req, res, next) => {
  const env = process.env.NODE_ENV || 'development';

  // 检查是否禁用生产环境安全检查
  if (process.env.DISABLE_PRODUCTION_SAFETY === 'true') {
    logger.info(`🔓 生产环境安全检查已禁用: ${req.method} ${req.path}`);
    return next();
  }

  // 在生产环境中，某些危险操作需要额外验证
  if (env === 'production') {
    const dangerousEndpoints = ['/compare', '/sync'];
    const isDangerous = dangerousEndpoints.some(endpoint => req.path.includes(endpoint));

    if (isDangerous) {
      logger.warn(`🔒 生产环境安全检查: ${req.method} ${req.path} 被标记为危险操作`);

      // 检查是否有特殊的生产环境授权
      const productionAuth = req.headers['x-production-auth'];
      if (!productionAuth || productionAuth !== process.env.PRODUCTION_AUTH_TOKEN) {
        logger.warn(`🚫 生产环境授权失败: ${req.method} ${req.path}`);
        return res.status(403).json({
          success: false,
          message: '生产环境中此操作需要特殊授权',
          error: 'PRODUCTION_SAFETY_BLOCK',
          hint: '可以设置环境变量 DISABLE_PRODUCTION_SAFETY=true 来禁用此检查'
        });
      }

      logger.info(`✅ 生产环境授权通过: ${req.method} ${req.path}`);
    }
  }

  next();
};

module.exports = productionSafetyMiddleware; 