'use client';

import React, { useEffect, useState } from 'react';
import { Search, RefreshCw, Copy, Check, UserCheck } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';

type UserRow = {
  id: string;
  destinyId: string;
  discordUserId: string;
  age: number;
  gender: string;
  genderVerified: boolean;
  isBanned: boolean;
  banReason?: string;
  banExpiresAt?: string | null;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'banned'>('all');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState('');
  const [notice, setNotice] = useState('');

  const fetchUsers = async () => {
    try {
      const res = await fetch(`/api/users?q=${encodeURIComponent(searchTerm)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not load user directory.');
      setUsers(await res.json());
      setLastSync(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  useEffect(() => {
    void fetchUsers();
    const interval = setInterval(() => void fetchUsers(), 5000);
    return () => clearInterval(interval);
  }, [searchTerm]);

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(value);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (error) {
      console.error('Could not copy ID:', error);
    }
  };

  const toggleBan = async (user: UserRow) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/users/${user.id}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          banned: !user.isBanned,
          reason: user.isBanned ? 'Reinstated by admin' : 'Suspension via console',
          adminId: 'admin_console',
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Moderation action failed.');
      setNotice([result.auditWarning ? 'Ban status saved, but the audit log could not be written.' : '', result.cleanupWarning ? 'Ban status saved, but queue or room cleanup needs owner attention.' : '', !result.auditWarning && !result.cleanupWarning ? 'Moderation status updated.' : ''].filter(Boolean).join(' '));
      await fetchUsers();
    } catch (error: any) {
      console.error(error);
      setNotice(error?.message || 'Moderation action failed.');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    if (statusFilter === 'verified') return user.genderVerified;
    if (statusFilter === 'banned') return user.isBanned;
    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-medium tracking-tight text-zinc-100">User Directory</h1>
            <Badge variant="zinc">{users.length} profiles</Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Anonymous identities, profile eligibility and moderation status.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => { setLoading(true); void fetchUsers().finally(() => setLoading(false)); }} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {notice && <div role="status" className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs text-zinc-300">{notice}</div>}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search Destiny ID or Discord ID..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full bg-[#111318] border border-white/[0.08] rounded-lg pl-9 pr-4 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/20"
          />
        </div>
        <div className="flex items-center gap-1 bg-[#111318] p-1 border border-white/[0.07] rounded-lg text-xs">
          {(['all', 'verified', 'banned'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1 rounded-md capitalize ${statusFilter === filter ? 'bg-white/[0.08] text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {filter} ({filter === 'all' ? users.length : filter === 'verified' ? users.filter((user) => user.genderVerified).length : users.filter((user) => user.isBanned).length})
            </button>
          ))}
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-white/[0.02] text-[11px] font-medium text-zinc-400 border-b border-white/[0.06]">
              <tr>
                <th className="px-5 py-3">Destiny ID</th>
                <th className="px-5 py-3">Discord ID</th>
                <th className="px-5 py-3">Profile</th>
                <th className="px-5 py-3">Verification</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredUsers.length === 0 ? (
                <tr><td colSpan={6} className="p-8"><EmptyState icon={UserCheck} title="No matching profiles" description="Profiles appear here when users create an anonymous Destiny account." /></td></tr>
              ) : filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3.5 font-mono font-medium text-zinc-200">
                    <div className="flex items-center gap-1.5">
                      <span>{user.destinyId}</span>
                      <button onClick={() => void copyToClipboard(user.destinyId)} title="Copy Destiny ID" className="text-zinc-500 hover:text-zinc-300">
                        {copiedId === user.destinyId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-zinc-500 text-[11px]">{user.discordUserId}</td>
                  <td className="px-5 py-3.5 capitalize">{user.age} · {user.gender}</td>
                  <td className="px-5 py-3.5">{user.genderVerified ? <Badge variant="emerald">Verified</Badge> : <span className="text-zinc-500">Unverified</span>}</td>
                  <td className="px-5 py-3.5">{user.isBanned ? (user.banExpiresAt ? <Badge variant="amber">Temporary until {new Date(user.banExpiresAt).toLocaleString()}</Badge> : <Badge variant="rose">Permanent ban</Badge>) : <Badge variant="zinc">Active</Badge>}</td>
                  <td className="px-5 py-3.5 text-right">
                    <Button size="sm" variant={user.isBanned ? 'amber' : 'danger'} onClick={() => void toggleBan(user)} disabled={loading}>
                      {user.isBanned ? 'Unban' : 'Ban'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-[10px] font-mono text-zinc-500">Last synced: {lastSync || 'Waiting for data'}</p>
    </div>
  );
}
