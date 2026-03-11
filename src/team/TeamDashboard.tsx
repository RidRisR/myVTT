import { useState } from 'react'
import * as Y from 'yjs'
import { ChevronDown } from 'lucide-react'
import { useTeamMetrics } from './useTeamMetrics'
import { TeamMetricsTab } from './TeamMetricsTab'

interface TeamDashboardProps {
  yDoc: Y.Doc
  isGM: boolean
}

type TabId = 'metrics'

const TABS: { id: TabId; label: string }[] = [{ id: 'metrics', label: 'Metrics' }]

export function TeamDashboard({ yDoc, isGM }: TeamDashboardProps) {
  const { trackers, addTracker, updateTracker, deleteTracker } = useTeamMetrics(yDoc)
  const [activeTab, setActiveTab] = useState<TabId>('metrics')
  const [expanded, setExpanded] = useState(false)

  // Hide entire dashboard if no trackers and not GM
  if (trackers.length === 0 && !isGM) return null

  return (
    <div
      className="fixed top-3 right-4 z-ui font-sans pointer-events-auto"
      style={{ width: 546 }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="bg-glass backdrop-blur-[16px] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-border-glass overflow-hidden text-text-primary">
        {/* Tab bar + expand/collapse (only when expanded) */}
        {expanded && (
          <div className="flex items-stretch border-b border-border-glass">
            <div className="flex flex-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 px-4 py-2.5 bg-transparent border-none cursor-pointer text-[9px] font-bold tracking-wider uppercase font-sans transition-colors duration-fast ${
                    activeTab === tab.id
                      ? 'text-text-primary border-b-2 border-b-accent'
                      : 'text-text-muted/40 border-b-2 border-b-transparent hover:text-text-muted/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {isGM && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-[42px] bg-surface/30 border-none border-l border-l-border-glass cursor-pointer text-text-muted/35 flex items-center justify-center transition-colors duration-fast hover:bg-hover hover:text-text-muted/70"
              >
                <ChevronDown
                  size={12}
                  strokeWidth={2.5}
                  className="transition-transform duration-normal"
                  style={{
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </button>
            )}
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
          {activeTab === 'metrics' && (
            <TeamMetricsTab
              trackers={trackers}
              expanded={expanded}
              isGM={isGM}
              onUpdateTracker={updateTracker}
              onAddTracker={addTracker}
              onDeleteTracker={deleteTracker}
            />
          )}
        </div>
      </div>
    </div>
  )
}
