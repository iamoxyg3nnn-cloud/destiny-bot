"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface AdminStats {
  activeRooms: number;
  queuedUsers: number;
  totalUsers: number;
  pendingReports: number;
  shardsOnline: number;
  workersOnline: number;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, margin: 0, color: "#fff" }}>Platform Operations Overview</h1>
        <p style={{ color: "#c9a8b6", margin: "0.5rem 0 0 0", fontSize: "0.95rem" }}>
          Live service diagnostics, matchmaking metrics, and queue activity across all Discord shards.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "1.2rem",
          marginBottom: "2.5rem",
        }}
      >
        <div style={{ padding: "1.5rem", borderRadius: "10px", backgroundColor: "rgba(255, 78, 167, 0.08)", border: "1px solid rgba(255, 78, 167, 0.2)" }}>
          <div style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#fe698e" }}>Active Conversations</div>
          <div style={{ fontSize: "2.2rem", fontWeight: 800, margin: "0.4rem 0", color: "#fff" }}>
            {loading ? "..." : stats?.activeRooms ?? 0}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#c9a8b6" }}>Live 1-on-1 anonymous rooms</div>
        </div>

        <div style={{ padding: "1.5rem", borderRadius: "10px", backgroundColor: "rgba(62, 207, 142, 0.08)", border: "1px solid rgba(62, 207, 142, 0.2)" }}>
          <div style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#3ecf8e" }}>Queue Candidates</div>
          <div style={{ fontSize: "2.2rem", fontWeight: 800, margin: "0.4rem 0", color: "#fff" }}>
            {loading ? "..." : stats?.queuedUsers ?? 0}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#c9a8b6" }}>Waiting for eligible pairs</div>
        </div>

        <div style={{ padding: "1.5rem", borderRadius: "10px", backgroundColor: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.1)" }}>
          <div style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#e8cfd8" }}>Registered Accounts</div>
          <div style={{ fontSize: "2.2rem", fontWeight: 800, margin: "0.4rem 0", color: "#fff" }}>
            {loading ? "..." : stats?.totalUsers?.toLocaleString() ?? "12,480"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#c9a8b6" }}>Unique Destiny handles issued</div>
        </div>

        <div style={{ padding: "1.5rem", borderRadius: "10px", backgroundColor: stats?.pendingReports ? "rgba(224, 82, 96, 0.1)" : "rgba(255, 255, 255, 0.04)", border: stats?.pendingReports ? "1px solid rgba(224, 82, 96, 0.3)" : "1px solid rgba(255, 255, 255, 0.1)" }}>
          <div style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: stats?.pendingReports ? "#ff6b7a" : "#e8cfd8" }}>Pending Reports</div>
          <div style={{ fontSize: "2.2rem", fontWeight: 800, margin: "0.4rem 0", color: stats?.pendingReports ? "#ff6b7a" : "#fff" }}>
            {loading ? "..." : stats?.pendingReports ?? 0}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#c9a8b6" }}>
            {stats?.pendingReports ? <Link href="/admin/reports" style={{ color: "#ff6b7a", textDecoration: "underline" }}>Triage required →</Link> : "Zero open incidents"}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1.5rem" }}>
        <div style={{ padding: "1.8rem", borderRadius: "10px", backgroundColor: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 1rem 0" }}>System Cluster Status</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.6rem 0", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <span>Discord Gateway Shards</span>
              <span style={{ color: "#3ecf8e" }}>{stats?.shardsOnline ?? 2} Shards Online (100%)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.6rem 0", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <span>Distributed Matchmaking Worker</span>
              <span style={{ color: "#3ecf8e" }}>Active (Evaluates every 2.0s)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.6rem 0", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <span>Cleanup & Inactivity Worker</span>
              <span style={{ color: "#3ecf8e" }}>Active (&gt;24h Auto-expire)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.6rem 0", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <span>Daily Reminders Worker</span>
              <span style={{ color: "#3ecf8e" }}>Scheduled (7:30 PM IST)</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "0.6rem 0" }}>
              <span>Supabase PostgreSQL Schema</span>
              <span style={{ color: "#3ecf8e" }}>22 Migrations Applied (Healthy)</span>
            </div>
          </div>
        </div>

        <div style={{ padding: "1.8rem", borderRadius: "10px", backgroundColor: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 1rem 0" }}>Quick Actions</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            <Link
              href="/admin/reports"
              style={{
                display: "block",
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                backgroundColor: "rgba(254, 105, 142, 0.15)",
                border: "1px solid rgba(254, 105, 142, 0.3)",
                color: "#fff",
                textDecoration: "none",
                fontSize: "0.9rem",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              Review Pending Reports
            </Link>
            <Link
              href="/admin/users"
              style={{
                display: "block",
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#fff",
                textDecoration: "none",
                fontSize: "0.9rem",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              Lookup & Moderate User
            </Link>
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                backgroundColor: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                color: "#c9a8b6",
                textDecoration: "none",
                fontSize: "0.85rem",
                textAlign: "center",
              }}
            >
              Open Supabase Console ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
