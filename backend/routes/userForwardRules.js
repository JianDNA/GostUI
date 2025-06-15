﻿const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { UserForwardRule, User } = require('../models');
const { Op } = require('sequelize');
const dns = require('dns').promises;
const os = require('os');
const { portSecurityService } = require('../services/portSecurityService');

// 获取服务器的公网IP地址
const getServerPublicIP = async () => {
  try {
    // 在生产环境中，可以通过外部服务获取公网IP
    // 这里简化处理，实际部署时需要根据具体情况调整
    const networkInterfaces = os.networkInterfaces();
    const publicIPs = [];

    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          publicIPs.push(iface.address);
        }
      }
    }

    return publicIPs;
  } catch (error) {
    console.error('获取服务器IP失败:', error);
    return [];
  }
};

// 检查是否为内网IP
const isPrivateIP = (ip) => {
  // 移除IPv6的方括号
  const cleanIP = ip.replace(/[\[\]]/g, '');

  // IPv4内网地址检查
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(cleanIP)) {
    const parts = cleanIP.split('.').map(Number);
    return (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 127 ||
      cleanIP === '127.0.0.1'
    );
  }

  // IPv6内网地址检查
  if (cleanIP.includes(':')) {
    return cleanIP === '::1' || cleanIP.startsWith('fc') || cleanIP.startsWith('fd') || cleanIP === 'localhost';
  }

  // localhost检查
  return cleanIP === 'localhost';
};

// 验证地址格式和安全性
const validateTargetAddress = async (address, user) => {
  try {
    // 基本格式验证
    const ipv4PortRegex = /^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/;
    const ipv6PortRegex = /^\[([0-9a-fA-F:]+)\]:\d{1,5}$/;
    const domainPortRegex = /^[a-zA-Z0-9.-]+:\d{1,5}$/;

    let targetIP, targetPort;

    if (ipv4PortRegex.test(address)) {
      // IPv4:port 格式
      [targetIP, targetPort] = address.split(':');
      const parts = targetIP.split('.').map(Number);

      // 验证IP地址有效性
      if (parts.some(part => part < 0 || part > 255)) {
        throw new Error('无效的IPv4地址');
      }
    } else if (ipv6PortRegex.test(address)) {
      // [IPv6]:port 格式
      const match = address.match(ipv6PortRegex);
      targetIP = match[1];
      targetPort = address.split(']:')[1];
    } else if (domainPortRegex.test(address)) {
      // 域名:port 格式
      [targetIP, targetPort] = address.split(':');

      // 域名解析检查
      try {
        const resolvedIPs = await dns.resolve4(targetIP);
        const serverIPs = await getServerPublicIP();

        // 检查域名是否解析到服务器自身的公网IP
        for (const resolvedIP of resolvedIPs) {
          if (serverIPs.includes(resolvedIP)) {
            throw new Error('不允许转发到服务器自身的公网IP地址');
          }
        }

        // 使用解析后的第一个IP进行后续检查
        targetIP = resolvedIPs[0];
      } catch (dnsError) {
        if (dnsError.message.includes('不允许转发到服务器自身')) {
          throw dnsError;
        }
        throw new Error('域名解析失败，请检查域名是否正确');
      }
    } else {
      throw new Error('目标地址格式错误，支持 IPv4:port、[IPv6]:port 或 域名:port 格式');
    }

    // 验证端口范围
    const port = parseInt(targetPort);
    if (port < 1 || port > 65535) {
      throw new Error('端口范围必须在 1-65535 之间');
    }

    // 内网地址端口限制检查
    if (isPrivateIP(targetIP)) {
      // 获取当前操作用户的角色
      const currentUserRole = global.currentRequestUser?.role || user.role;
      
      // 如果当前用户是管理员，则不做限制
      if (currentUserRole === 'admin') {
        console.log('管理员操作：允许使用任意内网地址和端口');
      }
      // 普通用户需要检查端口范围
      else if (user.role !== 'admin') {
        if (!user.portRangeStart || !user.portRangeEnd) {
          throw new Error('用户未设置端口范围，无法使用内网地址');
        }

        if (port < user.portRangeStart || port > user.portRangeEnd) {
          throw new Error(`内网地址端口必须在您的端口范围内 (${user.portRangeStart}-${user.portRangeEnd})`);
        }
      }
    }

    return { targetIP, targetPort: port, isPrivate: isPrivateIP(targetIP) };
  } catch (error) {
    throw error;
  }
};

