# GOST管理系统 - 快速开始

## 🚀 一键部署 (推荐)

```bash
# 克隆项目
git clone https://github.com/JianDNA/GostUI.git
cd GostUI

# 一键部署
chmod +x deploy.sh
./deploy.sh
```

## 📋 部署要求

- **操作系统**: Linux (Ubuntu/CentOS/Debian)
- **Node.js**: >= 14.0.0
- **内存**: >= 2GB (推荐4GB)
- **磁盘**: >= 1GB 可用空间

## ⚡ 部署特点

- ✅ **自动环境检测** - 自动检查并安装必要工具
- ✅ **智能包管理** - 自动选择yarn或npm
- ✅ **错误恢复** - 自动处理常见安装问题
- ✅ **内存优化** - 自动设置Node.js内存限制
- ✅ **完整验证** - 部署后自动验证所有组件

## 🎯 部署结果

部署成功后：
- 🌐 **访问地址**: http://localhost:3000
- 🔐 **默认账号**: admin
- 🔑 **默认密码**: admin123

## 🔧 管理命令

```bash
# 进入部署目录
cd ~/gost-management

# 重启服务
pm2 restart gost-management

# 查看日志
pm2 logs gost-management

# 更新系统
./update.sh

# 测试部署
./test-deployment.sh
```

## 🛠️ 故障排除

### 如果部署失败：

1. **检查环境**
   ```bash
   node -v    # 应该 >= 14.0.0
   npm -v     # 应该有输出
   ```

2. **查看详细日志**
   ```bash
   pm2 logs gost-management
   ```

3. **重新部署**
   ```bash
   rm -rf ~/gost-management
   ./deploy.sh
   ```

### 常见问题：

- **端口占用**: 脚本会自动清理端口3000
- **内存不足**: 脚本会自动设置Node.js内存限制
- **权限问题**: 确保有sudo权限安装PM2
- **网络问题**: 确保能访问GitHub和npm仓库

## 📞 获取帮助

如果遇到问题：
1. 查看 `DEPLOY.md` 获取详细部署指南
2. 运行 `./test-deployment.sh` 诊断问题
3. 查看GitHub Issues获取社区帮助

---

**提示**: 首次部署建议使用一键部署脚本，它会自动处理所有复杂的配置和依赖问题。
