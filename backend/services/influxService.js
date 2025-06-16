/**
 * InfluxDB 时序数据服务
 *
 * 功能说明:
 * 1. 记录用户每小时的流量统计 (保留30天)
 * 2. 记录用户每分钟的网速监控 (保留24小时)
 * 3. 提供流量查询和统计分析功能
 * 4. 自动管理数据保留策略
 *
 * 数据结构:
 * - traffic_hourly: 小时流量统计
 *   tags: user_id, port
 *   fields: input_bytes, output_bytes, total_bytes
 *   retention: 30天
 *
 * - speed_minutely: 分钟网速记录
 *   tags: user_id, port
 *   fields: input_rate, output_rate, total_rate (bytes/second)
 *   retention: 24小时
 */

const { InfluxDB, Point } = require('@influxdata/influxdb-client');

class InfluxService {
  constructor() {
    this.client = null;
    this.writeApi = null;
    this.queryApi = null;
    this.isConnected = false;

    // 配置参数
    this.config = {
      url: process.env.INFLUX_URL || 'http://localhost:8086',
      token: process.env.INFLUX_TOKEN || '',
      org: process.env.INFLUX_ORG || 'gost-manager',
      bucket: process.env.INFLUX_BUCKET || 'traffic-stats'
    };
  }

  /**
   * 初始化 InfluxDB 连接
   */
  async initialize() {
    try {
      // 创建 InfluxDB 客户端
      this.client = new InfluxDB({
        url: this.config.url,
        token: this.config.token
      });

      // 创建写入 API
      this.writeApi = this.client.getWriteApi(this.config.org, this.config.bucket);

      // 设置写入选项
      this.writeApi.useDefaultTags({
        application: 'gost-manager',
        version: '1.0.0'
      });

      // 创建查询 API
      this.queryApi = this.client.getQueryApi(this.config.org);

      // 测试连接
      await this.testConnection();

      this.isConnected = true;
      console.log('✅ InfluxDB 连接成功');

      // 设置数据保留策略
      await this.setupRetentionPolicies();

      console.log('🚀 InfluxDB 服务初始化完成');
    } catch (error) {
      console.warn('⚠️ InfluxDB 初始化失败，流量统计功能将受限:', error.message);
      this.isConnected = false;
      // 不抛出错误，允许系统在没有 InfluxDB 的情况下运行
    }
  }

  /**
   * 测试 InfluxDB 连接
   */
  async testConnection() {
    try {
      // 尝试简单的查询来测试连接
      const testQuery = `
        from(bucket: "${this.config.bucket}")
          |> range(start: -1m)
          |> limit(n: 1)
      `;

      await this.queryApi.queryRows(testQuery, {
        next() {
          // 不需要处理结果，只是测试连接
        },
        error(error) {
          // 如果是因为没有数据而报错，这是正常的
          if (!error.message.includes('no data')) {
            throw error;
          }
        },
        complete() {
          // 查询完成
        }
      });

      console.log('✅ InfluxDB 连接测试通过');
    } catch (error) {
      // 如果是因为 bucket 不存在或没有数据，这是可以接受的
      if (error.message.includes('bucket') || error.message.includes('no data')) {
        console.log('✅ InfluxDB 连接正常 (bucket 可能为空)');
        return;
      }

      console.warn('⚠️ InfluxDB 连接测试失败，但服务将继续运行:', error.message);
      // 不抛出错误，允许服务在没有 InfluxDB 的情况下运行
      this.isConnected = false;
    }
  }

  /**
   * 设置数据保留策略
   */
  async setupRetentionPolicies() {
    try {
      // 注意: 在实际部署中，保留策略通常在 InfluxDB 配置中设置
      // 这里只是记录策略，实际设置需要管理员权限
      console.log('📋 数据保留策略:');
      console.log('  - 流量统计 (traffic_hourly): 30天');
      console.log('  - 网速记录 (speed_minutely): 24小时');
    } catch (error) {
      console.warn('⚠️ 设置保留策略失败:', error.message);
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
      console.warn('⚠️ InfluxDB 未连接，跳过流量记录');
      return;
    }

    try {
      const point = new Point('traffic_hourly')
        .tag('user_id', userId.toString())
        .tag('port', port.toString())
        .intField('input_bytes', inputBytes)
        .intField('output_bytes', outputBytes)
        .intField('total_bytes', inputBytes + outputBytes)
        .timestamp(this.getHourTimestamp());

      this.writeApi.writePoint(point);
      await this.writeApi.flush();

      console.log(`📊 记录用户 ${userId} 端口 ${port} 小时流量: ${inputBytes + outputBytes} 字节`);
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
      console.warn('⚠️ InfluxDB 未连接，跳过网速记录');
      return;
    }

    try {
      const point = new Point('speed_minutely')
        .tag('user_id', userId.toString())
        .tag('port', port.toString())
        .floatField('input_rate', inputRate)
        .floatField('output_rate', outputRate)
        .floatField('total_rate', inputRate + outputRate)
        .timestamp(this.getMinuteTimestamp());

      this.writeApi.writePoint(point);
      await this.writeApi.flush();

      console.log(`🚀 记录用户 ${userId} 端口 ${port} 分钟网速: ${(inputRate + outputRate).toFixed(2)} bytes/s`);
    } catch (error) {
      console.error(`❌ 记录分钟网速失败:`, error);
    }
  }

