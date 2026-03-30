import type { GameLogEntry } from '../shared/logTypes'
import { getDisplayIdentity } from '../shared/chatTypes'
import { Avatar } from '../chat/Avatar'

export interface CardShellProps {
  entry: GameLogEntry
  isNew?: boolean
  variant?: 'default' | 'accent'
  animationStyle?: 'toast' | 'scroll'
  children: React.ReactNode
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

export function CardShell({
  entry,
  isNew = false,
  variant = 'default',
  animationStyle = 'scroll',
  children,
}: CardShellProps) {
  const display = getDisplayIdentity(entry.origin)

  const animation = isNew
    ? animationStyle === 'toast'
      ? 'toastEnter 0.3s ease-out'
      : 'messageEnter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
    : 'none'

  if (variant === 'accent') {
    return (
      <div
        data-testid="log-entry-card"
        data-entry-type={entry.type}
        className="relative flex gap-2.5 px-4 py-3 bg-glass backdrop-blur-[20px] border border-accent/40 shadow-[0_4px_16px_rgba(212,160,85,0.15),inset_0_1px_0_rgba(232,184,106,0.1)] rounded-xl"
        style={{ animation }}
      >
        <Avatar
          portraitUrl={display.portraitUrl}
          senderName={display.name}
          senderColor={display.color}
        />
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-[13px] font-semibold" style={{ color: display.color }}>
              {display.name}
            </span>
            <span className="text-[11px] text-text-muted/40">{formatTime(entry.timestamp)}</span>
          </div>
          {children}
        </div>
      </div>
    )
  }

  // variant === 'default'
  return (
    <div
      data-testid="log-entry-card"
      data-entry-type={entry.type}
      className="flex gap-2.5 px-3.5 py-2.5 bg-glass backdrop-blur-[20px] border border-border-glass shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] rounded-[10px]"
      style={{ animation }}
    >
      <Avatar
        portraitUrl={display.portraitUrl}
        senderName={display.name}
        senderColor={display.color}
      />
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold" style={{ color: display.color }}>
            {display.name}
          </span>
          <span className="text-[11px] text-text-muted/40">{formatTime(entry.timestamp)}</span>
        </div>
        {children}
      </div>
    </div>
  )
}
