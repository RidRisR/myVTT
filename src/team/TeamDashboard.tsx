import { useState } from 'react'
import * as Y from 'yjs'
import { useTeamMetrics } from './useTeamMetrics'
import { TeamMetricsTab } from './TeamMetricsTab'

interface TeamDashboardProps {
  yDoc: Y.Doc
  isGM: boolean
}

type TabId = 'metrics'

const TABS: { id: TabId; label: string }[] = [
  { id: 'metrics', label: 'Metrics' },
]

export function TeamDashboard({ yDoc, isGM }: TeamDashboardProps) {
  const { trackers, addTracker, updateTracker, deleteTracker } = useTeamMetrics(yDoc)
  const [activeTab, setActiveTab] = useState<TabId>('metrics')
  const [expanded, setExpanded] = useState(false)

  // Hide entire dashboard if no trackers and not GM
  if (trackers.length === 0 && !isGM) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        right: 16,
        width: 546,
        zIndex: 10000,
        fontFamily: 'sans-serif',
        pointerEvents: 'auto',
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div style={{
        background: 'rgba(15, 15, 25, 0.92)',
        backdropFilter: 'blur(16px)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.08)',
        overflow: 'hidden',
        color: '#e4e4e7',
      }}>
        {/* Tab bar + expand/collapse (only when expanded) */}
        {expanded && (
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', flex: 1 }}>
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                    cursor: 'pointer',
                    color: activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.4)',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    transition: 'color 0.15s, border-color 0.15s',
                    fontFamily: 'sans-serif',
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== tab.id) e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== tab.id) e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {isGM && (
              <button
                onClick={() => setExpanded(!expanded)}
                style={{
                  width: 42,
                  background: 'rgba(255,255,255,0.03)',
                  border: 'none',
                  borderLeft: '1px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Active tab content */}
        <div
          style={{
            padding: expanded ? '12px 14px 14px' : '10px 14px',
            cursor: !expanded && isGM ? 'pointer' : 'default',
          }}
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
