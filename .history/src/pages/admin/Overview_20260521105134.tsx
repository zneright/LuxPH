// ==========================================
// 1. IMPORTS & STRUCTURAL TYPE DEFINITIONS
// ==========================================
import { useState, useEffect, useRef } from "react";
import { collection, getDocs, collectionGroup, doc, getDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { KpiCard } from "../../components/admin/AdminUi";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

type TimeFilter = "today" | "7d" | "30d" | "all" | "custom";
type PrintOrientation = "portrait" | "landscape";

interface ChartBucket {
  inflow: number;
  outflow: number;
  cashout: number;
  total: number;
  label: string;
}

// ==========================================
// 2. HELPER COMPONENTS
// ==========================================
const MiniBar = ({ label, value, max, color }: { label: string, value: number, max: number, color: string }) => {
  const percent = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9ca3af", marginBottom: 6, fontFamily: "'DM Mono',monospace" }}>
        <span>{label}</span>
        <span style={{ color: "#fff", fontWeight: 600 }}>{value.toLocaleString()}</span>
      </div>
      <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 1, delay: 0.2 }} style={{ height: "100%", background: color }} />
      </div>
    </div>
  );
};

// ==========================================
// 3. MAIN COMPONENT
// ==========================================
export default function Overview() {
  // --- STATE SYSTEM ---
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const [timeFilter, setTimeFilter] = useState<TimeFilter>("30d");
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0];
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split("T")[0]);

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>("portrait");
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  // Real dynamic value synced straight from network configuration nodes
  const [proTierFee, setProTierFee] = useState<number>(499);

  const [stats, setStats] = useState({
    totalMerchants: 0, proCount: 0, freeCount: 0,
    globalInflow: 0, globalOutflow: 0, globalCashout: 0,
    txSuccess: 0, txFailed: 0, transactionsToday: 0,
    tokens: { phpc: 0, usdc: 0, xlm: 0, total: 0 },
    routing: { bank: 0, gcash: 0, qr: 0, total: 0 },
    trendChart: [] as ChartBucket[],
    rxSpeeds: { net: "0.00", wait: "0.00" },
    txSpeeds: { net: "0.00", wait: "0.00" },
    cxSpeeds: { net: "0.00", wait: "0.00" },
  });

  // --- OPTIMIZED NETWORK SYNC SYNDICATION ---
  useEffect(() => {
    const fetchGlobalNetworkData = async () => {
      setIsLoading(true);
      try {
        // 1. First sync standard business variables to get exact premium tier fee structures
        const systemConfigRef = doc(db, "system_config", "global");
        const systemConfigSnap = await getDoc(systemConfigRef);
        if (systemConfigSnap.exists() && systemConfigSnap.data().proTierMonthlyFee) {
          setProTierFee(Number(systemConfigSnap.data().proTierMonthlyFee));
        }

        // 2. Fetch Base Merchants Document Array to calculate user split metrics
        const merchSnap = await getDocs(collection(db, "merchants"));
        let totalMerchants = merchSnap.size;
        let proCount = 0;
        merchSnap.docs.forEach(doc => {
          if (doc.data().isSubscribed === true) proCount++;
        });

        // 3. SECURED HIGH PERFORMANCE DATA FETCH via safe sub-collection groups
        // Replaces the heavy N+1 nested map pipeline entirely
        const [allInvoices, allPayments, allCashouts] = await Promise.all([
          getDocs(collectionGroup(db, "invoices")),
          getDocs(collectionGroup(db, "payments")),
          getDocs(collectionGroup(db, "cashouts"))
        ]);

        let txToday = 0;
        let tIn = 0, tOut = 0, tCash = 0, tSuccess = 0, tFail = 0;
        let phpc = 0, usdc = 0, xlm = 0, bank = 0, gcash = 0, qr = 0;

        let rxNetTotal = 0, rxWaitTotal = 0, rxSpeedCount = 0;
        let txNetTotal = 0, txWaitTotal = 0, txSpeedCount = 0;
        let cxNetTotal = 0, cxWaitTotal = 0, cxSpeedCount = 0;

        const now = new Date();
        const todayStr = now.toDateString();

        let startCutoff = new Date();
        startCutoff.setHours(0, 0, 0, 0);
        let endCutoff = new Date();

        if (timeFilter === "7d") startCutoff.setDate(startCutoff.getDate() - 6);
        else if (timeFilter === "30d") startCutoff.setDate(startCutoff.getDate() - 29);
        else if (timeFilter === "custom") {
          startCutoff = new Date(customStart + "T00:00:00");
          endCutoff = new Date(customEnd + "T23:59:59");
        } else if (timeFilter === "all") startCutoff = new Date(0);

        const msSpan = endCutoff.getTime() - startCutoff.getTime();
        let bucketCount = timeFilter === "today" ? 24 : timeFilter === "7d" ? 7 : timeFilter === "30d" ? 30 : 12;
        let bucketSize = timeFilter === "today" ? 1000 * 60 * 60 : timeFilter === "7d" || timeFilter === "30d" ? 1000 * 60 * 60 * 24 : msSpan / 12 || 1;

        const buckets: ChartBucket[] = Array.from({ length: bucketCount }, (_, i) => {
          const d1 = new Date(startCutoff.getTime() + i * bucketSize);
          let label = timeFilter === 'today' ? `${d1.getHours()}:00` : d1.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return { inflow: 0, outflow: 0, cashout: 0, total: 0, label };
        });

        // Unified transaction processing engine block
        const parseTransactionNode = (docData: any, type: "in" | "out" | "cash") => {
          if (!docData.timestamp) return;

          // Secure Firestore Timestamp conversion utility fallback for production reliability
          const txDate = docData.timestamp instanceof Timestamp ? docData.timestamp.toDate() : new Date(docData.timestamp);
          if (txDate.toDateString() === todayStr) txToday++;

          if (txDate.getTime() < startCutoff.getTime() || txDate.getTime() > endCutoff.getTime()) return;

          const amt = parseFloat(docData.fiatAmount || docData.amountToken || docData.amount || "0");

          if (docData.status === "failed" || docData.status === "cancelled") {
            tFail++; return;
          }
          tSuccess++;

          const elapsed = txDate.getTime() - startCutoff.getTime();
          const bucketIndex = Math.min(bucketCount - 1, Math.max(0, Math.floor(elapsed / bucketSize)));

          if (!isNaN(bucketIndex) && buckets[bucketIndex]) {
            buckets[bucketIndex].total += amt;
            if (type === "in") buckets[bucketIndex].inflow += amt;
            else if (type === "out") buckets[bucketIndex].outflow += amt;
            else if (type === "cash") buckets[bucketIndex].cashout += amt;
          }

          if (type === "in") {
            tIn += amt;
            if (docData.token === "PHPC") phpc += amt;
            else if (docData.token === "USDC") usdc += amt;
            else if (docData.token === "XLM") xlm += amt;

            if (docData.networkSpeedSeconds && docData.networkSpeedSeconds > 0) {
              rxNetTotal += docData.networkSpeedSeconds;
              rxWaitTotal += (docData.totalWaitTimeSeconds || docData.networkSpeedSeconds);
              rxSpeedCount++;
            }
          } else if (type === "out") {
            tOut += amt;
            if (docData.networkSpeedSeconds && docData.networkSpeedSeconds > 0) {
              txNetTotal += docData.networkSpeedSeconds;
              txWaitTotal += (docData.totalWaitTimeSeconds || docData.networkSpeedSeconds);
              txSpeedCount++;
            }
          } else if (type === "cash") {
            tCash += amt;
            if (docData.payoutMethod === "bank") bank++;
            else if (docData.payoutMethod === "gcash") gcash++;
            else if (docData.payoutMethod === "qr") qr++;

            if (docData.networkSpeedSeconds && docData.networkSpeedSeconds > 0) {
              cxNetTotal += docData.networkSpeedSeconds;
              cxWaitTotal += (docData.totalWaitTimeSeconds || docData.networkSpeedSeconds);
              cxSpeedCount++;
            }
          }
        };

        allInvoices.docs.forEach(d => parseTransactionNode(d.data(), "in"));
        allPayments.docs.forEach(d => parseTransactionNode(d.data(), "out"));
        allCashouts.docs.forEach(d => parseTransactionNode(d.data(), "cash"));

        setStats({
          totalMerchants, proCount, freeCount: totalMerchants - proCount,
          globalInflow: tIn, globalOutflow: tOut, globalCashout: tCash,
          txSuccess: tSuccess, txFailed: tFail, transactionsToday: txToday,
          tokens: { phpc, usdc, xlm, total: (phpc + usdc + xlm) || 1 },
          routing: { bank, gcash, qr, total: (bank + gcash + qr) || 1 },
          trendChart: buckets,
          rxSpeeds: { net: rxSpeedCount > 0 ? (rxNetTotal / rxSpeedCount).toFixed(2) : "0.00", wait: rxSpeedCount > 0 ? (rxWaitTotal / rxSpeedCount).toFixed(2) : "0.00" },
          txSpeeds: { net: txSpeedCount > 0 ? (txNetTotal / txSpeedCount).toFixed(2) : "0.00", wait: txSpeedCount > 0 ? (txWaitTotal / txSpeedCount).toFixed(2) : "0.00" },
          cxSpeeds: { net: cxSpeedCount > 0 ? (cxNetTotal / cxSpeedCount).toFixed(2) : "0.00", wait: cxSpeedCount > 0 ? (cxWaitTotal / cxSpeedCount).toFixed(2) : "0.00" }
        });

      } catch (error) {
        console.error("GLOBAL_METRICS_CRITICAL_INDEX_CRAH:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGlobalNetworkData();
  }, [timeFilter, customStart, customEnd]);

  // --- DERIVED INTELLIGENCE CALCULATIONS ---
  const mrr = stats.proCount * proTierFee;
  const globalTVL = stats.globalInflow + stats.globalOutflow + stats.globalCashout;
  const pPHPC = Math.round((stats.tokens.phpc / stats.tokens.total) * 100) || 0;
  const pUSDC = Math.round((stats.tokens.usdc / stats.tokens.total) * 100) || 0;
  const pXLM = Math.max(0, 100 - pPHPC - pUSDC);
  const hasData = globalTVL > 0;
  const maxChartValue = Math.max(...stats.trendChart.map(b => b.total), 1);

  const getReportDateLabel = () => {
    if (timeFilter === "custom") return `${customStart} to ${customEnd}`;
    if (timeFilter === "today") return new Date().toDateString();
    return `Last ${timeFilter.toUpperCase()}`;
  };

  const tableChunks = [];
  for (let i = 0; i < stats.trendChart.length; i += 22) {
    tableChunks.push(stats.trendChart.slice(i, i + 22));
  }

  // --- PDF REPORT COMPILATION DISPATCHER ---
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
      pdf.save(`LuxPH_Ecosystem_Audit_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err) {
      console.error("PDF_EXPORT_ERROR:", err);
    } finally {
      setIsGeneratingPdf(false);
      setShowPrintModal(false);
    }
  };

  const pageW = printOrientation === "portrait" ? "794px" : "1123px";
  const pageH = printOrientation === "portrait" ? "1123px" : "794px";

  return (
    <>
      {/* Dynamic Master Breakpoint Styles Layer for True Mobile Optimization */}
      <style>{`
        .report-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; color: #1f2937; }
        .report-table th { background-color: #f3f4f6; color: #374151; padding: 12px; border: 1px solid #e5e7eb; font-weight: 800; text-transform: uppercase; font-size: 11px; }
        .report-table td { padding: 12px; border: 1px solid #e5e7eb; }
        .report-table tr:nth-child(even) { background-color: #f9fafb; }
        .val-col { text-align: right; font-weight: 700; font-family: 'DM Mono', monospace; }
        .head-col { font-weight: 600; color: #111827; }
        .report-title { font-size: 16px; font-weight: 800; color: #111827; margin-bottom: 8px; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
        
        /* RESPONSIVE LAYOUT ENGINE BREAKPOINTS */
        .grid-responsive-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
        .grid-responsive-split { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; margin-bottom: 16px; }
        .grid-responsive-equal { display: grid; grid-template-columns: 1.5fr 1fr; gap: 16px; }
        .asset-box-inner { display: flex; gap: 32px; align-items: center; position: relative; }

        @media (max-width: 992px) {
          .grid-responsive-split, .grid-responsive-equal { grid-template-columns: 1fr; }
        }
        @media (max-width: 768px) {
          .grid-responsive-3 { grid-template-columns: 1fr; }
          .asset-box-inner { flex-direction: column; text-align: center; gap: 20px; }
        }
      `}</style>

      {/* ======================================================================
          BACKEND PDF REPORT GENERATION CANVAS (HIDDEN)
          ====================================================================== */}
      <div ref={pdfRef} style={{ display: "none", position: "absolute", top: 0, left: 0, zIndex: -100 }}>
        <div className="pdf-page" style={{ width: pageW, height: pageH, background: "#ffffff", padding: "40px 50px", boxSizing: "border-box", color: "#111827", position: "relative" }}>
          <div style={{ borderBottom: "3px solid #111827", paddingBottom: 16, marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 4px 0", textTransform: "uppercase" }}>Platform Intelligence Report</h1>
              <div style={{ color: "#4b5563", fontSize: 13 }}>Generated on: {new Date().toLocaleString()}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, textTransform: "uppercase" }}>Reporting Period</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{getReportDateLabel().toUpperCase()}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 16 }}>
            <div>
              <div className="report-title">Ecosystem Overview</div>
              <table className="report-table">
                <tbody>
                  <tr><td className="head-col">Processed Volume (TVL)</td><td className="val-col">₱{globalTVL.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
                  <tr><td className="head-col">Registered Merchants</td><td className="val-col">{stats.totalMerchants.toLocaleString()}</td></tr>
                  <tr><td className="head-col">Pro Tier Subscribers</td><td className="val-col">{stats.proCount.toLocaleString()}</td></tr>
                  <tr><td className="head-col">Estimated Platform MRR</td><td className="val-col">₱{mrr.toLocaleString()}</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <div className="report-title">Transaction Health Summary</div>
              <table className="report-table">
                <tbody>
                  <tr><td className="head-col">Transactions Logged</td><td className="val-col">{(stats.txSuccess + stats.txFailed).toLocaleString()}</td></tr>
                  <tr><td className="head-col">Successful Completions</td><td className="val-col" style={{ color: "#059669" }}>{stats.txSuccess.toLocaleString()}</td></tr>
                  <tr><td className="head-col">Failed / Cancelled</td><td className="val-col" style={{ color: "#dc2626" }}>{stats.txFailed.toLocaleString()}</td></tr>
                  <tr><td className="head-col">Platform Success Rate</td><td className="val-col" style={{ color: "#059669" }}>{((stats.txSuccess / Math.max(stats.txSuccess + stats.txFailed, 1)) * 100).toFixed(2)}%</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="report-title">Liquidity Performance Metrics</div>
          <table className="report-table" style={{ marginBottom: 24 }}>
            <thead>
              <tr><th>Directional Flow</th><th style={{ textAlign: "right" }}>Total Volume (PHP)</th><th style={{ textAlign: "right" }}>Avg Network Speed</th><th style={{ textAlign: "right" }}>Avg Human Wait Time</th></tr>
            </thead>
            <tbody>
              <tr><td className="head-col" style={{ borderLeft: "4px solid #10b981" }}>Platform Inflow</td><td className="val-col">₱{stats.globalInflow.toLocaleString()}</td><td className="val-col">{stats.rxSpeeds.net} sec</td><td className="val-col">{stats.rxSpeeds.wait} sec</td></tr>
              <tr><td className="head-col" style={{ borderLeft: "4px solid #f59e0b" }}>B2B Outflow</td><td className="val-col">₱{stats.globalOutflow.toLocaleString()}</td><td className="val-col">{stats.txSpeeds.net} sec</td><td className="val-col">{stats.txSpeeds.wait} sec</td></tr>
              <tr><td className="head-col" style={{ borderLeft: "4px solid #3b82f6" }}>Off-Ramp Liquidity</td><td className="val-col">₱{stats.globalCashout.toLocaleString()}</td><td className="val-col">{stats.cxSpeeds.net} sec</td><td className="val-col">{stats.cxSpeeds.wait} sec</td></tr>
            </tbody>
          </table>
          <div style={{ position: "absolute", bottom: 40, left: 50, right: 50, paddingTop: 16, borderTop: "1px solid #e5e7eb", fontSize: 10, color: "#9ca3af", textAlign: "center" }}>Lux PH Administration Network Intelligence Ledger</div>
        </div>
      </div>

      {/* ======================================================================
          MAIN INTERACTIVE ACTIVE DASHBOARD INTERFACE
          ====================================================================== */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} style={{ padding: "4px" }}>

        {/* HEADER CONTROLS LAYOUT ROW */}
        <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 900, color: "#fff", marginBottom: 4, letterSpacing: "-0.02em" }}>Ecosystem Overview</h1>
            <p style={{ color: "#9ca3af", fontSize: 13, margin: 0 }}>Global Settlement Layer Operations Center</p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <AnimatePresence>
              {timeFilter === "custom" && (
                <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: "auto", opacity: 1 }} exit={{ width: 0, opacity: 0 }} style={{ display: "flex", gap: 6, overflow: "hidden" }}>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: "8px 12px", borderRadius: 8, colorScheme: "dark" }} />
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", padding: "8px 12px", borderRadius: 8, colorScheme: "dark" }} />
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ display: "flex", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", padding: 4, borderRadius: 10, flexWrap: "wrap" }}>
              {(["today", "7d", "30d", "all", "custom"] as TimeFilter[]).map((tf) => (
                <button key={tf} onClick={() => setTimeFilter(tf)} style={{ background: timeFilter === tf ? "rgba(124,58,237,0.8)" : "transparent", color: timeFilter === tf ? "#fff" : "#9ca3af", border: "none", padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>{tf}</button>
              ))}
            </div>

            <button onClick={() => setShowPrintModal(true)} style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>📄 Export Ledger</button>
          </div>
        </div>

        {/* ECOSYSTEM MONITOR VIEW CONDITIONAL PORTAL */}
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "40vh" }}>
              <LoadingBadge text={`Compiling ${timeFilter.toUpperCase()} Block Indices...`} variant="network" />
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

              {/* top metrics strip */}
              <div className="grid-responsive-3">
                <KpiCard label="Total Core Merchants" value={stats.totalMerchants.toLocaleString()} sub='<span style="color:#4ade80">Active Cryptographic Terminals</span>' />
                <KpiCard label={`Volume Index (${timeFilter.toUpperCase()})`} value={`₱${globalTVL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub='Aggregated Cross-Border Flow' />
                <KpiCard label="System MRR Projection" value={`₱${mrr.toLocaleString()}`} sub={`${stats.proCount} Nodes Settling Commercially`} />
              </div>

              {/* charts visualization grid matrix */}
              <div className="grid-responsive-split">

                {/* 3D-feeling micro chart layout column */}
                <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", position: "relative" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Dynamic Flow Velocities</h3>
                  <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#9ca3af", marginBottom: 24, fontFamily: "'DM Mono', monospace" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, background: "#10b981", borderRadius: 2 }} />Inflow</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, background: "#f59e0b", borderRadius: 2 }} />Outflow</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, background: "#3b82f6", borderRadius: 2 }} />Cashout</span>
                  </div>

                  {hasData ? (
                    <>
                      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 6, height: 180, borderBottom: "1px solid rgba(255,255,255,.08)", paddingBottom: 6, position: "relative" }}>
                        <AnimatePresence>
                          {hoveredBar !== null && stats.trendChart[hoveredBar] && (
                            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} style={{ position: "absolute", bottom: "80%", left: "10%", background: "#1f2937", border: "1px solid rgba(124,58,237,0.4)", padding: "12px", borderRadius: 8, zIndex: 50, minWidth: "140px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.7)" }}>
                              <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 4 }}>{stats.trendChart[hoveredBar].label}</div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}><span style={{ color: "#10b981" }}>Inflow</span><span style={{ color: "#fff" }}>₱{stats.trendChart[hoveredBar].inflow.toLocaleString()}</span></div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}><span style={{ color: "#f59e0b" }}>Outflow</span><span style={{ color: "#fff" }}>₱{stats.trendChart[hoveredBar].outflow.toLocaleString()}</span></div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}><span style={{ color: "#3b82f6" }}>Cashout</span><span style={{ color: "#fff" }}>₱{stats.trendChart[hoveredBar].cashout.toLocaleString()}</span></div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 4, fontWeight: 700 }}><span style={{ color: "#a78bfa" }}>Gross Total</span><span style={{ color: "#fff" }}>₱{stats.trendChart[hoveredBar].total.toLocaleString()}</span></div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {stats.trendChart.map((bucket, i) => {
                          const hPct = (bucket.total / maxChartValue) * 100;
                          return (
                            <div key={i} onMouseEnter={() => setHoveredBar(i)} onMouseLeave={() => setHoveredBar(null)} style={{ flex: 1, height: `${Math.max(hPct, 3)}%`, display: "flex", flexDirection: "column-reverse", borderRadius: "3px 3px 0 0", overflow: "hidden", background: "rgba(255,255,255,0.03)", cursor: "pointer", opacity: hoveredBar === null || hoveredBar === i ? 1 : 0.4, transition: "opacity 0.2s" }}>
                              <div style={{ height: `${bucket.total > 0 ? (bucket.inflow / bucket.total) * 100 : 0}%`, background: "#10b981" }} />
                              <div style={{ height: `${bucket.total > 0 ? (bucket.outflow / bucket.total) * 100 : 0}%`, background: "#f59e0b" }} />
                              <div style={{ height: `${bucket.total > 0 ? (bucket.cashout / bucket.total) * 100 : 0}%`, background: "#3b82f6" }} />
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b7280", fontFamily: "'DM Mono',monospace", marginTop: 10 }}>
                        <span>{stats.trendChart[0]?.label}</span>
                        <span>{stats.trendChart[Math.floor(stats.trendChart.length / 2)]?.label}</span>
                        <span>{stats.trendChart[stats.trendChart.length - 1]?.label}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 12, height: 180 }}>
                      <span style={{ fontSize: 13, color: "#6b7280", fontFamily: "'DM Mono',monospace" }}>Awaiting Settlement Signatures...</span>
                    </div>
                  )}
                </div>

                {/* Network Metrics Velocities Block */}
                <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 16, padding: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 20 }}>Settlement Velocities</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {["PLATFORM INFLOW", "B2B OUTFLOW", "OFF-RAMP LIQUIDITY"].map((label, index) => {
                      const speedNode = index === 0 ? stats.rxSpeeds : index === 1 ? stats.txSpeeds : stats.cxSpeeds;
                      const volVal = index === 0 ? stats.globalInflow : index === 1 ? stats.globalOutflow : stats.globalCashout;
                      const hueColor = index === 0 ? "#10b981" : index === 1 ? "#f59e0b" : "#3b82f6";
                      return (
                        <div key={label} style={{ borderLeft: `3px solid ${hueColor}`, paddingLeft: 12 }}>
                          <span style={{ fontSize: 10, color: hueColor, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{label}</span>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "2px 0" }}>₱{volVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#9ca3af", fontFamily: "'DM Mono',monospace" }}>
                            <span>⚡ Core: {speedNode.net}s</span><span>⏱ Latency: {speedNode.wait}s</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* split details row */}
              <div className="grid-responsive-equal">

                {/* SVG circular donut allocation asset layout component */}
                <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 16, padding: 24 }}>
                  <div className="asset-box-inner">
                    <div style={{ position: "relative", width: 110, height: 110, flexShrink: 0 }}>
                      <svg viewBox="0 0 36 36" width={110} height={110} style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
                        {hasData && (
                          <>
                            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#10b981" strokeWidth="4" strokeDasharray={`${pPHPC} ${100 - pPHPC}`} />
                            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#3b82f6" strokeWidth="4" strokeDasharray={`${pUSDC} ${100 - pUSDC}`} strokeDashoffset={-pPHPC} />
                            <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#8b5cf6" strokeWidth="4" strokeDasharray={`${pXLM} ${100 - pXLM}`} strokeDashoffset={-(pPHPC + pUSDC)} />
                          </>
                        )}
                      </svg>
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⛓️</div>
                    </div>

                    <div style={{ flex: 1, width: "100%" }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Liquidity Spread</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {[{ c: "#10b981", l: "PHPC", p: pPHPC, v: stats.tokens.phpc }, { c: "#3b82f6", l: "USDC", p: pUSDC, v: stats.tokens.usdc }, { c: "#8b5cf6", l: "XLM", p: pXLM, v: stats.tokens.xlm }].map(asset => (
                          <div key={asset.l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.12)", padding: "6px 12px", borderRadius: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: asset.c }} /><span style={{ fontSize: 12, color: "#9ca3af" }}>{asset.l} ({asset.p}%)</span></div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "'DM Mono',monospace" }}>₱{asset.v.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mini bar chart preferences layout container */}
                <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 16, padding: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 16 }}>Gateway Off-Ramp Distribution</h3>
                  {hasData ? (
                    <>
                      <MiniBar label="Bank Transfers (InstaPay)" value={stats.routing.bank} max={stats.routing.total} color="#3b82f6" />
                      <MiniBar label="GCash Disbursals" value={stats.routing.gcash} max={stats.routing.total} color="#10b981" />
                      <MiniBar label="QR Ph Unified Rails" value={stats.routing.qr} max={stats.routing.total} color="#f59e0b" />
                    </>
                  ) : (
                    <div style={{ textAlign: "center", color: "#6b7280", fontSize: 12, paddingTop: 30, fontFamily: "'DM Mono', monospace" }}>No Routing Indexes Found</div>
                  )}
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* ======================================================================
            PDF COMPILATION SELECTION DIALOG MODAL Overlay
            ====================================================================== */}
        <AnimatePresence>
          {showPrintModal && (
            <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPrintModal(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} />
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24, width: "100%", maxWidth: "380px", position: "relative", zIndex: 10 }}>
                <h2 style={{ margin: "0 0 6px 0", color: "#fff", fontSize: 18 }}>Export Audit Ledger</h2>
                <p style={{ color: "#9ca3af", fontSize: 13, margin: "0 0 20px 0" }}>Compiling standard clear-print accounting pages for period: {getReportDateLabel()}.</p>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 10, color: "#9ca3af", marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>A4 SHEET ORIENTATION</label>
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
      </motion.div>
    </>
  );
}