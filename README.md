# AI 投射卡（OH 卡 × AI）

把心理学 OH 投射卡搬进浏览器，用 AI 引导「看图 → 联想 → 故事 → 自我联结」的深度自我探索，并生成个人探索报告。
产品哲学：**图片不是答案，AI 不是权威**——提问帮助表达继续，而不是替用户给出解释。

## 核心功能
- 28 张投射卡，每张附隐藏场景描述供 AI 提问；
- 三阶段 AI 引导对话（展开所见 → 故事化 → 感受与联结），支持语音输入；
- 探索结束生成结构化报告（主题 / 核心观察 / 内在冲突 / 需要 / 资源 / 内在力量 / 反思问题 / 每周练习）；
- 探索历史与成长轨迹；
- 完整后端：游客零摩擦 + 邮箱注册、游客→账号数据迁移、JWT（15 分钟访问 + 30 天刷新轮换）、httpOnly cookie、AES-256-GCM 加密存储、PostgreSQL；
- 三层限流防护、访问口令门、token 过期无感刷新。

## 技术栈
- 前端：Next.js 15 + React 18 + TypeScript + Tailwind 4 + framer-motion
- AI：多提供商抽象（Anthropic / OpenAI / DeepSeek / 智谱 / 自定义 OpenAI 兼容）
- 后端：Fastify 5 + pg + jose + argon2 + zod + vitest
- 部署：Docker / docker-compose

## 运行
```bash
# 前端
cp .env.local.example .env.local   # 填入 AI_PROVIDER / AI_API_KEY
npm install && npm run dev
# 后端
cd server && cp .env.example .env  # 配置 DATABASE_URL / JWT / 加密密钥
npm install && npm run dev
```

## 完成度与边界
可用产品级原型（约 70%）。前端 build 通过、后端单测通过；流式输出、主题时间线渲染、无障碍收尾待做。
本项目为自我探索工具，**不提供心理评估或诊断**。

> 公开仓库已移除所有 .env 密钥与本地配置；数据库密码为占位符，请自行配置。
