import { KpiCard } from "../../components/admin/AdminUi";

export default function Overview() {
  const bars = [30, 45, 60, 40, 75, 55, 85];
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>Platform Overview</h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Lux PH admin dashboard · Live network data</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
        <KpiCard label="Total Merchants" value="1,284" sub='<span style="color:#4ade80">+42 this week</span>' />
        <KpiCard label="Monthly Volume (PHPC)" value="₱12.4M" sub='<span style="color:#4ade80">↑ 31%</span> vs last month' />
        <KpiCard label="Pro Subscribers" value="318" sub="₱158,682 MRR" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", marginBottom: 12 }}>Transactions Today</div>
          <div style={{ fontSize: 34, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 6 }}>4,821</div>
          <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 18 }}><span style={{ color: "#4ade80" }}>↑ 12%</span> vs yesterday · All finalized on-chain</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 60 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ flex: 1, borderRadius: "3px 3px 0 0", height: `${h}%`, background: i === 6 ? "#7c3aed" : "rgba(124,58,237,.3)" }} />
            ))}
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", marginBottom: 20 }}>Plan Distribution</div>
          {[
            { label: "Free tier", count: "966", pct: 75, color: "#6b7280" },
            { label: "Pro tier", count: "318", pct: 25, color: "#7c3aed" },
          ].map(p => (
            <div key={p.label} style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: "#9ca3af" }}>{p.label}</span>
                <span style={{ color: p.color === "#7c3aed" ? "#a78bfa" : "#fff", fontWeight: 600 }}>{p.count} ({p.pct}%)</span>
              </div>
              <div style={{ background: "rgba(255,255,255,.07)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                <div style={{ width: `${p.pct}%`, height: "100%", background: p.color, borderRadius: 4 }} />
              </div>
            </div>
          ))}

          <div style={{ marginTop: 8, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", marginBottom: 12 }}>Monthly Recurring Revenue</div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#a78bfa" }}>₱158,682</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>318 × ₱499/mo</div>
          </div>
        </div>
      </div>
    </div>
  );
}