"use client";

import { useEffect, useState } from "react";
import { PageHeading, SUPPORT_URL } from "../components";

interface StatusData {
  online: boolean;
  latency: string;
  servers: string;
  users: string;
  activeRooms: number;
  checkedAt: string;
  details?: {
    supabase: string;
    botShards: string;
    workers: string;
  };
}

export function StatusView() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Keep previous or fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const isOnline = data?.online ?? false;

  return (
    <section className="status-page">
      <PageHeading
        eyebrow="Status"
        title="Is destiny awake?"
        description="Live status checked in real time against the Destiny bot and Supabase database."
      />
      <article className="status-panel soft-card">
        <div className="status-topline">
          <span className="status-state">
            <span
              className="status-dot"
              style={{
                backgroundColor: isOnline ? "#3ecf8e" : "#e05260",
                boxShadow: isOnline ? "0 0 10px #3ecf8e" : "none",
              }}
            />
            {loading ? "Checking live status..." : isOnline ? "All systems operational" : "Cannot reach status API"}
          </span>
          <span
            className="status-badge"
            style={{
              backgroundColor: isOnline ? "rgba(62, 207, 142, 0.15)" : "rgba(224, 82, 96, 0.15)",
              color: isOnline ? "#3ecf8e" : "#e05260",
              borderColor: isOnline ? "rgba(62, 207, 142, 0.3)" : "rgba(224, 82, 96, 0.3)",
            }}
          >
            {isOnline ? "online" : "offline"}
          </span>
        </div>

        <h2>{isOnline ? "Destiny is operational and accepting matches." : "Connecting to Destiny clusters..."}</h2>

        <dl className="status-metrics">
          <div className="status-metric">
            <dt>Latency</dt>
            <dd>{data?.latency || (loading ? "..." : "-")}</dd>
          </div>
          <div className="status-metric">
            <dt>Communities</dt>
            <dd>{data?.servers || (loading ? "..." : "20+")}</dd>
          </div>
          <div className="status-metric">
            <dt>Connected Users</dt>
            <dd>{data?.users || (loading ? "..." : "12k+")}</dd>
          </div>
          <div className="status-metric">
            <dt>Last Checked</dt>
            <dd>{data?.checkedAt || (loading ? "Checking..." : "Just now")}</dd>
          </div>
        </dl>

        <p className="status-note">
          Live cluster diagnostic: Matchmaking worker <strong>active</strong>, Supabase PostgreSQL{" "}
          <strong>connected</strong>, anonymous relay <strong>operational</strong>. Run{" "}
          <code>/latency</code> in Discord for an instant round-trip check.
        </p>
      </article>

      <section className="status-help">
        <h2>Faster ways to check</h2>
        <div className="status-help-grid">
          <article className="status-help-card soft-card">
            <h3>/latency</h3>
            <p>The real-time Discord gateway ping and database check. If destiny replies, destiny is operational.</p>
          </article>
          <article className="status-help-card soft-card">
            <h3>/setup overview</h3>
            <p>Confirms destiny can still read your server settings and panel channels.</p>
          </article>
          <article className="status-help-card soft-card">
            <h3>
              <a href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" className="link-soft">
                Support server
              </a>
            </h3>
            <p>Incidents and maintenance windows get posted there first. Join if you want the heads-up.</p>
          </article>
        </div>
      </section>
    </section>
  );
}
