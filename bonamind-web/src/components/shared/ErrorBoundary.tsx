import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangleIcon as AlertTriangle, RefreshCwIcon as RefreshCw, HomeIcon as Home, BugIcon as Bug } from '../icons/CustomIcons';
import { GenericErrorArt } from '../graphics';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showReset?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 * instead of crashing the entire app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    
    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Caught error:', error);
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }

    // Report to error tracking service (PostHog, Sentry, etc.)
    this.reportError(error, errorInfo);

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  private async reportError(error: Error, errorInfo: ErrorInfo): Promise<void> {
    const posthog = await import('../../services/analytics/analyticsService').then(m => m.getPostHog());
    if (posthog) {
      posthog.capture('app_error', {
        error: error.message,
        stack: error.stack,
        component: errorInfo.componentStack,
        url: window.location.href,
        timestamp: Date.now(),
      });
    }
    const { captureError } = await import('../../services/monitoring/sentryService');
    captureError(error, { componentStack: errorInfo.componentStack });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  handleCopyError = (): void => {
    const errorText = `
Error: ${this.state.error?.message}
Stack: ${this.state.error?.stack}
Component: ${this.state.errorInfo?.componentStack}
URL: ${window.location.href}
Time: ${new Date().toISOString()}
    `.trim();

    navigator.clipboard.writeText(errorText).catch(() => {
      // Clipboard not available
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
            <GenericErrorArt size={148} className="mx-auto mb-3 text-zinc-500" />
            <div className="text-center mb-4">
              <h2 className="text-lg font-semibold text-white">This view didn’t finish loading</h2>
              <p className="text-sm text-zinc-400">
                Your decks and progress are safe — nothing was lost.
              </p>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <div className="mb-4 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                <p className="text-xs font-mono text-red-300 break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {this.props.showReset !== false && (
                <button
                  onClick={this.handleReset}
                  className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors text-sm"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try Again
                </button>
              )}
              <button
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm"
              >
                <Home className="h-4 w-4" />
                Go Home
              </button>
              {import.meta.env.DEV && (
                <button
                  onClick={this.handleCopyError}
className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm"
                >
                  <Bug className="h-4 w-4" />
                  Copy Error
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Async Error Boundary for use with React.lazy and Suspense
 */
export function AsyncErrorFallback({ error }: { error?: Error }): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-400 mb-3" />
      <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-1">Failed to load</h3>
      <p className="text-sm text-zinc-400 mb-4">
        {error?.message || 'This section could not be loaded'}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors text-sm"
      >
        <RefreshCw className="h-4 w-4" />
        Reload Page
      </button>
    </div>
  );
}

/**
 * Global error handler for uncaught errors and unhandled promise rejections
 */
export function setupGlobalErrorHandler(): void {
  // Uncaught errors
  window.addEventListener('error', (event: ErrorEvent) => {
    // ResizeObserver loop errors fire with event.error = null in Chromium —
    // these are benign layout cascades, not real bugs. Suppress them.
    if (
      event.error === null &&
      event.message?.includes('ResizeObserver')
    ) return;

    console.error('[GlobalErrorHandler] Uncaught error:', event.error);
    
    import('../../services/analytics/analyticsService').then(m => m.getPostHog()).then(posthog => {
      if (posthog) {
        posthog.capture('uncaught_error', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          url: window.location.href,
        });
      }
    });
    import('../../services/monitoring/sentryService').then(({ captureError }) => {
      if (event.error) captureError(event.error, { type: 'uncaught' });
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    console.error('[GlobalErrorHandler] Unhandled promise rejection:', event.reason);
    
    import('../../services/analytics/analyticsService').then(m => m.getPostHog()).then(posthog => {
      if (posthog) {
        posthog.capture('unhandled_rejection', {
          reason: String(event.reason),
          url: window.location.href,
        });
      }
    });
    import('../../services/monitoring/sentryService').then(({ captureError }) => {
      const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      captureError(err, { type: 'unhandled_rejection' });
    });
  });
}



