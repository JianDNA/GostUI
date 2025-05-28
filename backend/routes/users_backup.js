const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { User } = require('../models');
const bcrypt = require('bcryptjs');

// 获取当前用户信息
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'token'] }
    });

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: '获取用户信息失败' });
  }
});

// 获取用户列表（仅管理员可用）
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限访问' });
    }

    const users = await User.findAll({
      attributes: { exclude: ['password', 'token'] }
    });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: '获取用户列表失败' });
  }
});

// 创建用户（仅管理员可用）
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限访问' });
    }

    // 从请求中获取用户数据
    const userData = req.body;
    console.log('Creating user with data:', userData);

    // 确保必要字段存在
    if (!userData.username || !userData.password) {
      return res.status(400).json({ message: '用户名和密码是必需的' });
    }

    const user = await User.create({
      username: userData.username,
      password: userData.password,
      email: userData.email,
      role: userData.role || 'user',
      isActive: userData.isActive !== undefined ? userData.isActive : true,
      portRange: userData.portRange,
      trafficQuota: userData.trafficQuota
    });

    // 排除敏感信息
    const { password, token, ...responseData } = user.toJSON();
    
    console.log('User created successfully:', responseData);
    res.status(201).json(responseData);
  } catch (error) {
    console.error('Create user error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      res.status(400).json({ message: '用户名或邮箱已存在' });
    } else if (error.name === 'SequelizeValidationError') {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: '创建用户失败' });
    }
  }
});

// 更新用户（仅管理员可用）
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限访问' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 从请求中获取更新数据
    const updateData = req.body;
    console.log('Updating user with data:', updateData);

    // 如果是管理员账户，强制保持原用户名不变
    if (user.role === 'admin') {
      delete updateData.username; // 删除用户名字段，确保不会被更新
    }

    // 不允许修改管理员的角色
    if (user.role === 'admin' && updateData.role && updateData.role !== 'admin') {
      return res.status(403).json({ message: '不能修改管理员的角色' });
    }

    // 如果提供了新密码，则更新密码
    if (updateData.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(updateData.password, salt);
    } else {
      // 如果没有提供新密码，删除password字段以避免更新
      delete updateData.password;
    }

    await user.update(updateData);
    const { password, token, ...responseData } = user.toJSON();
    
    console.log('User updated successfully:', responseData);
    res.json(responseData);
  } catch (error) {
    console.error('Update user error:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      res.status(400).json({ message: '用户名或邮箱已存在' });
    } else if (error.name === 'SequelizeValidationError') {
      res.status(400).json({ message: error.message });
    } else {
      res.status(500).json({ message: '更新用户失败' });
    }
  }
});

// 删除用户（仅管理员可用）
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限访问' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 不允许删除管理员
    if (user.role === 'admin') {
      return res.status(403).json({ message: '不能删除管理员账户' });
    }

    await user.destroy();
    res.status(204).send();
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: '删除用户失败' });
  }
});

module.exports = router; 