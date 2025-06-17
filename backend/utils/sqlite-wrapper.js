const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * 简单的 SQLite3 包装器，使用系统的 sqlite3 命令行工具
 */
class SQLiteWrapper {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.ensureDbExists();
  }

  ensureDbExists() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 如果数据库文件不存在，创建一个空的
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, '');
    }
  }

  async execute(sql, params = []) {
    return new Promise((resolve, reject) => {
      const sqlite = spawn('sqlite3', [this.dbPath]);
      let output = '';
      let error = '';

      sqlite.stdout.on('data', (data) => {
        output += data.toString();
      });

      sqlite.stderr.on('data', (data) => {
        error += data.toString();
      });

      sqlite.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`SQLite error: ${error}`));
        } else {
          resolve(output.trim());
        }
      });

      // 发送 SQL 命令
      sqlite.stdin.write(sql + '\n');
      sqlite.stdin.end();
    });
  }

  async query(sql, params = []) {
    try {
      const result = await this.execute(sql, params);
      return result.split('\n').filter(line => line.trim());
    } catch (error) {
      throw error;
    }
  }
}

module.exports = SQLiteWrapper;
