# 战术地图沉浸式融合 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将战术地图从独立浮窗改造为全屏沉浸层，与背景气氛图融合，战术工具整合进现有 GmToolbar。

**Architecture:** 战术模式激活时 SceneViewer 背景图做高斯模糊+暗化，Konva Canvas 改为全屏透明容器（position: fixed, inset: 0），战术工具从独立 TacticalToolbar 迁移至 GmToolbar 第二行。

**Tech Stack:** React 19, TypeScript, Tailwind CSS, react-konva, Lucide React

**Spec:** `docs/superpowers/specs/2026-03-12-tactical-map-immersive-design.md`

---

## 前置：创建 worktree

- [ ] 在项目根目录创建 worktree 和专用分支：
  ```bash
  git worktree add .worktrees/tactical-immersive -b tactical-immersive
  cd .worktrees/tactical-immersive
  cp .env.example .env  # 按需修改端口
  npm install
  ```

---

## Chunk 1: SceneViewer 模糊效果 + BackgroundLayer 修复

### Task 1: SceneViewer 增加 `blurred` prop

**Files:**

- Modify: `src/scene/SceneViewer.tsx`

**背景：** SceneViewer 目前无任何模糊状态，全屏渲染气氛图。需添加 `blurred?: boolean` prop，战术模式激活时对背景图做高斯模糊+暗化处理。

- [ ] **Step 1: 在 SceneViewerProps 接口中添加 `blurred` 字段**

  打开 `src/scene/SceneViewer.tsx`，在第 7-10 行的接口定义中新增：

  ```tsx
  interface SceneViewerProps {
    scene: Scene | null
    blurred?: boolean // ← 新增
    onContextMenu?: (e: React.MouseEvent) => void
  }
  ```

- [ ] **Step 2: 在函数签名中解构 `blurred`**

  第 12 行改为：

  ```tsx
  export function SceneViewer({ scene, blurred = false, onContextMenu }: SceneViewerProps) {
  ```

- [ ] **Step 3: 在主容器内添加常驻模糊遮罩层（通过 opacity 过渡）**

  `backdrop-filter` 方案：遮罩层始终渲染，通过 `opacity` 的 CSS 过渡来实现淡入淡出（条件渲染无法利用 CSS transition）。`backdrop-filter` 会模糊其后面的媒体元素，无需 `transform: scale(1.04)`（该 scale 仅在直接给媒体元素加 `filter` 时才需要防止边缘泄漏）。

  找到 `src/scene/SceneViewer.tsx` 第 54-151 行，将整个 `return (...)` 替换为完整版本：

  ```tsx
  return (
    <div
      onContextMenu={onContextMenu}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        background: '#000',
      }}
    >
      {/* Combat blur + darken overlay — always rendered, opacity transition for smooth enter/exit */}
      <div
        className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-slow ease-out motion-reduce:duration-0 ${
          blurred ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ backdropFilter: 'blur(8px)', background: 'rgba(8,5,18,0.52)' }}
      />

      {/* Previous media (during crossfade) */}
      {prevUrl &&
        (isVideoUrl(prevUrl) ? (
          <video
            src={prevUrl}
            muted
            loop
            autoPlay
            playsInline
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 0,
            }}
          />
        ) : (
          <img
            src={prevUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 0,
            }}
          />
        ))}
      {/* Current media */}
      {isVideoUrl(currentUrl) ? (
        <video
          key={currentUrl}
          src={currentUrl}
          muted
          loop
          autoPlay
          playsInline
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 1,
            opacity: fading ? 0 : 1,
            transition: fading ? 'none' : 'opacity 0.5s ease-in-out',
          }}
          onLoadedData={(e) => {
            if (fading) {
              requestAnimationFrame(() => {
                ;(e.target as HTMLVideoElement).style.opacity = '1'
              })
            }
          }}
        />
      ) : (
        <img
          src={currentUrl}
          alt={scene?.name ?? ''}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            zIndex: 1,
            opacity: fading ? 0 : 1,
            transition: fading ? 'none' : 'opacity 0.5s ease-in-out',
          }}
          onLoad={(e) => {
            if (fading) {
              requestAnimationFrame(() => {
                ;(e.target as HTMLImageElement).style.opacity = '1'
              })
            }
          }}
        />
      )}
      {scene?.particlePreset && scene.particlePreset !== 'none' && (
        <ParticleLayer preset={scene.particlePreset} />
      )}
    </div>
  )
  ```

  > `backdrop-filter` 为内联 style（运行时固定值），`transition-opacity` 使用 Tailwind class 确保 `motion-reduce:duration-0` 生效。遮罩层 `z-index: 10`（Tailwind `z-10`）高于媒体元素（`zIndex: 0/1`），`backdrop-filter` 对其后面内容生效。

