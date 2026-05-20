import { useState, useEffect, useMemo, useRef } from "react";
import { collection, getDocs, collectionGroup, doc, getDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { TableHead } from "../../components/admin/AdminUi";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface TransactionData {
  id: string;
  hash: string;
  fullHash: string;
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

type PrintOrientation = "portrait" | "landscape";

const formatTimeAgo = (date: Date) => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return `${Math.max(seconds, 0)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const escapeCSVValue = (val: any) => {
  if (val === null || val === undefined) return '';
  let stringVal = val instanceof Date ? val.toLocaleString('en-US') : String(val);
  if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
    stringVal = `"${stringVal.replace(/"/g, '""')}"`;
  }
  return stringVal;
};

export default function Transactions() {
  const [transactions, setTransactions] = useState<TransactionData[]>([]);
  const [kpis, setKpis] = useState<KPIStats>({ totalToday: 0, volumeToday: 0, avgSize: 0, failedToday: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>("portrait");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const [showFullHash, setShowFullHash] = useState<boolean>(false);
  const [networkEnvironment, setNetworkEnvironment] = useState<string>("public");

  useEffect(() => {
    const fetchAllTransactions = async () => {
      setIsLoading(true);
      try {
        const configRef = doc(db, "system_config", "global");
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          const configData = configSnap.data();
          if (configData.stellarNetwork && String(configData.stellarNetwork).toLowerCase().includes("testnet")) {
            setNetworkEnvironment("testnet");
          } else {
            setNetworkEnvironment("public");
          }
        }

        const merchSnap = await getDocs(collection(db, "merchants"));
        const merchantNamesMap: Record<string, string> = {};
        merchSnap.docs.forEach(doc => {
          merchantNamesMap[doc.id] = doc.data().businessName || doc.data().name || "Unknown Merchant";
        });

        const [invSnap, paySnap, cashSnap] = await Promise.all([
          getDocs(collectionGroup(db, "invoices")),
          getDocs(collectionGroup(db, "payments")),
          getDocs(collectionGroup(db, "cashouts"))
        ]);

        let allTx: TransactionData[] = [];

        const extractMerchantId = (refPath: string): string => {
          const parts = refPath.split("/");
          const index = parts.indexOf("merchants");
          return index !== -1 && parts[index + 1] ? parts[index + 1] : "";
        };

        const processSnap = (snap: any, type: "INFLOW" | "OUTFLOW" | "CASHOUT") => {
          snap.docs.forEach((docNode: any) => {
            const d = docNode.data();
            if (!d.timestamp) return;

            const mId = extractMerchantId(docNode.ref.path);
            const merchantName = merchantNamesMap[mId] || "Unknown Merchant";

            const date = d.timestamp.toDate ? d.timestamp.toDate() : new Date(d.timestamp);
            const amt = parseFloat(d.fiatAmount || d.amountToken || d.amount || "0");
            const rawHash = d.txHash || docNode.id;
            const displayHash = d.txHash ? `${d.txHash.substring(0, 6)}...${d.txHash.substring(d.txHash.length - 4)}` : `${docNode.id.substring(0, 8)}...`;

            let tokenDisplay = d.token || "PHPC";
            if (type === "CASHOUT") tokenDisplay = d.payoutMethod ? d.payoutMethod.toUpperCase() : "BANK";

            allTx.push({
              id: docNode.id,
              hash: displayHash,
              fullHash: rawHash,
              merchant: merchantName,
              type: type,
              amount: amt,
              token: tokenDisplay,
              status: d.status || "COMPLETED",
              date: date,
              timeAgo: formatTimeAgo(date)
            });
          });
        };

        processSnap(invSnap, "INFLOW");
        processSnap(paySnap, "OUTFLOW");
        processSnap(cashSnap, "CASHOUT");

        allTx.sort((a, b) => b.date.getTime() - a.date.getTime());
        setTransactions(allTx);

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

  const filteredTx = useMemo(() => {
    return transactions.filter(tx => {
      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        const matchesSearch =
          tx.merchant.toLowerCase().includes(lowerSearch) ||
          tx.hash.toLowerCase().includes(lowerSearch) ||
          tx.fullHash.toLowerCase().includes(lowerSearch) ||
          tx.type.toLowerCase().includes(lowerSearch) ||
          tx.status.toLowerCase().includes(lowerSearch);

        if (!matchesSearch) return false;
      }

      if (filterType !== "ALL" && tx.type !== filterType) return false;
      if (filterStatus !== "ALL" && tx.status.toUpperCase() !== filterStatus.toUpperCase()) return false;

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (tx.date.getTime() < start.getTime()) return false;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (tx.date.getTime() > end.getTime()) return false;
      }

      return true;
    });
  }, [transactions, searchTerm, filterType, filterStatus, startDate, endDate]);

  const formatCompact = (num: number) => {
    if (num >= 1000000) return `₱${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `₱${(num / 1000).toFixed(1)}K`;
    return `₱${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setFilterType("ALL");
    setFilterStatus("ALL");
    setStartDate("");
    setEndDate("");
  };

  const handleExportCSV = () => {
    if (filteredTx.length === 0) return;
    const headers = ["Date & Time", "Transaction Hash / ID", "Type", "Merchant", "Amount (PHP)", "Routing/Token", "Status"];
    const rows = filteredTx.map(tx => [
      escapeCSVValue(tx.date),
      escapeCSVValue(tx.fullHash),
      escapeCSVValue(tx.type),
      escapeCSVValue(tx.merchant),
      tx.type === "OUTFLOW" || tx.type === "CASHOUT" ? -tx.amount : tx.amount,
      escapeCSVValue(tx.token),
      escapeCSVValue(tx.status)
    ]);

    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Filtered_Ledger_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

  const getReportDateLabel = () => {
    if (startDate && endDate) return `${startDate} to ${endDate}`;
    if (startDate) return `From ${startDate}`;
    if (endDate) return `Until ${endDate}`;
    return "All Filtered Ledger History";
  };

  const MAX_ROWS_PER_PAGE = 15;
  const tableChunks = useMemo(() => {
    const chunks = [];
    for (let i = 0; i < filteredTx.length; i += MAX_ROWS_PER_PAGE) {
      chunks.push(filteredTx.slice(i, i + MAX_ROWS_PER_PAGE));
    }
    return chunks;
  }, [filteredTx]);

  const generatePDF = async () => {
    if (!pdfRef.current) return;
    setIsGeneratingPdf(true);

    try {
      pdfRef.current.style.display = "block";

      const pdf = new jsPDF({
        orientation: printOrientation,
        unit: "mm",
        format: "a4"
      });

      const pages = pdfRef.current.querySelectorAll('.pdf-page');

      for (let i = 0; i < pages.length; i++) {
        const pageElement = pages[i] as HTMLElement;
        const canvas = await html2canvas(pageElement, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          logging: false
        });

        const imgData = canvas.toDataURL("image/png");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      }

      pdfRef.current.style.display = "none";
      pdf.save(`LuxPH_Ledger_Report_${new Date().toISOString().split("T")[0]}.pdf`);

    } catch (err) {
      console.error("Failed to generate PDF", err);
    } finally {
      setIsGeneratingPdf(false);
      setShowPrintModal(false);
    }
  };

  const pageW = printOrientation === "portrait" ? "794px" : "1123px";
  const pageH = printOrientation === "portrait" ? "1123px" : "794px";

  const getStatusColor = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === "failed" || normalized === "cancelled" || normalized === "expired") {
      return "#dc2626";
    }
    if (normalized === "pending" || normalized === "processing") {
      return "#d97706";
    }
    return "#059669";
  };

  return (
    <div>
      <style>{`
        .report-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; color: #1f2937; table-layout: fixed; }
        .report-table th { background-color: #f3f4f6; color: #374151; padding: 12px; text-align: left; border: 1px solid #e5e7eb; font-weight: 800; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
        .report-table td { padding: 12px; border: 1px solid #e5e7eb; vertical-align: middle; overflow: hidden; text-overflow: ellipsis; }
        .report-table tr:nth-child(even) { background-color: #f9fafb; }
        .val-col { text-align: right; font-weight: 700; font-family: 'DM Mono', monospace; }
        .head-col { font-weight: 600; color: #111827; }
        .report-title { font-size: 16px; font-weight: 800; color: #111827; margin-bottom: 8px; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
        
        .tx-header-block { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
        .tx-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
        .tx-filters-panel { background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.06); borderRadius: 12px; padding: 16px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 12px; }
        .tx-filters-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
        .tx-table-wrapper { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; overflow-x: auto; min-height: 400px; position: relative; width: 100%; -webkit-overflow-scrolling: touch; }
        .tx-table { width: 100%; border-collapse: collapse; min-width: 950px; table-layout: fixed; }
        
        .pdf-page-container { box-sizing: border-box; padding: 50px 50px 60px 50px !important; display: flex; flex-direction: column; justify-content: space-between; page-break-after: always; }
        .pdf-table-wrapper { width: 100%; }
        .pdf-footer-marker { padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; text-transform: uppercase; letter-spacing: 0.05em; width: 100%; margin-top: auto; }

        @media (max-width: 1024px) {
          .tx-kpi-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .tx-header-block { flex-direction: column; align-items: flex-start; }
          .tx-header-block > div:last-child { width: 100%; display: flex; flex-direction: column; gap: 10px; }
          .tx-header-block button { width: 100%; justify-content: center; }
          .tx-kpi-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div ref={pdfRef} style={{ display: "none", position: "absolute", top: 0, left: 0, zIndex: -100 }}>
        <div className="pdf-page pdf-page-container" style={{ width: pageW, height: pageH, background: "#ffffff" }}>
          <div>
            <div style={{ borderBottom: "3px solid #111827", paddingBottom: 16, marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 4px 0", color: "#111827", textTransform: "uppercase" }}>Ledger Audit Report</h1>
                <div style={{ color: "#4b5563", fontSize: 13 }}>Generated on: {new Date().toLocaleString()}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Reporting Filters</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{getReportDateLabel().toUpperCase()}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 16 }}>
              <div>
                <div className="report-title">Active Segment Summary</div>
                <table className="report-table">
                  <tbody>
                    <tr><td className="head-col">Targeted Operations Logged</td><td className="val-col">{filteredTx.length.toLocaleString()}</td></tr>
                    <tr><td className="head-col">Matching Search String</td><td className="val-col">{searchTerm ? `"${searchTerm}"` : "NONE"}</td></tr>
                    <tr><td className="head-col">Targeted Flow Allocation</td><td className="val-col">{filterType}</td></tr>
                    <tr><td className="head-col">Targeted Status Filter</td><td className="val-col">{filterStatus}</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <div className="report-title">Ecosystem Health Today</div>
                <table className="report-table">
                  <tbody>
                    <tr><td className="head-col">Total Operations Today</td><td className="val-col">{kpis.totalToday.toLocaleString()}</td></tr>
                    <tr><td className="head-col">Gross Today Volume</td><td className="val-col">₱{kpis.volumeToday.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
                    <tr><td className="head-col">Mean Execution Size</td><td className="val-col">₱{kpis.avgSize.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
                    <tr><td className="head-col">Failed Operations Count</td><td className="val-col" style={{ color: "#dc2626" }}>{kpis.failedToday.toLocaleString()}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="pdf-footer-marker">Page 1 — Lux PH Global Ledger Audit Template</div>
        </div>

        {tableChunks.map((chunk, pageIndex) => (
          <div key={`page-${pageIndex + 2}`} className="pdf-page pdf-page-container" style={{ width: pageW, height: pageH, background: "#ffffff" }}>
            <div className="pdf-table-wrapper">
              <div style={{ borderBottom: "3px solid #111827", paddingBottom: 16, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div><h1 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 4px 0", color: "#111827", textTransform: "uppercase" }}>Audit Flow Breakdown</h1></div>
                <div style={{ textAlign: "right", fontSize: 14, fontWeight: 800, color: "#111827" }}>{getReportDateLabel().toUpperCase()}</div>
              </div>

              <div className="report-title">Filtered Transaction Entry Stream (Part {pageIndex + 1} of {tableChunks.length})</div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th style={{ width: showFullHash ? "26%" : "16%" }}>Tx Hash / ID</th>
                    <th style={{ width: "12%" }}>Flow</th>
                    <th style={{ width: "20%" }}>Merchant</th>
                    <th style={{ width: "14%", textAlign: "right" }}>Amount</th>
                    <th style={{ width: "10%" }}>Token</th>
                    <th style={{ width: "12%" }}>Status</th>
                    <th style={{ width: "16%" }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((tx, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "monospace", fontSize: showFullHash ? "9px" : "11px", wordBreak: "break-all" }} className="head-col">
                        {showFullHash ? tx.fullHash : tx.hash}
                      </td>
                      <td><span style={{ fontSize: "10px", fontWeight: 800 }}>{tx.type}</span></td>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.merchant}</td>
                      <td className="val-col">
                        {tx.type === "OUTFLOW" || tx.type === "CASHOUT" ? "-" : "+"}₱{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ fontFamily: "monospace", fontSize: "11px", fontWeight: 700 }}>{tx.token}</td>
                      <td>
                        <span style={{ fontWeight: 800, fontSize: "11px", color: getStatusColor(tx.status) }}>
                          {tx.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontSize: "11px", color: "#4b5563" }}>{tx.date.toLocaleString('en-US', { hour12: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pdf-footer-marker">Page {pageIndex + 2} — Lux PH Global Ledger Audit Template</div>
          </div>
        ))}
      </div>

      <div className="tx-header-block">
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>Global Ledger</h1>
          <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>Platform-wide omni-channel transaction log</p>
        </div>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowFullHash(!showFullHash)}
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
              color: "#e5e7eb", padding: "10px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "'Nunito',sans-serif", display: "inline-flex", alignItems: "center", gap: 6, transition: "all 0.2s", marginRight: 12
            }}
          >
            <span>{showFullHash ? "👁 Compact Hashes" : "👁 Expand Hashes"}</span>
          </button>

          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={isLoading || filteredTx.length === 0}
            style={{
              background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", border: "none",
              padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 800,
              cursor: (isLoading || filteredTx.length === 0) ? "not-allowed" : "pointer",
              boxShadow: "0 4px 12px rgba(37,99,235,0.3)", opacity: filteredTx.length === 0 ? 0.5 : 1,
              display: "inline-flex", alignItems: "center", gap: 8
            }}
          >
            <span>⬇ Download / Print ({filteredTx.length})</span>
            <span style={{ fontSize: 10 }}>▼</span>
          </button>

          <AnimatePresence>
            {showExportMenu && (
              <>
                <div onClick={() => setShowExportMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 998 }} />
                <motion.div
                  initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                  style={{
                    position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#1f2937",
                    border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)",
                    zIndex: 999, width: 200, overflow: "hidden"
                  }}
                >
                  <button
                    onClick={() => { setShowExportMenu(false); setShowPrintModal(true); }}
                    style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 16px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "background 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <span>📄</span> Export PDF Report
                  </button>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
                  <button
                    onClick={handleExportCSV}
                    style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "12px 16px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "background 0.2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <span>📊</span> Export filtered to Excel
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="tx-kpi-grid">
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

      <div className="tx-filters-panel">
        <div className="tx-filters-row">
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, padding: "8px 12px", minWidth: "260px", flex: 1 }}>
            <span style={{ color: "#6b7280" }}>⌕</span>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search hash, merchant, status..."
              style={{ background: "none", border: "none", color: "#e5e7eb", fontSize: 13, outline: "none", width: "100%", fontFamily: "'Nunito',sans-serif" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ background: "#1f2937", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, color: "#fff", padding: "8px 12px", fontSize: 13, outline: "none", cursor: "pointer" }}
            >
              <option value="ALL">All Flows</option>
              <option value="INFLOW">INFLOW</option>
              <option value="OUTFLOW">OUTFLOW</option>
              <option value="CASHOUT">CASHOUT</option>
            </select>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ background: "#1f2937", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, color: "#fff", padding: "8px 12px", fontSize: 13, outline: "none", cursor: "pointer" }}
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.06)", padding: "4px 10px", borderRadius: 8 }}>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ background: "none", border: "none", color: "#fff", fontSize: 12, outline: "none", colorScheme: "dark", cursor: "pointer" }}
            />
            <span style={{ fontSize: 11, color: "#9ca3af" }}>To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ background: "none", border: "none", color: "#fff", fontSize: 12, outline: "none", colorScheme: "dark", cursor: "pointer" }}
            />
          </div>

          {(searchTerm || filterType !== "ALL" || filterStatus !== "ALL" || startDate || endDate) && (
            <button
              onClick={handleClearFilters}
              style={{ background: "transparent", border: "1px dashed rgba(248,113,113,0.4)", color: "#f87171", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
            >
              Clear Filters ✕
            </button>
          )}
        </div>
      </div>

      <div className="tx-table-wrapper">
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
              style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#6b7280", fontSize: 13, padding: "40px 0" }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
              No transactions match your active filters.
            </motion.div>
          ) : (
            <motion.table
              key="table"
              className="tx-table"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            >
              <TableHead cols={["Tx Hash / ID", "Flow", "Merchant", "Amount", "Token/Gateway", "Status", "Block Time", "Action"]} />
              <tbody>
                {filteredTx.map((tx, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                    <td style={{
                      padding: "13px 16px",
                      fontFamily: "'DM Mono',monospace",
                      fontSize: showFullHash ? 11 : 12,
                      color: "#9ca3af",
                      width: "180px",
                      wordBreak: "break-all"
                    }}>
                      {showFullHash ? tx.fullHash : tx.hash}
                    </td>
                    <td style={{ padding: "13px 16px", width: "90px" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: "3px 6px", borderRadius: 4, letterSpacing: "0.05em",
                        background: tx.type === "INFLOW" ? "rgba(16,185,129,0.1)" : tx.type === "OUTFLOW" ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.1)",
                        color: tx.type === "INFLOW" ? "#10b981" : tx.type === "OUTFLOW" ? "#f59e0b" : "#3b82f6"
                      }}>
                        {tx.type}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: 13, color: "#e5e7eb", fontWeight: 600, width: "180px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.merchant}</td>
                    <td className="text-right-aligned" style={{ padding: "13px 16px", fontWeight: 800, color: "#fff", fontSize: 13, fontFamily: "'DM Mono', monospace", width: "120px" }}>
                      {tx.type === "OUTFLOW" || tx.type === "CASHOUT" ? "-" : "+"}₱{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "13px 16px", fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#9ca3af", fontWeight: 700, width: "110px" }}>{tx.token}</td>
                    <td style={{ padding: "13px 16px", width: "100px" }}>
                      <span style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "4px 8px",
                        borderRadius: 6,
                        letterSpacing: "0.03em",
                        background: `${getStatusColor(tx.status)}15`,
                        color: getStatusColor(tx.status),
                        border: `1px solid ${getStatusColor(tx.status)}30`,
                        display: "inline-block"
                      }}>
                        {tx.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "13px 16px", fontSize: 11, color: "#6b7280", fontWeight: 600, width: "90px" }}>{tx.timeAgo}</td>

                    <td className="text-center-aligned" style={{ padding: "13px 16px", width: "80px" }}>
                      {tx.fullHash && tx.fullHash.length === 64 ? (
                        <a
                          href={`https://stellar.expert/explorer/${networkEnvironment}/tx/${tx.fullHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#60a5fa",
                            textDecoration: "none",
                            fontSize: 12,
                            fontWeight: 700,
                            background: "rgba(59,130,246,0.1)",
                            padding: "4px 8px",
                            borderRadius: 6,
                            transition: "all 0.2s",
                            display: "inline-block"
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(59,130,246,0.2)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(59,130,246,0.1)"}
                        >
                          Explore ↗
                        </a>
                      ) : (
                        <span style={{ color: "#4b5563", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>Internal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </motion.table>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showPrintModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPrintModal(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, width: 400, position: "relative", zIndex: 10, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}>
              <h2 style={{ margin: "0 0 8px 0", color: "#fff", fontSize: 20, fontFamily: "'Nunito', sans-serif" }}>Export Ledger PDF</h2>
              <p style={{ color: "#9ca3af", fontSize: 13, margin: "0 0 24px 0" }}>This will construct a multi-page, pure-white tabular report of your filtered transactional ledger sequence.</p>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: "block", fontSize: 11, color: "#d1d5db", marginBottom: 8, fontWeight: 700, letterSpacing: "0.05em", fontFamily: "'DM Mono', monospace" }}>PAGE ORIENTATION (A4)</label>
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => setPrintOrientation("portrait")} style={{ flex: 1, background: printOrientation === "portrait" ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${printOrientation === "portrait" ? "#3b82f6" : "rgba(255,255,255,0.1)"}`, color: "#fff", padding: "12px", borderRadius: 10, cursor: "pointer", transition: "all 0.2s" }}>📄 Portrait</button>
                  <button onClick={() => setPrintOrientation("landscape")} style={{ flex: 1, background: printOrientation === "landscape" ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.02)", border: `1px solid ${printOrientation === "landscape" ? "#3b82f6" : "rgba(255,255,255,0.1)"}`, color: "#fff", padding: "12px", borderRadius: 10, cursor: "pointer", transition: "all 0.2s" }}>🖺 Landscape</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => setShowPrintModal(false)} disabled={isGeneratingPdf} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", borderRadius: 10, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                <button onClick={generatePDF} disabled={isGeneratingPdf} style={{ flex: 1, padding: "12px", background: isGeneratingPdf ? "#4b5563" : "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", color: "#fff", borderRadius: 10, cursor: isGeneratingPdf ? "wait" : "pointer", fontWeight: "bold" }}>
                  {isGeneratingPdf ? "Constructing Pages..." : "Download PDF"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}