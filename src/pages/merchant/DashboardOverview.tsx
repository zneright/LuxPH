import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { Horizon } from "@stellar/stellar-sdk";

import { StatCard } from "../../components/dashboard/StatCard";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import { AnimatePresence } from "framer-motion";

interface RecentTx {
  id: string;
  type: "Received" | "Sent" | "Cashout";
  reference: string;
  fiatAmount: number;
  cryptoAmount: string;
  token: string;
  status: string;
  timestamp: number;
}

export default function DashboardOverview() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  const [merchantName, setMerchantName] = useState("Merchant");
  const [merchantAddress, setMerchantAddress] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [limitAmount, setLimitAmount] = useState(5000);

  const [todaysRevenue, setTodaysRevenue] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [monthlyVolume, setMonthlyVolume] = useState(0);
  const [recentTx, setRecentTx] = useState<RecentTx[]>([]);

  const [chartData, setChartData] = useState({ labels: [] as string[], values: [] as number[], max: 0 });

  const [phpcBalance, setPhpcBalance] = useState("0.00");
  const [usdcBalance, setUsdcBalance] = useState("0.00");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsLoading(true);
        try {
          const configSnap = await getDoc(doc(db, "system_config", "global"));
          let horizonUrl = "https://horizon-testnet.stellar.org";
          let globalFreeCap = 100000;

          if (configSnap.exists()) {
            const systemConfig = configSnap.data();
            globalFreeCap = systemConfig.freeTierMonthlyCap || 100000;
            if (systemConfig.stellarNetwork === "Mainnet (Public)") {
              horizonUrl = "https://horizon.stellar.org";
            }
          }

          const merchantDoc = await getDoc(doc(db, "merchants", user.uid));
          if (merchantDoc.exists()) {
            const data = merchantDoc.data();
            setMerchantName(data.businessName || "Merchant");
            setIsSubscribed(data.isSubscribed === true);
            setLimitAmount(data.isSubscribed ? Infinity : globalFreeCap);

            if (data.stellarPublicKey) {
              setMerchantAddress(data.stellarPublicKey);
              fetchStellarBalances(data.stellarPublicKey, horizonUrl);
            }
          }

          const now = new Date();
          const todayStr = now.toDateString();
          const last7DaysStrings = Array.from({ length: 7 }).map((_, i) => {
            const d = new Date();
            d.setDate(now.getDate() - (6 - i));
            return d.toDateString();
          });

          let dailyTotals = [0, 0, 0, 0, 0, 0, 0];
          let monthVol = 0;
          let todayRev = 0;
          let paid = 0;
          const allTx: RecentTx[] = [];

          const invRef = collection(db, `merchants/${user.uid}/invoices`);
          const payRef = collection(db, `merchants/${user.uid}/payments`);
          const cashRef = collection(db, `merchants/${user.uid}/cashouts`);

          const [invSnap, paySnap, cashSnap] = await Promise.all([
            getDocs(invRef).catch(() => ({ forEach: () => { } })),
            getDocs(payRef).catch(() => ({ forEach: () => { } })),
            getDocs(cashRef).catch(() => ({ forEach: () => { } }))
          ]);

          invSnap.forEach((docSnap: any) => {
            const data = docSnap.data();
            const time = data.timestamp ? new Date(data.timestamp).getTime() : 0;
            const fiatAmt = parseFloat(data.fiatAmount || data.amountPHP || data.amount || "0");
            const status = data.status || "PAID";
            const isSuccess = status.toUpperCase() === "PAID" || status.toUpperCase() === "SUCCESS";

            if (isSuccess && data.timestamp) {
              paid++;
              const txDate = new Date(data.timestamp);
              const txDateString = txDate.toDateString();

              if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
                monthVol += fiatAmt;
              }
              if (txDateString === todayStr) {
                todayRev += fiatAmt;
              }
              const dayIndex = last7DaysStrings.indexOf(txDateString);
              if (dayIndex !== -1) {
                dailyTotals[dayIndex] += fiatAmt;
              }
            }

            allTx.push({
              id: docSnap.id,
              type: "Received",
              reference: data.invoiceId || data.memo || docSnap.id,
              fiatAmount: fiatAmt,
              cryptoAmount: String(data.amount || "0"),
              token: data.token || "Unknown",
              status: status,
              timestamp: time
            });
          });

          paySnap.forEach((docSnap: any) => {
            const data = docSnap.data();
            const time = data.timestamp ? new Date(data.timestamp).getTime() : 0;
            const fiatAmt = parseFloat(data.amountFiat || data.fiatAmount || "0");
            const status = data.status || "COMPLETED";
            const isSuccess = status.toUpperCase() === "COMPLETED" || status.toUpperCase() === "SUCCESS";

            if (isSuccess && data.timestamp) {
              const txDate = new Date(data.timestamp);
              if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
                monthVol += fiatAmt;
              }
            }

            allTx.push({
              id: docSnap.id,
              type: "Sent",
              reference: data.paymentId || docSnap.id,
              fiatAmount: fiatAmt,
              cryptoAmount: String(data.amountToken || data.amount || "0"),
              token: data.token || "Unknown",
              status: status,
              timestamp: time
            });
          });

          cashSnap.forEach((docSnap: any) => {
            const data = docSnap.data();
            const time = data.timestamp ? new Date(data.timestamp).getTime() : 0;

            allTx.push({
              id: docSnap.id,
              type: "Cashout",
              reference: data.cashoutId || docSnap.id,
              fiatAmount: 0,
              cryptoAmount: String(data.amountToken || data.amount || "0"),
              token: data.token || "Unknown",
              status: data.status || "PROCESSING",
              timestamp: time
            });
          });

          allTx.sort((a, b) => b.timestamp - a.timestamp);

          setMonthlyVolume(monthVol);
          setTodaysRevenue(todayRev);
          setPaidCount(paid);
          setRecentTx(allTx.slice(0, 4));

          const maxVal = Math.max(...dailyTotals, 1);
          setChartData({
            labels: last7DaysStrings.map(d => new Date(d).toLocaleDateString('en-US', { weekday: 'short' })),
            values: dailyTotals,
            max: maxVal
          });

        } catch (error) {
          console.error("Dashboard Sync Error:", error);
        }
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchStellarBalances = async (pubKey: string, endpoint: string) => {
    try {
      const server = new Horizon.Server(endpoint);
      const account = await server.loadAccount(pubKey);

      let phpc = "0.00";
      let usdc = "0.00";

      account.balances.forEach((balance: any) => {
        if (balance.asset_code === "PHPC") phpc = parseFloat(balance.balance).toFixed(2);
        if (balance.asset_code === "USDC") usdc = parseFloat(balance.balance).toFixed(2);
      });

      setPhpcBalance(phpc);
      setUsdcBalance(usdc);
    } catch (err) {
      console.error("Failed to fetch stellar balances:", err);
    }
  };

  const formatTimeAgo = (ts: number) => {
    if (!ts) return "N/A";
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const renderStatus = (status: string) => {
    const s = (status || "").toUpperCase();
    let bg = "rgba(107, 114, 128, 0.1)";
    let color = "#9ca3af";

    if (s.includes("SUCCESS") || s === "PAID" || s === "COMPLETED") {
      bg = "rgba(16, 185, 129, 0.1)"; color = "#10b981";
    } else if (s.includes("FAIL") || s.includes("CANCEL") || s === "EXPIRED") {
      bg = "rgba(239, 68, 68, 0.1)"; color = "#ef4444";
    } else if (s.includes("PROCESS") || s === "PENDING" || s === "LISTENING") {
      bg = "rgba(245, 158, 11, 0.1)"; color = "#f59e0b";
    }

    return (
      <span style={{ background: bg, color: color, padding: "4px 8px", borderRadius: 4, fontSize: 10, fontWeight: "bold", fontFamily: "'DM Mono',monospace" }}>
        {s.replace(/_/g, " ")}
      </span>
    );
  };

  const usagePercentage = isSubscribed ? 100 : Math.min((monthlyVolume / limitAmount) * 100, 100);

  return (
    <div style={{ position: "relative", minHeight: "80vh", padding: "4px", boxSizing: "border-box" }}>
      <style>{`
        .dash-cards-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
        .dash-split-sections { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
        .dash-table-container { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .dash-table { width: 100%; border-collapse: collapse; min-width: 500px; }
        .dash-wallet-banner { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 16px 22px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
        .dash-wallet-balances { flex: 1; border-left: 1px solid rgba(255,255,255,.07); padding-left: 24px; display: flex; gap: 32px; }

        @media (max-width: 1024px) {
          .dash-cards-grid { grid-template-columns: repeat(2, 1fr); }
          .dash-split-sections { grid-template-columns: 1fr; }
        }
        @media (max-width: 640px) {
          .dash-cards-grid { grid-template-columns: 1fr; }
          .dash-wallet-banner { flex-direction: column; align-items: flex-start; gap: 16px; }
          .dash-wallet-balances { border-left: none; padding-left: 0; gap: 20px; width: 100%; justify-content: space-between; }
          .dash-wallet-banner button { width: 100%; text-align: center; }
        }
      `}</style>

      <AnimatePresence>
        {isLoading && <LoadingOverlay isLoading={isLoading} message="Syncing ledger & dashboard data..." />}
      </AnimatePresence>

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito', sans-serif", color: "#fff", marginBottom: 4 }}>
          Good afternoon, {merchantName.split(" ")[0]}
        </h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>Here's your store overview for today</p>
      </div>

      <div className="dash-cards-grid">
        <StatCard label="Today's Revenue" value={`₱${todaysRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub='Live from ledger' accent="#7c3aed" />
        <StatCard label="Paid Invoices" value={paidCount.toString()} sub='Total lifetime processed' accent="#4ade80" />
        <StatCard label="Monthly Volume" value={`₱${monthlyVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={isSubscribed ? "Unlimited Tier" : "Standard Tier"} accent="#60a5fa" />
        <StatCard label="Fees Saved" value={`₱${(monthlyVolume * 0.025).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub="vs 2.5% traditional fee" accent="#7c3aed" />
      </div>

      <div className="dash-split-sections">
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>Recent Transactions</span>
            <span onClick={() => navigate("/merchant/invoices")} style={{ fontSize: 12, color: "#7c3aed", cursor: "pointer", fontWeight: 500 }}>View all →</span>
          </div>
          <div className="dash-table-container">
            <table className="dash-table">
              <thead>
                <tr>{["Type", "Reference", "Amount", "Status", "Time"].map(h => (
                  <th key={h} style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".06em", textTransform: "uppercase", padding: "10px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.05)" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {recentTx.length > 0 ? (
                  recentTx.map((tx, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          color: tx.type === 'Received' ? '#10b981' : tx.type === 'Sent' ? '#ef4444' : '#60a5fa',
                          background: tx.type === 'Received' ? 'rgba(16, 185, 129, 0.1)' : tx.type === 'Sent' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                          padding: '4px 6px', borderRadius: 4, fontSize: 10, fontWeight: 'bold'
                        }}>
                          {tx.type === 'Received' ? 'IN' : tx.type === 'Sent' ? 'OUT' : 'CASH'}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#9ca3af" }}>{tx.reference.substring(0, 12)}</td>
                      <td style={{ padding: "12px 16px", fontWeight: 600, color: "#fff", fontSize: 12 }}>
                        {tx.fiatAmount > 0
                          ? `₱${tx.fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : `${parseFloat(tx.cryptoAmount).toLocaleString()} ${tx.token}`}
                      </td>
                      <td style={{ padding: "12px 16px" }}>{renderStatus(tx.status)}</td>
                      <td style={{ padding: "12px 16px", fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap" }}>{formatTimeAgo(tx.timestamp)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#6b7280", fontSize: 12 }}>No transactions yet. Complete an action to see it here!</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb", marginBottom: 14 }}>7-Day Revenue Trend</div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 80, marginBottom: 6 }}>
            {chartData.values.map((val, i) => {
              const heightPct = chartData.max > 0 ? Math.max((val / chartData.max) * 100, 2) : 2;
              return (
                <div
                  key={i}
                  title={`₱${val.toLocaleString()}`}
                  style={{ flex: 1, borderRadius: "3px 3px 0 0", height: `${heightPct}%`, background: i === 6 ? "#7c3aed" : "rgba(124,58,237,.3)", transition: "height 0.5s ease" }}
                />
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b7280", fontFamily: "'DM Mono',monospace" }}>
            {chartData.labels.map((day, idx) => (
              <span key={idx} style={{ color: idx === 6 ? "#e5e7eb" : "inherit" }}>
                {idx === 6 ? "Today" : day}
              </span>
            ))}
          </div>

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em" }}>Monthly Tier Limit</div>
              <div style={{ fontSize: 10, color: isSubscribed ? "#10b981" : "#a78bfa", fontWeight: 700, textTransform: "uppercase" }}>{isSubscribed ? "Pro" : "Standard"}</div>
            </div>
            <div style={{ background: "rgba(255,255,255,.07)", borderRadius: 4, height: 6, overflow: "hidden", marginBottom: 6 }}>
              <div style={{ width: `${usagePercentage}%`, height: "100%", background: isSubscribed ? "#10b981" : "linear-gradient(90deg,#7c3aed,#a78bfa)", borderRadius: 4, transition: "width 0.5s ease" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af" }}>
              <span>₱{monthlyVolume.toLocaleString()} used</span>
              <span style={{ color: isSubscribed ? "#10b981" : "#a78bfa" }}>
                {isSubscribed ? "Unlimited" : `₱${limitAmount.toLocaleString()} Limit`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-wallet-banner">
        <div>
          <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Connected Stellar Ledger</div>
          <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#9ca3af" }}>
            {merchantAddress ? `${merchantAddress.substring(0, 10)}...${merchantAddress.slice(-6)}` : "Wallet Not Connected"}
          </div>
        </div>
        <div className="dash-wallet-balances">
          <div>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>PHPC Balance</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#a78bfa" }}>
              {merchantAddress ? phpcBalance : "0.00"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>USDC Balance</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#9ca3af" }}>
              {merchantAddress ? usdcBalance : "0.00"}
            </div>
          </div>
        </div>
        <button onClick={() => navigate("/merchant/cashout")} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Nunito',sans-serif", flexShrink: 0 }}>
          Cash Out →
        </button>
      </div>
    </div>
  );
}