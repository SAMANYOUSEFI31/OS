import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DailyLog, FailureReason, FailureTime } from '../types';
import { formatPersianDate } from '../utils/dateUtils';
import { FOUNDATION_HABITS } from '../engine/bushidoCalculations';
import { getDeterministicAutopsy } from '../engine/deterministicSensei';
import { toPersianDigits } from '../utils/numberUtils';
import { soundFX } from '../utils/audioEffects';
import { 
  X, 
  Sparkles, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  Brain, 
  ShieldAlert, 
  Target, 
  Flame, 
  Snowflake,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ListOrdered
} from 'lucide-react';

interface AutopsyModalProps {
  log: DailyLog;
  cycleTheme?: string;
  allUnresolvedLogs?: DailyLog[];
  onSelectLog?: (log: DailyLog) => void;
  onSave: (updatedLog: DailyLog) => void;
  onClose: () => void;
}

const FAILURE_REASONS: FailureReason[] = [
  'وقتم رو به خوبی مدیریت نکردم',
  'نیمه‌کاره رها کردم',
  'بی‌برنامه بودم',
  'دلایل شخصی'
];

const FAILURE_TIMES: FailureTime[] = [
  'اول روز',
  'وسط روز',
  'آخر روز'
];

export const AutopsyModal: React.FC<AutopsyModalProps> = ({
  log,
  cycleTheme,
  allUnresolvedLogs = [],
  onSelectLog,
  onSave,
  onClose
}) => {
  const [reason, setReason] = useState<FailureReason>(log.failureReason || '');
  const [time, setTime] = useState<FailureTime>(log.failureTime || '');
  const [notes, setNotes] = useState(log.autopsyNotes || '');
  const [countermeasure, setCountermeasure] = useState(log.countermeasure || '');
  const [aiFeedback, setAiFeedback] = useState(log.aiFeedback || '');
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  // Sync state when log changes (e.g. when user clicks next/prev debt day)
  useEffect(() => {
    setReason(log.failureReason || '');
    setTime(log.failureTime || '');
    setNotes(log.autopsyNotes || '');
    setCountermeasure(log.countermeasure || '');
    setAiFeedback(log.aiFeedback || '');
  }, [log.id, log.date]);

  const missedHabits = FOUNDATION_HABITS
    .filter(h => !log[h.key])
    .map(h => h.titleFa);

  // Calculate current index among unresolved debt days
  const currentIndex = allUnresolvedLogs.findIndex(l => l.date === log.date);
  const totalDebts = allUnresolvedLogs.length;
  const hasMultipleDebts = totalDebts > 1 && onSelectLog;

  const handleAiAutopsy = async () => {
    setIsLoadingAi(true);
    try {
      // Direct local deterministic engine call with backend sync
      const localResult = getDeterministicAutopsy({
        date: log.date,
        missedHabits,
        failureReason: reason || 'بی‌برنامه بودم',
        failureTime: time || 'وسط روز',
        userNotes: notes,
        cycleTheme
      });

      if (localResult.analysis) {
        setAiFeedback(localResult.analysis);
      }
      if (localResult.countermeasure && !countermeasure) {
        setCountermeasure(localResult.countermeasure);
      }
      if (localResult.psychologicalTrap) {
        setNotes(prev => prev ? `${prev}\n\n[تله شناختی]: ${localResult.psychologicalTrap}` : `[تله شناختی]: ${localResult.psychologicalTrap}`);
      }

      // Sync with server if online
      fetch('/api/ai/autopsy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: log.date,
          missedHabits,
          failureReason: reason || 'بی‌برنامه بودم',
          failureTime: time || 'وسط روز',
          userNotes: notes,
          cycleTheme
        })
      }).catch(() => {});

      soundFX.playCheck();
    } catch (err) {
      console.error('Autopsy error:', err);
    } finally {
      setIsLoadingAi(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: DailyLog = {
      ...log,
      failureReason: reason,
      failureTime: time,
      autopsyNotes: notes,
      countermeasure,
      aiFeedback
    };
    soundFX.playCheck();
    onSave(updated);

    // If there are other unresolved debts, smoothly transition to next
    if (hasMultipleDebts && currentIndex >= 0) {
      const remainingDebts = allUnresolvedLogs.filter(l => l.date !== log.date);
      if (remainingDebts.length > 0) {
        onSelectLog(remainingDebts[0]);
        return;
      }
    }

    onClose();
  };

  const isPersonalFrozen = reason === 'دلایل شخصی';

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col items-center justify-start sm:justify-center p-2 sm:p-4 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.3 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 400) {
            onClose();
          }
        }}
        className="my-auto sm:my-6 max-h-[94dvh] w-full max-w-2xl bg-zinc-900 border border-zinc-700/80 rounded-2xl sm:rounded-3xl text-zinc-100 shadow-2xl flex flex-col overflow-hidden touch-pan-y"
        dir="rtl"
      >
        {/* Mobile Drag Pill Indicator */}
        <div className="w-12 h-1.5 bg-zinc-700/80 rounded-full mx-auto my-2 sm:hidden cursor-grab active:cursor-grabbing shrink-0" />

        {/* Sticky Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#09090b]/95 border-b border-zinc-800 flex items-center justify-between shrink-0 sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${isPersonalFrozen ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
              {isPersonalFrozen ? <Snowflake className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm sm:text-base md:text-lg text-zinc-100 flex items-center gap-1.5 truncate">
                کالبدشکافی {formatPersianDate(log.date, { withWeekday: true })}
              </h2>
              <p className="text-[11px] sm:text-xs text-zinc-400 truncate">
                ثبت علت و پادزهر رفتاری جهت تسویه بدهی و باز شدن قفل اجرا
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 sm:p-2 rounded-xl hover:bg-zinc-800 transition cursor-pointer shrink-0"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Debt Day Switcher Carousel (If user has multiple unresolved debts) */}
        {hasMultipleDebts && (
          <div className="bg-red-950/40 border-b border-red-900/40 px-4 py-2 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-red-300 font-bold">
              <ListOrdered className="w-4 h-4 text-red-400" />
              <span>بدهی {toPersianDigits(currentIndex + 1)} از {toPersianDigits(totalDebts)}:</span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-[60%]">
              {allUnresolvedLogs.map((item, idx) => {
                const isSelected = item.date === log.date;
                return (
                  <button
                    key={item.id || item.date}
                    type="button"
                    onClick={() => onSelectLog(item)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-red-600 text-white shadow-sm'
                        : 'bg-[#09090b]/80 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                    }`}
                  >
                    {formatPersianDate(item.date, { short: true })}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-hidden min-h-0">
          <div className="overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 flex-1 overscroll-contain">
            {/* Missed Habits Summary */}
            {missedHabits.length > 0 && (
              <div className="bg-[#09090b]/60 border border-red-500/20 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs text-zinc-400 font-medium shrink-0">پایه‌های اجرا نشده در این روز:</span>
                <div className="flex flex-wrap gap-1.5">
                  {missedHabits.map(h => (
                    <span key={h} className="text-xs bg-red-950/60 text-red-300 border border-red-800/40 px-2.5 py-0.5 rounded-md font-medium">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 1. Failure Reason Selection */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-zinc-200 mb-2">
                ۱. دلیل اصلی عدم اجرای فونداسیون (دلیل شکست):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FAILURE_REASONS.map(r => {
                  const selected = reason === r;
                  const isFrozenOpt = r === 'دلایل شخصی';
                  return (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setReason(r)}
                      className={`p-3 rounded-xl text-right text-xs sm:text-sm font-medium border transition flex items-center justify-between cursor-pointer ${
                        selected
                          ? (isFrozenOpt 
                              ? 'bg-blue-950/60 border-blue-500 text-blue-200 ring-1 ring-blue-500 shadow-sm' 
                              : 'bg-amber-950/50 border-amber-500 text-amber-200 ring-1 ring-amber-500 shadow-sm')
                          : 'bg-[#09090b]/60 border-zinc-800 hover:bg-zinc-800/80 text-zinc-300'
                      }`}
                    >
                      <span>{r}</span>
                      {selected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {isPersonalFrozen && (
                <p className="mt-2 text-xs text-blue-300/90 bg-blue-950/40 p-2.5 rounded-lg border border-blue-800/40 flex items-center gap-2">
                  <Snowflake className="w-4 h-4 shrink-0 text-blue-400" />
                  با انتخاب «دلایل شخصی»، روز به عنوان توقف اضطراری (فریز) ثبت شده و زنجیره بدون جریمه حفظ می‌شود.
                </p>
              )}
            </div>

            {/* 2. Failure Time Selection */}
            {!isPersonalFrozen && (
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-zinc-200 mb-2">
                  ۲. زمان شروع اصطکاک و شکستن دیسیپلین:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {FAILURE_TIMES.map(t => {
                    const selected = time === t;
                    return (
                      <button
                        type="button"
                        key={t}
                        onClick={() => setTime(t)}
                        className={`p-2.5 rounded-xl text-center text-xs sm:text-sm font-medium border transition cursor-pointer ${
                          selected
                            ? 'bg-red-950/50 border-red-500 text-red-200 ring-1 ring-red-500'
                            : 'bg-[#09090b]/60 border-zinc-800 hover:bg-zinc-800/80 text-zinc-300'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5 mx-auto mb-1 opacity-70" />
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* AI Autopsy Trigger */}
            <div className="bg-gradient-to-r from-amber-950/30 to-indigo-950/30 border border-amber-500/20 rounded-2xl p-3.5 sm:p-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-amber-400 shrink-0" />
                  <span className="font-semibold text-xs sm:text-sm text-zinc-200">تحلیل هوشمند سنسی بوشیدو</span>
                </div>
                <button
                  type="button"
                  onClick={handleAiAutopsy}
                  disabled={isLoadingAi || !reason}
                  className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs px-3.5 py-2 rounded-xl flex items-center justify-center gap-1.5 transition shadow-lg shadow-amber-500/10 cursor-pointer"
                >
                  {isLoadingAi ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      در حال کالبدشکافی...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      کالبدشکافی هوشمند سنسی (آنی و آفلاین)
                    </>
                  )}
                </button>
              </div>
              {aiFeedback ? (
                <div className="mt-2 text-xs text-zinc-300 leading-relaxed bg-[#09090b]/80 p-3 rounded-xl border border-zinc-800">
                  <p className="font-semibold text-amber-400 mb-1">تشخیص روانی سنسی:</p>
                  {aiFeedback}
                </div>
              ) : (
                <p className="text-[11px] sm:text-xs text-zinc-400">
                  برای کشف تله‌های رفتاری پنهان و تدوین خودکار قانون مقابله، دکمه بالا را بزنید.
                </p>
              )}
            </div>

            {/* 3. Notes / Psychological Root Cause */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-zinc-200 mb-1">
                ۳. یادداشت ریشه‌یابی و اتفاقات روز:
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="چه محرک‌ها یا توجیه‌های ذهنی باعث رها شدن کار شد؟"
                rows={2}
                className="w-full bg-[#09090b]/80 border border-zinc-800 rounded-xl p-3 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* 4. Countermeasure / Rule for Tomorrow */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-zinc-200 mb-1 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-emerald-400" />
                ۴. قانون مقابله و استراتژی ضدضربه (Countermeasure):
              </label>
              <input
                type="text"
                value={countermeasure}
                onChange={e => setCountermeasure(e.target.value)}
                placeholder="مثلا: بستن کامل نوتیفیکیشن‌ها تا ساعت ۱۲ ظهر"
                className="w-full bg-[#09090b]/80 border border-zinc-800 rounded-xl p-3 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Sticky Modal Footer Actions */}
          <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#09090b]/95 border-t border-zinc-800 flex items-center justify-end gap-2 sm:gap-3 shrink-0 sticky bottom-0 z-20 backdrop-blur-md">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs sm:text-sm font-medium transition cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={!reason || (!isPersonalFrozen && !time)}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm px-5 sm:px-6 py-2.5 rounded-xl flex items-center gap-2 transition shadow-lg shadow-emerald-600/20 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>ثبت کالبدشکافی و تسویه بدهی</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
