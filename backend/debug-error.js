/**
 * 调试脚本 - 查找错误位置
 */
const path = require('path');
const fs = require('fs');
const { findErrorLocation } = require('./utils/debugHelper');

// 获取命令行参数作为搜索目录
const targetDir = process.argv[2] || '.';

// 要搜索的错误字符串模式
const errorPatterns = [
  "error.error",
  "Cannot read properties of undefined",
  "Cannot read properties of undefined (reading 'error')",
  "gostError.message",
  "gostError.error",
  "gostError?.error",
  "gostError?.message",
  "error ?",
  "error\\?",
  "error\\?.error",
  "error\\?.message",
  "if (!gostError)",
  "if (gostError)"
];

console.log('🔍 开始搜索错误位置...');
console.log(`🔍 目标目录: ${targetDir}`);

// 递归搜索目录中的所有JS文件
function searchDirectory(dir) {
  try {
    if (!fs.existsSync(dir)) {
      console.log(`⚠️ 目录不存在: ${dir}`);
      return;
    }
    
    console.log(`🔍 搜索目录: ${dir}`);
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        searchDirectory(filePath);
      } else if (file.endsWith('.js')) {
        console.log(`🔍 检查文件: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // 特别检查gostConfigService.js文件中的方法
        if (file === 'gostConfigService.js') {
          const lines = content.split('\n');
          
          // 检查generateGostConfig方法
          if (content.includes('generateGostConfig')) {
            console.log('🔍🔍🔍 特别检查 generateGostConfig 方法:');
            let inMethod = false;
            let bracketCount = 0;
            let lineNum = 0;
            
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes('generateGostConfig')) {
                inMethod = true;
                lineNum = i;
                console.log(`🔍 方法开始于行 ${i+1}: ${lines[i].trim()}`);
              }
              
              if (inMethod) {
                // 计算括号平衡
                const openBrackets = (lines[i].match(/{/g) || []).length;
                const closeBrackets = (lines[i].match(/}/g) || []).length;
                bracketCount += openBrackets - closeBrackets;
                
                // 检查可能的错误处理
                if (lines[i].includes('error') || lines[i].includes('Error') || 
                    lines[i].includes('catch') || lines[i].includes('try') ||
                    lines[i].includes('undefined') || lines[i].includes('null')) {
                  console.log(`🔍 行 ${i+1} [可能的错误处理]: ${lines[i].trim()}`);
                }
                
                // 方法结束
                if (bracketCount === 0 && i > lineNum + 5) {
                  inMethod = false;
                  console.log(`🔍 方法结束于行 ${i+1}`);
                  break;
                }
              }
            }
          }
          
          // 查找_formatRule方法的完整定义
          console.log('🔍🔍🔍 查找 _formatRule 方法的完整定义:');
          let formatRuleStartLine = -1;
          let formatRuleEndLine = -1;
          let bracketCount = 0;
          let inFormatRuleMethod = false;
          
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('_formatRule') && lines[i].includes('(')) {
              formatRuleStartLine = i;
              inFormatRuleMethod = true;
              bracketCount = 0;
              console.log(`🔍 _formatRule 方法定义开始于行 ${i+1}: ${lines[i].trim()}`);
            }
            
            if (inFormatRuleMethod) {
              // 计算括号平衡
              const openBrackets = (lines[i].match(/{/g) || []).length;
              const closeBrackets = (lines[i].match(/}/g) || []).length;
              bracketCount += openBrackets - closeBrackets;
              
              // 方法结束
              if (bracketCount === 0 && i > formatRuleStartLine + 1) {
                formatRuleEndLine = i;
                inFormatRuleMethod = false;
                console.log(`🔍 _formatRule 方法定义结束于行 ${i+1}: ${lines[i].trim()}`);
                break;
              }
            }
          }
          
          // 打印_formatRule方法的完整定义
          if (formatRuleStartLine >= 0 && formatRuleEndLine >= 0) {
            console.log('🔍 _formatRule 方法的完整定义:');
            for (let i = formatRuleStartLine; i <= formatRuleEndLine; i++) {
              console.log(`${i+1}: ${lines[i]}`);
            }
          } else {
            console.log('❌ 未找到 _formatRule 方法的完整定义');
          }
        }
        
        for (const pattern of errorPatterns) {
          if (content.includes(pattern)) {
            console.log(`🔍 在文件 ${filePath} 中找到匹配: ${pattern}`);
            // 查找具体行号
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(pattern)) {
                console.log(`🔍 行 ${i+1}: ${lines[i].trim()}`);
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ 搜索错误: ${error.message}`);
  }
}

// 开始搜索
searchDirectory(targetDir);

console.log('🔍 搜索完成'); 