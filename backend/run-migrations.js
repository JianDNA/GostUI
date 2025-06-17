/**
 * 数据库迁移运行器
 * 
 * 用于在系统更新时自动运行必要的数据库迁移
 */

const fs = require('fs');
const path = require('path');

async function runMigrations() {
  console.log('🔄 开始运行数据库迁移...');
  
  const migrationsDir = path.join(__dirname, 'migrations');
  
  // 检查迁移目录是否存在
  if (!fs.existsSync(migrationsDir)) {
    console.log('⚠️ 迁移目录不存在，跳过迁移');
    return { success: true, skipped: true };
  }
  
  // 获取所有迁移文件
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.js'))
    .sort(); // 按文件名排序执行
  
  if (migrationFiles.length === 0) {
    console.log('⚠️ 没有找到迁移文件，跳过迁移');
    return { success: true, skipped: true };
  }
  
  console.log(`📋 找到 ${migrationFiles.length} 个迁移文件`);
  
  const results = [];
  
  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDir, file);
    const migrationName = path.basename(file, '.js');
    
    console.log(`\n🔄 运行迁移: ${migrationName}`);
    
    try {
      // 动态加载迁移模块
      delete require.cache[require.resolve(migrationPath)]; // 清除缓存
      const migration = require(migrationPath);
      
      // 执行迁移
      const result = await migration();
      
      results.push({
        name: migrationName,
        success: result.success,
        skipped: result.skipped,
        migrated: result.migrated,
        error: result.error
      });
      
      if (result.success) {
        if (result.skipped) {
          console.log(`✅ ${migrationName}: 跳过（无需操作）`);
        } else if (result.migrated) {
          console.log(`✅ ${migrationName}: 迁移成功`);
        } else {
          console.log(`✅ ${migrationName}: 完成`);
        }
      } else {
        console.error(`❌ ${migrationName}: 失败 - ${result.error}`);
      }
      
    } catch (error) {
      console.error(`❌ ${migrationName}: 执行出错 - ${error.message}`);
      results.push({
        name: migrationName,
        success: false,
        error: error.message
      });
    }
  }
  
  // 汇总结果
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const migrated = results.filter(r => r.migrated).length;
  const skipped = results.filter(r => r.skipped).length;
  
  console.log('\n📊 迁移结果汇总:');
  console.log(`   ✅ 成功: ${successful}`);
  console.log(`   ❌ 失败: ${failed}`);
  console.log(`   🔄 已迁移: ${migrated}`);
  console.log(`   ⏭️ 跳过: ${skipped}`);
  
  if (failed > 0) {
    console.log('\n❌ 部分迁移失败，请检查错误信息');
    return { success: false, results };
  } else {
    console.log('\n✅ 所有迁移完成');
    return { success: true, results };
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runMigrations()
    .then(result => {
      if (result.success) {
        console.log('🎉 数据库迁移完成');
        process.exit(0);
      } else {
        console.error('💥 数据库迁移失败');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('💥 迁移过程出错:', error);
      process.exit(1);
    });
}

module.exports = runMigrations;
