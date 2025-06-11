const { models } = require('./dbService');
const { TrafficLog, User, ForwardRule } = models;
const { Op } = require('sequelize');

class TrafficService {
  async logTraffic(data) {
    try {
      // 检查用户流量限额
      const user = await User.findByPk(data.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // 如果用户有流量限额，检查是否超额
      if (user.trafficQuota !== null) {
        // 获取用户当月流量使用情况
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const monthlyTraffic = await TrafficLog.findOne({
          attributes: [
            [models.sequelize.fn('SUM', models.sequelize.col('bytesIn')), 'totalBytesIn'],
            [models.sequelize.fn('SUM', models.sequelize.col('bytesOut')), 'totalBytesOut']
          ],
          where: {
            userId: data.userId,
            timestamp: {
              [Op.gte]: startOfMonth
            }
          }
        });

        const currentUsage = monthlyTraffic ?
          (monthlyTraffic.get('totalBytesIn') + monthlyTraffic.get('totalBytesOut')) / (1024 * 1024 * 1024) : 0;
        const newUsage = currentUsage + (data.bytesIn + data.bytesOut) / (1024 * 1024 * 1024);

        if (newUsage > user.trafficQuota) {
          throw new Error('已超出流量限额');
        }
      }

      // 记录流量
      const trafficLog = await TrafficLog.create(data);
      await this.checkTrafficLimit(data.userId);
      return trafficLog;
    } catch (error) {
      throw new Error(`Failed to log traffic: ${error.message}`);
    }
  }

  async getTrafficStats(userId, period = 'day') {
    try {
      const now = new Date();
      let startDate;

      switch (period) {
        case 'day':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          startDate = new Date(now.setHours(0, 0, 0, 0));
      }

      const logs = await TrafficLog.findAll({
        where: {
          userId,
          timestamp: {
            [Op.gte]: startDate
          }
        },
        include: [{
          model: ForwardRule,
          as: 'rule',
          attributes: ['name', 'sourcePort', 'targetHost', 'targetPort']
        }]
      });

      const stats = {
        totalBytesIn: 0,
        totalBytesOut: 0,
        byRule: {}
      };

      logs.forEach(log => {
        stats.totalBytesIn += log.bytesIn;
        stats.totalBytesOut += log.bytesOut;

        if (!stats.byRule[log.ruleId]) {
          stats.byRule[log.ruleId] = {
            ruleName: log.rule.name,
            sourcePort: log.rule.sourcePort,
            targetHost: log.rule.targetHost,
            targetPort: log.rule.targetPort,
            bytesIn: 0,
            bytesOut: 0
          };
        }

        stats.byRule[log.ruleId].bytesIn += log.bytesIn;
        stats.byRule[log.ruleId].bytesOut += log.bytesOut;
      });

      return stats;
    } catch (error) {
      throw new Error(`Failed to get traffic stats: ${error.message}`);
    }
  }

  async checkTrafficLimit(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user || !user.trafficLimit) {
        return true;
      }

      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthlyTraffic = await TrafficLog.sum('bytesIn', {
        where: {
          userId,
          timestamp: {
            [Op.gte]: monthStart
          }
        }
      }) || 0;

      if (monthlyTraffic >= user.trafficLimit) {
        // 使用配额强制执行服务来禁用规则，而不是直接修改数据库
        try {
          const { quotaEnforcementService } = require('./quotaEnforcementService');
          await quotaEnforcementService.checkUserQuotaEnforcement(userId);
        } catch (error) {
          console.error('触发配额强制执行失败:', error);
          // 作为备用方案，直接禁用规则
          await ForwardRule.update(
            { isActive: false },
            { where: { userId } }
          );
        }
        return false;
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to check traffic limit: ${error.message}`);
    }
  }

  async getTopUsers(period = 'day', limit = 10) {
    try {
      const now = new Date();
      let startDate;

      switch (period) {
        case 'day':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          break;
        default:
          startDate = new Date(now.setHours(0, 0, 0, 0));
      }

      const topUsers = await TrafficLog.findAll({
        attributes: [
          'userId',
          [models.sequelize.fn('SUM', models.sequelize.col('bytesIn')), 'totalBytesIn'],
          [models.sequelize.fn('SUM', models.sequelize.col('bytesOut')), 'totalBytesOut']
        ],
        where: {
          timestamp: {
            [Op.gte]: startDate
          }
        },
        include: [{
          model: User,
          as: 'user',
          attributes: ['username', 'email']
        }],
        group: ['userId', 'user.id'],
        order: [[models.sequelize.fn('SUM', models.sequelize.col('bytesIn')), 'DESC']],
        limit
      });

      return topUsers;
    } catch (error) {
      throw new Error(`Failed to get top users: ${error.message}`);
    }
  }
}

module.exports = new TrafficService();