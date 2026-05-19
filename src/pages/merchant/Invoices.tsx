import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import { AnimatePresence } from "framer-motion";

// Unified Interface for all transaction types
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsLoading(true);
        const allTransactions: TransactionData[] = [];

        // 1. INVOICES (Received)
        try {
          const invoicesRef = collection(db, `merchants/${user.uid}/invoices`);
          const invSnap = await getDocs(invoicesRef);
          invSnap.forEach((doc) => {
            const data = doc.data();
            allTransactions.push({
              id: doc.id,
              type: "Received",
              reference: data.invoiceId || data.memo || doc.id,
              description: data.description || "N/A",
              fiatAmount: parseFloat(data.fiatAmount || data.amountPHP || "0"),
              cryptoAmount: String(data.amount || "0"), // Enforce String
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

        // 2. SENT PAYMENTS
        try {
          const paymentsRef = collection(db, `merchants/${user.uid}/payments`);
          const paySnap = await getDocs(paymentsRef);
          paySnap.forEach((doc) => {
            const data = doc.data();
            allTransactions.push({
              id: doc.id,
              type: "Sent",
              reference: data.paymentId || doc.id,
              description: data.description || `To: ${data.destination?.substring(0, 8)}...`,
              fiatAmount: parseFloat(data.amountFiat || data.fiatAmount || "0"),
              cryptoAmount: String(data.amountToken || data.amount || "0"), // Enforce String
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

        // 3. CASHOUTS
        try {
          const cashoutsRef = collection(db, `merchants/${user.uid}/cashouts`);
          const cashSnap = await getDocs(cashoutsRef);
          cashSnap.forEach((doc) => {
            const data = doc.data();
            allTransactions.push({
              id: doc.id,
              type: "Cashout",
              reference: data.cashoutId || doc.id,
              description: `${data.bankName || "Bank"} - ${data.accountName || ""}`,
              fiatAmount: 0, // Your cashout code doesn't save fiat to DB
              cryptoAmount: String(data.amountToken || data.amount || "0"), // Enforce String
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

        // 4. Sort everything by newest first
        allTransactions.sort((a, b) => b.timestamp - a.timestamp);
        setTransactions(allTransactions);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Extremely safe search filter
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
    <div style={{ position: "relative", minHeight: "80vh" }}>
      <AnimatePresence>
        {isLoading && <LoadingOverlay isLoading={isLoading} message="Loading all records..." />}
      </AnimatePresence>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>Transaction History</h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>All received payments, sent transfers, and cashouts</p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "8px 14px", flex: 1, maxWidth: 400 }}>
          <span style={{ color: "#6b7280" }}>⌕</span>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Reference ID, type, description, amount…"
            style={{ background: "none", border: "none", color: "#e5e7eb", fontSize: 13, outline: "none", flex: 1, fontFamily: "'Nunito',sans-serif" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => navigate("/merchant/create")} style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 7, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Nunito',sans-serif" }}>
            + Request Payment
          </button>
        </div>
      </div>

      <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
          <thead>
            <tr>
              {["Type", "Reference", "Details", "Fiat Amt", "Crypto Amt", "Token", "Status", "Date", ""].map(h => (
                <th key={h} style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#6b7280", letterSpacing: ".07em", textTransform: "uppercase", padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,.06)", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((tx, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>

                  {/* TYPE BADGE */}
                  <td style={{ padding: "13px 16px" }}>
                    <span style={{
                      background: tx.type === 'Received' ? 'rgba(16, 185, 129, 0.1)' : tx.type === 'Sent' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                      color: tx.type === 'Received' ? '#10b981' : tx.type === 'Sent' ? '#ef4444' : '#60a5fa',
                      border: `1px solid ${tx.type === 'Received' ? 'rgba(16, 185, 129, 0.2)' : tx.type === 'Sent' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)'}`,
                      padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 'bold'
                    }}>
                      {tx.type === 'Received' ? '↓ IN' : tx.type === 'Sent' ? '↑ OUT' : '🏦 CASHOUT'}
                    </span>
                  </td>

                  {/* REFERENCE */}
                  <td style={{ padding: "13px 16px", fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#9ca3af" }}>
                    {tx.reference}
                  </td>

                  {/* DETAILS */}
                  <td style={{ padding: "13px 16px", fontSize: 13, color: "#e5e7eb" }}>
                    {tx.description}
                  </td>

                  {/* FIAT AMOUNT */}
                  <td style={{ padding: "13px 16px", color: "#9ca3af", fontSize: 12 }}>
                    {tx.fiatAmount > 0 ? `₱${tx.fiatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                  </td>

                  {/* CRYPTO AMOUNT */}
                  <td style={{ padding: "13px 16px", fontWeight: 700, color: "#fff", fontSize: 13 }}>
                    {parseFloat(tx.cryptoAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>

                  {/* TOKEN */}
                  <td style={{ padding: "13px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#6b7280" }}>
                    {tx.token}
                  </td>

                  {/* STATUS */}
                  <td style={{ padding: "13px 16px" }}>
                    {renderStatus(tx.status)}
                  </td>

                  {/* DATE */}
                  <td style={{ padding: "13px 16px", fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>
                    {tx.date}
                  </td>

                  {/* LINK */}
                  <td style={{ padding: "13px 16px" }}>
                    {tx.txHash ? (
                      <a
                        href={`https://stellar.expert/explorer/testnet/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: "#a78bfa", cursor: "pointer", fontWeight: 500, textDecoration: "none" }}
                      >
                        View Tx
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