import React from "react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || "The app failed to render.",
    };
  }

  componentDidCatch(error, info) {
    console.error("App render failed:", error, info);
  }

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white/5 backdrop-blur-xl p-6">
          <p className="text-[12px] uppercase tracking-[0.2em] text-foreground/45">Speak Now</p>
          <h1 className="text-2xl font-bold mt-3">Page failed to load</h1>
          <p className="text-sm text-muted-foreground mt-3">
            A render error was caught, so the app stopped this page instead of showing a blank screen.
          </p>
          <p className="text-xs text-muted-foreground mt-3 break-words">{this.state.message}</p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 h-11 w-full rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-600 text-sm font-medium"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
