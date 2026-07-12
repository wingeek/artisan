[English](./README.md) | 简体中文

# @wingeek/artisan

A CLI for builders — 结构化工作日志 + 多平台内容发布，本地优先。

## 安装

```bash
# 使用 bunx（推荐，免安装）
bunx @wingeek/artisan

# 使用 npx
npx @wingeek/artisan

# 全局安装
bun install -g @wingeek/artisan
# 或
npm install -g @wingeek/artisan

# 从源码
git clone https://github.com/wingeek/artisan.git
cd artisan && bun install
```

## 快速开始

```bash
# 欢迎界面
artisan

# 查看帮助
artisan --help
artisan worklog --help
artisan publish --help
```

## 命令一览

### worklog — 从 git 提交生成结构化工作日志

```bash
# 在项目中安装 post-commit 钩子（自动收集提交）
artisan worklog init
artisan worklog init /path/to/repo --with-submodules

# 查看今日收集了多少提交
artisan worklog status
artisan worklog status --date 2026-06-09

# 生成工作日志
artisan worklog generate                          # 纯文本输出
artisan worklog generate --format md              # Markdown 输出
artisan worklog generate --since 2026-06-01       # 指定日期范围
artisan worklog generate --repo my-project        # 按仓库筛选

# AI 摘要模式（用 Claude 生成总结）
artisan worklog generate --ai
artisan worklog generate --ai --ai-model claude-sonnet-4-6
artisan worklog generate --ai --instructions "用中文总结，突出业务价值"

# 生成后直接导入 publish（一键从 worklog 到可发布内容）
artisan worklog generate --ai --publish --tags "weekly,dev"
```

**数据存储：** `~/.artisan/worklog/commits.jsonl`

#### scan —— 无需 hook,直接扫描仓库

`scan` 直接读取任意本地仓库的 git log 与 diff,适合团队里没人装 hook 的项目:
别人的仓库、历史 checkout、还没开始用 artisan 的同事,都能就地生成工作总结。

```bash
cd ~/code/someone-else-repo
artisan worklog scan                              # 今天的提交,纯文本
artisan worklog scan --since 2026-07-01 --format md
artisan worklog scan --with-submodules            # 同时遍历所有 submodule
artisan worklog scan --no-diff                    # 最快:只取 commit message
artisan worklog scan --ai --instructions "聚焦性能与稳定性改进"
```

单条 commit 的 diff 上限 8 KB(超出会降级为文件级 `+/-` 统计),
整体累加上限 64 KB,确保 AI prompt 不会爆上下文。

### auth — 检查 AI 配置（BYOK）

```bash
artisan auth status
```

显示 `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` 三件套当前状态，并告诉你是否可以直接跑 `--ai`。详见下方「AI 配置（BYOK）」一节。

### publish — 多平台内容发布

完整工作流：**import → adapt → preview → push**

```bash
# 导入现有文章
artisan publish import ./my-article.md
artisan publish import ./my-article.md --title "自定义标题" --tags "tech,bim"

# 创建新文章（打开编辑器）
artisan publish new --title "我的文章" --tags "build-in-public"

# 终端内编辑（TUI 编辑器，自动保存）
artisan publish edit <docId>

# 查看所有文章
artisan publish list
artisan publish list --tag tech --limit 10
```

#### 多平台适配

```bash
# 适配到指定渠道（生成渠道专用格式）
artisan publish adapt <docId> --channel juejin
artisan publish adapt <docId> --channel wechat
artisan publish adapt <docId> --channel twitter
artisan publish adapt <docId> --channel github-pages
```

#### 预览与发布

```bash
# 终端预览
artisan publish preview <docId> --channel juejin

# 浏览器预览（HTML 渲染 + 操作栏：复制内容 / 打开平台后台）
artisan publish preview <docId> --channel juejin --open

# 一键发布（适配 + 推送）
artisan publish push <docId> --channel juejin
```

#### 支持渠道

| 渠道 | 适配行为 | 发布行为 |
|------|---------|---------|
| **juejin** (掘金) | 去 frontmatter、加标签 | 复制到剪贴板 + 打开掘金编辑器 |
| **wechat** (公众号) | 代码块转缩进、标签 footer | 复制到剪贴板 + 打开 mdnice |
| **twitter** (X) | 提取摘要、280 字线程 | 复制到剪贴板 + 打开 X 发布 |
| **github-pages** | 添加 Jekyll frontmatter | 生成文件到 docs 目录 |

**数据存储：** `~/.artisan/publish/` (SQLite)

## AI 配置（BYOK）

AI 摘要采用 **BYOK（Bring Your Own Key）**：你自带 API key，账单直接走你的 provider，artisan 不经手任何 token 费用。

### 三件套环境变量

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | — | 你的 API key |
| `ANTHROPIC_BASE_URL` | ❌ | `https://api.anthropic.com` | 切到 Claude 兼容端点 |
| `ANTHROPIC_MODEL` | ❌ | `claude-sonnet-4-6` | 覆盖默认模型 |

### 配置示例

```bash
# 1. Anthropic 官方（默认）
export ANTHROPIC_API_KEY=sk-ant-...

# 2. GLM（智谱）—— 国内支付几块钱即可，门槛极低
export ANTHROPIC_API_KEY=your-glm-key
export ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic
export ANTHROPIC_MODEL=glm-5.2

# 3. DeepSeek / 其它 Claude 兼容端点同理
export ANTHROPIC_API_KEY=your-deepseek-key
export ANTHROPIC_BASE_URL=https://your-compat-endpoint
export ANTHROPIC_MODEL=deepseek-chat
```

> **为什么 BYOK 而不是代理转售？** v0.1 验证阶段：① 透明计费、信号干净；② 不前置垫 token 费，失败成本 0；③ 国内 GLM/DeepSeek key 几块钱即可，比 Anthropic 门槛低一个数量级。代理转售评估推迟到 v0.2（与 Gumroad 插件一起）。

检查配置是否就绪：

```bash
artisan auth status
```

## Demo

![artisan demo](./docs/demo.gif)

## 典型工作流

### 日常开发日志

```bash
# 一次性：在项目里安装钩子
cd my-project && artisan worklog init

# 之后正常 git commit，提交会自动记录

# 下班前看一眼今天干了什么
artisan worklog status

# 周末生成周报
artisan worklog generate --since $(date -d '7 days ago' +%Y-%m-%d) --format md --ai
```

### Build in Public 发布

```bash
# 写好一篇文章
artisan publish new --title "Week 1: 从零开始的独立实验" --tags "bip,indie-hacker"

# 适配多平台
artisan publish adapt <docId> --channel juejin
artisan publish adapt <docId> --channel wechat
artisan publish adapt <docId> --channel twitter

# 预览确认后发布
artisan publish preview <docId> --channel juejin --open
artisan publish push <docId> --channel juejin
```

### worklog → publish 联动

```bash
# 一键：从 git 提交生成 AI 摘要 → 导入 publish store
artisan worklog generate --ai --publish --tags "weekly,bip"
# 然后正常走 adapt → preview → push 流程
```

## 开发

```bash
# 开发模式（文件变更自动重启）
bun dev

# 运行测试
bun test
```

## 技术栈

- [Bun](https://bun.sh/) — 运行时
- [Cliffy](https://cliffy.io/) — CLI 框架
- [OpenTUI](https://opentui.com/) — 终端 UI
- [SQLite](https://www.sqlite.org/) — 本地存储
- [Claude API](https://docs.anthropic.com/) — AI 摘要生成
