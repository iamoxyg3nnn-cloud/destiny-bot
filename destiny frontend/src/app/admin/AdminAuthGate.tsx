"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/admin/auth");
      if (res.ok) {
        const json = await res.json();
        setAuthorized(Boolean(json.authenticated));
      } else {
        setAuthorized(false);
      }
    } catch {
      setAuthorized(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;

    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyInput.trim() }),
      });

      if (res.ok) {
        setAuthorized(true);
        setKeyInput("");
      } else {
        const json = await res.json().catch(() => ({}));
        setErrorMsg(json.error || "Authentication failed. Invalid staff key.");
      }
    } catch {
      setErrorMsg("Network error connecting to auth service.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" }).catch(() => {});
    setAuthorized(false);
  };

  if (authorized === null) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#0b050d", display: "flex", alignItems: "center", justifyContent: "center", color: "#f7eef3" }}>
        <p style={{ opacity: 0.7 }}>Checking staff authorization...</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#0b050d", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
        <div
          style={{
            maxWidth: "420px",
            width: "100%",
            backgroundColor: "#160b1b",
            border: "1px solid rgba(254, 105, 142, 0.25)",
            borderRadius: "16px",
            padding: "2.5rem 2rem",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔒</div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, color: "#fff", marginBottom: "0.5rem" }}>
            Destiny Staff Console
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#b9a6b1", marginBottom: "1.8rem", lineHeight: 1.5 }}>
            Access to user reports, moderation actions, and cluster state requires staff passkey authorization.
          </p>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Enter Staff Passkey..."
              required
              style={{
                width: "100%",
                padding: "0.8rem 1rem",
                borderRadius: "8px",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                backgroundColor: "rgba(0, 0, 0, 0.35)",
                color: "#fff",
                fontSize: "0.95rem",
                outline: "none",
              }}
            />

            {errorMsg && (
              <p style={{ color: "#ff5e7e", fontSize: "0.8rem", textAlign: "left", margin: 0 }}>
                ⚠️ {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "0.8rem",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "#fe698e",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor: loading ? "wait" : "pointer",
                transition: "opacity 0.2s",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Authenticating..." : "Unlock Admin Desk"}
            </button>
          </form>

          <div style={{ marginTop: "2rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "1rem" }}>
            <Link href="/" style={{ color: "#f47298", fontSize: "0.85rem", textDecoration: "none" }}>
              ← Return to Public Website
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell" style={{ minHeight: "100vh", backgroundColor: "#0b050d", color: "#f7eef3" }}>
      <header
        style={{
          borderBottom: "1px solid rgba(254, 105, 142, 0.2)",
          padding: "1rem 2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backdropFilter: "blur(12px)",
          backgroundColor: "rgba(18, 9, 21, 0.8)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <Link href="/admin" style={{ display: "flex", alignItems: "center", gap: "0.6rem", textDecoration: "none", color: "#fff", fontWeight: 700, fontSize: "1.1rem" }}>
            <span style={{ fontSize: "1.3rem" }}>🌌</span>
            <span>Destiny Admin Desk</span>
          </Link>
          <nav style={{ display: "flex", gap: "1rem", marginLeft: "1rem" }}>
            <Link
              href="/admin"
              style={{
                color: "#f7eef3",
                textDecoration: "none",
                fontSize: "0.9rem",
                padding: "0.4rem 0.8rem",
                borderRadius: "6px",
                backgroundColor: pathname === "/admin" ? "rgba(255, 78, 167, 0.2)" : "rgba(255, 255, 255, 0.05)",
                border: pathname === "/admin" ? "1px solid rgba(255, 78, 167, 0.4)" : "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              Overview
            </Link>
            <Link
              href="/admin/reports"
              style={{
                color: "#e8cfd8",
                textDecoration: "none",
                fontSize: "0.9rem",
                padding: "0.4rem 0.8rem",
                borderRadius: "6px",
                backgroundColor: pathname === "/admin/reports" ? "rgba(255, 78, 167, 0.2)" : "rgba(255, 255, 255, 0.05)",
                border: pathname === "/admin/reports" ? "1px solid rgba(255, 78, 167, 0.4)" : "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              Reports Triage
            </Link>
            <Link
              href="/admin/users"
              style={{
                color: "#e8cfd8",
                textDecoration: "none",
                fontSize: "0.9rem",
                padding: "0.4rem 0.8rem",
                borderRadius: "6px",
                backgroundColor: pathname === "/admin/users" ? "rgba(255, 78, 167, 0.2)" : "rgba(255, 255, 255, 0.05)",
                border: pathname === "/admin/users" ? "1px solid rgba(255, 78, 167, 0.4)" : "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              User Lookup
            </Link>
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "0.85rem", color: "#3ecf8e", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#3ecf8e", boxShadow: "0 0 8px #3ecf8e" }} />
            Staff Authorization Active
          </span>
          <button
            onClick={handleLogout}
            style={{
              fontSize: "0.85rem",
              color: "#e8cfd8",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              padding: "0.3rem 0.7rem",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Lock
          </button>
          <Link
            href="/"
            style={{
              fontSize: "0.85rem",
              color: "#f47298",
              textDecoration: "none",
              padding: "0.3rem 0.7rem",
              borderRadius: "4px",
              border: "1px solid rgba(244, 114, 152, 0.3)",
            }}
          >
            ← Public Site
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: "1280px", margin: "0 auto", padding: "2.5rem 1.5rem" }}>
        {children}
      </main>
    </div>
  );
}
