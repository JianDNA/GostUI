/**
 * GOST 集成检查脚本
 */

const fs = require('fs');
const path = require('path');

async function checkGostIntegration() {
  console.log('🔍 开始检查 GOST 集成...\n');
  
  let successCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  
  function checkItem(name, condition, type = 'success') {
    if (condition) {
      console.log(`✅ ${name}`);
      successCount++;
    } else {
      if (type === 'warning') {
        console.log(`⚠️ ${name}`);
        warningCount++;
      } else {
        console.log(`❌ ${name}`);
        errorCount++;
      }
    }
  }
  
  // 检查核心文件
  console.log('📁 检查核心文件...');
  checkItem('app.js 存在', fs.existsSync(path.join(__dirname, '../app.js')));
  checkItem('package.json 存在', fs.existsSync(path.join(__dirname, '../package.json')));
  checkItem('services 目录存在', fs.existsSync(path.join(__dirname, '../services')));
  checkItem('routes 目录存在', fs.existsSync(path.join(__dirname, '../routes')));
  checkItem('models 目录存在', fs.existsSync(path.join(__dirname, '../models')));
  
  // 检查 GOST 相关文件
  console.log('\n🔧 检查 GOST 相关文件...');
  checkItem('gostService.js 存在', fs.existsSync(path.join(__dirname, '../services/gostService.js')));
  checkItem('gostConfigService.js 存在', fs.existsSync(path.join(__dirname, '../services/gostConfigService.js')));
  checkItem('gostPluginService.js 存在', fs.existsSync(path.join(__dirname, '../services/gostPluginService.js')));

  // 🔧 使用动态平台检测检查GOST二进制文件
  try {
    const { getGostExecutablePath } = require('../utils/platform');
    const gostPath = getGostExecutablePath();
    checkItem('GOST 二进制文件存在', fs.existsSync(gostPath));
    console.log(`   📁 GOST路径: ${gostPath}`);
  } catch (error) {
    checkItem('GOST 二进制文件存在', false);
    console.log(`   ❌ GOST路径检测失败: ${error.message}`);
    console.log(`   💡 请运行部署脚本下载GOST: ./deploy.sh`);
  }
  
  // 检查配置目录
  console.log('\n📋 检查配置目录...');
  checkItem('config 目录存在', fs.existsSync(path.join(__dirname, '../config')));
  
  // 检查数据库
  console.log('\n💾 检查数据库...');
  try {
    const { sequelize } = require('../services/dbService');
    await sequelize.authenticate();
    checkItem('数据库连接正常', true);
    await sequelize.close();
  } catch (error) {
    checkItem('数据库连接正常', false);
  }
  
  // 总结
  console.log('\n📊 检查结果:');
  console.log(`✅ 成功项目: ${successCount}`);
  console.log(`⚠️ 警告项目: ${warningCount}`);
  console.log(`❌ 错误项目: ${errorCount}`);
  
  if (errorCount === 0) {
    console.log('\n🎉 所有检查通过！GOST 集成配置正确。');
    return true;
  } else {
    console.log('\n❌ 发现错误，请检查配置。');
    return false;
  }
}

if (require.main === module) {
  checkGostIntegration();
}

module.exports = checkGostIntegration;
