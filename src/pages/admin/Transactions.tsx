// ==========================================
// 1. IMPORTS & TYPES
// ==========================================
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../config/firebase";
import { TableHead, StatusPill } from "../../components/admin/AdminUi";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";
import { motion, AnimatePresence } from "framer-motion";

interface TransactionData {
  id: string;
  hash: string;
  merchant: string;
  type: "INFLOW" | "OUTFLOW" | "CASHOUT";
  amount: number;
  token: string;
  status: string;
  date: Date;
  timeAgo: string;
}

interface KPIStats {
  totalToday: number;
  volumeToday: number;
  avgSize: number;
  failedToday: number;
}

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
// Formats a Date object into a readable "Time Ago" string (e.g., "5m ago")
const formatTimeAgo = (date: Date) => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return `${Math.max(seconds, 0)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ==========================================
// 3. MAIN COMPONENT
// ==========================================
export default function Transactions() {

  // --- STATE MANAGEMENT ---
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [kpis, setKpis] = useState<KPIStats>({ totalToday: 0, volumeToday: 0, avgSize: 0, failedToday: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // ==========================================
  // 4. FIREBASE DATA FETCHING
  // ==========================================
  useEffect(() => {
    const fetchAllTransactions = async () => {
      setIsLoading(true);
      try {
        const merchSnap = await getDocs(collection(db, "merchants"));
        let allTx: TransactionData[] = [];

        // Parallel fetch for all merchants and their 3 subcollections
        const promises = merchSnap.docs.map(async (mDoc) => {
          const merchantName = mDoc.data().businessName || mDoc.data().name || "Unknown Merchant";
          const mId = mDoc.id;

          const [invSnap, paySnap, cashSnap] = await Promise.all([
            getDocs(collection(db, `merchants/${mId}/invoices`)),
            getDocs(collection(db, `merchants/${mId}/payments`)),
            getDocs(collection(db, `merchants/${mId}/cashouts`))
          ]);

          // Standardize parsing logic for all transaction types
          const processTx = (doc: any, type: "INFLOW" | "OUTFLOW" | "CASHOUT") => {
            const d = doc.data();
            if (!d.timestamp) return;

            const date = d.timestamp.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
            const amt = parseFloat(d.fiatAmount || d.amountToken || d.amount || "0");

            // Generate a display hash (use txHash if exists, otherwise slice the document ID)
            const displayHash = d.txHash ? `${d.txHash.substring(0, 6)}...${d.txHash.substring(d.txHash.length - 4)}` : `${doc.id.substring(0, 8)}...`;

            // Standardize Token/Routing display
            let tokenDisplay = d.token || "PHPC";
            if (type === "CASHOUT") tokenDisplay = d.payoutMethod ? d.payoutMethod.toUpperCase() : "BANK";

            allTx.push({
              id: doc.id,
              hash: displayHash,
              merchant: merchantName,
              type: type,
              amount: amt,
              token: tokenDisplay,
              status: d.status || "COMPLETED",
              date: date,
              timeAgo: formatTimeAgo(date)
            });
          };

          invSnap.forEach(doc => processTx(doc, "INFLOW"));
          paySnap.forEach(doc => processTx(doc, "OUTFLOW"));
          cashSnap.forEach(doc => processTx(doc, "CASHOUT"));
        });

        await Promise.all(promises);

        // Sort globally by newest first
        allTx.sort((a, b) => b.date.getTime() - a.date.getTime());
        setTransactions(allTx);

        // Calculate Daily KPIs
        const midnight = new Date();
        midnight.setHours(0, 0, 0, 0);

        let tToday = 0, vToday = 0, fToday = 0;

        allTx.forEach(tx => {
          if (tx.date.getTime() >= midnight.getTime()) {
            if (tx.status.toLowerCase() === "failed" || tx.status.toLowerCase() === "cancelled" || tx.status.toLowerCase() === "expired") {
              fToday++;
            } else {
              tToday++;
              vToday += tx.amount;
            }
          }
        });

        setKpis({
          totalToday: tToday,
          volumeToday: vToday,
          avgSize: tToday > 0 ? vToday / tToday : 0,
          failedToday: fToday
        });

      } catch (error) {
        console.error("Error fetching global transactions:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllTransactions();
  }, []);

  // ==========================================
  // 5. DERIVED STATE & HANDLERS
  // ==========================================

  // Real-time Search Filter
  const filteredTx = useMemo(() => {
    if (!searchTerm) return transactions;
    const lowerSearch = searchTerm.toLowerCase();
    return transactions.filter(tx =>
      tx.merchant.toLowerCase().includes(lowerSearch) ||
      tx.hash.toLowerCase().includes(lowerSearch) ||
      tx.type.toLowerCase().includes(lowerSearch) ||
      tx.status.toLowerCase().includes(lowerSearch)
    );
  }, [transactions, searchTerm]);

  // Format big numbers for KPI Display
  const formatCompact = (num: number) => {
    if (num >= 1000000) return `₱${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `₱${(num / 1000).toFixed(1)}K`;
    return `₱${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  // CSV Export
  const handleExportCSV = () => {
    if (filteredTx.length === 0) return;
    const headers = ["Date", "Tx Hash", "Type", "Merchant", "Amount (PHP)", "Routing/Token", "Status"];
    const rows = filteredTx.map(tx => [
      `"${tx.date.toISOString()}"`,
      `"${tx.id}"`,
      tx.type,
      `"${tx.merchant}"`,
      tx.amount,
      tx.token,
      tx.status
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `LuxPH_Global_Ledger_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==========================================
  // 6. RENDER UI
  // ==========================================
  return (
    <div>

      {/* HEADER SECTION */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>Global Ledger</h1>
          <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>Platform-wide omni-channel transaction log</p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={isLoading || filteredTx.length === 0}
          style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: isLoading ? "wait" : "pointer", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}
        >
          ⬇ Export Ledger
        </button>
      </div>

      {/* KPI GRID SECTION */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Total Today", value: kpis.totalToday.toLocaleString(), accent: "#7c3aed" },
          { label: "Volume Today", value: formatCompact(kpis.volumeToday), accent: "#4ade80" },
          { label: "Avg. Tx Size", value: `₱${kpis.avgSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, accent: "#60a5fa" },
          { label: "Failed / Expired", value: kpis.failedToday.toLocaleString(), accent: "#f87171" },
        ].map(k => (
          <div key={k.label} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: k.accent, opacity: .7 }} />
            <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff" }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* SEARCH BAR */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, maxWidth: 400 }}>
        <span style={{ color: "#6b7280" }}>⌕</span>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search hash, merchant, status, type…"
          style={{ background: "none", border: "none", color: "#e5e7eb", fontSize: 13, outline: "none", flex: 1, fontFamily: "'Nunito',sans-serif" }}
        />
      </div>

      {/* DYNAMIC TABLE SECTION */}
      <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden", minHeight: "400px", position: "relative" }}>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center" }}
            >
              <LoadingBadge text="Synchronizing Global Ledger..." variant="secure" />
            </motion.div>
          ) : filteredTx.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#6b7280", fontSize: 13 }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
              No transactions match "{searchTerm}"
            </motion.div>
          ) : (
            <motion.table
              key="table"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
              style={{ width: "100%", borderCollapse: "collapse" }}
            >
              <TableHead cols={["Tx Hash", "Flow", "Merchant", "Amount", "Token/Gateway", "Status", "Block Time"]} />
              <tbody>
                {filteredTx.map((tx, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <td style={{ padding: "13px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#9ca3af" }}>{tx.hash}</td>
                    <td style={{ padding: "13px 16px" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: "3px 6px", borderRadius: 4, letterSpacing: "0.05em",
                        background: tx.type === "INFLOW" ? "rgba(16,185,129,0.1)" : tx.type === "OUTFLOW" ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.1)",
                        color: tx.type === "INFLOW" ? "#10b981" : tx.type === "OUTFLOW" ? "#f59e0b" : "#3b82f6"
                      }}>
                        {tx.type}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: 13, color: "#e5e7eb", fontWeight: 600 }}>{tx.merchant}</td>
                    <td style={{ padding: "13px 16px", fontWeight: 800, color: "#fff", fontSize: 13, fontFamily: "'DM Mono', monospace" }}>
                      {tx.type === "OUTFLOW" || tx.type === "CASHOUT" ? "-" : "+"}₱{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "13px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#9ca3af", fontWeight: 700 }}>{tx.token}</td>
                    <td style={{ padding: "13px 16px" }}><StatusPill status={tx.status} /></td>
                    <td style={{ padding: "13px 16px", fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{tx.timeAgo}</td>
                  </tr>
                ))}
              </tbody>
            </motion.table>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}