- [ ] **Step 4: 同步修改 "No scene" 占位状态也接受 blurred**

  第 39-51 行的 "No scene selected" 分支也需要支持 blurred（否则切换时会闪）。将整段替换为：

  ```tsx
  return (
    <div
      onContextMenu={onContextMenu}
      className="w-screen h-screen flex items-center justify-center bg-deep relative"
    >
      {/* Same blur overlay as main branch */}
      <div
        className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-slow ease-out motion-reduce:duration-0 ${
          blurred ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ backdropFilter: 'blur(8px)', background: 'rgba(8,5,18,0.52)' }}
      />
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Image size={32} strokeWidth={1} className="text-text-muted/40" />
        <p className="text-text-muted text-sm">No scene selected</p>
        <p className="text-text-muted/50 text-xs">Upload a scene from the asset dock</p>
      </div>
    </div>
  )
  ```

- [ ] **Step 5: 构建检查**

  ```bash
  npm run build 2>&1 | tail -20
  ```

  Expected: 无 TypeScript 错误（`blurred` 还未传入 App.tsx，但类型可选所以不报错）

- [ ] **Step 6: Commit**
  ```bash
  git add src/scene/SceneViewer.tsx
  git commit -m "feat: add blurred prop to SceneViewer for combat mode"
  ```

---

### Task 2: KonvaMap 背景改为透明 + BackgroundLayer 去掉兜底

**Files:**

- Modify: `src/combat/KonvaMap.tsx`（第 429-435 行容器背景，第 584-595 行 BackgroundLayer）

**背景：** KonvaMap 容器背景当前是 `#111`，Konva Stage 需要透明以让底层模糊气氛图透出。BackgroundLayer 当前在无 `tacticalMapImageUrl` 时兜底到 `atmosphereImageUrl`，会导致气氛图双重渲染。

- [ ] **Step 1: 将容器背景色改为透明**

  找到 KonvaMap.tsx 约第 429-435 行（包含 `background: '#111'` 的容器 div）：

  ```tsx
  style={{
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: '#111',   // ← 要改的行
    position: 'relative',
  }}
  ```

  改为：

  ```tsx
  style={{
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: 'transparent',
    position: 'relative',
  }}
  ```

- [ ] **Step 2: 修改 BackgroundLayer —— 无 tacticalMapImageUrl 时返回 null**

  找到约第 584-595 行的 `BackgroundLayer` 函数：

  ```tsx
  function BackgroundLayer({ scene }: { scene: Scene }) {
    const imageUrl = scene.tacticalMapImageUrl || scene.atmosphereImageUrl
    const isVideo = isVideoUrl(imageUrl)

    if (isVideo) {
      return <VideoBackground url={imageUrl} width={scene.width} height={scene.height} />
    }

    return (
      <ImageBackground url={imageUrl} width={scene.width} height={scene.height} name={scene.name} />
    )
  }
  ```

  改为：

  ```tsx
  function BackgroundLayer({ scene }: { scene: Scene }) {
    const imageUrl = scene.tacticalMapImageUrl // 不再兜底到 atmosphereImageUrl
    if (!imageUrl) return null // 无战术地图图片时透明

    const isVideo = isVideoUrl(imageUrl)

    if (isVideo) {
      return <VideoBackground url={imageUrl} width={scene.width} height={scene.height} />
    }

    return (
      <ImageBackground url={imageUrl} width={scene.width} height={scene.height} name={scene.name} />
    )
  }
  ```

