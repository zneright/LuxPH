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

export function StatusPill({ status }: { status: "Active" | "Suspended" | "PAID" | "PENDING" }) {
  const map = {
    Active: { color: "#4ade80", bg: "rgba(74,222,128,.1)", border: "rgba(74,222,128,.25)", label: "● Active" },
    Suspended: { color: "#f87171", bg: "rgba(248,113,113,.1)", border: "rgba(248,113,113,.25)", label: "✕ Suspended" },
    PAID: { color: "#4ade80", bg: "rgba(74,222,128,.1)", border: "rgba(74,222,128,.25)", label: "● PAID" },
    PENDING: { color: "#a78bfa", bg: "rgba(167,139,250,.1)", border: "rgba(167,139,250,.25)", label: "◎ PENDING" },
  }[status];
  return <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: map.color, background: map.bg, border: `1px solid ${map.border}`, padding: "3px 10px", borderRadius: 20 }}>{map.label}</span>;
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