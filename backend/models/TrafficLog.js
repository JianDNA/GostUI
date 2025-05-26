const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TrafficLog = sequelize.define('TrafficLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    ruleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'ForwardRules',
        key: 'id'
      }
    },
    bytesIn: {
      type: DataTypes.BIGINT,
      defaultValue: 0
    },
    bytesOut: {
      type: DataTypes.BIGINT,
      defaultValue: 0
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    sourceIP: {
      type: DataTypes.STRING,
      allowNull: true
    },
    targetIP: {
      type: DataTypes.STRING,
      allowNull: true
    }
  });

  TrafficLog.associate = (models) => {
    TrafficLog.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
    TrafficLog.belongsTo(models.ForwardRule, {
      foreignKey: 'ruleId',
      as: 'rule'
    });
  };

  return TrafficLog;
}; 