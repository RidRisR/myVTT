import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props {
  panelId: string
  children: ReactNode
}

interface State {
  crashed: boolean
  error: Error | null
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { crashed: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[UISystem] Panel "${this.props.panelId}" crashed:`, error, info)
  }

  render() {
    if (this.state.crashed) {
      return (
        <div style={{ padding: 8, color: '#f87171', fontSize: 12 }}>
          ⚠ {this.props.panelId} crashed
        </div>
      )
    }
    return this.props.children
  }
}

/** Alias for Region Model — same component, clearer name */
export { PanelErrorBoundary as RegionErrorBoundary }
