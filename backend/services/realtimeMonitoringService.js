/**
 * 实时监控服务
 * 提供WebSocket连接，实时推送配额状态、流量统计等信息
 */

const WebSocket = require('ws');
const quotaManagementService = require('./quotaManagementService');
const { quotaEnforcementService } = require('./quotaEnforcementService');

class RealtimeMonitoringService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // 存储客户端连接信息
    this.broadcastInterval = null;
    this.broadcastIntervalMs = 10000; // 10秒广播一次
    this.isRunning = false;
  }

  /**
   * 初始化WebSocket服务器
   */
  initialize(server) {
    try {
      this.wss = new WebSocket.Server({ 
        server,
        path: '/ws/monitoring'
      });

      this.wss.on('connection', (ws, req) => {
        this.handleConnection(ws, req);
      });

      console.log('🔄 [实时监控] WebSocket服务已启动，路径: /ws/monitoring');
      this.startBroadcast();
      this.isRunning = true;

    } catch (error) {
      console.error('❌ [实时监控] WebSocket服务启动失败:', error);
    }
  }

  /**
   * 处理新的WebSocket连接
   */
  handleConnection(ws, req) {
    const clientId = this.generateClientId();
    const clientInfo = {
      id: clientId,
      ws: ws,
      ip: req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      connectedAt: new Date(),
      isAlive: true,
      subscriptions: new Set() // 客户端订阅的数据类型
    };

    this.clients.set(clientId, clientInfo);
    console.log(`🔗 [实时监控] 新客户端连接: ${clientId} (${clientInfo.ip})`);

    // 发送欢迎消息
    this.sendToClient(clientId, {
      type: 'welcome',
      clientId: clientId,
      timestamp: new Date().toISOString(),
      availableSubscriptions: [
        'quota-status',
        'traffic-stats',
        'enforcement-status',
        'system-stats'
      ]
    });

    // 设置心跳检测
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // 处理客户端消息
    ws.on('message', (message) => {
      this.handleClientMessage(clientId, message);
    });

    // 处理连接关闭
    ws.on('close', () => {
      this.handleDisconnection(clientId);
    });

    // 处理连接错误
    ws.on('error', (error) => {
      console.error(`❌ [实时监控] 客户端 ${clientId} 连接错误:`, error);
      this.handleDisconnection(clientId);
    });
  }

  /**
   * 处理客户端消息
   */
  handleClientMessage(clientId, message) {
    try {
      const data = JSON.parse(message);
      const client = this.clients.get(clientId);
      
      if (!client) return;

      switch (data.type) {
        case 'subscribe':
          this.handleSubscription(clientId, data.subscriptions);
          break;
        case 'unsubscribe':
          this.handleUnsubscription(clientId, data.subscriptions);
          break;
        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
          break;
        default:
          console.log(`📨 [实时监控] 客户端 ${clientId} 未知消息类型: ${data.type}`);
      }
    } catch (error) {
      console.error(`❌ [实时监控] 处理客户端 ${clientId} 消息失败:`, error);
    }
  }

  /**
   * 处理订阅请求
   */
  handleSubscription(clientId, subscriptions) {
    const client = this.clients.get(clientId);
    if (!client) return;

    subscriptions.forEach(sub => {
      client.subscriptions.add(sub);
    });

    console.log(`📡 [实时监控] 客户端 ${clientId} 订阅: ${Array.from(client.subscriptions).join(', ')}`);

    this.sendToClient(clientId, {
      type: 'subscription-confirmed',
      subscriptions: Array.from(client.subscriptions),
      timestamp: new Date().toISOString()
    });

    // 立即发送当前数据
    this.sendCurrentData(clientId);
  }

  /**
   * 处理取消订阅请求
   */
  handleUnsubscription(clientId, subscriptions) {
    const client = this.clients.get(clientId);
    if (!client) return;

    subscriptions.forEach(sub => {
      client.subscriptions.delete(sub);
    });

    console.log(`📡 [实时监控] 客户端 ${clientId} 取消订阅: ${subscriptions.join(', ')}`);

    this.sendToClient(clientId, {
      type: 'unsubscription-confirmed',
      subscriptions: Array.from(client.subscriptions),
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 发送当前数据给指定客户端
   */
  async sendCurrentData(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      for (const subscription of client.subscriptions) {
        const data = await this.getCurrentData(subscription);
        if (data) {
          this.sendToClient(clientId, {
            type: 'data',
            subscription: subscription,
            data: data,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error(`❌ [实时监控] 发送当前数据给客户端 ${clientId} 失败:`, error);
    }
  }

  /**
   * 获取指定类型的当前数据
   */
  async getCurrentData(type) {
    try {
      switch (type) {
        case 'quota-status':
          return await quotaManagementService.getAllUsersQuotaStatus();
        case 'traffic-stats':
          return await quotaManagementService.getQuotaStatistics();
        case 'enforcement-status':
          return quotaEnforcementService.getStatus();
        case 'system-stats':
          return {
            quotaManagement: quotaManagementService.getQuotaStats(),
            quotaEnforcement: quotaEnforcementService.getStatus(),
            monitoring: {
              connectedClients: this.clients.size,
              isRunning: this.isRunning,
              broadcastInterval: this.broadcastIntervalMs
            }
          };
        default:
          return null;
      }
    } catch (error) {
      console.error(`❌ [实时监控] 获取 ${type} 数据失败:`, error);
      return null;
    }
  }

  /**
   * 处理客户端断开连接
   */
  handleDisconnection(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      console.log(`🔌 [实时监控] 客户端断开连接: ${clientId} (连接时长: ${Date.now() - client.connectedAt.getTime()}ms)`);
      this.clients.delete(clientId);
    }
  }

  /**
   * 发送消息给指定客户端
   */
  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(data));
      } catch (error) {
        console.error(`❌ [实时监控] 发送消息给客户端 ${clientId} 失败:`, error);
        this.handleDisconnection(clientId);
      }
    }
  }

  /**
   * 广播消息给所有订阅了指定类型的客户端
   */
  async broadcastToSubscribers(subscriptionType, data) {
    const message = {
      type: 'data',
      subscription: subscriptionType,
      data: data,
      timestamp: new Date().toISOString()
    };

    for (const [clientId, client] of this.clients) {
      if (client.subscriptions.has(subscriptionType)) {
        this.sendToClient(clientId, message);
      }
    }
  }

  /**
   * 启动定期广播
   */
  startBroadcast() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }

    this.broadcastInterval = setInterval(async () => {
      await this.performBroadcast();
    }, this.broadcastIntervalMs);

    console.log(`📡 [实时监控] 定期广播已启动，间隔: ${this.broadcastIntervalMs / 1000}秒`);
  }

  /**
   * 执行广播
   */
  async performBroadcast() {
    try {
      // 检查客户端连接状态
      this.checkClientConnections();

      if (this.clients.size === 0) {
        return; // 没有客户端连接，跳过广播
      }

      // 收集所有订阅类型
      const allSubscriptions = new Set();
      for (const client of this.clients.values()) {
        for (const sub of client.subscriptions) {
          allSubscriptions.add(sub);
        }
      }

      // 为每种订阅类型获取数据并广播
      for (const subscription of allSubscriptions) {
        const data = await this.getCurrentData(subscription);
        if (data) {
          await this.broadcastToSubscribers(subscription, data);
        }
      }

    } catch (error) {
      console.error('❌ [实时监控] 执行广播失败:', error);
    }
  }

  /**
   * 检查客户端连接状态
   */
  checkClientConnections() {
    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) {
        this.handleDisconnection(clientId);
      } else {
        // 发送心跳检测
        if (client.ws.isAlive === false) {
          this.handleDisconnection(clientId);
        } else {
          client.ws.isAlive = false;
          client.ws.ping();
        }
      }
    }
  }

  /**
   * 生成客户端ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 停止服务
   */
  stop() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    this.clients.clear();
    this.isRunning = false;
    console.log('🛑 [实时监控] 服务已停止');
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      connectedClients: this.clients.size,
      broadcastInterval: this.broadcastIntervalMs,
      clients: Array.from(this.clients.values()).map(client => ({
        id: client.id,
        ip: client.ip,
        connectedAt: client.connectedAt,
        subscriptions: Array.from(client.subscriptions)
      }))
    };
  }
}

// 创建单例实例
const realtimeMonitoringService = new RealtimeMonitoringService();

module.exports = { realtimeMonitoringService };
