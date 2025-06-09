/**
 * 基于 SQLite 的时序数据服务
 * 
 * 功能说明:
 * 1. 替代 InfluxDB，使用 SQLite 存储时序数据
 * 2. 提供与 InfluxDB 服务相同的接口
 * 3. 自动数据清理和性能优化
 * 4. 完全跨平台，无需额外安装
 * 
 * 优势:
 * - 无需外部依赖
 * - 跨平台兼容
 * - 简化部署
 * - 性能足够好
 */

const { models } = require('./dbService');
const { TrafficHourly, SpeedMinutely } = models;
const { Op } = require('sequelize');

class TimeSeriesService {
  constructor() {
    this.isConnected = true; // SQLite 总是可用的
    this.cleanupInterval = 24 * 60 * 60 * 1000; // 24小时清理一次
    this.cleanupTimer = null;
  }

  /**
   * 初始化时序数据服务
   */
  async initialize() {
    try {
      console.log('🔄 初始化 SQLite 时序数据服务...');

      // 确保表已创建
      await TrafficHourly.sync();
      await SpeedMinutely.sync();

      // 启动定期清理
      this.startPeriodicCleanup();

      console.log('✅ SQLite 时序数据服务初始化成功');
      console.log('📋 数据保留策略:');
      console.log('  - 流量统计 (traffic_hourly): 30天');
      console.log('  - 网速记录 (speed_minutely): 24小时');

      return true;
    } catch (error) {
      console.error('❌ SQLite 时序数据服务初始化失败:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * 记录小时流量统计
   * @param {number} userId - 用户ID
   * @param {number} port - 端口号
   * @param {number} inputBytes - 输入字节数
   * @param {number} outputBytes - 输出字节数
   */
  async recordHourlyTraffic(userId, port, inputBytes, outputBytes) {
    if (!this.isConnected) {
      console.warn('⚠️ 时序数据服务未连接，跳过流量记录');
      return;
    }

    try {
      const now = new Date();
      const recordHour = TrafficHourly.generateHourKey(now);
      const totalBytes = inputBytes + outputBytes;

      // 使用 upsert 来处理重复记录
      const [record, created] = await TrafficHourly.findOrCreate({
        where: {
          userId,
          port,
          recordHour
        },
        defaults: {
          userId,
          port,
          inputBytes,
          outputBytes,
          totalBytes,
          recordHour,
          recordTime: now
        }
      });

      if (!created) {
        // 记录已存在，累加数据
        await record.update({
          inputBytes: record.inputBytes + inputBytes,
          outputBytes: record.outputBytes + outputBytes,
          totalBytes: record.totalBytes + totalBytes,
          recordTime: now
        });
      }

      console.log(`📊 记录用户 ${userId} 端口 ${port} 小时流量: ${totalBytes} 字节`);
    } catch (error) {
      console.error(`❌ 记录小时流量失败:`, error);
    }
  }

  /**
   * 记录分钟网速
   * @param {number} userId - 用户ID
   * @param {number} port - 端口号
   * @param {number} inputRate - 输入速率 (bytes/second)
   * @param {number} outputRate - 输出速率 (bytes/second)
   */
  async recordMinutelySpeed(userId, port, inputRate, outputRate) {
    if (!this.isConnected) {
      console.warn('⚠️ 时序数据服务未连接，跳过网速记录');
      return;
    }

    try {
      const now = new Date();
      const recordMinute = SpeedMinutely.generateMinuteKey(now);
      const totalRate = inputRate + outputRate;

      // 使用 upsert 来处理重复记录
      const [record, created] = await SpeedMinutely.findOrCreate({
        where: {
          userId,
          port,
          recordMinute
        },
        defaults: {
          userId,
          port,
          inputRate,
          outputRate,
          totalRate,
          recordMinute,
          recordTime: now
        }
      });

      if (!created) {
        // 记录已存在，使用最新数据
        await record.update({
          inputRate,
          outputRate,
          totalRate,
          recordTime: now
        });
      }

      console.log(`🚀 记录用户 ${userId} 端口 ${port} 分钟网速: ${totalRate.toFixed(2)} bytes/s`);
    } catch (error) {
      console.error(`❌ 记录分钟网速失败:`, error);
    }
  }

  /**
   * 获取用户流量统计
   * @param {number} userId - 用户ID
   * @param {string} startTime - 开始时间 (ISO string)
   * @param {string} endTime - 结束时间 (ISO string)
   * @param {string} groupBy - 分组方式 ('hour', 'day')
   * @returns {Promise<Array>} 流量统计数据
   */
  async getUserTrafficStats(userId, startTime, endTime, groupBy = 'hour') {
    if (!this.isConnected) {
      console.warn('⚠️ 时序数据服务未连接，返回空数据');
      return [];
    }

    try {
      const whereClause = {
        userId,
        recordTime: {
          [Op.between]: [new Date(startTime), new Date(endTime)]
        }
      };

      if (groupBy === 'day') {
        // 按天分组
        const records = await TrafficHourly.findAll({
          where: whereClause,
          attributes: [
            'port',
            [models.sequelize.fn('DATE', models.sequelize.col('recordTime')), 'date'],
            [models.sequelize.fn('SUM', models.sequelize.col('inputBytes')), 'inputBytes'],
            [models.sequelize.fn('SUM', models.sequelize.col('outputBytes')), 'outputBytes'],
            [models.sequelize.fn('SUM', models.sequelize.col('totalBytes')), 'totalBytes']
          ],
          group: ['port', models.sequelize.fn('DATE', models.sequelize.col('recordTime'))],
          order: [[models.sequelize.fn('DATE', models.sequelize.col('recordTime')), 'ASC']]
        });

        return records.map(record => ({
          time: record.dataValues.date + 'T00:00:00Z',
          port: record.port,
          inputBytes: parseInt(record.dataValues.inputBytes) || 0,
          outputBytes: parseInt(record.dataValues.outputBytes) || 0,
          totalBytes: parseInt(record.dataValues.totalBytes) || 0
        }));
      } else {
        // 按小时分组
        const records = await TrafficHourly.findAll({
          where: whereClause,
          order: [['recordTime', 'ASC']]
        });

        return records.map(record => ({
          time: record.recordTime.toISOString(),
          port: record.port,
          inputBytes: record.inputBytes,
          outputBytes: record.outputBytes,
          totalBytes: record.totalBytes
        }));
      }
    } catch (error) {
      console.error(`❌ 获取用户 ${userId} 流量统计失败:`, error);
      return [];
    }
  }

  /**
   * 获取用户网速历史
   * @param {number} userId - 用户ID
   * @param {number} hours - 查询小时数 (默认24小时)
   * @returns {Promise<Array>} 网速历史数据
   */
  async getUserSpeedHistory(userId, hours = 24) {
    if (!this.isConnected) {
      console.warn('⚠️ 时序数据服务未连接，返回空数据');
      return [];
    }

    try {
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      const endTime = new Date();

      const records = await SpeedMinutely.findAll({
        where: {
          userId,
          recordTime: {
            [Op.between]: [startTime, endTime]
          }
        },
        order: [['recordTime', 'ASC']]
      });

      return records.map(record => ({
        time: record.recordTime.toISOString(),
        port: record.port,
        inputRate: record.inputRate,
        outputRate: record.outputRate,
        totalRate: record.totalRate
      }));
    } catch (error) {
      console.error(`❌ 获取用户 ${userId} 网速历史失败:`, error);
      return [];
    }
  }

  /**
   * 获取用户总流量统计
   * @param {number} userId - 用户ID
   * @param {number} days - 查询天数 (默认30天)
   * @returns {Promise<Object>} 总流量统计
   */
  async getUserTotalTraffic(userId, days = 30) {
    if (!this.isConnected) {
      return { totalBytes: 0, inputBytes: 0, outputBytes: 0 };
    }

    try {
      const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endTime = new Date();

      const result = await TrafficHourly.findOne({
        where: {
          userId,
          recordTime: {
            [Op.between]: [startTime, endTime]
          }
        },
        attributes: [
          [models.sequelize.fn('SUM', models.sequelize.col('inputBytes')), 'totalInput'],
          [models.sequelize.fn('SUM', models.sequelize.col('outputBytes')), 'totalOutput'],
          [models.sequelize.fn('SUM', models.sequelize.col('totalBytes')), 'totalBytes']
        ]
      });

      return {
        totalBytes: parseInt(result?.dataValues?.totalBytes) || 0,
        inputBytes: parseInt(result?.dataValues?.totalInput) || 0,
        outputBytes: parseInt(result?.dataValues?.totalOutput) || 0
      };
    } catch (error) {
      console.error(`❌ 获取用户 ${userId} 总流量失败:`, error);
      return { totalBytes: 0, inputBytes: 0, outputBytes: 0 };
    }
  }

  /**
   * 获取流量日志 (分页)
   * @param {number} userId - 用户ID
   * @param {string} startTime - 开始时间 (ISO string)
   * @param {string} endTime - 结束时间 (ISO string)
   * @param {number} page - 页码
   * @param {number} pageSize - 每页条数
   * @returns {Promise<Object>} 分页的流量日志数据
   */
  async getTrafficLogs(userId, startTime, endTime, page = 1, pageSize = 20) {
    if (!this.isConnected) {
      return { logs: [], total: 0 };
    }

    try {
      const offset = (page - 1) * pageSize;
      const whereClause = {
        userId,
        recordTime: {
          [Op.between]: [new Date(startTime), new Date(endTime)]
        }
      };

      // 获取总数
      const total = await TrafficHourly.count({ where: whereClause });

      // 获取分页数据
      const records = await TrafficHourly.findAll({
        where: whereClause,
        order: [['recordTime', 'DESC']],
        limit: pageSize,
        offset: offset
      });

      const logs = records.map(record => ({
        id: record.id,
        userId: record.userId,
        port: record.port,
        inputBytes: record.inputBytes,
        outputBytes: record.outputBytes,
        totalBytes: record.totalBytes,
        timestamp: record.recordTime.toISOString(),
        protocol: 'tcp', // 默认协议
        formattedTotal: this.formatBytes(record.totalBytes),
        formattedInput: this.formatBytes(record.inputBytes),
        formattedOutput: this.formatBytes(record.outputBytes)
      }));

      return { logs, total };
    } catch (error) {
      console.error(`❌ 获取用户 ${userId} 流量日志失败:`, error);
      return { logs: [], total: 0 };
    }
  }

  /**
   * 获取流量统计数据
   * @param {number} userId - 用户ID
   * @param {string} startTime - 开始时间 (ISO string)
   * @param {string} endTime - 结束时间 (ISO string)
   * @returns {Promise<Object>} 流量统计数据
   */
  async getTrafficStats(userId, startTime, endTime) {
    if (!this.isConnected) {
      return { totalBytes: 0, inputBytes: 0, outputBytes: 0 };
    }

    try {
      const result = await TrafficHourly.findOne({
        where: {
          userId,
          recordTime: {
            [Op.between]: [new Date(startTime), new Date(endTime)]
          }
        },
        attributes: [
          [models.sequelize.fn('SUM', models.sequelize.col('inputBytes')), 'totalInput'],
          [models.sequelize.fn('SUM', models.sequelize.col('outputBytes')), 'totalOutput'],
          [models.sequelize.fn('SUM', models.sequelize.col('totalBytes')), 'totalBytes']
        ]
      });

      return {
        totalBytes: parseInt(result?.dataValues?.totalBytes) || 0,
        inputBytes: parseInt(result?.dataValues?.totalInput) || 0,
        outputBytes: parseInt(result?.dataValues?.totalOutput) || 0
      };
    } catch (error) {
      console.error(`❌ 获取用户 ${userId} 流量统计失败:`, error);
      return { totalBytes: 0, inputBytes: 0, outputBytes: 0 };
    }
  }

  /**
   * 获取流量图表数据
   * @param {number} userId - 用户ID
   * @param {string} startTime - 开始时间 (ISO string)
   * @param {string} endTime - 结束时间 (ISO string)
   * @param {string} groupBy - 分组方式 ('hour', 'day')
   * @returns {Promise<Object>} 图表数据
   */
  async getTrafficChartData(userId, startTime, endTime, groupBy = 'hour') {
    if (!this.isConnected) {
      return { timestamps: [], inputBytes: [], outputBytes: [] };
    }

    try {
      const stats = await this.getUserTrafficStats(userId, startTime, endTime, groupBy);

      const timestamps = [];
      const inputBytes = [];
      const outputBytes = [];

      stats.forEach(stat => {
        timestamps.push(stat.time);
        inputBytes.push(stat.inputBytes);
        outputBytes.push(stat.outputBytes);
      });

      return { timestamps, inputBytes, outputBytes };
    } catch (error) {
      console.error(`❌ 获取用户 ${userId} 图表数据失败:`, error);
      return { timestamps: [], inputBytes: [], outputBytes: [] };
    }
  }

  /**
   * 格式化字节数显示
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的字符串
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 获取所有用户的流量排行
   * @param {number} limit - 返回数量限制
   * @param {number} days - 统计天数
   * @returns {Promise<Array>} 流量排行数据
   */
  async getTrafficRanking(limit = 10, days = 7) {
    if (!this.isConnected) {
      return [];
    }

    try {
      const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endTime = new Date();

      const results = await TrafficHourly.findAll({
        where: {
          recordTime: {
            [Op.between]: [startTime, endTime]
          }
        },
        attributes: [
          'userId',
          [models.sequelize.fn('SUM', models.sequelize.col('totalBytes')), 'totalBytes']
        ],
        group: ['userId'],
        order: [[models.sequelize.fn('SUM', models.sequelize.col('totalBytes')), 'DESC']],
        limit
      });

      return results.map(result => ({
        userId: result.userId.toString(),
        totalBytes: parseInt(result.dataValues.totalBytes) || 0
      }));
    } catch (error) {
      console.error('❌ 获取流量排行失败:', error);
      return [];
    }
  }

  /**
   * 启动定期清理
   */
  startPeriodicCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(async () => {
      await this.cleanupExpiredData();
    }, this.cleanupInterval);

    console.log(`⏰ 已启动定期数据清理，间隔: ${this.cleanupInterval / 1000 / 60 / 60} 小时`);
  }

  /**
   * 清理过期数据
   */
  async cleanupExpiredData() {
    try {
      console.log('🧹 开始清理过期时序数据...');

      const trafficDeleted = await TrafficHourly.cleanupExpiredData();
      const speedDeleted = await SpeedMinutely.cleanupExpiredData();

      console.log(`✅ 数据清理完成: 流量记录 ${trafficDeleted} 条, 网速记录 ${speedDeleted} 条`);
    } catch (error) {
      console.error('❌ 清理过期数据失败:', error);
    }
  }

  /**
   * 关闭服务
   */
  async close() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    console.log('🔌 SQLite 时序数据服务已关闭');
  }
}

// 创建单例实例
const timeSeriesService = new TimeSeriesService();

module.exports = timeSeriesService;
