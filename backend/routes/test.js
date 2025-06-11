/**
 * 测试接口路由
 * 
 * 功能说明:
 * 1. 提供流量测试接口
 * 2. 模拟不同大小的数据传输
 * 3. 用于测试 GOST 流量统计功能
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

/**
 * 生成指定大小的随机数据（小数据版本）
 * @param {number} sizeInBytes - 数据大小（字节）
 * @returns {string} 随机数据字符串
 */
function generateRandomData(sizeInBytes) {
  const buffer = crypto.randomBytes(Math.floor(sizeInBytes / 2));
  return buffer.toString('hex'); // hex 编码会使大小翻倍
}

/**
 * 流式生成大数据响应
 * @param {Object} res - Express 响应对象
 * @param {number} sizeInBytes - 数据大小（字节）
 * @param {string} message - 响应消息
 */
function streamLargeData(res, sizeInBytes, message) {
  const chunkSize = 1024 * 1024; // 1MB 分块
  let sentBytes = 0;

  // 设置响应头
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Length', sizeInBytes + 200); // 预估大小

  // 发送 JSON 开始部分
  const jsonStart = JSON.stringify({
    message: message,
    dataSize: `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`,
    dataSizeBytes: sizeInBytes,
    timestamp: new Date().toISOString(),
    data: ""
  }).slice(0, -2); // 移除最后的 "}

  res.write(jsonStart);

  // 流式发送数据
  const sendChunk = () => {
    if (sentBytes >= sizeInBytes) {
      // 发送 JSON 结束部分
      res.write('"}');
      res.end();
      return;
    }

    const remainingBytes = Math.min(chunkSize, sizeInBytes - sentBytes);
    const chunk = crypto.randomBytes(Math.floor(remainingBytes / 2)).toString('hex');

    res.write(chunk);
    sentBytes += remainingBytes;

    // 异步发送下一块，避免阻塞
    setImmediate(sendChunk);
  };

  sendChunk();
}

/**
 * 流量测试接口 - 1MB
 * GET /api/test/traffic-1mb
 */
router.get('/traffic-1mb', (req, res) => {
  try {
    console.log('🧪 流量测试: 生成 1MB 数据...');
    
    const startTime = Date.now();
    const oneMB = 1024 * 1024; // 1MB = 1,048,576 bytes
    
    // 生成 1MB 的随机数据
    const data = generateRandomData(oneMB);
    
    const endTime = Date.now();
    const generationTime = endTime - startTime;
    
    console.log(`✅ 1MB 数据生成完成，耗时: ${generationTime}ms`);
    
    res.json({
      message: '流量测试 - 1MB 数据',
      dataSize: `${(data.length / (1024 * 1024)).toFixed(2)} MB`,
      dataSizeBytes: data.length,
      generationTime: `${generationTime}ms`,
      timestamp: new Date().toISOString(),
      data: data
    });
  } catch (error) {
    console.error('❌ 生成测试数据失败:', error);
    res.status(500).json({
      message: '生成测试数据失败',
      error: error.message
    });
  }
});

/**
 * 流量测试接口 - 5MB
 * GET /api/test/traffic-5mb
 */
router.get('/traffic-5mb', (req, res) => {
  try {
    console.log('🧪 流量测试: 生成 5MB 数据...');
    
    const startTime = Date.now();
    const fiveMB = 5 * 1024 * 1024; // 5MB
    
    // 生成 5MB 的随机数据
    const data = generateRandomData(fiveMB);
    
    const endTime = Date.now();
    const generationTime = endTime - startTime;
    
    console.log(`✅ 5MB 数据生成完成，耗时: ${generationTime}ms`);
    
    res.json({
      message: '流量测试 - 5MB 数据',
      dataSize: `${(data.length / (1024 * 1024)).toFixed(2)} MB`,
      dataSizeBytes: data.length,
      generationTime: `${generationTime}ms`,
      timestamp: new Date().toISOString(),
      data: data
    });
  } catch (error) {
    console.error('❌ 生成测试数据失败:', error);
    res.status(500).json({
      message: '生成测试数据失败',
      error: error.message
    });
  }
});

/**
 * 流量测试接口 - 10MB
 * GET /api/test/traffic-10mb
 */
router.get('/traffic-10mb', (req, res) => {
  try {
    console.log('🧪 流量测试: 生成 10MB 数据...');
    
    const startTime = Date.now();
    const tenMB = 10 * 1024 * 1024; // 10MB
    
    // 生成 10MB 的随机数据
    const data = generateRandomData(tenMB);
    
    const endTime = Date.now();
    const generationTime = endTime - startTime;
    
    console.log(`✅ 10MB 数据生成完成，耗时: ${generationTime}ms`);
    
    res.json({
      message: '流量测试 - 10MB 数据',
      dataSize: `${(data.length / (1024 * 1024)).toFixed(2)} MB`,
      dataSizeBytes: data.length,
      generationTime: `${generationTime}ms`,
      timestamp: new Date().toISOString(),
      data: data
    });
  } catch (error) {
    console.error('❌ 生成测试数据失败:', error);
    res.status(500).json({
      message: '生成测试数据失败',
      error: error.message
    });
  }
});

