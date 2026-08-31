import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw, Trash2, ShieldAlert } from 'lucide-react';

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
    console.error('Uncaught error in Bushido OS:', error, errorInfo);
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
      console.warn('Could not clear storage:', e);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-4 dir-rtl" dir="rtl">
          <div className="max-w-md w-full bg-[#121215] border border-rose-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold">مهار خطای غیرمنتظره سامانه</h2>
                <p className="text-xs text-zinc-400">سیستم محافظت بوشیدو خطای رندرینگ را کنترل کرده است.</p>
              </div>
            </div>

            <div className="bg-[#09090b] border border-zinc-800 rounded-2xl p-4 text-xs font-mono text-zinc-300 break-all space-y-2">
              <div className="text-rose-400 font-bold">پیام خطا:</div>
              <div>{this.state.error?.message || 'خطای ناشناخته در فرانت‌اند.'}</div>
            </div>

            <div className="space-y-3 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full h-12 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                تلاش مجدد و بارگذاری
              </button>

              <button
                onClick={this.handleResetLocal}
                className="w-full h-11 bg-zinc-900 hover:bg-zinc-800 active:scale-[0.98] text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-xl flex items-center justify-center gap-2 text-xs transition-all cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5 text-zinc-500" />
                بازنشانی کش اضطراری
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-zinc-500 justify-center pt-2">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>داده‌های ذخیره‌شده شما در دیتابیس ابری محفوظ هستند.</span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
