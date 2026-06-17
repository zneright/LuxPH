import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { Horizon } from "@stellar/stellar-sdk";
import AnimatedLogo from "../../components/AnimatedLogo";
import MonthlyUsageCard from "../../components/dashboard/MonthlyUsageCard";
import {
  ArrowUpRight, Wallet, TrendingUp, Landmark,
  PlusCircle, ArrowRightLeft, Clock, Eye, EyeOff, ShieldCheck, Activity,
  ArrowDownToLine
} from "lucide-react";

interface RecentTx {
  id: string;
  type: "Received" | "Sent" | "Cashout";
  description: string;
  cryptoAmount: string;
  token: string;
  status: string;
  timestamp: number;
}

type TokenAsset = "XLM" | "PHPC" | "USDC";

export default function DashboardOverview() {
  const navigate = useNavigate();
  const [isPro, setIsPro] = useState(false);
  // Default set to XLM
  const [selectedAsset, setSelectedAsset] = useState<TokenAsset>("XLM");
  const [balances, setBalances] = useState<Record<TokenAsset, string>>({ XLM: "0.00", PHPC: "0.00", USDC: "0.00" });
  const [merchantAddress, setMerchantAddress] = useState("");
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [recentActivity, setRecentActivity] = useState<RecentTx[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);

  const [monthlyUsage] = useState(14500);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const merchantDoc = await getDoc(doc(db, "merchants", user.uid));
        if (merchantDoc.exists()) {
          const data = merchantDoc.data();
          setIsPro(data.isSubscribed === true);
          if (data.stellarPublicKey) {
            const pubKey = data.stellarPublicKey;
            setMerchantAddress(pubKey);
            try {
              const server = new Horizon.Server("https://horizon-testnet.stellar.org");
              const account = await server.loadAccount(pubKey);
              const parsedBalances = { XLM: "0.00", PHPC: "0.00", USDC: "0.00" };
              account.balances.forEach((b: any) => {
                const formattedBalance = parseFloat(b.balance).toLocaleString(undefined, { minimumFractionDigits: 2 });
                if (b.asset_type === "native") parsedBalances.XLM = formattedBalance;
                else if (b.asset_code === "PHPC") parsedBalances.PHPC = formattedBalance;
                else if (b.asset_code === "USDC") parsedBalances.USDC = formattedBalance;
              });
              setBalances(parsedBalances);
            } catch (err) { console.error("Stellar Sync Failure:", err); }
          }
        }

        try {
          const activityPool: RecentTx[] = [];
          const invSnap = await getDocs(query(collection(db, `merchants/${user.uid}/invoices`), orderBy("timestamp", "desc"), limit(3)));
          invSnap.forEach(d => {
            const res = d.data();
            activityPool.push({ id: d.id, type: "Received", description: res.description || "QR Ph Payment", cryptoAmount: String(res.amount || "0"), token: res.token || "PHPC", status: res.status || "SUCCESS", timestamp: res.timestamp ? new Date(res.timestamp).getTime() : 0 });
          });
          const cashSnap = await getDocs(query(collection(db, `merchants/${user.uid}/cashouts`), orderBy("timestamp", "desc"), limit(3)));
          cashSnap.forEach(d => {
            const res = d.data();
            activityPool.push({ id: d.id, type: "Cashout", description: `${res.bankName || "Bank Wire"} Outflow`, cryptoAmount: String(res.amountToken || res.amount || "0"), token: res.token || "PHPC", status: res.status || "PENDING", timestamp: res.timestamp ? new Date(res.timestamp).getTime() : 0 });
          });
          activityPool.sort((a, b) => b.timestamp - a.timestamp);
          setRecentActivity(activityPool.slice(0, 3));
        } catch (e) { console.error("Telemetry error:", e); }
        finally { setLoadingActivity(false); }
      }
    });
    return () => unsubscribe();
  }, []);

  const walletBg = isPro
    ? "linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(15,17,34,0.8) 100%)"
    : "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(9,11,20,0.8) 100%)";

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 40, fontFamily: "'Nunito', sans-serif" }}>

      <style>{`
        .master-bento {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          grid-auto-rows: auto;
        }
        
        .bento-tile {
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
          padding: 16px;
          display: flex;
          flex-direction: column;
          height: 100%;
          box-sizing: border-box;
        }

        .bento-interactive:hover {
          transform: translateY(-4px) scale(1.02);
          border-color: rgba(255, 255, 255, 0.15);
          box-shadow: 0 16px 40px -10px rgba(0,0,0,0.5);
        }

        .bento-usage      { grid-column: span 2; }
        
        .bento-withdraw   { grid-column: 1 / 2; grid-row: span 2; padding: 20px !important; }
        .bento-credit     { grid-column: 2 / 3; grid-row: auto; }
        .bento-vault      { grid-column: 2 / 3; grid-row: auto; }
        
        .bento-op-1       { grid-column: span 1; }
        .bento-op-2       { grid-column: span 1; }
        .bento-op-3       { grid-column: span 2; display: flex; flex-direction: row !important; justify-content: flex-start !important; align-items: center; }
        .bento-op-3 span  { text-align: left; margin-left: 12px; }

        .bento-telemetry  { grid-column: span 2; }
        .bento-info       { grid-column: span 2; }

        .mobile-truncate {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      {/* ------------------------------------------------------------- */}
      {/* DESKTOP VIEW: Minimalist Welcome Screen (Hidden on Mobile)    */}
      {/* ------------------------------------------------------------- */}
      <div className="hidden md:flex flex-col items-center justify-center" style={{ minHeight: "75vh", textAlign: "center" }}>
        <AnimatedLogo size={80} isPro={isPro} />
        <h1 style={{ fontSize: 36, fontWeight: 900, color: "#fff", marginTop: 32, letterSpacing: "-1px" }}>
          Welcome to lux<span style={{ color: "#a78bfa" }}>ph</span>
        </h1>
        <p style={{ color: "#9ca3af", fontSize: 16, marginTop: 12, maxWidth: 400, lineHeight: 1.5 }}>
          Your main operational hub. Select an action from the sidebar navigation to begin your session.
        </p>

        <div onClick={() => navigate("/merchant/subscription")} style={{ marginTop: 32, background: "rgba(255,255,255,0.03)", border: isPro ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(255,255,255,0.08)", borderRadius: 99, padding: "10px 24px", fontSize: 12, fontWeight: 800, color: isPro ? "#34d399" : "#9ca3af", fontFamily: "'DM Mono', monospace", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: isPro ? "#22C55E" : "#4b5563" }}>●</span>
          {isPro ? "PRO NODE ACTIVE" : "STANDARD NODE ACTIVE"}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MOBILE VIEW: The Full Bento Grid (Hidden on Desktop)          */}
      {/* ------------------------------------------------------------- */}
      <div className="block md:hidden">
        <div className="master-bento">

          {/* Usage Card */}
          <div className="bento-usage">
            <MonthlyUsageCard monthlyUsage={monthlyUsage} isSubscribed={isPro} usageLimit={100000} projectedUsage={monthlyUsage + 2500} />
          </div>

          {/* LEFT COLUMN: Withdraw Tile (Tall) */}
          <div onClick={() => navigate("/merchant/cashout")} className="bento-tile bento-interactive bento-withdraw" style={{ background: walletBg, justifyContent: "space-between", cursor: "pointer" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ padding: 10, background: "rgba(167,139,250,0.15)", borderRadius: 14 }}>
                  <ArrowDownToLine size={20} color="#c4b5fd" />
                </div>

                {/* RESTORED DROPDOWN HERE */}
                <select
                  value={selectedAsset}
                  onClick={(e) => e.stopPropagation()} // Prevents navigating when clicking the dropdown
                  onChange={(e) => setSelectedAsset(e.target.value as TokenAsset)}
                  style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", color: "#ffffff", fontSize: "11px", fontWeight: 800, fontFamily: "'DM Mono', monospace", padding: "6px 10px", cursor: "pointer", outline: "none", backdropFilter: "blur(5px)" }}
                >
                  <option value="XLM" style={{ background: "#111422" }}>XLM</option>
                  <option value="PHPC" style={{ background: "#111422" }}>PHPC</option>
                  <option value="USDC" style={{ background: "#111422" }}>USDC</option>
                </select>
              </div>

              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, fontFamily: "'DM Mono', monospace", marginBottom: 2, letterSpacing: "0.05em" }}>AVAILABLE</div>

              {/* DYNAMIC BALANCE DISPLAY */}
              <div className="mobile-truncate" style={{ fontSize: "clamp(24px, 5vw, 32px)", fontWeight: 900, color: "#fff", fontFamily: "'DM Mono', monospace", letterSpacing: "-1px", lineHeight: 1.2 }}>
                {selectedAsset === "PHPC" ? "₱" : selectedAsset === "USDC" ? "$" : ""}{balances[selectedAsset]}
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 800, color: "#c4b5fd", display: "inline-flex", alignItems: "center", gap: 6, marginTop: "auto" }}>
              Withdraw <ArrowUpRight size={16} />
            </div>
          </div>

          {/* RIGHT COLUMN: Credit Line (Top Right) */}
          <div className="bento-tile bento-interactive bento-credit" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(0,0,0,0.2) 100%)", border: "1px solid rgba(16,185,129,0.15)", justifyContent: "space-between", cursor: "not-allowed", opacity: 0.8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#34d399" }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.5px" }}>CREDIT</span><TrendingUp size={16} />
            </div>
            <div style={{ marginTop: "auto" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, marginTop: 8 }}>Coming Soon</div>
            </div>
          </div>

          {/* RIGHT COLUMN: Vault Savings (Bottom Right) */}
          <div className="bento-tile bento-interactive bento-vault" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.05) 0%, rgba(0,0,0,0.2) 100%)", border: "1px solid rgba(59,130,246,0.15)", justifyContent: "space-between", cursor: "not-allowed", opacity: 0.8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#60a5fa" }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.5px" }}>SAVINGS</span><Wallet size={16} />
            </div>
            <div style={{ marginTop: "auto" }}>
              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, marginTop: 8 }}>Coming Soon</div>
            </div>
          </div>

          {/* Operation Squares */}
          <div onClick={() => navigate("/merchant/create")} className="bento-tile bento-interactive bento-op-1" style={{ cursor: "pointer", alignItems: "center", gap: 12 }}>
            <div style={{ padding: 14, background: "rgba(167,139,250,0.1)", borderRadius: 16 }}><PlusCircle size={26} color="#a78bfa" /></div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff" }}>Receive</span>
          </div>

          <div onClick={() => navigate("/merchant/send-payment")} className="bento-tile bento-interactive bento-op-2" style={{ cursor: "pointer", alignItems: "center", gap: 12 }}>
            <div style={{ padding: 14, background: "rgba(52,211,153,0.1)", borderRadius: 16 }}><ArrowUpRight size={26} color="#34d399" /></div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff" }}>Send</span>
          </div>

          <div onClick={() => navigate("/merchant/invoices")} className="bento-tile bento-interactive bento-op-3" style={{ cursor: "pointer", alignItems: "center", gap: 12 }}>
            <div style={{ padding: 14, background: "rgba(96,165,250,0.1)", borderRadius: 16 }}><ArrowRightLeft size={26} color="#60a5fa" /></div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff" }}>Audit Records</span>
          </div>

          {/* Telemetry Feed */}
          <div className="bento-tile bento-telemetry">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af", letterSpacing: "1px", textTransform: "uppercase", margin: 0, fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}>
                <Activity size={16} /> Invoices
              </h3>
              <span onClick={() => navigate("/merchant/invoices")} style={{ fontSize: 12, color: "#a78bfa", fontWeight: 800, cursor: "pointer" }}>View All ›</span>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {loadingActivity ? (
                <div style={{ padding: "30px 0", textAlign: "center", fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>Synchronizing ledger streams...</div>
              ) : recentActivity.length === 0 ? (
                <div style={{ padding: "30px 0", textAlign: "center", fontSize: 13, color: "#6b7280", fontStyle: "italic" }}>No active settlements found.</div>
              ) : (
                recentActivity.map((tx, idx) => (
                  <div key={tx.id || idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: idx !== recentActivity.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ background: tx.type === "Received" ? "rgba(52, 211, 153, 0.1)" : "rgba(167, 139, 250, 0.1)", borderRadius: 12, padding: 10 }}>
                        <Clock size={16} color={tx.type === "Received" ? "#34d399" : "#a78bfa"} />
                      </div>
                      <div>
                        <div className="mobile-truncate" style={{ fontSize: 14, fontWeight: 800, color: "#ffffff", maxWidth: "160px" }}>{tx.description}</div>
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{tx.id.substring(0, 10)}...</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 14, fontWeight: 900, fontFamily: "'DM Mono', monospace", color: tx.type === "Received" ? "#34d399" : "#f87171" }}>
                        {tx.type === "Received" ? "+" : "-"}{parseFloat(tx.cryptoAmount).toFixed(1)} {tx.token}
                      </div>
                      <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.06)", color: "#9ca3af", textTransform: "uppercase", fontWeight: 800 }}>
                        {tx.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Info Tile */}
          <div className="bento-tile bento-info" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.05) 0%, rgba(0,0,0,0) 100%)", border: "1px solid rgba(139,92,246,0.15)" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#fff", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ padding: 8, background: "rgba(139,92,246,0.1)", borderRadius: 10 }}><ShieldCheck size={18} color="#a78bfa" /></div>
              Architecture
            </div>
            <p style={{ color: "#9ca3af", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              On-chain metrics, settlement statuses, and liquidity paths are mapped instantly via standard Stellar layer streams.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}