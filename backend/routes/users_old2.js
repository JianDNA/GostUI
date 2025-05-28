const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { User, UserForwardRule } = require('../models');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

// 获取当前用户信息
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'token'] }
    });

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    res.json({
      ...user.toJSON(),
      isExpired: user.isExpired(),
      availablePorts: user.getAvailablePorts()
    });
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
      attributes: { exclude: ['password', 'token'] },
      include: [{
        model: UserForwardRule,
        as: 'forwardRules',
        attributes: ['id', 'name', 'sourcePort', 'isActive']
      }]
    });

    // 添加计算字段
    const usersWithStatus = users.map(user => ({
      ...user.toJSON(),
      isExpired: user.isExpired(),
      forwardRuleCount: user.forwardRules ? user.forwardRules.length : 0,
      activeRuleCount: user.forwardRules ? user.forwardRules.filter(rule => rule.isActive).length : 0
    }));

    res.json(usersWithStatus);
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

    // 验证端口范围
    if (userData.portRangeStart && userData.portRangeEnd) {
      if (userData.portRangeStart >= userData.portRangeEnd) {
        return res.status(400).json({ message: '起始端口必须小于结束端口' });
      }
      if (userData.portRangeStart < 1 || userData.portRangeEnd > 65535) {
        return res.status(400).json({ message: '端口范围必须在1-65535之间' });
      }
    }

    // 设置默认过期时间（一个月后）
    let expiryDate = userData.expiryDate;
    if (!expiryDate && userData.role !== 'admin') {
      const oneMonthLater = new Date();
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
      expiryDate = oneMonthLater;
    }

    const user = await User.create({
      username: userData.username,
      password: userData.password,
      email: userData.email,
      role: userData.role || 'user',
      isActive: userData.isActive !== undefined ? userData.isActive : true,
      portRange: userData.portRange,
      portRangeStart: userData.portRangeStart,
      portRangeEnd: userData.portRangeEnd,
      expiryDate: expiryDate,
      trafficQuota: userData.trafficQuota
    });

    // 返回用户信息（排除敏感字段）
    const { password, token, ...userResponse } = user.toJSON();
    res.status(201).json({
      ...userResponse,
      isExpired: user.isExpired(),
      availablePorts: user.getAvailablePorts()
    });
  } catch (error) {
    console.error('Create user error:', error);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        message: '数据验证失败', 
        errors: error.errors.map(e => e.message) 
      });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: '用户名或邮箱已存在' });
    }
    res.status(500).json({ message: '创建用户失败' });
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

    // 验证端口范围
    if (updateData.portRangeStart && updateData.portRangeEnd) {
      if (updateData.portRangeStart >= updateData.portRangeEnd) {
        return res.status(400).json({ message: '起始端口必须小于结束端口' });
      }
      if (updateData.portRangeStart < 1 || updateData.portRangeEnd > 65535) {
        return res.status(400).json({ message: '端口范围必须在1-65535之间' });
      }
    }

    // 检查端口范围是否变动，如果变动需要清理不在范围内的转发规则
    const oldPortRangeStart = user.portRangeStart;
    const oldPortRangeEnd = user.portRangeEnd;
    const newPortRangeStart = updateData.portRangeStart;
    const newPortRangeEnd = updateData.portRangeEnd;

    let cleanedRulesCount = 0;
    if ((newPortRangeStart && newPortRangeStart !== oldPortRangeStart) || 
        (newPortRangeEnd && newPortRangeEnd !== oldPortRangeEnd)) {
      
      // 删除不在新端口范围内的转发规则
      const rulesToDelete = await UserForwardRule.findAll({
        where: {
          userId: user.id,
          [Op.or]: [
            { sourcePort: { [Op.lt]: newPortRangeStart || oldPortRangeStart } },
            { sourcePort: { [Op.gt]: newPortRangeEnd || oldPortRangeEnd } }
          ]
        }
      });

      if (rulesToDelete.length > 0) {
        await UserForwardRule.destroy({
          where: {
            id: { [Op.in]: rulesToDelete.map(rule => rule.id) }
          }
        });
        cleanedRulesCount = rulesToDelete.length;
        console.log(`清理了用户 ${user.id} 的 ${cleanedRulesCount} 个超出端口范围的转发规则`);
      }
    }

    // 更新用户信息
    await user.update(updateData);

    // 返回更新后的用户信息
    const { password, token, ...userResponse } = user.toJSON();
    res.json({
      ...userResponse,
      isExpired: user.isExpired(),
      availablePorts: user.getAvailablePorts(),
      cleanedRulesCount
    });
  } catch (error) {
    console.error('Update user error:', error);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ 
        message: '数据验证失败', 
        errors: error.errors.map(e => e.message) 
      });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ message: '用户名或邮箱已存在' });
    }
    res.status(500).json({ message: '更新用户失败' });
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

    // 删除用户（关联的转发规则会自动删除）
    await user.destroy();
    res.status(204).send();
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: '删除用户失败' });
  }
});

// 延长用户过期时间（仅管理员可用）
router.post('/:id/extend-expiry', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限访问' });
    }

    const { months = 1 } = req.body;
    const user = await User.findByPk(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 计算新的过期时间
    const currentExpiry = user.expiryDate ? new Date(user.expiryDate) : new Date();
    const newExpiry = new Date(currentExpiry);
    newExpiry.setMonth(newExpiry.getMonth() + months);

    await user.update({ expiryDate: newExpiry });

    const { password, token, ...userResponse } = user.toJSON();
    res.json({
      ...userResponse,
      isExpired: user.isExpired(),
      message: `成功延长 ${months} 个月，新过期时间：${newExpiry.toLocaleDateString()}`
    });
  } catch (error) {
    console.error('Extend user expiry error:', error);
    res.status(500).json({ message: '延长用户过期时间失败' });
  }
});

// 获取用户的转发规则统计（仅管理员可用）
router.get('/:id/forward-rules-stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限访问' });
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const rules = await UserForwardRule.findAll({
      where: { userId: user.id }
    });

    const stats = {
      totalRules: rules.length,
      activeRules: rules.filter(rule => rule.isActive).length,
      inactiveRules: rules.filter(rule => !rule.isActive).length,
      usedPorts: rules.map(rule => rule.sourcePort).sort((a, b) => a - b),
      availablePortRange: user.portRangeStart && user.portRangeEnd 
        ? `${user.portRangeStart}-${user.portRangeEnd}` 
        : null,
      availablePortCount: user.portRangeStart && user.portRangeEnd 
        ? user.portRangeEnd - user.portRangeStart + 1 
        : 0
    };

    res.json(stats);
  } catch (error) {
    console.error('Get user forward rules stats error:', error);
    res.status(500).json({ message: '获取用户转发规则统计失败' });
  }
});

module.exports = router;
