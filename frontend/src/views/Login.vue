<template>
  <div class="login-container">
    <el-card class="login-card">
      <div class="title">GOST 管理系统</div>
      <el-form
        :model="loginForm"
        :rules="rules"
        ref="loginFormRef"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="loginForm.username"
            placeholder="请输入用户名"
          >
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="请输入密码"
            show-password
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" native-type="submit" class="login-button">
            {{ loading ? '登录中...' : '登录' }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'

const store = useStore()
const router = useRouter()
const route = useRoute()
const loginFormRef = ref(null)
const loading = ref(false)

const loginForm = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '长度在 3 到 20 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 1, max: 20, message: '密码不能为空', trigger: 'blur' }
  ]
}

const handleLogin = async () => {
  if (!loginFormRef.value) return

  try {
    await loginFormRef.value.validate()
    loading.value = true
    
    // 登录并获取 token
    await store.dispatch('user/login', loginForm)
    
    // 获取完整的用户信息
    const user = await store.dispatch('user/getCurrentUser')
    console.log('Current user:', user)
    
    ElMessage.success('登录成功')
    
    // 根据用户角色重定向
    const redirectPath = route.query.redirect || (user.role === 'admin' ? '/admin' : '/dashboard')
    router.push(redirectPath)
  } catch (error) {
    console.error('Login error:', error)
    ElMessage.error(error.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  height: 100vh;
  width: 100vw;
  display: flex;
  justify-content: center;
  align-items: center;
  background: radial-gradient(ellipse at center, #8b5cf6 0%, #6366f1 35%, #4f46e5 70%, #3730a3 100%);
  position: relative;
  overflow: hidden;
}

.login-container::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background:
    radial-gradient(circle at 25% 25%, rgba(168, 85, 247, 0.4) 0%, transparent 40%),
    radial-gradient(circle at 75% 75%, rgba(99, 102, 241, 0.3) 0%, transparent 40%),
    radial-gradient(circle at 50% 10%, rgba(139, 92, 246, 0.2) 0%, transparent 30%),
    radial-gradient(circle at 10% 90%, rgba(196, 181, 253, 0.3) 0%, transparent 35%),
    radial-gradient(circle at 90% 10%, rgba(147, 51, 234, 0.2) 0%, transparent 30%);
  animation: float 20s ease-in-out infinite;
}

.login-container::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(45deg,
    rgba(139, 92, 246, 0.1) 0%,
    transparent 25%,
    rgba(99, 102, 241, 0.1) 50%,
    transparent 75%,
    rgba(168, 85, 247, 0.1) 100%);
  animation: shimmer 15s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateX(0px) translateY(0px) rotate(0deg);
  }
  25% {
    transform: translateX(20px) translateY(-15px) rotate(1deg);
  }
  50% {
    transform: translateX(-10px) translateY(-25px) rotate(-0.5deg);
  }
  75% {
    transform: translateX(-20px) translateY(-10px) rotate(0.5deg);
  }
}

@keyframes shimmer {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}

.login-card {
  width: 420px;
  padding: 40px;
  border-radius: 28px;
  box-shadow:
    0 25px 50px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(255, 255, 255, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(40px) saturate(200%);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  position: relative;
  z-index: 10;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.login-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg,
    rgba(255, 255, 255, 0.2) 0%,
    rgba(255, 255, 255, 0.05) 50%,
    rgba(255, 255, 255, 0.02) 100%);
  border-radius: 28px;
  z-index: -1;
}

.login-card:hover {
  transform: translateY(-5px) scale(1.01);
  box-shadow:
    0 35px 70px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.title {
  font-size: 36px;
  color: #ffffff;
  text-align: center;
  margin-bottom: 40px;
  font-weight: 900;
  letter-spacing: 3px;
  position: relative;
  text-shadow:
    0 0 30px rgba(255, 255, 255, 0.5),
    0 2px 15px rgba(139, 92, 246, 0.4),
    0 4px 25px rgba(0, 0, 0, 0.3);
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.2));
}

.title::after {
  content: '';
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 80px;
  height: 3px;
  background: linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7);
  border-radius: 2px;
  box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
}

.login-form {
  margin-top: 20px;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 32px;
}

.login-form :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

.login-form :deep(.el-input) {
  height: 52px;
}

.login-form :deep(.el-input__wrapper) {
  border-radius: 12px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

.login-form :deep(.el-input__wrapper:hover) {
  border-color: rgba(255, 255, 255, 0.4);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1),
              inset 0 1px 3px rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.2);
}

.login-form :deep(.el-input__wrapper.is-focus) {
  border-color: rgba(255, 255, 255, 0.5);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.15),
              inset 0 1px 3px rgba(0, 0, 0, 0.1);
  background: rgba(255, 255, 255, 0.25);
}

.login-form :deep(.el-input__inner) {
  height: 50px;
  line-height: 50px;
  font-size: 16px;
  color: #ffffff;
  background: transparent;
}

.login-form :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.7);
}

.login-button {
  width: 100%;
  height: 52px;
  font-size: 16px;
  font-weight: 700;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.7));
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #6366f1;
  transition: all 0.3s ease;
  margin-top: 12px;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 15px rgba(255, 255, 255, 0.2);
}

.login-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s;
}

.login-button:hover::before {
  left: 100%;
}

.login-button:hover {
  transform: translateY(-3px);
  background: linear-gradient(135deg, rgba(255, 255, 255, 1), rgba(255, 255, 255, 0.9));
  box-shadow: 0 8px 25px rgba(255, 255, 255, 0.3);
  color: #5b21b6;
}

.login-button:active {
  transform: translateY(-1px);
}

/* 表单验证错误信息样式优化 */
.login-form :deep(.el-form-item__error) {
  color: #ff4757 !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5) !important;
  margin-top: 6px !important;
  padding: 0 !important;
  background: none !important;
  border: none !important;
  animation: errorFadeIn 0.3s ease-out;
}

@keyframes errorFadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 输入框错误状态样式 */
.login-form :deep(.el-form-item.is-error .el-input__wrapper) {
  border-color: rgba(255, 71, 87, 0.8) !important;
  box-shadow: 0 0 0 2px rgba(255, 71, 87, 0.3),
              inset 0 1px 3px rgba(0, 0, 0, 0.1) !important;
  background: rgba(255, 71, 87, 0.08) !important;
  animation: errorShake 0.5s ease-in-out;
}

.login-form :deep(.el-form-item.is-error .el-input__inner) {
  color: #ffffff !important;
}

@keyframes errorShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}
</style>
