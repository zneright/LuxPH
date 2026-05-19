import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
type AdminPage = "overview" | "merchants" | "transactions" | "config";

interface Merchant {
  name: string;
  email: string;
  plan: "PRO" | "FREE";
  volume: number;
  invoices: number;
  status: "Active" | "Suspended";
  joined: string;
}

// ── Data ───────────────────────────────────────────────────────────────────
const MERCHANTS: Merchant[] = [
  { name: "Juan's Store", email: "juan@luxph.io", plan: "PRO", volume: 68200, invoices: 34, status: "Active", joined: "Jan 2025" },
  { name: "Maria's Boutique", email: "maria@boutique.ph", plan: "FREE", volume: 42100, invoices: 18, status: "Active", joined: "Feb 2025" },
  { name: "Ace Freelance Design", email: "ace@freelance.io", plan: "PRO", volume: 120400, invoices: 57, status: "Active", joined: "Mar 2025" },
  { name: "Rosa Sari-sari", email: "rosa@sarisari.ph", plan: "FREE", volume: 9800, invoices: 6, status: "Suspended", joined: "Apr 2025" },
];

const TRANSACTIONS = [
  { hash: "afc912...3e9d", merchant: "Juan's Store", amount: 2500, token: "PHPC", status: "PAID", time: "5s ago" },
  { hash: "b72e04...12aa", merchant: "Ace Freelance", amount: 8000, token: "USDC", status: "PAID", time: "1m ago" },
  { hash: "dd31fa...009c", merchant: "Maria's Boutique", amount: 1200, token: "PHPC", status: "PAID", time: "3m ago" },
  { hash: "91e3bc...55f7", merchant: "Juan's Store", amount: 450, token: "PHPC", status: "PENDING", time: "8m ago" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "20px 22px" }}>
      <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 300, fontFamily: "'Nunito',sans-serif", color: "#a78bfa" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }} dangerouslySetInnerHTML={{ __html: sub }} />
    </div>
  );
}

function PlanBadge({ plan }: { plan: "PRO" | "FREE" }) {
  return plan === "PRO"
    ? <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#60a5fa", background: "rgba(96,165,250,.1)", border: "1px solid rgba(96,165,250,.25)", padding: "3px 10px", borderRadius: 20 }}>PRO</span>
    : <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", background: "rgba(107,114,128,.1)", border: "1px solid rgba(107,114,128,.2)", padding: "3px 10px", borderRadius: 20 }}>FREE</span>;
}

function StatusPill({ status }: { status: "Active" | "Suspended" | "PAID" | "PENDING" }) {
  const map = {
    Active: { color: "#4ade80", bg: "rgba(74,222,128,.1)", border: "rgba(74,222,128,.25)", label: "● Active" },
    Suspended: { color: "#f87171", bg: "rgba(248,113,113,.1)", border: "rgba(248,113,113,.25)", label: "✕ Suspended" },
    PAID: { color: "#4ade80", bg: "rgba(74,222,128,.1)", border: "rgba(74,222,128,.25)", label: "● PAID" },
    PENDING: { color: "#a78bfa", bg: "rgba(167,139,250,.1)", border: "rgba(167,139,250,.25)", label: "◎ PENDING" },
  }[status];
  return <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", color: map.color, background: map.bg, border: `1px solid ${map.border}`, padding: "3px 10px", borderRadius: 20 }}>{map.label}</span>;
}

function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr>{cols.map(h => (
        <th key={h} style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)" }}>{h}</th>
      ))}</tr>
    </thead>
  );
}

