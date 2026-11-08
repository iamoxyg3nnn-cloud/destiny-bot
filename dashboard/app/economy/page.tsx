'use client';

import React, { useState, useEffect } from 'react';
import { Coins, RefreshCw, ShoppingBag, ArrowDownRight, ArrowUpRight, DollarSign, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EmptyState } from '../../components/ui/empty-state';

export default function EconomyPage() {
  const [data, setData] = useState<any>({ transactions: [], shopItems: [], faucetSinkData: [] });
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState('');

  const fetchEconomy = async () => {
    try {
      const res = await fetch('/api/economy', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastSync(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to fetch real economy data:', err);
    }
  };

  useEffect(() => {
    fetchEconomy();
    const interval = setInterval(fetchEconomy, 3000);
    return () => clearInterval(interval);
  }, []);

  const faucetSinkData = data.faucetSinkData && data.faucetSinkData.length > 0
    ? data.faucetSinkData
    : [
        { category: 'Daily Streak', faucet: 0, sink: 0 },
        { category: 'Games', faucet: 0, sink: 0 },
        { category: 'Shop Items', faucet: 0, sink: 0 },
        { category: 'Adjustments', faucet: 0, sink: 0 },
      ];

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-medium tracking-tight text-zinc-100 font-sans">
              Economy & Destiny Coins (DC) Ledger
            </h1>
            <Badge variant="amber" dot>
              Idempotent Ledger
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time audit log of currency minting, burning, and cosmetic shop offerings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => { setLoading(true); fetchEconomy().finally(() => setLoading(false)); }}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Poll Now</span>
          </Button>
        </div>
      </div>

      {/* Faucet vs Sink Distribution Visualizer */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Currency Circulation: Faucet vs Sink</CardTitle>
            <CardDescription>Total coins minted into circulation versus coins burned in games and shop</CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <Badge variant="emerald" dot>Minted (Faucet)</Badge>
            <Badge variant="rose" dot>Burned (Sink)</Badge>
          </div>
        </CardHeader>

        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={faucetSinkData}>
                <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="category" stroke="#71717a" fontSize={11} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#18191e', 
                    borderColor: 'rgba(255,255,255,0.12)', 
                    borderRadius: '8px', 
                    fontSize: '11px',
                    color: '#f4f4f5',
                    fontFamily: 'monospace'
                  }} 
                />
                <Bar dataKey="faucet" name="Minted (DC)" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="sink" name="Burned (DC)" fill="#f43f5e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Real Transactions Ledger */}
        <Card>
          <CardHeader>
            <CardTitle>Live Idempotent Transaction Stream</CardTitle>
            <CardDescription>Permanent records stored in Supabase coin_transactions</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(!data.transactions || data.transactions.length === 0) ? (
                <EmptyState
                  icon={Coins}
                  title="No Transactions Recorded"
                  description="When users claim daily streaks or play games in Discord, transactions stream here."
                />
              ) : (
                data.transactions.map((tx: any) => (
                  <div key={tx.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-zinc-200 capitalize font-sans">{tx.type?.replace('_', ' ')}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{tx.referenceId}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-medium tabular-nums ${tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} DC
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleTimeString() : ''}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live Shop Catalog */}
        <Card>
          <CardHeader>
            <CardTitle>Cosmetic Shop Catalog</CardTitle>
            <CardDescription>Active profile cosmetics available in Discord /shop</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(!data.shopItems || data.shopItems.length === 0) ? (
                <EmptyState
                  icon={ShoppingBag}
                  title="No Cosmetic Items In Stock"
                  description="Real cosmetic items added to Supabase will appear here in the shop catalog."
                />
              ) : (
                data.shopItems.map((item: any) => (
                  <div key={item.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-zinc-200 font-sans">{item.name}</div>
                      <div className="text-[11px] text-zinc-500 font-sans">{item.description}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono text-amber-300 font-medium">{item.price} DC</span>
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">{item.category}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