- [ ] **Step 3: 构建检查**

  ```bash
  npm run build 2>&1 | tail -20
  ```

  Expected: 无错误

- [ ] **Step 4: Commit**
  ```bash
  git add src/combat/KonvaMap.tsx
  git commit -m "feat: make KonvaMap background transparent, remove BackgroundLayer atmosphere fallback"
  ```

---

## Chunk 2: TacticalPanel 全屏改造

### Task 3: TacticalPanel 从浮窗改为全屏透明容器

**Files:**

- Modify: `src/combat/TacticalPanel.tsx`

**背景：** TacticalPanel 当前是一个 `top: 15vh, left: 15vw, width: 70vw, height: 70vh` 的固定浮窗，有深色毛玻璃背景和边框。需要改为全屏透明容器（`position: fixed; inset: 0; z-index: z-combat`），移除标题栏、TacticalToolbar、GridConfigPanel（这些迁移至 GmToolbar），并移除相关 props 和逻辑。

- [ ] **Step 0: 确认 `z-combat` Tailwind token 已定义**

  ```bash
  grep -n "combat" tailwind.config.ts
  ```

  Expected: `combat: '100',`（已存在，无需新增；对应 `z-index: 100`，位于背景层和 `z-ui: 1000` 之间）

- [ ] **Step 1: 移除 TacticalToolbar 和 GridConfigPanel 的 import**

  删除第 6-7 行：

  ```tsx
  import { TacticalToolbar } from './TacticalToolbar'
  import { GridConfigPanel } from './tools/GridConfigPanel'
  ```

- [ ] **Step 2: 精简 TacticalPanelProps —— 移除迁移至 GmToolbar 的 props**

  将接口改为：

  ```tsx
  interface TacticalPanelProps {
    scene: Scene | null
    tokens: MapToken[]
    getEntity: (id: string) => Entity | null
    mySeatId: string
    role: 'GM' | 'PL'
    selectedTokenId: string | null
    onSelectToken: (id: string | null) => void
    onUpdateToken: (id: string, updates: Partial<MapToken>) => void
    onDeleteToken: (id: string) => void
    onAddToken: (token: MapToken) => void
    onDropEntityOnMap?: (entityId: string, mapX: number, mapY: number) => void
    onContextMenu?: (e: React.MouseEvent) => void
  }
  ```

  （移除了 `onClose`、`onAdvanceInitiative`、`onUpdateScene`）

- [ ] **Step 3: 更新函数签名，移除已删除的 props 和内部状态**

  将函数体改为（完整替换 `export function TacticalPanel(...)` 到函数体开头）：

  ```tsx
  export function TacticalPanel({
    scene,
    tokens,
    getEntity,
    mySeatId,
    role,
    selectedTokenId,
    onSelectToken,
    onUpdateToken,
    onDeleteToken,
    onAddToken,
    onDropEntityOnMap,
    onContextMenu,
  }: TacticalPanelProps) {
    const gmViewAsPlayer = useUiStore((s) => s.gmViewAsPlayer)
  ```

  （移除了 `showGridConfig` state、`handleToggleGrid`、`handleToggleGridConfig`）

- [ ] **Step 4: 替换 return 语句 —— 全屏透明容器，只包 KonvaMap**

  将整个 `return (...)` 替换为：

  ```tsx
  return (
    <div className="z-combat" style={{ position: 'fixed', inset: 0 }} onContextMenu={onContextMenu}>
      {/* 全屏渐变遮罩（屏幕空间 vignette）—— 边缘暗化，增强地图与背景融合感。
           采用屏幕空间 radial-gradient 而非 Konva 层内的 mask，原因：
           1) 无论地图是否铺满全屏，边缘暗化始终与视口对齐；
           2) 纯 CSS，无需 Konva 绘图 API，实现更简单；
           3) 与背景模糊遮罩（SceneViewer 侧）在同一视觉空间形成连贯过渡。 */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.65) 100%)',
        }}
      />
      <KonvaMap
        scene={scene}
        tokens={tokens}
        getEntity={getEntity}
        mySeatId={mySeatId}
        role={role}
        selectedTokenId={selectedTokenId}
        onSelectToken={onSelectToken}
        onUpdateToken={onUpdateToken}
        onDeleteToken={onDeleteToken}
        onAddToken={onAddToken}
        onDropEntityOnMap={onDropEntityOnMap}
        gmViewAsPlayer={gmViewAsPlayer}
      />
    </div>
  )
  ```

