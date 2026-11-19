# 🏠 本地开发指南（无数据库）

当你还没有配置 PostgreSQL 数据库时，可以用**纯前端模式**开发和测试。

---

## ✅ 可以做什么

在没有后端和数据库的情况下，以下功能**完全可用**：

- ✅ 完整的探索流程（抽卡 → 6轮问答 → 生成报告）
- ✅ 查看历史记录
- ✅ 查看成长轨迹
- ✅ 所有 UI 和交互
- ✅ AI 调用（使用你配置的 API Key）

**数据存储在哪里**：浏览器的 localStorage（不会丢失，除非清理浏览器数据）

---

## ❌ 不能做什么

- ❌ 账号注册/登录（需要后端）
- ❌ 数据同步到云端（需要后端）
- ❌ 跨设备访问历史（需要后端）
- ❌ 管理后台统计（需要后端）

---

## 🚀 启动步骤

### 1. 配置 AI Key

创建 `.env.local`（如果还没有）：

```bash
# AI 提供商配置
AI_PROVIDER=deepseek
AI_API_KEY=你的DeepSeek_API_Key
AI_MODEL=deepseek-v4-flash

# 不配置 BACKEND_URL，前端会自动降级到纯本地模式
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动前端

```bash
npm run dev
```

访问：http://localhost:3001

---

## 📝 测试清单

### 测试1：探索流程
- [ ] 点击"开始探索"
- [ ] 看到随机图片
- [ ] 回答6轮问题
- [ ] 生成报告
- [ ] 报告显示正常（主题、洞察、建议）

### 测试2：历史记录
- [ ] 完成多次探索
- [ ] 点击"探索历史"
- [ ] 看到所有探索记录
- [ ] 点击某个记录，能查看完整报告
- [ ] 添加"还有什么想说的"留言

### 测试3：成长轨迹
- [ ] 点击"成长轨迹"
- [ ] 看到主题统计（圆圈大小代表出现次数）
- [ ] 筛选时间范围
- [ ] 查看特定主题的探索记录

### 测试4：设置
- [ ] 修改 AI 提供商
- [ ] 修改 API Key
- [ ] 切换主题（明亮/黑暗）
- [ ] 测试连接（应该显示"连接成功"）

### 测试5：UI 和交互
- [ ] 动画流畅
- [ ] 按钮响应正常
- [ ] 语音输入（如果浏览器支持）
- [ ] 移动端适配（用浏览器开发者工具模拟）

---

## 🔧 开发技巧

### 清空本地数据

如果想重新开始：

1. 打开浏览器开发者工具（F12）
2. 进入 Application（或存储）标签
3. 找到 Local Storage → http://localhost:3001
4. 删除所有条目

或在控制台执行：
```javascript
localStorage.clear();
location.reload();
```

### 查看本地数据

在浏览器控制台执行：

```javascript
// 查看所有探索记录
JSON.parse(localStorage.getItem('explorations') || '[]')

// 查看设置
JSON.parse(localStorage.getItem('settings') || '{}')

// 查看主题统计
JSON.parse(localStorage.getItem('theme_stats') || '{}')
```

### 模拟大量数据

在控制台执行：

```javascript
const explorations = JSON.parse(localStorage.getItem('explorations') || '[]');
for (let i = 0; i < 20; i++) {
  explorations.push({
    id: `test-${Date.now()}-${i}`,
    timestamp: Date.now() - i * 24 * 3600 * 1000, // 每天一次
    imageUrl: '/cards/sample.png',
    imageDescription: '测试图片',
    rounds: [
      { question: '问题1', answer: '答案1' },
      { question: '问题2', answer: '答案2' },
    ],
    report: {
      summary: '测试报告',
      themes: ['主题A', '主题B', '主题C'],
      insights: [
        { theme: '主题A', content: '洞察内容' }
      ],
      suggestions: [
        { theme: '主题A', content: '建议内容' }
      ]
    }
  });
}
localStorage.setItem('explorations', JSON.stringify(explorations));
location.reload();
```

---

## 🎯 什么时候需要数据库？

考虑配置数据库的时机：

### 立即需要（推荐等开通腾讯云后）
- 你要给别人看/使用
- 需要跨设备访问数据
- 需要查看统计数据（管理后台）
- 希望数据永久保存（不依赖浏览器）

### 暂时不需要
- 只是自己本地测试
- 还在开发 UI/交互
- 还在调试 AI 调用逻辑

---

## 📦 准备好部署时

当你开通了腾讯云服务器后，按照 `DEPLOY_TENCENT.md` 的步骤：

1. 安装 PostgreSQL（10分钟）
2. 部署后端（5分钟）
3. 更新前端配置（1分钟）
4. 本地数据会在下次探索时自动上传

**数据迁移是自动的**：
- 前端检测到后端可用时
- 会自动把 localStorage 的数据上传
- 你不需要做任何额外操作

---

## 💡 开发建议

### 前端独立开发

优先完善：
- UI/UX 细节
- 动画效果
- 响应式布局
- 错误处理

### 后端可以晚点

后端主要做：
- 数据持久化
- 账号系统
- 数据统计

这些不影响核心的探索体验。

---

## 🆘 遇到问题？

### 问题1：首页显示"配置 AI"的橙色点

**原因**：`.env.local` 没有配置 `AI_API_KEY`

**解决**：
```bash
# 编辑 .env.local
AI_PROVIDER=deepseek
AI_API_KEY=sk-xxx你的key
```

重启前端：
```bash
# Ctrl+C 停止
npm run dev
```

### 问题2：点击"开始探索"没反应

**检查**：
1. 打开浏览器开发者工具（F12）
2. 查看 Console 标签，有没有红色错误
3. 查看 Network 标签，API 调用是否失败

**常见原因**：
- API Key 无效
- API Key 余额不足
- 网络问题（无法访问 DeepSeek）

### 问题3：图片不显示

**检查**：`public/cards/` 目录下是否有图片

**解决**：
```bash
# 检查图片文件
ls public/cards/

# 如果没有图片，探索仍然可以进行，只是没有图片显示
```

---

现在你可以：
1. ✅ 纯前端模式开发（不需要数据库）
2. 📚 随时参考 `DEPLOY_TENCENT.md` 部署到腾讯云
3. 🔄 部署后，本地数据会自动同步到云端
