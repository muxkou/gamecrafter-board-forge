## gamecrafter-board-forge

一个用于棋盘/卡牌等回合制游戏的 TypeScript 工具库（ESM + CJS）。包含：
- **编译器（Compiler）**：将游戏 DSL 校验与编译为稳定的编译产物，产出 `spec_id` 与每个动作的 `action_hash`。
- **引擎（Engine）**：基于编译产物进行状态初始化与单步推进，保证确定性与可复现性（种子随机、规范化哈希）。
- **自动对局器（Auto Runner）**：在给定策略下批量模拟对局，统计胜负/平局、步数、命中与违规等指标。
- **并行自动对局器（Parallel Auto Runner）**：基于 `worker_threads` 并行跑多局，聚合统计结果。

> 提示：当前 npm 包对外仅导出占位函数 `hello`（用于消费端集成演示）。核心 API 已在源码中就绪，后续版本将正式对外导出。

### 特性
- **纯 TypeScript**，完整类型声明与 ESM/CJS 双包。
- **确定性与可复现**：所有随机只来自 `seed`，状态序列化采用 `canonical_stringify`，并计算 `sha256` 哈希。
- **结构清晰的编译产物**：`actions_index`、`zones_index`、`phase_graph`、`victory`、`eval_limits` 等。
- **轻量合法行动枚举**：`legal_actions` 在不执行效果的前提下近似枚举可能的行动调用。
- **策略接口**：可插拔策略（如 `first_strategy`、`random_strategy`）。

## 安装

```bash
pnpm add gamecrafter-board-forge
```

要求：Node >= 18。

## 快速上手（当前 npm 导出）

```ts
import { hello } from 'gamecrafter-board-forge';

console.log(hello('World')); // Hello, World
```

> 说明：核心编译器/引擎 API 目前仅在源码中提供（见下文“源码 API 示例”）。后续版本会在根入口统一导出。

## 源码 API 示例（开发者）

以下示例基于本仓库源码路径导入（在仓库内或本地链接开发时可用）。

### 1) 编译 DSL

```ts
import { compile } from './src/compiler';

const dsl = {
  schema_version: 0,
  engine_compat: '>=1.0.0',
  id: 'demo',
  name: 'Demo Game',
  metadata: { seats: { min: 2, max: 4, default: 2 } },
  entities: [ { id: 'card', props: { cost: 1 } } ],
  zones: [
    { id: 'deck', kind: 'stack', scope: 'per_seat', of: ['card'], visibility: 'owner', capacity: 60 },
    { id: 'hand', kind: 'list', scope: 'per_seat', of: ['card'], visibility: 'owner' },
  ],
  phases: [ { id: 'main', transitions: [] } ],
  actions: [ { id: 'draw', effect: [ { op: 'move_top', from_zone: 'deck', to_zone: 'hand', count: 1 } ] } ],
  victory: { order: [ { when: true, result: 'ongoing' } ] },
};

const result = await compile({ dsl });
if (!result.ok || !result.compiled_spec) throw new Error('compile failed');

console.log(result.spec_id); // sha256:...
```

### 2) 初始化状态与单步推进

```ts
import { initial_state, step } from './src/engine';

const seats = ['s1', 's2'];
const init = await initial_state({ compiled_spec: result.compiled_spec, seats, seed: 42 });

const action = { id: 'draw', by: 's1', payload: { count: 1 }, seq: init.game_state.meta.last_seq + 1 };
const r = await step({ compiled_spec: result.compiled_spec, game_state: init.game_state, action });

if (r.ok) {
  console.log(r.event, r.state_hash);
}
```

### 3) 近似枚举合法行动

```ts
import { legal_actions } from './src/engine/legal_actions';

const calls = legal_actions({
  compiled_spec: result.compiled_spec as any, // 与内部结构对齐的最小形状
  game_state: init.game_state,
  by: init.game_state.active_seat || '',
  seats,
});

console.log(calls);
```

### 4) 自动对局与并行

```ts
import { auto_runner } from './src/engine/auto_runner';
import { parallel_auto_runner } from './src/engine/parallel_auto_runner';
import { random_strategy } from './src/engine/strategies';

const summary = await auto_runner({
  compiled_spec: result.compiled_spec,
  seats,
  episodes: 100,
  strategies: [random_strategy, random_strategy],
  max_steps: 100,
  collect_trajectory: true,
});

console.log(summary);

const parallel = await parallel_auto_runner({
  compiled_spec: result.compiled_spec,
  seats,
  episodes: 1000,
  strategies: [random_strategy, random_strategy],
  parallelism: 4,
});

console.log(parallel);
```

## API 概览（源码）

- **编译器**（`src/compiler/index.ts`）
  - `compile(input: CompileInput): Promise<CompileOutput>`

- **引擎**（`src/engine/index.ts`）
  - `initial_state(input: InitialStateInput): Promise<InitialStateOutput>`
  - `step(input: StepInput): Promise<StepOutput>`
  - 工具：`legal_actions(args): ActionCall[]`
  - 策略：`Strategy`、`first_strategy`、`random_strategy`

- **并行**（`src/engine/parallel_auto_runner.ts`）
  - `parallel_auto_runner(opts: ParallelAutoRunnerOptions): Promise<AutoRunnerSummary>`

- **Schema/类型**
  - Schema：`src/schema`（`dsl.schema.ts`、`compiled-spec.schema.ts`）
  - 类型：`src/types`（`GameState`、`Action`、`Event`、`EngineError`、`Compile*`、`Initial*`、`Step*` 等）

> 约束与保证：
> - `initial_state` 与 `step` 遵循纯函数式接口；哈希通过 `canonical_stringify` + `sha256` 计算。
> - `step` 优先使用编译产物的解释器路径（`step_compiled`），未提供编译产物时回退到硬编码动作分发（目前内置 `end_turn`、`move_top`）。
> - `legal_actions` 为轻量近似（侧重 `move_top` 的首节点检查），严格合法性仍以 `step`/`step_compiled` 的校验为准。

## 项目脚本

```bash
pnpm build        # 构建（ESM + CJS + d.ts）
pnpm dev          # 构建并监听
pnpm test         # 运行单测（vitest）
pnpm test:cov     # 覆盖率
pnpm lint         # ESLint 检查
pnpm lint:fix     # 自动修复
pnpm format       # Prettier 格式化
pnpm pack         # 本地打包 .tgz（配合示例消费者使用）
```

## 版本与导出计划

- 当前包入口 `src/index.ts` 仅导出 `hello` 占位函数（用于验证 ESM/CJS/types）。
- 核心 API（编译器/引擎/自动对局器等）已在源码中实现，计划在后续版本合并到公共导出，形如：

```ts
// 计划中的根入口导出示例（未来版本）
export * from './engine';
export * from './compiler';
export * from './schema';
```

发布日志见 `CHANGELOG.md`。

## 兼容性

- Node.js >= 18
- 打包目标 `es2020`，`sideEffects: false`，适合 tree-shaking。

## 许可证

MIT


