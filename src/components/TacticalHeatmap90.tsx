import React from 'react';
import { DailyLog, Cycle, CycleMetrics } from '../types';
import { addDaysToDate, formatPersianDate, getLogicalTodayDate } from '../utils/dateUtils';
import { computeDailyProperties } from '../engine/bushidoCalculations';
import { toPersianDigits } from '../utils/numberUtils';
import { 
  Calendar, 
  CheckCircle2, 
  Flame, 
  ShieldCheck, 
  AlertOctagon,
  Snowflake,
  RotateCcw
} from 'lucide-react';

interface TacticalHeatmap90Props {
  currentCycle: Cycle;
  metrics: CycleMetrics;
  logs: DailyLog[];
  onSelectDate: (date: string) => void;
}

export const TacticalHeatmap90: React.FC<TacticalHeatmap90Props> = ({
  currentCycle,
  metrics,
  logs,
  onSelectDate
}) => {
  const logicalToday = getLogicalTodayDate();

  // Generate unified 90 days array
  const allDays = Array.from({ length: 90 }, (_, idx) => {
    const dayNumber = idx + 1;
    const dateStr = addDaysToDate(currentCycle.startDate, idx);
    const dayLog = logs.find(l => l.date === dateStr);
    const computed = dayLog ? computeDailyProperties(dayLog, logs, logicalToday) : null;
    const isToday = dateStr === logicalToday;
    const isPast = dateStr < logicalToday;
    const isFuture = dateStr > logicalToday;

    return {
      dayNumber,
      dateStr,
      dayLog,
      computed,
      isToday,
      isPast,
      isFuture
    };
  });

  return (
    <div className="bg-[#121215]/90 border border-zinc-800 rounded-3xl p-5 sm:p-7 shadow-xl space-y-5" dir="rtl">
      {/* Header & Unified Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-zinc-800/90 border border-zinc-700/80 flex items-center justify-center text-zinc-200 shadow-md shrink-0">
            <Calendar className="w-6 h-6 text-zinc-200" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-zinc-100">
                ماتریس جامع ۹۰ روزه (Tactical 90-Day Matrix)
              </h2>
              <span className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] px-2.5 py-0.5 rounded-full font-bold select-none pointer-events-none cursor-default font-mono">
                روز {toPersianDigits(metrics.elapsedDays)} از ۹۰
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              نمای سراسری و تعاملی کل چرخه ۹۰ روزه در یک کادر یکپارچه؛ انتخاب هر خانه برای پرش به میدان نبرد
            </p>
          </div>
        </div>

        {/* Legend Badges */}
        <div className="flex items-center gap-2 text-[11px] text-zinc-400 flex-wrap">
          <div className="inline-flex items-center gap-1.5 bg-[#09090b] px-2.5 py-1 rounded-xl border border-amber-500/30 text-amber-300 select-none pointer-events-none">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-xs"></span>
            <span>کمال ۱۰/۱۰ (با ماموریت ویژه)</span>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-[#09090b] px-2.5 py-1 rounded-xl border border-emerald-500/30 text-emerald-300 select-none pointer-events-none">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs"></span>
            <span>استاندارد ۸/۱۰ (۵ پایه)</span>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-[#09090b] px-2.5 py-1 rounded-xl border border-zinc-700 text-zinc-200 select-none pointer-events-none">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-400 ring-1 ring-amber-400"></span>
            <span>امروز در حال نبرد</span>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-[#09090b] px-2.5 py-1 rounded-xl border border-zinc-800 select-none pointer-events-none">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            <span>فریز اضطراری</span>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-[#09090b] px-2.5 py-1 rounded-xl border border-zinc-800 select-none pointer-events-none">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
            <span>بدهی باز</span>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-[#09090b] px-2.5 py-1 rounded-xl border border-zinc-800 select-none pointer-events-none">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
            <span>کالبدشکافی شده</span>
          </div>
          <div className="inline-flex items-center gap-1.5 bg-[#09090b] px-2.5 py-1 rounded-xl border border-zinc-800 select-none pointer-events-none">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-800 border border-zinc-700"></span>
            <span>آینده</span>
          </div>
        </div>
      </div>

      {/* Unified 90-Cell Tactical Grid */}
      <div className="bg-[#09090b]/80 border border-zinc-800/90 rounded-2xl p-4 sm:p-5">
        <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-15 lg:grid-cols-18 gap-2">
          {allDays.map(cell => {
            let bgClass = 'bg-zinc-900/60 text-zinc-500 border-zinc-800/90 hover:border-zinc-700 hover:text-zinc-300';
            let title = `روز ${toPersianDigits(cell.dayNumber)} (${formatPersianDate(cell.dateStr, { short: true })}): بدون داده`;

            if (cell.isToday) {
              if (cell.computed && cell.computed.statusType === 'standard') {
                if (cell.computed.score === 10) {
                  bgClass = 'bg-gradient-to-br from-amber-400 to-amber-500 text-zinc-950 border-amber-300 font-black shadow-md ring-2 ring-amber-400 ring-offset-2 ring-offset-zinc-950 scale-105 z-10';
                  title = `روز ${toPersianDigits(cell.dayNumber)} (امروز): کمال تعهد ۱۰ از ۱۰ (۵ پایه + ماموریت ویژه)`;
                } else {
                  bgClass = 'bg-emerald-500 text-black border-emerald-400 font-bold shadow-md ring-2 ring-emerald-400 ring-offset-2 ring-offset-zinc-950 scale-105 z-10';
                  title = `روز ${toPersianDigits(cell.dayNumber)} (امروز): روز استاندارد ۸ از ۱۰ (۵ پایه کامل)`;
                }
              } else if (cell.computed && cell.computed.statusType === 'personal_frozen') {
                bgClass = 'bg-blue-600 text-white border-blue-400 ring-2 ring-blue-400 ring-offset-2 ring-offset-zinc-950 scale-105 z-10';
                title = `روز ${toPersianDigits(cell.dayNumber)} (امروز): توقف اضطراری (فریز)`;
              } else {
                // Today in progress (neutral zinc token with amber active battle ring)
                const habitsDone = cell.computed ? cell.computed.habitsCount : 0;
                bgClass = 'bg-zinc-800 text-zinc-100 border-zinc-600 ring-2 ring-amber-400 ring-offset-2 ring-offset-zinc-950 font-black scale-105 z-10 shadow-lg';
                title = `روز ${toPersianDigits(cell.dayNumber)} (امروز نبرد جاری): در حال اجرا (${toPersianDigits(habitsDone)} از ۵ پایه)`;
              }
            } else if (cell.computed) {
              if (cell.computed.statusType === 'standard') {
                if (cell.computed.score === 10) {
                  // 10/10 Gold / Amber Mastery Day
                  bgClass = 'bg-gradient-to-br from-amber-400 to-amber-500 text-zinc-950 border-amber-300 font-black shadow-md ring-1 ring-amber-400/40';
                  title = `روز ${toPersianDigits(cell.dayNumber)} (${formatPersianDate(cell.dateStr, { short: true })}): کمال تعهد ۱۰ از ۱۰ (۵ پایه + ماموریت ویژه)`;
                } else {
                  // 8/10 Emerald Standard Day
                  bgClass = 'bg-emerald-500 text-black border-emerald-400 font-bold shadow-xs';
                  title = `روز ${toPersianDigits(cell.dayNumber)} (${formatPersianDate(cell.dateStr, { short: true })}): روز استاندارد ۸ از ۱۰ (۵ پایه کامل)`;
                }
              } else if (cell.computed.statusType === 'personal_frozen') {
                bgClass = 'bg-blue-600 text-white border-blue-400';
                title = `روز ${toPersianDigits(cell.dayNumber)} (${formatPersianDate(cell.dateStr, { short: true })}): توقف اضطراری (فریز)`;
              } else if (cell.computed.statusType === 'burned_unresolved') {
                bgClass = 'bg-red-600 text-white border-red-400 animate-pulse';
                title = `روز ${toPersianDigits(cell.dayNumber)} (${formatPersianDate(cell.dateStr, { short: true })}): نیازمند کالبدشکافی (بدهی باز)`;
              } else {
                bgClass = 'bg-purple-600 text-white border-purple-400';
                title = `روز ${toPersianDigits(cell.dayNumber)} (${formatPersianDate(cell.dateStr, { short: true })}): پرونده کالبدشکافی بسته شد`;
              }
            } else if (cell.isPast) {
              bgClass = 'bg-red-950/40 text-red-400 border-red-900/60';
              title = `روز ${toPersianDigits(cell.dayNumber)} (${formatPersianDate(cell.dateStr, { short: true })}): ثبت نشده (غیبت تقویمی)`;
            }

            return (
              <button
                key={cell.dayNumber}
                type="button"
                onClick={() => onSelectDate(cell.dateStr)}
                title={title}
                className={`h-10 rounded-xl border text-xs font-mono flex flex-col items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer ${bgClass}`}
              >
                <span>{toPersianDigits(cell.dayNumber)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
