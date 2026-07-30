# 后端接入前端逻辑检查备忘录

> 2026-07-29 更新：FastAPI 后端和前端 API client 已实现。训练、训练组、收藏、导入导出已改走 `/api`；本文件下方风险清单保留为实现背景和后续增强参考。

> 日期：2026-07-29  
> 目的：记录当前前端在接入后端前需要收口的逻辑、数据边界和推荐改造顺序，方便后续开发直接延续。

## 当前结论

当前前端能通过类型检查和生产构建：

```bash
npm run typecheck
npm run build
```

现有实现适合作为本地优先 MVP：动作库静态加载，训练记录、收藏和导入导出走 IndexedDB。准备接后端时，主要问题不是编译错误，而是页面层直接耦合本地数据库、部分业务规则没有统一校验，以及列表读取方式更适合本地而不适合远程 API。

## 当前数据流

- 动作数据：`packages/exercise-data` 从 `/exercises-dataset/data/exercises.json` 静态加载，并在前端归一化为 `ExerciseView`。
- 训练记录：页面直接调用 `@xiaobai-amax/local-db`，写入 IndexedDB。
- 收藏动作：`useFavorites` 直接调用 `listFavoriteExerciseIds` 和 `toggleFavoriteExercise`。
- 历史统计：页面先 `listWorkouts()`，再逐条 `getWorkoutBundle()`，最后在前端聚合。
- 设置页导入导出：直接导出或覆盖 IndexedDB 全部 store。

## 后端接入前的主要风险

### 1. 页面直接依赖 IndexedDB 实现

涉及文件：

- `apps/web/src/pages/today/TodayPage.tsx`
- `apps/web/src/pages/record/RecordPage.tsx`
- `apps/web/src/pages/history/HistoryPage.tsx`
- `apps/web/src/pages/workout-detail/WorkoutDetailPage.tsx`
- `apps/web/src/pages/workout-editor/WorkoutEditorPage.tsx`
- `apps/web/src/pages/exercises/ExerciseDetailPage.tsx`
- `apps/web/src/shared/hooks/use-favorites.ts`
- `apps/web/src/pages/settings/SettingsPage.tsx`

问题：页面层直接 import `@xiaobai-amax/local-db`。如果后续直接在页面里替换成 `fetch`，会让本地模式、远程模式、同步逻辑混在 UI 里。

建议：新增数据访问边界，例如：

```ts
type WorkoutClient = {
  getTodayWorkout(): Promise<WorkoutBundle | undefined>;
  listRecentWorkoutSummaries(limit: number): Promise<WorkoutBundle[]>;
  listMonthWorkoutSummaries(monthKey: string): Promise<WorkoutBundle[]>;
  getWorkoutBundle(workoutId: string): Promise<WorkoutBundle | undefined>;
  getOrCreateWorkout(date: string): Promise<Workout>;
  addExerciseToWorkout(workoutId: string, exerciseId: string): Promise<WorkoutExercise>;
  addSet(workoutId: string, workoutExerciseId: string): Promise<void>;
  updateSet(workoutId: string, set: TrainingSet): Promise<void>;
  deleteSet(workoutId: string, setId: string): Promise<void>;
  deleteWorkoutExercise(workoutId: string, workoutExerciseId: string): Promise<void>;
  deleteWorkout(workoutId: string): Promise<void>;
  updateWorkoutNotes(workoutId: string, notes: string): Promise<void>;
};
```

第一版可以先用 local-db 实现这个 client。后端 ready 后，再增加 API 实现。

### 2. 新建训练页会立刻创建空 workout

涉及文件：

- `apps/web/src/pages/workout-editor/WorkoutEditorPage.tsx`
- `packages/local-db/src/repositories/workout.repository.ts`

当前逻辑：进入 `/workouts/new` 时调用 `getOrCreateWorkout(date)`。用户如果直接退出，也会留下一条空 workout。列表里目前通过 `summarizeWorkout(bundle).exerciseCount > 0` 隐藏空记录。

后端风险：会产生无意义记录，且后端统计、同步、唯一约束都会被污染。

建议：

- 新建页先使用前端 draft，不立即落库。
- 第一次添加动作、保存备注或保存有效组时再创建 workout。
- 或保留当前模式，但退出空训练时自动清理。
- 后端侧也要定义空 workout 是否允许存在。

### 3. 备注输入可能覆盖已有内容

涉及文件：

- `apps/web/src/pages/workout-editor/WorkoutEditorPage.tsx`

当前逻辑：备注 textarea 使用 `defaultValue={bundle?.workout.notes ?? ""}`，并在 `onBlur` 时保存。因为 `bundle` 是异步加载，textarea 首次渲染可能为空，后续 `defaultValue` 不会更新；用户失焦后可能把已有备注覆盖为空。

建议：

- 改为受控状态 `notes`。
- `bundle` 加载后同步初始化 `notes`。
- 保存时比较是否变化，避免无意义写入。
- 接后端后应显示保存中、保存失败、重试状态。

### 4. 训练组输入缺少统一校验

涉及文件：

- `apps/web/src/pages/workout-editor/WorkoutEditorPage.tsx`
- `packages/local-db/src/repositories/workout.repository.ts`
- `packages/domain/src/workout/workout-validation.ts`

当前逻辑：输入值直接 `Number(event.target.value)` 后写入。可能出现负数、小数 reps、极大值或 `NaN`。

建议把规则放进 domain：

