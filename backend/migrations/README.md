# 数据库迁移

这个目录包含数据库迁移文件。

## 新迁移系统

从2025年6月开始，我们使用新的迁移系统，不再依赖 sequelize-cli。

## 迁移文件结构

每个迁移文件应该导出一个异步函数，返回迁移结果：

```javascript
/**
 * 迁移描述
 */

async function migrateSomething() {
  try {
    // 检查是否需要迁移
    // 执行迁移逻辑

    return { success: true, migrated: true };
    // 或者 return { success: true, skipped: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = migrateSomething;
```

## 运行迁移

使用以下命令运行迁移：

```bash
# 运行所有迁移
node run-migrations.js

# 运行特定迁移
node migrations/fix-email-unique-constraint.js
```

## 迁移集成

迁移会在 `smart-update.sh` 更新脚本中自动运行，确保数据库结构与代码同步。

## 当前迁移

- `fix-email-unique-constraint.js`: 修复邮箱唯一性约束问题，允许多个用户邮箱为空
- `20250617063000-add-user-external-access-config.js`: 添加普通用户外部访问控制配置

## 迁移执行方式

### 自动执行（推荐）
- **新部署**: 通过 `complete_schema.sql` 自动包含配置
- **系统更新**: 通过 `smart-update.sh` 自动检查和添加配置

### 手动执行（备用）
```bash
# 运行特定迁移
node backend/run-single-migration.js 20250617063000-add-user-external-access-config.js
```

## 注意事项

1. 迁移文件应该是幂等的（可以安全地多次运行）
2. 迁移前会自动检查是否需要执行
3. 在生产环境运行迁移前，请先在测试环境验证
4. 迁移前请备份数据库
