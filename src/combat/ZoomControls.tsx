interface ZoomControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFitToWindow: () => void
  onResetCenter: () => void
}

export function ZoomControls({
  onZoomIn,
  onZoomOut,
  onFitToWindow,
  onResetCenter,
}: ZoomControlsProps) {
  return (
    <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
      <ZoomButton label="+" onClick={onZoomIn} title="Zoom in" />
      <ZoomButton label={'\u2212'} onClick={onZoomOut} title="Zoom out" />
      <ZoomButton label={'\u2922'} onClick={onFitToWindow} title="Fit to window" />
      <ZoomButton label={'\u2316'} onClick={onResetCenter} title="Reset center" />
    </div>
  )
}

function ZoomButton({
  label,
  onClick,
  title,
}: {
  label: string
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="w-7 h-7 rounded flex items-center justify-center p-0 leading-none text-base font-bold cursor-pointer border border-border-glass bg-glass backdrop-blur-[8px] text-text-primary hover:bg-hover transition-colors duration-fast"
    >
      {label}
    </button>
  )
}
