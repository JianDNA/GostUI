const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { User, UserForwardRule } = require('../models');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');

// 获取当前用户信息
router.get('/me', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 从数据库获取完整的用户信息
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 计算账户状态
    const isExpired = user.isExpired();
    const expiresAt = user.expiryDate;
    let daysUntilExpiry = null;



    if (expiresAt) {
      const now = new Date();
      const expiry = new Date(expiresAt);
      const diffTime = expiry - now;
      daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // 获取用户的转发规则
    const forwardRules = await UserForwardRule.findAll({
      where: { userId },
      attributes: ['id', 'name', 'sourcePort', 'targetAddress', 'protocol', 'description', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });

    // 计算规则统计
    const activeRules = forwardRules.filter(rule => {
      // 手动设置用户关联以计算isActive
      rule.user = user;
      return rule.isActive;
    });

    // 计算流量统计
    const trafficLimitBytes = user.getTrafficLimitBytes();
    const usedTrafficBytes = user.usedTraffic || 0;
    const usagePercent = trafficLimitBytes > 0 ? ((usedTrafficBytes / trafficLimitBytes) * 100).toFixed(1) : 0;
    const isQuotaExceeded = trafficLimitBytes > 0 && usedTrafficBytes >= trafficLimitBytes;

    // 构建响应数据
    const userInfo = {
      id: user.id,
      username: user.username,
      email: user.email || `${user.username}@example.com`,
      role: user.role,
      isActive: user.isActive,
      userStatus: user.userStatus || 'active',
      accountStatus: {
        isExpired,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        daysUntilExpiry,
        userStatus: user.userStatus || 'active'
      },
      trafficStats: {
        usedTraffic: usedTrafficBytes,
        trafficQuota: trafficLimitBytes,
        usedTrafficFormatted: User.formatBytes(usedTrafficBytes),
        trafficQuotaFormatted: trafficLimitBytes > 0 ? User.formatBytes(trafficLimitBytes) : 'Unlimited',
        usagePercent: parseFloat(usagePercent),
        isQuotaExceeded
      },
      portInfo: {
        portRangeStart: user.portRangeStart,
        portRangeEnd: user.portRangeEnd,
        additionalPorts: user.getAdditionalPorts(),
        portSummary: user.getPortSummary(),
        availablePorts: user.getAvailablePorts().length,
        // 保持向后兼容
        startPort: user.portRangeStart || (user.role === 'admin' ? 1000 : 2000),
        endPort: user.portRangeEnd || (user.role === 'admin' ? 65535 : 16500)
      },
      rulesStats: {
        total: forwardRules.length,
        active: activeRules.length,
        inactive: forwardRules.length - activeRules.length
      },
      forwardRules: forwardRules.map(rule => {
        // 解析目标地址为主机和端口
        let targetHost = '';
        let targetPort = '';
        
        if (rule.targetAddress) {
          // 使用UserForwardRule模型的方法解析目标地址
          const targetInfo = rule.getTargetIPAndPort();
          if (targetInfo) {
            targetHost = targetInfo.ip;
            targetPort = targetInfo.port;
          } else {
            // 备用解析方法
            const lastColonIndex = rule.targetAddress.lastIndexOf(':');
            if (lastColonIndex !== -1) {
              targetHost = rule.targetAddress.substring(0, lastColonIndex);
              targetPort = rule.targetAddress.substring(lastColonIndex + 1);
            } else {
              targetHost = rule.targetAddress;
            }
          }
        }
        
        return {
          id: rule.id,
          name: rule.name,
          sourcePort: rule.sourcePort,
          targetAddress: rule.targetAddress,
          targetHost,
          targetPort,
          protocol: rule.protocol,
          description: rule.description,
          createdAt: rule.createdAt,
          isActive: rule.isActive
        };
      })
    };

    res.json({
      success: true,
      data: userInfo
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: '获取用户信息失败' });
  }
});

