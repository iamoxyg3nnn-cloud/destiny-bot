'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Server, ShieldCheck, Hash, RefreshCw, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';

type Guild = {
  id: string;
  name: string;
  memberCount: number;
  channels: Array<{ id: string; name: string }>;
  matchChannelId: string | null;
  modLogChannelId: string | null;
  crossServerEnabled: boolean;
};

export default function SettingsPage() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [portalChannels, setPortalChannels] = useState<Record<string, string>>({});
  const [modLogChannels, setModLogChannels] = useState<Record<string, string>>({});
  const [crossServer, setCrossServer] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchGuilds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/guilds', { cache: 'no-store' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Could not load Discord servers.');
      const data = await response.json() as Guild[];
      setGuilds(data);
      setPortalChannels(Object.fromEntries(data.map((guild) => [guild.id, guild.matchChannelId || ''])));
      setModLogChannels(Object.fromEntries(data.map((guild) => [guild.id, guild.modLogChannelId || ''])));
      setCrossServer(Object.fromEntries(data.map((guild) => [guild.id, guild.crossServerEnabled !== false])));
    } catch (err: any) {
      setError(err?.message || 'Could not load Discord servers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchGuilds(); }, [fetchGuilds]);

  const save = async (guild: Guild, key: string, changes: Record<string, unknown>) => {
    setSaving(guild.id + ':' + key);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/guilds/' + guild.id + '/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildName: guild.name, ...changes }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The server setting could not be saved.');
      setSuccess(guild.name + ': setting saved.');
      await fetchGuilds();
    } catch (err: any) {
      setError(err?.message || 'The server setting could not be saved.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="pb-4 border-b border-white/[0.07]">
        <h1 className="text-xl font-medium tracking-tight text-zinc-100">Server Administration</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Each Discord server has independent portal, private moderation-log and cross-server matchmaking settings.
          Platform-wide bot-owner settings are managed separately.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}
      {success && (
        <div role="status" className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />{success}
        </div>
      )}

      <Card className="border border-white/[0.08] bg-[#14151a]">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-sm text-zinc-100 flex items-center gap-2"><Server className="w-4 h-4" />Connected Discord servers</CardTitle>
            <CardDescription className="text-xs text-zinc-400">Changes are saved per server. They do not grant this dashboard account Discord permissions.</CardDescription>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void fetchGuilds()} disabled={loading}>
            <RefreshCw className={'w-3.5 h-3.5 mr-1.5 ' + (loading ? 'animate-spin' : '')} />Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-xs text-zinc-400">Loading connected servers…</p>}
          {!loading && guilds.length === 0 && (
            <p className="text-xs text-zinc-400">No connected servers found. Check that the bot gateway is online.</p>
          )}
          {guilds.map((guild) => (
            <section key={guild.id} className="p-4 rounded-lg bg-[#0e0f12] border border-white/[0.06] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-medium text-zinc-100">{guild.name}</h2>
                  <p className="text-[11px] text-zinc-500">{guild.memberCount} members · {guild.id}</p>
                </div>
                <Badge variant="purple">{crossServer[guild.id] === false ? 'Same server only' : 'Cross-server enabled'}</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor={'portal-' + guild.id} className="text-xs text-zinc-300 flex items-center gap-2"><Hash className="w-3.5 h-3.5" />Matchmaking portal</label>
                  <select id={'portal-' + guild.id} value={portalChannels[guild.id] ?? ''} onChange={(event) => setPortalChannels((state) => ({ ...state, [guild.id]: event.target.value }))} className="w-full bg-[#18191e] border border-white/[0.08] rounded-md px-2.5 py-2 text-xs text-zinc-200">
                    <option value="">No portal channel</option>
                    {guild.channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void save(guild, 'portal', { matchChannelId: portalChannels[guild.id] || null })} disabled={saving !== null}>
                      {saving === guild.id + ':portal' ? 'Saving…' : 'Save portal'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => { setPortalChannels((state) => ({ ...state, [guild.id]: '' })); void save(guild, 'portal', { matchChannelId: null }); }} disabled={!guild.matchChannelId || saving !== null} title="Clear portal channel">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor={'modlog-' + guild.id} className="text-xs text-zinc-300 flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" />Private moderation log</label>
                  <select id={'modlog-' + guild.id} value={modLogChannels[guild.id] ?? ''} onChange={(event) => setModLogChannels((state) => ({ ...state, [guild.id]: event.target.value }))} className="w-full bg-[#18191e] border border-white/[0.08] rounded-md px-2.5 py-2 text-xs text-zinc-200">
                    <option value="">No moderation channel</option>
                    {guild.channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void save(guild, 'modlog', { modLogChannelId: modLogChannels[guild.id] || null })} disabled={saving !== null}>
                      {saving === guild.id + ':modlog' ? 'Saving…' : 'Save mod log'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => { setModLogChannels((state) => ({ ...state, [guild.id]: '' })); void save(guild, 'modlog', { modLogChannelId: null }); }} disabled={!guild.modLogChannelId || saving !== null} title="Clear moderation channel">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-zinc-500">The channel must deny @everyone View Channel access.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
                <div>
                  <p className="text-xs text-zinc-300">Cross-server matchmaking</p>
                  <p className="text-[10px] text-zinc-500">A match across two servers is allowed only if both servers enable it.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={crossServer[guild.id] === false ? 'disabled' : 'enabled'} onChange={(event) => setCrossServer((state) => ({ ...state, [guild.id]: event.target.value === 'enabled' }))} className="bg-[#18191e] border border-white/[0.08] rounded-md px-2.5 py-2 text-xs text-zinc-200">
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Same server only</option>
                  </select>
                  <Button size="sm" onClick={() => void save(guild, 'cross-server', { crossServerEnabled: crossServer[guild.id] !== false })} disabled={saving !== null}>
                    {saving === guild.id + ':cross-server' ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            </section>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
