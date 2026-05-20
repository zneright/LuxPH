// ==========================================
// 1. IMPORTS & TYPES
// ==========================================
import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../config/firebase";
import { TableHead, PlanBadge, StatusPill } from "../../components/admin/AdminUi";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";
import { motion, AnimatePresence } from "framer-motion";

interface MerchantData {
  id: string;
  name: string;
  email: string;
  plan: "PRO" | "FREE";
  receive: number;
  sent: number;
  cashout: number;
  totalTx: number;
  status: "Active" | "Suspended" | string;
  joined: string;
}

// ==========================================
// 2. MAIN COMPONENT
// ==========================================
export default function Merchants() {

  // --- STATE MANAGEMENT ---
  const [merchants, setMerchants] = useState<MerchantData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // ==========================================
  // 3. FIREBASE DATA FETCHING
  // ==========================================
  useEffect(() => {
    const fetchMerchantsData = async () => {
      setIsLoading(true);
      try {
        const merchSnap = await getDocs(collection(db, "merchants"));

        // Fetch all merchants and their transactional subcollections in parallel
        const promises = merchSnap.docs.map(async (mDoc) => {
          const data = mDoc.data();
          const mId = mDoc.id;

          // Parallel fetch for invoices, payments, and cashouts
          const [invSnap, paySnap, cashSnap] = await Promise.all([
            getDocs(collection(db, `merchants/${mId}/invoices`)),
            getDocs(collection(db, `merchants/${mId}/payments`)),
            getDocs(collection(db, `merchants/${mId}/cashouts`))
          ]);

          let receiveTotal = 0;
          let sentTotal = 0;
          let cashoutTotal = 0;
          let txCount = 0;

          // Helper to process amounts safely
          const parseAmount = (d: any) => parseFloat(d.fiatAmount || d.amountToken || d.amount || "0");

          invSnap.forEach((doc) => {
            const d = doc.data();
            if (d.status !== "failed" && d.status !== "cancelled") {
              receiveTotal += parseAmount(d);
              txCount++;
            }
          });

          paySnap.forEach((doc) => {
            const d = doc.data();
            if (d.status !== "failed" && d.status !== "cancelled") {
              sentTotal += parseAmount(d);
              txCount++;
            }
          });

          cashSnap.forEach((doc) => {
            const d = doc.data();
            if (d.status !== "failed" && d.status !== "cancelled") {
              cashoutTotal += parseAmount(d);
              txCount++;
            }
          });

          // Safely parse Firestore timestamp or fallback to current date
          let joinedDate = "Unknown";
          if (data.createdAt) {
            const d = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            joinedDate = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          }

          return {
            id: mId,
            name: data.businessName || data.name || "Unknown Merchant",
            email: data.email || "No Email",
            plan: data.isSubscribed ? "PRO" : "FREE",
            receive: receiveTotal,
            sent: sentTotal,
            cashout: cashoutTotal,
            totalTx: txCount,
            status: data.status || "Active",
            joined: joinedDate
          } as MerchantData;
        });

        const resolvedMerchants = await Promise.all(promises);

        // Sort highest receiving volume first
        resolvedMerchants.sort((a, b) => b.receive - a.receive);

        setMerchants(resolvedMerchants);
      } catch (error) {
        console.error("Error fetching merchants data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMerchantsData();
  }, []);

  // ==========================================
  // 4. DERIVED STATE & HANDLERS
  // ==========================================

  // Real-time Search Filter
  const filteredMerchants = useMemo(() => {
    if (!searchTerm) return merchants;
    const lowerSearch = searchTerm.toLowerCase();
    return merchants.filter(m =>
      m.name.toLowerCase().includes(lowerSearch) ||
      m.email.toLowerCase().includes(lowerSearch) ||
      m.id.toLowerCase().includes(lowerSearch)
    );
  }, [merchants, searchTerm]);

  // CSV Export Function
  const handleExportCSV = () => {
    if (filteredMerchants.length === 0) return;

    const headers = ["Merchant ID", "Name", "Email", "Plan", "Receive (PHP)", "Sent (PHP)", "Cashout (PHP)", "Total Txs", "Status", "Joined Date"];
    const rows = filteredMerchants.map(m => [
      `"${m.id}"`,
      `"${m.name}"`,
      `"${m.email}"`,
      m.plan,
      m.receive,
      m.sent,
      m.cashout,
      m.totalTx,
      m.status,
      `"${m.joined}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `LuxPH_Merchants_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==========================================
  // 5. RENDER UI
  // ==========================================
  return (
    <div>
      {/* HEADER SECTION */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>Merchants</h1>
        <p style={{ color: "#9ca3af", fontSize: 13 }}>All registered merchants on the platform</p>
      </div>

      {/* CONTROLS SECTION */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 8, padding: "8px 14px", flex: 1, maxWidth: 380 }}>
          <span style={{ color: "#6b7280" }}>⌕</span>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search name, email, ID…"
            style={{ background: "none", border: "none", color: "#e5e7eb", fontSize: 13, outline: "none", flex: 1, fontFamily: "'Nunito',sans-serif" }}
          />
        </div>
        <button
          onClick={handleExportCSV}
          disabled={isLoading || filteredMerchants.length === 0}
          style={{ background: "transparent", color: isLoading ? "#4b5563" : "#9ca3af", border: "1px solid rgba(255,255,255,.12)", borderRadius: 7, padding: "8px 16px", fontSize: 12, cursor: isLoading ? "wait" : "pointer", fontFamily: "'Nunito',sans-serif", transition: "all 0.2s" }}
        >
          Export CSV
        </button>
      </div>

      {/* TABLE SECTION */}
      <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, overflow: "hidden", minHeight: "400px", position: "relative" }}>

        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center" }}
            >
              <LoadingBadge text="Syncing Merchant Matrix..." variant="network" />
            </motion.div>
          ) : filteredMerchants.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#6b7280", fontSize: 13 }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
              No merchants found matching "{searchTerm}"
            </motion.div>
          ) : (
            <motion.table
              key="table"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
              style={{ width: "100%", borderCollapse: "collapse" }}
            >
              <TableHead cols={["Merchant", "Plan", "Receive", "Sent", "Cashout", "Total Txs", "Status", "Joined", ""]} />
              <tbody>
                {filteredMerchants.map((m) => (
                  <tr key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono',monospace" }}>{m.email}</div>
                    </td>
                    <td style={{ padding: "14px 16px" }}><PlanBadge plan={m.plan} /></td>

                    {/* Updated Volume Metrics Columns */}
                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "#10b981", fontSize: 13 }}>₱{m.receive.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "#f59e0b", fontSize: 13 }}>₱{m.sent.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "#3b82f6", fontSize: 13 }}>₱{m.cashout.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>

                    <td style={{ padding: "14px 16px", fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#9ca3af" }}>{m.totalTx}</td>
                    <td style={{ padding: "14px 16px" }}><StatusPill status={m.status} /></td>
                    <td style={{ padding: "14px 16px", fontSize: 11, color: "#6b7280" }}>{m.joined}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontSize: 12, color: m.status.toLowerCase() === "suspended" ? "#f87171" : "#a78bfa", cursor: "pointer", fontWeight: 600 }}>
                        {m.status.toLowerCase() === "suspended" ? "Review" : "Manage"}
                      </span>
                    </td>
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