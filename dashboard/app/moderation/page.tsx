'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Ban, Clock, RefreshCw, AlertTriangle, Check, UserX, MessageSquare } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';

export default function ModerationPage() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modNotes, setModNotes] = useState('');
  const [lastSync, setLastSync] = useState('');

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setReports(data);
        setLastSync(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to fetch real reports:', err);
    }
  };

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleResolve = async (reportId: string, action: string) => {
    try {
      await fetch(`/api/reports/${reportId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: modNotes, adminId: 'mod_console' }),
      });
      setModNotes('');
      fetchReports();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-medium tracking-tight text-zinc-100 font-sans">
              Moderation & Safety Desk
            </h1>
            <Badge variant="rose" dot>
              {reports.length} pending incident(s)
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time incident reports submitted via Discord /report command with attached message excerpts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setLoading(true); fetchReports().finally(() => setLoading(false)); }}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Poll Now</span>
          </Button>
        </div>
      </div>

      {reports.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="All Clear — 0 Pending Reports"
          description="No active safety violations reported right now. When users run /report in Discord, incidents with chat excerpts appear here in real time."
        />
      ) : (
        <div className="space-y-4">
          {reports.map((r) => (
            <Card key={r.id} className="p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <Badge variant="rose">
                    {r.category?.replace('_', ' ') || 'Incident'}
                  </Badge>
                  <span className="font-mono text-[11px] text-zinc-500">
                    ID: {r.id}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-amber-300 font-mono">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>{r.status || 'PENDING'}</span>
                </div>
              </div>

              <div className="text-xs text-zinc-200 leading-relaxed font-sans">
                {r.description}
              </div>

              {/* Chat Excerpt Evidence */}
              {r.chatExcerpt && r.chatExcerpt.length > 0 && (
                <div className="rounded-lg bg-[#0c0d10] p-3.5 border border-white/[0.06] space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    Attached Chat Excerpt ({r.chatExcerpt.length} message(s))
                  </div>
                  <div className="space-y-1.5">
                    {r.chatExcerpt.map((msg: any, i: number) => (
                      <div key={i} className="text-xs text-zinc-300 flex items-start gap-2 border-l-2 border-zinc-700 pl-2">
                        <span className="font-mono text-[10px] text-zinc-500 shrink-0">
                          {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : `#${i + 1}`}
                        </span>
                        <span className="text-zinc-200 font-sans">{msg.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Moderation Resolution Actions */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
                <input
                  type="text"
                  placeholder="Optional resolution note or violation explanation..."
                  value={modNotes}
                  onChange={(e) => setModNotes(e.target.value)}
                  className="flex-1 bg-[#18191e] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-white/20"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleResolve(r.id, 'dismiss')}
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    variant="amber"
                    onClick={() => handleResolve(r.id, 'warning')}
                  >
                    Issue Warning
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleResolve(r.id, 'ban')}
                  >
                    Ban User
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
