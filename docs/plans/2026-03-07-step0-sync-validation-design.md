# Step 0: tldraw v4 + Yjs 多人同步技术验证

## 目标

验证 tldraw v4 + Yjs + y-websocket 多人同步画布 + y-leveldb 持久化的可行性。

## 验证标准

1. 两个浏览器窗口访问同一 URL，画布操作实时同步
2. 重启 Node 服务器后刷新页面，之前的数据还在

## 架构

```
浏览器A ──WebSocket──┐
                     ├──> y-websocket 服务器 ──> y-leveldb (磁盘持久化)
浏览器B ──WebSocket──┘
```

## 项目结构

```
myVTT/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx              # React 入口
│   ├── App.tsx               # tldraw 画布 + Yjs 集成
│   └── useYjsStore.ts        # tldraw store ↔ Yjs 双向绑定
├── server/
│   └── index.js              # y-websocket 服务器 + y-leveldb
├── docs/
│   └── plans/
└── design.md
```

## 技术要点

### 前端：tldraw ↔ Yjs 绑定

参考 Liveblocks 社区 tldraw v3 + Yjs 示例的绑定逻辑，适配 v4：

- Y.Doc 中创建 Y.Array 存储 tldraw records
- 使用 y-utility 的 YKeyValue 做 key-value 映射
- tldraw store.listen() 监听本地变化 → 写入 Y.Doc
- YKeyValue.on('change') 监听远程变化 → mergeRemoteChanges() 写入 tldraw store
- source: 'user' + scope: 'document' 过滤，避免回环

### 后端：y-websocket + y-leveldb

- y-websocket 作为 WebSocket 服务器转发 Yjs 更新
- y-leveldb 将 Y.Doc 状态持久化到磁盘
- 环境变量 YPERSISTENCE=./db 启用持久化

## 依赖

- tldraw (v4 最新)
- yjs
- y-websocket
- y-utility (YKeyValue)
- y-leveldb (持久化)
- react, react-dom
- vite, typescript
