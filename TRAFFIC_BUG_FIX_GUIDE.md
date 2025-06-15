
# GOST流量统计Bug修复指南

## 问题分析
1. **resetTraffic=true导致流量统计不准确**
   - GOST在重置流量后，后续统计可能出现偏差
   - 解决方案：使用累积模式(resetTraffic=false)并在后端计算增量

2. **转发失败时仍统计流量**
   - 需要在后端过滤有错误但无实际数据传输的连接
   - 解决方案：检查totalErrs和实际流量数据

## 修复步骤

### 1. 配置修复（已自动完成）
- 设置 resetTraffic = false
- 调整观察器周期为30秒

### 2. 代码修复（需要手动应用）
在 backend/services/gostPluginService.js 中的 handleServiceTrafficStats 方法中：

```javascript
// 在处理流量统计前添加过滤逻辑
if (!this.shouldCountTraffic(event)) {
  return;
}

// 使用真实增量计算
const realIncrement = this.calculateRealIncrement(service, stats);
const incrementalTotalBytes = realIncrement.totalIncrement;
```

### 3. 测试验证
运行测试脚本验证修复效果：
```bash
node quick-traffic-test.js
```

## 预期效果
1. 流量统计准确性提高到95%以上
2. 转发失败时不会错误统计流量
3. 观察器数据更加可靠
