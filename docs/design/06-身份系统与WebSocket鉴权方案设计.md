# 身份系统与 WebSocket 鉴权方案设计

> **📋 实现状态：规划中 — 未实现**
>
> 本文档描述的方案尚未实现。当前系统无 JWT、无用户账号，Socket.io auth 只验证 roomId 存在，`withRole` 中间件读取 `X-MyVTT-Role` header 可被伪造。
> 注意：本文档编写于 Yjs 时代，部分细节（如 transaction.origin 审计）需根据当前 REST+Socket.io 架构重新设计。

## 问题

聊天防伪系统的 transaction.origin 审计依赖一个前提：**服务端知道每个 WebSocket 连接背后是谁**。当前系统没有身份验证——任何人可以连接 WebSocket，claim 任何座位，冒充任何人。需要一个身份系统来闭合信任链。

## 设计原则

- **服务器级账号**：一次注册，所有房间通用（不是 FVTT 的 per-World 模式）
- **GM 必须有账号**：GM 身份是最高权限，必须密码保护
- **玩家可匿名**：快速开团时玩家无需注册，GM 分配无密码座位即可
- **Cookie HttpOnly**：JWT 存储在 HttpOnly cookie 中，JS 无法访问，防 XSS
- **轻备团兼容**：朋友间快速开团不应被身份系统拖慢

## 架构

### 两层模型

```
服务器级：用户（User）
  → 用户名 + 密码 hash（bcrypt）
  → 持久化到服务端存储
  → 登录后签发 JWT cookie
  → 跨房间通用

房间级：座位（Seat）
  → 由 GM 在房间内创建和管理
  → 可分配给已注册用户（受保护）
  → 可留空（匿名玩家先到先得）
  → 座位属性：名字、颜色、角色(GM/PL)、绑定的 userId（可选）
```

### 用户与座位的关系

```
User (服务器级)              Seat (房间级)
┌──────────────┐           ┌──────────────────┐
│ id: "u-abc"  │──绑定──→  │ id: "s-xyz"      │
│ username     │           │ name: "张三"      │
│ passwordHash │           │ role: "PL"        │
└──────────────┘           │ userId: "u-abc"   │  ← 绑定了用户
                           │ roomId: "room-1"  │
                           └──────────────────┘

                           ┌──────────────────┐
                           │ id: "s-anon"      │
                           │ name: "访客1"     │
                           │ role: "PL"        │
                           │ userId: null       │  ← 未绑定，匿名可坐
                           │ roomId: "room-1"  │
                           └──────────────────┘
```

## 流程

### 首次使用（GM 创建房间）

```
1. GM 注册账号
   POST /api/auth/register { username, password }
   → 服务端 bcrypt hash 存储
   → 签发 JWT cookie: { userId, username }

2. GM 创建房间
   POST /api/rooms { name }
   → 需要已登录（JWT cookie）
   → 服务端创建房间 + 自动创建 GM 座位（绑定该 userId）

3. GM 创建玩家座位
   POST /api/rooms/:roomId/seats { name, role, userId? }
   → 需要 GM 权限
   → userId 有值 = 绑定给特定用户（需该用户已注册）
   → userId 为空 = 匿名座位
```

### 玩家加入

```
场景 A：实名加入（有账号）
  → 玩家已注册并登录（有 JWT cookie）
  → 进入房间 → 自动匹配绑定给自己的座位
  → WebSocket 连接携带 cookie → conn.userId = 可信身份

场景 B：匿名加入（无账号）
  → 进入房间 → 看到可用的匿名座位列表
  → 选一个坐下
  → POST /api/rooms/:roomId/seats/:seatId/claim
  → 签发临时 JWT cookie: { visitorId, seatId, roomId }
  → WebSocket 连接携带 cookie → conn.visitorId = 临时身份
```

### WebSocket 鉴权

```js
wss.on('connection', (conn, req) => {
  // 从 cookie 中提取 JWT
  const token = parseCookie(req.headers.cookie, 'myvtt-auth')
  if (!token) {
    conn.close(4401, 'Unauthorized')
    return
  }

  // 验证 JWT
  const payload = verifyJWT(token)
  if (!payload) {
    conn.close(4401, 'Invalid token')
    return
  }

  // 绑定身份到连接对象
  conn.userId = payload.userId || payload.visitorId
  conn.username = payload.username || 'anonymous'
  conn.role = lookupRoleInRoom(payload, roomId) // 查询该用户在此房间的角色

  // 交给 y-websocket 处理
  setupWSConnection(conn, req)
})
```

