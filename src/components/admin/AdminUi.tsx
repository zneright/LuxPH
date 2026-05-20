import React from 'react';

export function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "20px 22px" }}>
      <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 300, fontFamily: "'Nunito',sans-serif", color: "#a78bfa" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }} dangerouslySetInnerHTML={{ __html: sub }} />
    </div>
  );
}

export function PlanBadge({ plan }: { plan: "PRO" | "FREE" }) {
  return plan === "PRO"
    ? <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#60a5fa", background: "rgba(96,165,250,.1)", border: "1px solid rgba(96,165,250,.25)", padding: "3px 10px", borderRadius: 20 }}>PRO</span>
    : <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", background: "rgba(107,114,128,.1)", border: "1px solid rgba(107,114,128,.2)", padding: "3px 10px", borderRadius: 20 }}>FREE</span>;
}

export function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr>{cols.map(h => (
        <th key={h} style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)" }}>{h}</th>
      ))}</tr>
    </thead>
  );
}

// ==========================================
// UNBREAKABLE STATUS PILL COMPONENT
// ==========================================

// 1. Define styles using fully lowercase keys for safe matching
const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  // Merchant Statuses
  active: { bg: "rgba(74,222,128,.1)", text: "#4ade80", border: "rgba(74,222,128,.25)", label: "● Active" },
  suspended: { bg: "rgba(248,113,113,.1)", text: "#f87171", border: "rgba(248,113,113,.25)", label: "✕ Suspended" },

  // Transaction Statuses
  completed: { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981", border: "rgba(16, 185, 129, 0.3)", label: "Completed" },
  paid: { bg: "rgba(74,222,128,.1)", text: "#4ade80", border: "rgba(74,222,128,.25)", label: "● PAID" },
  success: { bg: "rgba(16, 185, 129, 0.15)", text: "#10b981", border: "rgba(16, 185, 129, 0.3)", label: "Success" },

  processing_bank_wire: { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6", border: "rgba(59, 130, 246, 0.3)", label: "Processing Wire" },
  pending: { bg: "rgba(167,139,250,.1)", text: "#a78bfa", border: "rgba(167,139,250,.25)", label: "◎ PENDING" },

  failed: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", border: "rgba(239, 68, 68, 0.3)", label: "Failed" },
  cancelled: { bg: "rgba(107, 114, 128, 0.15)", text: "#9ca3af", border: "rgba(107, 114, 128, 0.3)", label: "Cancelled" },
  expired: { bg: "rgba(107, 114, 128, 0.15)", text: "#9ca3af", border: "rgba(107, 114, 128, 0.3)", label: "Expired" },
};

// 2. Unbreakable fallback style
const FALLBACK_STYLE = {
  bg: "rgba(255,255,255,0.1)",
  text: "#9ca3af",
  border: "rgba(255,255,255,0.2)",
  label: "Unknown"
};

// 3. Main Component
export function StatusPill({ status }: { status?: string }) {

  // Safely grab the status, default to "unknown", and force it to lowercase
  const safeStatus = (status || "unknown").toLowerCase();

  // Grab the exact style or default to the unbreakable fallback
  const style = STATUS_STYLES[safeStatus] || FALLBACK_STYLE;

  return (
    <span
      style={{
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        padding: "3px 10px",
        borderRadius: "20px",
        fontSize: "11px",
        fontFamily: "'DM Mono',monospace",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        whiteSpace: "nowrap"
      }}
    >
      {style.label}
    </span>
  );
}