# Preview CLI — 多分支预览环境

## 概述

`./scripts/preview` 是多分支并行测试验收工具。每个分支启动独立的 Docker 容器，自动分配端口，停止时彻底清理容器和数据。

## 前置条件

- Docker Desktop 已启动
- 目标分支已通过 `git worktree add` 创建 worktree

## 命令

```bash
# 启动分支预览（Ctrl+C 自动清理）
./scripts/preview start <branch>

# 查看运行中的预览
./scripts/preview list

# 停止单个分支
./scripts/preview stop <branch>

# 停止全部
./scripts/preview stop --all

# 查看日志
./scripts/preview logs <branch>

# 浏览器打开
./scripts/preview open <branch>

# 清理异常退出后残留的容器和数据卷
./scripts/preview clean
```

## 典型流程

```bash
# 1. 创建 worktree
git worktree add .worktrees/feat/my-feature feat/my-feature

# 2. 启动预览
./scripts/preview start feat/my-feature
# ┌──────────────────────────────────────────────────┐
# │  myVTT Preview                                   │
# │  Branch:  feat/my-feature                        │
# │  UI:      http://localhost:5142                   │
# │  API:     http://localhost:4442                   │
# │  ⚠ Data is ephemeral — deleted on stop           │
# │  Ctrl+C to stop                                  │
# └──────────────────────────────────────────────────┘

# 3. 浏览器访问 UI 地址进行验收

# 4. 验收完毕，Ctrl+C 退出（自动清理）
```

## 多分支并行

可以同时启动多个分支，端口自动分配互不冲突：

```bash
# 终端 1
./scripts/preview start feat/cursor-sync

# 终端 2
./scripts/preview start fix/token-drag

# 查看所有运行中的预览
./scripts/preview list
# BRANCH              UI                       STATUS
# feat-cursor-sync    http://localhost:5142    running 5m
# fix-token-drag      http://localhost:5167    running 2m
```

## 数据生命周期

**所有 preview 数据（SQLite 数据库、上传文件）都是临时的。** 以下任何退出方式都会自动清理：

| 操作 | 容器 | 数据卷 |
|------|------|--------|
| Ctrl+C | 删除 | 删除 |
| `stop <branch>` | 删除 | 删除 |
| `stop --all` | 全部删除 | 全部删除 |
| 异常退出后 `clean` | 清理残留 | 清理残留 |

不要在 preview 环境中进行需要持久化的操作。

## 热更新

Preview 环境支持热更新：

- **前端**：Vite HMR，编辑 worktree 下的 `src/` 文件后浏览器自动刷新
- **后端**：nodemon 监听 `server/` 目录，修改后自动重启

注意：修改 `vite.config.ts`、`package.json` 等配置文件需要重启容器（Ctrl+C 后重新 start）。

## 技术原理

### Vite Proxy Mode

普通 dev 模式下，客户端直连 `localhost:4444`（端口号编译进 bundle）。Docker 映射到不同 host 端口后，客户端仍会连 4444 导致失败。

Preview 启用 `VITE_PROXY_MODE=true`，让 Vite 代理 `/api` 和 `/socket.io` 到容器内的 Express 服务器。客户端使用同源请求，和生产环境行为一致。

### 端口分配

分支名经 CRC32 哈希得到确定性偏移量（0-99）：
- Server: `4400 + offset`
- Vite: `5100 + offset`

如果端口被占用，自动递增直到找到空闲端口。

### Docker 项目隔离

每个分支使用独立的 Docker Compose 项目名（`myvtt-preview-<branch>`），`-p` 参数自动隔离容器和数据卷。

## 限制

- 不能预览 `main` / `master` 分支（保护主分支）
- 需要先创建 git worktree
- 数据不可持久化
