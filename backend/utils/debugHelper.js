/**
 * 调试辅助工具
 * 用于增强错误跟踪和调试功能
 */

// 详细打印对象，避免 [Object object] 的问题
function inspectObject(obj, depth = 2) {
  const util = require('util');
  return util.inspect(obj, { depth, colors: false, maxArrayLength: 10 });
}

// 安全获取对象属性，避免 undefined 错误
function safeGet(obj, path, defaultValue = undefined) {
  if (!obj) return defaultValue;
  
  const keys = Array.isArray(path) ? path : path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (result === undefined || result === null) return defaultValue;
    result = result[key];
  }
  
  return result !== undefined ? result : defaultValue;
}

// 包装函数调用，捕获并记录所有错误
async function traceCall(fn, ...args) {
  try {
    return await fn(...args);
  } catch (error) {
    console.error(`🔍 [TRACE] 函数调用失败: ${fn.name || '匿名函数'}`);
    console.error(`🔍 [TRACE] 错误类型: ${error ? error.constructor.name : 'Unknown'}`);
    console.error(`🔍 [TRACE] 错误消息: ${error ? error.message : 'No message'}`);
    console.error(`🔍 [TRACE] 调用参数:`, inspectObject(args));
    console.error(`🔍 [TRACE] 堆栈:`, error ? error.stack : 'No stack');
    throw error;
  }
}

// 检查对象是否为空或未定义
function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && Object.keys(value).length === 0) return true;
  return false;
}

// 查找指定错误消息的代码位置
function findErrorLocation(errorMessage, filePath) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    // 如果没有指定文件路径，则在当前目录下搜索所有 JS 文件
    const files = filePath 
      ? [filePath] 
      : fs.readdirSync('.').filter(file => file.endsWith('.js'));
    
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(errorMessage)) {
            console.log(`🔍 [查找] 在文件 ${file} 的第 ${i+1} 行找到匹配: ${lines[i].trim()}`);
          }
        }
      } catch (readError) {
        console.error(`❌ [查找] 读取文件 ${file} 失败:`, readError.message);
      }
    }
  } catch (error) {
    console.error(`❌ [查找] 搜索错误:`, error.message);
  }
}

module.exports = {
  inspectObject,
  safeGet,
  traceCall,
  isEmpty,
  findErrorLocation
}; 