# Cloudflare Pages + Render + Neon 部署

本方案面向免费 Beta 发布：Cloudflare Pages 承载前端与动作素材，Render 运行 FastAPI，Neon 提供 PostgreSQL。

## 1. 推送代码

将当前分支推送到 GitHub。构建过程会在动作库不存在时自动从其公开源仓库下载，因此云端检出不会依赖本地目录。

## 2. 创建 Neon 数据库

1. 在 [Neon](https://neon.com) 创建一个 Postgres 项目。
2. 复制连接字符串。可直接粘贴 Neon 给出的 `postgresql://...` 格式；应用会自动使用 psycopg 3 驱动。

## 3. 部署 Render API

1. 在 Render 选择 **New → Blueprint**，选中本仓库；它会读取根目录的 `render.yaml`。
2. 创建后，在服务的 Environment 中填写：
   - `DATABASE_URL`：Neon 连接字符串；
   - `ALLOWED_HOSTS`：Render API 域名，不带 `https://`，例如 `xiaobai-amax-api.onrender.com`；
   - `CORS_ALLOWED_ORIGINS`：Cloudflare Pages 的完整域名，初次部署前可先使用预计的 `https://<项目名>.pages.dev`。
3. 等待部署完成，访问 `https://<api-domain>/api/health`，应返回 `{"ok":true,"framework":"FastAPI"}`。

> Render 免费 Web Service 空闲 15 分钟后会休眠；首次请求可能需要约一分钟。不要使用 Render 的免费 Postgres，它会在 30 天后过期。

## 4. 部署 Cloudflare Pages

1. 在 Cloudflare Pages 导入同一 GitHub 仓库。
2. 使用以下构建设置：
   - Build command：`npm run build`
   - Build output directory：`apps/web/dist`
3. 设置 Pages 的环境变量：
   - `VITE_API_BASE_URL=https://<api-domain>/api`
4. 部署后，回到 Render，将 `CORS_ALLOWED_ORIGINS` 更新为 Pages 实际地址（例如 `https://xiaobai-amax.pages.dev`），并触发一次 Render redeploy。

构建会把 `动作库/exercises-dataset` 复制到发布目录的 `/exercises-dataset`，因此前端 JSON、图片和 GIF 与应用同域提供。

## 上线前检查

- Cloudflare 页面能显示动作列表和动作 GIF。
- 可注册、登录、创建训练并刷新页面确认数据仍存在。
- Render `/api/health` 正常，且浏览器控制台没有 CORS 错误。
- Neon 控制台中已产生 `users`、`workouts` 等迁移表。

免费方案仅适合内测或低频使用。Render 会休眠；Neon 免费计划也有存储和计算配额，请在控制台设置用量提醒。