/**
 * 自定义大小流量测试接口
 * GET /api/test/traffic-custom?size=50
 */
router.get('/traffic-custom', (req, res) => {
  try {
    const { size = 1 } = req.query; // 默认 1MB
    const sizeInMB = parseFloat(size);
    
    if (isNaN(sizeInMB) || sizeInMB <= 0 || sizeInMB > 1024) {
      return res.status(400).json({
        message: '数据大小必须在 0.1-1024 MB 之间',
        example: '/api/test/traffic-custom?size=2.5'
      });
    }
    
    console.log(`🧪 流量测试: 生成 ${sizeInMB}MB 数据...`);

    const startTime = Date.now();
    const sizeInBytes = Math.floor(sizeInMB * 1024 * 1024);

    // 对于大数据量（>100MB），使用流式处理
    if (sizeInMB > 100) {
      console.warn(`⚠️ 生成大量数据 (${sizeInMB}MB)，使用流式处理...`);

      const endTime = Date.now();
      const generationTime = endTime - startTime;

      console.log(`🚀 开始流式发送 ${sizeInMB}MB 数据，准备时间: ${generationTime}ms`);

      // 使用流式处理发送大数据
      streamLargeData(res, sizeInBytes, `流量测试 - ${sizeInMB}MB 数据 (流式)`);
      return;
    }

    // 小数据使用原有方式
    console.log(`📦 生成小数据 (${sizeInMB}MB)...`);

    // 生成指定大小的随机数据
    const data = generateRandomData(sizeInBytes);

    const endTime = Date.now();
    const generationTime = endTime - startTime;

    console.log(`✅ ${sizeInMB}MB 数据生成完成，耗时: ${generationTime}ms`);

    res.json({
      message: `流量测试 - ${sizeInMB}MB 数据`,
      requestedSize: `${sizeInMB} MB`,
      actualSize: `${(data.length / (1024 * 1024)).toFixed(2)} MB`,
      dataSizeBytes: data.length,
      generationTime: `${generationTime}ms`,
      timestamp: new Date().toISOString(),
      data: data
    });
  } catch (error) {
    console.error('❌ 生成测试数据失败:', error);
    res.status(500).json({
      message: '生成测试数据失败',
      error: error.message
    });
  }
});

/**
 * 流量测试状态接口
 * GET /api/test/status
 */
