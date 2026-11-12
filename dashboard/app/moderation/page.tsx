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
  const [statusFilter, setStatusFilter] = useState('pending');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchReports = async () => {
    try {
      const query = statusFilter === 'all' ? '' : '?status=' + encodeURIComponent(statusFilter);
      const res = await fetch('/api/reports' + query, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data)) throw new Error(data.error || 'Unable to load reports (' + res.status + ').');
      setReports(data);
      setError('');
      setLastSync(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Failed to fetch real reports:', err);
      setError(err?.message || 'Failed to load reports.');
    }
  };

  useEffect(() => {
    fetchReports();
    const interval = setInterval(fetchReports, 5000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const handleResolve = async (reportId: string, action: 'none' | 'warned' | 'temp_ban' | 'perma_ban') => {
    setActionLoading(reportId);
    setError('');
    setWarning('');
    try {
      const res = await fetch(`/api/reports/${reportId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: modNotes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'The moderation action could not be saved.');
      setModNotes('');
      const warnings = [data.auditWarning ? 'The action was saved, but its audit log could not be written.' : '', data.cleanupWarning ? 'The ban was saved, but queue or room cleanup needs owner attention.' : ''].filter(Boolean);
      setWarning(warnings.join(' '));
      await fetchReports();
    } catch (err: any) {
      console.error('Failed to resolve report:', err);
      setError(err?.message || 'The moderation action failed.');
    } finally {
      setActionLoading(null);
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
            Review saved reports, inspect attached evidence, and record moderator decisions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-[#18191e] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-200">
            <option value="pending">Pending</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All reports</option>
          </select>
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

      {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">{error}</div>}
      {warning && <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">{warning}</div>}
      {reports.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={statusFilter === "pending" ? "All Clear — 0 Pending Reports" : "No Reports Found"}
          description={statusFilter === "pending" ? "No reports are awaiting moderator review." : "No reports match this status filter."}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-zinc-400 font-mono">
                <div>Reporter: <span className="text-zinc-200">{r.reporterId || 'Unavailable'}</span></div>
                <div>Reported user: <span className="text-zinc-200">{r.reportedId || 'Unavailable'}</span></div>
                <div>Room: <span className="text-zinc-200">{r.roomId || 'Unavailable'}</span></div>
                <div>Submitted: <span className="text-zinc-200">{r.createdAt ? new Date(r.createdAt).toLocaleString() : 'Unknown'}</span></div>
              </div>
              <div className="text-xs text-zinc-200 leading-relaxed font-sans whitespace-pre-wrap">{r.description || 'No description provided.'}</div>

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
                        <span className="text-zinc-200 font-sans"><span className="text-zinc-500">{msg.senderPseudonym || 'Anonymous'}: </span>{msg.content}</span>
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
                    onClick={() => handleResolve(r.id, 'none')}
                    disabled={actionLoading === r.id || r.status !== 'pending'}
                  >
                    Mark Reviewed
                  </Button>
                  <Button
                    size="sm"
                    variant="amber"
                    onClick={() => handleResolve(r.id, 'warned')}
                    disabled={actionLoading === r.id || r.status !== 'pending'}
                  >
                    Record Warning
                  </Button>
                  <Button
                    size="sm"
                    variant="amber"
                    onClick={() => handleResolve(r.id, 'temp_ban')}
                    disabled={actionLoading === r.id || r.status !== 'pending'}
                  >
                    Ban 24h
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleResolve(r.id, 'perma_ban')}
                    disabled={actionLoading === r.id || r.status !== 'pending'}
                  >
                    Permanently Ban
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
