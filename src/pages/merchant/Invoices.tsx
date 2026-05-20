import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import { AnimatePresence } from "framer-motion";

interface TransactionData {
  id: string;
  type: "Received" | "Sent" | "Cashout";
  reference: string;
  description: string;
  fiatAmount: number;
  cryptoAmount: string;
  token: string;
  status: string;
  date: string;
  timestamp: number;
  txHash?: string;
}

export default function Invoices() {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [explorerBaseUrl, setExplorerBaseUrl] = useState("https://stellar.expert/explorer/testnet/tx/");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsLoading(true);

        try {
          const configSnap = await getDoc(doc(db, "system_config", "global"));
          if (configSnap.exists()) {
            const configData = configSnap.data();
            if (configData.stellarNetwork === "Mainnet (Public)") {
              setExplorerBaseUrl("https://stellar.expert/explorer/public/tx/");
            } else {
              setExplorerBaseUrl("https://stellar.expert/explorer/testnet/tx/");
            }
          }
        } catch (error) {
          console.error("Error fetching system configuration:", error);
        }

        const allTransactions: TransactionData[] = [];

        try {
          const invoicesRef = collection(db, `merchants/${user.uid}/invoices`);
          const invSnap = await getDocs(invoicesRef);
          invSnap.forEach((docSnap) => {
            const data = docSnap.data();
            allTransactions.push({
              id: docSnap.id,
              type: "Received",
              reference: data.invoiceId || data.memo || docSnap.id,
              description: data.description || "N/A",
              fiatAmount: parseFloat(data.fiatAmount || data.amountPHP || "0"),
              cryptoAmount: String(data.amount || "0"),
              token: data.token || "Unknown",
              status: data.status || "PAID",
              date: data.timestamp ? new Date(data.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A",
              timestamp: data.timestamp ? new Date(data.timestamp).getTime() : 0,
              txHash: data.txHash
            });
          });
        } catch (error) {
          console.error("Error fetching Invoices:", error);
        }

        try {
          const paymentsRef = collection(db, `merchants/${user.uid}/payments`);
          const paySnap = await getDocs(paymentsRef);
          paySnap.forEach((docSnap) => {
            const data = docSnap.data();
            allTransactions.push({
              id: docSnap.id,
              type: "Sent",
              reference: data.paymentId || docSnap.id,
              description: data.description || `To: ${data.destination?.substring(0, 8)}...`,
              fiatAmount: parseFloat(data.amountFiat || data.fiatAmount || "0"),
              cryptoAmount: String(data.amountToken || data.amount || "0"),
              token: data.token || "Unknown",
              status: data.status || "COMPLETED",
              date: data.timestamp ? new Date(data.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A",
              timestamp: data.timestamp ? new Date(data.timestamp).getTime() : 0,
              txHash: data.txHash
            });
          });
        } catch (error) {
          console.error("Error fetching Sent Payments:", error);
        }

        try {
          const cashoutsRef = collection(db, `merchants/${user.uid}/cashouts`);
          const cashSnap = await getDocs(cashoutsRef);
          cashSnap.forEach((docSnap) => {
            const data = docSnap.data();
            allTransactions.push({
              id: docSnap.id,
              type: "Cashout",
              reference: data.cashoutId || docSnap.id,
              description: `${data.bankName || "Bank"} - ${data.accountName || ""}`,
              fiatAmount: 0,
              cryptoAmount: String(data.amountToken || data.amount || "0"),
              token: data.token || "Unknown",
              status: data.status || "PROCESSING",
              date: data.timestamp ? new Date(data.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "N/A",
              timestamp: data.timestamp ? new Date(data.timestamp).getTime() : 0,
              txHash: data.txHash
            });
          });
        } catch (error) {
          console.error("Error fetching Cashouts:", error);
        }

        allTransactions.sort((a, b) => b.timestamp - a.timestamp);
        setTransactions(allTransactions);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredTransactions = transactions.filter(tx => {
    const search = searchTerm.toLowerCase();
    return (
      (tx.reference && tx.reference.toLowerCase().includes(search)) ||
      (tx.description && tx.description.toLowerCase().includes(search)) ||
      (tx.cryptoAmount && tx.cryptoAmount.includes(search)) ||
      (tx.type && tx.type.toLowerCase().includes(search))
    );
  });

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

  return (
    <div style={{ position: "relative", minHeight: "80vh", padding: "4px", boxSizing: "border-box" }}>
      <style>{`
        .history-controls-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 16px; flex-wrap: wrap; }
        .history-search-container { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; padding: 8px 14px; flex: 1; max-width: 400px; width: 100%; box-sizing: border-box; }
        .history-table-container { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; overflow-x: auto; -webkit-overflow-scrolling: touch; width: 100%; }
        .history-table { width: 100%; border-collapse: collapse; min-width: 850px; table-layout: fixed; }
        .history-header-block { margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; }

        @media (max-width: 640px) {
          .history-header-block { flex-direction: column; align-items: flex-start; }
          .history-header-block button { width: 100%; text-align: center; }
          .history-controls-row { flex-direction: column; align-items: stretch; }
          .history-search-container { max-width: 100%; }
        }
      `}</style>

      <AnimatePresence>
        {isLoading && <LoadingOverlay isLoading={isLoading} message="Loading all records..." />}
      </AnimatePresence>

      <div className="history-header-block">
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4, letterSpacing: "-0.02em" }}>Transaction History</h1>
          <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>All received payments, sent transfers, and cashouts</p>
        </div>
      </div>

      <div className="history-controls-row">
        <div className="history-search-container">
          <span style={{ color: "#6b7280", fontSize: 16 }}>⌕</span>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Reference ID, type, description..."
            style={{ background: "none", border: "none", color: "#e5e7eb", fontSize: 13, outline: "none", width: "100%", fontFamily: "'Nunito',sans-serif" }}
          />
        </div>
        <div>
          <button type="button" onClick={() => navigate("/merchant/create")} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito',sans-serif", transition: "all 0.2s" }}>
            + Request Payment
          </button>
        </div>
      </div>

      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)", width: "130px" }}>Type</th>
              <th style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)", width: "120px" }}>Reference</th>
              <th style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)", width: "180px" }}>Details</th>
              <th style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)", width: "100px" }}>Fiat Amt</th>
              <th style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)", width: "110px" }}>Crypto Amt</th>
              <th style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)", width: "80px" }}>Token</th>
              <th style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)", width: "110px" }}>Status</th>
              <th style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)", width: "110px" }}>Date</th>
              <th style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "center", borderBottom: "1px solid rgba(255,255,255,.06)", width: "80px" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((tx, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <td style={{ padding: "13px 16px" }}>
                    <span style={{
                      background: tx.type === 'Received' ? 'rgba(16, 185, 129, 0.1)' : tx.type === 'Sent' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                      color: tx.type === 'Received' ? '#10b981' : tx.type === 'Sent' ? '#ef4444' : '#60a5fa',
                      border: `1px solid ${tx.type === 'Received' ? 'rgba(16, 185, 129, 0.2)' : tx.type === 'Sent' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
                      padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 'bold', display: 'inline-block', whiteSpace: 'nowrap'
                    }}>
                      {tx.type === 'Received' ? '↓ IN' : tx.type === 'Sent' ? '↑ OUT' : '🏦 CASHOUT'}
                    </span>
                  </td>

                  <td style={{ padding: "13px 16px", fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tx.reference}
                  </td>

                  <td style={{ padding: "13px 16px", fontSize: 13, color: "#e5e7eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tx.description}
                  </td>

                  <td style={{ padding: "13px 16px", color: "#9ca3af", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tx.fiatAmount > 0 ? `₱${tx.fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                  </td>

                  <td style={{ padding: "13px 16px", fontWeight: 700, color: "#fff", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {parseFloat(tx.cryptoAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>

                  <td style={{ padding: "13px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tx.token}
                  </td>

                  <td style={{ padding: "13px 16px" }}>
                    {renderStatus(tx.status)}
                  </td>

                  <td style={{ padding: "13px 16px", fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
                    {tx.date}
                  </td>

                  <td style={{ padding: "13px 16px", textAlign: "center" }}>
                    {tx.txHash ? (
                      <a
                        href={`${explorerBaseUrl}${tx.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: "#a78bfa", cursor: "pointer", fontWeight: 500, textDecoration: "none", background: "rgba(167,139,250,0.1)", padding: "4px 8px", borderRadius: 6, display: "inline-block" }}
                      >
                        Explore ↗
                      </a>
                    ) : (
                      <span style={{ fontSize: 12, color: "#6b7280" }}>N/A</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} style={{ padding: "40px 16px", textAlign: "center", color: "#6b7280", fontSize: 13 }}>
                  {!isLoading && (searchTerm ? "No transactions found matching your search." : "No transaction history available yet.")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}