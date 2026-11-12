'use client';

import React, { useState, useEffect } from 'react';
import { BadgeCheck, Check, X, RefreshCw, UserCheck, Shield, Mic, Volume2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';

export default function VerificationPage() {
  const [tab, setTab] = useState<'pending' | 'verified' | 'rejected'>('pending');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<{ [key: string]: string }>({});
  const [lastSync, setLastSync] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchRequests = async () => {
    try {
      const res = await fetch(`/api/verifications?status=${tab}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data)) throw new Error(data.error || 'Could not load verification requests.');
      setRequests(data);
      setError('');
      setLastSync(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Failed to fetch verification requests:', err);
      setError(err?.message || 'Could not load verification requests.');
    }
  };

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 4000);
    return () => clearInterval(interval);
  }, [tab]);

  const handleReview = async (userId: string, approved: boolean) => {
    setError('');
    setNotice('');
    try {
      const notes = reviewNotes[userId] || (approved ? 'Identity verified by admin review' : 'Insufficient verification documentation');
      const response = await fetch(`/api/verifications/${userId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, notes }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || result.error || 'Verification review failed.');
      setReviewNotes((prev) => {
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
      setNotice(result.auditWarning ? 'Verification decision saved, but its audit log could not be written.' : result.message);
      await fetchRequests();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Verification review failed.');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {error && <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs text-zinc-300">{notice}</div>}
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-medium tracking-tight text-zinc-100 font-sans">
              Gender Verification Queue
            </h1>
            <Badge variant={tab === 'pending' ? 'purple' : tab === 'verified' ? 'emerald' : 'zinc'} dot>
              {requests.length} {tab}
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Review user voice recordings, audit claimed genders, and grant the official Verified Shield badge.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center bg-[#14151a] p-1 rounded-lg border border-white/[0.08]">
            <button
              onClick={() => setTab('pending')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                tab === 'pending' ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setTab('verified')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                tab === 'verified' ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => setTab('rejected')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                tab === 'rejected' ? 'bg-rose-600/30 text-rose-300 border border-rose-500/30' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Rejected
            </button>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setLoading(true); fetchRequests().finally(() => setLoading(false)); }}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title={tab === 'pending' ? 'Queue Is Clean — 0 Pending Requests' : `No ${tab} requests found`}
          description={
            tab === 'pending'
              ? 'All user gender verification claims have been reviewed. When members submit voice recordings in DM, they will appear here in real time!'
              : `No users currently categorized under ${tab}.`
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requests.map((req) => (
            <Card key={req.id} className="p-5 flex flex-col justify-between space-y-4 border border-white/[0.08] bg-[#14151a]">
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-zinc-100">
                      {req.destinyId}
                    </span>
                    {req.genderVerified && (
                      <Badge variant="emerald" className="text-[10px]">
                        Verified Shield ✨
                      </Badge>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-zinc-400">
                    Discord ID: {req.discordUserId}
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center gap-3 text-zinc-300">
                    <span className="text-zinc-500">Claimed:</span>
                    <span className="font-semibold text-zinc-100 uppercase tracking-wide px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06]">
                      {req.gender}
                    </span>
                    <span className="text-zinc-500">· Age: <strong className="text-zinc-200">{req.age}</strong></span>
                    <span className="text-zinc-500">· Rep: <strong className="text-emerald-400">{req.reputationScore}%</strong></span>
                  </div>

                  {/* Audio Player / Evidence Card */}
                  <div className="p-3.5 rounded-lg bg-[#0e0f12] border border-white/[0.06] space-y-2.5">
                    <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                      <span className="flex items-center gap-1.5 text-purple-300">
                        <Mic className="w-3.5 h-3.5" />
                        Voice Verification Recording
                      </span>
                      <span>Audio Evidence</span>
                    </div>

                    {req.genderVerificationEvidence?.startsWith('http') ? (
                      <div className="space-y-2 pt-1">
                        <audio
                          controls
                          className="w-full h-9 rounded bg-[#1c1d24] border border-white/[0.06]"
                          src={req.genderVerificationEvidence}
                        />
                        <div className="flex items-center justify-between pt-1">
                          <a
                            href={req.genderVerificationEvidence}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-purple-400 hover:text-purple-300 underline font-mono flex items-center gap-1"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                            Direct Stream / Open in New Tab
                          </a>
                          <span className="text-[10px] font-mono text-zinc-400">Native HTML5 Player</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-zinc-300 font-sans leading-relaxed text-xs">
                        {req.genderVerificationEvidence || 'Server role verification or legacy submission.'}
                      </p>
                    )}
                  </div>

                  {/* Optional Admin Review Notes */}
                  {tab === 'pending' && (
                    <div className="pt-1">
                      <label className="text-[11px] text-zinc-400 block mb-1">Staff Note (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Clear voice match, verified female"
                        value={reviewNotes[req.id] || ''}
                        onChange={(e) => setReviewNotes({ ...reviewNotes, [req.id]: e.target.value })}
                        className="w-full bg-[#18191e] border border-white/[0.08] rounded-md px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                  )}
                </div>
              </div>

              {tab === 'pending' && (
                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => handleReview(req.id, false)}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    <span>Reject</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleReview(req.id, true)}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" />
                    <span>Approve ({req.gender})</span>
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