router.get('/status', (req, res) => {
  try {
    res.json({
      message: '流量测试接口正常运行',
      availableEndpoints: [
        {
          path: '/api/test/traffic-1mb',
          description: '生成 1MB 测试数据',
          method: 'GET'
        },
        {
          path: '/api/test/traffic-5mb',
          description: '生成 5MB 测试数据',
          method: 'GET'
        },
        {
          path: '/api/test/traffic-10mb',
          description: '生成 10MB 测试数据',
          method: 'GET'
        },
        {
          path: '/api/test/traffic-custom?size=2.5',
          description: '生成自定义大小测试数据 (0.1-1024 MB)',
          method: 'GET'
        }
      ],
      usage: [
        '1. 通过 GOST 端口 6443 访问这些接口',
        '2. 例如: http://localhost:6443/api/test/traffic-1mb',
        '3. 每次访问会生成相应大小的数据用于流量测试',
        '4. GOST 观察器会记录实际的网络流量'
      ],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 获取测试状态失败:', error);
    res.status(500).json({
      message: '获取测试状态失败',
      error: error.message
    });
  }
});

/**
 * 手动触发缓冲区刷新接口
 * POST /api/test/flush-buffer
 */
router.post('/flush-buffer', async (req, res) => {
  try {
    console.log('🧪 手动触发缓冲区刷新...');

    // 获取 GOST 插件服务实例
    const gostPluginService = require('../services/gostPluginService');

    // 检查缓冲区状态
    const bufferSize = gostPluginService.trafficBuffer ? gostPluginService.trafficBuffer.size : 0;

    console.log(`📊 当前缓冲区大小: ${bufferSize}`);

    if (bufferSize === 0) {
      return res.json({
        message: '缓冲区为空，无需刷新',
        bufferSize: 0,
        timestamp: new Date().toISOString()
      });
    }

    // 手动触发刷新
    await gostPluginService.flushTrafficBuffer();

    console.log('✅ 手动缓冲区刷新完成');

    res.json({
      message: '缓冲区刷新完成',
      flushedItems: bufferSize,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 手动刷新缓冲区失败:', error);
    res.status(500).json({
      message: '手动刷新缓冲区失败',
      error: error.message
    });
  }
});

/**
 * 检查缓冲区状态接口
 * GET /api/test/buffer-status
 */
router.get('/buffer-status', (req, res) => {
  try {
    const gostPluginService = require('../services/gostPluginService');

    const bufferSize = gostPluginService.trafficBuffer ? gostPluginService.trafficBuffer.size : 0;
    const speedBufferSize = gostPluginService.speedBuffer ? gostPluginService.speedBuffer.size : 0;

    // 获取缓冲区内容（仅用于调试）
    const bufferContents = gostPluginService.trafficBuffer ?
      Array.from(gostPluginService.trafficBuffer.entries()).slice(0, 5) : [];

    res.json({
      message: '缓冲区状态',
      trafficBufferSize: bufferSize,
      speedBufferSize: speedBufferSize,
      sampleBufferContents: bufferContents,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ 获取缓冲区状态失败:', error);
    res.status(500).json({
      message: '获取缓冲区状态失败',
      error: error.message
    });
  }
});

/**
 * 流量测试帮助接口
 * GET /api/test/help
 */
router.get('/help', (req, res) => {
  res.json({
    title: 'GOST 流量测试接口使用指南',
    description: '通过生成不同大小的数据来测试 GOST 流量统计功能',
    setup: {
      step1: '确保 GOST 服务正在运行',
      step2: '确保端口 6443 转发到 127.0.0.1:3000',
      step3: '通过 http://localhost:6443 访问测试接口'
    },
    testScenarios: [
      {
        name: '基础流量测试',
        url: 'http://localhost:6443/api/test/traffic-1mb',
        expected: '生成 1MB 数据，GOST 应记录约 1MB 流量'
      },
      {
        name: '中等流量测试',
        url: 'http://localhost:6443/api/test/traffic-5mb',
        expected: '生成 5MB 数据，GOST 应记录约 5MB 流量'
      },
      {
        name: '大流量测试',
        url: 'http://localhost:6443/api/test/traffic-10mb',
        expected: '生成 10MB 数据，GOST 应记录约 10MB 流量'
      },
      {
        name: '自定义流量测试',
        url: 'http://localhost:6443/api/test/traffic-custom?size=2.5',
        expected: '生成 2.5MB 数据，GOST 应记录约 2.5MB 流量'
      }
    ],
    debugging: [
      {
        name: '检查缓冲区状态',
        url: 'http://localhost:3002/api/test/buffer-status',
        description: '查看当前缓冲区大小和内容'
      },
      {
        name: '手动刷新缓冲区',
        url: 'http://localhost:3002/api/test/flush-buffer',
        method: 'POST',
        description: '手动触发缓冲区刷新到数据库'
      }
    ],
    monitoring: [
      '查看仪表盘流量统计变化',
      '检查用户流量使用量增长',
      '验证 GOST 观察器日志',
      '确认流量限制功能正常'
    ],
    notes: [
      '数据传输包含 HTTP 头部，实际流量可能略大于数据大小',
      'GOST 观察器每 60 秒统计一次，可能有延迟',
      '建议间隔几秒钟进行多次测试以观察累计效果'
    ]
  });
});

/**
 * 🚀 延迟测试接口 - 简单响应 (模拟网页浏览)
 * GET /api/test/latency
 */
router.get('/latency', (req, res) => {
  try {
    res.json({
      message: '延迟测试响应',
      timestamp: new Date().toISOString(),
      server: 'backend',
      port: process.env.PORT || 3000
    });
  } catch (error) {
    console.error('延迟测试失败:', error);
    res.status(500).json({ error: '延迟测试失败' });
  }
});

/**
 * 🚀 数据回传测试接口 (模拟文件下载)
 * POST /api/test/echo
 */
router.post('/echo', async (req, res) => {
  try {
    const { data, delay = 0 } = req.body;

    if (!data) {
      return res.status(400).json({ error: '缺少测试数据' });
    }

    // 模拟处理延迟
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // 返回相同大小的数据 (模拟下载)
    res.json({
      message: '数据回传测试成功',
      timestamp: new Date().toISOString(),
      dataSize: data.length,
      delay: delay,
      echo: data // 回传数据
    });
  } catch (error) {
    console.error('数据回传测试失败:', error);
    res.status(500).json({ error: '数据回传测试失败' });
  }
});

/**
 * 🚀 生成指定大小的测试数据
 * GET /api/test/generate/:size
 */
router.get('/generate/:size', async (req, res) => {
  try {
    const size = parseInt(req.params.size);

    if (isNaN(size) || size <= 0 || size > 10 * 1024 * 1024) { // 最大10MB
      return res.status(400).json({ error: '无效的数据大小 (1B - 10MB)' });
    }

    // 生成指定大小的测试数据
    const testData = Buffer.alloc(size, 'T').toString('base64');

    res.json({
      message: '测试数据生成成功',
      size: size,
      sizeFormatted: formatBytes(size),
      data: testData
    });
  } catch (error) {
    console.error('生成测试数据失败:', error);
    res.status(500).json({ error: '生成测试数据失败' });
  }
});

// 辅助函数：格式化字节
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)}${units[unitIndex]}`;
}

module.exports = router;
