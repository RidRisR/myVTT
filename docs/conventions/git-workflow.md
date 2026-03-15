# Git Workflow（Git 工作流规范）

## 规则

1. **所有开发必须在 worktree + 独立分支上进行** — 不允许直接在 main 上提交
2. **main 分支只接受 squash merge** — 一个 PR 一个 commit，无 merge bubble
3. **PR 创建和 merge 是两个独立步骤** — merge 需要用户明确指示
4. **Commit message 使用英文** — 遵循 conventional commits 格式
5. **不添加 Co-Authored-By 或 AI 声明**

## 分支命名

| 前缀              | 用途       |
| ----------------- | ---------- |
| `feat/<name>`     | 新功能     |
| `fix/<name>`      | Bug 修复   |
| `chore/<name>`    | 维护性工作 |
| `refactor/<name>` | 重构       |

## Worktree 目录

- 路径：`.worktrees/<branch-name>`（已在 `.gitignore` 中）
- 每个 worktree 有自己的 `.env` 文件用于端口/路径隔离
- 共享函数放在 `/src/shared/` 以减少跨分支冲突

## Commit Convention

- 格式：`type: short description`（如 `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`）
- 主语使用英文，不使用中文或其他非 ASCII 字符
- 不添加 `Co-Authored-By` 行或 AI 生成声明

## Merge 流程

```bash
# 创建 PR
gh pr create --title "feat: add feature X" --body "..."

# 等待用户确认后 merge（squash only）
gh pr merge --squash
```

## 文档语言

- 新建的文档文件（设计文档、计划、规范等）**必须** 使用中文
- 代码注释和 CLAUDE.md 可以使用英文
