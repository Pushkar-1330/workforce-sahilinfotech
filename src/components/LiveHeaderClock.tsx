import React, { useState, useEffect } from 'react';
import { Clock, Timer } from 'lucide-react';

interface LiveHeaderClockProps {
  className?: string;
  showSeconds?: boolean;
  showDate?: boolean;
  variant?: 'compact' | 'badge' | 'prominent';
}

export const LiveHeaderClock: React.FC<LiveHeaderClockProps> = ({
  className = '',
  showSeconds = true,
  showDate = true,
  variant = 'badge'
}) => {
  const [time, setTime] = useState<Date>(new Date());

  useEffect(() => {
    // Initial sync
    setTime(new Date());

    // Precise 1-second interval timer
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Format time components
  const hours = time.getHours();
  const minutes = String(time.getMinutes()).padStart(2, '0');
  const seconds = String(time.getSeconds()).padStart(2, '0');
  const isPM = hours >= 12;
  const hours12 = String(hours % 12 || 12).padStart(2, '0');
  const ampm = isPM ? 'PM' : 'AM';

  // Format date component: e.g. "Wed, 02 Sep 2026"
  const dayName = time.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum = String(time.getDate()).padStart(2, '0');
  const monthName = time.toLocaleDateString('en-US', { month: 'short' });
  const year = time.getFullYear();

  if (variant === 'compact') {
    return (
      <div 
        id="live-header-clock-compact"
        title={`Live System Clock: ${dayName}, ${dayNum} ${monthName} ${year} ${hours12}:${minutes}:${seconds} ${ampm}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-slate-100 font-mono text-xs border border-slate-700 shadow-xs tabular-nums select-none ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <Clock className="w-3.5 h-3.5 text-indigo-400" />
        <span className="font-bold text-white tracking-wider">
          {hours12}:{minutes}
          {showSeconds && <span className="text-emerald-400">:{seconds}</span>}
        </span>
        <span className="text-[10px] text-slate-400 font-semibold">{ampm}</span>
      </div>
    );
  }

  if (variant === 'prominent') {
    return (
      <div 
        id="live-header-clock-prominent"
        className={`flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-md tabular-nums select-none ${className}`}
      >
        <div className="w-9 h-9 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
          <Timer className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg font-bold font-mono tracking-wider text-white">
              {hours12}:{minutes}
              <span className="text-emerald-400">:{seconds}</span>
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold font-mono uppercase">
              {ampm}
            </span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          {showDate && (
            <div className="text-[11px] text-slate-400 font-medium">
              {dayName}, {dayNum} {monthName} {year} • <span className="text-emerald-400">Real-Time</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default Badge Variant (Perfect for Header Navbar)
  return (
    <div
      id="live-header-timer-watch"
      title={`Real-Time System Watch: ${dayName}, ${dayNum} ${monthName} ${year}`}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/95 text-white border border-slate-700/80 shadow-xs tabular-nums select-none ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
      </div>

      <div className="flex items-baseline gap-1">
        <span className="font-mono font-bold text-xs sm:text-sm tracking-wider text-white">
          {hours12}:{minutes}
          {showSeconds && <span className="text-emerald-400">:{seconds}</span>}
        </span>
        <span className="font-mono text-[10px] font-semibold text-slate-400">
          {ampm}
        </span>
      </div>

      {showDate && (
        <>
          <div className="w-px h-3.5 bg-slate-700 mx-0.5 hidden sm:block" />
          <span className="text-[11px] text-slate-300 font-medium hidden sm:inline">
            {dayName}, {dayNum} {monthName}
          </span>
        </>
      )}
    </div>
  );
};
