/**
 * 生产环境测试功能启用器
 * 仅限管理员在生产环境下启用测试功能
 */

import { isProduction, enableApiTestMode, disableApiTestMode } from './env';

/**
 * 生产环境测试启用器类
 */
class ProductionTestEnabler {
  constructor() {
    this.isEnabled = false;
    this.checkInterval = null;
  }

  /**
   * 检查当前用户是否为管理员
   * @param {Object} user - 用户对象
   * @returns {boolean}
   */
  isAdmin(user) {
    return user && user.role === 'admin';
  }

  /**
   * 启用生产环境测试功能
   * @param {Object} user - 当前用户
   * @param {string} authCode - 授权码 (可选)
   * @returns {boolean} 是否成功启用
   */
  enable(user, authCode = null) {
    if (!isProduction()) {
      console.log('🔧 当前为开发环境，测试功能默认启用');
      return true;
    }

    if (!this.isAdmin(user)) {
      console.error('❌ 只有管理员可以在生产环境启用测试功能');
      return false;
    }

    // 可选的授权码验证
    if (authCode && !this.validateAuthCode(authCode)) {
      console.error('❌ 授权码无效');
      return false;
    }

    const success = enableApiTestMode(user);
    if (success) {
      this.isEnabled = true;
      this.startMonitoring();
      
      console.log('🧪 生产环境测试功能已启用');
      console.log('⚠️ 请谨慎使用，避免影响生产环境');
      console.log('💡 测试完成后请及时禁用');
      
      // 显示警告提示
      this.showProductionWarning();
    }

    return success;
  }

  /**
   * 禁用生产环境测试功能
   */
  disable() {
    disableApiTestMode();
    this.isEnabled = false;
    this.stopMonitoring();
    
    console.log('🔒 生产环境测试功能已禁用');
  }

  /**
   * 验证授权码 (可扩展)
   * @param {string} authCode - 授权码
   * @returns {boolean}
   */
  validateAuthCode(authCode) {
    // 简单的授权码验证，可以根据需要扩展
    const validCodes = [
      'ADMIN_TEST_2024',
      'PROD_DEBUG_MODE',
      'EMERGENCY_ACCESS'
    ];
    
    return validCodes.includes(authCode);
  }

  /**
   * 开始监控测试功能使用
   */
  startMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // 每5分钟检查一次，提醒管理员
    this.checkInterval = setInterval(() => {
      console.warn('⚠️ 生产环境测试功能仍在运行');
      console.log('💡 如果测试完成，请执行 window.productionTestEnabler.disable()');
    }, 5 * 60 * 1000);
  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * 显示生产环境警告
   */
  showProductionWarning() {
    const style = `
      background: #ff4757;
      color: white;
      padding: 10px;
      border-radius: 5px;
      font-weight: bold;
      font-size: 14px;
    `;

    console.log('%c⚠️ 生产环境测试模式已启用', style);
    console.log('%c请谨慎操作，避免影响正常业务', style);
    console.log('%c测试完成后请立即禁用此功能', style);

    // 在页面上显示警告横幅
    this.showWarningBanner();
  }

  /**
   * 在页面上显示警告横幅
   */
  showWarningBanner() {
    // 创建警告横幅
    const banner = document.createElement('div');
    banner.id = 'production-test-warning';
    banner.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #ff4757;
        color: white;
        padding: 10px;
        text-align: center;
        font-weight: bold;
        z-index: 9999;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      ">
        ⚠️ 生产环境测试模式已启用 - 请谨慎操作
        <button onclick="window.productionTestEnabler.disable(); this.parentElement.parentElement.remove();" 
                style="margin-left: 20px; padding: 5px 10px; background: white; color: #ff4757; border: none; border-radius: 3px; cursor: pointer;">
          禁用测试模式
        </button>
      </div>
    `;

    document.body.appendChild(banner);
  }

  /**
   * 获取当前状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      isProduction: isProduction(),
      isEnabled: this.isEnabled,
      hasMonitoring: !!this.checkInterval,
      enabledAt: localStorage.getItem('api_test_mode_enabled_at'),
      enabledBy: localStorage.getItem('api_test_mode_enabled_by')
    };
  }

  /**
   * 快速启用 (开发用)
   * @param {Object} user - 用户对象
   */
  quickEnable(user) {
    if (!this.isAdmin(user)) {
      console.error('❌ 权限不足');
      return false;
    }

    // 记录启用信息
    localStorage.setItem('api_test_mode_enabled_at', new Date().toISOString());
    localStorage.setItem('api_test_mode_enabled_by', user.username);

    return this.enable(user);
  }
}

// 创建全局实例
const productionTestEnabler = new ProductionTestEnabler();

// 在生产环境下暴露到全局对象
if (isProduction()) {
  window.productionTestEnabler = productionTestEnabler;
  console.log('🔒 生产环境测试启用器已加载');
  console.log('💡 管理员可使用 window.productionTestEnabler.enable(user) 启用测试功能');
}

export default productionTestEnabler;