// 清理重复端口的函数
const cleanupDuplicatePorts = async (userId) => {
  try {
    // 查找该用户的所有转发规则，按端口分组
    const rules = await UserForwardRule.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']] // 最新的在前
    });

    const portMap = new Map();
    const duplicateIds = [];

    // 找出重复的端口，保留最新的
    rules.forEach(rule => {
      if (portMap.has(rule.sourcePort)) {
        // 如果端口已存在，将旧的规则ID加入删除列表
        duplicateIds.push(portMap.get(rule.sourcePort));
      }
      portMap.set(rule.sourcePort, rule.id);
    });

    // 删除重复的规则
    if (duplicateIds.length > 0) {
      await UserForwardRule.destroy({
        where: {
          id: { [Op.in]: duplicateIds }
        }
      });
      console.log(`清理了用户 ${userId} 的 ${duplicateIds.length} 个重复端口规则`);
    }

    return duplicateIds.length;
  } catch (error) {
    console.error('清理重复端口失败:', error);
    return 0;
  }
};

// 获取用户转发规则列表
router.get('/', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const requestedUserId = req.query.userId;

    // 权限检查：普通用户只能查看自己的规则
    if (!isAdmin && requestedUserId && requestedUserId != req.user.id) {
      return res.status(403).json({ message: '没有权限查看其他用户的规则' });
    }

    // 确定查询范围
    if (isAdmin && !requestedUserId) {
      // 管理员直接访问规则管理：返回所有用户的规则（分组）
      const users = await User.findAll({
        include: [{
          model: UserForwardRule,
          as: 'forwardRules'
        }],
        attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'portRangeStart', 'portRangeEnd', 'additionalPorts', 'expiryDate', 'trafficQuota', 'usedTraffic'],
        order: [['username', 'ASC'], ['forwardRules', 'createdAt', 'DESC']]
      });

      // 为每个用户的规则添加流量统计
      const groupedRules = users.map(user => {
        if (!user.forwardRules || user.forwardRules.length === 0) {
          return null; // 过滤掉没有规则的用户
        }

        // 获取用户的额外端口
        const additionalPorts = user.getAdditionalPorts();
        console.log(`🔍 分组视图 - 用户 ${user.username} (${user.id}) 的额外端口:`, additionalPorts);

        // 为每个规则添加流量统计
        const rulesWithStats = user.forwardRules.map(rule => {
          const ruleData = rule.toJSON();

          // 手动设置用户关联，确保 isActive 计算正确
          rule.user = user;

          // 添加计算属性 isActive
          ruleData.isActive = rule.isActive;

          // 调试信息
          console.log(`🔍 规则 ${rule.name} isActive: ${rule.isActive}, 用户: ${user.username}, 状态: ${user.userStatus}`);

          // 添加规则级流量统计信息
          ruleData.trafficStats = {
            totalBytes: ruleData.usedTraffic || 0,
            formattedTotal: formatBytes(ruleData.usedTraffic || 0)
          };

          return ruleData;
        });

        return {
          userId: user.id,
          username: user.username,
          portRange: user.portRangeStart && user.portRangeEnd
            ? `${user.portRangeStart}-${user.portRangeEnd}`
            : '未设置',
          additionalPorts: additionalPorts, // 使用已解析的额外端口数组
          isExpired: user.isExpired(),
          rules: rulesWithStats
        };
      });

      // 过滤掉 null 值（没有规则的用户）
      const filteredGroupedRules = groupedRules.filter(group => group !== null);
      
      // 调试信息
      console.log('🔍 分组规则中的额外端口信息:');
      filteredGroupedRules.forEach(group => {
        console.log(`- 用户 ${group.username} (${group.userId}) 额外端口: ${JSON.stringify(group.additionalPorts)}`);
      });

      return res.json({
        groupedRules: filteredGroupedRules,
        cleanedCount: 0
      });
    } else {
      // 单用户模式：普通用户或管理员查看指定用户
      const userId = requestedUserId || req.user.id;

      // 清理重复端口
      const cleanedCount = await cleanupDuplicatePorts(userId);

      // 获取用户信息
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: '用户不存在' });
      }

      // 获取用户的额外端口
      const additionalPorts = user.getAdditionalPorts();
      console.log(`🔍 用户 ${user.username} (${userId}) 的额外端口:`, additionalPorts);

      // 获取规则
      const rules = await UserForwardRule.findAll({
        where: { userId },
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'portRangeStart', 'portRangeEnd', 'additionalPorts', 'expiryDate', 'trafficQuota', 'usedTraffic']
        }],
        order: [['createdAt', 'DESC']]
      });

      // 为每个规则添加流量统计
      const rulesWithStats = rules.map(rule => {
        const ruleData = rule.toJSON();

        // 添加计算属性 isActive
        ruleData.isActive = rule.isActive;

        // 调试信息
        console.log(`🔍 单用户模式 - 规则 ${rule.name} isActive: ${rule.isActive}, 用户: ${rule.user?.username}`);

        // 添加规则级流量统计信息
        ruleData.trafficStats = {
          totalBytes: ruleData.usedTraffic || 0,
          formattedTotal: formatBytes(ruleData.usedTraffic || 0)
        };

        return ruleData;
      });

      return res.json({
        rules: rulesWithStats,
        user: {
          id: user.id,
          username: user.username,
          portRangeStart: user.portRangeStart,
          portRangeEnd: user.portRangeEnd,
          additionalPorts: additionalPorts, // 确保直接使用解析后的数组
          expiryDate: user.expiryDate,
          isExpired: user.isExpired()
        },
        cleanedCount
      });
    }
  } catch (error) {
    console.error('获取转发规则失败:', error);
    res.status(500).json({ message: '获取转发规则失败', error: error.message });
  }
});

