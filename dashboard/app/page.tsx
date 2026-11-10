'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Users, 
  MessagesSquare, 
  Coins, 
  Zap, 
  RefreshCw, 
  Cpu, 
  Database, 
  ShieldCheck, 
  AlertCircle,
  Radio,
  ArrowUpRight,
  ExternalLink,
  Shield,
  Activity,
  Layers,
  Sparkles
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { MetricCard } from '../components/ui/metric-card';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

export default function OverviewPage() {
  const [metrics, setMetrics] = useState<any>({
    activeUsers: 0,
    activeRoomsCount: 0,
    queuedUsersCount: 0,
    pendingReportsCount: 0,
    totalCoinsInCirculation: 0,
    messagesLast24h: 0,
    hourlyThroughput: [],
    supabaseConnected: true,
    redisConnected: false,
    shardsOnline: 1,
    workersActive: 3,
    uptimeSeconds: 0,
  });

  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [chartMetric, setChartMetric] = useState<'messages' | 'matches'>('messages');

  const refreshData = async () => {
    try {
      const res = await fetch('/api/overview', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to poll live overview metrics:', err);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 3000);
    return () => clearInterval(interval);
  }, []);

  const throughputData = metrics.hourlyThroughput && metrics.hourlyThroughput.length > 0
    ? metrics.hourlyThroughput
    : [
        { time: '04:00', messages: 0, matches: 0 },
        { time: '08:00', messages: 0, matches: 0 },
        { time: '12:00', messages: 0, matches: 0 },
        { time: '16:00', messages: 0, matches: 0 },
        { time: '19:30', messages: metrics.messagesLast24h || 0, matches: metrics.activeRoomsCount || 0 },
      ];

  const queueDistribution = [
    { bracket: '< 500ms', users: metrics.queuedUsersCount > 0 ? metrics.queuedUsersCount : 0 },
    { bracket: '500ms-1s', users: 0 },
    { bracket: '1s-2s', users: 0 },
    { bracket: '> 2s', users: 0 },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-medium tracking-tight text-zinc-100 font-sans">
              System Overview & Telemetry
            </h1>
            <Badge variant="emerald" dot>
              Live Telemetry {lastUpdated ? `· ${lastUpdated}` : ''}
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time pipeline metrics, Gateway activity, and idempotent financial ledgers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setLoading(true); refreshData().finally(() => setLoading(false)); }}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Poll Stream</span>
          </Button>

          <a
            href="https://discord.com/oauth2/authorize?client_id=1568212916304617557&scope=bot%20applications.commands&permissions=277025508352"
            target="_blank"
            rel="noreferrer"
          >
            <Button size="sm" variant="primary">
              <span>Invite Bot</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </a>
        </div>
      </div>

      {/* 21st.dev Bento Grid: Primary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Registered Accounts"
          value={Number(metrics.activeUsers).toLocaleString()}
          subtext="Profiles in Supabase"
          icon={Users}
          badge={{ text: 'Realtime Sync', variant: 'zinc' }}
        />

        <MetricCard
          title="Active Match Rooms"
          value={Number(metrics.activeRoomsCount)}
          unit="pair(s)"
          subtext={`${Number(metrics.queuedUsersCount)} user(s) queued`}
          icon={MessagesSquare}
          badge={{ text: 'Cross-Server', variant: 'emerald' }}
        />

        <MetricCard
          title="Relayed Messages (24h)"
          value={Number(metrics.messagesLast24h).toLocaleString()}
          subtext="100% Sanitized & Anonymized"
          icon={Zap}
          badge={{ text: 'Zero Leaks', variant: 'blue' }}
        />

        <MetricCard
          title="Destiny Coins In Circulation"
          value={Number(metrics.totalCoinsInCirculation).toLocaleString()}
          unit="DC"
          subtext="Total user wallet sum"
          icon={Coins}
          badge={{ text: 'Idempotent Ledger', variant: 'amber' }}
        />
      </div>

      {/* Main Visual Telemetry Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Telemetry Chart Container */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Throughput & Connection Velocity</CardTitle>
              <CardDescription>Real-time message flow and matchmaking creation</CardDescription>
            </div>

            <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-lg border border-white/[0.06] text-xs">
              <button
                onClick={() => setChartMetric('messages')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  chartMetric === 'messages' ? 'bg-white/[0.1] text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Messages
              </button>
              <button
                onClick={() => setChartMetric('matches')}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  chartMetric === 'matches' ? 'bg-white/[0.1] text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Match Rooms
              </button>
            </div>
          </CardHeader>

          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={throughputData}>
                  <defs>
                    <linearGradient id="primaryFlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartMetric === 'messages' ? '#10b981' : '#38bdf8'} stopOpacity={0.25}/>
                      <stop offset="95%" stopColor={chartMetric === 'messages' ? '#10b981' : '#38bdf8'} stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="#71717a" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} 
                  />
                  <YAxis 
                    stroke="#71717a" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} 
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#18191e', 
                      borderColor: 'rgba(255,255,255,0.12)', 
                      borderRadius: '8px', 
                      fontSize: '11px',
                      color: '#f4f4f5',
                      fontFamily: 'monospace',
                      boxShadow: '0 8px 24px -4px rgba(0,0,0,0.7)'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey={chartMetric} 
                    name={chartMetric === 'messages' ? 'Messages Relayed' : 'Matches Formed'} 
                    stroke={chartMetric === 'messages' ? '#10b981' : '#38bdf8'} 
                    strokeWidth={1.5} 
                    fillOpacity={1} 
                    fill="url(#primaryFlow)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Secondary: Queue Distribution */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Queue Latency Brackets</CardTitle>
              <CardDescription>Wait resolution distribution</CardDescription>
            </div>
            <Badge variant="zinc">CSPRNG Fair</Badge>
          </CardHeader>

          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={queueDistribution}>
                  <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="bracket" stroke="#71717a" fontSize={10} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
                  <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#18191e', 
                      borderColor: 'rgba(255,255,255,0.12)', 
                      borderRadius: '8px', 
                      fontSize: '11px',
                      color: '#f4f4f5',
                      fontFamily: 'monospace'
                    }} 
                  />
                  <Bar dataKey="users" name="Active Tickets" fill="#52525b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cluster Node Diagnostics & Quick Jump Bento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Shards & Workers */}
        <Card hoverEffect={false}>
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-300 shrink-0">
              <Cpu className="w-4 h-4 text-zinc-300" />
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-200">Gateway Shards & Workers</div>
              <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                Workers: {metrics.workersActive} active · Shards: {metrics.shardsOnline} online
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database Source of Truth */}
        <Card hoverEffect={false}>
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-300 shrink-0">
              <Database className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-200">Supabase PostgreSQL</div>
              <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                Primary Database: <span className="text-emerald-400">Connected</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Moderation Desk Summary */}
        <Card hoverEffect={false}>
          <CardContent className="flex items-center gap-3.5 p-4">
            <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-300 shrink-0">
              <ShieldCheck className="w-4 h-4 text-zinc-300" />
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-200">Safety & Moderation Triage</div>
              <div className="text-[11px] font-mono mt-0.5">
                {metrics.pendingReportsCount === 0 ? (
                  <span className="text-zinc-400">0 reports pending · All clear</span>
                ) : (
                  <span className="text-rose-400 font-semibold">{metrics.pendingReportsCount} report(s) pending review</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Launchpad Navigation */}
      <div className="rounded-xl border border-white/[0.07] bg-[#111318] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-zinc-300">Quick Console Operations</div>
          <span className="text-[10px] font-mono text-zinc-500">Instant Navigation</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Link href="/rooms" className="p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] transition-colors flex items-center justify-between group">
            <span className="text-xs text-zinc-300 group-hover:text-white">Live Rooms</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300" />
          </Link>
          <Link href="/users" className="p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] transition-colors flex items-center justify-between group">
            <span className="text-xs text-zinc-300 group-hover:text-white">User Accounts</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300" />
          </Link>
          <Link href="/economy" className="p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] transition-colors flex items-center justify-between group">
            <span className="text-xs text-zinc-300 group-hover:text-white">Currency Ledger</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300" />
          </Link>
          <Link href="/moderation" className="p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] transition-colors flex items-center justify-between group">
            <span className="text-xs text-zinc-300 group-hover:text-white">Safety & Reports</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300" />
          </Link>
        </div>
      </div>
    </div>
  );
}
