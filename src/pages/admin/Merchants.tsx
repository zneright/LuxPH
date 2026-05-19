import { TableHead, PlanBadge, StatusPill } from "../../components/admin/AdminUi";

const MERCHANTS = [
  { name: "Juan's Store", email: "juan@luxph.io", plan: "PRO" as const, volume: 68200, invoices: 34, status: "Active" as const, joined: "Jan 2025" },
  { name: "Maria's Boutique", email: "maria@boutique.ph", plan: "FREE" as const, volume: 42100, invoices: 18, status: "Active" as const, joined: "Feb 2025" },
  { name: "Ace Freelance Design", email: "ace@freelance.io", plan: "PRO" as const, volume: 120400, invoices: 57, status: "Active" as const, joined: "Mar 2025" },
  { name: "Rosa Sari-sari", email: "rosa@sarisari.ph", plan: "FREE" as const, volume: 9800, invoices: 6, status: "Suspended" as const, joined: "Apr 2025" },
];

export default function Merchants() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>Merchants</h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>All registered merchants on the platform</p>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "8px 14px", flex: 1, maxWidth: 380 }}>
          <span style={{ color: "#6b7280" }}>⌕</span>
          <input placeholder="Search name, email, address…" style={{ background: "none", border: "none", color: "#e5e7eb", fontSize: 13, outline: "none", flex: 1, fontFamily: "'Nunito',sans-serif" }} />
        </div>
        <button style={{ background: "transparent", color: "#9ca3af", border: "1px solid rgba(255,255,255,.12)", borderRadius: 7, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>Export CSV</button>
      </div>
      <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <TableHead cols={["Merchant","Plan","Monthly Vol.","Invoices","Status","Joined",""]} />
          <tbody>
            {MERCHANTS.map((m, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono',monospace" }}>{m.email}</div>
                </td>
                <td style={{ padding: "14px 16px" }}><PlanBadge plan={m.plan} /></td>
                <td style={{ padding: "14px 16px", fontWeight: 700, color: "#fff", fontSize: 13 }}>₱{m.volume.toLocaleString()}</td>
                <td style={{ padding: "14px 16px", fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#9ca3af" }}>{m.invoices}</td>
                <td style={{ padding: "14px 16px" }}><StatusPill status={m.status} /></td>
                <td style={{ padding: "14px 16px", fontSize: 11, color: "#6b7280" }}>{m.joined}</td>
                <td style={{ padding: "14px 16px" }}>
                  <span style={{ fontSize: 12, color: m.status === "Suspended" ? "#f87171" : "#a78bfa", cursor: "pointer", fontWeight: 600 }}>
                    {m.status === "Suspended" ? "Review" : "Manage"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}