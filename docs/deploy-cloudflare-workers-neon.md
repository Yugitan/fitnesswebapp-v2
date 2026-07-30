# Cloudflare Pages + Workers + Neon

此方案不使用 Render，也不要求绑定信用卡。Cloudflare Pages 承载前端和动作素材；Cloudflare Worker 提供 `/api`；Neon 保存 PostgreSQL 数据。

## 一次性初始化

1. 在 Neon 创建项目，优先选择新加坡或亚洲区域，复制连接串。
2. 在 Neon SQL Editor 打开并执行 `apps/worker/migrations/0001_initial.sql` 的全部内容。
3. 安装依赖并登录 Cloudflare：

```bash
npm install
cd apps/worker
npx wrangler login
```

设置数据库密钥：

```bash
cd apps/worker
npx wrangler secret put DATABASE_URL
```

粘贴 Neon 的 `postgresql://...` 连接串。它只保存在 Cloudflare Secret 中，不能放入 `VITE_` 变量或提交到 Git。

部署 Worker：

```bash
npx wrangler deploy
```

记下输出的 `https://<worker-name>.<account>.workers.dev` 地址，并访问 `/api/health` 验证服务。

## 部署 Pages

1. 推送仓库到 GitHub。
2. 在 Cloudflare Dashboard 的 **Workers & Pages** 创建 Pages 项目并选择仓库分支。
3. 设置 Build command 为 `npm run build`，Build output directory 为 `apps/web/dist`。
4. 设置 Pages 环境变量：

```text
VITE_API_BASE_URL=https://<worker-name>.<account>.workers.dev/api
NODE_VERSION=22
```

5. 部署后记下 `https://<project>.pages.dev`。
6. 允许该前端跨域访问 Worker：

```bash
cd apps/worker
npx wrangler secret put CORS_ALLOWED_ORIGIN
# 粘贴 https://<project>.pages.dev ，不要带最后的 /
npx wrangler deploy
```

## 上线检查

- Worker `/api/health` 返回 `{ "ok": true }`。
- Pages 中可加载动作 JSON 与 GIF。
- 注册、登录、新建训练、刷新后读取训练均正常。
- 浏览器控制台无 CORS 或 API 错误。

Cloudflare Worker 和 Pages 没有 Render 的 15 分钟休眠；Neon 免费计划仍有存储和计算额度，请在 Neon 控制台关注用量。
