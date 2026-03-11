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

interface GmToolbarProps {
  scenes: Scene[]
  activeSceneId: string | null
  isCombat: boolean
  activeScene: Scene | null // ← new
  onSelectScene: (sceneId: string) => void
  onToggleCombat: () => void
  onUpdateScene: (id: string, updates: Partial<Scene>) => void
  onDeleteScene: (id: string) => void
  onAdvanceInitiative: () => void // ← new
}

type RangeSubTool = 'range-circle' | 'range-cone' | 'range-rect'
const RANGE_TOOLS: RangeSubTool[] = ['range-circle', 'range-cone', 'range-rect']
const RANGE_LABELS: Record<RangeSubTool, string> = {
  'range-circle': 'Circle',
  'range-cone': 'Cone',
  'range-rect': 'Rectangle',
}
const isRangeTool = (t: ActiveTool): t is RangeSubTool => RANGE_TOOLS.includes(t as RangeSubTool)

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

  const editingScene = editingSceneId ? (scenes.find((s) => s.id === editingSceneId) ?? null) : null

  const handleToggleGrid = () => {
    if (!activeScene) return
    onUpdateScene(activeScene.id, {
      gridVisible: !activeScene.gridVisible,
      gridSnap: !activeScene.gridVisible,
    })
  }

  const isRangeActive = isRangeTool(activeTool)

  return (
    <>
      <div
        className="fixed bottom-3 left-4 z-toast flex flex-col gap-1.5 font-sans"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Upper row: tactical tools (only when isCombat) */}
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
            {/* Range with upward-opening submenu */}
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

            {/* Separator */}
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

            {/* Separator */}
            <div className="w-px h-5 bg-border-glass mx-0.5" />

            {/* Player View Toggle (GM-only, always in GmToolbar) */}
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

            {/* Separator */}
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

        {/* Lower row: original buttons */}
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

      {/* GridConfigPanel (fixed position, anchored above GmToolbar) */}
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
}

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
