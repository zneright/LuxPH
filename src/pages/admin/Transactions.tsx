import { TableHead, StatusPill } from "../../components/admin/AdminUi";

const TRANSACTIONS = [
  { hash: "afc912...3e9d", merchant: "Juan's Store", amount: 2500, token: "PHPC", status: "PAID" as const, time: "5s ago" },
  { hash: "b72e04...12aa", merchant: "Ace Freelance", amount: 8000, token: "USDC", status: "PAID" as const, time: "1m ago" },
  { hash: "dd31fa...009c", merchant: "Maria's Boutique", amount: 1200, token: "PHPC", status: "PAID" as const, time: "3m ago" },
  { hash: "91e3bc...55f7", merchant: "Juan's Store", amount: 450, token: "PHPC", status: "PENDING" as const, time: "8m ago" },
];

export default function Transactions() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>All Transactions</h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Platform-wide on-chain transaction log</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Today", value: "4,821", accent: "#7c3aed" },
          { label: "Volume Today", value: "₱2.4M", accent: "#4ade80" },
          { label: "Avg. Tx Size", value: "₱497", accent: "#60a5fa" },
          { label: "Failed / Expired", value: "38", accent: "#f87171" },
        ].map(k => (
          <div key={k.label} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: k.accent, opacity: .7 }} />
            <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff" }}>{k.value}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <TableHead cols={["Tx Hash","Merchant","Amount","Token","Status","Block Time"]} />
          <tbody>
            {TRANSACTIONS.map((tx, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <td style={{ padding: "13px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#6b7280" }}>{tx.hash}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: "#e5e7eb", fontWeight: 500 }}>{tx.merchant}</td>
                <td style={{ padding: "13px 16px", fontWeight: 700, color: "#fff", fontSize: 13 }}>₱{tx.amount.toLocaleString()}</td>
                <td style={{ padding: "13px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#6b7280" }}>{tx.token}</td>
                <td style={{ padding: "13px 16px" }}><StatusPill status={tx.status} /></td>
                <td style={{ padding: "13px 16px", fontSize: 11, color: "#6b7280" }}>{tx.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}