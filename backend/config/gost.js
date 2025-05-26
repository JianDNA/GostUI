const path = require('path');

/**
 * Go-Gost 配置
 */
module.exports = {
    // Go-Gost 可执行文件路径
    executablePath: process.platform === 'win32' 
        ? path.join(__dirname, '../bin/gost.exe')
        : path.join(__dirname, '../bin/gost'),
    
    // 默认配置
    defaultConfig: {
        // 监听地址
        listen: '127.0.0.1:8080',
        // 转发地址
        forward: '127.0.0.1:1080',
        // 日志级别
        logLevel: 'info'
    }
}; 