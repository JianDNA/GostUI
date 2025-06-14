# VMware共享文件夹中Node.js项目符号链接问题解决方案

## 问题描述

在VMware共享文件夹中运行Node.js项目时，由于VMware共享文件夹不支持符号链接操作，导致以下错误：

```
ENOTSUP: operation not supported on socket, symlink
```

这个错误会导致`npm install`和`npm run dev`等命令失败，无法正常启动应用程序。

## 解决方案

### 1. 使用NODE_PRESERVE_SYMLINKS环境变量

通过设置`NODE_PRESERVE_SYMLINKS=1`环境变量来启动Node.js应用程序，可以让Node.js在处理模块时保留符号链接，而不是解析它们。这样可以避免在VMware共享文件夹中创建符号链接的问题。

```bash
NODE_PRESERVE_SYMLINKS=1 node backend/app.js
```

### 2. 修复错误处理代码

在应用程序中，我们发现了几处错误处理不完善的地方，特别是在访问可能为undefined的对象的属性时。我们修复了以下文件中的错误处理代码：

- `gostConfigService.js`
  - 第43行：修复`generateGostConfig`函数中的错误处理
  - 第270行：修复`_getPluginConfig`方法中的错误处理
  - 第307行：修复`_getDisabledProtocols`方法中的错误处理
  - 第576行：修复`updateGostService`方法中的错误处理

- `gostSyncCoordinator.js`
  - 第323行：修复`performSync`方法中的错误处理

所有修复都遵循同样的模式：在访问对象的属性之前，先检查对象是否为undefined，例如：

```javascript
// 修复前
defaultLogger.error(`错误详情: ${error.message}`);

// 修复后
defaultLogger.error(`错误详情: ${error ? error.message : '未知错误'}`);
```

### 3. 使用空对象作为默认值

为了进一步增强代码的健壮性，我们在使用`inspectObject`函数时提供了空对象作为默认值，以防传入的对象为undefined：

```javascript
// 修复前
defaultLogger.error(`错误详情: ${inspectObject(error)}`);

// 修复后
defaultLogger.error(`错误详情: ${inspectObject(error || {})}`);
```

## 测试结果

通过以上修复，我们成功解决了在VMware共享文件夹中运行Node.js项目时的符号链接问题。应用程序现在可以正常启动和运行，不再出现`Cannot read properties of undefined (reading 'error')`错误。

## 建议

1. 在VMware共享文件夹中运行Node.js项目时，始终使用`NODE_PRESERVE_SYMLINKS=1`环境变量启动应用程序。

2. 考虑在项目的启动脚本或文档中添加这个环境变量的说明，以便其他开发者了解这个解决方案。

3. 在编写错误处理代码时，始终检查对象是否为undefined，特别是在访问对象的属性时。

4. 使用辅助函数（如本项目中的`inspectObject`和`safeGet`）来安全地处理可能为undefined的值。 