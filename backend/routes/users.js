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

// 获取用户列表（增强权限控制）
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
        attributes: ['id', 'name', 'sourcePort']
      }]
    });

    // 添加计算字段和流量统计
    const { TrafficHourly } = require('../services/dbService').models;
    const usersWithStatus = await Promise.all(users.map(async (user) => {
      const userData = user.toJSON();

      // 计算流量使用情况
      const trafficLimitBytes = userData.trafficQuota ? userData.trafficQuota * 1024 * 1024 * 1024 : 0;
      const usedTrafficBytes = userData.usedTraffic || 0;

      // 获取最近7天的流量统计
      const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const recentTraffic = await TrafficHourly.findOne({
        where: {
          userId: user.id,
          recordTime: {
            [Op.gte]: last7Days
          }
        },
        attributes: [
          [require('../services/dbService').models.sequelize.fn('SUM', require('../services/dbService').models.sequelize.col('totalBytes')), 'totalBytes']
        ]
      });

      // 添加统计信息
      return {
        ...userData,
        isExpired: user.isExpired(),
        forwardRuleCount: user.forwardRules ? user.forwardRules.length : 0,
        activeRuleCount: user.forwardRules ? user.forwardRules.filter(rule => rule.isActive).length : 0,
        trafficStats: {
          usedTrafficBytes,
          trafficLimitBytes,
          usedTrafficGB: (usedTrafficBytes / (1024 * 1024 * 1024)).toFixed(2),
          trafficQuotaGB: userData.trafficQuota || 0,
          usagePercent: trafficLimitBytes > 0
            ? ((usedTrafficBytes / trafficLimitBytes) * 100).toFixed(1)
            : 0,
          remainingBytes: trafficLimitBytes > 0
            ? Math.max(trafficLimitBytes - usedTrafficBytes, 0)
            : Infinity,
          remainingGB: trafficLimitBytes > 0
            ? Math.max((trafficLimitBytes - usedTrafficBytes) / (1024 * 1024 * 1024), 0).toFixed(2)
            : 'Unlimited',
          recent7DaysBytes: parseInt(recentTraffic?.dataValues?.totalBytes) || 0,
          recent7DaysGB: ((parseInt(recentTraffic?.dataValues?.totalBytes) || 0) / (1024 * 1024 * 1024)).toFixed(2),
          status: userData.userStatus || 'active'
        }
      };
    }));

    res.json(usersWithStatus);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: '获取用户列表失败' });
  }
});

// 获取单个用户信息（仅管理员可用）
router.get('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限访问' });
    }

    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password', 'token'] },
      include: [{
        model: UserForwardRule,
        as: 'forwardRules',
        attributes: ['id', 'name', 'sourcePort'],
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'isActive', 'userStatus', 'role', 'expiryDate', 'portRangeStart', 'portRangeEnd']
        }]
      }]
    });

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 计算流量使用情况
    const userData = user.toJSON();
    const trafficLimitBytes = userData.trafficQuota ? userData.trafficQuota * 1024 * 1024 * 1024 : 0;
    const usedTrafficBytes = userData.usedTraffic || 0;

    // 获取最近7天的流量统计
    const { TrafficHourly } = require('../services/dbService').models;
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const recentTraffic = await TrafficHourly.findOne({
      where: {
        userId: user.id,
        recordTime: {
          [Op.gte]: last7Days
        }
      },
      attributes: [
        [require('../services/dbService').models.sequelize.fn('SUM', require('../services/dbService').models.sequelize.col('totalBytes')), 'totalBytes']
      ]
    });

    // 返回用户信息和统计数据
    res.json({
      success: true,
      data: {
        ...userData,
        isExpired: user.isExpired(),
        forwardRuleCount: user.forwardRules ? user.forwardRules.length : 0,
        activeRuleCount: user.forwardRules ? user.forwardRules.filter(rule => {
          // 为计算属性设置用户关联
          rule.user = rule.user || user;
          return rule.isActive;
        }).length : 0,
        trafficStats: {
          usedTrafficBytes,
          trafficLimitBytes,
          usedTrafficGB: (usedTrafficBytes / (1024 * 1024 * 1024)).toFixed(2),
          trafficQuotaGB: userData.trafficQuota || 0,
          usagePercent: trafficLimitBytes > 0
            ? ((usedTrafficBytes / trafficLimitBytes) * 100).toFixed(1)
            : 0,
          remainingBytes: trafficLimitBytes > 0
            ? Math.max(trafficLimitBytes - usedTrafficBytes, 0)
            : Infinity,
          remainingGB: trafficLimitBytes > 0
            ? Math.max((trafficLimitBytes - usedTrafficBytes) / (1024 * 1024 * 1024), 0).toFixed(2)
            : 'Unlimited',
          recent7DaysBytes: parseInt(recentTraffic?.dataValues?.totalBytes) || 0,
          recent7DaysGB: ((parseInt(recentTraffic?.dataValues?.totalBytes) || 0) / (1024 * 1024 * 1024)).toFixed(2),
          status: userData.userStatus || 'active'
        }
      }
    });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ message: '获取用户信息失败' });
  }
});

