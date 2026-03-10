interface DisconnectOverlayProps {
  isDisconnected: boolean
}

export function DisconnectOverlay({ isDisconnected }: DisconnectOverlayProps) {
  if (!isDisconnected) return null

  return (
    <div
      className="fixed inset-0 z-overlay flex flex-col items-center justify-center bg-deep/85 backdrop-blur-[8px] animate-fade-in"
      role="alert"
      aria-live="assertive"
    >
      {/* Spinner */}
      <div className="mb-6">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          className="animate-spin text-accent"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            opacity="0.25"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Message */}
      <h2 className="text-xl font-semibold text-text-primary mb-2">Connection lost</h2>
      <p className="text-sm text-text-muted">Attempting to reconnect...</p>
    </div>
  )
}