- [ ] **Step 5: 删除文件顶部的 react import 整行**

  TacticalPanel 修改后不再使用任何 React hook（`gmViewAsPlayer` 来自 `useUiStore`），直接删除文件顶部的 react import 整行（形式可能是 `import { useState, useCallback } from 'react'` 或类似）。**不要改写成 `import {} from 'react'`** —— 空 named import 会产生 TypeScript 编译警告或错误，正确做法是整行删除。

- [ ] **Step 6: 构建检查**

  ```bash
  npm run build 2>&1 | tail -30
  ```

  Expected: TypeScript 错误提示 App.tsx 传入了 `onClose`、`onAdvanceInitiative`、`onUpdateScene`（这些在下一个 task 中处理）。除这几个之外不应有其他错误。

- [ ] **Step 7: Commit（含编译错误，下一步修复）**
  ```bash
  git add src/combat/TacticalPanel.tsx
  git commit -m "feat: refactor TacticalPanel to fullscreen transparent overlay"
  ```

---

## Chunk 3: GmToolbar 双行布局 + 删除 TacticalToolbar

### Task 4: 为 GmToolbar 添加战术工具上行

**Files:**

- Modify: `src/gm/GmToolbar.tsx`
- Modify: `src/combat/tools/GridConfigPanel.tsx`（定位改为 fixed）
- Delete: `src/combat/TacticalToolbar.tsx`

**背景：** 战术工具（select/measure/range/grid/next-turn）迁移到 GmToolbar，以双行布局呈现：上行战术工具（仅 isCombat 时），下行原有 Scenes + Exit Combat。GridConfigPanel 也迁移到 GmToolbar 管理，定位从 absolute 改为 fixed。

- [ ] **Step 1a: 替换 `GmToolbar.tsx` 文件顶部 import 块（第 1-5 行）**

  将现有的 5 行 import 全部替换为：

  ```tsx
  import { useState } from 'react'
  import type { ReactNode } from 'react'
  import {
    Image,
    Swords,
    X,
    MousePointer2,
    Ruler,
    Circle,
    Grid3x3,
    Settings,
    ChevronRight,
    Eye,
    EyeOff,
  } from 'lucide-react'
  import type { Scene } from '../yjs/useScenes'
  import { SceneListPanel } from './SceneListPanel'
  import { SceneConfigPanel } from './SceneConfigPanel'
  import { GridConfigPanel } from '../combat/tools/GridConfigPanel'
  import { useUiStore, type ActiveTool } from '../stores/uiStore'
  ```

  > `ReactNode` 类型用于文件底部的 `TacticalToolBtn` 辅助组件的 `icon` prop。

- [ ] **Step 1b: 更新 `GmToolbarProps` 接口，新增两个 props**

  将现有的 `GmToolbarProps` 接口改为：

  ```tsx
  interface GmToolbarProps {
    scenes: Scene[]
    activeSceneId: string | null
    isCombat: boolean
    activeScene: Scene | null // ← 新增
    onSelectScene: (sceneId: string) => void
    onToggleCombat: () => void
    onUpdateScene: (id: string, updates: Partial<Scene>) => void
    onDeleteScene: (id: string) => void
    onAdvanceInitiative: () => void // ← 新增
  }
  ```

