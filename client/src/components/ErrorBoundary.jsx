import { Component } from "react";

// Catches render-time errors anywhere below it so the app shows a friendly
// recovery screen instead of a blank white page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("App error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="text-lg font-bold text-slate-900">Something went wrong</div>
          <p className="mt-2 text-sm text-slate-500">
            The page hit an unexpected error. Reloading usually fixes it. If it keeps happening, let the admin know.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-slate-100 p-2 text-left text-[11px] text-slate-500">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
