// ==========================================
// 1. IMPORTS & STRUCTURAL INTEGRITY
// ==========================================
import { useState, useEffect, useMemo, useRef } from "react";
import { collection, getDocs, collectionGroup } from "firebase/firestore";
import { db } from "../../config/firebase";
import { TableHead, PlanBadge } from "../../components/admin/AdminUi";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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

type PrintOrientation = "portrait" | "landscape";

const escapeCSVValue = (val: any) => {
  if (val === null || val === undefined) return '';
  let stringVal = String(val);
  if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
    stringVal = `"${stringVal.replace(/"/g, '""')}"`;
  }
  return stringVal;
};

// ==========================================
// 2. MAIN MERCHANTS COMPONENT
// ==========================================
export default function Merchants() {
  const [merchants, setMerchants] = useState<MerchantData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showExportMenu, setShowExportMenu] = useState(false);

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>("portrait");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  // --- HIGH PERFORMANCE BACKEND CLUSTER DATA INTEGRATION ---
  useEffect(() => {
    const fetchMerchantsData = async () => {
      setIsLoading(true);
      try {
        // Fetch all parent merchant accounts safely
        const merchSnap = await getDocs(collection(db, "merchants"));

        // PRODUCTION BLOCKCHAIN QUERY OPTIMIZATION:
        // Instead of looping individual sub-reads per document, we pull global collections
        // using collectionGroup, then parse and filter them completely inside local memory.
        const [globalInvoices, globalPayments, globalCashouts] = await Promise.all([
          getDocs(collectionGroup(db, "invoices")),
          getDocs(collectionGroup(db, "payments")),
          getDocs(collectionGroup(db, "cashouts"))
        ]);

        // Build index lookup records for rapid in-memory parsing loops
        const invoicesMap: Record<string, any[]> = {};
        const paymentsMap: Record<string, any[]> = {};
        const cashoutsMap: Record<string, any[]> = {};

        // Helper to extract the parent merchant document ID out of a subcollection reference path
        const extractMerchantIdFromPath = (refPath: string): string => {
          const parts = refPath.split("/");
          const index = parts.indexOf("merchants");
          return index !== -1 && parts[index + 1] ? parts[index + 1] : "";
        };

        globalInvoices.docs.forEach(doc => {
          const mId = extractMerchantIdFromPath(doc.ref.path);
          if (mId) {
            if (!invoicesMap[mId]) invoicesMap[mId] = [];
            invoicesMap[mId].push(doc.data());
          }
        });

        globalPayments.docs.forEach(doc => {
          const mId = extractMerchantIdFromPath(doc.ref.path);
          if (mId) {
            if (!paymentsMap[mId]) paymentsMap[mId] = [];
            paymentsMap[mId].push(doc.data());
          }
        });

        globalCashouts.docs.forEach(doc => {
          const mId = extractMerchantIdFromPath(doc.ref.path);
          if (mId) {
            if (!cashoutsMap[mId]) cashoutsMap[mId] = [];
            cashoutsMap[mId].push(doc.data());
          }
        });

        const parseAmount = (d: any) => parseFloat(d.fiatAmount || d.amountToken || d.amount || "0");

        const resolvedMerchants = merchSnap.docs.map((mDoc) => {
          const data = mDoc.data();
          const mId = mDoc.id;

          let receiveTotal = 0;
          let sentTotal = 0;
          let cashoutTotal = 0;
          let txCount = 0;

          // Process cached subcollection elements mapped directly to this merchant ID node
          const merchantInvoices = invoicesMap[mId] || [];
          merchantInvoices.forEach(d => {
            if (d.status !== "failed" && d.status !== "cancelled") {
              receiveTotal += parseAmount(d);
              txCount++;
            }
          });

          const merchantPayments = paymentsMap[mId] || [];
          merchantPayments.forEach(d => {
            if (d.status !== "failed" && d.status !== "cancelled") {
              sentTotal += parseAmount(d);
              txCount++;
            }
          });

          const merchantCashouts = cashoutsMap[mId] || [];
          merchantCashouts.forEach(d => {
            if (d.status !== "failed" && d.status !== "cancelled") {
              cashoutTotal += parseAmount(d);
              txCount++;
            }
          });

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

        // Sort by volume descending for an overview of your top performing nodes
        resolvedMerchants.sort((a, b) => b.receive - a.receive);
        setMerchants(resolvedMerchants);
      } catch (error) {
        console.error("MERCHANT_MATRIX_READ_CRASH:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMerchantsData();
  }, []);

  // --- MEMOIZED SEARCH DESCRIPTOR ---
  const filteredMerchants = useMemo(() => {
    if (!searchTerm) return merchants;
    const lowerSearch = searchTerm.toLowerCase();
    return merchants.filter(m =>
      m.name.toLowerCase().includes(lowerSearch) ||
      m.email.toLowerCase().includes(lowerSearch) ||
      m.id.toLowerCase().includes(lowerSearch)
    );
  }, [merchants, searchTerm]);

  // --- CSV GENERATOR FILE FLOW ENGINE ---
  const handleExportCSV = () => {
    if (filteredMerchants.length === 0) return;

    const headers = ["Merchant ID", "Name", "Email", "Plan", "Receive (PHP)", "Sent (PHP)", "Cashout (PHP)", "Total Txs", "Status", "Joined Date"];
    const rows = filteredMerchants.map(m => [
      escapeCSVValue(m.id),
      escapeCSVValue(m.name),
      escapeCSVValue(m.email),
      m.plan,
      m.receive,
      m.sent,
      m.cashout,
      m.totalTx,
      m.status,
      escapeCSVValue(m.joined)
    ]);

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `LuxPH_Merchants_Export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const MAX_ROWS_PER_PAGE = 15;
  const tableChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < filteredMerchants.length; i += MAX_ROWS_PER_PAGE) {
      chunks.push(filteredMerchants.slice(i, i + MAX_ROWS_PER_PAGE));
    }
    return chunks;
  }, [filteredMerchants]);

  // --- AUDIT PDF GENERATION SUITE ---
  const generatePDF = async () => {
    if (!pdfRef.current) return;
    setIsGeneratingPdf(true);
    try {
      pdfRef.current.style.display = "block";
      const pdf = new jsPDF({ orientation: printOrientation, unit: "mm", format: "a4" });
      const pages = pdfRef.current.querySelectorAll('.pdf-page');

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i] as HTMLElement, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
        const imgData = canvas.toDataURL("image/png");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      }

      pdfRef.current.style.display = "none";
      pdf.save(`LuxPH_Merchant_Audit_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err) {
      console.error("PDF_EXPORT_ERROR:", err);
    } finally {
      setIsGeneratingPdf(false);
      setShowPrintModal(false);
    }
  };

  const pageW = printOrientation === "portrait" ? "794px" : "1123px";
  const pageH = printOrientation === "portrait" ? "1123px" : "794px";

  const getStatusColor = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === "suspended" || normalized === "inactive") return "#dc2626";
    if (normalized === "pending") return "#d97706";
    return "#059669";
  };

  return (
    <div>
      {/* Embedded Device Breakpoint Styles For Mobile Adaptability */}
      <style>{`
        .report-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; color: #1f2937; table-layout: fixed; }
        .report-table th { background-color: #f3f4f6; color: #374151; padding: 12px; border: 1px solid #e5e7eb; font-weight: 800; text-transform: uppercase; font-size: 11px; }
        .report-table td { padding: 14px 12px !important; border: 1px solid #e5e7eb; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
        .val-col { text-align: right; font-weight: 700; font-family: 'DM Mono', monospace; }
        .head-col { font-weight: 600; color: #111827; }
        .report-title { font-size: 16px; font-weight: 800; color: #111827; margin-bottom: 8px; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
        .text-right-aligned { text-align: right !important; }
        
        .pdf-page-container { box-sizing: border-box; padding: 50px 50px 60px 50px !important; display: flex; flex-direction: column; justify-content: space-between; }
        .pdf-footer-marker { padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; text-transform: uppercase; width: 100%; margin-top: auto; }
        .pdf-merchant-cell { display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: flex-start !important; gap: 4px !important; }
        
        /* RESPONSIVE LAYOUT MATRIX ENGINES */
        .merchant-header-row { display: flex; justify-content: space-between; alignItems: flex-end; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
        .merchant-controls-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; gap: 16px; flex-wrap: wrap; }
        .search-input-box { display: flex; align-items: center; gap: 10px; background: "rgba(255,255,255,.05)"; border: 1px solid rgba(255,255,255,.1); padding: 8px 14px; flex: 1; max-width: 380px; width: 100%; box-sizing: border-box; }
        .scrollable-table-container { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 12px; }
        .merchant-table { width: 100%; border-collapse: collapse; min-width: 800px; }

        @media (max-width: 576px) {
          .merchant-header-row { flex-direction: column; align-items: flex-start; gap: 16px; }
          .merchant-header-row > div:last-child { width: 100%; }
          .merchant-header-row button { width: 100%; justify-content: center; }
          .search-input-box { max-width: 100%; }
        }
      `}</style>

      {/* ======================================================================
          HIDDEN ARCHIVAL PRINT TARGET (PURE WHITE STYLE CANVAS)
          ====================================================================== */}
      <div ref={pdfRef} style={{ display: "none", position: "absolute", top: 0, left: 0, zIndex: -100 }}>
        <div className="pdf-page pdf-page-container" style={{ width: pageW, height: pageH, background: "#ffffff" }}>
          <div>
            <div style={{ borderBottom: "3px solid #111827", paddingBottom: 16, marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <h1 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 4px 0", color: "#111827", textTransform: "uppercase" }}>Merchants Audit Ledger</h1>
                <div style={{ color: "#4b5563", fontSize: 13 }}>Compiled: {new Date().toLocaleString()}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase" }}>Reporting Scope</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>ACTIVE CLUSTER SUITE</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 32, marginBottom: 16 }}>
              <div>
                <div className="report-title">Ecosystem Segment Metrics</div>
                <table className="report-table">
                  <tbody>
                    <tr><td className="head-col">Targeted Merchant Subsets</td><td className="val-col">{filteredMerchants.length.toLocaleString()} Active Records</td></tr>
                    <tr><td className="head-col">Matching Search Parameter</td><td className="val-col">{searchTerm ? `"${searchTerm}"` : "ALL NODES"}</td></tr>
                    <tr><td className="head-col">Ecosystem Top Tier Ratio</td><td className="val-col">{Math.round((filteredMerchants.filter(m => m.plan === "PRO").length / Math.max(filteredMerchants.length, 1)) * 100)}% Pro Allocation</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="pdf-footer-marker">Page 1 — Lux PH Global Merchant Audit Ledger</div>
        </div>

        {tableChunks.map((chunk, pageIndex) => (
          <div key={`page-${pageIndex + 2}`} className="pdf-page pdf-page-container" style={{ width: pageW, height: pageH, background: "#ffffff" }}>
            <div style={{ width: "100%" }}>
              <div style={{ borderBottom: "3px solid #111827", paddingBottom: 16, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div><h1 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 4px 0", color: "#111827", textTransform: "uppercase" }}>Merchant Matrix Breakdown</h1></div>
                <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: "#111827" }}>PAGE {pageIndex + 2}</div>
              </div>

              <div className="report-title">Active Merchant Flow Profile Matrix (Part {pageIndex + 1} of {tableChunks.length})</div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th style={{ width: "26%" }}>Merchant</th>
                    <th style={{ width: "10%" }}>Plan</th>
                    <th style={{ width: "13%", textAlign: "right" }}>Receive</th>
                    <th style={{ width: "13%", textAlign: "right" }}>Sent</th>
                    <th style={{ width: "13%", textAlign: "right" }}>Cashout</th>
                    <th style={{ width: "10%", textAlign: "right" }}>Txs</th>
                    <th style={{ width: "15%" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((m, i) => (
                    <tr key={i}>
                      <td>
                        <div className="pdf-merchant-cell">
                          <div style={{ fontWeight: 800, fontSize: "12px", color: "#111827", margin: 0, padding: 0, lineHeight: "1.2" }}>{m.name}</div>
                          <div style={{ fontSize: "10px", color: "#4b5563", fontFamily: "'DM Mono',monospace", margin: 0, padding: 0, lineHeight: "1.2" }}>{m.email}</div>
                        </div>
                      </td>
                      <td><span style={{ fontSize: "11px", fontWeight: 800 }}>{m.plan}</span></td>
                      <td className="val-col" style={{ color: "#059669" }}>₱{m.receive.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="val-col" style={{ color: "#d97706" }}>₱{m.sent.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="val-col" style={{ color: "#2563eb" }}>₱{m.cashout.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className="val-col">{m.totalTx}</td>
                      <td>
                        <span style={{ fontWeight: 800, fontSize: "11px", color: getStatusColor(m.status) }}>
                          {m.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pdf-footer-marker">Page {pageIndex + 2} — Lux PH Global Merchant Audit Ledger</div>
          </div>
        ))}
      </div>

      {/* ======================================================================
          MAIN INTERACTIVE ACTIVE DASHBOARD WORKSPACE UI
          ====================================================================== */}
      <div className="merchant-header-row">
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: "#fff", marginBottom: 4, letterSpacing: "-0.02em" }}>Merchants</h1>
          <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>Cryptographic settlement terminals registration registry</p>
        </div>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={isLoading || filteredMerchants.length === 0}
            style={{
              background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", border: "none",
              padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: (isLoading || filteredMerchants.length === 0) ? "not-allowed" : "pointer",
              boxShadow: "0 4px 12px rgba(37,99,235,0.25)", display: "flex", alignItems: "center", gap: 8
            }}
          >
            <span>Download Reports ({filteredMerchants.length})</span>
            <span style={{ fontSize: 10 }}>▼</span>
          </button>

          <AnimatePresence>
            {showExportMenu && (
              <>
                <div onClick={() => setShowExportMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#1f2937", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.6)", zIndex: 999, width: 220, overflow: "hidden" }}>
                  <button onClick={() => { setShowExportMenu(false); setShowPrintModal(true); }} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 16px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                    <span>📄</span> Export PDF Report
                  </button>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
                  <button onClick={handleExportCSV} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 16px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                    <span>📊</span> Export filtered to CSV
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* FILTER SEARCH DISPATCH ROW */}
      <div className="merchant-controls-row">
        <div className="search-input-box" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
          <span style={{ color: "#6b7280", fontSize: 16 }}>⌕</span>
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search matching business entity profiles..."
            style={{ background: "none", border: "none", color: "#e5e7eb", fontSize: 13, outline: "none", width: "100%" }}
          />
        </div>
      </div>

      {/* ADAPTIVE TABLE CONTAINER LAYER */}
      <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 14, overflow: "hidden", minHeight: "360px", position: "relative" }}>
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <LoadingBadge text="Synchronizing Platform Registries..." variant="network" />
            </motion.div>
          ) : filteredMerchants.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#6b7280", fontSize: 13 }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>🔍</div>
              No merchant addresses match "{searchTerm}"
            </motion.div>
          ) : (
            <div className="scrollable-table-container">
              <motion.table key="table" className="merchant-table" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <TableHead cols={["Merchant", "Plan", "Receive", "Sent", "Cashout", "Total Txs", "Status", "Joined", ""]} />
                <tbody>
                  {filteredMerchants.map((m) => (
                    <tr key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,.03)" }}>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono',monospace" }}>{m.email}</div>
                      </td>
                      <td style={{ padding: "14px 16px" }}><PlanBadge plan={m.plan} /></td>
                      <td style={{ padding: "14px 16px", fontWeight: 700, color: "#10b981", fontSize: 13 }}>₱{m.receive.toLocaleString()}</td>
                      <td style={{ padding: "14px 16px", fontWeight: 700, color: "#f59e0b", fontSize: 13 }}>₱{m.sent.toLocaleString()}</td>
                      <td style={{ padding: "14px 16px", fontWeight: 700, color: "#3b82f6", fontSize: 13 }}>₱{m.cashout.toLocaleString()}</td>
                      <td className="text-right-aligned" style={{ padding: "14px 16px", fontFamily: "'DM Mono',monospace", fontSize: 12, color: "#9ca3af" }}>{m.totalTx}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: "4px 8px", borderRadius: 6, letterSpacing: "0.04em", background: `${getStatusColor(m.status)}12`, color: getStatusColor(m.status), border: `1px solid ${getStatusColor(m.status)}25`, display: "inline-block" }}>
                          {m.status.toUpperCase()}
                        </span>
                      </td>
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
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* ======================================================================
          REPORT DIALOG MODAL LAYOUT CONTAINER
          ====================================================================== */}
      <AnimatePresence>
        {showPrintModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPrintModal(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(5px)" }} />
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24, width: "100%", maxWidth: "380px", position: "relative", zIndex: 10 }}>
              <h2 style={{ margin: "0 0 6px 0", color: "#fff", fontSize: 18 }}>Export Audit Ledger</h2>
              <p style={{ color: "#9ca3af", fontSize: 13, margin: "0 0 20px 0" }}>Compiling clear-print accounting ledger documentation mapping active merchant parameters.</p>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 10, color: "#9ca3af", marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>PAGE ORIENTATION</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setPrintOrientation("portrait")} style={{ flex: 1, background: printOrientation === "portrait" ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${printOrientation === "portrait" ? "#3b82f6" : "rgba(255,255,255,0.08)"}`, color: "#fff", padding: "10px", borderRadius: 8, cursor: "pointer" }}>Portrait</button>
                  <button onClick={() => setPrintOrientation("landscape")} style={{ flex: 1, background: printOrientation === "landscape" ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${printOrientation === "landscape" ? "#3b82f6" : "rgba(255,255,255,0.08)"}`, color: "#fff", padding: "10px", borderRadius: 8, cursor: "pointer" }}>Landscape</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setShowPrintModal(false)} disabled={isGeneratingPdf} style={{ flex: 1, padding: "10px", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", borderRadius: 8, cursor: "pointer" }}>Cancel</button>
                <button onClick={generatePDF} disabled={isGeneratingPdf} style={{ flex: 1, padding: "10px", background: "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", color: "#fff", borderRadius: 8, fontWeight: "bold", cursor: isGeneratingPdf ? "wait" : "pointer" }}>
                  {isGeneratingPdf ? "Compiling..." : "Download"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}