/**
 * 配额事件记录服务
 * 记录和管理配额相关的事件和告警
 */

class QuotaEventService {
  constructor() {
    this.events = []; // 内存中的事件记录
    this.maxEvents = 1000; // 最大事件数量
    this.alertThresholds = {
      caution: 80,   // 80%告警
      warning: 90,   // 90%警告
      critical: 100  // 100%严重
    };
  }

  /**
   * 记录配额事件
   * @param {Object} event - 事件信息
   */
  recordEvent(event) {
    const eventRecord = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      ...event
    };

    this.events.unshift(eventRecord);

    // 保持事件数量在限制内
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    console.log(`📝 [配额事件] ${eventRecord.type}: ${eventRecord.message}`);
    return eventRecord;
  }

  /**
   * 记录配额状态变化事件
   * @param {number} userId - 用户ID
   * @param {string} username - 用户名
   * @param {Object} oldStatus - 旧状态
   * @param {Object} newStatus - 新状态
   */
  recordQuotaStatusChange(userId, username, oldStatus, newStatus) {
    const event = {
      type: 'quota_status_change',
      userId,
      username,
      oldStatus: oldStatus ? {
        status: oldStatus.status,
        allowed: oldStatus.allowed,
        usagePercentage: oldStatus.usagePercentage,
        alertLevel: oldStatus.alertLevel
      } : null,
      newStatus: {
        status: newStatus.status,
        allowed: newStatus.allowed,
        usagePercentage: newStatus.usagePercentage,
        alertLevel: newStatus.alertLevel
      },
      message: this.generateStatusChangeMessage(username, oldStatus, newStatus)
    };

    return this.recordEvent(event);
  }

  /**
   * 记录配额告警事件
   * @param {number} userId - 用户ID
   * @param {string} username - 用户名
   * @param {Object} quotaStatus - 配额状态
   */
  recordQuotaAlert(userId, username, quotaStatus) {
    const event = {
      type: 'quota_alert',
      userId,
      username,
      alertLevel: quotaStatus.alertLevel,
      usagePercentage: quotaStatus.usagePercentage,
      usedTraffic: quotaStatus.usedTraffic,
      quotaBytes: quotaStatus.quotaBytes,
      message: this.generateAlertMessage(username, quotaStatus)
    };

    return this.recordEvent(event);
  }

  /**
   * 记录配额重置事件
   * @param {number} userId - 用户ID
   * @param {string} username - 用户名
   * @param {string} reason - 重置原因
   * @param {string} operator - 操作员
   */
  recordQuotaReset(userId, username, reason, operator = 'system') {
    const event = {
      type: 'quota_reset',
      userId,
      username,
      reason,
      operator,
      message: `用户 ${username} 的流量配额已被 ${operator} 重置，原因: ${reason}`
    };

    return this.recordEvent(event);
  }

  /**
   * 记录配额超限事件
   * @param {number} userId - 用户ID
   * @param {string} username - 用户名
   * @param {Object} quotaStatus - 配额状态
   */
  recordQuotaExceeded(userId, username, quotaStatus) {
    const event = {
      type: 'quota_exceeded',
      userId,
      username,
      usagePercentage: quotaStatus.usagePercentage,
      usedTraffic: quotaStatus.usedTraffic,
      quotaBytes: quotaStatus.quotaBytes,
      message: `用户 ${username} 流量配额已超限 (${quotaStatus.usagePercentage}%)，访问已被禁止`
    };

    return this.recordEvent(event);
  }

  /**
   * 生成状态变化消息
   * @param {string} username - 用户名
   * @param {Object} oldStatus - 旧状态
   * @param {Object} newStatus - 新状态
   * @returns {string} 消息
   */
  generateStatusChangeMessage(username, oldStatus, newStatus) {
    if (!oldStatus) {
      return `用户 ${username} 配额状态初始化: ${newStatus.status}`;
    }

    if (oldStatus.allowed !== newStatus.allowed) {
      if (newStatus.allowed) {
        return `用户 ${username} 访问权限已恢复 (${oldStatus.status} -> ${newStatus.status})`;
      } else {
        return `用户 ${username} 访问权限已禁止 (${oldStatus.status} -> ${newStatus.status})`;
      }
    }

    if (oldStatus.alertLevel !== newStatus.alertLevel) {
      return `用户 ${username} 告警级别变化: ${oldStatus.alertLevel} -> ${newStatus.alertLevel} (使用率: ${newStatus.usagePercentage}%)`;
    }

    return `用户 ${username} 配额状态更新: ${newStatus.status} (${newStatus.usagePercentage}%)`;
  }

  /**
   * 生成告警消息
   * @param {string} username - 用户名
   * @param {Object} quotaStatus - 配额状态
   * @returns {string} 消息
   */
  generateAlertMessage(username, quotaStatus) {
    const percentage = quotaStatus.usagePercentage;
    const level = quotaStatus.alertLevel;

    switch (level) {
      case 'critical':
        return `🚨 用户 ${username} 流量配额严重超限 (${percentage}%)`;
      case 'warning':
        return `⚠️ 用户 ${username} 流量配额即将耗尽 (${percentage}%)`;
      case 'caution':
        return `⚡ 用户 ${username} 流量配额使用较高 (${percentage}%)`;
      default:
        return `📊 用户 ${username} 流量配额正常 (${percentage}%)`;
    }
  }

  /**
   * 获取用户的配额事件
   * @param {number} userId - 用户ID
   * @param {number} limit - 限制数量
   * @returns {Array} 事件列表
   */
  getUserEvents(userId, limit = 50) {
    return this.events
      .filter(event => event.userId === userId)
      .slice(0, limit);
  }

  /**
   * 获取所有配额事件
   * @param {number} limit - 限制数量
   * @param {string} type - 事件类型过滤
   * @returns {Array} 事件列表
   */
  getAllEvents(limit = 100, type = null) {
    let filteredEvents = this.events;
    
    if (type) {
      filteredEvents = this.events.filter(event => event.type === type);
    }
    
    return filteredEvents.slice(0, limit);
  }

  /**
   * 获取告警事件
   * @param {string} alertLevel - 告警级别
   * @param {number} limit - 限制数量
   * @returns {Array} 告警事件列表
   */
  getAlertEvents(alertLevel = null, limit = 50) {
    let alertEvents = this.events.filter(event => 
      event.type === 'quota_alert' || 
      event.type === 'quota_exceeded' ||
      event.type === 'quota_status_change'
    );

    if (alertLevel) {
      alertEvents = alertEvents.filter(event => event.alertLevel === alertLevel);
    }

    return alertEvents.slice(0, limit);
  }

  /**
   * 清理旧事件
   * @param {number} maxAge - 最大年龄（毫秒）
   */
  cleanupOldEvents(maxAge = 7 * 24 * 60 * 60 * 1000) { // 默认7天
    const cutoffTime = Date.now() - maxAge;
    const initialCount = this.events.length;
    
    this.events = this.events.filter(event => {
      const eventTime = new Date(event.timestamp).getTime();
      return eventTime > cutoffTime;
    });

    const removedCount = initialCount - this.events.length;
    if (removedCount > 0) {
      console.log(`🧹 [配额事件] 清理了 ${removedCount} 个旧事件`);
    }
  }

  /**
   * 生成事件ID
   * @returns {string} 事件ID
   */
  generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取事件统计信息
   * @returns {Object} 统计信息
   */
  getEventStats() {
    const stats = {
      totalEvents: this.events.length,
      eventsByType: {},
      eventsByAlertLevel: {},
      recentEvents: this.events.slice(0, 10).length
    };

    // 按类型统计
    this.events.forEach(event => {
      stats.eventsByType[event.type] = (stats.eventsByType[event.type] || 0) + 1;
      
      if (event.alertLevel) {
        stats.eventsByAlertLevel[event.alertLevel] = (stats.eventsByAlertLevel[event.alertLevel] || 0) + 1;
      }
    });

    return stats;
  }
}

module.exports = new QuotaEventService();
