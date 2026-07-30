# 小白Amax — 产品需求文档 (PRD)

> **版本**: v1.2 | **日期**: 2026-07-29 | **状态**: MVP 前端已进入本地优先实现阶段

---

## 1. 产品概述

### 1.1 一句话价值主张

**小白Amax** 是一个面向健身新手的轻量训练工具：快速查动作、看演示、记下每次训练，并能回顾自己的训练历史。

### 1.2 目标用户

- **主用户群**：中国高校学生、健身新手、预算有限但想系统训练的人
- **典型场景**：在学校健身房、宿舍或家中训练，边练边用手机查动作和记录重量/次数
- **核心痛点**：
  - 不知道某个动作怎么做，需要 GIF 和步骤说明
  - 训练时想快速搜索动作，不想被课程、社区、广告打断
  - 训练记录散落在备忘录里，无法回看自己练了什么、练了多少
  - 不想一打开就注册登录

### 1.3 产品定位

首版不做 AI 私教、不做社交、不做课程内容平台。产品先成为一个好用、干净、离线可用的 **动作库 + 训练日志**。

---

## 2. 功能范围

### 2.1 P0 — MVP 必做

#### P0-1：动作展示库

| 需求项 | 说明 |
|--------|------|
| 搜索框 | 支持英文动作名、中文别名、部位、器械、目标肌群搜索 |
| 分类筛选 | 按部位、器械、目标肌群筛选 |
| 动作列表 | 双列卡片展示缩略图、动作名、部位、器械 |
| 动作详情 | 展示 GIF、目标肌群、协同肌群、器械、中文/英文步骤 |
| 加入训练 | 从动作详情页一键加入今天的训练记录 |
| 收藏动作 | 本地收藏常用动作，方便训练时快速选择 |

**数据来源**：`动作库/exercises-dataset/data/exercises.json`。  
**注意**：原始数据只有英文 `name`，需要在应用侧维护中文动作名/别名映射。

#### P0-2：训练记录

| 需求项 | 说明 |
|--------|------|
| 新建训练 | 默认今天，可切换日期 |
| 添加动作 | 从动作库搜索、收藏动作或最近动作中添加 |
| 记录组数据 | 每个动作支持多组，记录重量 kg、次数 reps、备注 |
| 快速录入 | 支持复制上一组、添加一组、删除一组 |
| 训练摘要 | 自动计算总组数、总训练量、涉及部位、动作数量 |
| 本地保存 | 使用 IndexedDB，本地即时保存，不要求登录 |

#### P0-3：训练历史

| 需求项 | 说明 |
|--------|------|
| 日历视图 | 按月展示有训练记录的日期 |
| 历史列表 | 按时间倒序展示最近训练 |
| 训练详情 | 查看某次训练的完整动作和组数据 |
| 基础统计 | 本周训练次数、本月训练次数、总组数、总训练量 |

#### P0-4：本地数据管理

| 需求项 | 说明 |
|--------|------|
| 设置页 | 展示本设备训练记录数量和动作素材归属 |
| 数据导出 | 导出 IndexedDB 中的训练记录和收藏数据为 JSON |
| 数据导入 | 从 JSON 备份恢复本地数据 |
| 清空数据 | 支持清空当前设备上的本地训练记录和收藏 |

### 2.2 P1 — MVP 后增强

- 中文动作名与别名补全工具：优先覆盖常见 100-200 个动作
- 训练模板：新手全身、推拉腿、上/下肢、自重训练
- CSV 导出：在现有 JSON 备份之外，提供更适合表格查看的导出格式
- 渐进超负荷提示：对同一动作展示最近重量/次数趋势
- PWA 安装体验：离线打开、桌面图标、基础缓存策略

### 2.3 已实现的账号能力

- 邮箱注册、登录和退出登录
- 账号间训练记录与收藏数据隔离
- 游客匿名身份与游客间数据隔离
- 游客注册或登录后自动迁移当前设备数据
- 游客可关闭登录提示，关闭后每 7 天再次提醒

### 2.4 暂不做

- AI 健身问答
- DeepSeek API、RAG、Meilisearch、pgvector
- 用户登录、Supabase 云同步
- 社区、打卡广场、排行榜
- 个性化训练计划生成
- 医疗、体态诊断、拍照识别

---

## 3. 技术架构

### 3.1 技术选型

| 层面 | 选型 | 说明 |
|------|------|------|
| 前端 | React + Vite | 静态 SPA，开发和部署简单；当前部署 base path 为 `/Amax/` |
| UI | 全局 CSS + 少量本地 UI 包 | 移动端优先，当前未引入 Tailwind/shadcn 运行时 |
| 本地数据库 | IndexedDB | 保存训练记录、收藏、最近动作 |
| 状态管理 | React 内置 state/hooks | 当前数据量较小，暂不引入 React Query/Zustand |
| 搜索 | 前端本地索引 | 1,324 条动作数据可直接在浏览器搜索 |
| PWA | Web App Manifest | 已有 manifest；Service Worker 和离线缓存作为后续增强 |
| 后端 | FastAPI + Uvicorn | 提供训练、训练组、收藏和数据备份 API |
| 持久化 | JSON 文件（MVP） | 保存到 `data/runtime/api-data.json`，后续可迁移数据库 |
| 部署 | 前端静态托管 + Python API 服务 | 前端通过同源 `/api` 访问后端 |

