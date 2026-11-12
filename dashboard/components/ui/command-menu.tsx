'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  Compass, 
  Users, 
  MessagesSquare, 
  ShieldAlert, 
  BadgeCheck, 
  Settings, 
  FileText, 
  ExternalLink,
  RefreshCw,
  X
} from 'lucide-react';
import { cn } from '../../lib/utils';

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const commands = [
    { title: 'Overview & Telemetry', href: '/', icon: Compass, category: 'Navigation' },
    { title: 'Live Match Rooms', href: '/rooms', icon: MessagesSquare, category: 'Navigation' },
    { title: 'User Directory & Destiny IDs', href: '/users', icon: Users, category: 'Navigation' },
    { title: 'Moderation & Safety Desk', href: '/moderation', icon: ShieldAlert, category: 'Navigation' },
    { title: 'Gender Verification Queue', href: '/verification', icon: BadgeCheck, category: 'Navigation' },
    { title: 'System Settings', href: '/settings', icon: Settings, category: 'Navigation' },
    { title: 'Administrative Audit Logs', href: '/logs', icon: FileText, category: 'Navigation' },
  ];

  const filtered = commands.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (href: string) => {
    router.push(href);
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      {/* Search Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-between w-48 sm:w-64 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-xs text-zinc-400 transition-colors shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
      >
        <span className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-zinc-500" />
          <span className="truncate">Search commands...</span>
        </span>
        <kbd className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium text-zinc-500 bg-white/[0.06] border border-white/[0.08]">
          ⌘K
        </kbd>
      </button>

      {/* Palette Overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-start justify-center pt-20 p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border border-white/[0.12] bg-[#111318] shadow-2xl overflow-hidden flex flex-col">
            {/* Search Input Box */}
            <div className="p-3 border-b border-white/[0.08] flex items-center gap-2.5">
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Type a command or jump to page..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
              />
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                Navigation & Views
              </div>
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">
                  No commands matching "{query}"
                </div>
              ) : (
                filtered.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.href}
                      onClick={() => handleSelect(item.href)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors text-left group"
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 text-zinc-500 group-hover:text-zinc-200 transition-colors" />
                        <span>{item.title}</span>
                      </span>
                      <span className="text-[10px] font-mono text-zinc-600 group-hover:text-zinc-400">
                        {item.category}
                      </span>
                    </button>
                  );
                })
              )}

              <div className="px-2 pt-3 pb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500 border-t border-white/[0.06] mt-2">
                External Actions
              </div>
              <a
                href="https://discord.com/oauth2/authorize?client_id=1568212916304617557&scope=bot%20applications.commands&permissions=277025508352"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors text-left group"
              >
                <span className="flex items-center gap-2.5">
                  <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-zinc-200 transition-colors" />
                  <span>Invite Destiny Bot to Discord Server</span>
                </span>
                <span className="text-[10px] font-mono text-zinc-500">OAuth2</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