// 格式化字节数的辅助函数
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 获取用户列表（增强权限控制）
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限访问' });
    }

    const users = await User.findAll({
      attributes: { exclude: ['password', 'token'] },
      // 暂时移除UserForwardRule关联查询以避免字段映射问题
      // include: [{
      //   model: UserForwardRule,
      //   as: 'forwardRules',
      //   attributes: ['id', 'name', 'sourcePort']
      // }]
    });

    // 添加计算字段和流量统计（简化版）
    const usersWithStatus = users.map(user => {
      const userData = user.toJSON();

      // 🔧 修复: 正确处理 additionalPorts 字段
      userData.additionalPorts = user.getAdditionalPorts();

      // 计算流量使用情况
      const trafficLimitBytes = userData.trafficQuota ? userData.trafficQuota * 1024 * 1024 * 1024 : 0;
      const usedTrafficBytes = userData.usedTraffic || 0;

      // 添加统计信息
      return {
        ...userData,
        isExpired: user.isExpired(),
        forwardRuleCount: 0, // 暂时设为0以避免字段映射问题
        activeRuleCount: 0, // 暂时设为0以避免字段映射问题
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
          recent7DaysBytes: 0, // 简化：不再查询时序数据
          recent7DaysGB: '0.00',
          status: userData.userStatus || 'active'
        }
      };
    });

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
      // 暂时移除UserForwardRule关联查询以避免字段映射问题
      // include: [{
      //   model: UserForwardRule,
      //   as: 'forwardRules',
      //   attributes: ['id', 'name', 'sourcePort'],
      //   include: [{
      //     model: User,
      //     as: 'user',
      //     attributes: ['id', 'isActive', 'userStatus', 'role', 'portRangeStart', 'portRangeEnd']
      //   }]
      // }]
    });

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 计算流量使用情况
    const userData = user.toJSON();
    const trafficLimitBytes = userData.trafficQuota ? userData.trafficQuota * 1024 * 1024 * 1024 : 0;
    const usedTrafficBytes = userData.usedTraffic || 0;

    // 返回用户信息和统计数据（简化版）
    res.json({
      success: true,
      data: {
        ...userData,
        isExpired: user.isExpired(),
        forwardRuleCount: 0, // 暂时设为0以避免字段映射问题
        activeRuleCount: 0, // 暂时设为0以避免字段映射问题
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
          recent7DaysBytes: 0, // 简化：不再查询时序数据
          recent7DaysGB: '0.00',
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

    // 强制设置角色：只有用户名为admin的用户才能是管理员
    if (userData.username === 'admin') {
      // 检查是否已存在admin用户
      const existingAdmin = await User.findOne({ where: { username: 'admin' } });
      if (existingAdmin) {
        return res.status(400).json({ message: 'admin用户已存在，不能创建重复的管理员账户' });
      }
      userData.role = 'admin'; // 强制设置为管理员角色
      userData.isActive = true; // 确保管理员账户处于激活状态
    } else {
      userData.role = 'user'; // 强制设置为普通用户角色
      
      // 普通用户必须设置端口范围和流量限额
      if (!userData.portRangeStart || !userData.portRangeEnd) {
        return res.status(400).json({ message: '普通用户必须设置端口范围' });
      }
      if (!userData.trafficQuota) {
        return res.status(400).json({ message: '普通用户必须设置流量限额' });
      }
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
      additionalPorts: userData.additionalPorts ? JSON.stringify(userData.additionalPorts) : null,
      expiryDate: expiryDate,
      trafficQuota: userData.trafficQuota
    });

    // 🚀 新增: 用户创建后清理相关缓存
    try {
      const cacheCoordinator = require('../services/cacheCoordinator');
      await cacheCoordinator.clearUserRelatedCache(user.id, 'user_create');
    } catch (cacheError) {
      console.warn('⚠️ 用户创建后清理缓存失败:', cacheError.message);
    }

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
  console.log('🚨🚨🚨 [BREAKPOINT] PUT /api/users/:id 路由被调用！');
  console.log('🚨🚨🚨 [BREAKPOINT] 请求参数:', req.params);
  console.log('🚨🚨🚨 [BREAKPOINT] 请求体:', req.body);
  console.log('🚨🚨🚨 [BREAKPOINT] 用户信息:', req.user);

  try {
    console.log('🔍 [DEBUG] ===== 开始用户更新流程 =====');
    console.log('🔍 [DEBUG] 请求用户:', req.user.username, '角色:', req.user.role);
    console.log('🔍 [DEBUG] 目标用户ID:', req.params.id);

    if (req.user.role !== 'admin') {
      console.log('🔍 [DEBUG] 权限检查失败：非管理员用户');
      return res.status(403).json({ message: '没有权限访问' });
    }

    console.log('🔍 [DEBUG] 开始查找用户...');
    const user = await User.findByPk(req.params.id);
    if (!user) {
      console.log('🔍 [DEBUG] 用户不存在，ID:', req.params.id);
      return res.status(404).json({ message: '用户不存在' });
    }

    console.log('🔍 [DEBUG] 找到用户:', {
      id: user.id,
      username: user.username,
      userStatus: user.userStatus,
      trafficQuota: user.trafficQuota,
      usedTraffic: user.usedTraffic
    });

    const updateData = req.body;
    console.log('🔍 [DEBUG] 更新数据:', JSON.stringify(updateData, null, 2));
    console.log('Updating user with data:', updateData);

    // 如果是管理员账户，强制保持原用户名不变
    if (user.username === 'admin') {
      delete updateData.username;
      updateData.role = 'admin';  // 确保admin用户始终保持admin角色
      updateData.isActive = true; // 确保admin用户始终处于激活状态
      
      // 如果要修改admin密码，添加风险提示
      if (updateData.password) {
        console.log('⚠️ 警告：管理员密码即将被修改');
        
        // 检查是否提供了确认标志
        if (!updateData.confirmAdminPasswordChange) {
          return res.status(400).json({ 
            message: '修改管理员密码需要二次确认',
            needsConfirmation: true,
            warning: '警告：修改管理员密码后，如果忘记密码将无法通过界面找回。找回管理员密码需要通过服务器命令行操作。请确认您已经记住了新密码。'
          });
        }
        
        // 移除确认标志，不需要存储到数据库
        delete updateData.confirmAdminPasswordChange;
      }
    }

    // 不允许修改用户名（除了admin的特殊处理）
    if (updateData.username && updateData.username !== user.username) {
      return res.status(400).json({ message: '用户名不能修改' });
    }

    // 强制设置：所有用户的角色不能修改，admin用户名的用户必须是admin角色，其他用户必须是user角色
    if (user.username === 'admin') {
      updateData.role = 'admin'; // 确保admin用户始终保持admin角色
    } else {
      updateData.role = 'user'; // 确保其他用户始终保持user角色
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
    }

    // 验证额外端口
    if (updateData.additionalPorts !== undefined) {
      if (updateData.additionalPorts && !Array.isArray(updateData.additionalPorts)) {
        return res.status(400).json({ message: '额外端口必须是数组格式' });
      }

      if (updateData.additionalPorts && updateData.additionalPorts.length > 0) {
        // 验证每个端口
        for (const port of updateData.additionalPorts) {
          if (!Number.isInteger(port) || port < 1 || port > 65535) {
            return res.status(400).json({ message: `无效的端口号: ${port}` });
          }
        }

        // 去重
        updateData.additionalPorts = [...new Set(updateData.additionalPorts)];

        // 转换为JSON字符串存储
        updateData.additionalPorts = JSON.stringify(updateData.additionalPorts);
      } else {
        // 清空额外端口
        updateData.additionalPorts = null;
      }
    }

    // 检查端口范围冲突（仅当设置了端口范围时）
    if (updateData.portRangeStart && updateData.portRangeEnd) {
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

    // 检查端口配置是否变动，如果变动需要清理不在允许范围内的转发规则
    const oldPortRangeStart = user.portRangeStart;
    const oldPortRangeEnd = user.portRangeEnd;
    const oldAdditionalPorts = user.getAdditionalPorts();
    const newPortRangeStart = updateData.portRangeStart;
    const newPortRangeEnd = updateData.portRangeEnd;

    // 解析新的额外端口
    let newAdditionalPorts = [];
    if (updateData.additionalPorts !== undefined) {
      if (typeof updateData.additionalPorts === 'string') {
        try {
          newAdditionalPorts = JSON.parse(updateData.additionalPorts);
        } catch (error) {
          newAdditionalPorts = [];
        }
      } else if (Array.isArray(updateData.additionalPorts)) {
        newAdditionalPorts = updateData.additionalPorts;
      }
    } else {
      newAdditionalPorts = oldAdditionalPorts;
    }

    let cleanedRulesCount = 0;
    const portConfigChanged = (newPortRangeStart && newPortRangeStart !== oldPortRangeStart) ||
                             (newPortRangeEnd && newPortRangeEnd !== oldPortRangeEnd) ||
                             JSON.stringify(newAdditionalPorts.sort()) !== JSON.stringify(oldAdditionalPorts.sort());

    if (portConfigChanged) {
      // 获取用户所有规则
      const userRules = await UserForwardRule.findAll({
        where: { userId: user.id }
      });

      const rulesToDelete = [];
      for (const rule of userRules) {
        const port = rule.sourcePort;
        let isPortAllowed = false;

        // 检查端口是否在新的范围内
        if (newPortRangeStart && newPortRangeEnd) {
          if (port >= newPortRangeStart && port <= newPortRangeEnd) {
            isPortAllowed = true;
          }
        } else if (oldPortRangeStart && oldPortRangeEnd) {
          if (port >= oldPortRangeStart && port <= oldPortRangeEnd) {
            isPortAllowed = true;
          }
        }

        // 检查端口是否在新的额外端口列表中
        if (!isPortAllowed && newAdditionalPorts.includes(port)) {
          isPortAllowed = true;
        }

        if (!isPortAllowed) {
          rulesToDelete.push(rule);
        }
      }

      if (rulesToDelete.length > 0) {
        await UserForwardRule.destroy({
          where: {
            id: { [Op.in]: rulesToDelete.map(rule => rule.id) }
          }
        });
        cleanedRulesCount = rulesToDelete.length;
        console.log(`清理了用户 ${user.id} 的 ${cleanedRulesCount} 个超出端口配置的转发规则`);
      }
    }

    // 更新用户信息
    console.log('🔍 [DEBUG] 准备更新用户信息...');
    console.log('🔍 [DEBUG] 更新前用户状态:', {
      userStatus: user.userStatus,
      trafficQuota: user.trafficQuota,
      usedTraffic: user.usedTraffic
    });

    await user.update(updateData);

    console.log('🔍 [DEBUG] 用户信息更新完成');
    console.log('🔍 [DEBUG] 更新后用户状态:', {
      userStatus: user.userStatus,
      trafficQuota: user.trafficQuota,
      usedTraffic: user.usedTraffic
    });

    // 🔧 关键修复：如果更新了流量配额，检查并调整用户状态
    console.log(`🔍 [DEBUG] 检查配额更新条件: updateData.trafficQuota = ${updateData.trafficQuota}`);
    console.log(`🔍 [DEBUG] updateData.trafficQuota !== undefined = ${updateData.trafficQuota !== undefined}`);
    if (updateData.trafficQuota !== undefined) {
      console.log(`🔍 [DEBUG] 进入配额更新逻辑`);
      try {
        const oldQuota = user.trafficQuota;
        console.log(`🔄 用户 ${user.id} 流量配额更新: ${oldQuota}GB -> ${updateData.trafficQuota}GB`);

        // 重新获取更新后的用户信息
        await user.reload();
        console.log(`🔍 [DEBUG] 用户信息已重新加载，当前状态: ${user.userStatus}`);

        const currentUsedTraffic = user.usedTraffic || 0;
        const newQuotaBytes = updateData.trafficQuota ? updateData.trafficQuota * 1024 * 1024 * 1024 : 0;

        console.log(`📊 用户当前使用流量: ${formatBytes(currentUsedTraffic)}, 新配额: ${formatBytes(newQuotaBytes)}`);

        let statusChanged = false;

        if (newQuotaBytes > 0) {
          console.log(`🔍 [DEBUG] 检查配额范围: ${currentUsedTraffic} <= ${newQuotaBytes} = ${currentUsedTraffic <= newQuotaBytes}`);
          // 检查用户使用量是否在新配额范围内
          if (currentUsedTraffic <= newQuotaBytes) {
            // 使用量在配额范围内，确保用户状态为active
            console.log(`🔍 [DEBUG] 用户状态检查: ${user.userStatus} === 'suspended' = ${user.userStatus === 'suspended'}`);
            if (user.userStatus === 'suspended') {
              console.log(`✅ 用户使用量 ${formatBytes(currentUsedTraffic)} 在新配额 ${formatBytes(newQuotaBytes)} 范围内，恢复用户状态`);
              await user.update({ userStatus: 'active' });
              console.log(`🔄 用户状态已从 suspended 恢复为 active`);
              statusChanged = true;
            } else {
              console.log(`🔍 [DEBUG] 用户状态已经是 ${user.userStatus}，无需更改`);
            }
          } else {
            // 使用量超过新配额，确保用户状态为suspended
            console.log(`🔍 [DEBUG] 用户状态检查: ${user.userStatus} === 'active' = ${user.userStatus === 'active'}`);
            if (user.userStatus === 'active') {
              console.log(`⚠️ 用户使用量 ${formatBytes(currentUsedTraffic)} 超过新配额 ${formatBytes(newQuotaBytes)}，暂停用户`);
              await user.update({ userStatus: 'suspended' });
              console.log(`🔄 用户状态已从 active 更改为 suspended`);
              statusChanged = true;
            } else {
              console.log(`🔍 [DEBUG] 用户状态已经是 ${user.userStatus}，无需更改`);
            }
          }
        } else {
          // 无限配额，确保用户状态为active
          console.log(`🔍 [DEBUG] 无限配额，用户状态检查: ${user.userStatus} === 'suspended' = ${user.userStatus === 'suspended'}`);
          if (user.userStatus === 'suspended') {
            console.log(`✅ 用户配额设置为无限制，恢复用户状态`);
            await user.update({ userStatus: 'active' });
            console.log(`🔄 用户状态已从 suspended 恢复为 active`);
            statusChanged = true;
          }
        }

        console.log(`🔍 [DEBUG] 状态是否发生变化: ${statusChanged}`);

        // 🚀 优化: 使用缓存协调器统一清理缓存
        if (statusChanged) {
          try {
            const cacheCoordinator = require('../services/cacheCoordinator');
            await cacheCoordinator.clearUserRelatedCache(user.id, 'quota_update');
            console.log(`✅ 用户 ${user.id} 所有相关缓存已清理`);

            // 🔄 新增: 触发GOST配置同步
            const gostSyncTrigger = require('../services/gostSyncTrigger');
            await gostSyncTrigger.onUserUpdate(user.id, 'quota_change', true);
            console.log(`✅ 用户 ${user.id} 配额变更后GOST配置同步已触发`);
          } catch (cacheError) {
            console.warn('⚠️ 清理用户缓存失败:', cacheError.message);
          }
        }

        // 强制触发GOST配置同步
        const gostConfigService = require('../services/gostConfigService');
        await gostConfigService.triggerSync('quota_update', true, 10);

        console.log(`✅ 用户 ${user.id} 配额更新后GOST配置同步成功`);
      } catch (error) {
        console.error('配额更新后处理失败:', error);
      }
    } else if (updateData.userStatus !== undefined) {
      // 如果只是更新了用户状态（非配额更新），也触发同步
      console.log(`🔍 [DEBUG] 进入状态更新分支: updateData.userStatus = ${updateData.userStatus}`);
      try {
        console.log(`🔄 用户 ${user.id} 状态更新，触发GOST配置同步...`);

        // 🚀 新增: 状态更新时也清理缓存
        const cacheCoordinator = require('../services/cacheCoordinator');
        await cacheCoordinator.clearUserRelatedCache(user.id, 'status_update');
        console.log(`✅ 用户 ${user.id} 状态更新相关缓存已清理`);

        // 🔄 新增: 使用同步触发器
        const gostSyncTrigger = require('../services/gostSyncTrigger');
        await gostSyncTrigger.onUserUpdate(user.id, 'status_change', true);

        console.log(`✅ 用户 ${user.id} 状态更新后GOST配置同步成功`);
      } catch (error) {
        console.error('状态更新后同步GOST配置失败:', error);
      }
    } else {
      console.log(`🔍 [DEBUG] 既没有配额更新也没有状态更新`);
      console.log(`🔍 [DEBUG] updateData.trafficQuota = ${updateData.trafficQuota}`);
      console.log(`🔍 [DEBUG] updateData.userStatus = ${updateData.userStatus}`);

      // 🔍 [DEBUG] 检查是否有其他地方在处理这个逻辑
      if (updateData.trafficQuota !== undefined || updateData.userStatus !== undefined) {
        console.log(`🚨 [DEBUG] 警告：有配额或状态更新但没有进入对应分支！`);
        console.log(`🚨 [DEBUG] 这可能是一个逻辑错误！`);
      }
    }

    // 🚀 优化: 端口范围变化或清理规则时的缓存处理
    if (cleanedRulesCount > 0 || newPortRangeStart || newPortRangeEnd) {
      try {
        // 清理用户相关缓存
        const cacheCoordinator = require('../services/cacheCoordinator');
        await cacheCoordinator.clearUserRelatedCache(user.id, 'port_range_update');
        console.log(`✅ 用户 ${user.id} 端口范围更新相关缓存已清理`);

        // 🔄 新增: 使用同步触发器
        const gostSyncTrigger = require('../services/gostSyncTrigger');
        gostSyncTrigger.onPortUpdate(user.id, 'port_range_change', false).catch(error => {
          console.error('更新用户后同步配置失败:', error);
        });
      } catch (error) {
        console.error('端口范围更新后处理失败:', error);
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

    // 🚀 优化: 删除前先清理缓存
    try {
      const cacheCoordinator = require('../services/cacheCoordinator');
      await cacheCoordinator.clearUserRelatedCache(user.id, 'user_delete');
    } catch (cacheError) {
      console.warn('⚠️ 删除用户前清理缓存失败:', cacheError.message);
    }
    
    // 记录详细日志到文件
    const fs = require('fs');
    const path = require('path');
    const logFile = path.join(__dirname, '../logs/user_delete.log');
    
    try {
      fs.appendFileSync(logFile, `\n[${new Date().toISOString()}] 开始删除用户 ${user.username} (ID: ${user.id})\n`);
    } catch (logError) {
      console.error('无法写入日志文件:', logError);
    }
    
    // 先查找并删除用户的所有转发规则
    try {
      console.log(`🗑️ 删除用户 ${user.username} (ID: ${user.id}) 的所有转发规则`);
      
      // 使用事务确保数据一致性
      const sequelize = require('../models').sequelize;
      await sequelize.transaction(async (transaction) => {
        // 查找用户的所有规则
        const rules = await UserForwardRule.findAll({
          where: { userId: user.id },
          transaction
        });
        
        fs.appendFileSync(logFile, `找到 ${rules.length} 个转发规则需要删除\n`);
        console.log(`找到 ${rules.length} 个转发规则需要删除`);
        
        // 逐个删除规则
        for (const rule of rules) {
          const ruleInfo = `规则: ${rule.name} (ID: ${rule.id}, 端口: ${rule.sourcePort})`;
          fs.appendFileSync(logFile, `删除${ruleInfo}\n`);
          console.log(`删除${ruleInfo}`);
          
          try {
            await rule.destroy({ transaction });
            fs.appendFileSync(logFile, `成功删除${ruleInfo}\n`);
            
            // 清理规则相关缓存
            await cacheCoordinator.clearPortRelatedCache(rule.sourcePort, 'rule_delete_with_user');
          } catch (singleRuleError) {
            fs.appendFileSync(logFile, `删除${ruleInfo}失败: ${singleRuleError.message}\n`);
            throw singleRuleError; // 重新抛出错误，触发事务回滚
          }
        }
        
        // 在事务中删除用户
        await user.destroy({ transaction });
        fs.appendFileSync(logFile, `成功删除用户 ${user.username} (ID: ${user.id})\n`);
      });
      
      console.log(`✅ 成功删除用户 ${user.username} 及其所有转发规则`);
    } catch (deleteError) {
      const errorMsg = `❌ 删除用户 ${user.username} 失败: ${deleteError.message}`;
      console.error(errorMsg);
      fs.appendFileSync(logFile, `${errorMsg}\n${deleteError.stack}\n`);
      return res.status(500).json({ message: '删除用户失败，请重试', error: deleteError.message });
    }

    // 触发 Gost 配置同步 - 使用强制同步确保所有规则立即生效
    try {
      const gostSyncCoordinator = require('../services/gostSyncCoordinator');
      console.log(`🔄 删除用户 ${user.username}，触发强制同步`);
      
      const fs = require('fs');
      const path = require('path');
      const logFile = path.join(__dirname, '../logs/user_delete.log');
      fs.appendFileSync(logFile, `开始同步GOST配置...\n`);
      
      const syncResult = await gostSyncCoordinator.requestSync('user_delete', true, 10);
      
      if (syncResult.success) {
        console.log(`✅ 删除用户后GOST同步成功`);
        fs.appendFileSync(logFile, `✅ GOST同步成功\n`);
      } else {
        console.error(`❌ 删除用户后GOST同步失败:`, syncResult.error);
        fs.appendFileSync(logFile, `❌ GOST同步失败: ${syncResult.error}\n`);
      }
    } catch (error) {
      console.error('触发配置同步失败:', error);
      
      // 记录错误但不中断响应
      try {
        const fs = require('fs');
        const path = require('path');
        const logFile = path.join(__dirname, '../logs/user_delete.log');
        fs.appendFileSync(logFile, `触发配置同步失败: ${error.message}\n${error.stack}\n`);
      } catch (logError) {
        console.error('写入日志失败:', logError);
      }
    }

    // 返回成功响应
    res.status(204).send();
  } catch (error) {
    console.error('Delete user error:', error);
    
    // 记录详细错误信息到日志文件
    try {
      const fs = require('fs');
      const path = require('path');
      const logFile = path.join(__dirname, '../logs/user_delete.log');
      fs.appendFileSync(logFile, `\n[${new Date().toISOString()}] 删除用户时发生未处理的错误:\n${error.message}\n${error.stack}\n`);
    } catch (logError) {
      console.error('写入错误日志失败:', logError);
    }
    
    res.status(500).json({ 
      message: '删除用户失败',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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

    // 🚀 优化: 延长过期时间时清理缓存并同步
    try {
      // 清理用户相关缓存
      const cacheCoordinator = require('../services/cacheCoordinator');
      await cacheCoordinator.clearUserRelatedCache(user.id, 'expiry_extended');
      console.log(`✅ 用户 ${user.id} 过期时间延长相关缓存已清理`);

      // 触发强制同步，确保转发规则立即生效
      const gostSyncCoordinator = require('../services/gostSyncCoordinator');
      await gostSyncCoordinator.requestSync('user_expiry_extended', true, 9);
      console.log(`✅ 用户 ${user.username} 过期时间延长后，已触发强制同步`);
    } catch (syncError) {
      console.error('延长过期时间后处理失败:', syncError);
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
    const usersWithStatus = users.map(user => {
      const userData = user.toJSON();

      // 🔧 修复: 正确处理 additionalPorts 字段
      userData.additionalPorts = user.getAdditionalPorts();

      return {
        ...userData,
        isExpired: user.isExpired(),
        forwardRuleCount: user.forwardRules ? user.forwardRules.length : 0,
        activeRuleCount: user.forwardRules ? user.forwardRules.filter(rule => {
          // 为计算属性设置用户关联
          rule.user = user;
          return rule.isActive;
        }).length : 0
      };
    });

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

      // 🚀 优化: 使用缓存协调器统一清理缓存和重置流量统计
      try {
        // 使用缓存协调器清理所有相关缓存
        const cacheCoordinator = require('../services/cacheCoordinator');
        await cacheCoordinator.clearUserRelatedCache(userId, 'traffic_reset');
        console.log(`✅ 用户 ${userId} 所有相关缓存已清理`);

        // 额外的流量重置特定清理
        const multiInstanceCacheService = require('../services/multiInstanceCacheService');

        // 重置缓存中的流量统计为 0
        await multiInstanceCacheService.resetUserTrafficCache(userId);
        console.log(`✅ 用户流量缓存已重置为 0`);

        // 清理观察器的累积值跟踪 (防止重复计算)
        const gostPluginService = require('../services/gostPluginService');
        gostPluginService.clearUserCumulativeStats(userId);
        console.log(`✅ 用户累积值跟踪已清理`);

        // 🔧 关键修复：清理所有端口的累积统计
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
          // 🔄 新增: 使用同步触发器
          const gostSyncTrigger = require('../services/gostSyncTrigger');
          await gostSyncTrigger.onTrafficUpdate(userId, 'traffic_reset', true);
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
