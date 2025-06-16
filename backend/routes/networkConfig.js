const express = require('express');
const router = express.Router();
const { ipv6DetectionService } = require('../services/ipv6DetectionService');

/**
 * 获取系统网络配置信息
 * GET /api/network-config
 */
router.get('/', async (req, res) => {
  try {
    const networkInfo = await ipv6DetectionService.getNetworkInfo();
    
    res.json({
      success: true,
      data: networkInfo
    });

  } catch (error) {
    console.error('❌ 获取网络配置失败:', error);
    res.status(500).json({
      success: false,
      error: '获取网络配置失败'
    });
  }
});

/**
 * 检测IPv6支持状态
 * GET /api/network-config/ipv6-support
 */
router.get('/ipv6-support', async (req, res) => {
  try {
    const ipv6Supported = await ipv6DetectionService.isIPv6Supported();
    const ipv6Addresses = await ipv6DetectionService.getIPv6Addresses();
    
    res.json({
      success: true,
      data: {
        supported: ipv6Supported,
        addresses: ipv6Addresses,
        recommendedAddress: ipv6Supported ? await ipv6DetectionService.getRecommendedIPv6ListenAddress() : null
      }
    });

  } catch (error) {
    console.error('❌ 检测IPv6支持失败:', error);
    res.status(500).json({
      success: false,
      error: '检测IPv6支持失败'
    });
  }
});

/**
 * 验证IP地址格式
 * POST /api/network-config/validate-address
 */
router.post('/validate-address', async (req, res) => {
  try {
    const { address, type } = req.body;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: '地址不能为空'
      });
    }

    let isValid = false;
    let addressType = 'unknown';

    if (type === 'ipv4' || !type) {
      const net = require('net');
      if (net.isIPv4(address)) {
        isValid = true;
        addressType = 'ipv4';
      }
    }

    if (type === 'ipv6' || !type) {
      if (ipv6DetectionService.isValidIPv6Address(address)) {
        isValid = true;
        addressType = 'ipv6';
      }
    }

    res.json({
      success: true,
      data: {
        valid: isValid,
        type: addressType,
        address: address
      }
    });

  } catch (error) {
    console.error('❌ 验证IP地址失败:', error);
    res.status(500).json({
      success: false,
      error: '验证IP地址失败'
    });
  }
});

/**
 * 刷新网络配置缓存
 * POST /api/network-config/refresh
 */
router.post('/refresh', async (req, res) => {
  try {
    // 清除缓存
    ipv6DetectionService.clearCache();
    
    // 重新获取网络信息
    const networkInfo = await ipv6DetectionService.getNetworkInfo();
    
    res.json({
      success: true,
      message: '网络配置已刷新',
      data: networkInfo
    });

  } catch (error) {
    console.error('❌ 刷新网络配置失败:', error);
    res.status(500).json({
      success: false,
      error: '刷新网络配置失败'
    });
  }
});

module.exports = router;
