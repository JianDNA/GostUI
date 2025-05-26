const jwt = require('jsonwebtoken');
const { models } = require('./dbService');
const { User } = models;
const config = require('../config/config');

class UserService {
  async createUser(userData) {
    try {
      const user = await User.create(userData);
      return user;
    } catch (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  async authenticate(username, password) {
    try {
      const user = await User.findOne({ where: { username } });
      if (!user) {
        throw new Error('User not found');
      }

      const isValid = await user.validatePassword(password);
      if (!isValid) {
        throw new Error('Invalid password');
      }

      const token = jwt.sign(
        { 
          id: user.id, 
          username: user.username,
          role: user.role 
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      return {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          trafficQuota: user.trafficQuota,
          portRange: user.portRange,
          isActive: user.isActive
        }
      };
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  async updateUser(userId, updateData) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await user.update(updateData);
      return user;
    } catch (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  async deleteUser(userId) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await user.destroy();
      return true;
    } catch (error) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  async getUsers(query = {}) {
    try {
      const users = await User.findAll({
        where: query,
        attributes: { exclude: ['password'] }
      });
      return users;
    } catch (error) {
      throw new Error(`Failed to fetch users: ${error.message}`);
    }
  }

  async getUserById(userId) {
    try {
      const user = await User.findByPk(userId, {
        attributes: { exclude: ['password'] }
      });
      if (!user) {
        throw new Error('User not found');
      }
      return user;
    } catch (error) {
      throw new Error(`Failed to fetch user: ${error.message}`);
    }
  }
}

module.exports = new UserService(); 