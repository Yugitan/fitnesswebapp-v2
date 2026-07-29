# 小白Amax — 企业级项目目录结构规范

> 当前产品只做 **动作展示库 + 健身训练记录**。目录设计采用“前端单体应用 + 可扩展工程边界”的方式：MVP 不引入后端，但保留后续扩展空间。

---

## 1. 顶层目录

```txt
健身webapp/
├── apps/
│   └── web/                         # React + Vite 前端应用
├── packages/
│   ├── domain/                      # 领域模型、类型、纯业务规则
│   ├── exercise-data/               # 动作数据适配、中文别名、搜索索引构建
│   ├── local-db/                    # IndexedDB schema、repository、迁移
│   ├── ui/                          # 可复用 UI 组件和设计 token
│   └── utils/                       # 通用工具函数
├── scripts/                         # 数据转换、校验、构建辅助脚本
├── docs/
│   ├── adr/                         # 架构决策记录
│   ├── project-structure.md         # 本文件
│   └── figma-prototype-prompt.md    # 原型设计提示词
├── data/
│   ├── raw/                         # 外部原始数据，只读，不在业务中直接改
│   ├── processed/                   # 由脚本生成的应用可用数据
│   └── dictionaries/                # 中文别名、部位/器械/肌群映射
├── public-assets/
│   ├── exercise-images/             # 对外发布的动作缩略图
│   └── exercise-gifs/               # 对外发布的动作 GIF，按需缓存
├── tests/
│   ├── e2e/                         # Playwright 端到端测试
│   └── fixtures/                    # 测试数据
├── .github/
│   └── workflows/                   # CI/CD
├── CONTEXT.md                       # 领域词汇表
├── PRD.md                           # 产品需求文档
├── package.json                     # workspace 根配置
├── pnpm-workspace.yaml              # pnpm workspace
├── tsconfig.base.json               # TypeScript 基础配置
├── eslint.config.js                 # 代码规范
├── prettier.config.js               # 格式化规范
└── README.md                        # 项目入口说明
```

当前已有的 `动作库/exercises-dataset/` 和 `赛博私教skill/` 应视为外部资料来源。正式工程化后，动作库原始数据建议迁移或同步到 `data/raw/exercises-dataset/`；GymBuddy 资料暂不进入 MVP 主链路。

---

## 2. 前端应用目录

```txt
apps/web/
├── public/
│   ├── manifest.webmanifest
│   ├── icons/
│   └── robots.txt
├── src/
│   ├── app/                         # 应用装配层
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   ├── providers.tsx
│   │   └── error-boundary.tsx
│   ├── pages/                       # 路由页面
│   │   ├── today/
│   │   ├── exercises/
│   │   ├── workout-editor/
│   │   ├── workout-detail/
│   │   ├── history/
│   │   └── settings/
│   ├── features/                    # 按业务功能组织
│   │   ├── exercise-browser/
│   │   ├── exercise-detail/
│   │   ├── workout-editor/
│   │   ├── workout-history/
│   │   ├── favorite-exercises/
│   │   └── data-portability/
│   ├── entities/                    # 前端实体视图模型
│   │   ├── exercise/
│   │   ├── workout/
│   │   └── training-set/
│   ├── shared/                      # 应用内共享能力
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── styles/
│   │   └── assets/
│   ├── service-worker/              # PWA 和 runtime cache 配置
│   ├── main.tsx
│   └── vite-env.d.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
└── package.json
```

### 2.1 分层规则

| 层级 | 职责 | 允许依赖 |
|------|------|----------|
| `app/` | 路由、全局 Provider、错误边界、应用启动 | `pages`, `shared`, `packages/*` |
| `pages/` | 页面编排，不写复杂业务规则 | `features`, `entities`, `shared` |
| `features/` | 用户可感知的功能模块 | `entities`, `shared`, `packages/*` |
| `entities/` | 实体展示组件、实体相关 hooks | `shared`, `packages/domain` |
| `shared/` | 无业务语义的通用组件和工具 | 不依赖 `pages/features/entities` |
| `packages/domain` | 纯领域类型和规则 | 不依赖 React、不依赖浏览器 API |
| `packages/local-db` | 本地持久化 | `packages/domain` |

原则：业务规则不要散落在页面组件里；页面只负责组合，规则放到 `features/` 或 `packages/domain/`。

---

## 3. 业务包目录

### 3.1 `packages/domain`