- [ ] **Step 2: 更新函数签名，添加战术工具状态**

  ```tsx
  export function GmToolbar({
    scenes,
    activeSceneId,
    isCombat,
    activeScene,
    onSelectScene,
    onToggleCombat,
    onUpdateScene,
    onDeleteScene,
    onAdvanceInitiative,
  }: GmToolbarProps) {
    const [showSceneList, setShowSceneList] = useState(false)
    const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
    const [showGridConfig, setShowGridConfig] = useState(false)

    const activeTool = useUiStore((s) => s.activeTool)
    const setActiveTool = useUiStore((s) => s.setActiveTool)
    const gmViewAsPlayer = useUiStore((s) => s.gmViewAsPlayer)
    const setGmViewAsPlayer = useUiStore((s) => s.setGmViewAsPlayer)

    const editingScene = editingSceneId ? scenes.find((s) => s.id === editingSceneId) ?? null : null

    const handleToggleGrid = () => {
      if (!activeScene) return
      onUpdateScene(activeScene.id, {
        gridVisible: !activeScene.gridVisible,
        gridSnap: !activeScene.gridVisible,
      })
    }
  ```

- [ ] **Step 3: 在 GmToolbar 函数之前（模块顶层）添加 Range 工具常量**

  将以下代码插入在 `export function GmToolbar(...)` 函数定义**之前**（模块作用域，与 import 同级），这样常量不会在每次渲染时重新创建：

  ```tsx
  type RangeSubTool = 'range-circle' | 'range-cone' | 'range-rect'
  const RANGE_TOOLS: RangeSubTool[] = ['range-circle', 'range-cone', 'range-rect']
  const RANGE_LABELS: Record<RangeSubTool, string> = {
    'range-circle': 'Circle',
    'range-cone': 'Cone',
    'range-rect': 'Rectangle',
  }
  const isRangeTool = (t: ActiveTool): t is RangeSubTool => RANGE_TOOLS.includes(t as RangeSubTool)
  ```

  然后在 GmToolbar 函数内部（`handleToggleGrid` 下方，`return (` 之前）添加：

  ```tsx
  const isRangeActive = isRangeTool(activeTool)
  ```

