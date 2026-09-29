import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Renderer crashed:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: '1.5rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <h2>Something went wrong</h2>
          <p>{this.state.error.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}