// ── Pages ──────────────────────────────────────────────────────────────────
function Overview() {
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

function Merchants() {
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
          <TableHead cols={["Merchant", "Plan", "Monthly Vol.", "Invoices", "Status", "Joined", ""]} />
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

function Transactions() {
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
          <TableHead cols={["Tx Hash", "Merchant", "Amount", "Token", "Status", "Block Time"]} />
          <tbody>
            {TRANSACTIONS.map((tx, i) => (
              <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                <td style={{ padding: "13px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#6b7280" }}>{tx.hash}</td>
                <td style={{ padding: "13px 16px", fontSize: 13, color: "#e5e7eb", fontWeight: 500 }}>{tx.merchant}</td>
                <td style={{ padding: "13px 16px", fontWeight: 700, color: "#fff", fontSize: 13 }}>₱{tx.amount.toLocaleString()}</td>
                <td style={{ padding: "13px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#6b7280" }}>{tx.token}</td>
                <td style={{ padding: "13px 16px" }}><StatusPill status={tx.status as any} /></td>
                <td style={{ padding: "13px 16px", fontSize: 11, color: "#6b7280" }}>{tx.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlatformConfig() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>Platform Config</h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Global settings for the Lux PH network</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {[
          {
            title: "Tier Limits",
            fields: [
              { label: "Free Tier Monthly Cap (PHPC)", value: "100000", type: "number" },
              { label: "Pro Tier Monthly Fee (₱)", value: "499", type: "number" },
            ],
            select: { label: "Invoice Expiry Default", options: ["30 minutes", "1 hour", "24 hours"] },
          },
          {
            title: "Network",
            fields: [
              { label: "PHPC Issuer Address", value: "GBSTRH...PHPC01", type: "text" },
              { label: "PDAX Anchor URL", value: "https://anchor.pdax.ph", type: "text" },
            ],
            select: { label: "Stellar Network", options: ["Mainnet (Public)", "Testnet (Futurenet)"] },
          },
        ].map(sec => (
          <div key={sec.title} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>{sec.title}</div>
            <div style={{ padding: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{sec.select.label}</div>
                <select style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#fff", fontSize: 13, outline: "none", fontFamily: "'Nunito',sans-serif" }}>
                  {sec.select.options.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              {sec.fields.map(f => (
                <div key={f.label} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{f.label}</div>
                  <input type={f.type} defaultValue={f.value} style={{ width: "100%", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "10px 13px", color: "#e5e7eb", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: f.type === "text" && f.value.includes("...") ? "'DM Mono',monospace" : "'Nunito',sans-serif" }} />
                </div>
              ))}
              <button style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif", marginTop: 6 }}>Save Config</button>
            </div>
          </div>
        ))}
      </div>

      {/* Danger zone */}
      <div style={{ marginTop: 20, background: "rgba(248,113,113,.05)", border: "1px solid rgba(248,113,113,.2)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(248,113,113,.15)", fontSize: 13, fontWeight: 600, color: "#f87171" }}>Danger Zone</div>
        <div style={{ padding: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", marginBottom: 4 }}>Suspend all Free tier merchants</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>This will immediately disable all free merchant accounts.</div>
          </div>
          <button style={{ background: "rgba(248,113,113,.1)", color: "#f87171", border: "1px solid rgba(248,113,113,.3)", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif", flexShrink: 0 }}>Suspend All Free</button>
        </div>
      </div>
    </div>
  );
}

// ── Root Component ─────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [page, setPage] = useState<AdminPage>("overview");

  const navItems = [
    {
      group: "Platform", items: [
        { id: "overview", icon: "⬡", label: "Overview" },
        { id: "merchants", icon: "◳", label: "Merchants" },
        { id: "transactions", icon: "⇌", label: "Transactions" },
      ]
    },
    {
      group: "Config", items: [
        { id: "config", icon: "◎", label: "Platform Config" },
      ]
    },
  ];

  const pages: Record<AdminPage, JSX.Element> = {
    overview: <Overview />,
    merchants: <Merchants />,
    transactions: <Transactions />,
    config: <PlatformConfig />,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080b14", color: "#e5e7eb", fontFamily: "'Nunito', sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Background glows — admin uses a teal accent instead of purple */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: -100, left: -100, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(0,80,60,.35) 0%,transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -120, right: -80, width: 560, height: 560, borderRadius: "50%", background: "radial-gradient(circle,rgba(14,116,144,.2) 0%,transparent 70%)" }} />
      </div>

      {/* Top nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", height: 56, background: "rgba(8,11,20,.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontFamily: "'Nunito',sans-serif", fontWeight: 900, fontSize: 20, color: "#fff", letterSpacing: ".02em" }}>LUX <span style={{ color: "#7c3aed" }}>PH</span></div>
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,.1)" }} />
          <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>Admin Console</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4ade80" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
            Mainnet live
          </div>
          <span style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", background: "rgba(6,182,212,.12)", color: "#67e8f9", border: "1px solid rgba(6,182,212,.25)", padding: "3px 10px", borderRadius: 20, letterSpacing: ".05em" }}>ADMIN</span>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#0e7490,#0369a1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>AD</div>
        </div>
      </nav>

      <div style={{ display: "flex", flex: 1, position: "relative", zIndex: 1 }}>
        {/* Sidebar */}
        <aside style={{ width: 210, background: "rgba(255,255,255,.02)", borderRight: "1px solid rgba(255,255,255,.06)", padding: "24px 0", flexShrink: 0 }}>
          {navItems.map(g => (
            <div key={g.group} style={{ marginBottom: 26 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#4b5563", letterSpacing: ".1em", textTransform: "uppercase", padding: "0 18px", marginBottom: 8 }}>{g.group}</div>
              {g.items.map(item => (
                <div key={item.id} onClick={() => setPage(item.id as AdminPage)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", cursor: "pointer", color: page === item.id ? "#67e8f9" : "#9ca3af", borderLeft: `2px solid ${page === item.id ? "#0e7490" : "transparent"}`, background: page === item.id ? "rgba(14,116,144,.1)" : "transparent", fontSize: 13, fontWeight: page === item.id ? 600 : 400, transition: "all .12s" }}>
                  <span style={{ opacity: page === item.id ? 1 : .6 }}>{item.icon}</span>
                  {item.label}
                </div>
              ))}
            </div>
          ))}

          {/* Stellar network status */}
          <div style={{ margin: "20px 12px 0", background: "rgba(74,222,128,.06)", border: "1px solid rgba(74,222,128,.15)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#4b5563", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Stellar Network</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4ade80", marginBottom: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
              Mainnet · Online
            </div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Ledger #52,841,900</div>
          </div>
        </aside>

        {/* Main */}
        <main style={{ flex: 1, padding: 30, overflowY: "auto" }}>
          {pages[page]}
        </main>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        input::placeholder { color: #4b5563; }
        select option { background: #1a1a2e; color: #e5e7eb; }
      `}</style>
    </div>
  );
}