- [ ] **Step 4: 替换 return 语句 —— 双行布局**

  ```tsx
  return (
    <>
      <div
        className="fixed bottom-3 left-4 z-toast flex flex-col gap-1.5 font-sans"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* 上行：战术工具（仅 isCombat 时渲染） */}
        {isCombat && (
          <div className="flex gap-1 items-center">
            {/* Select */}
            <TacticalToolBtn
              icon={<MousePointer2 size={16} strokeWidth={1.5} />}
              active={activeTool === 'select'}
              title="Select / Move"
              onClick={() => setActiveTool('select')}
            />
            {/* Measure */}
            <TacticalToolBtn
              icon={<Ruler size={16} strokeWidth={1.5} />}
              active={activeTool === 'measure'}
              title="Measure distance"
              onClick={() => setActiveTool('measure')}
            />
            {/* Range（带向上弹出子菜单） */}
            <div className="relative group">
              <TacticalToolBtn
                icon={<Circle size={16} strokeWidth={1.5} />}
                active={isRangeActive}
                title="Range templates"
                onClick={() => setActiveTool(isRangeActive ? 'select' : 'range-circle')}
              />
              <div className="absolute bottom-full left-0 mb-1 hidden group-hover:flex flex-col bg-glass backdrop-blur-[12px] border border-border-glass rounded py-1 z-10 min-w-[90px]">
                {RANGE_TOOLS.map((tool) => (
                  <button
                    key={tool}
                    onClick={() => setActiveTool(tool)}
                    className={`px-2.5 py-1.5 text-xs text-left border-none cursor-pointer transition-colors duration-fast ${
                      activeTool === tool
                        ? 'bg-accent text-deep'
                        : 'bg-transparent text-text-muted hover:text-text-primary hover:bg-hover'
                    }`}
                  >
                    {RANGE_LABELS[tool]}
                  </button>
                ))}
              </div>
            </div>

            {/* 分隔符 */}
            <div className="w-px h-5 bg-border-glass mx-0.5" />

            {/* Grid Toggle */}
            <TacticalToolBtn
              icon={<Grid3x3 size={16} strokeWidth={1.5} />}
              active={activeScene?.gridVisible ?? false}
              title="Toggle grid"
              onClick={handleToggleGrid}
            />
            {/* Grid Settings */}
            <TacticalToolBtn
              icon={<Settings size={16} strokeWidth={1.5} />}
              active={showGridConfig}
              title="Grid settings"
              onClick={() => setShowGridConfig((v) => !v)}
            />

            {/* 分隔符 */}
            <div className="w-px h-5 bg-border-glass mx-0.5" />

            {/* Player View Toggle（GM 专属，始终在 GmToolbar 中，无需 role 判断） */}
            <TacticalToolBtn
              icon={
                gmViewAsPlayer ? (
                  <EyeOff size={16} strokeWidth={1.5} />
                ) : (
                  <Eye size={16} strokeWidth={1.5} />
                )
              }
              active={gmViewAsPlayer}
              title="Toggle Player View"
              onClick={() => setGmViewAsPlayer(!gmViewAsPlayer)}
            />

            {/* 分隔符 */}
            <div className="w-px h-5 bg-border-glass mx-0.5" />

            {/* Next Turn */}
            <TacticalToolBtn
              icon={<ChevronRight size={16} strokeWidth={1.5} />}
              active={false}
              title="Next turn"
              onClick={onAdvanceInitiative}
            />
          </div>
        )}

        {/* 下行：原有按钮 */}
        <div className="flex gap-1.5 items-center">
          <button
            onClick={() => {
              setShowSceneList(!showSceneList)
              setEditingSceneId(null)
            }}
            className="flex items-center gap-1.5 rounded-lg bg-glass backdrop-blur-[12px] border border-border-glass px-3.5 py-2 text-xs font-semibold text-text-primary shadow-[0_2px_12px_rgba(0,0,0,0.3)] cursor-pointer hover:bg-hover transition-colors duration-fast"
          >
            <Image size={14} strokeWidth={1.5} />
            Scenes
          </button>
          <button
            onClick={onToggleCombat}
            className={`flex items-center gap-1.5 rounded-lg backdrop-blur-[12px] border border-border-glass px-3.5 py-2 text-xs font-semibold cursor-pointer shadow-[0_2px_12px_rgba(0,0,0,0.3)] transition-colors duration-fast ${
              isCombat
                ? 'bg-danger text-white hover:bg-danger/80'
                : 'bg-glass text-text-primary hover:bg-hover'
            }`}
          >
            {isCombat ? <X size={14} strokeWidth={1.5} /> : <Swords size={14} strokeWidth={1.5} />}
            {isCombat ? 'Exit Combat' : 'Combat'}
          </button>
        </div>
      </div>

      {/* GridConfigPanel（fixed 定位，锚定在 GmToolbar 上方） */}
      {isCombat && showGridConfig && activeScene && (
        <GridConfigPanel
          scene={activeScene}
          onUpdateScene={onUpdateScene}
          onClose={() => setShowGridConfig(false)}
        />
      )}

      {/* Scene List Panel */}
      {showSceneList && (
        <SceneListPanel
          scenes={scenes}
          activeSceneId={activeSceneId}
          onSelectScene={onSelectScene}
          onEditScene={setEditingSceneId}
          onClose={() => setShowSceneList(false)}
        />
      )}

      {/* Scene Config Panel */}
      {editingScene && (
        <SceneConfigPanel
          scene={editingScene}
          onUpdateScene={onUpdateScene}
          onDeleteScene={(id) => {
            onDeleteScene(id)
            setEditingSceneId(null)
          }}
          onClose={() => setEditingSceneId(null)}
        />
      )}
    </>
  )
  ```

- [ ] **Step 5: 在 GmToolbar.tsx 末尾添加 TacticalToolBtn 辅助组件**

  ```tsx
  // ── Tactical Tool Button ──

  function TacticalToolBtn({
    icon,
    active,
    title,
    onClick,
  }: {
    icon: ReactNode
    active: boolean
    title: string
    onClick: () => void
  }) {
    return (
      <button
        onClick={onClick}
        title={title}
        className={`w-8 h-8 flex items-center justify-center rounded cursor-pointer border-none transition-colors duration-fast focus:ring-2 focus:ring-accent focus:outline-none ${
          active
            ? 'bg-accent text-deep'
            : 'bg-glass backdrop-blur-[12px] border border-border-glass text-text-muted hover:text-text-primary hover:bg-hover'
        }`}
      >
        {icon}
      </button>
    )
  }
  ```

