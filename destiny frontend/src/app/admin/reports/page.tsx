"use client";

import { useEffect, useState } from "react";

interface Report {
  id: string;
  reporter_id: string;
  reported_id: string;
  room_id?: string;
  category: string;
  description: string;
  chat_excerpt?: Array<{ senderPseudonym: string; content: string; timestamp: string }>;
  status: string;
  action_taken?: string;
  created_at: string;
}

export default function ReportsTriagePage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const fetchReports = (statusFilter = filter) => {
    setLoading(true);
    fetch(`/api/admin/reports?status=${statusFilter}`)
      .then((res) => res.json())
      .then((data) => setReports(data.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReports(filter);
  }, [filter]);

  const handleAction = async (reportId: string, action: string) => {
    setActioningId(reportId);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action, notes: `Resolved from Web Desk: ${action}` }),
      });
      if (res.ok) {
        fetchReports();
      }
    } catch {
      // ignore
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700, margin: 0, color: "#fff" }}>Safety & Reports Triage</h1>
          <p style={{ color: "#c9a8b6", margin: "0.5rem 0 0 0", fontSize: "0.95rem" }}>
            Inspect reported incidents, view message excerpts, and apply moderation actions.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", backgroundColor: "rgba(255, 255, 255, 0.05)", padding: "0.3rem", borderRadius: "8px" }}>
          {["pending", "resolved", "dismissed", "all"].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              style={{
                background: filter === status ? "rgba(254, 105, 142, 0.2)" : "transparent",
                color: filter === status ? "#fff" : "#c9a8b6",
                border: filter === status ? "1px solid rgba(254, 105, 142, 0.4)" : "none",
                padding: "0.35rem 0.8rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                textTransform: "capitalize",
                cursor: "pointer",
              }}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#c9a8b6" }}>Loading reports...</div>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem", borderRadius: "10px", backgroundColor: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🛡️</div>
          <h3 style={{ margin: "0 0 0.5rem 0", color: "#fff" }}>No reports found</h3>
          <p style={{ color: "#c9a8b6", margin: 0, fontSize: "0.9rem" }}>The report queue for &quot;{filter}&quot; is currently completely clear.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
          {reports.map((report) => (
            <article
              key={report.id}
              style={{
                borderRadius: "10px",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "1.5rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", marginBottom: "0.4rem" }}>
                    <span
                      style={{
                        padding: "0.2rem 0.6rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        backgroundColor:
                          report.category === "harassment" || report.category === "underage"
                            ? "rgba(224, 82, 96, 0.2)"
                            : "rgba(254, 105, 142, 0.2)",
                        color:
                          report.category === "harassment" || report.category === "underage"
                            ? "#ff6b7a"
                            : "#fe698e",
                        border: "1px solid rgba(254, 105, 142, 0.3)",
                      }}
                    >
                      {report.category}
                    </span>
                    <span style={{ fontSize: "0.85rem", color: "#c9a8b6" }}>
                      Reported: {new Date(report.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "#e8cfd8" }}>
                    Report ID: <code style={{ color: "#fe698e" }}>{report.id.slice(0, 12)}...</code> • Room Code: <code style={{ color: "#3ecf8e" }}>{report.room_id ? report.room_id.slice(0, 8) : "N/A"}</code>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.6rem" }}>
                  {report.status === "pending" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleAction(report.id, "dismiss")}
                        disabled={actioningId === report.id}
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderRadius: "6px",
                          backgroundColor: "rgba(255, 255, 255, 0.06)",
                          border: "1px solid rgba(255, 255, 255, 0.12)",
                          color: "#c9a8b6",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                        }}
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction(report.id, "temp_ban")}
                        disabled={actioningId === report.id}
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderRadius: "6px",
                          backgroundColor: "rgba(244, 114, 152, 0.15)",
                          border: "1px solid rgba(244, 114, 152, 0.3)",
                          color: "#f47298",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                        }}
                      >
                        Suspend 24h
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAction(report.id, "perma_ban")}
                        disabled={actioningId === report.id}
                        style={{
                          padding: "0.4rem 0.8rem",
                          borderRadius: "6px",
                          backgroundColor: "rgba(224, 82, 96, 0.2)",
                          border: "1px solid rgba(224, 82, 96, 0.4)",
                          color: "#ff6b7a",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                        }}
                      >
                        Permanent Ban
                      </button>
                    </>
                  )}
                  {report.status !== "pending" && (
                    <span
                      style={{
                        padding: "0.3rem 0.7rem",
                        borderRadius: "4px",
                        fontSize: "0.8rem",
                        backgroundColor: report.status === "resolved" ? "rgba(62, 207, 142, 0.15)" : "rgba(255, 255, 255, 0.06)",
                        color: report.status === "resolved" ? "#3ecf8e" : "#c9a8b6",
                      }}
                    >
                      {report.status.toUpperCase()} ({report.action_taken || "none"})
                    </span>
                  )}
                </div>
              </div>

              <div style={{ backgroundColor: "rgba(0, 0, 0, 0.3)", padding: "1rem", borderRadius: "6px", marginBottom: "1rem" }}>
                <strong style={{ fontSize: "0.85rem", color: "#fe698e", display: "block", marginBottom: "0.3rem" }}>Incident Description:</strong>
                <p style={{ margin: 0, fontSize: "0.95rem", color: "#f7eef3" }}>{report.description}</p>
              </div>

              {report.chat_excerpt && report.chat_excerpt.length > 0 && (
                <div>
                  <strong style={{ fontSize: "0.85rem", color: "#c9a8b6", display: "block", marginBottom: "0.5rem" }}>Chat Excerpt (Automated Audit):</strong>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", backgroundColor: "rgba(0, 0, 0, 0.4)", padding: "0.8rem", borderRadius: "6px" }}>
                    {report.chat_excerpt.map((msg, idx) => (
                      <div key={idx} style={{ fontSize: "0.85rem", display: "flex", gap: "0.6rem" }}>
                        <span style={{ color: "#fe698e", fontWeight: 600 }}>{msg.senderPseudonym}:</span>
                        <span style={{ color: "#e8cfd8" }}>{msg.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
