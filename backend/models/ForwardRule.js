const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ForwardRule = sequelize.define('ForwardRule', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    sourcePort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 65535
      }
    },
    targetHost: {
      type: DataTypes.STRING,
      allowNull: false
    },
    targetPort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 65535
      }
    },
    protocol: {
      type: DataTypes.ENUM('tcp', 'udp', 'tls'),
      defaultValue: 'tcp'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    }
  });

  ForwardRule.associate = (models) => {
    ForwardRule.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  return ForwardRule;
}; 