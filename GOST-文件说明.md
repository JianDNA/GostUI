# 📁 GOST文件说明

## 🎯 **GOST文件位置要求**

为了确保服务器部署成功，项目中需要包含GOST二进制文件：

### 📂 **必需的文件位置**

```
backend/
├── bin/
│   └── gost                    # GOST可执行文件
└── assets/
    └── gost/
        ├── gost                # GOST可执行文件（备份）
        ├── LICENSE             # 许可证文件
        ├── README.md           # 说明文档
        └── linux_amd64/        # Linux AMD64版本目录（可选）
```

### ✅ **当前项目状态**

- **✅ backend/bin/gost**: 主要的GOST可执行文件
- **✅ backend/assets/gost/gost**: 备份的GOST可执行文件
- **✅ 文档文件**: LICENSE, README.md等

### 🔧 **部署脚本的智能处理**

部署脚本 `server-deploy-from-git.sh` 会自动：

1. **检查文件存在性**: 检查两个位置的GOST文件
2. **设置执行权限**: 自动给GOST文件添加执行权限
3. **智能复制**: 如果某个位置缺失，从另一个位置复制
4. **版本测试**: 尝试运行 `gost -V` 验证文件有效性

### 🎯 **推荐的文件管理**

#### **保留的文件**
- `backend/bin/gost` - 主要可执行文件
- `backend/assets/gost/gost` - 备份可执行文件
- `backend/assets/gost/LICENSE` - 许可证
- `backend/assets/gost/README.md` - 说明文档

#### **已清理的文件**
- ❌ `*.tar.gz` - 压缩包文件
- ❌ `*.zip` - Windows压缩包
- ❌ `windows_*` - Windows版本目录
- ❌ `linux_386` - 32位Linux版本
- ❌ `gost.exe` - Windows可执行文件

### 🚀 **部署时的处理流程**

```bash
# 1. 检查GOST文件
⚙️ 配置GOST二进制文件...
✅ 发现backend/bin/gost
✅ 发现backend/assets/gost/gost

# 2. 设置权限
chmod +x backend/bin/gost
chmod +x backend/assets/gost/gost

# 3. 测试版本
🧪 测试GOST版本...
✅ GOST配置完成
```

### 🆘 **如果GOST文件缺失**

如果部署时提示GOST文件不存在：

```bash
❌ 未找到GOST二进制文件
💡 请确保Git仓库中包含GOST二进制文件
   - backend/bin/gost
   - backend/assets/gost/gost
```

**解决方案**：
1. 确保Git仓库中包含GOST文件
2. 检查文件权限
3. 重新克隆仓库

### 📊 **文件大小说明**

- **GOST二进制文件**: ~31MB
- **总的GOST相关文件**: ~31MB（已清理多余版本）
- **项目总大小**: ~470MB（包含所有源码）

### 🔒 **版本控制**

- **✅ 包含在Git中**: 稳定的GOST版本
- **✅ 固定版本**: 避免版本不兼容问题
- **✅ 跨平台**: 主要支持Linux AMD64
- **✅ 可靠性**: 经过测试的稳定版本

---

**💡 使用项目提供的固定GOST版本，确保部署的稳定性和可靠性！**
