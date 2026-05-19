import React from 'react';

export function StatCard({ label, value, sub, accent = "#7c3aed" }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 12, padding: "20px 22px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: accent, opacity: .7 }} />
      <div style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#6b7280", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: "-.02em", fontFamily: "'Nunito', sans-serif" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }} dangerouslySetInnerHTML={{ __html: sub }} />
    </div>
  );
}