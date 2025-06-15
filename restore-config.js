#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 恢复原始配置
const configPath = path.join(__dirname, 'backend/config/gost-config.json');
const configContent = fs.readFileSync(configPath, 'utf8');
const config = JSON.parse(configContent);

// 恢复观察器地址
if (config.observers && config.observers[0]) {
  config.observers[0].plugin.addr = 'http://localhost:3000/api/gost-plugin/observer';
  console.log('🔄 恢复观察器地址为原始地址');
}

// 写回配置文件
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
console.log('💾 原始配置已恢复');
