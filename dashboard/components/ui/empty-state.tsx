import React from 'react';
import { cn } from '../../lib/utils';
import { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'relative rounded-xl border border-dashed border-white/[0.1] bg-[#111318]/60 p-12 text-center overflow-hidden',
        className
      )}
    >
      {/* Subtle center glow */}
      <div className="absolute inset-0 bg-radial-gradient from-white/[0.02] to-transparent pointer-events-none" />

      <div className="relative z-10 max-w-sm mx-auto space-y-3">
        <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] flex items-center justify-center mx-auto text-zinc-400">
          <Icon className="w-5 h-5 text-zinc-300" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-zinc-200 tracking-tight">{title}</h3>
          <p className="text-xs text-zinc-500 leading-relaxed font-sans">{description}</p>
        </div>
        {action && (
          <div className="pt-2">
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-medium text-zinc-200 transition-colors"
            >
              {action.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