// 创建转发规则
router.post('/', auth, async (req, res) => {
  try {
    // 设置当前请求用户信息，用于内部函数访问
    global.currentRequestUser = req.user;
    const {
      name,
      sourcePort,
      targetAddress,
      protocol,
      description,
      userId: targetUserId,
      listenAddress,
      listenAddressType
    } = req.body;

    // 验证必填字段
    if (!name || !sourcePort || !targetAddress) {
      return res.status(400).json({ message: '规则名称、源端口和目标地址是必填的' });
    }

    // 确定目标用户ID
    let userId;
    if (req.user.role === 'admin' && targetUserId) {
      userId = targetUserId;
    } else {
      userId = req.user.id;
    }

    // 获取用户信息
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 检查用户是否过期（非管理员）
    if (user.role !== 'admin' && user.isExpired()) {
      return res.status(403).json({ message: '用户已过期，无法创建转发规则' });
    }

    // 🔒 端口安全验证（新增）
    try {
      // 如果是管理员为普通用户创建规则，使用特殊的验证逻辑
      let validationRole = user.role;
      
      // 如果当前操作用户是管理员，但目标用户不是管理员，使用特殊的"admin_for_user"角色
      if (req.user.role === 'admin' && user.role !== 'admin') {
        console.log('管理员为普通用户创建规则，使用特殊验证逻辑');
        validationRole = 'admin_for_user';
      }
      
      const portValidation = await portSecurityService.validatePort(
        sourcePort,
        validationRole,
        userId
      );

      if (!portValidation.valid) {
        return res.status(400).json({
          message: '端口安全验证失败',
          errors: portValidation.errors,
          warnings: portValidation.warnings,
          suggestions: portValidation.suggestions
        });
      }

      // 如果有警告，记录到日志
      if (portValidation.warnings.length > 0) {
        console.log(`⚠️ 端口 ${sourcePort} 安全警告:`, portValidation.warnings);
      }
    } catch (portSecurityError) {
      console.error('端口安全验证异常:', portSecurityError);
      return res.status(500).json({
        message: '端口安全验证服务异常，请稍后重试'
      });
    }

    // 🔧 端口安全服务优先级高于用户端口范围，已在上面检查过，这里不再重复检查
    // 注释掉原有的用户端口范围检查，以端口安全服务为准
    // if (user.role !== 'admin' && !user.isPortInRange(sourcePort)) {
    //   return res.status(400).json({
    //     message: `端口 ${sourcePort} 不在允许的端口范围内 (${user.portRangeStart}-${user.portRangeEnd})`
    //   });
    // }

    // 验证目标地址
    try {
      const addressValidation = await validateTargetAddress(targetAddress, user);
      console.log('地址验证结果:', addressValidation);
    } catch (addressError) {
      return res.status(400).json({ message: addressError.message });
    }

    // 清理重复端口
    await cleanupDuplicatePorts(userId);

    // 检查端口是否已被使用
    const existingRule = await UserForwardRule.findOne({
      where: {
        userId,
        sourcePort
      }
    });

    if (existingRule) {
      return res.status(400).json({ message: `端口 ${sourcePort} 已被使用` });
    }

    // 🔧 验证目标地址权限 - 使用当前操作用户的角色，而不是被编辑用户的角色
    const targetValidation = await portSecurityService.validateTargetAddress(targetAddress, req.user.role);

    if (!targetValidation.valid) {
      return res.status(400).json({
        message: '目标地址验证失败',
        errors: targetValidation.errors,
        warnings: targetValidation.warnings
      });
    }

    // 验证监听地址配置
    let finalListenAddress = listenAddress;
    let finalListenAddressType = listenAddressType || 'ipv4';

    // 如果没有提供监听地址，根据类型设置默认值
    if (!finalListenAddress) {
      if (finalListenAddressType === 'ipv6') {
        // 检查系统是否支持IPv6
        const { ipv6DetectionService } = require('../services/ipv6DetectionService');
        const ipv6Supported = await ipv6DetectionService.isIPv6Supported();
        if (!ipv6Supported) {
          return res.status(400).json({
            message: '系统不支持IPv6，请使用IPv4监听地址'
          });
        }
        finalListenAddress = '::1';
      } else {
        finalListenAddress = '127.0.0.1';
      }
    }

    // 创建规则
    const { v4: uuidv4 } = require('uuid');
    const rule = await UserForwardRule.create({
      userId,
      ruleUUID: uuidv4(), // 自动生成UUID
      name,
      sourcePort,
      targetAddress,
      protocol: protocol || 'tcp',
      description,
      listenAddress: finalListenAddress,
      listenAddressType: finalListenAddressType
    });

    // 返回创建的规则（包含用户信息）
    const createdRule = await UserForwardRule.findByPk(rule.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'portRangeStart', 'portRangeEnd', 'additionalPorts', 'expiryDate', 'trafficQuota', 'usedTraffic']
      }]
    });

    // 🚀 优化: 创建规则后清理相关缓存并同步
    try {
      // 清理端口和用户相关缓存
      const cacheCoordinator = require('../services/cacheCoordinator');
      await cacheCoordinator.clearPortRelatedCache(createdRule.sourcePort, 'rule_create');
      await cacheCoordinator.clearUserRelatedCache(createdRule.userId, 'rule_create');

      // 🔄 新增: 使用同步触发器
      const gostSyncTrigger = require('../services/gostSyncTrigger');
      console.log(`➕ 创建规则 ${createdRule.name} (端口${createdRule.sourcePort})，触发强制同步`);

      await gostSyncTrigger.onRuleUpdate(createdRule.id, 'create', true);
      console.log(`✅ 创建规则后GOST同步成功: ${createdRule.name}`);
    } catch (error) {
      console.error('创建规则后处理失败:', error);
      // 即使处理失败，也不影响创建操作的成功响应
    }

    res.status(201).json(createdRule);
  } catch (error) {
    console.error('创建转发规则失败:', error);
    res.status(500).json({ message: '创建转发规则失败', error: error.message });
  } finally {
    // 清除当前请求用户信息
    global.currentRequestUser = null;
  }
});

