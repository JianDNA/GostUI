/**
 * 端口安全 API 路由
 * 提供端口验证、配置查询等功能
 */

const express = require('express');
const router = express.Router();
const { portSecurityService } = require('../services/portSecurityService');

/**
 * 验证单个端口
 * POST /api/port-security/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const { port, userRole = 'user', userId } = req.body;

    if (!port) {
      return res.status(400).json({
        success: false,
        error: '端口号不能为空'
      });
    }

    const result = await portSecurityService.validatePort(port, userRole, userId);

    res.json({
      success: true,
      data: {
        port,
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
        suggestions: result.suggestions
      }
    });

  } catch (error) {
    console.error('❌ 端口验证失败:', error);
    res.status(500).json({
      success: false,
      error: '端口验证服务异常'
    });
  }
});

/**
 * 批量验证端口
 * POST /api/port-security/validate-batch
 */
router.post('/validate-batch', async (req, res) => {
  try {
    const { ports, userRole = 'user', userId } = req.body;

    if (!Array.isArray(ports) || ports.length === 0) {
      return res.status(400).json({
        success: false,
        error: '端口列表不能为空'
      });
    }

    const results = await portSecurityService.validatePorts(ports, userRole, userId);

    res.json({
      success: true,
      data: {
        results,
        summary: {
          total: results.length,
          valid: results.filter(r => r.valid).length,
          invalid: results.filter(r => !r.valid).length
        }
      }
    });

  } catch (error) {
    console.error('❌ 批量端口验证失败:', error);
    res.status(500).json({
      success: false,
      error: '批量端口验证服务异常'
    });
  }
});

/**
 * 获取可用端口建议
 * GET /api/port-security/suggestions
 */
router.get('/suggestions', async (req, res) => {
  try {
    const { count = 10, userRole = 'user' } = req.query;

    const availablePorts = await portSecurityService.getAvailablePorts(
      parseInt(count), 
      userRole
    );

    res.json({
      success: true,
      data: {
        availablePorts,
        count: availablePorts.length,
        userRole
      }
    });

  } catch (error) {
    console.error('❌ 获取端口建议失败:', error);
    res.status(500).json({
      success: false,
      error: '获取端口建议服务异常'
    });
  }
});

/**
 * 获取端口安全配置信息
 * GET /api/port-security/config
 */
router.get('/config', (req, res) => {
  try {
    const securityInfo = portSecurityService.getSecurityInfo();

    res.json({
      success: true,
      data: securityInfo
    });

  } catch (error) {
    console.error('❌ 获取端口安全配置失败:', error);
    res.status(500).json({
      success: false,
      error: '获取端口安全配置服务异常'
    });
  }
});

/**
 * 检查端口是否被占用
 * GET /api/port-security/check-usage/:port
 */
router.get('/check-usage/:port', async (req, res) => {
  try {
    const port = parseInt(req.params.port);

    if (!portSecurityService.isValidPortNumber(port)) {
      return res.status(400).json({
        success: false,
        error: '无效的端口号'
      });
    }

    const isInUse = await portSecurityService.isPortInUse(port);

    res.json({
      success: true,
      data: {
        port,
        inUse: isInUse,
        status: isInUse ? 'occupied' : 'available'
      }
    });

  } catch (error) {
    console.error('❌ 检查端口占用失败:', error);
    res.status(500).json({
      success: false,
      error: '检查端口占用服务异常'
    });
  }
});

/**
 * 获取保留端口列表
 * GET /api/port-security/reserved-ports
 */
router.get('/reserved-ports', (req, res) => {
  try {
    const config = portSecurityService.config;
    const reservedPorts = config.reservedPorts;

    // 整理保留端口信息
    const result = {};
    for (const [category, data] of Object.entries(reservedPorts)) {
      result[category] = {
        description: data.description,
        ports: data.ports || [],
        ranges: data.ranges || [],
        count: (data.ports || []).length
      };
    }

    res.json({
      success: true,
      data: {
        categories: result,
        totalReservedPorts: portSecurityService.getReservedPortsCount()
      }
    });

  } catch (error) {
    console.error('❌ 获取保留端口列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取保留端口列表服务异常'
    });
  }
});

/**
 * 获取用户端口使用情况
 * GET /api/port-security/user-usage/:userId
 */
router.get('/user-usage/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const { models } = require('../services/dbService');
    const { UserForwardRules, Users } = models;

    // 获取用户信息
    const user = await Users.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      });
    }

    // 获取用户端口使用情况
    const userRules = await UserForwardRules.findAll({
      where: {
        userId: userId,
        isActive: true
      },
      order: [['sourcePort', 'ASC']]
    });

    const usedPorts = userRules.map(rule => ({
      port: rule.sourcePort,
      target: rule.targetAddress,
      createdAt: rule.createdAt
    }));

    const maxPorts = portSecurityService.config.security.maxPortsPerUser;

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        },
        usage: {
          used: usedPorts.length,
          max: maxPorts,
          remaining: maxPorts - usedPorts.length,
          percentage: Math.round((usedPorts.length / maxPorts) * 100)
        },
        ports: usedPorts
      }
    });

  } catch (error) {
    console.error('❌ 获取用户端口使用情况失败:', error);
    res.status(500).json({
      success: false,
      error: '获取用户端口使用情况服务异常'
    });
  }
});

/**
 * 验证目标地址
 * POST /api/port-security/validate-target
 */
router.post('/validate-target', async (req, res) => {
  try {
    const { targetAddress, userRole = 'user' } = req.body;

    if (!targetAddress) {
      return res.status(400).json({
        success: false,
        error: '目标地址不能为空'
      });
    }

    const result = await portSecurityService.validateTargetAddress(targetAddress, userRole);

    res.json({
      success: true,
      data: {
        targetAddress,
        userRole,
        ...result
      }
    });

  } catch (error) {
    console.error('❌ 验证目标地址失败:', error);
    res.status(500).json({
      success: false,
      error: '验证目标地址失败'
    });
  }
});

module.exports = router;