// 创建用户（仅管理员可用）
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限访问' });
    }

    const userData = req.body;
    console.log('Creating user with data:', userData);

    // 确保必要字段存在
    if (!userData.username || !userData.password) {
      return res.status(400).json({ message: '用户名和密码是必需的' });
    }

    // 普通用户必须设置端口范围和流量限额
    if (userData.role === 'user' || !userData.role) {
      if (!userData.portRangeStart || !userData.portRangeEnd) {
        return res.status(400).json({ message: '普通用户必须设置端口范围' });
      }
      if (!userData.trafficQuota) {
        return res.status(400).json({ message: '普通用户必须设置流量限额' });
      }
    }

    // 确保只有admin用户名可以是管理员
    if (userData.role === 'admin' && userData.username !== 'admin') {
      return res.status(400).json({ message: '只有用户名为admin的用户才能设置为管理员角色' });
    }

    // 检查是否已存在admin用户（创建新admin时）
    if (userData.username === 'admin') {
      const existingAdmin = await User.findOne({ where: { username: 'admin' } });
      if (existingAdmin) {
        return res.status(400).json({ message: 'admin用户已存在，不能创建重复的管理员账户' });
      }
      userData.role = 'admin';
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

    // 设置默认流量限额
    if (!userData.trafficQuota && userData.role === 'user') {
      userData.trafficQuota = 100;
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

    const updateData = req.body;
    console.log('Updating user with data:', updateData);

    // 如果是管理员账户，强制保持原用户名不变
    if (user.username === 'admin') {
      delete updateData.username;
      updateData.role = 'admin';
      updateData.isActive = true;
    }

    // 不允许修改用户名（除了admin的特殊处理）
    if (updateData.username && updateData.username !== user.username) {
      return res.status(400).json({ message: '用户名不能修改' });
    }

    // 不允许修改角色
    if (updateData.role && updateData.role !== user.role) {
      return res.status(400).json({ message: '用户角色不能修改' });
    }

    // 普通用户必须设置端口范围和流量限额
    if (user.role === 'user') {
      if (updateData.portRangeStart !== undefined || updateData.portRangeEnd !== undefined) {
        const newStart = updateData.portRangeStart || user.portRangeStart;
        const newEnd = updateData.portRangeEnd || user.portRangeEnd;

        if (!newStart || !newEnd) {
          return res.status(400).json({ message: '普通用户必须设置完整的端口范围' });
        }
      }

      if (updateData.trafficQuota !== undefined && !updateData.trafficQuota) {
        return res.status(400).json({ message: '普通用户必须设置流量限额' });
      }
    }

    // 验证端口范围
    if (updateData.portRangeStart && updateData.portRangeEnd) {
      if (updateData.portRangeStart >= updateData.portRangeEnd) {
        return res.status(400).json({ message: '起始端口必须小于结束端口' });
      }
      if (updateData.portRangeStart < 1 || updateData.portRangeEnd > 65535) {
        return res.status(400).json({ message: '端口范围必须在1-65535之间' });
      }

      // 检查端口范围冲突
      const conflicts = [];

      // 检查与其他用户端口范围的重叠
      const otherUsers = await User.findAll({
        where: {
          id: { [Op.ne]: user.id },
          role: 'user'
        },
        attributes: ['id', 'username', 'portRangeStart', 'portRangeEnd']
      });

      for (const otherUser of otherUsers) {
        if (otherUser.portRangeStart && otherUser.portRangeEnd) {
          // 检查端口范围重叠
          const hasOverlap = !(updateData.portRangeEnd < otherUser.portRangeStart || updateData.portRangeStart > otherUser.portRangeEnd);
          if (hasOverlap) {
            conflicts.push({
              type: 'user_range',
              username: otherUser.username,
              portRange: `${otherUser.portRangeStart}-${otherUser.portRangeEnd}`,
              message: `与用户 "${otherUser.username}" 的端口范围重叠`
            });
          }
        }
      }

      // 检查端口是否被现有规则占用 (排除当前用户的规则)
      const usedPorts = await UserForwardRule.findAll({
        where: {
          sourcePort: {
            [Op.between]: [updateData.portRangeStart, updateData.portRangeEnd]
          },
          userId: { [Op.ne]: user.id }
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username']
        }]
      });

      for (const rule of usedPorts) {
        conflicts.push({
          type: 'used_port',
          port: rule.sourcePort,
          username: rule.user.username,
          ruleName: rule.name,
          message: `端口 ${rule.sourcePort} 已被用户 "${rule.user.username}" 的规则 "${rule.name}" 占用`
        });
      }

      // 如果有冲突，返回错误
      if (conflicts.length > 0) {
        return res.status(400).json({
          message: `端口范围 ${updateData.portRangeStart}-${updateData.portRangeEnd} 存在冲突`,
          conflicts,
          conflictSummary: conflicts.map(c => c.message).join('; ')
        });
      }
    }

    // 处理密码修改 - Admin可以重置任何用户的密码
    if (req.user.role === 'admin' && updateData.password) {
      console.log(`🔑 Admin ${req.user.username} 正在重置用户 ${user.username} 的密码`);
      // 密码会在模型的 beforeUpdate hook 中自动加密
    } else {
      // 如果不是密码重置，移除密码字段
      delete updateData.password;
    }
    delete updateData.newPassword;

    // 检查端口范围是否变动，如果变动需要清理不在范围内的转发规则
    const oldPortRangeStart = user.portRangeStart;
    const oldPortRangeEnd = user.portRangeEnd;
    const newPortRangeStart = updateData.portRangeStart;
    const newPortRangeEnd = updateData.portRangeEnd;

    let cleanedRulesCount = 0;
    if ((newPortRangeStart && newPortRangeStart !== oldPortRangeStart) ||
        (newPortRangeEnd && newPortRangeEnd !== oldPortRangeEnd)) {

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

    // 🔧 关键修复：如果更新了流量配额或用户状态，立即触发GOST配置同步
    if (updateData.trafficQuota !== undefined || updateData.userStatus !== undefined) {
      try {
        console.log(`🔄 用户 ${user.id} 配额/状态更新，触发GOST配置同步...`);

        // 强制触发GOST配置同步
        const gostConfigService = require('../services/gostConfigService');
        await gostConfigService.triggerSync('quota_update', true, 10);

        console.log(`✅ 用户 ${user.id} 配额/状态更新后GOST配置同步成功`);
      } catch (error) {
        console.error('配额/状态更新后同步GOST配置失败:', error);
      }
    }

    // 触发 Gost 配置同步（如果端口范围变化或清理了规则）
    if (cleanedRulesCount > 0 || newPortRangeStart || newPortRangeEnd) {
      try {
        const gostConfigService = require('../services/gostConfigService');
        gostConfigService.triggerSync().catch(error => {
          console.error('更新用户后同步配置失败:', error);
        });
      } catch (error) {
        console.error('触发配置同步失败:', error);
      }
    }

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
    if (user.username === 'admin') {
      return res.status(403).json({ message: '不能删除admin管理员账户' });
    }

    // 删除用户（关联的转发规则会自动删除）
    await user.destroy();

    // 触发 Gost 配置同步
    try {
      const gostConfigService = require('../services/gostConfigService');
      gostConfigService.triggerSync().catch(error => {
        console.error('删除用户后同步配置失败:', error);
      });
    } catch (error) {
      console.error('触发配置同步失败:', error);
    }

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

    // 🔧 修复：延长过期时间时，同时恢复用户状态
    const updateData = { expiryDate: newExpiry };
    const oldStatus = user.userStatus;

    // 如果用户因为过期被暂停，恢复为active状态
    if (user.userStatus === 'suspended' || user.userStatus === 'expired') {
      updateData.userStatus = 'active';
      console.log(`🔄 延长过期时间：用户状态从 ${oldStatus} 恢复为 active`);
    }

    await user.update(updateData);

    // 🔧 新增：触发强制同步，确保转发规则立即生效
    try {
      const gostSyncCoordinator = require('../services/gostSyncCoordinator');
      await gostSyncCoordinator.requestSync('user_expiry_extended', true, 9);
      console.log(`✅ 用户 ${user.username} 过期时间延长后，已触发强制同步`);
    } catch (syncError) {
      console.error('延长过期时间后同步失败:', syncError);
    }

    const { password, token, ...userResponse } = user.toJSON();
    res.json({
      ...userResponse,
      isExpired: user.isExpired(),
      message: `成功延长 ${months} 个月，新过期时间：${newExpiry.toLocaleDateString()}${oldStatus !== user.userStatus ? `，用户状态已从 ${oldStatus} 恢复为 ${user.userStatus}` : ''}`
    });
  } catch (error) {
    console.error('Extend user expiry error:', error);
    res.status(500).json({ message: '延长用户过期时间失败' });
  }
});

