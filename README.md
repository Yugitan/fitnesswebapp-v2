# 小白Amax

轻量健身工具 MVP：动作展示库 + 前后端训练记录。

## 开发

```bash
npm install
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

首次启动会在 `apps/api/.venv` 创建 Python 虚拟环境并安装 `apps/api/requirements.txt`。训练、训练组、收藏和备份数据由 FastAPI 保存到 `data/runtime/api-data.json`，运行时文件不会提交到 Git。

## 用户与游客

- 支持邮箱注册、登录和退出
- 登录会话默认有效 30 天，服务端只保存令牌哈希
- 游客无需注册即可完整使用训练与收藏功能
- 每台设备生成独立游客 ID，游客之间的数据相互隔离
- 注册或登录时，当前游客数据会自动合并到账号
- 游客关闭登录提示后，7 天内不会再次弹出

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
