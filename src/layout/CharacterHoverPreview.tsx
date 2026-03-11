import { useState } from 'react'
import type { Entity } from '../shared/entityTypes'
import {
  getEntityResources,
  getEntityAttributes,
  getEntityStatuses,
  type ResourceView,
} from '../shared/entityAdapters'
import { statusColor } from '../shared/tokenUtils'
import { ResourceBar } from '../shared/ui/ResourceBar'
import { useIdentityStore } from '../stores/identityStore'
import { useAwarenessResource, getRemoteEdit } from '../shared/hooks/useAwarenessResource'

interface CharacterHoverPreviewProps {
  character: Entity
  isOnline: boolean
  editable?: boolean
  onUpdateCharacter?: (id: string, updates: Partial<Entity>) => void
}

type Tab = 'stats' | 'attr'

export function CharacterHoverPreview({
  character,
  isOnline,
  editable,
  onUpdateCharacter,
}: CharacterHoverPreviewProps) {
  // Awareness for resource drag broadcasting
  const awareness = useIdentityStore((s) => s.getAwareness())
  const mySeatId = useIdentityStore((s) => s.mySeatId)
  const mySeat = useIdentityStore((s) => s.getMySeat())
  const { broadcastEditing, clearEditing, remoteEdits } = useAwarenessResource(
    awareness,
    mySeatId,
    mySeat?.color ?? null,
  )

  const allResources = getEntityResources(character)
  const resources = allResources.filter((r) => r.max > 0)
  const attributes = getEntityAttributes(character)
  const statuses = getEntityStatuses(character)
  const [activeTab, setActiveTab] = useState<Tab>('stats')
  const [editingStatusIdx, setEditingStatusIdx] = useState<number | null>(null)
  const [editingStatusLabel, setEditingStatusLabel] = useState('')
  const [addingStatus, setAddingStatus] = useState(false)
  const [newStatusLabel, setNewStatusLabel] = useState('')

  const canEdit = !!(editable && onUpdateCharacter)
  const hasStats = resources.length > 0 || statuses.length > 0 || !!canEdit
  const hasAttr = attributes.length > 0
  const showTabs = hasStats && hasAttr

  /** Wrap a ruleData sub-key update into a Partial<Entity> */
  function updateRuleData(key: string, value: unknown): Partial<Entity> {
    const rd = (character.ruleData ?? {}) as Record<string, unknown>
    return { ruleData: { ...rd, [key]: value } }
  }

  const updateResource = (index: number, updates: Partial<ResourceView>) => {
    if (!onUpdateCharacter) return
    const visibleIndex = allResources.indexOf(resources[index])
    if (visibleIndex < 0) return
    const next = [...allResources]
    next[visibleIndex] = { ...next[visibleIndex], ...updates }
    onUpdateCharacter(character.id, updateRuleData('resources', next))
  }

  const removeStatus = (index: number) => {
    if (!onUpdateCharacter) return
    const next = statuses.filter((_, i) => i !== index)
    onUpdateCharacter(character.id, updateRuleData('statuses', next))
  }

  const commitStatusEdit = (index: number, label: string) => {
    if (!onUpdateCharacter) return
    const trimmed = label.trim()
    if (trimmed && trimmed !== statuses[index].label) {
      const next = [...statuses]
      next[index] = { label: trimmed }
      onUpdateCharacter(character.id, updateRuleData('statuses', next))
    }
    setEditingStatusIdx(null)
  }

  const commitNewStatus = (label: string) => {
    if (!onUpdateCharacter) return
    const trimmed = label.trim()
    if (trimmed) {
      onUpdateCharacter(character.id, updateRuleData('statuses', [...statuses, { label: trimmed }]))
    }
    setNewStatusLabel('')
    setAddingStatus(false)
  }

  // Determine which content to show
  const showStats = showTabs ? activeTab === 'stats' : hasStats
  const showAttr = showTabs ? activeTab === 'attr' : hasAttr

  return (
    <div
      style={{
        width: 220,
        background: 'rgba(15, 15, 25, 0.92)',
        backdropFilter: 'blur(16px)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '12px 14px',
        fontFamily: 'sans-serif',
        color: '#e4e4e7',
        animation: 'popoverFadeIn 0.12s ease-out',
      }}
    >
      <style>{`
        @keyframes popoverFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Name + online status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: hasStats || hasAttr ? 8 : 0,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 14,
            color: '#fff',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {character.name}
        </span>
        {isOnline && (
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#22c55e',
              boxShadow: '0 0 6px rgba(34,197,94,0.5)',
              flexShrink: 0,
            }}
          />
        )}
      </div>

      {/* Tab bar */}
      {showTabs && (
        <div
          style={{
            display: 'flex',
            gap: 2,
            marginBottom: 8,
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 6,
            padding: 2,
          }}
        >
          {(
            [
              ['stats', 'Stats'],
              ['attr', 'Attr'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                flex: 1,
                padding: '3px 0',
                border: 'none',
                cursor: 'pointer',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                background: activeTab === key ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: activeTab === key ? '#fff' : 'rgba(255,255,255,0.4)',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Stats tab: Resources + Statuses */}
      {showStats && (
        <>
          {resources.map((res, i) => {
            const allIdx = allResources.indexOf(res)
            const remoteEdit = getRemoteEdit(remoteEdits, character.id, String(allIdx))
            return (
              <ResourceBar
                key={i}
                label={res.key || 'Unnamed'}
                current={res.current}
                max={res.max}
                color={res.color}
                height={canEdit ? 10 : 6}
                valueDisplay={canEdit ? 'inline' : 'outside'}
                draggable={canEdit}
                showButtons={canEdit}
                onChange={(val: number) => updateResource(i, { current: val })}
                onDragStart={canEdit ? () => broadcastEditing(character.id, String(allIdx), res.current) : undefined}
                onDragMove={canEdit ? (val: number) => broadcastEditing(character.id, String(allIdx), val) : undefined}
                onDragEnd={canEdit ? (val: number) => {
                  updateResource(i, { current: val })
                  clearEditing()
                } : undefined}
                remoteDragValue={remoteEdit?.value ?? null}
                softLockColor={remoteEdit?.color ?? null}
                style={{ marginBottom: i < resources.length - 1 ? 5 : 0 }}
              />
            )
          })}

          {/* Statuses */}
          {(statuses.length > 0 || canEdit) && (
            <div
              style={{
                marginTop: resources.length > 0 ? 8 : 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                alignItems: 'center',
              }}
            >
              {statuses.map((s, i) => {
                const sc = statusColor(s.label)
                if (canEdit && editingStatusIdx === i) {
                  return (
                    <input
                      key={i}
                      autoFocus
                      value={editingStatusLabel}
                      onChange={(e) => setEditingStatusLabel(e.target.value)}
                      onBlur={() => commitStatusEdit(i, editingStatusLabel)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitStatusEdit(i, editingStatusLabel)
                        if (e.key === 'Escape') setEditingStatusIdx(null)
                      }}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: `${sc}22`,
                        color: sc,
                        fontSize: 10,
                        fontWeight: 600,
                        border: `1px solid ${sc}66`,
                        outline: 'none',
                        width: 60,
                        fontFamily: 'inherit',
                      }}
                    />
                  )
                }
                return (
                  <span
                    key={i}
                    style={{
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: `${sc}22`,
                      color: sc,
                      fontSize: 10,
                      fontWeight: 600,
                      border: `1px solid ${sc}33`,
                      position: 'relative',
                      cursor: canEdit ? 'pointer' : 'default',
                    }}
                    onClick={
                      canEdit
                        ? () => {
                            setEditingStatusIdx(i)
                            setEditingStatusLabel(s.label)
                          }
                        : undefined
                    }
                    onMouseEnter={
                      canEdit
                        ? (e) => {
                            const x = e.currentTarget.querySelector('.status-x') as HTMLElement
                            if (x) x.style.opacity = '1'
                          }
                        : undefined
                    }
                    onMouseLeave={
                      canEdit
                        ? (e) => {
                            const x = e.currentTarget.querySelector('.status-x') as HTMLElement
                            if (x) x.style.opacity = '0'
                          }
                        : undefined
                    }
                  >
                    {s.label}
                    {canEdit && (
                      <span
                        className="status-x"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeStatus(i)
                        }}
                        style={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          background: 'rgba(30,30,40,0.95)',
                          border: '1px solid rgba(255,255,255,0.15)',
                          color: 'rgba(255,255,255,0.5)',
                          fontSize: 8,
                          fontWeight: 700,
                          lineHeight: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          opacity: 0,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        x
                      </span>
                    )}
                  </span>
                )
              })}
              {canEdit && !addingStatus && (
                <span
                  onClick={() => setAddingStatus(true)}
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.35)',
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
                  }}
                >
                  +
                </span>
              )}
              {canEdit && addingStatus && (
                <input
                  autoFocus
                  value={newStatusLabel}
                  onChange={(e) => setNewStatusLabel(e.target.value)}
                  onBlur={() => commitNewStatus(newStatusLabel)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitNewStatus(newStatusLabel)
                    if (e.key === 'Escape') {
                      setAddingStatus(false)
                      setNewStatusLabel('')
                    }
                  }}
                  placeholder="Status..."
                  style={{
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.06)',
                    color: '#e4e4e7',
                    fontSize: 10,
                    fontWeight: 600,
                    border: '1px solid rgba(255,255,255,0.2)',
                    outline: 'none',
                    width: 60,
                    fontFamily: 'inherit',
                  }}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* Attr tab: Attributes */}
      {showAttr && (
        <div>
          {attributes.map((attr, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '3px 6px',
                borderRadius: 4,
                background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                fontSize: 11,
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                {attr.key || 'Unnamed'}
              </span>
              <span style={{ color: '#fff', fontWeight: 700 }}>{attr.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
