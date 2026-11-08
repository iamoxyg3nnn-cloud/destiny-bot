import React from 'react';
import { cn } from '../../lib/utils';
import { LucideIcon } from 'lucide-react';

export interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  icon: LucideIcon;
  badge?: {
    text: string;
    variant?: 'emerald' | 'amber' | 'rose' | 'zinc' | 'purple' | 'blue';
  };
  trend?: {
    value: string;
    positive?: boolean;
  };
  className?: string;
}

export function MetricCard({
  title,
  value,
  unit,
  subtext,
  icon: Icon,
  badge,
  trend,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        'group relative p-5 rounded-xl border border-white/[0.08] bg-[#111318] hover:border-white/[0.14] transition-all duration-200 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_8px_24px_-6px_rgba(0,0,0,0.6)]',
        className
      )}
    >
      {/* Subtle background glow effect on hover */}
      <div className="absolute -top-12 -right-12 w-28 h-28 bg-white/[0.02] group-hover:bg-white/[0.04] rounded-full blur-2xl transition-all pointer-events-none" />

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">
          {title}
        </span>
        <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-400 group-hover:text-zinc-200 transition-colors">
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl sm:text-3xl font-mono font-medium tracking-tight text-zinc-100 tabular-nums">
            {value}
          </span>
          {unit && <span className="text-xs font-mono text-zinc-500">{unit}</span>}
        </div>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.04] text-[11px]">
          {subtext && <span className="text-zinc-500 font-sans">{subtext}</span>}
          {trend && (
            <span
              className={cn(
                'font-mono font-medium',
                trend.positive ? 'text-emerald-400' : 'text-rose-400'
              )}
            >
              {trend.positive ? '↑' : '↓'} {trend.value}
            </span>
          )}
          {badge && (
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-mono',
                badge.variant === 'emerald' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                badge.variant === 'amber' && 'bg-amber-500/10 text-amber-300 border border-amber-500/20',
                badge.variant === 'rose' && 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
                (!badge.variant || badge.variant === 'zinc') && 'bg-white/[0.04] text-zinc-400 border border-white/[0.06]'
              )}
            >
              {badge.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