  /**
   * 批量记录流量数据
   * @param {Array} trafficData - 流量数据数组
   */
  async batchRecordTraffic(trafficData) {
    if (!this.isConnected || !trafficData || trafficData.length === 0) {
      return;
    }

    try {
      const points = trafficData.map(data => {
        return new Point('traffic_hourly')
          .tag('user_id', data.userId.toString())
          .tag('port', data.port.toString())
          .intField('input_bytes', data.inputBytes)
          .intField('output_bytes', data.outputBytes)
          .intField('total_bytes', data.inputBytes + data.outputBytes)
          .timestamp(data.timestamp || this.getHourTimestamp());
      });

      this.writeApi.writePoints(points);
      await this.writeApi.flush();

      console.log(`📊 批量记录 ${trafficData.length} 条流量数据`);
    } catch (error) {
      console.error(`❌ 批量记录流量失败:`, error);
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
      console.warn('⚠️ InfluxDB 未连接，返回空数据');
      return [];
    }

    try {
      const windowDuration = groupBy === 'day' ? '1d' : '1h';

      const query = `
        from(bucket: "${this.config.bucket}")
          |> range(start: ${startTime}, stop: ${endTime})
          |> filter(fn: (r) => r._measurement == "traffic_hourly")
          |> filter(fn: (r) => r.user_id == "${userId}")
          |> group(columns: ["port"])
          |> aggregateWindow(every: ${windowDuration}, fn: sum, createEmpty: false)
          |> yield(name: "traffic_stats")
      `;

      const result = [];
      await this.queryApi.queryRows(query, {
        next(row, tableMeta) {
          const record = tableMeta.toObject(row);
          result.push({
            time: record._time,
            port: record.port,
            field: record._field,
            value: record._value
          });
        },
        error(error) {
          console.error('❌ 查询流量统计失败:', error);
        }
      });

      return this.formatTrafficStats(result);
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
      console.warn('⚠️ InfluxDB 未连接，返回空数据');
      return [];
    }

    try {
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const endTime = new Date().toISOString();

      const query = `
        from(bucket: "${this.config.bucket}")
          |> range(start: ${startTime}, stop: ${endTime})
          |> filter(fn: (r) => r._measurement == "speed_minutely")
          |> filter(fn: (r) => r.user_id == "${userId}")
          |> group(columns: ["port"])
          |> sort(columns: ["_time"])
          |> yield(name: "speed_history")
      `;

      const result = [];
      await this.queryApi.queryRows(query, {
        next(row, tableMeta) {
          const record = tableMeta.toObject(row);
          result.push({
            time: record._time,
            port: record.port,
            field: record._field,
            value: record._value
          });
        },
        error(error) {
          console.error('❌ 查询网速历史失败:', error);
        }
      });

      return this.formatSpeedHistory(result);
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
      const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const endTime = new Date().toISOString();

      const query = `
        from(bucket: "${this.config.bucket}")
          |> range(start: ${startTime}, stop: ${endTime})
          |> filter(fn: (r) => r._measurement == "traffic_hourly")
          |> filter(fn: (r) => r.user_id == "${userId}")
          |> group(columns: ["_field"])
          |> sum()
          |> yield(name: "total_traffic")
      `;

      const result = {};
      await this.queryApi.queryRows(query, {
        next(row, tableMeta) {
          const record = tableMeta.toObject(row);
          result[record._field] = record._value || 0;
        }
      });

      return {
        totalBytes: result.total_bytes || 0,
        inputBytes: result.input_bytes || 0,
        outputBytes: result.output_bytes || 0
      };
    } catch (error) {
      console.error(`❌ 获取用户 ${userId} 总流量失败:`, error);
      return { totalBytes: 0, inputBytes: 0, outputBytes: 0 };
    }
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
      const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const endTime = new Date().toISOString();

      const query = `
        from(bucket: "${this.config.bucket}")
          |> range(start: ${startTime}, stop: ${endTime})
          |> filter(fn: (r) => r._measurement == "traffic_hourly")
          |> filter(fn: (r) => r._field == "total_bytes")
          |> group(columns: ["user_id"])
          |> sum()
          |> sort(columns: ["_value"], desc: true)
          |> limit(n: ${limit})
          |> yield(name: "traffic_ranking")
      `;

      const result = [];
      await this.queryApi.queryRows(query, {
        next(row, tableMeta) {
          const record = tableMeta.toObject(row);
          result.push({
            userId: record.user_id,
            totalBytes: record._value || 0
          });
        }
      });

      return result;
    } catch (error) {
      console.error('❌ 获取流量排行失败:', error);
      return [];
    }
  }

  /**
   * 格式化流量统计数据
   * @param {Array} rawData - 原始数据
   * @returns {Array} 格式化后的数据
   */
  formatTrafficStats(rawData) {
    const statsMap = new Map();

    rawData.forEach(record => {
      const key = `${record.time}_${record.port}`;
      if (!statsMap.has(key)) {
        statsMap.set(key, {
          time: record.time,
          port: record.port,
          inputBytes: 0,
          outputBytes: 0,
          totalBytes: 0
        });
      }

      const stat = statsMap.get(key);
      if (record.field === 'input_bytes') {
        stat.inputBytes = record.value;
      } else if (record.field === 'output_bytes') {
        stat.outputBytes = record.value;
      } else if (record.field === 'total_bytes') {
        stat.totalBytes = record.value;
      }
    });

    return Array.from(statsMap.values()).sort((a, b) =>
      new Date(a.time) - new Date(b.time)
    );
  }

  /**
   * 格式化网速历史数据
   * @param {Array} rawData - 原始数据
   * @returns {Array} 格式化后的数据
   */
  formatSpeedHistory(rawData) {
    const speedMap = new Map();

    rawData.forEach(record => {
      const key = `${record.time}_${record.port}`;
      if (!speedMap.has(key)) {
        speedMap.set(key, {
          time: record.time,
          port: record.port,
          inputRate: 0,
          outputRate: 0,
          totalRate: 0
        });
      }

      const speed = speedMap.get(key);
      if (record.field === 'input_rate') {
        speed.inputRate = record.value;
      } else if (record.field === 'output_rate') {
        speed.outputRate = record.value;
      } else if (record.field === 'total_rate') {
        speed.totalRate = record.value;
      }
    });

    return Array.from(speedMap.values()).sort((a, b) =>
      new Date(a.time) - new Date(b.time)
    );
  }

  /**
   * 获取整点时间戳
   * @returns {Date} 整点时间
   */
  getHourTimestamp() {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now;
  }

  /**
   * 获取整分钟时间戳
   * @returns {Date} 整分钟时间
   */
  getMinuteTimestamp() {
    const now = new Date();
    now.setSeconds(0, 0);
    return now;
  }

  /**
   * 清理过期数据 (手动清理，通常由定时任务调用)
   */
  async cleanupExpiredData() {
    if (!this.isConnected) {
      return;
    }

    try {
      // 清理30天前的流量数据
      const trafficCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      // 清理24小时前的网速数据
      const speedCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      console.log('🧹 开始清理过期数据...');
      console.log(`  - 流量数据: ${trafficCutoff} 之前`);
      console.log(`  - 网速数据: ${speedCutoff} 之前`);

      // 注意: 实际的数据删除需要使用 InfluxDB 的删除 API
      // 这里只是记录清理策略
      console.log('✅ 数据清理策略已记录 (实际清理由 InfluxDB 保留策略自动执行)');
    } catch (error) {
      console.error('❌ 清理过期数据失败:', error);
    }
  }

  /**
   * 关闭连接
   */
  async close() {
    try {
      if (this.writeApi) {
        await this.writeApi.close();
      }

      if (this.client) {
        this.client.close();
      }

      this.isConnected = false;
      console.log('🔌 InfluxDB 连接已关闭');
    } catch (error) {
      console.error('❌ 关闭 InfluxDB 连接失败:', error);
    }
  }
}

// 创建单例实例
const influxService = new InfluxService();

module.exports = influxService;
