import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RotateCcw, RefreshCw, AlertTriangle, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught runtime error caught by Bushido ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetLocal = () => {
    try {
      localStorage.removeItem('bushido_discipline_os_v1');
      localStorage.removeItem('bushido_system_state_v1');
      sessionStorage.clear();
    } catch (e) {
      console.warn('Failed to clear storage:', e);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div 
          className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-4 font-sans selection:bg-rose-500/30"
          dir="rtl"
        >
          <div className="w-full max-w-lg bg-[#121215] border border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl shadow-black/80">
            
            {/* Header Icon & Title */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 shadow-lg">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h1 className="text-lg sm:text-xl font-black text-zinc-100 tracking-tight">
                  مهار خطای غیرمنتظره سامانه
                </h1>
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                  سیستم محافظت بوشیدو خطای رندرینگ را کنترل کرده تا یکپارچگی داده‌های شما حفظ شود.
                </p>
              </div>
            </div>

            {/* Error detail banner */}
            <div className="bg-[#09090b] border border-red-500/30 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-red-300">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>پیام خطا:</span>
              </div>
              <p className="text-xs font-mono text-zinc-300 break-words leading-relaxed">
                {this.state.error?.message || 'یک خطای نامشخص در رابط کاربری رخ داده است.'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer active:scale-[0.98]"
              >
                <RefreshCw className="w-4 h-4" />
                <span>تلاش مجدد و بارگذاری</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetLocal}
                className="w-full sm:w-auto py-3 px-4 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>بازنشانی کش اضطراری</span>
              </button>
            </div>

            {/* Footer notice */}
            <p className="text-[11px] text-zinc-400 text-center leading-relaxed border-t border-zinc-800/80 pt-4">
              داده‌های ذخیره‌شده شما در سیستم امن هستند و می‌توانید با بارگذاری مجدد به میدان نبرد بازگردید.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
