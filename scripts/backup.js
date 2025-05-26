const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 配置
const config = {
  // 数据库文件路径
  dbPath: path.join(__dirname, '../backend/data/database.sqlite'),
  // 备份目录
  backupDir: path.join(__dirname, '../backend/backups'),
  // 保留的备份数量
  keepBackups: 7
};

// 确保备份目录存在
if (!fs.existsSync(config.backupDir)) {
  fs.mkdirSync(config.backupDir, { recursive: true });
}

// 生成备份文件名
const getBackupFileName = () => {
  const date = new Date();
  return `backup-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}.sqlite`;
};

// 清理旧备份
const cleanOldBackups = () => {
  const files = fs.readdirSync(config.backupDir)
    .filter(file => file.startsWith('backup-'))
    .map(file => ({
      name: file,
      path: path.join(config.backupDir, file),
      time: fs.statSync(path.join(config.backupDir, file)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  // 删除超出保留数量的旧备份
  if (files.length > config.keepBackups) {
    files.slice(config.keepBackups).forEach(file => {
      try {
        fs.unlinkSync(file.path);
        console.log(`Deleted old backup: ${file.name}`);
      } catch (err) {
        console.error(`Failed to delete old backup ${file.name}:`, err);
      }
    });
  }
};

// 执行备份
const performBackup = () => {
  // 检查数据库文件是否存在
  if (!fs.existsSync(config.dbPath)) {
    console.error('Database file not found!');
    process.exit(1);
  }

  const backupFile = path.join(config.backupDir, getBackupFileName());

  // 在 Windows 上使用 copy，在其他系统上使用 cp
  const copyCommand = process.platform === 'win32'
    ? `copy "${config.dbPath}" "${backupFile}"`
    : `cp "${config.dbPath}" "${backupFile}"`;

  exec(copyCommand, (error, stdout, stderr) => {
    if (error) {
      console.error('Backup failed:', error);
      process.exit(1);
    }

    console.log(`Backup created successfully: ${backupFile}`);
    cleanOldBackups();
  });
};

// 执行备份
performBackup(); 