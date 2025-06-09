/**
 * 流量统计模型 - 基于 SQLite 的时序数据存储
 * 
 * 功能说明:
 * 1. 存储用户小时级流量统计 (保留30天)
 * 2. 存储用户分钟级网速记录 (保留24小时)
 * 3. 使用 SQLite 原生时间函数优化查询
 * 4. 自动清理过期数据
 * 
 * 表结构设计:
 * - traffic_hourly: 小时流量统计
 * - speed_minutely: 分钟网速记录
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  // 小时流量统计表
  const TrafficHourly = sequelize.define('TrafficHourly', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '用户ID'
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '端口号'
    },
    inputBytes: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      allowNull: false,
      comment: '输入字节数'
    },
    outputBytes: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      allowNull: false,
      comment: '输出字节数'
    },
    totalBytes: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      allowNull: false,
      comment: '总字节数'
    },
    recordHour: {
      type: DataTypes.STRING(13), // 格式: 2024-01-15-10
      allowNull: false,
      comment: '记录小时 (YYYY-MM-DD-HH)'
    },
    recordTime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '记录时间'
    }
  }, {
    tableName: 'traffic_hourly',
    timestamps: true,
    indexes: [
      {
        name: 'idx_traffic_hourly_user_time',
        fields: ['userId', 'recordTime']
      },
      {
        name: 'idx_traffic_hourly_user_hour',
        fields: ['userId', 'recordHour']
      },
      {
        name: 'idx_traffic_hourly_port',
        fields: ['port']
      },
      {
        name: 'idx_traffic_hourly_time',
        fields: ['recordTime']
      },
      {
        unique: true,
        name: 'unique_user_port_hour',
        fields: ['userId', 'port', 'recordHour']
      }
    ]
  });

  // 分钟网速记录表
  const SpeedMinutely = sequelize.define('SpeedMinutely', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '用户ID'
    },
    port: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '端口号'
    },
    inputRate: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      allowNull: false,
      comment: '输入速率 (bytes/second)'
    },
    outputRate: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      allowNull: false,
      comment: '输出速率 (bytes/second)'
    },
    totalRate: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      allowNull: false,
      comment: '总速率 (bytes/second)'
    },
    recordMinute: {
      type: DataTypes.STRING(16), // 格式: 2024-01-15-10:30
      allowNull: false,
      comment: '记录分钟 (YYYY-MM-DD-HH:MM)'
    },
    recordTime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: '记录时间'
    }
  }, {
    tableName: 'speed_minutely',
    timestamps: true,
    indexes: [
      {
        name: 'idx_speed_minutely_user_time',
        fields: ['userId', 'recordTime']
      },
      {
        name: 'idx_speed_minutely_user_minute',
        fields: ['userId', 'recordMinute']
      },
      {
        name: 'idx_speed_minutely_port',
        fields: ['port']
      },
      {
        name: 'idx_speed_minutely_time',
        fields: ['recordTime']
      },
      {
        unique: true,
        name: 'unique_user_port_minute',
        fields: ['userId', 'port', 'recordMinute']
      }
    ]
  });

  // 添加模型方法
  TrafficHourly.prototype.formatBytes = function() {
    return {
      input: this.formatBytesValue(this.inputBytes),
      output: this.formatBytesValue(this.outputBytes),
      total: this.formatBytesValue(this.totalBytes)
    };
  };

  TrafficHourly.prototype.formatBytesValue = function(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  SpeedMinutely.prototype.formatSpeed = function() {
    return {
      input: this.formatSpeedValue(this.inputRate),
      output: this.formatSpeedValue(this.outputRate),
      total: this.formatSpeedValue(this.totalRate)
    };
  };

  SpeedMinutely.prototype.formatSpeedValue = function(rate) {
    if (rate === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(rate) / Math.log(k));
    return parseFloat((rate / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 静态方法：生成时间键
  TrafficHourly.generateHourKey = function(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    return `${year}-${month}-${day}-${hour}`;
  };

  SpeedMinutely.generateMinuteKey = function(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}-${hour}:${minute}`;
  };

  // 静态方法：清理过期数据
  TrafficHourly.cleanupExpiredData = async function() {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30天前
    const deletedCount = await this.destroy({
      where: {
        recordTime: {
          [sequelize.Op.lt]: cutoffDate
        }
      }
    });
    console.log(`🧹 清理了 ${deletedCount} 条过期的小时流量记录`);
    return deletedCount;
  };

  SpeedMinutely.cleanupExpiredData = async function() {
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24小时前
    const deletedCount = await this.destroy({
      where: {
        recordTime: {
          [sequelize.Op.lt]: cutoffDate
        }
      }
    });
    console.log(`🧹 清理了 ${deletedCount} 条过期的分钟网速记录`);
    return deletedCount;
  };

  return {
    TrafficHourly,
    SpeedMinutely
  };
};
