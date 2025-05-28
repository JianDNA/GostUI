const config = require('./config');

module.exports = {
  development: {
    ...config.database,
    dialect: 'sqlite',
    storage: './database/database.sqlite'
  },
  test: {
    ...config.database,
    dialect: 'sqlite',
    storage: './database/database.test.sqlite'
  },
  production: {
    ...config.database,
    dialect: 'sqlite',
    storage: './database/database.sqlite'
  }
}; 
