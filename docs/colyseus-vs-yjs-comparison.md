# Colyseus vs Yjs 对比分析 - VTT 场景适用性评估

**文档目的**: 深入对比 Colyseus 和 Yjs 两种技术方案，评估哪个更适合 VTT 项目

**评估日期**: 2026-03-09

**核心结论抢先看**:
- **Yjs (当前)**: 更适合协作文档类应用 (Google Docs 风格)
- **Colyseus**: 更适合游戏类应用 (实时游戏风格)
- **VTT 项目**: 介于两者之间，但**更偏向 Yjs** ✅

---

## 目录

1. [Colyseus 是什么？](#1-colyseus-是什么)
2. [核心架构对比](#2-核心架构对比)
3. [功能对比](#3-功能对比)
4. [VTT 场景适配性分析](#4-vtt-场景适配性分析)
5. [代码示例对比](#5-代码示例对比)
6. [决策建议](#6-决策建议)

---

## 1. Colyseus 是什么？

### 1.1 官方定位

> **Colyseus** is a Multiplayer Framework for Node.js

翻译: Colyseus 是一个 Node.js 多人游戏框架

**关键特性**:
- 🎮 **专为游戏设计** - 不是通用协作框架
- 🏢 **权威服务器模型** - 服务器掌控一切
- 🔄 **状态同步** - 自动同步游戏状态
- 🚀 **高性能** - 优化游戏性能

### 1.2 典型应用场景

```
✅ Colyseus 擅长的场景:
  - 实时对战游戏 (如 .io 游戏)
  - 回合制游戏 (如棋牌游戏)
  - 多人射击游戏
  - MOBA/RTS 游戏
  - 在线桌游

❌ Colyseus 不适合的场景:
  - 协作文档编辑 (Google Docs)
  - 富文本编辑器
  - 白板应用
  - 设计工具 (Figma)
```

### 1.3 核心设计哲学

**Colyseus**: "服务器是权威,客户端只是展示"
```
服务器:
  - 拥有唯一真实状态
  - 验证所有操作
  - 计算游戏逻辑
  - 广播状态变化

客户端:
  - 发送输入指令
  - 接收状态更新
  - 渲染画面
  - 可选: 客户端预测
```

**Yjs**: "去中心化,所有客户端平等"
```
所有客户端:
  - 拥有完整文档副本
  - 可以独立修改
  - 自动冲突解决 (CRDT)
  - P2P 同步

服务器:
  - 仅作为中继/持久化
  - 不参与业务逻辑
  - 可选 (离线也能工作)
```

---

## 2. 核心架构对比

### 2.1 架构图对比

```
┌─────────────────────────────────────────────────────────┐
│  Yjs 架构 (去中心化 CRDT)                                 │
└─────────────────────────────────────────────────────────┘

客户端 A        客户端 B        客户端 C
   │               │               │
   │ Y.Doc (完整)  │ Y.Doc (完整)  │ Y.Doc (完整)
   │               │               │
   └───────────────┴───────────────┘
              │
         WebSocket 服务器
         (仅中继消息)
              │
          LevelDB
         (持久化)

特点:
  ✅ 客户端可离线编辑
  ✅ 自动冲突解决
  ✅ 服务器无业务逻辑
  ❌ 权限控制困难
  ❌ 客户端可作弊


┌─────────────────────────────────────────────────────────┐
│  Colyseus 架构 (权威服务器)                               │
└─────────────────────────────────────────────────────────┘

客户端 A        客户端 B        客户端 C
(仅UI渲染)      (仅UI渲染)      (仅UI渲染)
   │               │               │
   ├─ Input ───────┼─ Input ───────┼─ Input
   │               │               │
   │               ↓               │
   │         Colyseus 服务器        │
   │         ┌─────────────┐       │
   │         │  Room       │       │
   │         │  ├─ State   │←──────┘ (权威状态)
   │         │  ├─ Logic   │       (游戏逻辑)
   │         │  └─ Rules   │       (规则验证)
   │         └─────────────┘
   │               │
   └─ State ───────┴─ State
   (只读副本)      (只读副本)

特点:
  ✅ 服务器完全控制
  ✅ 防作弊 (客户端不可信)
  ✅ 复杂规则验证
  ❌ 离线不可用
  ❌ 服务器压力大
```

### 2.2 数据流对比

#### **Yjs 数据流** (双向同步)

```typescript
// 场景: 玩家 A 移动 Token

客户端 A:
  1. 用户拖动 token
  2. 本地立即更新 (0ms 延迟)
     yDoc.getMap('tokens').set('token-1', { x: 100, y: 200 })

  3. Yjs 生成 CRDT update (50 bytes)
  4. 发送到服务器

服务器:
  5. 接收 update
  6. 广播给所有客户端 (不验证,不修改)
  7. 持久化到 LevelDB

客户端 B/C:
  8. 接收 update
  9. Yjs 自动合并到本地 Y.Doc
  10. React 重新渲染

延迟: 50-200ms (网络延迟)
```

#### **Colyseus 数据流** (单向指令)

```typescript
// 场景: 玩家 A 移动 Token

客户端 A:
  1. 用户拖动 token
  2. 发送指令到服务器
     room.send('moveToken', { tokenId: 'token-1', x: 100, y: 200 })

  3. (可选) 客户端预测: 本地先显示移动效果

服务器:
  4. 接收指令
  5. 验证合法性:
     - 是否轮到该玩家?
     - Token 是否属于该玩家?
     - 目标位置是否合法?

  6. 执行游戏逻辑:
     this.state.tokens[tokenId].x = x
     this.state.tokens[tokenId].y = y

  7. 广播状态变化

客户端 A/B/C:
  8. 接收新状态
  9. 对比本地状态,找出差异 (Schema 自动处理)
  10. React 重新渲染

延迟: 50-200ms (网络延迟) + 服务器计算时间
```

### 2.3 冲突处理对比

#### **Yjs: 自动 CRDT 冲突解决**

```typescript
// 场景: 两个 GM 同时修改同一个 Scene

时刻 T0:
  Scene.gridSize = 50

时刻 T1:
  GM-A: Scene.gridSize = 100 (本地立即生效)
  GM-B: Scene.gridSize = 60  (本地立即生效)

时刻 T2 (网络同步后):
  Yjs 自动使用 Last-Write-Wins 或 Lamport 时钟
  最终所有客户端收敛到: Scene.gridSize = 100 (或 60)

结果:
  ✅ 无冲突错误
  ⚠️ 一个 GM 的修改被覆盖 (无提示)
```

#### **Colyseus: 服务器裁决**

```typescript
// 场景: 两个 GM 同时修改同一个 Scene

时刻 T0:
  Scene.gridSize = 50

时刻 T1:
  GM-A 发送: { gridSize: 100 }
  GM-B 发送: { gridSize: 60 }

时刻 T2 (服务器处理):
  服务器按接收顺序处理:
    1. 收到 GM-A 请求 → gridSize = 100
    2. 收到 GM-B 请求 → gridSize = 60

  或者实现锁机制:
    1. GM-A 正在编辑 → 锁定
    2. GM-B 请求被拒绝

结果:
  ✅ 服务器完全控制
  ✅ 可以实现复杂冲突策略
  ⚠️ 需要手动编写冲突逻辑
```

---

## 3. 功能对比

### 3.1 核心功能对比表

| 功能 | Yjs | Colyseus | VTT 需求 |
|------|-----|----------|---------|
| **实时同步** | ⭐⭐⭐⭐⭐ 自动 | ⭐⭐⭐⭐⭐ 手动 | 必需 ✅ |
| **离线编辑** | ⭐⭐⭐⭐⭐ 支持 | ❌ 不支持 | 可选 🟡 |
| **冲突解决** | ⭐⭐⭐⭐⭐ 自动 CRDT | ⭐⭐⭐☆☆ 手动实现 | 重要 ✅ |
| **权限验证** | ⭐☆☆☆☆ 困难 | ⭐⭐⭐⭐⭐ 容易 | 重要 ✅ |
| **服务器压力** | ⭐⭐⭐⭐⭐ 低 | ⭐⭐⭐☆☆ 中 | 重要 ✅ |
| **客户端复杂度** | ⭐⭐⭐☆☆ 中 | ⭐⭐☆☆☆ 低 | 次要 🟡 |
| **防作弊** | ⭐☆☆☆☆ 困难 | ⭐⭐⭐⭐⭐ 容易 | VTT 中等 🟡 |
| **游戏逻辑** | ❌ 客户端 | ⭐⭐⭐⭐⭐ 服务端 | 看需求 🟡 |
| **回合制** | ⭐⭐☆☆☆ 手动 | ⭐⭐⭐⭐⭐ 内置 | 未来可能 🟡 |
| **学习曲线** | ⭐⭐⭐☆☆ 中 | ⭐⭐⭐⭐☆ 陡峭 | 重要 ✅ |

### 3.2 具体功能分析

#### **1. 实时同步**

**Yjs**: ✅ 开箱即用
```typescript
// 无需任何代码,Yjs 自动同步
yDoc.getMap('tokens').set('token-1', { x: 100 })
// → 自动广播给所有客户端
```

**Colyseus**: ⚠️ 需要手动实现
```typescript
// 需要显式定义状态结构
class MyRoomState extends Schema {
  @type({ map: Token }) tokens = new MapSchema<Token>()
}

// 需要手动触发广播
this.state.tokens.set('token-1', new Token({ x: 100 }))
// → Schema 自动检测变化并广播
```

#### **2. 权限验证**

**Yjs**: 🔴 非常困难
```typescript
// 无法阻止客户端修改数据
yDoc.getMap('tokens').set('token-1', { ... })

// 只能在服务端事后验证
yDoc.on('update', (update) => {
  // 检测到非法操作
  // 但已经广播出去了,只能回滚 (复杂)
})
```

**Colyseus**: ✅ 非常容易
```typescript
// 服务端方法,客户端只能调用
onMessage(client, type, message) {
  if (type === 'moveToken') {
    // 验证权限
    if (!this.isPlayerTurn(client.sessionId)) {
      client.send('error', 'Not your turn!')
      return
    }

    // 验证通过,执行操作
    this.state.tokens[message.tokenId].x = message.x
  }
}
```

#### **3. 游戏规则实现**

**Yjs**: 🔴 客户端实现(不安全)
```typescript
// 所有逻辑在客户端
const rollDice = () => {
  const result = Math.floor(Math.random() * 20) + 1
  yDoc.getArray('chat').push({ type: 'dice', result })
}

// 问题: 恶意客户端可以修改 Math.random()
// 或直接写入: yDoc.getArray('chat').push({ result: 20 })
```

**Colyseus**: ✅ 服务端实现(安全)
```typescript
// 服务端房间类
class GameRoom extends Room<GameState> {
  onMessage(client, type, message) {
    if (type === 'rollDice') {
      // 服务器生成随机数
      const result = Math.floor(Math.random() * 20) + 1

      // 验证规则 (如: 是否轮到该玩家)
      if (!this.isPlayerTurn(client.sessionId)) {
        return
      }

      // 更新状态
      this.state.lastDiceRoll = result
      this.broadcast('diceRolled', { player: client.sessionId, result })
    }
  }
}
```

#### **4. 回合制系统**

**Yjs**: ⚠️ 需要完全手动实现
```typescript
// 需要自己维护回合状态
yDoc.getMap('room').set('currentTurn', 'player-1')

// 客户端需要自己检查
const isMyTurn = () => {
  const currentTurn = yDoc.getMap('room').get('currentTurn')
  return currentTurn === myPlayerId
}

// 问题: 客户端可以作弊,强制修改 currentTurn
```

**Colyseus**: ✅ 官方推荐模式
```typescript
class TurnBasedRoom extends Room {
  onCreate() {
    this.state.currentTurn = 0
    this.state.players = ['player-1', 'player-2']
  }

  onMessage(client, type, message) {
    const currentPlayer = this.state.players[this.state.currentTurn]

    // 自动验证回合
    if (client.sessionId !== currentPlayer) {
      client.send('error', 'Not your turn!')
      return
    }

    // 执行操作...

    // 切换回合
    this.nextTurn()
  }

  nextTurn() {
    this.state.currentTurn = (this.state.currentTurn + 1) % this.state.players.length
  }
}
```

---

## 4. VTT 场景适配性分析

### 4.1 VTT 的核心需求分析

```typescript
// VTT 的典型用例

需求 1: GM 添加 NPC 角色
  - 权限: GM only
  - 冲突: 低 (通常单 GM)
  - 实时性: 中等 (500ms 可接受)

需求 2: 玩家修改自己的角色属性
  - 权限: 玩家 only (自己的角色)
  - 冲突: 低 (不同玩家修改不同角色)
  - 实时性: 低 (1s 可接受)

需求 3: 战斗中拖动 Token
  - 权限: 玩家 only (自己的 Token)
  - 冲突: 中 (可能多人同时移动)
  - 实时性: 高 (< 100ms)

需求 4: 聊天消息
  - 权限: 所有人
  - 冲突: 无 (追加模式)
  - 实时性: 中等 (500ms 可接受)

需求 5: 掷骰子
  - 权限: 所有人
  - 冲突: 无 (独立事件)
  - 实时性: 中等 (500ms 可接受)
  - 特殊: 需要服务端随机数(防作弊)

需求 6: 回合制战斗(未来)
  - 权限: 复杂 (轮流)
  - 冲突: 高 (需要严格顺序)
  - 实时性: 低 (用户操作)
```

### 4.2 适配性评分

| 需求 | Yjs 评分 | Colyseus 评分 | 说明 |
|------|---------|-------------|------|
| GM 添加 NPC | 🟡 3/5 | 🟢 5/5 | Yjs 权限弱,Colyseus 完美 |
| 修改角色属性 | 🟢 5/5 | 🟢 5/5 | 两者都可以 |
| 拖动 Token | 🟢 5/5 | 🟡 4/5 | Yjs 延迟更低(本地优先) |
| 聊天消息 | 🟢 5/5 | 🟢 5/5 | 两者都可以 |
| 掷骰子 | 🔴 2/5 | 🟢 5/5 | Yjs 无法防作弊 |
| 回合制战斗 | 🔴 2/5 | 🟢 5/5 | Colyseus 天然支持 |

**总体适配性**:
- **Yjs**: 3.7/5 (适合协作场景,不适合游戏规则)
- **Colyseus**: 4.8/5 (适合游戏场景,略重)

### 4.3 关键场景深入分析

#### **场景 1: 掷骰子(防作弊)**

**Yjs 实现** (有作弊风险):
```typescript
// 客户端代码
const rollDice = (formula: string) => {
  const result = parseDiceFormula(formula)  // 如 "2d20+5"
  // 问题: 客户端可以伪造 result

  yDoc.getArray('chat').push({
    type: 'dice',
    formula,
    result,
    timestamp: Date.now()
  })
}

// 恶意玩家可以:
// 1. 修改 parseDiceFormula 逻辑
// 2. 直接写入假数据
yDoc.getArray('chat').push({ result: 20 })  // 总是掷出 20!
```

**Colyseus 实现** (安全):
```typescript
// 服务端代码
class VTTRoom extends Room {
  onMessage(client, type, message) {
    if (type === 'rollDice') {
      // 服务器生成随机数(客户端不可控)
      const result = this.rollDiceOnServer(message.formula)

      // 更新状态
      this.state.chatLog.push({
        type: 'dice',
        formula: message.formula,
        result,
        playerId: client.sessionId,
        timestamp: Date.now()
      })

      // 广播给所有玩家
      this.broadcast('diceRolled', { player: client.sessionId, result })
    }
  }

  rollDiceOnServer(formula: string) {
    // 服务端安全的随机数
    return Math.floor(Math.random() * 20) + 1
  }
}
```

#### **场景 2: Token 拖动(性能)**

**Yjs 实现** (性能更好):
```typescript
// 本地优先,0ms 延迟
const [localPos, setLocalPos] = useState({ x: 0, y: 0 })

const onDrag = (e) => {
  // 立即更新本地状态(60fps 流畅)
  setLocalPos({ x: e.clientX, y: e.clientY })
}

const onDragEnd = (e) => {
  // 拖拽结束后同步到 Yjs
  yDoc.getMap('tokens').set(tokenId, {
    ...token,
    x: localPos.x,
    y: localPos.y
  })
}

// 优势: 本地立即响应,无网络延迟
```

**Colyseus 实现** (稍有延迟):
```typescript
// 方案 1: 每次移动都发送服务器 (延迟高)
const onDrag = (e) => {
  room.send('moveToken', { tokenId, x: e.clientX, y: e.clientY })
  // 等待服务器响应(50-200ms)
}

// 方案 2: 客户端预测 (复杂)
const [predictedPos, setPredictedPos] = useState({ x: 0, y: 0 })

const onDrag = (e) => {
  // 客户端预测(立即显示)
  setPredictedPos({ x: e.clientX, y: e.clientY })

  // 发送到服务器
  room.send('moveToken', { tokenId, x: e.clientX, y: e.clientY })
}

// 服务器响应后,校正客户端状态
room.onStateChange((state) => {
  const serverPos = state.tokens[tokenId]
  setPredictedPos(serverPos)  // 可能与预测不一致
})

// 劣势: 实现复杂,可能出现闪烁
```

---

## 5. 代码示例对比

### 5.1 初始化对比

#### **Yjs**

```typescript
// 服务端 (server/index.mjs)
import { setupWSConnection } from 'y-websocket/bin/utils'

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req)  // 一行搞定!
})

// 客户端
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const yDoc = new Y.Doc()
const provider = new WebsocketProvider('ws://localhost:4444', 'room-1', yDoc)

// 定义数据结构
const yTokens = yDoc.getMap('tokens')
const yChat = yDoc.getArray('chat')

// 监听变化
yTokens.observe(() => {
  setTokens(readTokens(yTokens))
})
```

#### **Colyseus**

```typescript
// 服务端 (server.ts)
import { Server, Room } from 'colyseus'
import { Schema, type, MapSchema } from '@colyseus/schema'

// 1. 定义状态 Schema
class Token extends Schema {
  @type('number') x: number
  @type('number') y: number
  @type('string') imageUrl: string
}

class VTTRoomState extends Schema {
  @type({ map: Token }) tokens = new MapSchema<Token>()
  @type(['string']) chatLog = []
}

// 2. 定义房间逻辑
class VTTRoom extends Room<VTTRoomState> {
  onCreate(options) {
    this.setState(new VTTRoomState())

    // 注册消息处理
    this.onMessage('moveToken', (client, message) => {
      const token = this.state.tokens.get(message.tokenId)
      token.x = message.x
      token.y = message.y
    })
  }

  onJoin(client, options) {
    console.log(`${client.sessionId} joined`)
  }

  onLeave(client) {
    console.log(`${client.sessionId} left`)
  }
}

// 3. 启动服务器
const gameServer = new Server()
gameServer.define('vtt', VTTRoom)
gameServer.listen(4444)

// 客户端
import { Client } from 'colyseus.js'

const client = new Client('ws://localhost:4444')
const room = await client.joinOrCreate('vtt', { roomName: 'room-1' })

// 监听状态变化
room.state.tokens.onAdd((token, key) => {
  console.log('Token added:', key)
})

room.state.tokens.onChange((token, key) => {
  console.log('Token changed:', key)
  // 更新 React 状态
  setTokens([...room.state.tokens.values()])
})

// 发送操作
room.send('moveToken', { tokenId: 'token-1', x: 100, y: 200 })
```

**复杂度对比**:
- Yjs: 10 行代码 ✅
- Colyseus: 60 行代码 ⚠️

### 5.2 添加 Token 对比

#### **Yjs**

```typescript
// 客户端直接操作
const addToken = (token: Token) => {
  yDoc.getMap('tokens').set(token.id, token)
  // → 自动同步给所有客户端
}

// 无权限验证 ❌
```

#### **Colyseus**

```typescript
// 客户端发送指令
const addToken = (token: Token) => {
  room.send('addToken', token)
}

// 服务端验证 + 执行
class VTTRoom extends Room {
  onMessage(client, type, message) {
    if (type === 'addToken') {
      // 验证权限
      const player = this.getPlayer(client.sessionId)
      if (player.role !== 'GM') {
        client.send('error', 'Only GM can add tokens')
        return
      }

      // 验证数据
      if (!message.imageUrl) {
        client.send('error', 'Token must have image')
        return
      }

      // 执行操作
      const token = new Token()
      token.x = message.x
      token.y = message.y
      token.imageUrl = message.imageUrl

      this.state.tokens.set(message.id, token)
      // → 自动同步给所有客户端
    }
  }
}
```

**权限控制**:
- Yjs: ❌ 无
- Colyseus: ✅ 完整

---

## 6. 决策建议

### 6.1 决策矩阵

| 因素 | Yjs | Colyseus | VTT 需求 |
|------|-----|----------|---------|
| **实时协作** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐☆ | 核心需求 |
| **权限控制** | ⭐☆☆☆☆ | ⭐⭐⭐⭐⭐ | 重要 |
| **防作弊** | ⭐☆☆☆☆ | ⭐⭐⭐⭐⭐ | 中等(私人游戏) |
| **游戏规则** | ⭐⭐☆☆☆ | ⭐⭐⭐⭐⭐ | 中等(掷骰子) |
| **开发成本** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐☆☆ | 重要 |
| **学习曲线** | ⭐⭐⭐⭐☆ | ⭐⭐⭐☆☆ | 重要 |
| **性能** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐☆ | 次要 |
| **离线支持** | ⭐⭐⭐⭐⭐ | ❌ | 可选 |

### 6.2 场景推荐

```
┌─────────────────────────────────────────────────────┐
│  推荐 Yjs 的场景                                      │
└─────────────────────────────────────────────────────┘

✅ 私人朋友小组游戏 (4-7 人,互相信任)
✅ 主要是协作编辑 (如场景描述、角色背景)
✅ 无严格游戏规则 (如自由形式叙事)
✅ 需要离线编辑
✅ 开发时间有限 (需要快速上线)

示例: 你的当前 VTT 项目 ← **当前状态**


┌─────────────────────────────────────────────────────┐
│  推荐 Colyseus 的场景                                 │
└─────────────────────────────────────────────────────┘

✅ 公开游戏大厅 (陌生人匹配)
✅ 严格游戏规则 (如战棋规则、回合限制)
✅ 需要防作弊 (如骰子必须服务器生成)
✅ 回合制系统
✅ 复杂战斗逻辑 (如攻击范围计算)

示例: Roll20/Foundry VTT 风格的严格战术游戏
```

### 6.3 针对你的 VTT 项目的建议

**当前项目特征**:
- 用户: 4-7 人小组
- 信任: 私人朋友,互相信任
- 规则: 轻量级,主要是氛围 + 轻战术
- 已有代码: 基于 Yjs,运行良好

**评估结果**: ✅ **继续使用 Yjs**

**理由**:

1. **当前架构已满足需求**
   - 实时协作 ✅ 运行良好
   - Token 拖拽 ✅ 60fps 流畅
   - 聊天 ✅ 无问题

2. **信任环境**
   - 私人游戏,玩家互相信任
   - 作弊不是主要风险
   - 掷骰子可以约定使用物理骰子 📷 拍照

3. **迁移成本高**
   - Yjs → Colyseus 需要完全重写
   - 估计 2-4 周工作量
   - 收益 < 成本

4. **Yjs 优势明显**
   - 本地优先,性能更好
   - 离线编辑(未来可能需要)
   - 代码简单,维护成本低

**但是,如果未来遇到这些情况,考虑 Colyseus**:

```
触发条件:

🔴 公开游戏大厅
  → 陌生人匹配,无法信任
  → 必须防作弊

🔴 严格战术规则
  → 需要服务端验证移动范围
  → 需要服务端计算攻击伤害

🔴 回合制系统
  → 严格顺序控制
  → 超时自动跳过

🔴 商业化
  → 付费用户,需要公平性保证
  → 需要审计日志
```

### 6.4 混合方案(最佳实践)

**推荐**: Yjs(核心协作) + REST API(游戏规则)

```typescript
// Yjs 负责实时协作
yDoc.getMap('tokens').set(tokenId, { x, y })  // Token 移动
yDoc.getArray('chat').push(message)            // 聊天

// REST API 负责游戏规则
fetch('/api/rollDice', {
  method: 'POST',
  body: JSON.stringify({ formula: '2d20+5' })
})
.then(res => res.json())
.then(result => {
  // 服务器返回随机数
  yDoc.getArray('chat').push({
    type: 'dice',
    result: result.value,  // 服务器生成,防作弊
    formula: '2d20+5'
  })
})
```

**优势**:
- ✅ 保留 Yjs 的实时协作优势
- ✅ 添加服务端规则验证
- ✅ 增量添加,无需重写
- ✅ 低迁移成本

---

## 7. 总结

### 7.1 核心对比

```
Yjs:              协作文档风格
  ↓
  适合: Google Docs, Notion, Figma
  特点: 去中心化, CRDT, 自动冲突解决

Colyseus:         游戏服务器风格
  ↓
  适合: .io 游戏, 回合制游戏, 战术游戏
  特点: 权威服务器, 规则验证, 防作弊
```

### 7.2 最终建议

**对于你的 VTT 项目**:

```
阶段 1 (当前): 继续使用 Yjs ✅
  - 满足私人游戏需求
  - 性能优异
  - 开发成本低

阶段 2 (6个月): Yjs + REST API 混合 🟡
  - Yjs 负责实时协作
  - REST API 负责掷骰子等规则
  - 增量添加,无需重写

阶段 3 (12+个月): 评估需求
  - 如果保持私人游戏 → 继续 Yjs
  - 如果公开大厅 → 考虑迁移 Colyseus
  - 如果商业化 → Hocuspocus(Yjs) 或 Colyseus
```

**不推荐迁移到 Colyseus 的原因**:
1. ❌ 当前 Yjs 已满足需求
2. ❌ 迁移成本高(2-4 周)
3. ❌ 性能可能更差(Token 拖拽)
4. ❌ 失去离线编辑能力

**可以考虑 Colyseus 的场景**:
1. ✅ 公开游戏大厅(陌生人匹配)
2. ✅ 严格战术规则(如 D&D 5e 完整实现)
3. ✅ 需要回合制系统
4. ✅ 商业化,需要防作弊保证

---

**参考资源**:
- [Colyseus 官方文档](https://docs.colyseus.io/)
- [Colyseus GitHub](https://github.com/colyseus/colyseus)
- [Colyseus 示例](https://github.com/colyseus/colyseus-examples)

---

**文档版本**: 1.0
**最后更新**: 2026-03-09
