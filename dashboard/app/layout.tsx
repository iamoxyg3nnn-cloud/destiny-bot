'use client';

import './globals.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Compass, 
  Users, 
  MessagesSquare, 
  ShieldAlert, 
  BadgeCheck, 
  Coins, 
  Settings, 
  FileText,
  Activity,
  Radio,
  ExternalLink
} from 'lucide-react';

import { Header } from '../components/header';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navGroups = [
    {
      label: 'Telemetry & Pairs',
      items: [
        { name: 'Overview', href: '/', icon: Compass },
        { name: 'Live Rooms', href: '/rooms', icon: MessagesSquare },
        { name: 'User Directory', href: '/users', icon: Users },
      ],
    },
    {
      label: 'Safety & Trust',
      items: [
        { name: 'Moderation Desk', href: '/moderation', icon: ShieldAlert },
        { name: 'Gender Verification', href: '/verification', icon: BadgeCheck },
      ],
    },
    {
      label: 'Economy',
      items: [
        { name: 'Destiny Coins', href: '/economy', icon: Coins },
      ],
    },
    {
      label: 'Configuration',
      items: [
        { name: 'System Settings', href: '/settings', icon: Settings },
        { name: 'Audit Logs', href: '/logs', icon: FileText },
      ],
    },
  ];

  return (
    <html lang="en" className="dark">
      <head>
        <title>Destiny — Administration Console</title>
        <meta name="description" content="Mission control and real-time operations console for Destiny Discord Bot" />
      </head>
      <body className="flex h-screen overflow-hidden bg-[#09090b] text-zinc-100 antialiased selection:bg-zinc-800 selection:text-zinc-100">
        {/* Main Sidebar */}
        <aside className="w-64 flex-shrink-0 border-r border-white/[0.07] bg-[#0c0d10] flex flex-col justify-between select-none">
          <div>
            {/* Console Brand Header */}
            <div className="h-14 px-4 border-b border-white/[0.07] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-white/[0.06] border border-white/[0.09] flex items-center justify-center text-zinc-200">
                  <Radio className="w-3.5 h-3.5 text-zinc-300" />
                </div>
                <div>
                  <div className="text-sm font-medium tracking-tight text-zinc-100 flex items-center gap-1.5">
                    Destiny
                    <span className="text-[10px] font-mono text-zinc-500 font-normal">v1.0</span>
                  </div>
                  <div className="text-[11px] text-zinc-500">Admin Console</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Live
              </div>
            </div>

            {/* Structured Navigation Groups */}
            <div className="p-3 space-y-5 overflow-y-auto max-h-[calc(100vh-140px)]">
              {navGroups.map((group) => (
                <div key={group.label} className="space-y-1">
                  <div className="px-2.5 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                    {group.label}
                  </div>
                  <div className="space-y-0.5 pt-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs transition-colors group ${
                            isActive
                              ? 'bg-white/[0.08] text-white font-medium shadow-sm border border-white/[0.06]'
                              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                          }`}
                        >
                          <Icon className={`w-4 h-4 transition-colors ${
                            isActive ? 'text-zinc-200' : 'text-zinc-500 group-hover:text-zinc-300'
                          }`} />
                          <span>{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Infrastructure Health Status Footer */}
          <div className="p-3 border-t border-white/[0.07] bg-[#090a0d] space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <Activity className="w-3.5 h-3.5 text-zinc-500" />
                <span>Cluster Status</span>
              </span>
              <span className="font-mono text-emerald-400">Healthy</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
              <div className="px-2 py-1.5 rounded bg-white/[0.03] border border-white/[0.05] flex items-center justify-between">
                <span className="text-zinc-400">Supabase</span>
                <span className="text-emerald-400 font-medium">OK</span>
              </div>
              <div className="px-2 py-1.5 rounded bg-white/[0.03] border border-white/[0.05] flex items-center justify-between">
                <span className="text-zinc-400">Engine</span>
                <span className="text-emerald-400 font-medium">OK</span>
              </div>
            </div>

            <a
              href="https://discord.com/oauth2/authorize?client_id=1568212916304617557&scope=bot%20applications.commands&permissions=277025508352"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 w-full py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-white/[0.06] rounded transition-colors"
            >
              <span>Invite Bot to Guild</span>
              <ExternalLink className="w-3 h-3 text-zinc-500" />
            </a>
          </div>
        </aside>

        {/* Content Shell */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#09090b]">
          <Header />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
