# 流量统计架构优化设计

## 🎯 设计目标

1. **数据一致性**：用户流量 = 所有规则流量之和
2. **历史追溯**：删除规则后仍能追踪历史流量
3. **规则隔离**：同端口新规则从0开始，不继承历史流量
4. **性能优化**：高效的流量统计和查询

## 🏗️ 优化架构方案

### 方案 1：规则版本 + 软删除 + 流量事件表

#### 1.1 数据表结构

```sql
-- 用户转发规则表（增强版）
UserForwardRules {
  id: INTEGER PRIMARY KEY,
  userId: INTEGER,
  name: STRING,
  sourcePort: INTEGER,
  targetAddress: STRING,
  protocol: ENUM,
  isActive: BOOLEAN,
  description: TEXT,
  
  -- 新增字段
  ruleVersion: STRING,        -- 规则版本号 (UUID)
  deletedAt: DATETIME,        -- 软删除时间
  createdAt: DATETIME,        -- 创建时间
  updatedAt: DATETIME,        -- 更新时间
  
  -- 索引
  INDEX(userId, sourcePort, deletedAt),
  INDEX(ruleVersion),
  UNIQUE(userId, sourcePort, deletedAt)  -- 同用户同端口在同一时间只能有一个活跃规则
}

-- 流量事件表（核心）
TrafficEvents {
  id: INTEGER PRIMARY KEY,
  userId: INTEGER,
  ruleId: INTEGER,
  ruleVersion: STRING,        -- 关联规则版本
  sourcePort: INTEGER,
  
  inputBytes: BIGINT,         -- 上行流量
  outputBytes: BIGINT,        -- 下行流量
  totalBytes: BIGINT,         -- 总流量
  
  eventTime: DATETIME,        -- 事件时间
  recordedAt: DATETIME,       -- 记录时间
  
  -- 索引
  INDEX(userId, eventTime),
  INDEX(ruleId, eventTime),
  INDEX(ruleVersion, eventTime),
  INDEX(sourcePort, eventTime)
}

-- 用户流量汇总表（缓存表）
UserTrafficSummary {
  userId: INTEGER PRIMARY KEY,
  totalUsedBytes: BIGINT,     -- 总使用流量
  lastUpdatedAt: DATETIME,    -- 最后更新时间
  
  -- 定期汇总的统计数据
  last24hBytes: BIGINT,
  last7daysBytes: BIGINT,
  last30daysBytes: BIGINT
}

-- 规则流量汇总表（缓存表）
RuleTrafficSummary {
  ruleVersion: STRING PRIMARY KEY,
  ruleId: INTEGER,
  userId: INTEGER,
  sourcePort: INTEGER,
  
  totalUsedBytes: BIGINT,     -- 该规则版本的总流量
  lastUpdatedAt: DATETIME,
  
  -- 定期汇总的统计数据
  last24hBytes: BIGINT,
  last7daysBytes: BIGINT,
  last30daysBytes: BIGINT,
  
  INDEX(ruleId),
  INDEX(userId),
  INDEX(sourcePort)
}
```

#### 1.2 核心逻辑