// 更新转发规则
router.put('/:id', auth, async (req, res) => {
  try {
    // 设置当前请求用户信息，用于内部函数访问
    global.currentRequestUser = req.user;
    const {
      name,
      sourcePort,
      targetAddress,
      protocol,
      description,
      listenAddress,
      listenAddressType
    } = req.body;
    // isActive 现在是计算属性，不能直接设置

    // 查找规则
    const rule = await UserForwardRule.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'user'
      }]
    });

    if (!rule) {
      return res.status(404).json({ message: '转发规则不存在' });
    }

    // 权限检查：普通用户只能修改自己的规则
    if (req.user.role !== 'admin' && rule.userId !== req.user.id) {
      return res.status(403).json({ message: '没有权限修改此规则' });
    }

    // 验证目标地址（如果提供了新地址）
    if (targetAddress) {
      try {
        const addressValidation = await validateTargetAddress(targetAddress, rule.user);
        console.log('地址验证结果:', addressValidation);
      } catch (addressError) {
        return res.status(400).json({ message: addressError.message });
      }
    }

    // 检查用户是否过期（非管理员）
    if (rule.user.role !== 'admin' && rule.user.isExpired()) {
      return res.status(403).json({ message: '用户已过期，无法修改转发规则' });
    }

    // 🔒 端口安全验证（如果修改了端口）
    if (sourcePort && sourcePort !== rule.sourcePort) {
      try {
        // 如果是管理员为普通用户更新规则，使用特殊的验证逻辑
        let validationRole = rule.user.role;
        
        // 如果当前操作用户是管理员，但目标用户不是管理员，使用特殊的"admin_for_user"角色
        if (req.user.role === 'admin' && rule.user.role !== 'admin') {
          console.log('管理员为普通用户更新规则，使用特殊验证逻辑');
          validationRole = 'admin_for_user';
        }
        
        const portValidation = await portSecurityService.validatePort(
          sourcePort,
          validationRole,
          rule.userId
        );

        if (!portValidation.valid) {
          return res.status(400).json({
            message: '端口安全验证失败',
            errors: portValidation.errors,
            warnings: portValidation.warnings,
            suggestions: portValidation.suggestions
          });
        }

        // 如果有警告，记录到日志
        if (portValidation.warnings.length > 0) {
          console.log(`⚠️ 端口 ${sourcePort} 安全警告:`, portValidation.warnings);
        }
      } catch (portSecurityError) {
        console.error('端口安全验证异常:', portSecurityError);
        return res.status(500).json({
          message: '端口安全验证服务异常，请稍后重试'
        });
      }
    }

    // 如果修改了端口，检查是否冲突
    if (sourcePort && sourcePort !== rule.sourcePort) {
      const existingRule = await UserForwardRule.findOne({
        where: {
          userId: rule.userId,
          sourcePort,
          id: { [Op.ne]: rule.id }
        }
      });

      if (existingRule) {
        return res.status(400).json({ message: `端口 ${sourcePort} 已被使用` });
      }
    }

    // 🔧 如果更新了目标地址，验证目标地址权限 - 使用当前操作用户的角色
    if (targetAddress && targetAddress !== rule.targetAddress) {
      const { portSecurityService } = require('../services/portSecurityService');
      const targetValidation = await portSecurityService.validateTargetAddress(targetAddress, req.user.role);

      if (!targetValidation.valid) {
        return res.status(400).json({
          message: '目标地址验证失败',
          errors: targetValidation.errors,
          warnings: targetValidation.warnings
        });
      }
    }

    // 处理监听地址更新
    let finalListenAddress = listenAddress;
    let finalListenAddressType = listenAddressType;

    // 如果提供了监听地址类型但没有地址，设置默认地址
    if (finalListenAddressType && !finalListenAddress) {
      if (finalListenAddressType === 'ipv6') {
        // 检查系统是否支持IPv6
        const { ipv6DetectionService } = require('../services/ipv6DetectionService');
        const ipv6Supported = await ipv6DetectionService.isIPv6Supported();
        if (!ipv6Supported) {
          return res.status(400).json({
            message: '系统不支持IPv6，请使用IPv4监听地址'
          });
        }
        finalListenAddress = '::1';
      } else {
        finalListenAddress = '127.0.0.1';
      }
    }

    // isActive 现在是计算属性，不需要安全校验
    // 规则的激活状态由用户状态、配额等自动决定

    // 更新规则（不包括 isActive，因为它现在是计算属性）
    const updateData = {
      name: name || rule.name,
      sourcePort: sourcePort || rule.sourcePort,
      targetAddress: targetAddress || rule.targetAddress,
      protocol: protocol || rule.protocol,
      description: description !== undefined ? description : rule.description
    };

    // 只有在提供了监听地址相关参数时才更新
    if (finalListenAddress !== undefined) {
      updateData.listenAddress = finalListenAddress;
    }
    if (finalListenAddressType !== undefined) {
      updateData.listenAddressType = finalListenAddressType;
    }

    await rule.update(updateData);

    // 返回更新后的规则
    const updatedRule = await UserForwardRule.findByPk(rule.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'role', 'isActive', 'userStatus', 'portRangeStart', 'portRangeEnd', 'additionalPorts', 'expiryDate', 'trafficQuota', 'usedTraffic']
      }]
    });

    // 🚀 优化: 更新规则后清理相关缓存并同步
    try {
      // 清理端口和用户相关缓存
      const cacheCoordinator = require('../services/cacheCoordinator');
      await cacheCoordinator.clearPortRelatedCache(updatedRule.sourcePort, 'rule_update');
      await cacheCoordinator.clearUserRelatedCache(updatedRule.userId, 'rule_update');

      // 如果端口发生变化，也清理旧端口的缓存
      if (updateData.sourcePort && updateData.sourcePort !== rule.sourcePort) {
        await cacheCoordinator.clearPortRelatedCache(rule.sourcePort, 'rule_update_old_port');
      }

      // 🔄 新增: 使用同步触发器
      const gostSyncTrigger = require('../services/gostSyncTrigger');
      console.log(`📝 更新规则 ${updatedRule.name} (端口${updatedRule.sourcePort})，触发强制同步`);

      await gostSyncTrigger.onRuleUpdate(updatedRule.id, 'update', true);
      console.log(`✅ 更新规则后GOST同步成功: ${updatedRule.name}`);
    } catch (error) {
      console.error('更新规则后处理失败:', error);
      // 即使处理失败，也不影响更新操作的成功响应
    }

    // 添加计算属性到返回数据
    const ruleData = updatedRule.toJSON();
    ruleData.isActive = updatedRule.isActive;

    res.json(ruleData);
  } catch (error) {
    console.error('更新转发规则失败:', error);
    res.status(500).json({ message: '更新转发规则失败', error: error.message });
  } finally {
    // 清除当前请求用户信息
    global.currentRequestUser = null;
  }
});


