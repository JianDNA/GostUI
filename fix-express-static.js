#!/usr/bin/env node

// 🔧 Express静态文件服务修复脚本

const fs = require('fs');
const path = require('path');

console.log('🔧 Express静态文件服务修复脚本');
console.log('================================');

const appJsPath = path.join(__dirname, 'backend', 'app.js');

if (!fs.existsSync(appJsPath)) {
    console.error('❌ 找不到backend/app.js文件');
    process.exit(1);
}

console.log('📖 读取app.js文件...');
let appJsContent = fs.readFileSync(appJsPath, 'utf8');

console.log('🔍 检查当前静态文件配置...');

// 检查是否已有静态文件配置
if (appJsContent.includes('express.static')) {
    console.log('✅ 发现现有静态文件配置');
    
    // 检查配置是否正确
    if (appJsContent.includes("express.static(path.join(__dirname, 'public'))")) {
        console.log('✅ 静态文件路径配置正确');
    } else {
        console.log('⚠️ 静态文件路径配置可能有问题');
    }
} else {
    console.log('❌ 未找到静态文件配置');
}

console.log('🛠️ 优化静态文件配置...');

// 创建优化的静态文件配置
const optimizedStaticConfig = `
// 静态文件服务 - 优化配置
app.use(express.static(path.join(__dirname, 'public'), {
  // 设置缓存控制
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  // 启用ETag
  etag: true,
  // 设置索引文件
  index: false, // 不自动提供index.html，由路由处理
  // 启用压缩
  dotfiles: 'ignore',
  // 设置MIME类型
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
  }
}));

// 专门处理assets目录的静态文件
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  etag: true,
  setHeaders: (res, filePath) => {
    // 强制设置正确的MIME类型
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
  }
}));`;

// 替换现有的静态文件配置
const staticFileRegex = /\/\/ 静态文件服务[\s\S]*?app\.use\(express\.static\([^)]+\)\);/;

if (staticFileRegex.test(appJsContent)) {
    console.log('🔄 替换现有静态文件配置...');
    appJsContent = appJsContent.replace(staticFileRegex, optimizedStaticConfig.trim());
} else {
    console.log('➕ 添加静态文件配置...');
    // 在中间件部分添加静态文件配置
    const middlewareInsertPoint = appJsContent.indexOf('// 路由');
    if (middlewareInsertPoint !== -1) {
        appJsContent = appJsContent.slice(0, middlewareInsertPoint) + 
                      optimizedStaticConfig + '\n\n' + 
                      appJsContent.slice(middlewareInsertPoint);
    } else {
        console.error('❌ 无法找到合适的插入点');
        process.exit(1);
    }
}

console.log('💾 保存修改后的app.js...');

// 备份原文件
const backupPath = appJsPath + '.backup.' + Date.now();
fs.writeFileSync(backupPath, fs.readFileSync(appJsPath));
console.log(`📋 原文件已备份到: ${backupPath}`);

// 写入修改后的内容
fs.writeFileSync(appJsPath, appJsContent);

console.log('✅ Express静态文件配置已优化');
console.log('');
console.log('🔄 请重启服务以应用更改:');
console.log('   cd /opt/gost-management/backend');
console.log('   pm2 restart gost-management');
console.log('');
console.log('🧪 测试静态文件访问:');
console.log('   curl -I http://localhost:3000/assets/index-75dfb4d4.js');

// 验证文件语法
console.log('🔍 验证JavaScript语法...');
try {
    require(appJsPath);
    console.log('✅ JavaScript语法验证通过');
} catch (error) {
    console.error('❌ JavaScript语法错误:', error.message);
    console.log('🔄 恢复备份文件...');
    fs.writeFileSync(appJsPath, fs.readFileSync(backupPath));
    console.log('✅ 已恢复原文件');
    process.exit(1);
}
