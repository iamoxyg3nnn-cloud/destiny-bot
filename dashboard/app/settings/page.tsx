'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Clock, ShieldCheck, Server, AlertOctagon, Check, Bell, Sliders, Hash, RefreshCw, Trash2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState('19:30');
  const [reminderTz, setReminderTz] = useState('Asia/Kolkata');
  const [crossServerEnabled, setCrossServerEnabled] = useState(true);
  const [rateLimitMsgs, setRateLimitMsgs] = useState('5');

  // Guilds state
  const [guilds, setGuilds] = useState<any[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<{ [guildId: string]: string }>({});
  const [guildSuccess, setGuildSuccess] = useState<string | null>(null);

  const fetchGuilds = async () => {
    setGuildsLoading(true);
    try {
      const res = await fetch('/api/guilds', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setGuilds(data);
        const map: { [guildId: string]: string } = {};
        data.forEach((g: any) => {
          map[g.id] = g.matchChannelId || g.modLogChannelId || '';
        });
        setSelectedChannels(map);
      }
    } catch (err) {
      console.error('Failed to fetch guilds:', err);
    } finally {
      setGuildsLoading(false);
    }
  };

  useEffect(() => {
    fetchGuilds();
  }, []);

  const handleSaveGuildChannel = async (guildId: string, guildName: string) => {
    const channelId = selectedChannels[guildId];
    try {
      const res = await fetch(`/api/guilds/${guildId}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, guildName }),
      });
      if (res.ok) {
        setGuildSuccess(`Successfully updated channel for "${guildName}"!`);
        setTimeout(() => setGuildSuccess(null), 3000);
        fetchGuilds();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearGuildChannel = async (guildId: string, guildName: string) => {
    try {
      const res = await fetch(`/api/guilds/${guildId}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: null, guildName }),
      });
      if (res.ok) {
        setGuildSuccess(`Cleared channel lock for "${guildName}"!`);
        setTimeout(() => setGuildSuccess(null), 3000);
        fetchGuilds();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="pb-4 border-b border-white/[0.07]">
        <h1 className="text-xl font-medium tracking-tight text-zinc-100 font-sans">
          System Settings & Server Management
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Configure designated server channels, background automation schedules, and cross-server matchmaking boundaries.
        </p>
      </div>

      {saved && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono flex items-center gap-2 animate-in fade-in duration-150">
          <Check className="w-4 h-4 shrink-0" />
          <span>Settings saved and broadcast to all gateway workers.</span>
        </div>
      )}

      {guildSuccess && (
        <div className="p-3.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-mono flex items-center gap-2 animate-in fade-in duration-150">
          <Check className="w-4 h-4 shrink-0" />
          <span>{guildSuccess}</span>
        </div>
      )}

      {/* Connected Servers & Dedicated Channel Management */}
      <Card className="p-5 space-y-4 border border-white/[0.08] bg-[#14151a]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
              <Server className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-200">Connected Discord Servers & Dedicated Channels</div>
              <div className="text-[11px] text-zinc-400">Configure the server channel. DM-submitted reports route to the first configured mod-log in Destiny's trusted staff servers. Channel alerts contain no user identities or chat excerpts; full evidence stays in the protected moderation dashboard.</div>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={fetchGuilds} disabled={guildsLoading}>
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 mr-1.5 ${guildsLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Servers</span>
          </Button>
        </div>

        {guilds.length === 0 ? (
          <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.05] text-xs text-zinc-400">
            No connected guilds found yet, or the bot gateway is initializing.
          </div>
        ) : (
          <div className="space-y-3 pt-2">
            {guilds.map((g) => {
              const activeChannel = g.matchChannelId || g.modLogChannelId;
              const currentVal = selectedChannels[g.id] !== undefined ? selectedChannels[g.id] : (activeChannel || '');
              return (
                <div key={g.id} className="p-4 rounded-lg bg-[#0e0f12] border border-white/[0.06] flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-100">{g.name}</span>
                      <Badge variant="purple" className="text-[10px]">
                        {g.memberCount} members
                      </Badge>
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                      <span>Server ID: {g.id}</span>
                      <span>·</span>
                      <span>Status:</span>
                      {activeChannel ? (
                        <span className="text-emerald-400 font-medium">Locked to channel ({activeChannel})</span>
                      ) : (
                        <span className="text-zinc-400">Unrestricted</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-zinc-400" />
                      <select
                        value={currentVal}
                        onChange={(e) => setSelectedChannels({ ...selectedChannels, [g.id]: e.target.value })}
                        className="bg-[#18191e] border border-white/[0.08] rounded-md px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-purple-500/50"
                      >
                        <option value="">-- No Channel Lock (Unrestricted) --</option>
                        {g.channels.map((ch: any) => (
                          <option key={ch.id} value={ch.id}>
                            #{ch.name} ({ch.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleSaveGuildChannel(g.id, g.name)}
                    >
                      Save
                    </Button>

                    {activeChannel && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleClearGuildChannel(g.id, g.name)}
                        title="Remove channel lock"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-zinc-400" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 7:30 PM IST Reminders Section */}
      <Card className="p-5 space-y-4 border border-white/[0.08] bg-[#14151a]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-zinc-400" />
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-200">Daily Social Matchmaking Reminder (7:30 PM IST)</div>
            <div className="text-[11px] text-zinc-400">Scheduled worker cron sending opt-in reminders to active guild members</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div>
            <label className="text-[11px] text-zinc-400 font-medium block mb-1">Status</label>
            <select
              value={reminderEnabled ? 'enabled' : 'disabled'}
              onChange={(e) => setReminderEnabled(e.target.value === 'enabled')}
              className="w-full bg-[#18191e] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/20"
            >
              <option value="enabled">Enabled (Active)</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-zinc-400 font-medium block mb-1">Time of Day (24-hour)</label>
            <input
              type="text"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="w-full bg-[#18191e] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-white/20"
            />
          </div>
          <div>
            <label className="text-[11px] text-zinc-400 font-medium block mb-1">Reference Timezone</label>
            <input
              type="text"
              value={reminderTz}
              onChange={(e) => setReminderTz(e.target.value)}
              className="w-full bg-[#18191e] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-white/20"
            />
          </div>
        </div>
      </Card>

      {/* Safety & Cross Server Matching */}
      <Card className="p-5 space-y-4 border border-white/[0.08] bg-[#14151a]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-zinc-400" />
          </div>
          <div>
            <div className="text-xs font-medium text-zinc-200">Cross-Server Discovery & Rate Limiting</div>
            <div className="text-[11px] text-zinc-400">Matchmaking boundaries and anti-flooding rate limiter window</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-[11px] text-zinc-400 font-medium block mb-1">Cross-Server Discovery</label>
            <select
              value={crossServerEnabled ? 'enabled' : 'disabled'}
              onChange={(e) => setCrossServerEnabled(e.target.value === 'enabled')}
              className="w-full bg-[#18191e] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/20"
            >
              <option value="enabled">Allow Global Cross-Server Matchmaking</option>
              <option value="disabled">Restrict to Same-Server Only</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-zinc-400 font-medium block mb-1">Max Relay Messages (per 5s window)</label>
            <input
              type="number"
              value={rateLimitMsgs}
              onChange={(e) => setRateLimitMsgs(e.target.value)}
              className="w-full bg-[#18191e] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-white/20"
            />
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button variant="primary" size="md" onClick={handleSave}>
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
