# 小白Amax

轻量健身工具 MVP：动作展示库 + 前后端训练记录。

## 开发

```bash
npm install
docker compose -f docker-compose.postgres.yml up -d
export DATABASE_URL='postgresql+psycopg://amax:amax@127.0.0.1:5432/amax'
./scripts/setup-api.sh
cd apps/api && .venv/bin/alembic upgrade head && cd ../..
npm run dev
```

开发服务默认访问：

```txt
http://localhost:5173/Amax
```

`npm run dev` 会同时启动：

- Web：`http://localhost:5173/Amax`
- FastAPI：`http://127.0.0.1:8787/api`
- Swagger 文档：`http://127.0.0.1:8787/docs`

首次启动会在 `apps/api/.venv` 创建 Python 虚拟环境并安装 `apps/api/requirements.txt`。训练、训练组、收藏和账号数据保存在 PostgreSQL；连接地址由 `DATABASE_URL` 指定，可从 `apps/api/.env.example` 复制配置。启动服务前先执行数据库迁移。

### 从旧 JSON 数据迁移

旧的 `data/runtime/api-data.json` 可保留为备份。确认 PostgreSQL 已启动并执行完迁移后，运行：

```bash
export DATABASE_URL='postgresql+psycopg://amax:amax@127.0.0.1:5432/amax'
cd apps/api
.venv/bin/python scripts/migrate_json_to_postgres.py ../../data/runtime/api-data.json
```

如果 JSON 来自账号功能上线前，且训练数据没有 `ownerKey`，请额外提供它所属设备的游客身份，例如 `--legacy-owner-key guest:your-device-guest-id`。导入会以 JSON 文件内容完整替换目标数据库，务必在空库或确认覆盖范围后执行。

### 生产安全配置

- 配置 `ALLOWED_HOSTS` 为实际域名，并在反向代理处终止 TLS；确认 HTTPS 可用后将 `FORCE_HTTPS=true`。
- 登录在单个 API 进程内默认限制为 15 分钟 5 次失败尝试；多实例部署前应替换为 Redis 等共享限流服务。
- 定期备份 PostgreSQL，例如使用运行环境的数据库凭据执行 `pg_dump --format=custom --file=amax-$(date +%F).dump amax`，并将备份存放在独立于应用服务器的位置。
- 修改密码会保留当前设备会话，并使其他已登录设备失效。

## 用户与游客

- 支持邮箱注册、登录和退出
- 登录会话默认有效 30 天，服务端只保存令牌哈希
- 游客无需注册即可完整使用训练与收藏功能
- 每台设备生成独立游客 ID，游客之间的数据相互隔离
- 注册或登录时，当前游客数据会自动合并到账号
- 游客关闭登录提示后，3 天内不会再次弹出

应用已配置 Vite `base` 为 `/Amax/`，根路径 `/` 在开发和预览服务中会跳转到 `/Amax`。

验证命令：

```bash
npm run typecheck
npm run test:api
npm run build
```

## 架构

- 产品需求：`PRD.md`
- 领域词汇：`CONTEXT.md`
- 目录规范：`docs/project-structure.md`
- 后端接入检查：`docs/backend-readiness.md`
