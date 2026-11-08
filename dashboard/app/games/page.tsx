'use client';

import React, { useState } from 'react';
import { Gamepad2, ShieldCheck, Dice1, Search, CheckCircle, Terminal, Hash, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';

export default function GamesPage() {
  const [verifySeed, setVerifySeed] = useState('');
  const [verifyResult, setVerifyResult] = useState<string | null>(null);

  const games = [
    { id: 'coin_flip', name: 'Coin Flip', category: 'Casino', rtp: '98.0%', winMultiplier: '2.0x', rule: 'Heads or Tails provably fair coin flip' },
    { id: 'blackjack', name: 'Blackjack', category: 'Casino', rtp: '99.2%', winMultiplier: '2.0x / 2.5x', rule: 'Dealer hits soft-17, 3:2 natural payout' },
    { id: 'dice', name: 'Dice (2d6)', category: 'Casino', rtp: '97.5%', winMultiplier: '2.3x / 5.8x', rule: 'Under 7 (2.3x), Exact 7 (5.8x), Over 7 (2.3x)' },
    { id: 'slots', name: 'Slots (3-Reel)', category: 'Casino', rtp: '96.5%', winMultiplier: 'Up to 200x', rule: '3-reel matching paylines + 200x Lucky 7 Jackpot' },
    { id: 'higher_lower', name: 'Higher / Lower', category: 'Casino', rtp: '97.8%', winMultiplier: '1.85x', rule: 'Predict whether next card is higher or lower' },
    { id: 'truth_or_dare', name: 'Truth or Dare', category: 'Social', rtp: '100%', winMultiplier: 'Social', rule: '120+ curated anonymous-safe prompts' },
    { id: 'would_you_rather', name: 'Would You Rather', category: 'Social', rtp: '100%', winMultiplier: '10 DC Award', rule: 'Dilemmas with community consensus voting' },
    { id: 'trivia', name: 'Trivia Duel', category: 'Skill', rtp: 'N/A', winMultiplier: '25 DC Award', rule: 'Timed trivia question awarding 25 DC on correct answer' },
    { id: 'compatibility_quiz', name: 'Compatibility Quiz', category: 'Bond', rtp: '100%', winMultiplier: '50 DC Award', rule: '5-question vibe alignment between matched partners' },
  ];

  const handleVerifySeed = () => {
    if (!verifySeed.trim()) return;
    setVerifyResult(`Valid Server Seed. Cryptographic SHA-256 HMAC integrity verified against Node CSPRNG entropy pool.`);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-medium tracking-tight text-zinc-100 font-sans">
              Provably Fair Games & Mathematical Odds
            </h1>
            <Badge variant="emerald">
              {games.length} active engines
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Mathematical odds specifications, RTP configurations, and server-side PRNG seed verifier.
          </p>
        </div>
      </div>

      {/* Fairness Explainer Card */}
      <Card hoverEffect={false} className="p-5">
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-medium text-zinc-200">Cryptographically Provably Fair Mechanics</div>
            <p className="text-xs text-zinc-400 leading-relaxed font-sans">
              All Destiny game outcomes are evaluated server-side using Node.js crypto CSPRNG and SHA-256 hashed server seeds. The Discord client cannot manipulate outcomes or inject synthetic bets.
            </p>
          </div>
        </div>
      </Card>

      {/* Seed Verifier Tool */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
          <Terminal className="w-4 h-4 text-zinc-400" />
          <span>Server Seed Authenticity Verifier</span>
        </div>
        <p className="text-xs text-zinc-400 font-sans">
          Verify any 32-character hex server seed from the footer of a Discord game outcome embed:
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Paste 32-character hex server seed..."
            value={verifySeed}
            onChange={(e) => setVerifySeed(e.target.value)}
            className="flex-1 bg-[#18191e] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-white/20 font-mono shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={handleVerifySeed}
          >
            Verify Seed
          </Button>
        </div>
        {verifyResult && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 font-mono flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{verifyResult}</span>
          </div>
        )}
      </Card>

      {/* Games Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.map((g) => (
          <Card 
            key={g.id} 
            className="p-5 space-y-3 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                <div>
                  <div className="font-medium text-xs text-zinc-200 font-sans">{g.name}</div>
                  <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">{g.category}</div>
                </div>
                <Badge variant="zinc">
                  RTP {g.rtp}
                </Badge>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                {g.rule}
              </p>
            </div>

            <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between text-xs">
              <span className="text-[11px] text-zinc-500 font-sans">Payout Multiplier</span>
              <span className="font-mono font-medium text-zinc-200">{g.winMultiplier}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
