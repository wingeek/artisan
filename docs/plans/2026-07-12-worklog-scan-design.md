# Worklog Scan 子命令设计

日期: 2026-07-12
状态: 设计已确认,待实现

## 背景与目标

`artisan worklog generate` 依赖 post-commit 钩子预先把 commit 写入 `~/.artisan/worklog/commits.jsonl`。当团队成员不使用 artisan(没装钩子)、或要分析他人/历史仓库时,这条路径不可用。

`scan` 子命令直接读取本地 git log 与 diff,生成与 generate 一致结构的工作总结,无需任何前置准备。

## 范围

- 使用场景:在目标仓库目录里直接跑 `artisan worklog scan`,从本地 git 取数据。
- 默认时间范围:今天(与 generate 一致)。
- 默认含 diff:是。
- 默认不展开 submodule(`--with-submodules` opt-in,与 `init` 对齐)。

## 架构

新增 `scan` 子命令,与 `init` / `generate` / `status` 平级,**不依赖** `commits.jsonl`。把"提交数据从哪来"抽象出来,让 scan 与 generate 共享下游(分组 / 格式化 / AI)。

```
src/commands/worklog/
  index.ts                # 注册 scan
  scan.ts                 # 新增:CLI 入口
  core/
    collector.ts          # 现有:从 commits.jsonl 读
    git-scanner.ts        # 新增:从 git log 读
    engine.ts             # 改造:暴露 processCommits(commits, opts)
  types.ts                # 扩展:CommitEntry 加可选 diff/files
  adapters/claude.ts      # 改造:buildUserContent 支持渲染 diff
```

Engine 暴露 `processCommits(commits, opts)`,scan 和 generate 各自只负责采集,下游完全复用。Generate 流程零行为变更(纯重构)。

### CommitEntry 扩展

```ts
export interface CommitEntry {
  timestamp: string;
  repo: string;
  submodule: string;
  message: string;
  hash: string;
  // 新增(scan 才有)
  diff?: string;
  files?: FileStat[];
  diffTruncated?: boolean;
}
export interface FileStat { path: string; added: number; deleted: number; }
```

## Git Scanner

新增 `core/git-scanner.ts`,封装为纯函数:

```ts
export interface ScanOptions {
  path: string;
  dateRange: DateRange;
  includeDiff: boolean;
}
export async function scanRepo(opts: ScanOptions): Promise<CommitEntry[]>
```

调用的 git 命令(全部走 `Bun.spawn`,风格同 `init.ts`):

1. `git rev-parse --show-toplevel` —— 取仓库名(与 post-commit 钩子的 `entry.repo` 语义对齐)。
2. `git log --since=<ISO> --until=<ISO> --pretty=format:'%H|%aI|%s'` —— 拉取 commit 列表,用 `|` 分隔解析。
3. 每个 commit 单独 `git show --no-color --format= <hash>` —— 纯 patch,不含 message(避免重复 token)。

**不用 `git log -p` 一次性取**:大仓库 + 长日期范围输出可能数百 MB。逐 commit 取更可控,且支持"超过总量上限就早停"。

**Submodule 处理**:`scan.ts` 用 `init.ts:76` 的 `listSubmodules()` 拿到 submodule 列表,对每个 `sub` 调 `scanRepo({ path: join(target, sub), ... })`,结果填 `entry.submodule = sub`,最后合并。下游 `groupByRepo` 已支持 submodule 分组,无需改动。

## Diff 策略与 token 预算

策略 **D**:commit message + 智能裁剪 diff。

```ts
export const MAX_DIFF_BYTES = 8192;        // 单 commit 上限
export const MAX_TOTAL_DIFF_BYTES = 65536; // 整体上限
```

**单 commit 决策**:

1. `git show --format= <hash>` 取 patch。
2. ≤ 8 KB → 完整放入 `entry.diff`。
3. 超过 → 丢弃完整 diff,改填 `entry.files`(从 `git show --stat --format=` 解析),`entry.diffTruncated = true`。

**整体早停**:所有 commit 的 diff 字节累加,超过 64 KB 后续 commit 不再 spawn `git show`,直接走 `--stat` 降级路径。

**Stat 解析**:`git show --stat --format=` 输出形如
```
 src/foo.ts | 12 +++++----
 src/bar.ts |  3 ++
 2 files changed, 15 insertions(+), 5 deletions(-)
```
正则按行取 `path` 与行末 `+N/-M`。最后一行汇总跳过。`Binary files differ` 视同降级(只记 path,不记增删)。

阈值理由:
- 8 KB / commit:覆盖常规 commit(改 2-3 文件通常 < 4 KB),大重构才降级。
- 64 KB / 总量:Claude 200K 上下文里约占 16K token,不到 10%,安全。
- 两常量均 export,MVP 不暴露 CLI 选项。

## Engine 改造与 AI 适配

Engine 暴露新方法:

