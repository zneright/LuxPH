// ==========================================
// 1. IMPORTS
// ==========================================
import { useState, useEffect, useRef } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../config/firebase";
import { KpiCard } from "../../components/admin/AdminUi";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ==========================================
// 2. TYPES & INTERFACES
// ==========================================
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
// 3. HELPER COMPONENTS
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
// 4. MAIN OVERVIEW COMPONENT
// ==========================================
export default function Overview() {

  // --- 4A. STATE MANAGEMENT ---
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  // Date Filters
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("30d");
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split("T")[0];
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split("T")[0]);

  // UI & Interaction
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printOrientation, setPrintOrientation] = useState<PrintOrientation>("portrait");
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);

  // Core Data Matrix
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

  // --- 4B. DATA FETCHING (NETWORK SYNC) ---
  useEffect(() => {
    const fetchGlobalNetworkData = async () => {
      setIsLoading(true);
      try {
        const merchSnap = await getDocs(collection(db, "merchants"));

        let totalMerchants = 0, proCount = 0, txToday = 0;
        let tIn = 0, tOut = 0, tCash = 0, tSuccess = 0, tFail = 0;
        let phpc = 0, usdc = 0, xlm = 0, bank = 0, gcash = 0, qr = 0;

        let rxNetTotal = 0, rxWaitTotal = 0, rxSpeedCount = 0;
        let txNetTotal = 0, txWaitTotal = 0, txSpeedCount = 0;
        let cxNetTotal = 0, cxWaitTotal = 0, cxSpeedCount = 0;

        const now = new Date();
        const todayStr = now.toDateString();

        let startCutoff = new Date();
        startCutoff.setHours(0, 0, 0, 0); // Normalize to midnight
        let endCutoff = new Date(); // now

        if (timeFilter === "today") {
          // startCutoff is already midnight today
        } else if (timeFilter === "7d") {
          startCutoff.setDate(startCutoff.getDate() - 6);
        } else if (timeFilter === "30d") {
          startCutoff.setDate(startCutoff.getDate() - 29);
        } else if (timeFilter === "custom") {
          startCutoff = new Date(customStart + "T00:00:00");
          endCutoff = new Date(customEnd + "T23:59:59");
        } else if (timeFilter === "all") {
          startCutoff = new Date(0); // Epoch
        }

        const msSpan = endCutoff.getTime() - startCutoff.getTime();
        let bucketCount = 12;
        let bucketSize = 1;

        // Make Buckets Dynamic based on selected filter
        if (timeFilter === "today") {
          bucketCount = 24;
          bucketSize = 1000 * 60 * 60; // 1 hour
        } else if (timeFilter === "7d") {
          bucketCount = 7;
          bucketSize = 1000 * 60 * 60 * 24; // 1 day
        } else if (timeFilter === "30d") {
          bucketCount = 30;
          bucketSize = 1000 * 60 * 60 * 24; // 1 day
        } else if (timeFilter === "custom") {
          const daysSpan = Math.max(1, Math.ceil(msSpan / (1000 * 60 * 60 * 24)));
          if (daysSpan <= 31) {
            bucketCount = daysSpan;
            bucketSize = 1000 * 60 * 60 * 24;
          } else {
            bucketCount = 12;
            bucketSize = msSpan / 12 || 1;
          }
        } else {
          bucketCount = 12;
          bucketSize = msSpan / 12 || 1;
        }

        // Initialize Dynamic Buckets
        const buckets: ChartBucket[] = Array.from({ length: bucketCount }, (_, i) => {
          const d1 = new Date(startCutoff.getTime() + i * bucketSize);
          let label = "";
          if (timeFilter === 'today') {
            label = `${d1.getHours()}:00`;
          } else if (bucketSize === 1000 * 60 * 60 * 24) {
            label = `${d1.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
          } else {
            label = `${d1.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}`;
          }
          return { inflow: 0, outflow: 0, cashout: 0, total: 0, label };
        });

        for (const mDoc of merchSnap.docs) {
          totalMerchants++;
          if (mDoc.data().isSubscribed) proCount++;
          const mId = mDoc.id;

          const [invSnap, paySnap, cashSnap] = await Promise.all([
            getDocs(collection(db, `merchants/${mId}/invoices`)),
            getDocs(collection(db, `merchants/${mId}/payments`)),
            getDocs(collection(db, `merchants/${mId}/cashouts`))
          ]);

          const processTx = (doc: any, type: "in" | "out" | "cash") => {
            const data = doc.data();
            if (!data.timestamp) return;

            const txDate = new Date(data.timestamp);
            if (txDate.toDateString() === todayStr) txToday++;

            if (txDate.getTime() < startCutoff.getTime() || txDate.getTime() > endCutoff.getTime()) return;

            const amt = parseFloat(data.fiatAmount || data.amountToken || data.amount || "0");

            if (data.status === "failed" || data.status === "cancelled") {
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
              if (data.token === "PHPC") phpc += amt;
              if (data.token === "USDC") usdc += amt;
              if (data.token === "XLM") xlm += amt;

              if (data.networkSpeedSeconds && data.networkSpeedSeconds > 0) {
                rxNetTotal += data.networkSpeedSeconds;
                rxWaitTotal += (data.totalWaitTimeSeconds || data.networkSpeedSeconds);
                rxSpeedCount++;
              }
            } else if (type === "out") {
              tOut += amt;
              if (data.networkSpeedSeconds && data.networkSpeedSeconds > 0) {
                txNetTotal += data.networkSpeedSeconds;
                txWaitTotal += (data.totalWaitTimeSeconds || data.networkSpeedSeconds);
                txSpeedCount++;
              }
            } else if (type === "cash") {
              tCash += amt;
              if (data.payoutMethod === "bank") bank++;
              if (data.payoutMethod === "gcash") gcash++;
              if (data.payoutMethod === "qr") qr++;

              if (data.networkSpeedSeconds && data.networkSpeedSeconds > 0) {
                cxNetTotal += data.networkSpeedSeconds;
                cxWaitTotal += (data.totalWaitTimeSeconds || data.networkSpeedSeconds);
                cxSpeedCount++;
              }
            }
          };

          invSnap.forEach(doc => processTx(doc, "in"));
          paySnap.forEach(doc => processTx(doc, "out"));
          cashSnap.forEach(doc => processTx(doc, "cash"));
        }

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
        console.error("Error fetching global overview data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGlobalNetworkData();
  }, [timeFilter, customStart, customEnd]);

  // --- 4C. DERIVED METRICS & CHUNKING ---
  const mrr = stats.proCount * 499;
  const globalTVL = stats.globalInflow + stats.globalOutflow + stats.globalCashout;
  const pPHPC = Math.round((stats.tokens.phpc / stats.tokens.total) * 100) || 0;
  const pUSDC = Math.round((stats.tokens.usdc / stats.tokens.total) * 100) || 0;
  const pXLM = 100 - pPHPC - pUSDC;
  const hasData = globalTVL > 0;
  const maxChartValue = Math.max(...stats.trendChart.map(b => b.total), 1);

  const getReportDateLabel = () => {
    if (timeFilter === "custom") return `${customStart} to ${customEnd}`;
    if (timeFilter === "today") return new Date().toDateString();
    if (timeFilter === "7d") return "Last 7 Days";
    if (timeFilter === "30d") return "Last 30 Days";
    return "All Time to Present";
  };

  const MAX_ROWS_PER_PAGE = 22;
  const tableChunks = [];
  for (let i = 0; i < stats.trendChart.length; i += MAX_ROWS_PER_PAGE) {
    tableChunks.push(stats.trendChart.slice(i, i + MAX_ROWS_PER_PAGE));
  }

  // --- 4D. PDF GENERATION LOGIC ---
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
      pdf.save(`LuxPH_Intelligence_Report_${new Date().toISOString().split("T")[0]}.pdf`);

    } catch (err) {
      console.error("Failed to generate PDF", err);
    } finally {
      setIsGeneratingPdf(false);
      setShowPrintModal(false);
    }
  };

  const pageW = printOrientation === "portrait" ? "794px" : "1123px";
  const pageH = printOrientation === "portrait" ? "1123px" : "794px";


  // --- 4E. RENDER ---
  return (
    <>
      <style>{`
        .report-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; color: #1f2937; }
        .report-table th { background-color: #f3f4f6; color: #374151; padding: 12px; text-align: left; border: 1px solid #e5e7eb; font-weight: 800; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
        .report-table td { padding: 12px; border: 1px solid #e5e7eb; }
        .report-table tr:nth-child(even) { background-color: #f9fafb; }
        .val-col { text-align: right; font-weight: 700; font-family: 'DM Mono', monospace; }
        .head-col { font-weight: 600; color: #111827; }
        .report-title { font-size: 16px; font-weight: 800; color: #111827; margin-bottom: 8px; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
      `}</style>

      {/* ======================================================================
          HIDDEN DYNAMIC PDF TEMPLATES 
          ====================================================================== */}
      <div ref={pdfRef} style={{ display: "none", position: "absolute", top: 0, left: 0, zIndex: -100 }}>

        {/* PAGE 1: KPI OVERVIEW */}
        <div className="pdf-page" style={{ width: pageW, height: pageH, background: "#ffffff", padding: "40px 50px", boxSizing: "border-box", color: "#111827", fontFamily: "'Nunito', sans-serif", position: "relative" }}>
          <div style={{ borderBottom: "3px solid #111827", paddingBottom: 16, marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 4px 0", color: "#111827", textTransform: "uppercase" }}>Platform Intelligence Report</h1>
              <div style={{ color: "#4b5563", fontSize: 13 }}>Generated on: {new Date().toLocaleString()}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Reporting Period</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{getReportDateLabel().toUpperCase()}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 16 }}>
            <div>
              <div className="report-title">Ecosystem Overview</div>
              <table className="report-table">
                <tbody>
                  <tr><td className="head-col">Total Processed Volume (TVL)</td><td className="val-col">₱{globalTVL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
                  <tr><td className="head-col">Total Registered Merchants</td><td className="val-col">{stats.totalMerchants.toLocaleString()}</td></tr>
                  <tr><td className="head-col">Pro Tier Subscribers</td><td className="val-col">{stats.proCount.toLocaleString()}</td></tr>
                  <tr><td className="head-col">Free Tier Merchants</td><td className="val-col">{stats.freeCount.toLocaleString()}</td></tr>
                  <tr><td className="head-col">Estimated Platform MRR</td><td className="val-col">₱{mrr.toLocaleString()}</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <div className="report-title">Transaction Health Summary</div>
              <table className="report-table">
                <tbody>
                  <tr><td className="head-col">Total Transactions Logged</td><td className="val-col">{(stats.txSuccess + stats.txFailed).toLocaleString()}</td></tr>
                  <tr><td className="head-col">Successful Completions</td><td className="val-col" style={{ color: "#059669" }}>{stats.txSuccess.toLocaleString()}</td></tr>
                  <tr><td className="head-col">Failed / Cancelled</td><td className="val-col" style={{ color: "#dc2626" }}>{stats.txFailed.toLocaleString()}</td></tr>
                  <tr><td className="head-col">Platform Success Rate</td><td className="val-col" style={{ color: "#059669" }}>{((stats.txSuccess / Math.max(stats.txSuccess + stats.txFailed, 1)) * 100).toFixed(2)}%</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="report-title">Liquidity & Flow Performance Metrics</div>
          <table className="report-table" style={{ marginBottom: 24 }}>
            <thead>
              <tr><th>Directional Flow</th><th style={{ textAlign: "right" }}>Total Volume (PHP)</th><th style={{ textAlign: "right" }}>Avg Network Speed</th><th style={{ textAlign: "right" }}>Avg Human Wait Time</th></tr>
            </thead>
            <tbody>
              <tr><td className="head-col" style={{ borderLeft: "4px solid #10b981" }}>Platform Inflow (Invoices)</td><td className="val-col">₱{stats.globalInflow.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td><td className="val-col">{stats.rxSpeeds.net} sec</td><td className="val-col">{stats.rxSpeeds.wait} sec</td></tr>
              <tr><td className="head-col" style={{ borderLeft: "4px solid #f59e0b" }}>B2B Outflow (Suppliers)</td><td className="val-col">₱{stats.globalOutflow.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td><td className="val-col">{stats.txSpeeds.net} sec</td><td className="val-col">{stats.txSpeeds.wait} sec</td></tr>
              <tr><td className="head-col" style={{ borderLeft: "4px solid #3b82f6" }}>Off-Ramp Liquidity (Cashouts)</td><td className="val-col">₱{stats.globalCashout.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td><td className="val-col">{stats.cxSpeeds.net} sec</td><td className="val-col">{stats.cxSpeeds.wait} sec</td></tr>
            </tbody>
          </table>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
            <div>
              <div className="report-title">Asset Settlement Distribution</div>
              <table className="report-table">
                <thead><tr><th>Digital Asset</th><th style={{ textAlign: "right" }}>Total Volume</th><th style={{ textAlign: "right" }}>Share</th></tr></thead>
                <tbody>
                  <tr><td className="head-col">PHPC (Peso)</td><td className="val-col">₱{stats.tokens.phpc.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td><td className="val-col">{pPHPC}%</td></tr>
                  <tr><td className="head-col">USDC (Dollar)</td><td className="val-col">₱{stats.tokens.usdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td><td className="val-col">{pUSDC}%</td></tr>
                  <tr><td className="head-col">XLM (Native)</td><td className="val-col">₱{stats.tokens.xlm.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td><td className="val-col">{pXLM}%</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <div className="report-title">Gateway Routing Preferences</div>
              <table className="report-table">
                <thead><tr><th>Off-Ramp Gateway</th><th style={{ textAlign: "right" }}>Total Ops</th><th style={{ textAlign: "right" }}>Share</th></tr></thead>
                <tbody>
                  <tr><td className="head-col">InstaPay / Banks</td><td className="val-col">{stats.routing.bank.toLocaleString()}</td><td className="val-col">{stats.routing.total > 0 ? Math.round((stats.routing.bank / stats.routing.total) * 100) : 0}%</td></tr>
                  <tr><td className="head-col">GCash E-Wallet</td><td className="val-col">{stats.routing.gcash.toLocaleString()}</td><td className="val-col">{stats.routing.total > 0 ? Math.round((stats.routing.gcash / stats.routing.total) * 100) : 0}%</td></tr>
                  <tr><td className="head-col">QR Ph Interoperability</td><td className="val-col">{stats.routing.qr.toLocaleString()}</td><td className="val-col">{stats.routing.total > 0 ? Math.round((stats.routing.qr / stats.routing.total) * 100) : 0}%</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ position: "absolute", bottom: 40, left: 50, right: 50, paddingTop: 16, borderTop: "1px solid #e5e7eb", fontSize: 10, color: "#9ca3af", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>Page 1 — Lux PH Administration Internal Report</div>
        </div>

        {/* PAGES 2+: DYNAMIC CHUNKED DATA TABLES */}
        {tableChunks.map((chunk, pageIndex) => (
          <div key={`page-${pageIndex + 2}`} className="pdf-page" style={{ width: pageW, height: pageH, background: "#ffffff", padding: "40px 50px", boxSizing: "border-box", color: "#111827", fontFamily: "'Nunito', sans-serif", position: "relative" }}>

            <div style={{ borderBottom: "3px solid #111827", paddingBottom: 16, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div><h1 style={{ fontSize: 24, fontWeight: 900, margin: "0 0 4px 0", color: "#111827", textTransform: "uppercase" }}>Detailed Flow Breakdown</h1></div>
              <div style={{ textAlign: "right", fontSize: 14, fontWeight: 800, color: "#111827" }}>{getReportDateLabel().toUpperCase()}</div>
            </div>

            <div className="report-title">Volume Trend Data (Part {pageIndex + 1} of {tableChunks.length})</div>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Timeline Period</th>
                  <th style={{ textAlign: "right", color: "#059669" }}>Inflow (Receive)</th>
                  <th style={{ textAlign: "right", color: "#d97706" }}>Outflow (Sent)</th>
                  <th style={{ textAlign: "right", color: "#2563eb" }}>Liquidity (Cashout)</th>
                  <th style={{ textAlign: "right", background: "#f3f4f6" }}>Total Gross Period</th>
                </tr>
              </thead>
              <tbody>
                {chunk.map((b, i) => (
                  <tr key={i}>
                    <td className="head-col">{b.label}</td>
                    <td className="val-col">₱{b.inflow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="val-col">₱{b.outflow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="val-col">₱{b.cashout.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td className="val-col" style={{ background: "#f9fafb" }}>₱{b.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ position: "absolute", bottom: 40, left: 50, right: 50, paddingTop: 16, borderTop: "1px solid #e5e7eb", fontSize: 10, color: "#9ca3af", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.05em" }}>Page {pageIndex + 2} — Lux PH Administration Internal Report</div>
          </div>
        ))}
      </div>


      {/* ======================================================================
          MAIN DASHBOARD UI 
          ====================================================================== */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>

        {/* HEADER & CONTROLS */}
        <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: "#fff", marginBottom: 4 }}>Platform Overview</h1>
            <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>Global Network Intelligence · Admin Access</p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <AnimatePresence>
              {timeFilter === "custom" && (
                <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: "auto", opacity: 1 }} exit={{ width: 0, opacity: 0 }} style={{ display: "flex", gap: 8, overflow: "hidden" }}>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "6px 12px", borderRadius: 8, colorScheme: "dark", outline: "none", fontSize: 12 }} />
                  <span style={{ color: "#6b7280", alignSelf: "center" }}>→</span>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "6px 12px", borderRadius: 8, colorScheme: "dark", outline: "none", fontSize: 12 }} />
                </motion.div>
              )}
            </AnimatePresence>

            <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", padding: 4, borderRadius: 10 }}>
              {(["today", "7d", "30d", "all", "custom"] as TimeFilter[]).map((tf) => (
                <button
                  key={tf} onClick={() => setTimeFilter(tf)}
                  style={{ background: timeFilter === tf ? "rgba(124,58,237,0.8)" : "transparent", color: timeFilter === tf ? "#fff" : "#9ca3af", border: "none", padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}
                >
                  {tf}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowPrintModal(true)}
              style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}
            >
              📄 Export PDF
            </button>
          </div>
        </div>

        {/* METRICS & CHARTS GRID */}
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "40vh" }}>
              <LoadingBadge text={`Syncing ${timeFilter.toUpperCase()} Matrix...`} variant="network" />
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 }}>
                <KpiCard label="Total Merchants" value={stats.totalMerchants.toLocaleString()} sub='<span style="color:#4ade80">Active Ecosystem Users</span>' />
                <KpiCard label={`Volume (${timeFilter.toUpperCase()})`} value={`₱${globalTVL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} sub='Total Inflow + Outflows' />
                <KpiCard label="Platform MRR" value={`₱${mrr.toLocaleString()}`} sub={`${stats.proCount} Active Pro Subscribers`} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, marginBottom: 16 }}>

                {/* DYNAMIC STACKED CHART */}
                <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", position: "relative" }}>
                  <motion.div animate={{ opacity: [0.03, 0.06, 0.03] }} transition={{ repeat: Infinity, duration: 4 }} style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "50%", background: "radial-gradient(circle at right, #7c3aed, transparent 70%)", pointerEvents: "none" }} />
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 8, fontFamily: "'Nunito',sans-serif", position: "relative" }}>Flow Breakdown Over Time</h3>

                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#9ca3af", marginBottom: 24, fontFamily: "'DM Mono', monospace" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, background: "#10b981", borderRadius: 2 }} />Inflow</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, background: "#f59e0b", borderRadius: 2 }} />Outflow</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, background: "#3b82f6", borderRadius: 2 }} />Cashout</span>
                  </div>

                  {hasData ? (
                    <>
                      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 8, height: 160, borderBottom: "1px solid rgba(255,255,255,.1)", paddingBottom: 10, position: "relative" }}>
                        <AnimatePresence>
                          {hoveredBar !== null && stats.trendChart[hoveredBar] && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                              style={{
                                position: "absolute",
                                bottom: `calc(${(stats.trendChart[hoveredBar].total / maxChartValue) * 100}% + 20px)`,
                                left: `calc(${(hoveredBar / (stats.trendChart.length - 1 || 1)) * 100}% - 50px)`,
                                background: "#1f2937", border: "1px solid rgba(124,58,237,0.5)", padding: "12px", borderRadius: 8, zIndex: 10, pointerEvents: "none",
                                boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)", whiteSpace: "nowrap", minWidth: "120px"
                              }}
                            >
                              <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 4 }}>{stats.trendChart[hoveredBar].label}</div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}><span style={{ color: "#10b981" }}>Inflow</span><span style={{ color: "#fff", fontWeight: "bold" }}>₱{stats.trendChart[hoveredBar].inflow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}><span style={{ color: "#f59e0b" }}>Outflow</span><span style={{ color: "#fff", fontWeight: "bold" }}>₱{stats.trendChart[hoveredBar].outflow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}><span style={{ color: "#3b82f6" }}>Cashout</span><span style={{ color: "#fff", fontWeight: "bold" }}>₱{stats.trendChart[hoveredBar].cashout.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 4 }}><span style={{ color: "#a78bfa" }}>Total</span><span style={{ color: "#fff", fontWeight: "bold" }}>₱{stats.trendChart[hoveredBar].total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {stats.trendChart.map((bucket, i) => {
                          const hPct = maxChartValue > 0 ? (bucket.total / maxChartValue) * 100 : 0;
                          const inPct = bucket.total > 0 ? (bucket.inflow / bucket.total) * 100 : 0;
                          const outPct = bucket.total > 0 ? (bucket.outflow / bucket.total) * 100 : 0;
                          const cashPct = bucket.total > 0 ? (bucket.cashout / bucket.total) * 100 : 0;

                          return (
                            <motion.div
                              key={i}
                              initial={{ height: 0 }} animate={{ height: `${Math.max(hPct, 2)}%` }} transition={{ duration: 0.8, delay: i * 0.05, type: "spring", bounce: 0.4 }}
                              onMouseEnter={() => setHoveredBar(i)} onMouseLeave={() => setHoveredBar(null)}
                              style={{
                                flex: 1, display: "flex", flexDirection: "column-reverse", borderRadius: "4px 4px 0 0", overflow: "hidden",
                                background: "rgba(255,255,255,0.05)", minHeight: "4px", cursor: "crosshair",
                                opacity: hoveredBar === null || hoveredBar === i ? 1 : 0.3, transition: "opacity 0.2s"
                              }}
                            >
                              <div style={{ height: `${inPct}%`, background: "#10b981", width: "100%" }} />
                              <div style={{ height: `${outPct}%`, background: "#f59e0b", width: "100%" }} />
                              <div style={{ height: `${cashPct}%`, background: "#3b82f6", width: "100%" }} />
                            </motion.div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b7280", fontFamily: "'DM Mono',monospace", marginTop: 12 }}>
                        {Array.from(new Set([
                          0,
                          Math.floor((stats.trendChart.length - 1) * 0.25),
                          Math.floor((stats.trendChart.length - 1) * 0.5),
                          Math.floor((stats.trendChart.length - 1) * 0.75),
                          stats.trendChart.length - 1
                        ])).map(index => <span key={index}>{stats.trendChart[index]?.label}</span>)}
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 12, height: 160, background: "rgba(0,0,0,0.2)" }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>📡</div>
                      <div style={{ fontSize: 13, color: "#9ca3af", fontFamily: "'DM Mono',monospace" }}>Awaiting Network Activity...</div>
                    </div>
                  )}
                </div>

                {/* NETWORK DYNAMICS */}
                <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 16, padding: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 24, fontFamily: "'Nunito',sans-serif" }}>Network Dynamics</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#10b981", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>PLATFORM INFLOW</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>₱{stats.globalInflow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#9ca3af", marginTop: 4, fontFamily: "'DM Mono',monospace" }}>
                        <span>⚡ {stats.rxSpeeds.net}s net</span><span>⏱ {stats.rxSpeeds.wait}s wait</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>B2B OUTFLOW</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>₱{stats.globalOutflow.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#9ca3af", marginTop: 4, fontFamily: "'DM Mono',monospace" }}>
                        <span>⚡ {stats.txSpeeds.net}s net</span><span>⏱ {stats.txSpeeds.wait}s wait</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>OFF-RAMP LIQUIDITY</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>₱{stats.globalCashout.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#9ca3af", marginTop: 4, fontFamily: "'DM Mono',monospace" }}>
                        <span>⚡ {stats.cxSpeeds.net}s net</span><span>⏱ {stats.cxSpeeds.wait}s wait</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ASSETS & ROUTING ROW */}
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>

                {/* ASSET SETTLEMENTS */}
                <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 16, padding: 24, display: "flex", gap: 32, alignItems: "center", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "relative", width: 120, height: 120 }}>
                    <svg viewBox="0 0 36 36" width={120} height={120} style={{ transform: "rotate(-90deg)", filter: "drop-shadow(0px 0px 8px rgba(0,0,0,0.5))" }}>
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                      {stats.tokens.total > 1 ? (
                        <>
                          <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#10b981" strokeWidth="4" strokeDasharray={`${pPHPC} ${100 - pPHPC}`} strokeDashoffset="0" style={{ transition: "all 1s ease" }} />
                          <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#3b82f6" strokeWidth="4" strokeDasharray={`${pUSDC} ${100 - pUSDC}`} strokeDashoffset={-pPHPC} style={{ transition: "all 1s ease" }} />
                          <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#8b5cf6" strokeWidth="4" strokeDasharray={`${pXLM} ${100 - pXLM}`} strokeDashoffset={-(pPHPC + pUSDC)} style={{ transition: "all 1s ease" }} />
                        </>
                      ) : (
                        <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" strokeWidth="2" />
                      )}
                    </svg>
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 20 }}>💎</div>
                  </div>
                  <div style={{ flex: 1, zIndex: 1 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 16, fontFamily: "'Nunito',sans-serif" }}>Asset Settlements</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {[
                        { color: "#10b981", label: "PHPC Volume", pct: pPHPC, amount: stats.tokens.phpc },
                        { color: "#3b82f6", label: "USDC Volume", pct: pUSDC, amount: stats.tokens.usdc },
                        { color: "#8b5cf6", label: "XLM Volume", pct: pXLM, amount: stats.tokens.xlm }
                      ].map(t => (
                        <div key={t.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.15)", padding: "6px 12px", borderRadius: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, boxShadow: `0 0 8px ${t.color}` }} />
                            <span style={{ fontSize: 12, color: "#d1d5db" }}>{t.label} ({t.pct}%)</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "'DM Mono', monospace" }}>₱{t.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ROUTING PROFILE */}
                <div style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 16, padding: 24 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 16, fontFamily: "'Nunito',sans-serif" }}>Routing Profile</h3>
                  {hasData ? (
                    <>
                      <MiniBar label="Bank Transfers" value={stats.routing.bank} max={stats.routing.total} color="#3b82f6" />
                      <MiniBar label="GCash E-Wallet" value={stats.routing.gcash} max={stats.routing.total} color="#10b981" />
                      <MiniBar label="QR Ph Code Scans" value={stats.routing.qr} max={stats.routing.total} color="#f59e0b" />
                    </>
                  ) : (
                    <div style={{ textAlign: "center", color: "#6b7280", fontSize: 12, marginTop: 40, fontFamily: "'DM Mono', monospace" }}>No routing data available</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ======================================================================
          EXPORT PDF MODAL 
          ====================================================================== */}
      <AnimatePresence>
        {showPrintModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPrintModal(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />

            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, width: 400, position: "relative", zIndex: 10, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}>
              <h2 style={{ margin: "0 0 8px 0", color: "#fff", fontSize: 20, fontFamily: "'Nunito', sans-serif" }}>Export Intelligence PDF</h2>
              <p style={{ color: "#9ca3af", fontSize: 13, margin: "0 0 24px 0" }}>This will construct a multi-page, pure-white tabular report of your {getReportDateLabel()} data.</p>

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
    </>
  );
}