此后 transaction.origin === conn，审计时直接读取 conn.userId。

## JWT 设计

### Payload

```json
{
  "userId": "u-abc-123",
  "username": "alice",
  "iat": 1710000000,
  "exp": 1712592000
}
```

匿名用户：

```json
{
  "visitorId": "v-temp-456",
  "seatId": "s-anon",
  "roomId": "room-1",
  "iat": 1710000000,
  "exp": 1710086400
}
```

### Cookie 设置

```
Set-Cookie: myvtt-auth=<jwt>; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000
```

- `HttpOnly`：JS 无法读取，防 XSS 窃取
- `SameSite=Strict`：防 CSRF
- `Max-Age=2592000`：30 天有效期（覆盖典型战役周期）
- **不加 `Secure`**：自托管场景下服务器可能通过 HTTP + IP 直接对外服务，没有 HTTPS。加了 `Secure` 会导致 cookie 在 HTTP 下完全不发送。我们的威胁模型是"玩家在浏览器内作弊"，不是网络层攻击

### 签名密钥

持久化到 `{PERSISTENCE_DIR}/jwt.secret`。启动时读取，不存在则 `crypto.randomBytes(32)` 生成并写入。服务端重启后已签发的 JWT 仍然有效。

## 用户存储

使用独立的 JSON 文件（`{PERSISTENCE_DIR}/users.json`），结构简单：

```json
{
  "u-abc-123": {
    "id": "u-abc-123",
    "username": "alice",
    "passwordHash": "$2b$10$...",
    "createdAt": 1710000000
  }
}
```

**为什么不用 LevelDB？** 用户数量极少（一个 TRPG 服务器通常 < 10 人），JSON 文件足够。读写简单，便于调试和备份。审计日志用 LevelDB 是因为消息量大、需要范围查询。

## 座位管理

### 座位存储位置

座位数据保留在 Y.Doc `seats` map 中（保持与现有架构一致），但**座位的创建和分配必须通过服务端 API**：

```
之前：客户端直接 yDoc.getMap('seats').set(seatId, data)  ← 任何人可写
之后：POST /api/rooms/:roomId/seats                       ← 服务端验证权限后写入
```

服务端用 `doc.transact(() => seats.set(...), 'server')` 写入座位，origin 为 'server'。客户端直接写入的座位会被 observer 检测为未授权操作。

### GM 座位管理 API

```
POST   /api/rooms/:roomId/seats          创建座位（GM only）
DELETE /api/rooms/:roomId/seats/:seatId   删除座位（GM only）
PUT    /api/rooms/:roomId/seats/:seatId   修改座位属性（GM only）
POST   /api/rooms/:roomId/seats/:seatId/claim   匿名用户认领空座位
```

## 与 transaction.origin 审计的衔接

身份系统为审计提供了可信的 conn.userId：

```
已注册用户登录 → JWT { userId: "u-abc" } → cookie
  → WebSocket 连接 → conn.userId = "u-abc"
  → Y.applyUpdate(doc, update, conn)
  → observer: transaction.origin.userId = "u-abc"（不可伪造）

匿名用户 claim 座位 → JWT { visitorId: "v-temp" } → cookie
  → WebSocket 连接 → conn.userId = "v-temp"
  → 同样的审计逻辑，只是身份标识是临时的
```

审计日志中记录的 realUserId 可以追溯到具体的注册用户或匿名访客。

## 攻击场景分析