// 检查端口冲突
router.post('/check-port-conflicts', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限访问' });
    }

    const { portRangeStart, portRangeEnd, excludeUserId } = req.body;

    if (!portRangeStart || !portRangeEnd) {
      return res.status(400).json({ message: '请提供端口范围' });
    }

    if (portRangeStart >= portRangeEnd) {
      return res.status(400).json({ message: '起始端口必须小于结束端口' });
    }

    const conflicts = [];

    // 检查与其他用户端口范围的重叠
    const whereCondition = excludeUserId
      ? { id: { [Op.ne]: excludeUserId }, role: 'user' }
      : { role: 'user' };

    const users = await User.findAll({
      where: whereCondition,
      attributes: ['id', 'username', 'portRangeStart', 'portRangeEnd']
    });

    for (const user of users) {
      if (user.portRangeStart && user.portRangeEnd) {
        // 检查端口范围重叠
        const hasOverlap = !(portRangeEnd < user.portRangeStart || portRangeStart > user.portRangeEnd);
        if (hasOverlap) {
          conflicts.push({
            type: 'user_range',
            username: user.username,
            portRange: `${user.portRangeStart}-${user.portRangeEnd}`,
            message: `与用户 "${user.username}" 的端口范围重叠`
          });
        }
      }
    }

    // 检查端口是否被现有规则占用
    const usedPorts = await UserForwardRule.findAll({
      where: {
        sourcePort: {
          [Op.between]: [portRangeStart, portRangeEnd]
        }
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username'],
        where: excludeUserId ? { id: { [Op.ne]: excludeUserId } } : {}
      }]
    });

    for (const rule of usedPorts) {
      conflicts.push({
        type: 'used_port',
        port: rule.sourcePort,
        username: rule.user.username,
        message: `端口 ${rule.sourcePort} 已被用户 "${rule.user.username}" 占用`
      });
    }

    res.json({
      hasConflict: conflicts.length > 0,
      conflicts
    });
  } catch (error) {
    console.error('检查端口冲突失败:', error);
    res.status(500).json({ message: '检查端口冲突失败' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';

    let whereCondition = {};
    if (!isAdmin) {
      // 普通用户只能查看自己
      whereCondition = { id: req.user.id };
    }

    const users = await User.findAll({
      where: whereCondition,
      attributes: { exclude: ['password', 'token'] },
      include: [{
        model: UserForwardRule,
        as: 'forwardRules',
        attributes: ['id', 'name', 'sourcePort']
      }]
    });

    // 添加计算字段
    const usersWithStatus = users.map(user => ({
      ...user.toJSON(),
      isExpired: user.isExpired(),
      forwardRuleCount: user.forwardRules ? user.forwardRules.length : 0,
      activeRuleCount: user.forwardRules ? user.forwardRules.filter(rule => {
        // 为计算属性设置用户关联
        rule.user = user;
        return rule.isActive;
      }).length : 0
    }));

    res.json(usersWithStatus);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: '获取用户列表失败' });
  }
});

