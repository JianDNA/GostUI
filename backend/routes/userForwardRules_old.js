const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { UserForwardRule, User } = require('../models');
const { Op } = require('sequelize');

// 验证地址格式的工具函数
const validateAddress = (address) => {
  // IPv4:port 格式
  const ipv4PortRegex = /^(\d{1,3}\.){3}\d{1,3}:\d{1,5}$/;
  if (ipv4PortRegex.test(address)) {
    const [ip, port] = address.split(':');
    const ipParts = ip.split('.');
    const portNum = parseInt(port, 10);
    
    // 验证IP地址
    const validIP = ipParts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
    
    // 验证端口
    const validPort = portNum >= 1 && portNum <= 65535;
    
    return validIP && validPort;
  }

  // [IPv6]:port 格式
  const ipv6PortRegex = /^\[([0-9a-fA-F:]+)\]:\d{1,5}$/;
  if (ipv6PortRegex.test(address)) {
    const match = address.match(ipv6PortRegex);
    const port = address.split(']:')[1];
    const portNum = parseInt(port, 10);
    
    // 简单的IPv6验证
    const ipv6 = match[1];
    const validIPv6 = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/.test(ipv6);
    const validPort = portNum >= 1 && portNum <= 65535;
    
    return validIPv6 && validPort;
  }

  return false;
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
    const userId = req.user.role === 'admin' ? req.query.userId || req.user.id : req.user.id;
    
    // 清理重复端口
    const cleanedCount = await cleanupDuplicatePorts(userId);
    
    // 获取用户信息
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 构建查询条件
    const whereCondition = req.user.role === 'admin' && req.query.userId 
      ? { userId: req.query.userId }
      : { userId: req.user.id };

    const rules = await UserForwardRule.findAll({
      where: whereCondition,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'portRangeStart', 'portRangeEnd', 'expiryDate']
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      rules,
      user: {
        id: user.id,
        username: user.username,
        portRangeStart: user.portRangeStart,
        portRangeEnd: user.portRangeEnd,
        expiryDate: user.expiryDate,
        isExpired: user.isExpired()
      },
      cleanedCount
    });
  } catch (error) {
    console.error('获取转发规则失败:', error);
    res.status(500).json({ message: '获取转发规则失败', error: error.message });
  }
});

// 创建转发规则
router.post('/', auth, async (req, res) => {
  try {
    const { name, sourcePort, targetAddress, protocol, description, userId: targetUserId } = req.body;

    // 验证必填字段
    if (!name || !sourcePort || !targetAddress) {
      return res.status(400).json({ message: '规则名称、源端口和目标地址是必填的' });
    }

    // 验证地址格式
    if (!validateAddress(targetAddress)) {
      return res.status(400).json({ 
        message: '目标地址格式错误，必须为 IPv4:port 或 [IPv6]:port 格式，例如：192.168.1.1:8080 或 [::1]:8080' 
      });
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

    // 检查端口范围（非管理员）
    if (req.user.role !== 'admin' && !user.isPortInRange(sourcePort)) {
      return res.status(400).json({ 
        message: `端口 ${sourcePort} 不在允许的端口范围内 (${user.portRangeStart}-${user.portRangeEnd})` 
      });
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

    // 创建规则
    const rule = await UserForwardRule.create({
      userId,
      name,
      sourcePort,
      targetAddress,
      protocol: protocol || 'tcp',
      description,
      isActive: true
    });

    // 返回创建的规则（包含用户信息）
    const createdRule = await UserForwardRule.findByPk(rule.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'portRangeStart', 'portRangeEnd', 'expiryDate']
      }]
    });

    res.status(201).json(createdRule);
  } catch (error) {
    console.error('创建转发规则失败:', error);
    res.status(500).json({ message: '创建转发规则失败', error: error.message });
  }
});

// 更新转发规则
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, sourcePort, targetAddress, protocol, description, isActive } = req.body;

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

    // 验证地址格式（如果提供了新地址）
    if (targetAddress && !validateAddress(targetAddress)) {
      return res.status(400).json({ 
        message: '目标地址格式错误，必须为 IPv4:port 或 [IPv6]:port 格式' 
      });
    }

    // 检查用户是否过期（非管理员）
    if (rule.user.role !== 'admin' && rule.user.isExpired()) {
      return res.status(403).json({ message: '用户已过期，无法修改转发规则' });
    }

    // 检查端口范围（如果修改了端口且非管理员）
    if (sourcePort && req.user.role !== 'admin' && !rule.user.isPortInRange(sourcePort)) {
      return res.status(400).json({ 
        message: `端口 ${sourcePort} 不在允许的端口范围内 (${rule.user.portRangeStart}-${rule.user.portRangeEnd})` 
      });
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

    // 更新规则
    await rule.update({
      name: name || rule.name,
      sourcePort: sourcePort || rule.sourcePort,
      targetAddress: targetAddress || rule.targetAddress,
      protocol: protocol || rule.protocol,
      description: description !== undefined ? description : rule.description,
      isActive: isActive !== undefined ? isActive : rule.isActive
    });

    // 返回更新后的规则
    const updatedRule = await UserForwardRule.findByPk(rule.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'portRangeStart', 'portRangeEnd', 'expiryDate']
      }]
    });

    res.json(updatedRule);
  } catch (error) {
    console.error('更新转发规则失败:', error);
    res.status(500).json({ message: '更新转发规则失败', error: error.message });
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
    res.status(204).send();
  } catch (error) {
    console.error('删除转发规则失败:', error);
    res.status(500).json({ message: '删除转发规则失败', error: error.message });
  }
});

// 切换规则启用状态
router.post('/:id/toggle', auth, async (req, res) => {
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

    // 权限检查：普通用户只能操作自己的规则
    if (req.user.role !== 'admin' && rule.userId !== req.user.id) {
      return res.status(403).json({ message: '没有权限操作此规则' });
    }

    // 检查用户是否过期（非管理员）
    if (rule.user.role !== 'admin' && rule.user.isExpired()) {
      return res.status(403).json({ message: '用户已过期，无法操作转发规则' });
    }

    await rule.update({ isActive: !rule.isActive });

    const updatedRule = await UserForwardRule.findByPk(rule.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username', 'portRangeStart', 'portRangeEnd', 'expiryDate']
      }]
    });

    res.json(updatedRule);
  } catch (error) {
    console.error('切换规则状态失败:', error);
    res.status(500).json({ message: '切换规则状态失败', error: error.message });
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

    res.json({ deletedCount, message: `成功删除 ${deletedCount} 个规则` });
  } catch (error) {
    console.error('批量删除规则失败:', error);
    res.status(500).json({ message: '批量删除规则失败', error: error.message });
  }
});

module.exports = router;
