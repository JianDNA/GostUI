const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { auth } = require('../middleware/auth');
const config = require('../config/config');

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log('Login attempt:', { username });

    // 查找用户
    const user = await User.findOne({
      where: { username },
      attributes: ['id', 'username', 'role', 'password', 'isActive', 'userStatus', 'additionalPorts', 'portRangeStart', 'portRangeEnd']
    });
    if (!user) {
      console.log('User not found:', username);
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    console.log('User found:', { id: user.id, username: user.username, role: user.role });

    // 验证密码
    console.log('Verifying password...');
    const isValid = await user.comparePassword(password);
    console.log('Password verification result:', isValid);

    if (!isValid) {
      console.log('Password verification failed');
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    // 生成 token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
    console.log('🔐 [Login] Token generated successfully');
    console.log('🔐 [Login] Token preview:', token.substring(0, 20) + '...');

    // 更新用户的 token
    await user.update({ token });
    console.log('🔐 [Login] Token saved to database successfully');

    // 验证token是否正确保存
    const updatedUser = await User.findByPk(user.id);
    console.log('🔐 [Login] 验证保存的token:', updatedUser.token ? updatedUser.token.substring(0, 20) + '...' : 'null');

    // 返回用户信息和 token
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: '登录失败' });
  }
});

// 登出
router.post('/logout', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (user) {
      await user.update({ token: null });
      console.log('Token cleared from database successfully');
    }
    res.json({ message: '登出成功' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router; 