// 删除转发规则
router.delete('/:id', auth, async (req, res) => {
  try {
    const rule = await UserForwardRule.findByPk(req.params.id);

    if (!rule) {
      return res.status(404).json({ message: '转发规则不存在' });
    }

    // 权限检查：普通用户只能删除自己的规则
    if (req.user.role !== 'admin' && rule.userId !== req.user.id) {
      return res.status(403).json({ message: '没有权限删除此规则' });
    }

    await rule.destroy();

    // 🚀 优化: 删除规则后清理相关缓存并同步
    try {
      // 清理端口和用户相关缓存
      const cacheCoordinator = require('../services/cacheCoordinator');
      await cacheCoordinator.clearPortRelatedCache(rule.sourcePort, 'rule_delete');
      await cacheCoordinator.clearUserRelatedCache(rule.userId, 'rule_delete');

      // 🔄 新增: 使用同步触发器
      const gostSyncTrigger = require('../services/gostSyncTrigger');
      console.log(`🗑️ 删除规则 ${rule.name} (端口${rule.sourcePort})，触发强制同步`);

      await gostSyncTrigger.onRuleUpdate(rule.id, 'delete', true);
      console.log(`✅ 删除规则后GOST同步成功: ${rule.name}`);
    } catch (error) {
      console.error('删除规则后处理失败:', error);
      // 即使处理失败，也不影响删除操作的成功响应
    }

    res.status(204).send();
  } catch (error) {
    console.error('删除转发规则失败:', error);
    res.status(500).json({ message: '删除转发规则失败', error: error.message });
  }
});

