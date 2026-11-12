'use client';

import React, { useState, useEffect } from 'react';
import { 
  MessagesSquare, 
  XCircle, 
  Eye, 
  RefreshCw, 
  ShieldAlert, 
  Clock, 
  ArrowRight, 
  UserCheck,
  Radio,
  Lock,
  Sparkles,
  X
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';

export default function RoomsPage() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [inspectRoom, setInspectRoom] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState('');

  const fetchRooms = async () => {
    try {
      const res = await fetch('/api/rooms', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setRooms(data);
        setLastSync(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to fetch live rooms:', err);
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!inspectRoom) return;

    const pollMessages = async () => {
      try {
        const res = await fetch(`/api/rooms/${inspectRoom.id}/messages`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setMessages(data);
        }
      } catch (err) {
        console.error('Failed to poll messages:', err);
      }
    };

    pollMessages();
    const msgInterval = setInterval(pollMessages, 2000);
    return () => clearInterval(msgInterval);
  }, [inspectRoom]);

  const handleTerminateRoom = async (roomId: string) => {
    if (!confirm('Are you sure you want to forcibly terminate this match room session?')) return;
    try {
      await fetch(`/api/rooms/${roomId}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Forced termination via admin console', adminId: 'admin_console' }),
      });
      setInspectRoom(null);
      fetchRooms();
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
              Live Anonymous Match Rooms
            </h1>
            <Badge variant="emerald" dot>
              {rooms.length} active pair(s)
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Active anonymous 1-on-1 pairing sessions relayed across connected Discord servers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setLoading(true); fetchRooms().finally(() => setLoading(false)); }}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Poll Now</span>
          </Button>
        </div>
      </div>

      {rooms.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No Active Rooms Right Now"
          description="When users run /match in Discord and get paired, their live room session will appear here instantly in real time!"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rooms.map((room) => (
            <Card key={room.id} className="p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium text-zinc-200">{room.id}</span>
                  <Badge variant="emerald" dot>Active</Badge>
                </div>
                <span className="text-[11px] font-mono text-zinc-500">
                  {room.createdAt ? new Date(room.createdAt).toLocaleTimeString() : 'Active now'}
                </span>
              </div>

              {/* Pair Demographic Pod */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-1">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Partner A</div>
                  <div className="font-mono text-zinc-200 font-medium">{room.user1DestinyId || 'Anonymous'}</div>
                  <div className="text-[11px] text-zinc-400">
                    {room.user1Gender ? `${room.user1Age || '??'}y/o · ${room.user1Gender}` : 'Masked'}
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-1">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Partner B</div>
                  <div className="font-mono text-zinc-200 font-medium">{room.user2DestinyId || 'Anonymous'}</div>
                  <div className="text-[11px] text-zinc-400">
                    {room.user2Gender ? `${room.user2Age || '??'}y/o · ${room.user2Gender}` : 'Masked'}
                  </div>
                </div>
              </div>

              {/* Room Metadata & Controls */}
              <div className="flex items-center justify-between text-xs pt-1">
                <div className="flex items-center gap-2 text-zinc-400">
                  {room.revealedFields && room.revealedFields.length > 0 && (
                    <Badge variant="amber">Mutual Reveal</Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setInspectRoom(room)}
                  >
                    <Eye className="w-3 h-3" />
                    <span>Inspect</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleTerminateRoom(room.id)}
                  >
                    <XCircle className="w-3 h-3" />
                    <span>Terminate</span>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Inspect Room Drawer / Modal */}
      {inspectRoom && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#111318] border border-white/[0.12] rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-zinc-100">{inspectRoom.id}</span>
                  <Badge variant="emerald" dot>Live Stream</Badge>
                </div>
                <div className="text-xs text-zinc-400 mt-0.5">
                  Anonymized Relay
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => handleTerminateRoom(inspectRoom.id)}
                >
                  Terminate Room
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setInspectRoom(null)}
                >
                  Close
                </Button>
              </div>
            </div>

            {/* Live Message Feed */}
            <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-[#0c0d10]">
              {messages.length === 0 ? (
                <div className="text-center text-zinc-500 text-xs py-10 font-sans">
                  No messages relayed in this session yet.
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.05] space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-medium text-zinc-300">
                        {msg.senderHash ? `Sender #${msg.senderHash.slice(0, 8)}` : 'Partner'}
                      </span>
                      <span className="font-mono text-zinc-500 text-[10px]">
                        {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ''}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-200 break-words font-sans">
                      {msg.sanitizedContent || msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
