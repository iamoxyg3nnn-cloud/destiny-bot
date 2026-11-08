import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export function Card({ className, hoverEffect = true, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'relative rounded-xl border border-white/[0.08] bg-[#111318] text-zinc-100 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] overflow-hidden transition-all duration-200',
        hoverEffect && 'hover:border-white/[0.14] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_4px_20px_-4px_rgba(0,0,0,0.5)]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5 pb-3 border-b border-white/[0.06] flex items-center justify-between', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-sm font-medium tracking-tight text-zinc-100', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-xs text-zinc-400 mt-0.5', className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-4 pt-3 border-t border-white/[0.06] bg-white/[0.01]', className)} {...props}>
      {children}
    </div>
  );
}