// 获取规则状态（只读）
router.get('/:id/status', auth, async (req, res) => {
  try {
    const rule = await UserForwardRule.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'user'
      }]
    });

    if (!rule) {
      return res.status(404).json({ message: '转发规则不存在' });
    }

    // 权限检查：普通用户只能查看自己的规则
    if (req.user.role !== 'admin' && rule.userId !== req.user.id) {
      return res.status(403).json({ message: '没有权限查看此规则' });
    }

    // 获取详细的状态说明
    let reason = '';
    if (rule.isActive) {
      reason = '规则已激活，正在转发流量';
    } else {
      const reasons = [];
      const user = rule.user;

      if (!user.isActive) {
        reasons.push('用户已被禁用');
      }

      if (user.userStatus === 'suspended') {
        reasons.push('用户已被暂停');
      }

      if (user.isExpired && user.isExpired()) {
        reasons.push('用户已过期');
      }

      if (user.role !== 'admin' && !user.isPortInRange(rule.sourcePort)) {
        reasons.push(`端口 ${rule.sourcePort} 超出允许范围`);
      }

      // 检查配额（这里可以添加更详细的配额检查）
      if (reasons.length === 0) {
        reasons.push('可能因配额限制或其他系统限制');
      }

      reason = `规则已禁用：${reasons.join('、')}`;
    }

    res.json({
      success: true,
      data: {
        id: rule.id,
        name: rule.name,
        sourcePort: rule.sourcePort,
        isActive: rule.isActive, // 这是计算属性
        reason: reason
      },
      message: '规则状态查询成功'
    });
  } catch (error) {
    console.error('查询规则状态失败:', error);
    res.status(500).json({ message: '查询规则状态失败', error: error.message });
  }
});

