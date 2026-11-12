'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Compass, Lock, Loader2, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.replace('/');
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => ({}));
      setError(data?.error || 'Login failed.');
    } catch {
      setError('Unable to reach the console.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#09090b] px-4 text-zinc-100 antialiased">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-[#111318]">
            <Compass className="h-5 w-5 text-[#FE698E]" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Destiny Administration Console</h1>
          <p className="mt-1 text-sm text-zinc-500">Platform-owner access only. Sign in with an authorized Discord account.</p>
        </div>

        <a
          href="/api/auth/discord"
          className="mb-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#5865F2]/40 bg-[#5865F2]/15 text-sm font-medium text-zinc-100 transition-colors hover:bg-[#5865F2]/25"
        >
          <ShieldCheck className="h-4 w-4" />
          Sign in with Discord
        </a>

        <p className="mb-3 text-center text-[11px] text-zinc-600">
          Only Discord IDs listed in BOT_OWNER_IDS can enter the owner console.
        </p>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-white/[0.08] bg-[#111318] p-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
        >
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-zinc-400">
              Bootstrap password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                className="h-10 w-full rounded-lg border border-white/[0.08] bg-[#0c0d10] pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#FE698E]/50 focus:outline-none"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-[#55081B] bg-[#55081B]/20 px-3 py-2 text-xs text-[#FE698E]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#FE698E] text-sm font-medium text-[#1a0410] transition-colors hover:bg-[#FF4EA7] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Authenticating…' : 'Use bootstrap password'}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-600">
          Each Discord owner is recorded separately in the audit log. Sessions expire after 12 hours.
        </p>
      </div>
    </main>
  );
}
