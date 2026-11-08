'use client';

import React, { useState, useEffect } from 'react';
import { FileText, RefreshCw, Filter, Search, Shield, Copy, Check } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState('');

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
        setLastSync(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to fetch real audit logs:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filteredLogs = logs.filter((l) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      l.action?.toLowerCase().includes(term) ||
      l.adminId?.toLowerCase().includes(term) ||
      l.targetId?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-medium tracking-tight text-zinc-100 font-sans">
              Administrative Audit Logs
            </h1>
            <Badge variant="zinc">
              {logs.length} immutable records
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Permanent, tamper-evident audit records stored in Supabase PostgreSQL admin_audit_logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setLoading(true); fetchLogs().finally(() => setLoading(false)); }}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Poll Now</span>
          </Button>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-md">
        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
        <input
          type="text"
          placeholder="Filter logs by operator, action, or target ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#111318] border border-white/[0.08] rounded-lg pl-9 pr-4 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/20 font-mono transition-colors shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
        />
      </div>

      {/* Logs Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-white/[0.02] text-[11px] font-medium text-zinc-400 border-b border-white/[0.06]">
              <tr>
                <th className="px-5 py-3">Timestamp</th>
                <th className="px-5 py-3">Staff / Operator</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Target Entity</th>
                <th className="px-5 py-3">Audit Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8">
                    <EmptyState
                      icon={FileText}
                      title="No Administrative Actions Recorded"
                      description="Staff adjustments, moderation actions, and balance grants will appear here permanently."
                    />
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/[0.02] transition-colors text-xs">
                    <td className="px-5 py-3.5 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-medium text-zinc-200">
                      {log.adminId}
                    </td>
                    <td className="px-5 py-3.5 font-mono">
                      <Badge variant="zinc">
                        {log.action}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-zinc-400">
                      <span className="text-zinc-500">{log.targetType}:</span> {log.targetId}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-zinc-400 max-w-xs truncate">
                      {JSON.stringify(log.changes)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
