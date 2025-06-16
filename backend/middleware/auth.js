const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { User } = require('../models');

// 验证 JWT token 的中间件
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    console.log(`🔐 [Auth] 收到认证请求: ${req.method} ${req.path}`);
    console.log(`🔐 [Auth] Token存在: ${!!token}`);

    if (!token) {
      console.log(`🔐 [Auth] 未提供认证令牌`);
      return res.status(401).json({ message: '未提供认证令牌' });
    }

    // 验证 token
    const decoded = jwt.verify(token, config.jwt.secret);
    console.log(`🔐 [Auth] Token解码成功, 用户ID: ${decoded.id}`);

    // 查找用户并验证 token 是否匹配
    const user = await User.findOne({
      where: {
        id: decoded.id
      }
    });

    if (!user) {
      console.log(`🔐 [Auth] 用户不存在: ${decoded.id}`);
      throw new Error('用户不存在');
    }

    console.log(`🔐 [Auth] 找到用户: ${user.username}, 数据库中的token: ${user.token ? user.token.substring(0, 20) + '...' : 'null'}`);
    console.log(`🔐 [Auth] 请求中的token: ${token.substring(0, 20)}...`);

    // 验证token是否匹配
    if (user.token !== token) {
      console.log(`🔐 [Auth] Token不匹配 - 用户: ${user.username}`);
      throw new Error('Token不匹配');
    }

    console.log(`🔐 [Auth] Token验证成功 - 用户: ${user.username}`);
    req.token = token;
    req.user = user;
    next();
  } catch (error) {
    console.log(`🔐 [Auth] 认证失败: ${error.message}`);
    res.status(401).json({ message: '请重新登录' });
  }
};

// 验证管理员权限的中间件
const adminAuth = async (req, res, next) => {
  try {
    await auth(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ message: '需要管理员权限' });
      }
      next();
    });
  } catch (error) {
    res.status(401).json({ message: '认证失败' });
  }
};

module.exports = {
  auth,
  adminAuth
}; 