English | [简体中文](./README.zh-CN.md)

# @wingeek/artisan

A CLI for builders — structured work logs from git history + multi-platform content publishing. Local-first.

## Install

```bash
# via bunx (recommended — no install)
bunx @wingeek/artisan

# via npx
npx @wingeek/artisan

# global install
bun install -g @wingeek/artisan
# or
npm install -g @wingeek/artisan

# from source
git clone https://github.com/wingeek/artisan.git
cd artisan && bun install
```

## Quick start

```bash
# welcome screen
artisan

# help
artisan --help
artisan worklog --help
artisan publish --help
```

## Commands

### worklog — structured work logs from git commits

```bash
# install a post-commit hook in a project (auto-collects commits)
artisan worklog init
artisan worklog init /path/to/repo --with-submodules

# see how many commits were collected today
artisan worklog status
artisan worklog status --date 2026-06-09

# generate a work log
artisan worklog generate                          # plain text
artisan worklog generate --format md              # Markdown
artisan worklog generate --since 2026-06-01       # date range
artisan worklog generate --repo my-project        # filter by repo

# AI summary mode (generated with Claude)
artisan worklog generate --ai
artisan worklog generate --ai --ai-model claude-sonnet-4-6
artisan worklog generate --ai --instructions "Highlight business value, be concise"

# import the result straight into publish (one step from worklog to publishable content)
artisan worklog generate --ai --publish --tags "weekly,dev"
```

**Storage:** `~/.artisan/worklog/commits.jsonl`

### auth — check AI configuration (BYOK)

```bash
artisan auth status
```

Prints the current state of the `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` trio and tells you whether `--ai` is ready to run. See **AI configuration (BYOK)** below.

### publish — multi-platform content publishing

Full flow: **import → adapt → preview → push**

```bash
# import an existing article
artisan publish import ./my-article.md
artisan publish import ./my-article.md --title "Custom title" --tags "tech,bim"

# create a new article (opens editor)
artisan publish new --title "My article" --tags "build-in-public"

# edit inline (TUI editor, auto-saves)
artisan publish edit <docId>

# list all articles
artisan publish list
artisan publish list --tag tech --limit 10
```

#### Multi-platform adaptation

```bash
# adapt a doc to a specific channel (produces channel-specific format)
artisan publish adapt <docId> --channel juejin
artisan publish adapt <docId> --channel wechat
artisan publish adapt <docId> --channel twitter
artisan publish adapt <docId> --channel github-pages
```

#### Preview & publish

```bash
# terminal preview
artisan publish preview <docId> --channel juejin

# browser preview (HTML render + action bar: copy content / open platform dashboard)
artisan publish preview <docId> --channel juejin --open

# one-shot publish (adapt + push)
artisan publish push <docId> --channel juejin
```

#### Supported channels

| Channel | Adaptation | Publish |
|---------|-----------|---------|
| **juejin** | strip frontmatter, add tags | copy to clipboard + open juejin editor |
| **wechat** | indent code blocks, tag footer | copy to clipboard + open mdnice |
| **twitter** (X) | extract summary, 280-char thread | copy to clipboard + open X composer |
| **github-pages** | add Jekyll frontmatter | write file to docs directory |

**Storage:** `~/.artisan/publish/` (SQLite)

## AI configuration (BYOK)

AI summaries use **BYOK (Bring Your Own Key)**: you bring your own API key and billing flows directly through your provider — artisan never touches token costs.

### The three env vars

| Var | Required | Default | Purpose |
|-----|----------|---------|---------|
| `ANTHROPIC_API_KEY` | ✅ | — | your API key |
| `ANTHROPIC_BASE_URL` | ❌ | `https://api.anthropic.com` | point to a Claude-compatible endpoint |
| `ANTHROPIC_MODEL` | ❌ | `claude-sonnet-4-6` | override the default model |

### Examples

```bash
# 1. Anthropic official (default)
export ANTHROPIC_API_KEY=sk-ant-...

# 2. GLM (Zhipu) — cheap, easy to obtain in mainland China
export ANTHROPIC_API_KEY=your-glm-key
export ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic
export ANTHROPIC_MODEL=glm-5.2

# 3. DeepSeek / any other Claude-compatible endpoint works the same way
export ANTHROPIC_API_KEY=your-deepseek-key
export ANTHROPIC_BASE_URL=https://your-compat-endpoint
export ANTHROPIC_MODEL=deepseek-chat
```

> **Why BYOK instead of a metered proxy?** For the v0.1 validation phase: ① transparent billing produces a cleaner signal; ② no upfront token-cost risk, zero cost on failure; ③ a GLM/DeepSeek key costs a few RMB — an order of magnitude lower barrier than Anthropic. Proxy resale is deferred to v0.2 (alongside the Gumroad plugin).

Check whether your configuration is ready:

```bash
artisan auth status
```

## Demo

<!-- TODO: record a demo gif covering init → status → generate --ai → publish -->

![artisan demo](./docs/demo.gif)

## Typical workflows

### Daily dev log

```bash
# one-time: install the hook in a project
cd my-project && artisan worklog init

# afterwards, just git commit as usual — commits are recorded automatically

# end of day, see what you did
artisan worklog status

# weekend: generate a weekly report
artisan worklog generate --since $(date -d '7 days ago' +%Y-%m-%d) --format md --ai
```

### Build in Public publishing

```bash
# write an article
artisan publish new --title "Week 1: indie experiment from scratch" --tags "bip,indie-hacker"

# adapt to multiple platforms
artisan publish adapt <docId> --channel juejin
artisan publish adapt <docId> --channel wechat
artisan publish adapt <docId> --channel twitter

# preview, then publish
artisan publish preview <docId> --channel juejin --open
artisan publish push <docId> --channel juejin
```

### worklog → publish pipeline

```bash
# one shot: AI summary from git commits → import into publish store
artisan worklog generate --ai --publish --tags "weekly,bip"
# then run the normal adapt → preview → push flow
```

## Development

```bash
# dev mode (auto-restart on file change)
bun dev

# run tests
bun test
```

## Tech stack

- [Bun](https://bun.sh/) — runtime
- [Cliffy](https://cliffy.io/) — CLI framework
- [OpenTUI](https://opentui.com/) — terminal UI
- [SQLite](https://www.sqlite.org/) — local storage
- [Claude API](https://docs.anthropic.com/) — AI summary generation
