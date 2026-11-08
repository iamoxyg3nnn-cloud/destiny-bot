import React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'amber';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'secondary', size = 'md', children, disabled, ...props }, ref) => {
    const variantStyles = {
      primary:
        'bg-zinc-100 hover:bg-white text-zinc-950 font-medium shadow-[0_1px_2px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.8)] border border-transparent',
      secondary:
        'bg-white/[0.05] hover:bg-white/[0.09] text-zinc-200 border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]',
      outline:
        'bg-transparent hover:bg-white/[0.05] text-zinc-300 border border-white/[0.12]',
      ghost:
        'bg-transparent hover:bg-white/[0.06] text-zinc-400 hover:text-zinc-100 border border-transparent',
      danger:
        'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20',
      amber:
        'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20',
    };

    const sizeStyles = {
      sm: 'h-7 px-2.5 text-[11px] gap-1.5 rounded-md',
      md: 'h-8 px-3.5 text-xs gap-2 rounded-md',
      lg: 'h-9 px-4 text-xs gap-2 rounded-lg font-medium',
      icon: 'h-8 w-8 p-0 rounded-md justify-center',
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center font-sans tracking-tight select-none transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
