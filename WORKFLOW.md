# 开发和部署工作流

## 🔄 日常开发流程

### 1. 开发阶段
```bash
# 修改代码
# 前端开发
cd frontend
npm run dev

# 后端开发
cd backend
npm start
```

### 2. 构建和提交
```bash
# 方式一：手动构建和提交
cd frontend
npm run build
cd ..
git add .
git commit -m "feat: 添加新功能"
git push

# 方式二：使用便捷脚本
./commit-with-build.sh
```

### 3. 服务器部署
```bash
# 在服务器上
cd ~/gost-management
./update.sh
# 选择 "使用预构建文件" 模式
```

## 📝 提交规范

### 提交类型
- `feat:` 新功能
- `fix:` 修复bug
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 代码重构
- `test:` 测试相关
- `build:` 构建产物更新
- `chore:` 其他杂项

### 示例
```bash
git commit -m "feat: 添加用户流量统计功能"
git commit -m "fix: 修复GOST配置保存问题"
git commit -m "build: 更新前端构建产物"
```

## 🚀 部署策略

### 开发环境
- 使用服务器端构建
- 实时代码更新
- 详细错误日志

### 生产环境
- 使用预构建文件
- 稳定性优先
- 性能优化

## 🔧 便捷脚本说明

### `commit-with-build.sh`
- 自动构建前端
- 智能检测代码变更
- 一键提交和推送

### `deploy.sh`
- 智能部署模式选择
- 自动备份用户数据
- 完整的错误处理

### `update.sh`
- 保留用户数据的更新
- 自动备份和恢复
- 服务无缝重启

## 💡 最佳实践

### 本地开发
1. 经常提交小的更改
2. 提交前先构建测试
3. 使用有意义的提交信息

### 服务器部署
1. 优先使用预构建模式
2. 部署前备份重要数据
3. 部署后验证功能正常

### 问题排查
1. 查看构建日志
2. 检查服务状态
3. 验证文件完整性

## 🔍 常见问题

### Q: 构建警告是否正常？
A: 你看到的Vite警告是关于模块循环引用的，已经修复。这些警告不影响功能，但修复后构建会更干净。

### Q: 每次都要手动构建吗？
A: 可以使用 `commit-with-build.sh` 脚本自动化这个过程。

### Q: 如何回滚部署？
A: 使用Git回滚代码，然后重新部署：
```bash
git revert <commit-hash>
git push
./update.sh
```

### Q: 构建文件很大怎么办？
A: 这是正常的，主要是Element Plus和图表库。可以考虑：
- 使用CDN
- 按需加载
- 代码分割优化