| 攻击方式                    | 过程                          | 结果                                             |
| --------------------------- | ----------------------------- | ------------------------------------------------ |
| **无 cookie 连接**          | WebSocket 连接不带 JWT        | 服务端 close(4401)，拒绝连接                     |
| **伪造 JWT**                | 构造假 token                  | 签名验证失败，拒绝连接                           |
| **偷别人的 cookie**         | 需要 XSS 或物理接触           | HttpOnly 防 XSS；物理接触 = 已突破浏览器安全边界 |
| **冒充 GM 创建座位**        | 非 GM 调用座位管理 API        | JWT 中无 GM 权限，403 拒绝                       |
| **匿名用户抢绑定座位**      | claim 已绑定 userId 的座位    | 服务端检查 userId 绑定，拒绝                     |
| **趁人不在 claim 别人座位** | 该座位已绑定 userId           | 无法 claim，必须是绑定的用户本人                 |
| **客户端直写 seats map**    | 绕过 API 直接修改 Y.Doc seats | observer 检测到非服务端写入 → 篡改警告           |

## 与轻备团的平衡

| 场景           | 流程                                                                       | 步骤数                 |
| -------------- | -------------------------------------------------------------------------- | ---------------------- |
| 朋友间快速开团 | GM 注册登录 → 创建房间 → 创建匿名座位 → 分享链接 → 玩家点进去选座位        | GM 3步，玩家 1步       |
| 正式长期战役   | GM + 所有玩家注册 → GM 创建房间 → GM 绑定座位给每个玩家 → 玩家登录自动入座 | 一次性设置，之后零摩擦 |
| 公开招募       | GM 创建房间 → 创建匿名座位 → 公开链接 → 陌生人随到随坐                     | 与快速开团一样         |

## 威胁模型与传输安全

### 我们防什么？

身份系统的安全目标是**防止浏览器内作弊**——玩家通过 devtools 或注入脚本绕过 UI，伪造骰子、冒充他人、篡改聊天记录。

身份系统**不**试图防御网络层攻击（中间人监听/劫持）。这是传输层（HTTPS）的职责，属于部署层面的决策。

### 为什么不在应用层解决传输安全？

经过分析，应用层无法有效解决 HTTP 下的中间人问题：

| 方案                   | 问题                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **自签名 HTTPS**       | 浏览器弹全屏红色警告"连接不安全"，比 HTTP 更吓人。而且我们训练用户点击"继续"后，中间人替换成自己的假证书时用户也会点"继续"——自签名无法证明服务器身份 |
| **Challenge-Response** | 可以避免密码明文传输，但其他数据（聊天、骰子、cookie）仍然明文。而且实现复杂度高                                                                     |
| **URL 中嵌入密钥**     | HTTP 请求中 URL 明文可见。即使用 URL hash（`#` 后的部分不发送到网络），中间人可以篡改页面注入 JS 读取 hash                                           |

**根本原因：** 防中间人需要回答"我在跟谁通信"，这需要可信第三方（CA）担保。没有域名 + CA 证书，应用层做什么都无法解决这个问题。

### 行业共识

自托管应用普遍不在应用层处理传输安全。FVTT 默认 HTTP，配置文件支持 `sslCert`/`sslKey`，文档推荐反向代理。

### 我们的策略

不在应用层处理传输安全。需要 HTTPS 的 GM 可以自行在前面加反向代理（Nginx/Caddy）。

应用层专注于防御浏览器内作弊：

| 威胁              | 防御                                     |
| ----------------- | ---------------------------------------- |
| 伪造骰子          | 服务端权威掷骰 + transaction.origin 审计 |
| 冒充他人发消息    | transaction.origin 比对 senderId         |
| 删除/篡改聊天记录 | append-only + 服务端删除检测             |
| 抢别人的座位      | JWT 身份 + 服务端 API 验权               |
| 冒充 GM           | JWT 角色信息 + 服务端验权                |
| XSS 窃取 cookie   | HttpOnly cookie                          |
| CSRF 攻击         | SameSite=Strict                          |

## 未来方向

- **OAuth 集成**：支持 Discord / Google 登录（TRPG 社群常用 Discord）
- **邀请码**：GM 生成一次性邀请码，玩家用邀请码加入房间并自动创建座位
- **座位转让**：GM 可以将已绑定的座位转给另一个用户（玩家更换时）

## 不变的部分

- Y.Doc 中的 seats map 仍然是实时同步的数据源（其他客户端实时看到座位变化）
- awareness 仍用于在线状态广播
- 聊天消息的 senderId 仍然是 seatId（用户在房间内的身份），不是 userId（服务器级身份）
- transaction.origin 审计使用 conn.userId（服务器级身份）做权限判断
