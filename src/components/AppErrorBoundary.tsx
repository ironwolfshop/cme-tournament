import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** Keeps the UI from going fully blank when a page throws. */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crash:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: '#0b1220',
            color: '#e2e8f0',
            fontFamily: 'system-ui, sans-serif',
            padding: 24,
            maxWidth: 720,
          }}
        >
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Something broke</h1>
          <p style={{ color: '#94a3b8', marginBottom: 12 }}>
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('mlbb-gameplay-state-v1')
                localStorage.removeItem('mlbb-ocr-regions-v3')
              } catch {
                /* ignore */
              }
              window.location.href = '/control/game'
            }}
            style={{
              background: '#f59e0b',
              color: '#0b1220',
              border: 0,
              borderRadius: 8,
              padding: '10px 16px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Clear gameplay cache & reload
          </button>
          <pre
            style={{
              marginTop: 16,
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              color: '#f87171',
            }}
          >
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}
