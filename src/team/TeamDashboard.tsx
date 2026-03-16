import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useWorldStore } from '../stores/worldStore'
import { TeamMetricsTab } from './TeamMetricsTab'
import { useUiStore } from '../stores/uiStore'
import { RIGHT_PANEL_WIDTH } from '../shared/layoutConstants'
import { useRulePlugin } from '../rules/useRulePlugin'

interface TeamDashboardProps {
  roomId: string
  isGM: boolean
}

type TabId = 'metrics'

const TABS: { id: TabId; label: string }[] = [{ id: 'metrics', label: 'Metrics' }]

export function TeamDashboard({ isGM }: TeamDashboardProps) {
  const trackers = useWorldStore((s) => s.teamTrackers)
  const addTracker = useWorldStore((s) => s.addTeamTracker)
  const updateTracker = useWorldStore((s) => s.updateTeamTracker)
  const deleteTracker = useWorldStore((s) => s.deleteTeamTracker)
  const [, setActiveTab] = useState<TabId>('metrics')
  const [expanded, setExpanded] = useState(false)
  const teamPanelVisible = useUiStore((s) => s.teamPanelVisible)
  const setTeamPanelVisible = useUiStore((s) => s.setTeamPanelVisible)
  const plugin = useRulePlugin()
  const PluginTeamPanel = plugin.surfaces?.teamPanel

  // Hide entire dashboard if no trackers and not GM
  if (trackers.length === 0 && !isGM) return null

  // Collapsed: show small expand button
  if (!teamPanelVisible) {
    return (
      <div
        className="fixed top-3 right-4 z-ui font-sans pointer-events-auto"
        onPointerDown={(e) => {
          e.stopPropagation()
        }}
      >
        <button
          onClick={() => {
            setTeamPanelVisible(true)
          }}
          className="flex items-center gap-1 bg-glass backdrop-blur-[12px] rounded-lg px-2.5 py-1.5 border border-border-glass text-text-muted text-[10px] cursor-pointer hover:bg-hover transition-colors duration-fast shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
        >
          <ChevronRight size={12} strokeWidth={1.5} className="rotate-180" />
          Team
        </button>
      </div>
    )
  }

  return (
    <div
      className="fixed top-3 right-4 z-ui font-sans pointer-events-auto"
      style={{ width: RIGHT_PANEL_WIDTH }}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
      onWheel={(e) => {
        e.stopPropagation()
      }}
    >
      <div className="bg-glass backdrop-blur-[16px] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-border-glass overflow-hidden text-text-primary">
        {/* Tab bar + expand/collapse (only when expanded) */}
        {expanded && (
          <div className="flex items-stretch border-b border-border-glass">
            <div className="flex flex-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id)
                  }}
                  className="flex-1 px-4 py-2.5 bg-transparent border-none cursor-pointer text-[9px] font-bold tracking-wider uppercase font-sans transition-colors duration-fast text-text-primary border-b-2 border-b-accent"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex">
              {isGM && (
                <button
                  onClick={() => {
                    setExpanded(!expanded)
                  }}
                  className="w-[36px] bg-surface/30 border-none border-l border-l-border-glass cursor-pointer text-text-muted/35 flex items-center justify-center transition-colors duration-fast hover:bg-hover hover:text-text-muted/70"
                >
                  <ChevronDown
                    size={12}
                    strokeWidth={2.5}
                    className="transition-transform duration-normal"
                    style={{
                      transform: 'rotate(180deg)',
                    }}
                  />
                </button>
              )}
              <button
                onClick={() => {
                  setTeamPanelVisible(false)
                }}
                className="w-[36px] bg-surface/30 border-none border-l border-l-border-glass cursor-pointer text-text-muted/35 flex items-center justify-center transition-colors duration-fast hover:bg-hover hover:text-text-muted/70"
                title="Hide panel"
              >
                <ChevronRight size={12} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {/* Active tab content */}
        <div
          className={expanded ? 'px-3.5 pt-3 pb-3.5' : 'px-3.5 py-2.5'}
          style={{ cursor: !expanded && isGM ? 'pointer' : 'default' }}
          onClick={() => {
            if (!expanded && isGM) setExpanded(true)
          }}
        >
          {PluginTeamPanel ? (
            <PluginTeamPanel
              trackers={trackers}
              onUpdate={(id, updates) => {
                void updateTracker(id, updates)
              }}
              onCreate={(data) => {
                void addTracker(data.label ?? 'Tracker')
              }}
              onDelete={(id) => {
                void deleteTracker(id)
              }}
            />
          ) : (
            <TeamMetricsTab
              trackers={trackers}
              expanded={expanded}
              isGM={isGM}
              onUpdateTracker={(id, updates) => {
                void updateTracker(id, updates)
              }}
              onAddTracker={(label) => {
                void addTracker(label)
              }}
              onDeleteTracker={(id) => {
                void deleteTracker(id)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
