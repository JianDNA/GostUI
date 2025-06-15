#!/usr/bin/env node

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 获取 vite 可执行文件的绝对路径
const vitePath = resolve(__dirname, '../node_modules/vite/bin/vite.js');

// 启动 vite 开发服务器
const vite = spawn('node', [vitePath, '--port', '8080'], {
  stdio: 'inherit',
  cwd: resolve(__dirname, '..')
});

vite.on('close', (code) => {
  process.exit(code);
});

vite.on('error', (err) => {
  console.error('启动 Vite 开发服务器失败:', err);
  process.exit(1);
});
