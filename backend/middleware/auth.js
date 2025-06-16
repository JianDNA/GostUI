const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { User } = require('../models');

// 验证 JWT token 的中间件
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: '未提供认证令牌' });
    }

    // 验证 token
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // 查找用户并验证 token 是否匹配
    const user = await User.findOne({ 
      where: { 
        id: decoded.id,
        token: token 
      } 
    });

    if (!user) {
      throw new Error();
    }

    req.token = token;
    req.user = user;
    next();
  } catch (error) {
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