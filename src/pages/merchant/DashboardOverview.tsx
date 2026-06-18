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
    ? "linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(255,255,255,1) 100%)"
    : "linear-gradient(135deg, rgba(243,244,246,0.5) 0%, rgba(255,255,255,1) 100%)";

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 40, fontFamily: "'Nunito', sans-serif" }}>

      <style>{`
        /* --- Core Layout --- */
        .master-bento {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          grid-auto-rows: auto;
          padding: 8px; /* Buffer for hover shadows */
        }
        
        /* --- Animation Engine --- */
        @keyframes slideUpFade {
          0% { opacity: 0; transform: translateY(24px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes pulseSoft {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        /* --- Base Tile Styling --- */
        .bento-tile {
          border-radius: 24px;
          background: #ffffff;
          box-shadow: 0 4px 15px -5px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
          padding: 16px;
          display: flex;
          flex-direction: column;
          height: 100%;
          box-sizing: border-box;
          
          /* Entrance Animation Base */
          animation: slideUpFade 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        /* --- Staggered Delays for Cascade Effect --- */
        .bento-usage      { grid-column: span 2; animation-delay: 0.05s; }
        .bento-withdraw   { grid-column: 1 / 2; grid-row: span 2; padding: 20px !important; animation-delay: 0.15s; }
        .bento-credit     { grid-column: 2 / 3; grid-row: auto; animation-delay: 0.20s; }
        .bento-vault      { grid-column: 2 / 3; grid-row: auto; animation-delay: 0.25s; }
        .bento-op-1       { grid-column: span 1; animation-delay: 0.30s; }
        .bento-op-2       { grid-column: span 1; animation-delay: 0.35s; }
        .bento-op-3       { grid-column: span 2; display: flex; flex-direction: row !important; justify-content: flex-start !important; align-items: center; animation-delay: 0.40s; }
        .bento-op-3 span  { text-align: left; margin-left: 12px; }
        .bento-telemetry  { grid-column: span 2; animation-delay: 0.45s; }
        .bento-info       { grid-column: span 2; animation-delay: 0.50s; }

        /* --- Micro-interactions --- */
        .bento-interactive:hover {
          transform: translateY(-4px) scale(1.01);
          box-shadow: 0 20px 35px -8px rgba(0,0,0,0.08), 0 8px 15px -4px rgba(0,0,0,0.03);
        }
        
        /* Click Physics */
        .bento-interactive:active {
          transform: translateY(1px) scale(0.98);
          box-shadow: 0 2px 5px rgba(0,0,0,0.05);
          transition: all 0.1s ease;
        }

        /* --- Transaction Row Hover Effects --- */
        .tx-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 12px;
          margin: 0 -12px; /* Pulls row to edge so hover fills nicely */
          border-radius: 16px;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          border-bottom: 1px solid transparent; /* Replaces strict bottom border */
        }
        .tx-row:hover {
          background: #f9fafb;
          transform: translateX(4px);
        }
        .tx-divider {
          height: 1px;
          background: #f3f4f6;
          margin: 0 4px;
        }

        /* --- Desktop Intro --- */
        .desktop-intro {
          animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .mobile-truncate {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      {/* ------------------------------------------------------------- */}
      {/* DESKTOP VIEW: Minimalist Welcome Screen                       */}
      {/* ------------------------------------------------------------- */}
      <div className="hidden md:flex flex-col items-center justify-center desktop-intro" style={{ minHeight: "75vh", textAlign: "center" }}>
        <AnimatedLogo size={80} isPro={isPro} />
        <h1 style={{ fontSize: 36, fontWeight: 900, color: "#111827", marginTop: 32, letterSpacing: "-1px" }}>
          Welcome to lux<span style={{ color: "#8b5cf6" }}>ph</span>
        </h1>
        <p style={{ color: "#6b7280", fontSize: 16, marginTop: 12, maxWidth: 400, lineHeight: 1.5 }}>
          Your main operational hub. Select an action from the sidebar navigation to begin your session.
        </p>

        <div
          onClick={() => navigate("/merchant/subscription")}
          style={{
            marginTop: 32,
            background: "#ffffff",
            border: isPro ? "1px solid rgba(34,197,94,0.4)" : "1px solid #e5e7eb",
            boxShadow: "0 4px 15px rgba(0,0,0,0.04)",
            borderRadius: 99,
            padding: "10px 24px",
            fontSize: 12,
            fontWeight: 800,
            color: isPro ? "#059669" : "#4b5563",
            fontFamily: "'DM Mono', monospace",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            transition: "all 0.3s ease"
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-2px)"}
          onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}
        >
          <span style={{ color: isPro ? "#10b981" : "#9ca3af" }}>●</span>
          {isPro ? "PRO NODE ACTIVE" : "STANDARD NODE ACTIVE"}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* MOBILE VIEW: The Full Bento Grid                              */}
      {/* ------------------------------------------------------------- */}
      <div className="block md:hidden">
        <div className="master-bento">

          {/* Usage Card */}
          <div className="bento-usage">
            <MonthlyUsageCard monthlyUsage={monthlyUsage} isSubscribed={isPro} usageLimit={100000} projectedUsage={monthlyUsage + 2500} />
          </div>

          {/* LEFT COLUMN: Withdraw Tile (Tall) - Indigo Accent */}
          <div onClick={() => navigate("/merchant/cashout")} className="bento-tile bento-interactive bento-withdraw" style={{ background: walletBg, border: "1px solid #ddd6fe", cursor: "pointer" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ padding: 10, background: "#ede9fe", borderRadius: 14 }}>
                  <ArrowDownToLine size={20} color="#8b5cf6" />
                </div>

                <select
                  value={selectedAsset}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setSelectedAsset(e.target.value as TokenAsset)}
                  style={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: "10px", color: "#111827", fontSize: "11px", fontWeight: 800, fontFamily: "'DM Mono', monospace", padding: "6px 10px", cursor: "pointer", outline: "none", boxShadow: "0 2px 6px rgba(0,0,0,0.04)", transition: "all 0.2s" }}
                >
                  <option value="XLM">XLM</option>
                  <option value="PHPC">PHPC</option>
                  <option value="USDC">USDC</option>
                </select>
              </div>

              <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, fontFamily: "'DM Mono', monospace", marginBottom: 2, letterSpacing: "0.05em" }}>AVAILABLE</div>

              <div className="mobile-truncate" style={{ fontSize: "clamp(24px, 5vw, 32px)", fontWeight: 900, color: "#111827", fontFamily: "'DM Mono', monospace", letterSpacing: "-1px", lineHeight: 1.2 }}>
                {selectedAsset === "PHPC" ? "₱" : selectedAsset === "USDC" ? "$" : ""}{balances[selectedAsset]}
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 800, color: "#7c3aed", display: "inline-flex", alignItems: "center", gap: 6, marginTop: "auto" }}>
              Withdraw <ArrowUpRight size={16} />
            </div>
          </div>

          {/* RIGHT COLUMN: Credit Line */}
          <div className="bento-tile bento-interactive bento-credit" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.03) 0%, #ffffff 100%)", border: "1px solid #a7f3d0", justifyContent: "space-between", cursor: "not-allowed", opacity: 0.9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#059669" }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.5px" }}>CREDIT</span><TrendingUp size={16} />
            </div>
            <div style={{ marginTop: "auto" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, marginTop: 8 }}>Coming Soon</div>
            </div>
          </div>

          {/* RIGHT COLUMN: Vault Savings */}
          <div className="bento-tile bento-interactive bento-vault" style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.03) 0%, #ffffff 100%)", border: "1px solid #bfdbfe", justifyContent: "space-between", cursor: "not-allowed", opacity: 0.9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#2563eb" }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.5px" }}>SAVINGS</span><Wallet size={16} />
            </div>
            <div style={{ marginTop: "auto" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 700, marginTop: 8 }}>Coming Soon</div>
            </div>
          </div>

          {/* Operation Squares */}
          <div onClick={() => navigate("/merchant/create")} className="bento-tile bento-interactive bento-op-1" style={{ cursor: "pointer", alignItems: "center", gap: 12, border: "1px solid #ede9fe" }}>
            <div style={{ padding: 14, background: "#f3e8ff", borderRadius: 16 }}><PlusCircle size={26} color="#8b5cf6" /></div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#1f2937" }}>Receive</span>
          </div>

          <div onClick={() => navigate("/merchant/send-payment")} className="bento-tile bento-interactive bento-op-2" style={{ cursor: "pointer", alignItems: "center", gap: 12, border: "1px solid #d1fae5" }}>
            <div style={{ padding: 14, background: "#d1fae5", borderRadius: 16 }}><ArrowUpRight size={26} color="#10b981" /></div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#1f2937" }}>Send</span>
          </div>

          <div onClick={() => navigate("/merchant/invoices")} className="bento-tile bento-interactive bento-op-3" style={{ cursor: "pointer", alignItems: "center", gap: 12, border: "1px solid #dbeafe" }}>
            <div style={{ padding: 14, background: "#dbeafe", borderRadius: 16 }}><ArrowRightLeft size={26} color="#3b82f6" /></div>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#1f2937" }}>Audit Records</span>
          </div>

          {/* Telemetry Feed */}
          <div className="bento-tile bento-telemetry" style={{ border: "1px solid #f3f4f6" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", letterSpacing: "1px", textTransform: "uppercase", margin: 0, fontFamily: "'DM Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}>
                <Activity size={16} /> Invoices
              </h3>
              <span onClick={() => navigate("/merchant/invoices")} style={{ fontSize: 12, color: "#8b5cf6", fontWeight: 800, cursor: "pointer", padding: "4px 8px", borderRadius: 8, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#f3e8ff"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>View All ›</span>
            </div>

            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
              {loadingActivity ? (
                <div style={{ padding: "30px 0", textAlign: "center", animation: "pulseSoft 2s infinite" }}>
                  <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 700 }}>Syncing ledger...</div>
                </div>
              ) : recentActivity.length === 0 ? (
                <div style={{ padding: "30px 0", textAlign: "center", fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No active settlements found.</div>
              ) : (
                recentActivity.map((tx, idx) => (
                  <React.Fragment key={tx.id || idx}>
                    <div className="tx-row" style={{ cursor: "pointer" }} onClick={() => navigate("/merchant/invoices")}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ background: tx.type === "Received" ? "#d1fae5" : "#f3e8ff", borderRadius: 12, padding: 10, transition: "transform 0.2s" }}>
                          <Clock size={16} color={tx.type === "Received" ? "#10b981" : "#8b5cf6"} />
                        </div>
                        <div>
                          <div className="mobile-truncate" style={{ fontSize: 14, fontWeight: 800, color: "#111827", maxWidth: "160px" }}>{tx.description}</div>
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>{tx.id.substring(0, 10)}...</div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 900, fontFamily: "'DM Mono', monospace", color: tx.type === "Received" ? "#059669" : "#dc2626" }}>
                          {tx.type === "Received" ? "+" : "-"}{parseFloat(tx.cryptoAmount).toFixed(1)} {tx.token}
                        </div>
                        <span style={{ display: "inline-block", marginTop: 4, fontSize: 10, padding: "2px 8px", borderRadius: 6, background: "#f3f4f6", color: "#4b5563", textTransform: "uppercase", fontWeight: 800 }}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                    {/* Render a subtle divider between rows, but not after the last one */}
                    {idx !== recentActivity.length - 1 && <div className="tx-divider" />}
                  </React.Fragment>
                ))
              )}
            </div>
          </div>

          {/* Info Tile */}
          <div className="bento-tile bento-info" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.03) 0%, #ffffff 100%)", border: "1px solid #ddd6fe" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#111827", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ padding: 8, background: "#f3e8ff", borderRadius: 10 }}><ShieldCheck size={18} color="#8b5cf6" /></div>
              Architecture
            </div>
            <p style={{ color: "#4b5563", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
              On-chain metrics, settlement statuses, and liquidity paths are mapped instantly via standard Stellar layer streams.
            </p>
          </div>

        </div>
      </div>
    </div >
  );
}