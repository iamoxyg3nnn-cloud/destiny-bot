# Destiny Frontend Production Deployment Guide

The Destiny website (`destiny.adore.rest`) is built with Next.js 16 (App Router), React 19, and Tailwind CSS. It connects to the shared Supabase PostgreSQL database for live cluster health metrics (`/status`), admin triage (`/admin`), and live operational analytics.

---

## 1. Environment Variables

Configure the following variables in your production environment (Vercel, Cloudflare, Railway, Fly.io, or Docker):

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project REST endpoint | `https://biqjoimzjljnxhliybcq.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (Server-side only) | `eyJhbGci...` |
| `ADMIN_SECRET_KEY` | Passkey required to unlock the Admin Desk (`/admin`) | `destiny-staff-secret-key-2026` |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | Discord Application ID for invite buttons | `1568212916304617557` |

---

## 2. Deployment Targets

### Option A: Vercel (Recommended)
1. Import the `destiny frontend/` directory as a Next.js project.
2. In Project Settings -> **Environment Variables**, add the four variables above.
3. Deploy. Production URLs automatically support dynamic SSR routes and edge caching.

### Option B: Docker Container (Self-hosted / VPS / Railway)
```bash
cd "destiny frontend"
docker build -t destiny-frontend .
docker run -p 3000:3000 --env-file .env.production destiny-frontend
```

---

## 3. Production Verification
* **Public Site:** Visit `/` and verify the mascot petal canvas and MatchScene animation.
* **Commands Browser:** Visit `/commands` and verify the search filtering and script copying.
* **Cluster Status:** Visit `/status` to confirm real-time latency and server count polling.
* **Staff Desk:** Visit `/admin` to verify that the passkey prompt gates access.
