const { Model, DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  class Rule extends Model {
    static associate(models) {
      Rule.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user'
      });
    }
  }

  Rule.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('tcp', 'udp', 'http', 'https'),
      allowNull: false
    },
    localAddress: {
      type: DataTypes.STRING,
      allowNull: false
    },
    remoteAddress: {
      type: DataTypes.STRING,
      allowNull: false
    },
    enabled: {
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
  }, {
    sequelize,
    modelName: 'Rule',
    tableName: 'Rules',
    timestamps: true
  });

  return Rule;
}; 