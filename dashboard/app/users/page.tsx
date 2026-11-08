'use client';

import React, { useState, useEffect } from 'react';
import { 
  Search, 
  CheckCircle, 
  Ban, 
  Coins, 
  RefreshCw, 
  Copy, 
  Check, 
  Filter, 
  UserCheck, 
  SlidersHorizontal,
  ChevronRight,
  Eye,
  X,
  Flame,
  Shield,
  Clock
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'banned'>('all');
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [inspectUser, setInspectUser] = useState<any | null>(null);
  const [coinDelta, setCoinDelta] = useState('100');
  const [banReason, setBanReason] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState('');

  const fetchUsers = async () => {
    try {
      const res = await fetch(`/api/users?q=${encodeURIComponent(searchTerm)}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        setLastSync(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to fetch real users:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 3000);
    return () => clearInterval(interval);
  }, [searchTerm]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleAdjustCoins = async (userId: string) => {
    const amount = parseInt(coinDelta, 10);
    if (isNaN(amount)) return;
    try {
      await fetch(`/api/users/${userId}/adjust-coins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, reason: 'Console balance adjustment', adminId: 'admin_console' }),
      });
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleBan = async (userId: string, currentBan: boolean) => {
    try {
      await fetch(`/api/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          banned: !currentBan,
          reason: banReason || (!currentBan ? 'Suspension via console' : 'Reinstated by admin'),
          adminId: 'admin_console',
        }),
      });
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (statusFilter === 'verified') return u.genderVerified;
    if (statusFilter === 'banned') return u.isBanned;
    return true;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-medium tracking-tight text-zinc-100 font-sans">
              User Directory & Destiny Accounts
            </h1>
            <Badge variant="zinc">
              {users.length} registered profiles
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Global accounts, Destiny IDs, gender verification badges, and coin ledger states.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setLoading(true); fetchUsers().finally(() => setLoading(false)); }}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Poll Now</span>
          </Button>
        </div>
      </div>

      {/* 21st.dev Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by Destiny ID or Discord Snowflake..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#111318] border border-white/[0.08] rounded-lg pl-9 pr-4 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/20 transition-colors font-mono shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-[#111318] p-1 border border-white/[0.07] rounded-lg text-xs shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-md text-xs transition-colors ${
              statusFilter === 'all' ? 'bg-white/[0.08] text-white font-medium shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All ({users.length})
          </button>
          <button
            onClick={() => setStatusFilter('verified')}
            className={`px-3 py-1 rounded-md text-xs transition-colors ${
              statusFilter === 'verified' ? 'bg-white/[0.08] text-white font-medium shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Verified ({users.filter(u => u.genderVerified).length})
          </button>
          <button
            onClick={() => setStatusFilter('banned')}
            className={`px-3 py-1 rounded-md text-xs transition-colors ${
              statusFilter === 'banned' ? 'bg-white/[0.08] text-white font-medium shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Banned ({users.filter(u => u.isBanned).length})
          </button>
        </div>
      </div>

      {/* 21st.dev High-Density Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-white/[0.02] text-[11px] font-medium text-zinc-400 border-b border-white/[0.06]">
              <tr>
                <th className="px-5 py-3">Destiny ID</th>
                <th className="px-5 py-3">Discord Snowflake</th>
                <th className="px-5 py-3">Demographic</th>
                <th className="px-5 py-3">Verification</th>
                <th className="px-5 py-3 text-right">Destiny Coins</th>
                <th className="px-5 py-3">Streak & Tier</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8">
                    <EmptyState
                      icon={UserCheck}
                      title="No accounts matching criteria"
                      description="When real users trigger commands like /match or /daily in Discord, accounts stream here instantly."
                    />
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-5 py-3.5 font-mono font-medium text-zinc-200">
                      <div className="flex items-center gap-1.5">
                        <span className="cursor-pointer hover:underline" onClick={() => setInspectUser(u)}>
                          {u.destinyId}
                        </span>
                        <button
                          onClick={() => copyToClipboard(u.destinyId)}
                          title="Copy ID"
                          className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
                        >
                          {copiedId === u.destinyId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </td>

                    <td className="px-5 py-3.5 font-mono text-zinc-500 text-[11px]">
                      {u.discordUserId}
                    </td>

                    <td className="px-5 py-3.5 capitalize text-zinc-300">
                      {u.age} y/o · {u.gender}
                    </td>

                    <td className="px-5 py-3.5">
                      {u.genderVerified ? (
                        <Badge variant="emerald" dot>
                          Verified
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-zinc-500 font-mono">
                          Unverified
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 font-mono font-medium text-right text-zinc-200 tabular-nums">
                      {Number(u.destinyCoins || 0).toLocaleString()} <span className="text-zinc-500 text-[10px]">DC</span>
                    </td>

                    <td className="px-5 py-3.5 text-[11px]">
                      <div className="text-zinc-300">{u.connectionTier || 'Strangers'}</div>
                      <div className="text-zinc-500 font-mono flex items-center gap-1">
                        <Flame className="w-3 h-3 text-amber-500" />
                        <span>{u.streakCount || 0}d streak</span>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      {u.isBanned ? (
                        <Badge variant="rose">
                          Banned
                        </Badge>
                      ) : (
                        <Badge variant="zinc">
                          Active
                        </Badge>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right space-x-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setInspectUser(u)}
                      >
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedUser(u)}
                      >
                        Adjust DC
                      </Button>
                      <Button
                        size="sm"
                        variant={u.isBanned ? 'emerald' : 'danger' as any}
                        onClick={() => handleToggleBan(u.id, u.isBanned)}
                      >
                        {u.isBanned ? 'Unban' : 'Ban'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 21st.dev User Inspection Slide-over Drawer */}
      {inspectUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex justify-end animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#111318] border-l border-white/[0.1] h-full flex flex-col shadow-2xl p-6 space-y-6 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div>
                <h3 className="text-sm font-medium text-zinc-100">Account Telemetry</h3>
                <span className="font-mono text-xs text-zinc-400">{inspectUser.destinyId}</span>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setInspectUser(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Snowflake Identity</span>
                <div className="font-mono text-zinc-200 text-sm">{inspectUser.discordUserId}</div>
                <div className="text-zinc-500 text-[11px]">Discord User Account Linked</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                  <span className="text-[10px] font-mono text-zinc-500">Wallet Balance</span>
                  <div className="font-mono text-lg font-medium text-amber-300 mt-1">
                    {Number(inspectUser.destinyCoins).toLocaleString()} DC
                  </div>
                </div>
                <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                  <span className="text-[10px] font-mono text-zinc-500">Streak Record</span>
                  <div className="font-mono text-lg font-medium text-zinc-200 mt-1">
                    {inspectUser.streakCount || 0} Days
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Demographics & Matching</span>
                <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Gender / Age:</span>
                    <span className="font-medium text-zinc-200 capitalize">{inspectUser.gender} ({inspectUser.age} y/o)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Verified Badge:</span>
                    <span className="text-zinc-200">{inspectUser.genderVerified ? 'Yes (Badge Granted)' : 'No'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Preferred Gender:</span>
                    <span className="font-mono text-zinc-300">{JSON.stringify(inspectUser.preferredGender || ['any'])}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Interests Tagged:</span>
                    <span className="font-mono text-zinc-300">{(inspectUser.interests || []).join(', ') || 'None set'}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.06] flex gap-2">
                <Button
                  className="flex-1"
                  variant="secondary"
                  onClick={() => { setSelectedUser(inspectUser); setInspectUser(null); }}
                >
                  Adjust Coins
                </Button>
                <Button
                  className="flex-1"
                  variant={inspectUser.isBanned ? 'emerald' : 'danger' as any}
                  onClick={() => { handleToggleBan(inspectUser.id, inspectUser.isBanned); setInspectUser(null); }}
                >
                  {inspectUser.isBanned ? 'Unban User' : 'Ban User'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Adjust DC Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#111318] border border-white/[0.12] p-6 rounded-xl max-w-sm w-full space-y-4 shadow-2xl">
            <div>
              <h3 className="text-sm font-medium text-zinc-100">Adjust Account Balance</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Destiny ID: <span className="font-mono text-zinc-200">{selectedUser.destinyId}</span>
                <br />Live Balance: <span className="font-mono text-amber-300 font-medium">{Number(selectedUser.destinyCoins).toLocaleString()} DC</span>
              </p>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5 font-medium">Coin Delta (positive or negative)</label>
              <input
                type="number"
                value={coinDelta}
                onChange={(e) => setCoinDelta(e.target.value)}
                className="w-full bg-[#18191e] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-100 font-mono focus:outline-none focus:border-white/20"
              />
              <div className="flex gap-1.5 mt-2.5">
                {['+50', '+100', '+500', '-50', '-100'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCoinDelta(val.replace('+', ''))}
                    className="px-2 py-1 text-[10px] font-mono rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
              <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={() => handleAdjustCoins(selectedUser.id)}>
                Apply Delta
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
