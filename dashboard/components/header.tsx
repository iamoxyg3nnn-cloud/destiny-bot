'use client';

import React, { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { RefreshCw, LogOut } from 'lucide-react';
import { CommandMenu } from './ui/command-menu';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [pingMs, setPingMs] = useState(18);

  const getBreadcrumbs = () => {
    switch (pathname) {
      case '/':
        return 'System Overview & Telemetry';
      case '/rooms':
        return 'Live Anonymous Rooms';
      case '/users':
        return 'User Accounts & Destiny IDs';
      case '/moderation':
        return 'Moderation & Safety Desk';
      case '/verification':
        return 'Gender Verification Queue';
      case '/settings':
        return 'System Settings & Automation';
      case '/logs':
        return 'Administrative Audit Logs';
      default:
        return 'Administration Console';
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    const start = performance.now();
    try {
      await fetch('/api/overview', { cache: 'no-store' });
      setPingMs(Math.round(performance.now() - start));
    } catch (e) {
      // ignore
    } finally {
      setTimeout(() => setSyncing(false), 500);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <header className="h-14 px-6 border-b border-white/[0.07] bg-[#0c0d10]/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-4">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-zinc-500 font-sans">Destiny Console</span>
        <span className="text-zinc-600">/</span>
        <span className="text-zinc-200 font-medium tracking-tight font-sans">
          {getBreadcrumbs()}
        </span>
      </div>

      {/* Center & Right Controls */}
      <div className="flex items-center gap-3">
        {/* Command Menu */}
        <CommandMenu />

        {/* Live Latency Ping Meter */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-[11px] font-mono text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>{pingMs}ms</span>
          <span className="text-zinc-600">·</span>
          <span className="text-emerald-400">Gateway OK</span>
        </div>

        {/* Sync Button */}
        <Button
          size="sm"
          variant="secondary"
          onClick={handleManualSync}
          disabled={syncing}
        >
          <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${syncing ? 'animate-spin text-zinc-200' : ''}`} />
          <span className="hidden sm:inline">Sync</span>
        </Button>

        {/* End Session */}
        <Button size="sm" variant="secondary" onClick={handleLogout} title="End console session">
          <LogOut className="w-3.5 h-3.5 text-zinc-400" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