- `weightKg`：允许空；填写时必须是有限数字，且 `>= 0`。
- `reps`：允许空；填写时必须是正整数。
- `notes`：保存前 trim，长度限制由前后端共同约定。
- 前端输入和后端 API 共用同一套语义。

### 5. “同一天一条 workout” 没有强约束

涉及文件：

- `packages/local-db/src/db.ts`
- `packages/local-db/src/repositories/workout.repository.ts`

当前逻辑：`getOrCreateWorkout(date)` 先查日期，没有则创建；IndexedDB 的 `date` index 不是唯一索引。多标签页或并发点击有概率创建同一天多条记录。

接后端前需要决策：

- 如果产品规则是“一天一条训练记录”，后端数据库加唯一约束：`user_id + date`。
- 如果允许一天多练，前端 `getWorkoutBundleByDate(todayDate())` 和“今日继续训练”逻辑需要改为列表或 session 概念。

建议当前产品先保持“一天一条”，因为现有 UI 文案和入口都是这个模型。

### 6. 列表读取方式不适合远程 API

涉及文件：

- `apps/web/src/pages/today/TodayPage.tsx`
- `apps/web/src/pages/record/RecordPage.tsx`
- `apps/web/src/pages/history/HistoryPage.tsx`

当前逻辑：先 `listWorkouts()`，再对每条记录 `getWorkoutBundle()`，最后前端过滤、聚合。

后端风险：接口调用次数多、加载慢、分页困难。

建议后端直接提供面向页面的读模型：

- `GET /workouts/today`
- `GET /workouts/recent?limit=3`
- `GET /workouts?month=YYYY-MM`
- `GET /workouts/:id`

列表接口可以返回 summary，详情接口再返回完整 bundle。

### 7. 导入 JSON 缺少 schema 校验

涉及文件：

- `apps/web/src/pages/settings/SettingsPage.tsx`
- `packages/local-db/src/repositories/workout.repository.ts`

当前逻辑：`importAllData(json)` 直接 parse，清空全部 store，再把文件里的数组逐条写入。

风险：

- 坏文件可能损坏本地数据。
- 字段类型错误不会提前拦截。
- 外键关系可能断裂。
- 未来云端同步时可能上传脏数据。

建议：

- 先校验完整 payload，再开启写入事务。
- 校验 `version`、store 是否存在、字段类型、日期格式、数值范围、外键完整性。
- 导入失败时保留原数据，并显示错误。

## 推荐后端 API 草案

### Workout

```http
GET /api/workouts/today
GET /api/workouts/recent?limit=3
GET /api/workouts?month=2026-07
GET /api/workouts/:workoutId
POST /api/workouts
PATCH /api/workouts/:workoutId
DELETE /api/workouts/:workoutId
```

`POST /api/workouts` 请求体：

```json
{
  "date": "2026-07-29",
  "notes": ""
}
```

### Workout Exercise

```http
POST /api/workouts/:workoutId/exercises
DELETE /api/workouts/:workoutId/exercises/:workoutExerciseId
```

`POST` 请求体：

```json
{
  "exerciseId": "barbell-bench-press"
}
```

### Training Set

```http
POST /api/workouts/:workoutId/exercises/:workoutExerciseId/sets
PATCH /api/workouts/:workoutId/sets/:setId
DELETE /api/workouts/:workoutId/sets/:setId
```

`PATCH` 请求体：

```json
{
  "weightKg": 60,
  "reps": 10,
  "notes": ""
}
```

### Favorite Exercise

```http
GET /api/favorite-exercises
PUT /api/favorite-exercises/:exerciseId
DELETE /api/favorite-exercises/:exerciseId
```

## 推荐改造顺序

1. 抽数据访问层，页面不再直接 import `@xiaobai-amax/local-db`。
2. 修复备注输入为受控状态，避免异步加载后覆盖。
3. 把训练组输入校验沉到 `packages/domain`。
4. 调整 `/workouts/new`，避免打开页面就创建空记录。
5. 为列表页增加 summary 型读取方法，先用本地实现模拟后端读模型。
6. 加导入 JSON 校验，避免后续同步脏数据。
7. 再开始接真实后端 API。

## 后端数据模型建议

如果保留当前产品模型，后端可以按下面关系设计：

```text
users
  id

workouts
  id
  user_id
  date
  notes
  created_at
  updated_at

workout_exercises
  id
  workout_id
  exercise_id
  sort_order
  notes

training_sets
  id
  workout_exercise_id
  set_number
  weight_kg
  reps
  notes
  created_at

favorite_exercises
  user_id
  exercise_id
  created_at
```

建议约束：

- `workouts(user_id, date)` 唯一，前提是产品保持一天一条训练。
- `training_sets.reps` 为正整数或空。
- `training_sets.weight_kg` 为非负数字或空。
- 删除 workout 时级联删除 workout_exercises 和 training_sets。
- 删除 workout_exercise 时级联删除 training_sets。

## 本地优先同步要提前想清楚的点

如果后续不是纯后端，而是“本地优先 + 云同步”，需要额外设计：

- 本地 ID 和服务端 ID 是否统一使用 UUID。
- 离线新增后如何同步。
- 同一条 set 在多设备同时编辑时谁胜出。
- 删除操作是否需要 tombstone。
- `updatedAt` 使用客户端时间还是服务端时间。

当前最省事的路径：先做可登录后端，以服务端为准；本地 IndexedDB 只作为未登录模式或缓存。
