"use client";

import { useState } from "react";

interface UserProfile {
  id: string;
  discord_user_id: string;
  destiny_id: string;
  age: number;
  gender: string;
  reputation_score: number;
  is_banned: boolean;
  ban_reason?: string;
  created_at: string;
  interests?: string[];
  bio?: string;
}

export default function UserLookupPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleUserAction = async (userId: string, action: string) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      if (res.ok) {
        // Refresh local list
        setUsers((prev) =>
          prev.map((u) => {
            if (u.id === userId) {
              if (action === "ban") return { ...u, is_banned: true, ban_reason: "Banned from admin desk" };
              if (action === "unban") return { ...u, is_banned: false, ban_reason: undefined, reputation_score: 100 };
              if (action === "reset_reputation") return { ...u, reputation_score: 100 };
            }
            return u;
          })
        );
      }
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, margin: 0, color: "#fff" }}>User Moderation & Lookup</h1>
        <p style={{ color: "#c9a8b6", margin: "0.5rem 0 0 0", fontSize: "0.95rem" }}>
          Inspect accounts by Destiny ID, Discord ID, or bio keyword. Manage bans and reputation scores.
        </p>
      </div>

      <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.8rem", marginBottom: "2.5rem" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by Destiny ID (e.g. DESTINY-849201), Discord Snowflake ID, or handle..."
          style={{
            flex: 1,
            padding: "0.8rem 1.2rem",
            borderRadius: "8px",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(254, 105, 142, 0.3)",
            color: "#fff",
            fontSize: "0.95rem",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "0.8rem 1.6rem",
            borderRadius: "8px",
            backgroundColor: "#fe698e",
            color: "#120915",
            fontWeight: 700,
            fontSize: "0.95rem",
            border: "none",
            cursor: "pointer",
          }}
        >
          {loading ? "Searching..." : "Lookup"}
        </button>
      </form>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "#c9a8b6" }}>Searching user records...</div>
      ) : searched && users.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", borderRadius: "10px", backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <p style={{ color: "#c9a8b6", margin: 0 }}>No matching Destiny accounts found for &quot;{query}&quot;.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          {users.map((user) => (
            <article
              key={user.id}
              style={{
                borderRadius: "10px",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: user.is_banned ? "1px solid rgba(224, 82, 96, 0.4)" : "1px solid rgba(255, 255, 255, 0.08)",
                padding: "1.5rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "0.4rem" }}>
                    <h3 style={{ margin: 0, fontSize: "1.2rem", color: "#fff" }}>{user.destiny_id}</h3>
                    <span
                      style={{
                        padding: "0.2rem 0.5rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        backgroundColor: user.is_banned ? "rgba(224, 82, 96, 0.2)" : "rgba(62, 207, 142, 0.15)",
                        color: user.is_banned ? "#ff6b7a" : "#3ecf8e",
                      }}
                    >
                      {user.is_banned ? "BANNED" : "ACTIVE"}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#c9a8b6" }}>
                    Discord Snowflake: <code style={{ color: "#fe698e" }}>{user.discord_user_id}</code> • Registered: {new Date(user.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.6rem" }}>
                  {user.is_banned ? (
                    <button
                      type="button"
                      onClick={() => handleUserAction(user.id, "unban")}
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderRadius: "6px",
                        backgroundColor: "rgba(62, 207, 142, 0.15)",
                        border: "1px solid rgba(62, 207, 142, 0.3)",
                        color: "#3ecf8e",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      Lift Ban
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleUserAction(user.id, "ban")}
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderRadius: "6px",
                        backgroundColor: "rgba(224, 82, 96, 0.2)",
                        border: "1px solid rgba(224, 82, 96, 0.4)",
                        color: "#ff6b7a",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      Ban User
                    </button>
                  )}

                  {user.reputation_score < 100 && (
                    <button
                      type="button"
                      onClick={() => handleUserAction(user.id, "reset_reputation")}
                      style={{
                        padding: "0.4rem 0.8rem",
                        borderRadius: "6px",
                        backgroundColor: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid rgba(255, 255, 255, 0.12)",
                        color: "#e8cfd8",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}
                    >
                      Reset Rep to 100
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.8rem", backgroundColor: "rgba(0, 0, 0, 0.25)", padding: "0.8rem", borderRadius: "6px" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "#c9a8b6" }}>Age</span>
                  <div style={{ fontWeight: 600, color: "#fff" }}>{user.age}+</div>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "#c9a8b6" }}>Gender</span>
                  <div style={{ fontWeight: 600, color: "#fff" }}>{user.gender}</div>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "#c9a8b6" }}>Reputation</span>
                  <div style={{ fontWeight: 600, color: user.reputation_score >= 80 ? "#3ecf8e" : "#ff6b7a" }}>
                    {user.reputation_score} / 100
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "#c9a8b6" }}>Bio</span>
                  <div style={{ fontSize: "0.85rem", color: "#e8cfd8" }}>{user.bio || "—"}</div>
                </div>
              </div>

              {user.is_banned && user.ban_reason && (
                <div style={{ marginTop: "0.8rem", fontSize: "0.85rem", color: "#ff6b7a" }}>
                  <strong>Ban Reason:</strong> {user.ban_reason}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
