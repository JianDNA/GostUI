const { sequelize, User } = require('../models');

async function checkDatabase() {
  try {
    // 测试数据库连接
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 查询所有用户
    const users = await User.findAll();
    console.log('\n数据库中的用户列表:');
    console.log('总用户数:', users.length);
    
    users.forEach(user => {
      console.log('\n用户详情:');
      console.log('ID:', user.id);
      console.log('用户名:', user.username);
      console.log('邮箱:', user.email);
      console.log('角色:', user.role);
      console.log('密码哈希:', user.password);
      console.log('是否激活:', user.isActive);
    });

    // 特别检查 admin 用户
    const adminUser = await User.findOne({ where: { username: 'admin' } });
    if (adminUser) {
      console.log('\n找到 admin 用户:');
      console.log('ID:', adminUser.id);
      console.log('密码哈希:', adminUser.password);
      
      // 测试密码验证
      const testPassword = 'admin123';
      const isValid = await adminUser.comparePassword(testPassword);
      console.log('密码验证测试 (admin123):', isValid ? '成功' : '失败');
    } else {
      console.log('\n警告: 未找到 admin 用户!');
    }

    // 检查数据库表结构
    console.log('\n数据库表结构:');
    const tables = await sequelize.showAllSchemas();
    console.log('表列表:', tables);

    process.exit(0);
  } catch (error) {
    console.error('数据库检查失败:', error);
    process.exit(1);
  }
}

checkDatabase(); 