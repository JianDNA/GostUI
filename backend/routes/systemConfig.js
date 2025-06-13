const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { SystemConfig } = require('../models');

// 获取系统配置
router.get('/', auth, async (req, res) => {
  try {
    // 只允许管理员访问
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限访问系统配置' });
    }

    // 获取所有配置
    const configs = await SystemConfig.findAll({
      order: [['category', 'ASC'], ['key', 'ASC']]
    });

    // 转换为对象格式，按类别分组
    const configsByCategory = {};
    
    for (const config of configs) {
      if (!configsByCategory[config.category]) {
        configsByCategory[config.category] = {};
      }
      
      try {
        configsByCategory[config.category][config.key] = JSON.parse(config.value);
      } catch (e) {
        configsByCategory[config.category][config.key] = config.value;
      }
    }

    res.json({
      success: true,
      data: configsByCategory
    });
  } catch (error) {
    console.error('获取系统配置失败:', error);
    res.status(500).json({ message: '获取系统配置失败', error: error.message });
  }
});

// 获取特定配置
router.get('/:key', auth, async (req, res) => {
  try {
    const { key } = req.params;
    
    // 普通用户只能访问公开配置
    const isPublicConfig = ['disabledProtocols'].includes(key);
    if (req.user.role !== 'admin' && !isPublicConfig) {
      return res.status(403).json({ message: '没有权限访问此配置' });
    }

    const value = await SystemConfig.getValue(key);
    
    if (value === null) {
      return res.status(404).json({ message: '配置不存在' });
    }

    res.json({
      success: true,
      data: {
        key,
        value
      }
    });
  } catch (error) {
    console.error(`获取配置 ${req.params.key} 失败:`, error);
    res.status(500).json({ message: '获取配置失败', error: error.message });
  }
});

// 更新系统配置
router.put('/:key', auth, async (req, res) => {
  try {
    // 只允许管理员更新配置
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: '没有权限更新系统配置' });
    }

    const { key } = req.params;
    const { value, description, category } = req.body;

    if (value === undefined) {
      return res.status(400).json({ message: '配置值不能为空' });
    }

    // 特定配置的验证逻辑
    if (key === 'disabledProtocols') {
      if (!Array.isArray(value)) {
        return res.status(400).json({ message: '禁用协议必须是数组格式' });
      }
      
      const validProtocols = ['socks', 'http', 'tls'];
      const invalidProtocols = value.filter(p => !validProtocols.includes(p));
      
      if (invalidProtocols.length > 0) {
        return res.status(400).json({ 
          message: `无效的协议: ${invalidProtocols.join(', ')}，有效协议: ${validProtocols.join(', ')}` 
        });
      }
    }

    // 更新配置
    await SystemConfig.setValue(key, value, {
      description,
      category: category || 'performance',
      updatedBy: req.user.username
    });

    // 如果更新的是禁用协议，触发GOST配置同步
    if (key === 'disabledProtocols') {
      try {
        const gostSyncCoordinator = require('../services/gostSyncCoordinator');
        console.log(`🔄 更新禁用协议设置，触发强制同步`);
        
        const syncResult = await gostSyncCoordinator.requestSync('protocol_config_update', true, 10);
        
        if (syncResult.success) {
          console.log(`✅ 禁用协议配置更新后GOST同步成功`);
        } else {
          console.error(`❌ 禁用协议配置更新后GOST同步失败:`, syncResult.error);
        }
      } catch (syncError) {
        console.error('同步GOST配置失败:', syncError);
        // 不中断响应
      }
    }

    res.json({
      success: true,
      message: `配置 ${key} 更新成功`,
      data: {
        key,
        value
      }
    });
  } catch (error) {
    console.error(`更新配置 ${req.params.key} 失败:`, error);
    res.status(500).json({ message: '更新配置失败', error: error.message });
  }
});

module.exports = router;