- [ ] **Step 6: 更新 GridConfigPanel 定位从 absolute 改为 fixed**

  打开 `src/combat/tools/GridConfigPanel.tsx`，找到面板根元素的 `style={{...}}` 对象（包含 `position: 'absolute'` 和 `left: 48, top: 8` 的那个），将**整个 style 对象**替换为：

  ```tsx
  style={{
    position: 'fixed',
    bottom: 72,    // GmToolbar 双行高度约 68px，留 4px 间距
    left: 12,
    width: 200,
    zIndex: 10001, // 高于 GmToolbar (z-toast: 10000)
    padding: '12px',
  }}
  ```

  > 确认旧的 `top`、`left: 48` 等属性均已被移除，整个对象完整替换。

- [ ] **Step 7: 删除 TacticalToolbar.tsx**

  ```bash
  git rm src/combat/TacticalToolbar.tsx
  ```

- [ ] **Step 8: 构建检查**

  ```bash
  npm run build 2>&1 | tail -30
  ```

  Expected: TypeScript 错误提示 App.tsx 中 GmToolbar 缺少 `activeScene` 和 `onAdvanceInitiative` props，以及 TacticalPanel 多余的 props。这些在 Task 5 中修复。

- [ ] **Step 9: Commit**
  ```bash
  git add src/gm/GmToolbar.tsx src/combat/tools/GridConfigPanel.tsx
  git commit -m "feat: add dual-row tactical tools to GmToolbar, fix GridConfigPanel position"
  ```

---

## Chunk 4: App.tsx 接线 + 最终验证

### Task 5: App.tsx 传入新 props，完成接线

**Files:**

- Modify: `src/App.tsx`

**背景：** App.tsx 需要：

1. 向 `SceneViewer` 传入 `blurred={isCombat}`
2. 向 `GmToolbar` 传入 `activeScene` 和 `onAdvanceInitiative`
3. 从 `TacticalPanel` 移除 `onClose`、`onAdvanceInitiative`、`onUpdateScene`

- [ ] **Step 1: SceneViewer 添加 `blurred` prop**

  找到 App.tsx 中渲染 `<SceneViewer` 的位置（约第 289-292 行），添加 `blurred={isCombat}`：

  ```tsx
  <SceneViewer
    scene={activeScene}
    blurred={isCombat} // ← 新增
    onContextMenu={handleBgContextMenu}
  />
  ```

- [ ] **Step 2: TacticalPanel 移除三个 props**

  找到约第 294-316 行的 TacticalPanel，移除 `onClose`、`onAdvanceInitiative`、`onUpdateScene`：

  ```tsx
  {
    isCombat && (
      <TacticalPanel
        scene={activeScene}
        tokens={tokens}
        getEntity={getEntity}
        mySeatId={mySeatId}
        role={mySeat.role}
        selectedTokenId={selectedTokenId}
        onSelectToken={setSelectedTokenId}
        onUpdateToken={updateToken}
        onDeleteToken={deleteToken}
        onAddToken={addToken}
        onDropEntityOnMap={handleDropEntityOnMap}
        onContextMenu={handleBgContextMenu}
      />
    )
  }
  ```

- [ ] **Step 3: GmToolbar 添加 `activeScene` 和 `onAdvanceInitiative` props**

  找到约第 397-408 行的 GmToolbar：

  ```tsx
  {
    isGM && (
      <GmToolbar
        scenes={scenes}
        activeSceneId={room.activeSceneId}
        isCombat={isCombat}
        activeScene={activeScene} // ← 新增
        onSelectScene={setActiveScene}
        onToggleCombat={() => {
          if (room.activeSceneId) setCombatActive(room.activeSceneId, !isCombat)
        }}
        onUpdateScene={updateScene}
        onDeleteScene={handleDeleteScene}
        onAdvanceInitiative={() => {
          // ← 新增
          if (room.activeSceneId) advanceInitiative(room.activeSceneId)
        }}
      />
    )
  }
  ```

