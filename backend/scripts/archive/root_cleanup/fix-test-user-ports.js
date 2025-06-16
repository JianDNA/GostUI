/**
 * 修复test用户的额外端口配置
 * 
 * 这个脚本用于检查和修复test用户的额外端口配置，确保额外端口正确设置并可以在前端显示
 */

const { models } = require('./services/dbService');

async function fixTestUserPorts() {
  try {
    console.log('🔍 开始检查test用户的额外端口配置...');
    
    // 查找test用户
    const testUser = await models.User.findOne({
      where: { username: 'test' }
    });
    
    if (!testUser) {
      console.error('❌ test用户不存在');
      return;
    }
    
    console.log('✅ 找到test用户:', testUser.id);
    
    // 检查当前的额外端口配置
    console.log('当前端口范围:', testUser.portRangeStart, '-', testUser.portRangeEnd);
    console.log('当前额外端口原始数据:', testUser.additionalPorts);
    
    const currentPorts = testUser.getAdditionalPorts();
    console.log('解析后的额外端口:', currentPorts);
    
    // 设置正确的额外端口
    const requiredPorts = [12001, 12005, 12008, 16220, 6443];
    console.log('需要设置的额外端口:', requiredPorts);
    
    // 检查是否需要更新
    const needsUpdate = !currentPorts.length || 
                        !requiredPorts.every(port => currentPorts.includes(port)) ||
                        currentPorts.length !== requiredPorts.length;
    
    if (needsUpdate) {
      console.log('🔧 需要更新额外端口配置');
      
      // 设置新的额外端口
      testUser.setAdditionalPorts(requiredPorts);
      await testUser.save();
      
      console.log('✅ 额外端口已更新');
      
      // 验证更新
      const updatedPorts = testUser.getAdditionalPorts();
      console.log('更新后的额外端口:', updatedPorts);
    } else {
      console.log('✅ 额外端口配置正确，无需更新');
    }
    
    console.log('🎉 检查和修复完成');
  } catch (error) {
    console.error('❌ 修复过程中出错:', error);
  }
}

// 执行修复
fixTestUserPorts(); 