```ts
async processCommits(
  commits: CommitEntry[],
  opts: { useAi?: boolean; outputFormat: OutputFormat; customInstructions?: string }
): Promise<string>
```

实现为现有 `generate()` 后半段(从 `if (commits.length === 0)` 起)抽出,零行为变更。

**Claude adapter 的 `buildUserContent` 改造** —— diff 进 prompt:

```
## myrepo

### [abc1234] feat: add user login
- src/auth.ts | 45 +++++++++++
- src/api.ts  | 12 ++++

```diff
+++ src/auth.ts
+export function login(user: string) { ... }
```

### [def5678] fix: crash on null
- src/api.ts | 3 +-
(diff truncated, see file stats above)
```

渲染规则:
- `entry.diff` 存在 → 文件 stat + 三反引号 diff 块。
- 仅 `entry.files` → 仅 stat 行 + `(diff truncated)` 标记。
- 都无 → hash + message,与现有格式一致。

**非 AI 模式**:`formatWorklog` 的 text/md 输出**不含 diff**(终端太冗长)。json 格式带出 `diff` / `files` 字段供工具消费。与 generate 行为一致。

**customInstructions 自动增强**:scan 检测到 diff 截断时,自动在 instructions 追加:"部分大改动仅以文件统计形式提供,如需更细致总结请缩小日期范围或单独扫描。"可被用户 `--instructions` 覆盖。

## CLI 接口

```
artisan worklog scan [path] [options]

参数:
  [path]                  目标仓库路径,默认当前目录

选项:
  --path <dir>            同位置参数,二选一
  --date <YYYY-MM-DD>     指定单日
  --since <date>          起始日期
  --until <date>          结束日期
  --with-submodules       同时扫描所有 submodule
  --no-diff               只取 commit message,不拉 diff
  --format <text|md|json> 默认 text
  --ai                    启用 AI 总结
  --ai-model <model>      覆盖默认模型
  --instructions <text>   AI 附加指令
  --publish               导入 publish store
  --tags <tags>           配合 --publish
```

复用 `generate.ts` 已 export 的 `parseDateRange` / `parseFormat` / `importToPublish`。

冲突处理:
- `[path]` 与 `--path` 同给且不一致 → 报错退出 2。
- `--date` 与 `--since/--until` 同给 → `--date` 胜出(沿用现有优先级)。

| 维度 | generate | scan |
|---|---|---|
| 数据源 | commits.jsonl | 本地 git log |
| 默认日期 | 今天 | 今天 |
| 默认 submodule | N/A | 不展开 |
| 默认含 diff | N/A | 是 |
| AI 参数 | 一致 | 一致 |
| publish 参数 | 一致 | 一致 |

`index.ts` 注册一行 `.command("scan", scanCommand)`。

## 错误处理

| 场景 | 行为 |
|---|---|
| 路径不存在 | `✗ path not found: <path>` 退出 1 |
| 非 git 仓库 | 复用 `init.ts:56` 的 `resolveGitDir()`,`✗ not a git repository` 退出 1 |
| 日期范围内无 commit | `No commits found for the specified date range.` 退出 0 |
| `git log` 失败 | `✗ git log failed: <stderr>` 退出 1 |
| 单个 `git show` 失败 | warn + 跳过该 diff,降级为仅 message |
| `[path]` 与 `--path` 冲突 | `✗ provide either [path] or --path, not both` 退出 2 |
| AI 调用失败 | 复用 `engine.ts:64` fallback |

## 测试策略

`scan.test.ts`,风格同 `generate.test.ts`,用 `bun:test`。

**纯函数层**(不依赖真 git):

1. `parseScanArgs` —— `[path]` / `--path` / 冲突 / 默认 cwd。
2. `parseStatOutput` —— 喂固定字符串,验证 `FileStat[]`。
3. `truncateDiff(diff, MAX_DIFF_BYTES)` —— 9 KB 输入,验证降级。
4. `buildUserContentWithDiff` —— 带 diff / 仅 stat / 仅 message 三种 entry。

**集成层**(临时 git 仓库 fixture):

5. `beforeEach` 里 `git init` tmp 目录,2-3 个 commit(含一个 > 8 KB diff 的大文件 commit)。跑 `scanRepo()`:
   - 小 commit 的 `entry.diff` 非空。
   - 大 commit 的 `entry.diffTruncated === true` 且 `entry.files` 非空。
   - 总量触发早停后,后续 commit 只有 stat。
6. Submodule fixture:主仓 + submodule 各一 commit,跑 `--with-submodules`,验证 `entry.submodule` 正确。

AI 渲染用纯函数 mock,不碰网络。`processCommits` 在 `useAi: false` 路径走 `formatWorklog`,纯本地。

**TDD 顺序**:先 `parseStatOutput` / `truncateDiff` / `buildUserContentWithDiff` 三纯函数(红),再实现(绿),最后 git fixture 集成。