### 3.2 项目目录

项目采用前后端 monorepo 结构，详见 `docs/project-structure.md`。`apps/web` 为 React 前端，`apps/api` 为 FastAPI 后端，`packages/data-client` 统一封装前端 API 调用。

### 3.3 架构图

```
用户浏览器
  ├─ 动作库页面
  │   ├─ 加载 exercises.json
  │   ├─ 本地搜索/筛选
  │   └─ 按需加载图片/GIF
  ├─ 训练记录页面
  │   ├─ IndexedDB 写入 Workout
  │   └─ IndexedDB 写入 TrainingSet
  ├─ 历史页面
  │   └─ 从 IndexedDB 聚合统计
  └─ PWA 缓存
      ├─ 应用壳
      ├─ 动作 JSON / 搜索索引
      └─ 图片/GIF 按需缓存
```

### 3.4 缓存策略

- 应用壳、核心 JS/CSS、动作 JSON 可预缓存
- 缩略图可按需缓存，不强制一次缓存全部
- GIF 文件较大，详情页访问后再缓存
- 不把全部 GIF 放进 install 阶段预缓存，避免安装慢和存储占用过高

---

## 4. 本地数据模型

### 4.1 Exercise

动作是只读静态数据，来自 `exercises.json`。

应用侧增加派生字段：

```ts
type ExerciseView = {
  id: string;
  name: string;
  nameZh?: string;
  aliasesZh: string[];
  bodyPart: string;
  bodyPartZh: string;
  equipment: string;
  equipmentZh: string;
  target: string;
  targetZh?: string;
  secondaryMuscles: string[];
  image: string;
  gifUrl: string;
  instructionSteps: {
    en: string[];
    zh: string[];
  };
  attribution: string;
};
```

### 4.2 Workout

```ts
type Workout = {
  id: string;
  date: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};
```

### 4.3 WorkoutExercise

```ts
type WorkoutExercise = {
  id: string;
  workoutId: string;
  exerciseId: string;
  sortOrder: number;
  notes?: string;
};
```

### 4.4 TrainingSet

```ts
type TrainingSet = {
  id: string;
  workoutExerciseId: string;
  setNumber: number;
  weightKg?: number;
  reps?: number;
  notes?: string;
  createdAt: string;
};
```

---

## 5. 前端路由

当前应用的浏览器访问前缀为 `/Amax`，下表中的路由均为应用内逻辑路由。例如动作库实际访问路径为 `/Amax/exercises`。

| 路由 | 页面 | 权限 |
|------|------|------|
| `/` | 今日训练 + 快捷入口 | 公开 |
| `/exercises` | 动作库搜索与筛选 | 公开 |
| `/exercises/:id` | 动作详情 | 公开 |
| `/favorites` | 收藏动作 | 公开 |
| `/record` | 训练记录入口 + 最近训练 | 公开 |
| `/workouts/new` | 新建训练记录 | 公开 |
| `/workouts/:id` | 训练详情 | 公开 |
| `/workouts/:id/edit` | 编辑训练记录 | 公开 |
| `/history` | 训练历史与统计 | 公开 |
| `/settings` | 数据导入/导出、缓存管理 | 公开 |

---

## 6. 体验原则

- **训练中可单手操作**：按钮和输入框适合手机拇指点击
- **少打字**：复制上一组、最近动作、收藏动作优先
- **弱网可用**：记录训练不依赖网络
- **少打扰**：不强制登录、不弹订阅、不做社交压力
- **数据安心**：提供导出/导入，明确提示数据当前保存在本设备

---

## 7. 里程碑

| 阶段 | 内容 | 预估 |
|------|------|------|
| M0 | PRD 收敛 + 信息架构确认 | 当前 |
| M1 | React/Vite 项目骨架 + 动作库浏览 | 3-5 天 |
| M2 | IndexedDB 训练记录闭环 | 5-7 天 |
| M3 | 历史/统计/收藏/导出 | 5-7 天 |
| M4 | PWA 缓存与移动端打磨 | 3-5 天 |

---

## 8. 后续决策记录

| 编号 | 决策 | 理由 |
|------|------|------|
| ADR-001 | 本地优先，首版不强制登录 | 降低使用门槛，训练记录必须弱网可用 |
| ADR-002 | MVP 暂不引入 AI；训练数据接入轻量后端 | 保持产品聚焦，同时建立可扩展的数据边界 |
| ADR-003 | GIF 按需缓存 | 避免 100MB+ 媒体资源拖慢首屏和安装 |
