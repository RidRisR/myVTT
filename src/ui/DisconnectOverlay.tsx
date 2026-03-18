import { Loader } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface DisconnectOverlayProps {
  isDisconnected: boolean
}

export function DisconnectOverlay({ isDisconnected }: DisconnectOverlayProps) {
  const { t } = useTranslation('ui')
  if (!isDisconnected) return null

  return (
    <div
      className="fixed inset-0 z-overlay flex flex-col items-center justify-center bg-deep/85 backdrop-blur-[8px] animate-fade-in"
      role="alert"
      aria-live="assertive"
    >
      {/* Spinner */}
      <div className="mb-6">
        <Loader
          size={48}
          strokeWidth={1.5}
          className="animate-spin text-accent"
          aria-hidden="true"
        />
      </div>

      {/* Message */}
      <h2 className="text-xl font-semibold text-text-primary mb-2">{t('connection_lost')}</h2>
      <p className="text-sm text-text-muted">{t('reconnecting')}</p>
    </div>
  )
}
