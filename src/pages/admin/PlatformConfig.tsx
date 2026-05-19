export default function PlatformConfig() {
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
            select: { label: "Invoice Expiry Default", options: ["30 minutes","1 hour","24 hours"] },
          },
          {
            title: "Network",
            fields: [
              { label: "PHPC Issuer Address", value: "GBSTRH...PHPC01", type: "text" },
              { label: "PDAX Anchor URL", value: "https://anchor.pdax.ph", type: "text" },
            ],
            select: { label: "Stellar Network", options: ["Mainnet (Public)","Testnet (Futurenet)"] },
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