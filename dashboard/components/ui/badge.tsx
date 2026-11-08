import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'emerald' | 'amber' | 'rose' | 'zinc' | 'purple' | 'blue';
  dot?: boolean;
}

export function Badge({
  className,
  variant = 'zinc',
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    zinc: 'bg-zinc-800/50 text-zinc-300 border-white/[0.08]',
    purple: 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };

  const dotStyles = {
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    zinc: 'bg-zinc-400',
    purple: 'bg-purple-400',
    blue: 'bg-blue-400',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium border select-none transition-colors',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', dotStyles[variant])} />
          <span className={cn('relative inline-flex rounded-full h-1.5 w-1.5', dotStyles[variant])} />
        </span>
      )}
      {children}
    </div>
  );
}
