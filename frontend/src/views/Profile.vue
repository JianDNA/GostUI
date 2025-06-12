<template>
  <div class="profile-container">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-container">
      <el-loading-spinner size="50" />
      <p>正在加载用户信息...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="!userInfo" class="error-container">
      <el-empty description="无法获取用户信息">
        <el-button type="primary" @click="fetchUserInfo">重新加载</el-button>
      </el-empty>
    </div>

    <!-- 正常内容 -->
    <div v-else>
    <el-card class="profile-header">
      <div class="user-info">
        <el-avatar :size="80" class="user-avatar">
          <i class="el-icon-user"></i>
        </el-avatar>
        <div class="user-details">
          <h2>{{ userInfo?.username }}</h2>
          <el-tag :type="userInfo?.accountStatus?.isExpired ? 'danger' : 'success'">
            {{ userInfo?.accountStatus?.isExpired ? '已过期' : '正常' }}
          </el-tag>
          <p class="user-role">{{ userInfo?.role === 'admin' ? '管理员' : '普通用户' }}</p>
        </div>
      </div>
    </el-card>

    <el-row :gutter="20" style="margin-top: 20px;">
      <!-- 账户状态 -->
      <el-col :span="8">
        <el-card class="status-card">
          <template #header>
            <div class="card-header">
              <span>账户状态</span>
              <el-icon><User /></el-icon>
            </div>
          </template>
          <div class="status-content">
            <div class="status-item">
              <span class="label">账户状态:</span>
              <el-tag :type="userInfo?.accountStatus?.isExpired ? 'danger' : 'success'">
                {{ userInfo?.accountStatus?.userStatus || '正常' }}
              </el-tag>
            </div>
            <div class="status-item" v-if="userInfo?.accountStatus?.expiresAt">
              <span class="label">到期时间:</span>
              <span>{{ formatDate(userInfo.accountStatus.expiresAt) }}</span>
            </div>
            <div class="status-item" v-if="userInfo?.accountStatus?.daysUntilExpiry !== null">
              <span class="label">剩余天数:</span>
              <span :class="getDaysClass(userInfo.accountStatus.daysUntilExpiry)">
                {{ userInfo.accountStatus.daysUntilExpiry > 0 ? userInfo.accountStatus.daysUntilExpiry + ' 天' : '已过期' }}
              </span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 流量使用情况 -->
      <el-col :span="8">
        <el-card class="traffic-card">
          <template #header>
            <div class="card-header">
              <span>流量使用</span>
              <el-icon><DataLine /></el-icon>
            </div>
          </template>
          <div class="traffic-content">
            <div class="traffic-progress">
              <el-progress 
                :percentage="userInfo?.trafficStats?.usagePercent || 0"
                :status="getTrafficStatus(userInfo?.trafficStats?.usagePercent)"
                :stroke-width="12"
              />
            </div>
            <div class="traffic-details">
              <div class="traffic-item">
                <span class="label">已使用:</span>
                <span>{{ userInfo?.trafficStats?.usedTrafficFormatted || '0 B' }}</span>
              </div>
              <div class="traffic-item">
                <span class="label">总配额:</span>
                <span>{{ userInfo?.trafficStats?.trafficQuotaFormatted || '无限制' }}</span>
              </div>
              <div class="traffic-item">
                <span class="label">使用率:</span>
                <span :class="getUsageClass(userInfo?.trafficStats?.usagePercent)">
                  {{ userInfo?.trafficStats?.usagePercent?.toFixed(1) || 0 }}%
                </span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 端口信息 -->
      <el-col :span="8">
        <el-card class="port-card">
          <template #header>
            <div class="card-header">
              <span>端口范围</span>
              <el-icon><Connection /></el-icon>
            </div>
          </template>
          <div class="port-content">
            <div class="port-item">
              <span class="label">端口范围:</span>
              <el-tag type="info">{{ userInfo?.portInfo?.startPort }} - {{ userInfo?.portInfo?.endPort }}</el-tag>
            </div>
            <div class="port-item">
              <span class="label">可用端口:</span>
              <span>{{ userInfo?.portInfo?.availablePorts || 0 }} 个</span>
            </div>
            <div class="port-item">
              <span class="label">端口范围:</span>
              <div>
                <el-tag type="info" size="small">
                  {{ userInfo?.portInfo?.startPort || 'N/A' }} - {{ userInfo?.portInfo?.endPort || 'N/A' }}
                </el-tag>
                <span style="margin-left: 10px; color: #909399; font-size: 12px;">
                  (共 {{ userInfo?.portInfo?.availablePorts || 0 }} 个可用端口)
                </span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 转发规则统计 -->
    <el-row style="margin-top: 20px;">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>转发规则统计</span>
              <el-icon><DataBoard /></el-icon>
            </div>
          </template>
          <el-row :gutter="20">
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-value">{{ userInfo?.rulesStats?.total || 0 }}</div>
                <div class="stat-label">总规则数</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-value success">{{ userInfo?.rulesStats?.active || 0 }}</div>
                <div class="stat-label">活跃规则</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-value warning">{{ userInfo?.rulesStats?.inactive || 0 }}</div>
                <div class="stat-label">非活跃规则</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div class="stat-item">
                <div class="stat-value danger">{{ userInfo?.rulesStats?.expired || 0 }}</div>
                <div class="stat-label">过期规则</div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <!-- 我的转发规则 -->
    <el-row style="margin-top: 20px;">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>我的转发规则</span>
              <el-icon><List /></el-icon>
            </div>
          </template>
          <el-table :data="userInfo?.forwardRules || []" stripe style="width: 100%">
            <el-table-column prop="name" label="规则名称" />
            <el-table-column prop="protocol" label="协议" width="80" />
            <el-table-column label="转发规则" width="200">
              <template #default="scope">
                <el-tag type="primary">
                  {{ scope.row.sourcePort }}
                  <el-icon><Right /></el-icon>
                  {{ scope.row.targetHost }}:{{ scope.row.targetPort }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="scope">
                <el-tag 
                  :type="scope.row.isActive ? 'success' : 'info'"
                  size="small"
                >
                  {{ scope.row.isActive ? '活跃' : '非活跃' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="到期时间" width="150">
              <template #default="scope">
                <span v-if="scope.row.expiresAt">
                  {{ formatDate(scope.row.expiresAt) }}
                </span>
                <span v-else class="no-expiry">无期限</span>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="150">
              <template #default="scope">
                {{ formatDate(scope.row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
    </div> <!-- 关闭正常内容的div -->
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { User, DataLine, Connection, DataBoard, List, Right } from '@element-plus/icons-vue'
import request from '@/utils/request'

export default {
  name: 'Profile',
  components: {
    User,
    DataLine, 
    Connection,
    DataBoard,
    List,
    Right
  },
  setup() {
    const userInfo = ref(null)
    const loading = ref(false)

    const fetchUserInfo = async () => {
      try {
        loading.value = true
        console.log('🔍 开始获取用户信息...')
        const response = await request.get('/users/me')
        console.log('🔍 API响应:', response)

        // 检查响应结构
        if (response && response.data) {
          if (response.data.success && response.data.data) {
            userInfo.value = response.data.data
            console.log('✅ 用户信息设置成功:', userInfo.value)
          } else if (response.data.data) {
            // 兼容直接返回data的情况
            userInfo.value = response.data
            console.log('✅ 用户信息设置成功(兼容模式):', userInfo.value)
          } else {
            console.error('❌ API响应格式不正确:', response.data)
            ElMessage.error('用户信息格式错误')
          }
        } else {
          console.error('❌ API响应为空')
          ElMessage.error('获取用户信息失败')
        }
      } catch (error) {
        console.error('❌ 获取用户信息失败:', error)
        if (error.response?.status === 401) {
          ElMessage.error('登录已过期，请重新登录')
          // 可以在这里跳转到登录页面
          // this.$router.push('/login')
        } else {
          ElMessage.error('获取用户信息失败')
        }
      } finally {
        loading.value = false
      }
    }

    const formatDate = (dateString) => {
      if (!dateString) return '-'
      return new Date(dateString).toLocaleString('zh-CN')
    }

    const getDaysClass = (days) => {
      if (days <= 0) return 'expired'
      if (days <= 7) return 'warning'
      if (days <= 30) return 'caution'
      return 'normal'
    }

    const getTrafficStatus = (percent) => {
      if (percent >= 90) return 'exception'
      if (percent >= 70) return 'warning'
      return 'success'
    }

    const getUsageClass = (percent) => {
      if (percent >= 90) return 'danger'
      if (percent >= 70) return 'warning'
      return 'success'
    }

    onMounted(() => {
      fetchUserInfo()
    })

    return {
      userInfo,
      loading,
      fetchUserInfo,
      formatDate,
      getDaysClass,
      getTrafficStatus,
      getUsageClass
    }
  }
}
</script>

<style scoped>
.profile-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: #909399;
}

.loading-container p {
  margin-top: 16px;
  font-size: 14px;
}

.error-container {
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.profile-header {
  margin-bottom: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 20px;
}

.user-avatar {
  background: linear-gradient(45deg, #409EFF, #67C23A);
  color: white;
  font-size: 32px;
}

.user-details h2 {
  margin: 0 0 8px 0;
  color: #303133;
}

.user-role {
  margin: 8px 0 0 0;
  color: #909399;
  font-size: 14px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.status-card, .traffic-card, .port-card {
  height: 280px;
}

.status-content, .traffic-content, .port-content {
  padding: 10px 0;
}

.status-item, .traffic-item, .port-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.status-item:last-child, .traffic-item:last-child, .port-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.label {
  font-weight: 500;
  color: #606266;
}

.traffic-progress {
  margin-bottom: 20px;
}

.available-ports {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.more-ports {
  color: #909399;
  font-size: 12px;
  margin-left: 8px;
}

.stat-item {
  text-align: center;
  padding: 20px;
  border-radius: 8px;
  background: #f8f9fa;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 8px;
}

.stat-value.success {
  color: #67C23A;
}

.stat-value.warning {
  color: #E6A23C;
}

.stat-value.danger {
  color: #F56C6C;
}

.stat-label {
  color: #909399;
  font-size: 14px;
}

.no-expiry {
  color: #909399;
  font-style: italic;
}

/* 状态颜色类 */
.expired {
  color: #F56C6C;
  font-weight: bold;
}

.warning {
  color: #E6A23C;
  font-weight: bold;
}

.caution {
  color: #E6A23C;
}

.normal {
  color: #67C23A;
}

.success {
  color: #67C23A;
}

.danger {
  color: #F56C6C;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .profile-container {
    padding: 10px;
  }

  .user-info {
    flex-direction: column;
    text-align: center;
  }

  .status-card, .traffic-card, .port-card {
    height: auto;
    margin-bottom: 20px;
  }
}
</style>
