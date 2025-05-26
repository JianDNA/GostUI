const { Sequelize } = require('sequelize');
const config = require('../config/config');
const path = require('path');
const fs = require('fs');

// 创建数据库目录（如果不存在）
const dbDir = path.join(__dirname, '../database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 初始化 Sequelize
const sequelize = new Sequelize(config.database);

// 导入模型
const User = require('./User')(sequelize);
const Rule = require('./Rule')(sequelize);
const ForwardRule = require('./ForwardRule')(sequelize);
const TrafficLog = require('./TrafficLog')(sequelize);

// 定义模型关联
const models = {
  User,
  Rule,
  ForwardRule,
  TrafficLog
};

// 建立模型之间的关联关系
Object.values(models).forEach(model => {
  if (model.associate) {
    model.associate(models);
  }
});

module.exports = {
  sequelize,
  ...models
}; 