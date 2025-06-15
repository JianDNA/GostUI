CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE `SequelizeMeta` (
    `name` VARCHAR(255) NOT NULL UNIQUE PRIMARY KEY
);
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
CREATE TABLE `Users` (
    `id` INTEGER PRIMARY KEY,
    `username` VARCHAR(255) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) UNIQUE,
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
CREATE TABLE `SystemConfigs` (
    `key` VARCHAR(255) NOT NULL PRIMARY KEY,
    `value` TEXT,
    `description` VARCHAR(255),
    `category` VARCHAR(255) NOT NULL DEFAULT 'general',
    `updatedBy` VARCHAR(255),
    `createdAt` DATETIME NOT NULL,
    `updatedAt` DATETIME NOT NULL
);
CREATE INDEX `idx_traffic_hourly_user_time` ON `traffic_hourly` (`userId`, `recordTime`);
CREATE INDEX `idx_traffic_hourly_user_hour` ON `traffic_hourly` (`userId`, `recordHour`);
CREATE INDEX `idx_traffic_hourly_port` ON `traffic_hourly` (`port`);
CREATE INDEX `idx_traffic_hourly_time` ON `traffic_hourly` (`recordTime`);
CREATE UNIQUE INDEX `unique_user_port_hour` ON `traffic_hourly` (`userId`, `port`, `recordHour`);
CREATE INDEX `idx_speed_minutely_user_time` ON `speed_minutely` (`userId`, `recordTime`);
CREATE INDEX `idx_speed_minutely_user_minute` ON `speed_minutely` (`userId`, `recordMinute`);
CREATE INDEX `idx_speed_minutely_port` ON `speed_minutely` (`port`);
CREATE INDEX `idx_speed_minutely_time` ON `speed_minutely` (`recordTime`);
CREATE UNIQUE INDEX `unique_user_port_minute` ON `speed_minutely` (`userId`, `port`, `recordMinute`);
CREATE INDEX `idx_user_forward_rules_user_id` ON `UserForwardRules` (`userId`);