- [ ] **Step 4: 构建检查（应全部通过）**

  ```bash
  npm run build 2>&1 | tail -20
  ```

  Expected: `✓ built in Xms`，零错误零警告

- [ ] **Step 5: Commit**
  ```bash
  git add src/App.tsx
  git commit -m "feat: wire blurred prop and tactical tool callbacks in App.tsx"
  ```

---

### Task 6: 端到端手动验证

**目的：** 确认所有改动整合后的视觉效果和功能正确。

- [ ] **Step 1: 启动开发服务器**

  ```bash
  npm run dev
  ```

  在浏览器打开 `http://localhost:5173`（或 `.env` 中配置的端口）

- [ ] **Step 2: 验证叙事模式**
  - 进入页面，选择一个有气氛图的场景
  - ✅ 气氛图全屏显示，无网格，无战术浮窗，粒子特效正常

- [ ] **Step 3: 验证战术模式激活**
  - 点击 GmToolbar → "Combat" 按钮
  - ✅ 背景气氛图做模糊 + 暗化（可感知颜色，但细节模糊）
  - ✅ GmToolbar 出现第二行战术工具图标
  - ✅ 若场景有 `tacticalMapImageUrl`：战术地图图片全屏渲染在气氛图上方
  - ✅ 若场景无 `tacticalMapImageUrl`：只有模糊气氛图 + 网格（如果开启）
  - ✅ 屏幕边缘可见径向暗化渐变（vignette 效果）

- [ ] **Step 4: 验证工具切换**
  - 点击上行各工具按钮（Select / Measure / Range）
  - ✅ 按钮高亮状态切换正确（`bg-accent text-deep`）
  - ✅ Range 按钮悬停时子菜单向上弹出
  - ✅ Grid 切换按钮显隐网格
  - ✅ Grid Settings 弹出 GridConfigPanel（在 GmToolbar 上方，不遮挡地图）

- [ ] **Step 5: 验证 Token 交互**
  - 将 Token 拖放到地图上
  - ✅ Token 可在全屏战术层上正常拖拽
  - ✅ Token 上下文菜单（右键）仍然工作

- [ ] **Step 6: 验证地图未铺满时的效果**
  - 使用尺寸小于视口的战术地图图片（或缩小 Konva Stage）
  - ✅ 地图外区域透出底层模糊气氛图（非纯黑）
  - ✅ 地图边缘与背景自然融合（过渡不突兀）

- [ ] **Step 7: 验证退出战术模式**
  - 点击 GmToolbar → "Exit Combat"
  - ✅ 气氛图恢复清晰（无模糊，无暗化）
  - ✅ 工具行消失
  - ✅ PortraitBar、HamburgerMenu、BottomDock 始终可见且功能正常

- [ ] **Step 8: 验证玩家视角**
  - 以玩家身份连接（不同浏览器 Tab，选择 Player 席位）
  - ✅ 战术模式激活时玩家可看到全屏战术地图
  - ✅ GmToolbar（含工具行）不可见
  - ✅ SceneViewer 模糊效果对玩家也生效

- [ ] **Step 9: 若手动验证过程中有临时文件改动，按需 commit**

  如果验证过程中有任何文件修改（例如临时调试代码），使用具体文件名 add 而非 `git add -A`：

  ```bash
  git add src/<修改的文件路径>
  git commit -m "chore: fix issue found during tactical map integration verification"
  ```

  若 Task 1-5 的 commit 已覆盖所有改动，此步骤可跳过。

---

### Task 7: 提交 PR

- [ ] **Step 1: 推送分支**

  ```bash
  git push -u origin tactical-immersive
  ```

- [ ] **Step 2: 创建 PR（squash merge）**

  ```bash
  gh pr create \
    --title "feat: tactical map immersive overlay" \
    --body "将战术地图从独立浮窗改为全屏沉浸层。背景气氛图在战术模式下高斯模糊+暗化，Konva Canvas 全屏透明覆盖，战术工具整合进 GmToolbar 双行布局。删除 TacticalToolbar 独立组件。" \
    --base main
  ```

- [ ] **Step 3: 合并（squash）**
  ```bash
  gh pr merge --squash
  ```
