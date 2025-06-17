-- ========================================
-- GOST 代理管理系统 - 数据库初始化脚本
-- 从生产数据库导出的完整结构
-- 生成时间: 2025-06-15
-- ========================================

-- Sequelize 迁移记录表
CREATE TABLE `SequelizeMeta` (
    `name` VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY
);

-- 流量统计表 (按小时)
CREATE TABLE `traffic_hourly` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `userId` INTEGER NOT NULL,
    `port` INTEGER NOT NULL,
    `inputBytes` BIGINT NOT NULL DEFAULT 0,
    `outputBytes` BIGINT NOT NULL DEFAULT 0,
    `totalBytes` BIGINT NOT NULL DEFAULT 0,
    `recordHour` VARCHAR(13) NOT NULL,
    `recordTime` DATETIME NOT NULL,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- 速度统计表 (按分钟)
CREATE TABLE `speed_minutely` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `userId` INTEGER NOT NULL,
    `port` INTEGER NOT NULL,
    `inputRate` FLOAT NOT NULL DEFAULT '0',
    `outputRate` FLOAT NOT NULL DEFAULT '0',
    `totalRate` FLOAT NOT NULL DEFAULT '0',
    `recordMinute` VARCHAR(16) NOT NULL,
    `recordTime` DATETIME NOT NULL,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- 规则表 (旧版本，保留兼容性)
CREATE TABLE `Rules` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `type` TEXT NOT NULL,
    `localAddress` VARCHAR(255) NOT NULL,
    `remoteAddress` VARCHAR(255) NOT NULL,
    `enabled` TINYINT(1) DEFAULT 1,
    `userId` INTEGER NOT NULL REFERENCES `Users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- 转发规则表 (旧版本，保留兼容性)
CREATE TABLE `ForwardRules` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `sourcePort` INTEGER NOT NULL,
    `targetHost` VARCHAR(255) NOT NULL,
    `targetPort` INTEGER NOT NULL,
    `protocol` TEXT DEFAULT 'tcp',
    `isActive` TINYINT(1) DEFAULT 1,
    `userId` INTEGER NOT NULL REFERENCES `Users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- 流量日志表
CREATE TABLE `TrafficLogs` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `userId` INTEGER NOT NULL REFERENCES `Users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    `ruleId` INTEGER NOT NULL REFERENCES `ForwardRules` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    `bytesIn` BIGINT DEFAULT 0,
    `bytesOut` BIGINT DEFAULT 0,
    `timestamp` DATETIME,
    `sourceIP` VARCHAR(255),
    `targetIP` VARCHAR(255),
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- 用户表 (核心表)
CREATE TABLE `Users` (
    `id` INTEGER PRIMARY KEY,
    `username` VARCHAR(255) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255),
    `role` TEXT NOT NULL DEFAULT 'user',
    `portRange` VARCHAR(255),
    `token` VARCHAR(255),
    `isActive` TINYINT(1) NOT NULL DEFAULT 1,
    `createdAt` DATETIME NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
    `updatedAt` DATETIME NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
    `usedTraffic` BIGINT NOT NULL DEFAULT '0',
    `lastTrafficReset` DATETIME,
    `userStatus` TEXT NOT NULL DEFAULT 'active',
    `trafficQuota` DECIMAL(10,3),
    `portRangeStart` INTEGER,
    `portRangeEnd` INTEGER,
    `expiryDate` DATETIME,
    `additionalPorts` TEXT
);

-- 用户转发规则表 (主要使用的表)
CREATE TABLE `UserForwardRules` (
    `id` INTEGER PRIMARY KEY,
    `userId` INTEGER NOT NULL REFERENCES `Users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    `ruleUUID` VARCHAR(36) NOT NULL UNIQUE,
    `name` VARCHAR(100) NOT NULL,
    `sourcePort` INTEGER NOT NULL UNIQUE,
    `targetAddress` VARCHAR(255) NOT NULL,
    `protocol` VARCHAR(10) NOT NULL DEFAULT 'tcp',
    `description` TEXT,
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL,
    `usedTraffic` BIGINT NOT NULL DEFAULT 0,
    `listenAddress` VARCHAR(45) DEFAULT '127.0.0.1',
    `listenAddressType` TEXT NOT NULL DEFAULT 'ipv4'
);

-- 系统配置表
CREATE TABLE `SystemConfigs` (
    `key` VARCHAR(255) NOT NULL PRIMARY KEY,
    `value` TEXT,
    `description` VARCHAR(255),
    `category` VARCHAR(255) NOT NULL DEFAULT 'general',
    `updatedBy` VARCHAR(255),
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);

-- ========================================
-- 索引定义
-- ========================================

-- 流量统计表索引
CREATE INDEX `idx_traffic_hourly_user_time` ON `traffic_hourly` (`userId`, `recordTime`);
CREATE INDEX `idx_traffic_hourly_user_hour` ON `traffic_hourly` (`userId`, `recordHour`);
CREATE INDEX `idx_traffic_hourly_port` ON `traffic_hourly` (`port`);
CREATE INDEX `idx_traffic_hourly_time` ON `traffic_hourly` (`recordTime`);
CREATE UNIQUE INDEX `unique_user_port_hour` ON `traffic_hourly` (`userId`, `port`, `recordHour`);

-- 速度统计表索引
CREATE INDEX `idx_speed_minutely_user_time` ON `speed_minutely` (`userId`, `recordTime`);
CREATE INDEX `idx_speed_minutely_user_minute` ON `speed_minutely` (`userId`, `recordMinute`);
CREATE INDEX `idx_speed_minutely_port` ON `speed_minutely` (`port`);
CREATE INDEX `idx_speed_minutely_time` ON `speed_minutely` (`recordTime`);
CREATE UNIQUE INDEX `unique_user_port_minute` ON `speed_minutely` (`userId`, `port`, `recordMinute`);

-- 用户转发规则表索引
CREATE INDEX `idx_user_forward_rules_user_id` ON `UserForwardRules` (`userId`);

-- ========================================
-- 初始数据插入
-- ========================================

-- 系统配置初始数据
INSERT INTO `SystemConfigs` (`key`, `value`, `description`, `category`, `updatedBy`, `createdAt`, `updatedAt`) VALUES
('allowUserExternalAccess', 'true', '允许普通用户的转发规则被外部访问。true=监听所有接口(0.0.0.0)，false=仅本地访问(127.0.0.1)。管理员用户不受限制。', 'security', 'system', datetime('now'), datetime('now')),
('disabledProtocols', '[]', '禁用的协议列表', 'security', 'system', datetime('now'), datetime('now')),
('allowedProtocols', '["tcp", "udp", "http", "https", "socks5"]', '允许的协议列表', 'security', 'system', datetime('now'), datetime('now')),
('performanceMode', 'balanced', '性能模式设置', 'performance', 'system', datetime('now'), datetime('now')),
('autoSyncEnabled', 'true', '自动同步开关', 'sync', 'system', datetime('now'), datetime('now'));

-- 迁移记录初始数据 (确保迁移状态一致)
INSERT INTO `SequelizeMeta` (`name`) VALUES
('20250617063000-add-user-external-access-config.js');