```txt
packages/domain/
├── src/
│   ├── exercise/
│   │   ├── exercise.types.ts
│   │   ├── exercise.mappers.ts
│   │   └── exercise-search.ts
│   ├── workout/
│   │   ├── workout.types.ts
│   │   ├── workout-summary.ts
│   │   └── workout-validation.ts
│   ├── training-set/
│   │   ├── training-set.types.ts
│   │   └── volume.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

要求：

- 只写纯 TypeScript，不引用 React、DOM、IndexedDB。
- 所有训练量、统计、校验、搜索字段生成等规则优先放这里。
- 这个包必须容易单元测试。

### 3.2 `packages/exercise-data`

```txt
packages/exercise-data/
├── src/
│   ├── load-exercises.ts
│   ├── normalize-exercise.ts
│   ├── build-search-index.ts
│   └── index.ts
├── dictionaries/
│   ├── body-parts.zh.json
│   ├── equipment.zh.json
│   ├── muscles.zh.json
│   └── exercise-aliases.zh.json
├── package.json
└── tsconfig.json
```

要求：

- 原始动作数据不可直接手改。
- 中文名称、中文别名、部位映射、器械映射放在 `dictionaries/`。
- 搜索索引由脚本生成，避免运行时做大量重复转换。

### 3.3 `packages/local-db`

```txt
packages/local-db/
├── src/
│   ├── db.ts                         # IndexedDB 初始化
│   ├── schema.ts                     # 表结构和版本
│   ├── migrations/
│   ├── repositories/
│   │   ├── workout.repository.ts
│   │   ├── favorite-exercise.repository.ts
│   │   └── settings.repository.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

要求：

- 所有 IndexedDB 访问只能从 repository 进入。
- UI 不直接调用 IndexedDB API。
- 每次 schema 变化必须写迁移说明。

### 3.4 `packages/ui`

```txt
packages/ui/
├── src/
│   ├── components/
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── dialog.tsx
│   │   ├── drawer.tsx
│   │   └── tabs.tsx
│   ├── icons/
│   ├── tokens/
│   ├── cn.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

要求：

- 只放无业务语义组件。
- 业务组件如“动作卡片”“训练组表格”放在 `features/` 或 `entities/`。

---

## 4. 数据与资源目录

```txt
data/
├── raw/
│   └── exercises-dataset/
│       ├── data/exercises.json
│       ├── images/
│       └── videos/
├── processed/
│   ├── exercises.normalized.json
│   └── exercises.search-index.json
└── dictionaries/
    ├── body-parts.zh.json
    ├── equipment.zh.json
    ├── muscles.zh.json
    └── exercise-aliases.zh.json

public-assets/
├── exercise-images/
└── exercise-gifs/
```

规则：

- `data/raw/` 是供应商/外部数据快照，不做业务编辑。
- `data/processed/` 是生成物，可删除重建。
- `data/dictionaries/` 是本项目维护的中文体验资产，需要 code review。
- `public-assets/` 是最终给前端访问的发布资源。
- GIF 保持 180x180，并保留 `© Gym visual` 归属展示。

---

## 5. 测试目录

```txt
tests/
├── e2e/
│   ├── exercise-browser.spec.ts
│   ├── workout-editor.spec.ts
│   └── history.spec.ts
├── fixtures/
│   ├── exercises.sample.json
│   └── workouts.sample.json
└── README.md
```

单元测试建议靠近源码：

```txt
packages/domain/src/workout/workout-summary.test.ts
packages/exercise-data/src/normalize-exercise.test.ts
packages/local-db/src/repositories/workout.repository.test.ts
```

P0 至少覆盖：

- 动作搜索能按英文名、中文别名、器械、部位命中
- 新建训练、添加动作、添加组、复制上一组、保存
- 历史页能展示刚保存的训练
- 数据导出后可重新导入

---

## 6. 命名规范

### 6.1 文件命名

- React 组件：`kebab-case.tsx`，例如 `exercise-card.tsx`
- hooks：`use-*.ts`，例如 `use-workout-editor.ts`
- 类型：`*.types.ts`
- 业务规则：使用明确名词，例如 `workout-summary.ts`
- repository：`*.repository.ts`
- 测试：`*.test.ts` 或 `*.spec.ts`

### 6.2 代码命名

- 组件：`PascalCase`
- 函数和变量：`camelCase`
- 类型和接口：`PascalCase`
- 常量：`SCREAMING_SNAKE_CASE`
- 路由路径：小写复数，例如 `/exercises`、`/workouts/:id`

---

## 7. 环境与配置

```txt
apps/web/
├── .env.example
├── .env.local
└── src/shared/config/
    ├── env.ts
    └── feature-flags.ts
```

规则：

- `.env.local` 不提交。
- 所有环境变量必须在 `.env.example` 中声明。
- 前端环境变量统一走 `env.ts` 解析，不在业务代码里直接读 `import.meta.env`。
- 功能开关集中在 `feature-flags.ts`，避免散落在页面。

---

## 8. CI/CD 规范

```txt
.github/workflows/
├── ci.yml
└── preview.yml
```

CI 至少执行：

- install
- typecheck
- lint
- unit test
- build
- e2e smoke test

部署策略：

- `main` 分支部署生产环境
- PR 自动生成预览环境
- 静态资源长期缓存，应用入口 HTML 禁止长期缓存

---

## 9. 当前阶段落地顺序

第一阶段先创建最小可运行结构：

```txt
apps/web/
packages/domain/
packages/exercise-data/
packages/local-db/
docs/
data/dictionaries/
scripts/
```

第二阶段再补：

```txt
packages/ui/
tests/e2e/
.github/workflows/
public-assets/
```

这样既不会一开始目录空到发虚，也不会把企业级架子搭得比产品还重。
