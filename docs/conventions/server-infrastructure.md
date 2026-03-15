# Server Infrastructure Rule（服务端基础设施规范）

## 规则：一个概念一个门控

同一个概念（如"房间是否存在"）在系统中只能有一个判定来源。
REST 中间件和 Socket.io 认证 **必须** 使用相同的检查逻辑。

## 当前设计

- `POST /api/rooms` 是创建房间的唯一入口
- 全局 `rooms` 表是"房间是否存在"的唯一真相源
- `withRoom` 和 `setupSocketAuth` 都先查全局 `rooms` 表

## 合规要求

新增任何服务端中间件时，必须回答：

1. **这个检查的真相源是什么？** — 明确声明依赖哪张表/哪个函数
2. **是否已有另一个中间件做同样的检查？** — 如果有，必须复用同一个函数
3. **两条路径（REST 和 Socket.io）是否一致？** — 不能出现"REST 能访问但 Socket.io 被拒绝"的情况

## 教训

### 旧 bug：战斗按钮无反应

- `withRoom` 使用 `getRoomDb()`（自动创建房间 DB）
- `setupSocketAuth` 检查 `rooms` 表（未注册则拒绝）
- 用户通过 URL 进入房间 → REST 正常 → Socket.io 被拒 → 所有实时事件丢失

修复：两者统一使用 `rooms` 表作为门控。
