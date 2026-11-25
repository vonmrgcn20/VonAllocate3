/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class FirebaseErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-rose-500/40 bg-slate-900 p-4 text-xs text-slate-100 shadow-xl">
          <div className="font-bold text-rose-400">Sync / Runtime Notice</div>
          <p className="mt-1 opacity-80">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="mt-2 rounded-lg bg-slate-800 px-3 py-1 font-semibold hover:bg-slate-700"
          >
            Dismiss
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <FirebaseErrorBoundary>
      <div id="firebase-runtime-root" />
    </FirebaseErrorBoundary>
  );
}