```javascript
// 规则创建逻辑
async function createRule(userId, sourcePort, ...) {
  // 1. 软删除同端口的旧规则
  await UserForwardRule.update(
    { deletedAt: new Date() },
    { where: { userId, sourcePort, deletedAt: null } }
  );
  
  // 2. 创建新规则（新版本号）
  const newRule = await UserForwardRule.create({
    userId,
    sourcePort,
    ruleVersion: generateUUID(),
    ...otherFields
  });
  
  return newRule;
}

// 流量记录逻辑
async function recordTraffic(userId, sourcePort, inputBytes, outputBytes) {
  // 1. 找到当前活跃的规则
  const activeRule = await UserForwardRule.findOne({
    where: { userId, sourcePort, deletedAt: null }
  });
  
  if (!activeRule) return; // 规则不存在，忽略流量
  
  const totalBytes = inputBytes + outputBytes;
  
  // 2. 记录流量事件
  await TrafficEvent.create({
    userId,
    ruleId: activeRule.id,
    ruleVersion: activeRule.ruleVersion,
    sourcePort,
    inputBytes,
    outputBytes,
    totalBytes,
    eventTime: new Date()
  });
  
  // 3. 更新汇总表（原子操作）
  await Promise.all([
    // 更新用户总流量
    UserTrafficSummary.increment(
      { totalUsedBytes: totalBytes },
      { where: { userId } }
    ),
    
    // 更新规则流量
    RuleTrafficSummary.increment(
      { totalUsedBytes: totalBytes },
      { where: { ruleVersion: activeRule.ruleVersion } }
    )
  ]);
}

// 流量查询逻辑
async function getUserTrafficStats(userId) {
  // 用户总流量（包括已删除规则的历史流量）
  const userSummary = await UserTrafficSummary.findByPk(userId);
  
  // 当前活跃规则的流量
  const activeRules = await UserForwardRule.findAll({
    where: { userId, deletedAt: null },
    include: [{
      model: RuleTrafficSummary,
      as: 'trafficSummary'
    }]
  });
  
  return {
    totalUsedBytes: userSummary.totalUsedBytes,
    activeRules: activeRules.map(rule => ({
      ...rule.toJSON(),
      currentTrafficBytes: rule.trafficSummary?.totalUsedBytes || 0
    }))
  };
}
```

### 方案 2：简化版本（推荐）

如果觉得方案1过于复杂，可以采用简化版本：

#### 2.1 最小改动方案

```sql
-- 只需要在现有表基础上添加几个字段
UserForwardRules {
  -- 现有字段...
  
  -- 新增字段
  ruleUUID: STRING UNIQUE,    -- 规则唯一标识
  deletedAt: DATETIME,        -- 软删除
  
  -- 移除 usedTraffic 字段，改为计算得出
}

-- 保持现有的 TrafficHourly 表，但添加规则关联
TrafficHourly {
  -- 现有字段...
  ruleUUID: STRING,           -- 关联规则UUID
  
  INDEX(ruleUUID, recordTime)
}
```

#### 2.2 核心逻辑

```javascript
// 规则删除（软删除）
async function deleteRule(ruleId) {
  const rule = await UserForwardRule.findByPk(ruleId);
  await rule.update({ deletedAt: new Date() });
  
  // 用户总流量不变，因为是软删除
}

// 同端口新规则创建
async function createRuleOnExistingPort(userId, sourcePort, ...) {
  // 1. 软删除旧规则
  await UserForwardRule.update(
    { deletedAt: new Date() },
    { where: { userId, sourcePort, deletedAt: null } }
  );
  
  // 2. 创建新规则（新UUID）
  const newRule = await UserForwardRule.create({
    userId,
    sourcePort,
    ruleUUID: generateUUID(),
    ...otherFields
  });
  
  return newRule;
}

// 流量统计查询
async function getRuleTraffic(ruleUUID) {
  // 只统计该规则UUID的流量
  const traffic = await TrafficHourly.sum('totalBytes', {
    where: { ruleUUID }
  });
  
  return traffic || 0;
}

async function getUserTotalTraffic(userId) {
  // 统计用户所有规则（包括已删除）的流量
  const traffic = await TrafficHourly.sum('totalBytes', {
    where: { userId }
  });
  
  return traffic || 0;
}
```

## 🎯 推荐方案

我推荐**方案2（简化版本）**，因为：

1. **最小改动**：只需要添加2个字段
2. **逻辑清晰**：软删除 + UUID 关联
3. **数据一致性**：用户流量 = 所有规则流量之和
4. **历史保留**：删除规则后流量数据仍然存在
5. **规则隔离**：新规则有新UUID，从0开始

## 🚀 实施步骤

1. **数据库迁移**：添加 `ruleUUID` 和 `deletedAt` 字段
2. **修改观察器逻辑**：记录流量时关联 `ruleUUID`
3. **更新API逻辑**：规则删除改为软删除
4. **修改统计逻辑**：基于UUID计算规则流量
5. **数据迁移**：为现有规则生成UUID

这样的架构能够完美解决您提到的所有问题！