/**
 * 重置用户流量统计 (管理员专用)
 * POST /api/users/:id/reset-traffic
 */
router.post('/:id/reset-traffic', auth, async (req, res) => {
  try {
    // 只有管理员可以重置流量
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '只有管理员可以重置用户流量' });
    }

    const userId = parseInt(req.params.id);
    const { reason } = req.body; // 重置原因（可选）

    // 验证用户是否存在
    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      return res.status(404).json({ message: '用户不存在' });
    }

    console.log(`🔄 管理员 ${req.user.username} 开始重置用户 ${targetUser.username} (ID: ${userId}) 的流量统计...`);

    // 开始事务
    const { sequelize } = require('../services/dbService');
    const transaction = await sequelize.transaction();

    try {
      // 1. 重置用户总流量并恢复用户状态
      const oldUserTraffic = targetUser.usedTraffic || 0;
      const oldUserStatus = targetUser.userStatus;

      // 🔧 关键修复：重置流量时自动恢复用户状态
      const updateData = { usedTraffic: 0 };

      // 如果用户状态是suspended或quota_exceeded（通常是因为超出配额），恢复为active
      if (targetUser.userStatus === 'suspended' || targetUser.userStatus === 'quota_exceeded') {
        updateData.userStatus = 'active';
        console.log(`🔄 用户状态从 ${oldUserStatus} 恢复为 active`);
      }

      await targetUser.update(updateData, { transaction });
      console.log(`✅ 用户总流量已重置: ${formatBytes(oldUserTraffic)} → 0B`);

      // 2. 重置用户所有规则的流量（保留规则本身）
      const userRules = await UserForwardRule.findAll({
        where: { userId: userId },
        transaction
      });

      let totalRuleTrafficReset = 0;
      for (const rule of userRules) {
        const oldRuleTraffic = rule.usedTraffic || 0;
        totalRuleTrafficReset += oldRuleTraffic;
        await rule.update({ usedTraffic: 0 }, { transaction });
        console.log(`✅ 规则 ${rule.name} (端口: ${rule.sourcePort}) 流量已重置: ${formatBytes(oldRuleTraffic)} → 0B`);
      }

      // 3. 清理历史流量数据 (traffic_hourly 表)
      const deletedTrafficRecords = await sequelize.query(
        'DELETE FROM traffic_hourly WHERE userId = ?',
        {
          replacements: [userId],
          type: sequelize.QueryTypes.DELETE,
          transaction
        }
      );

      // SQLite DELETE 查询返回的是受影响的行数，不是数组
      const deletedCount = Array.isArray(deletedTrafficRecords) ? deletedTrafficRecords[0] : deletedTrafficRecords;
      console.log(`✅ 已清理 ${deletedCount || 0} 条历史流量记录`);

      // 4. 清理用户缓存和重置流量统计 (关键步骤)
      try {
        const multiInstanceCacheService = require('../services/multiInstanceCacheService');

        // 清理多实例缓存中的用户数据
        multiInstanceCacheService.clearUserCache(userId);
        console.log(`✅ 用户 ${userId} 多实例缓存已清理`);

        // 重置缓存中的流量统计为 0
        await multiInstanceCacheService.resetUserTrafficCache(userId);
        console.log(`✅ 用户流量缓存已重置为 0`);

        // 清理观察器的累积值跟踪 (防止重复计算)
        const gostPluginService = require('../services/gostPluginService');
        gostPluginService.clearUserCumulativeStats(userId);
        console.log(`✅ 用户累积值跟踪已清理`);

        // 🔧 关键修复：清理所有端口的累积统计
        // 这是导致重复累积的根本原因
        gostPluginService.clearAllCumulativeStats();
        console.log(`✅ 所有累积统计已清理`);

        // 刷新端口用户映射
        await multiInstanceCacheService.refreshPortUserMapping();
        console.log(`✅ 端口用户映射已刷新`);

      } catch (cacheError) {
        console.warn('⚠️ 清理用户缓存失败:', cacheError.message);
        // 缓存清理失败不应该影响主要的重置操作
      }

      // 5. 记录操作日志
      const logData = {
        adminId: req.user.id,
        adminUsername: req.user.username,
        targetUserId: userId,
        targetUsername: targetUser.username,
        action: 'reset_traffic',
        oldUserTraffic: oldUserTraffic,
        totalRuleTrafficReset: totalRuleTrafficReset,
        rulesCount: userRules.length,
        deletedRecords: deletedCount || 0,
        reason: reason || '管理员重置',
        timestamp: new Date()
      };

      console.log('📝 操作日志:', logData);

      // 提交事务
      await transaction.commit();

      // 6. 触发GOST配置同步 (更新用户状态) - 强制同步
      try {
        const gostConfigService = require('../services/gostConfigService');

        // 设置强制更新环境变量
        process.env.FORCE_GOST_UPDATE = 'true';

        try {
          await gostConfigService.triggerSync('traffic_reset', true, 10);
          console.log('✅ 流量重置后GOST配置同步成功');

          // 强制触发配额重新评估，确保规则立即激活
          console.log(`🔄 用户 ${userId} 流量重置后，强制触发配额检查...`);
          try {
            const quotaCoordinatorService = require('../services/quotaCoordinatorService');
            if (quotaCoordinatorService && quotaCoordinatorService.forceRefreshUser) {
              await quotaCoordinatorService.forceRefreshUser(userId, 'traffic_reset');
              console.log(`✅ 用户 ${userId} 流量重置后配额检查完成`);
            }
          } catch (quotaError) {
            console.log(`⚠️ 配额检查服务不可用: ${quotaError.message}`);
          }
        } catch (syncError) {
          console.error('❌ 重置流量后同步GOST配置失败:', syncError);
        } finally {
          // 清除强制更新标志
          delete process.env.FORCE_GOST_UPDATE;
        }
      } catch (error) {
        console.error('触发GOST配置同步失败:', error);
      }

      res.json({
        success: true,
        message: `成功重置用户 ${targetUser.username} 的流量统计`,
        data: {
          userId: userId,
          username: targetUser.username,
          resetSummary: {
            userTrafficReset: formatBytes(oldUserTraffic),
            rulesTrafficReset: formatBytes(totalRuleTrafficReset),
            rulesCount: userRules.length,
            rulesPreserved: userRules.length, // 强调规则被保留
            historyRecordsDeleted: deletedCount || 0
          },
          operatedBy: req.user.username,
          operatedAt: new Date()
        }
      });

    } catch (error) {
      // 回滚事务
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('重置用户流量失败:', error);
    res.status(500).json({
      message: '重置用户流量失败',
      error: error.message
    });
  }
});

// 格式化字节数显示的辅助函数
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

module.exports = router;
