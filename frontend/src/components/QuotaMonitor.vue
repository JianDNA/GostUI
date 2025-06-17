<template>
  <div class="quota-monitor">
    <div class="monitor-header">
      <h2>配额监控</h2>
      <div class="connection-status">
        <span :class="['status-indicator', connectionStatus]"></span>
        {{ connectionStatusText }}
      </div>
    </div>

    <!-- 统计概览 -->
    <div class="stats-overview" v-if="statistics">
      <div class="stat-card">
        <h3>总用户数</h3>
        <div class="stat-value">{{ statistics.totalUsers }}</div>
      </div>
      <div class="stat-card">
        <h3>活跃用户</h3>
        <div class="stat-value">{{ statistics.activeUsers }}</div>
      </div>
      <div class="stat-card">
        <h3>超配额用户</h3>
        <div class="stat-value danger">{{ statistics.quotaExceededUsers }}</div>
      </div>
      <div class="stat-card">
        <h3>无限制用户</h3>
        <div class="stat-value">{{ statistics.unlimitedUsers }}</div>
      </div>
    </div>

    <!-- 用户配额状态列表 -->
    <div class="quota-list">
      <h3>用户配额状态</h3>
      <div class="list-controls">
        <input 
          v-model="searchQuery" 
          placeholder="搜索用户..." 
          class="search-input"
        />
        <select v-model="statusFilter" class="status-filter">
          <option value="">所有状态</option>
          <option value="normal">正常</option>
          <option value="warning">警告</option>
          <option value="quota_exceeded">超配额</option>
          <option value="unlimited">无限制</option>
        </select>
      </div>

      <div class="quota-table">
        <div class="table-header">
          <div class="col-user">用户</div>
          <div class="col-quota">配额</div>
          <div class="col-used">已用</div>
          <div class="col-remaining">剩余</div>
          <div class="col-percentage">使用率</div>
          <div class="col-status">状态</div>
          <div class="col-rules">规则</div>
          <div class="col-actions">操作</div>
        </div>

        <div 
          v-for="user in filteredUsers" 
          :key="user.userId"
          class="table-row"
          :class="{ 'quota-exceeded': !user.allowed }"
        >
          <div class="col-user">
            <strong>{{ user.username }}</strong>
            <small>ID: {{ user.userId }}</small>
          </div>
          <div class="col-quota">
            {{ user.role === 'admin' ? '无限制' : formatBytes(user.trafficQuota) }}
          </div>
          <div class="col-used">
            {{ formatBytes(user.usedTraffic) }}
          </div>
          <div class="col-remaining">
            {{ user.role === 'admin' ? '无限制' : formatBytes(user.remainingTraffic) }}
          </div>
          <div class="col-percentage">
            <div class="progress-bar" v-if="user.role !== 'admin'">
              <div
                class="progress-fill"
                :style="{ width: Math.min(user.usagePercentage, 100) + '%' }"
                :class="getProgressClass(user.usagePercentage)"
              ></div>
            </div>
            <span v-if="user.role === 'admin'" class="admin-badge">管理员</span>
            <span v-else>{{ user.usagePercentage.toFixed(1) }}%</span>
          </div>
          <div class="col-status">
            <span :class="['status-badge', user.role === 'admin' ? 'unlimited' : user.quotaStatus]">
              {{ user.role === 'admin' ? '无限制' : getStatusText(user.quotaStatus) }}
            </span>
          </div>
          <div class="col-rules">
            {{ user.activeRulesCount }}/{{ user.totalRulesCount }}
          </div>
          <div class="col-actions">
            <button
              v-if="user.role !== 'admin'"
              @click="resetUserQuota(user.userId)"
              class="btn-reset"
              :disabled="loading"
            >
              重置
            </button>
            <span v-else class="admin-note">管理员</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 强制执行状态 -->
    <div class="enforcement-status" v-if="enforcementStatus">
      <h3>配额强制执行状态</h3>
      <div class="enforcement-info">
        <div class="info-item">
          <label>服务状态:</label>
          <span :class="['status', enforcementStatus.isRunning ? 'running' : 'stopped']">
            {{ enforcementStatus.isRunning ? '运行中' : '已停止' }}
          </span>
        </div>
        <div class="info-item">
          <label>检查间隔:</label>
          <span>{{ enforcementStatus.checkInterval / 1000 }}秒</span>
        </div>
        <div class="info-item">
          <label>禁用规则数:</label>
          <span>{{ enforcementStatus.disabledRulesCount }}</span>
        </div>
        <div class="info-item">
          <button @click="manualEnforcementCheck" class="btn-check" :disabled="loading">
            手动检查
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'QuotaMonitor',
  data() {
    return {
      ws: null,
      connectionStatus: 'disconnected',
      quotaStatuses: [],
      statistics: null,
      enforcementStatus: null,
      searchQuery: '',
      statusFilter: '',
      loading: false
    }
  },
  computed: {
    connectionStatusText() {
      switch (this.connectionStatus) {
        case 'connected': return '已连接';
        case 'connecting': return '连接中...';
        case 'disconnected': return '未连接';
        case 'error': return '连接错误';
        default: return '未知状态';
      }
    },
    filteredUsers() {
      let users = this.quotaStatuses;
      
      // 搜索过滤
      if (this.searchQuery) {
        const query = this.searchQuery.toLowerCase();
        users = users.filter(user => 
          user.username.toLowerCase().includes(query) ||
          user.userId.toString().includes(query)
        );
      }
      
      // 状态过滤
      if (this.statusFilter) {
        users = users.filter(user => user.quotaStatus === this.statusFilter);
      }
      
      return users;
    }
  },
  mounted() {
    this.connectWebSocket();
  },
  beforeDestroy() {
    this.disconnectWebSocket();
  },
  methods: {
    connectWebSocket() {
      try {
        this.connectionStatus = 'connecting';
        const wsUrl = `ws://${window.location.host}/ws/monitoring`;
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
          console.log('WebSocket连接已建立');
          this.connectionStatus = 'connected';
          
          // 订阅所有数据类型
          this.ws.send(JSON.stringify({
            type: 'subscribe',
            subscriptions: ['quota-status', 'traffic-stats', 'enforcement-status']
          }));
        };
        
        this.ws.onmessage = (event) => {
          this.handleWebSocketMessage(JSON.parse(event.data));
        };
        
        this.ws.onclose = () => {
          console.log('WebSocket连接已关闭');
          this.connectionStatus = 'disconnected';
          
          // 5秒后尝试重连
          setTimeout(() => {
            if (this.connectionStatus === 'disconnected') {
              this.connectWebSocket();
            }
          }, 5000);
        };
        
        this.ws.onerror = (error) => {
          console.error('WebSocket连接错误:', error);
          this.connectionStatus = 'error';
        };
        
      } catch (error) {
        console.error('创建WebSocket连接失败:', error);
        this.connectionStatus = 'error';
      }
    },
    
    disconnectWebSocket() {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    },
    
    handleWebSocketMessage(data) {
      switch (data.type) {
        case 'welcome':
          console.log('收到欢迎消息:', data);
          break;
        case 'data':
          this.handleDataUpdate(data.subscription, data.data);
          break;
        case 'subscription-confirmed':
          console.log('订阅确认:', data.subscriptions);
          break;
        default:
          console.log('未知消息类型:', data.type);
      }
    },
    
    handleDataUpdate(subscription, data) {
      switch (subscription) {
        case 'quota-status':
          this.quotaStatuses = data;
          break;
        case 'traffic-stats':
          this.statistics = data;
          break;
        case 'enforcement-status':
          this.enforcementStatus = data;
          break;
      }
    },
    
    async resetUserQuota(userId) {
      if (!confirm('确定要重置该用户的流量配额吗？')) {
        return;
      }
      
      try {
        this.loading = true;
        const response = await fetch(`/api/quota/reset/${userId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ reason: '管理员手动重置' })
        });
        
        const result = await response.json();
        if (result.ok) {
          this.$message.success('用户配额重置成功');
        } else {
          this.$message.error(result.error || '重置失败');
        }
      } catch (error) {
        console.error('重置用户配额失败:', error);
        this.$message.error('重置失败');
      } finally {
        this.loading = false;
      }
    },
    
    async manualEnforcementCheck() {
      try {
        this.loading = true;
        const response = await fetch('/api/quota/enforcement/check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        const result = await response.json();
        if (result.ok) {
          this.$message.success('配额强制检查已执行');
        } else {
          this.$message.error(result.error || '检查失败');
        }
      } catch (error) {
        console.error('手动强制检查失败:', error);
        this.$message.error('检查失败');
      } finally {
        this.loading = false;
      }
    },
    
    formatBytes(bytes) {
      if (bytes === -1) return '无限制';
      if (bytes === 0) return '0 B';
      
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    getStatusText(status) {
      const statusMap = {
        'normal': '正常',
        'warning': '警告',
        'quota_exceeded': '超配额',
        'unlimited': '无限制'
      };
      return statusMap[status] || status;
    },
    
    getProgressClass(percentage) {
      if (percentage >= 90) return 'danger';
      if (percentage >= 75) return 'warning';
      return 'normal';
    }
  }
}
</script>

<style scoped>
.quota-monitor {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.monitor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.status-indicator.connected { background-color: #52c41a; }
.status-indicator.connecting { background-color: #faad14; }
.status-indicator.disconnected { background-color: #d9d9d9; }
.status-indicator.error { background-color: #ff4d4f; }

.stats-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  text-align: center;
}

.stat-card h3 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #666;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #1890ff;
}

.stat-value.danger {
  color: #ff4d4f;
}

.quota-list {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  overflow: hidden;
}

.quota-list h3 {
  margin: 0;
  padding: 16px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}

.list-controls {
  padding: 16px;
  display: flex;
  gap: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.search-input, .status-filter {
  padding: 8px 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
}

.quota-table {
  overflow-x: auto;
}

.table-header, .table-row {
  display: grid;
  grid-template-columns: 150px 100px 100px 100px 120px 80px 60px 80px;
  gap: 12px;
  padding: 12px 16px;
  align-items: center;
}

.table-header {
  background: #fafafa;
  font-weight: bold;
  border-bottom: 1px solid #f0f0f0;
}

.table-row {
  border-bottom: 1px solid #f5f5f5;
}

.table-row.quota-exceeded {
  background-color: #fff2f0;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #f5f5f5;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 4px;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.progress-fill.normal { background-color: #52c41a; }
.progress-fill.warning { background-color: #faad14; }
.progress-fill.danger { background-color: #ff4d4f; }

.status-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}

.status-badge.normal { background: #f6ffed; color: #52c41a; }
.status-badge.warning { background: #fffbe6; color: #faad14; }
.status-badge.quota_exceeded { background: #fff2f0; color: #ff4d4f; }
.status-badge.unlimited { background: #f0f5ff; color: #1890ff; }

.btn-reset, .btn-check {
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
}

.btn-reset:hover, .btn-check:hover {
  border-color: #1890ff;
  color: #1890ff;
}

.btn-reset:disabled, .btn-check:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.enforcement-status {
  margin-top: 24px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  padding: 16px;
}

.enforcement-info {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  align-items: center;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-item label {
  font-weight: bold;
  color: #666;
}

.status.running {
  color: #52c41a;
}

.status.stopped {
  color: #ff4d4f;
}

.admin-badge {
  background: #f0f5ff;
  color: #1890ff;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}

.admin-note {
  color: #1890ff;
  font-size: 12px;
  font-weight: bold;
}
</style>