// 批量删除规则
router.post('/batch-delete', auth, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: '请提供要删除的规则ID列表' });
    }

    // 查找规则
    const rules = await UserForwardRule.findAll({
      where: { id: { [Op.in]: ids } }
    });

    // 权限检查：普通用户只能删除自己的规则
    if (req.user.role !== 'admin') {
      const invalidRules = rules.filter(rule => rule.userId !== req.user.id);
      if (invalidRules.length > 0) {
        return res.status(403).json({ message: '没有权限删除某些规则' });
      }
    }

    // 删除规则
    const deletedCount = await UserForwardRule.destroy({
      where: { id: { [Op.in]: ids } }
    });

    // 🔧 修复：批量删除规则后强制立即同步GOST配置
    if (deletedCount > 0) {
      try {
        // 🔄 新增: 使用同步触发器
        const gostSyncTrigger = require('../services/gostSyncTrigger');
        console.log(`🗑️ 批量删除 ${deletedCount} 个规则，触发强制同步`);

        // 使用await等待同步完成，确保GOST立即更新
        await gostSyncTrigger.triggerSync('batch_rule_delete', true, { priority: 9, force: true });
        console.log(`✅ 批量删除规则后GOST同步成功，删除数量: ${deletedCount}`);
      } catch (error) {
        console.error('批量删除规则后触发配置同步失败:', error);
        // 即使同步失败，也不影响删除操作的成功响应
      }
    }

    res.json({ deletedCount, message: `成功删除 ${deletedCount} 个规则` });
  } catch (error) {
    console.error('批量删除规则失败:', error);
    res.status(500).json({ message: '批量删除规则失败', error: error.message });
  }
});

/**
 * 格式化字节数显示
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;
