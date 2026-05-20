import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { Horizon } from "@stellar/stellar-sdk";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface TransactionData {
  id?: string;
  amount?: string;
  amountToken?: string;
  token: string;
  timestamp: string;
  networkSpeedSeconds?: number;
  totalWaitTimeSeconds?: number;
  payoutMethod?: "bank" | "gcash" | "qr";
  status?: string;
  type?: "Inbound" | "Outbound" | "Off-Ramp";
}

type TimeRangeOption = "all" | "today" | "7days" | "30days" | "custom";

const FloatingWrapper = ({ children, delay = 0, yOffset = 4 }: { children: React.ReactNode, delay?: number, yOffset?: number }) => (
  <motion.div animate={{ y: [0, -yOffset, 0] }} transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay }} style={{ height: "100%" }}>
    {children}
  </motion.div>
);

const AnimatedStatCard = ({ label, value, sub, accent, delay }: { label: string, value: string | React.ReactNode, sub: React.ReactNode, accent: string, delay: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay, type: "spring", bounce: 0.4 }}
    whileHover={{ scale: 1.03, translateY: -5, boxShadow: `0 10px 30px -10px ${accent}60` }}
    style={{ background: "linear-gradient(145deg, rgba(255,255,255,.05) 0%, rgba(255,255,255,.01) 100%)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 20, position: "relative", overflow: "hidden", height: "100%", backdropFilter: "blur(10px)" }}
  >
    <motion.div
      animate={{ opacity: [0.1, 0.4, 0.1], scale: [1, 1.2, 1] }}
      transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay }}
      style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, background: accent, filter: "blur(40px)", borderRadius: "50%", pointerEvents: "none" }}
    />
    <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: 8, fontFamily: "'DM Mono',monospace" }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 6, fontFamily: "'Nunito',sans-serif", letterSpacing: "-0.02em" }}>{value}</div>
    <div style={{ fontSize: 12, color: "#9ca3af" }}>{sub}</div>
  </motion.div>
);

const MiniBar = ({ label, value, max, color }: { label: string, value: number, max: number, color: string }) => {
  const percent = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af", marginBottom: 4, fontFamily: "'DM Mono',monospace" }}>
        <span>{label}</span>
        <span style={{ color: "#fff", fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 1, delay: 0.5 }} style={{ height: "100%", background: color }} />
      </div>
    </div>
  );
};

export default function Analytics() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isPro, setIsPro] = useState<boolean | null>(null);

  const [timeRange, setTimeRange] = useState<TimeRangeOption>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [rawInvoices, setRawInvoices] = useState<TransactionData[]>([]);
  const [rawPayments, setRawPayments] = useState<TransactionData[]>([]);
  const [rawCashouts, setRawCashouts] = useState<TransactionData[]>([]);

  const [totalIn, setTotalIn] = useState(0);
  const [totalOutPayments, setTotalOutPayments] = useState(0);
  const [totalOutCashouts, setTotalOutCashouts] = useState(0);
  const [feesSaved, setFeesSaved] = useState(0);

  const [invoiceCount, setInvoiceCount] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);
  const [cashoutCount, setCashoutCount] = useState(0);

  const [failedInvoices, setFailedInvoices] = useState(0);
  const [failedPayments, setFailedPayments] = useState(0);
  const [failedCashouts, setFailedCashouts] = useState(0);

  const [avgInvoice, setAvgInvoice] = useState(0);
  const [avgPayment, setAvgPayment] = useState(0);
  const [avgCashout, setAvgCashout] = useState(0);
  const [maxTicketIn, setMaxTicketIn] = useState(0);

  const [rxSpeeds, setRxSpeeds] = useState({ net: "0.00", wait: "0.00" });
  const [txSpeeds, setTxSpeeds] = useState({ net: "0.00", wait: "0.00" });
  const [cxSpeeds, setCxSpeeds] = useState({ net: "0.00", wait: "0.00" });

  const [tokenStats, setTokenStats] = useState({ phpc: 0, usdc: 0, xlm: 0, totalTokens: 0 });
  const [cashoutMethods, setCashoutMethods] = useState({ bank: 0, gcash: 0, qr: 0, total: 0 });

  const [heatmapBars, setHeatmapBars] = useState<number[]>(new Array(12).fill(0));
  const [liveLedger, setLiveLedger] = useState<any>({ sequence: "Loading...", protocol: "...", baseFee: "..." });

  useEffect(() => {
    if (!isPro) return;
    const fetchEnvironmentAndStream = async () => {
      let horizonUrl = "https://horizon-testnet.stellar.org";
      try {
        const configSnap = await getDoc(doc(db, "system_config", "global"));
        if (configSnap.exists()) {
          const configData = configSnap.data();
          if (configData.stellarNetwork === "Mainnet (Public)") {
            horizonUrl = "https://horizon.stellar.org";
          }
        }
      } catch (e) {
        console.error("Failed to read system_config network mapping:", e);
      }

      const server = new Horizon.Server(horizonUrl);
      const closeStream = server.ledgers().cursor("now").stream({
        onmessage: (ledger) => {
          setLiveLedger({
            sequence: ledger.sequence,
            protocol: ledger.protocol_version,
            baseFee: ledger.base_fee_in_stroops
          });
        },
        onerror: (err) => console.error("Ledger stream error:", err)
      });

      return closeStream;
    };

    let streamCanceller: (() => void) | undefined;
    fetchEnvironmentAndStream().then(canceller => {
      streamCanceller = canceller;
    });

    return () => {
      if (streamCanceller) streamCanceller();
    };
  }, [isPro]);

  const fetchAllCollections = async (uid: string) => {
    try {
      const [invoicesSnap, paymentsSnap, cashoutsSnap] = await Promise.all([
        getDocs(collection(db, `merchants/${uid}/invoices`)),
        getDocs(collection(db, `merchants/${uid}/payments`)),
        getDocs(collection(db, `merchants/${uid}/cashouts`))
      ]);

      const invList: TransactionData[] = [];
      invoicesSnap.forEach(d => invList.push({ id: d.id, ...d.data(), type: "Inbound" } as TransactionData));

      const payList: TransactionData[] = [];
      paymentsSnap.forEach(d => payList.push({ id: d.id, ...d.data(), type: "Outbound" } as TransactionData));

      const cashList: TransactionData[] = [];
      cashoutsSnap.forEach(d => cashList.push({ id: d.id, ...d.data(), type: "Off-Ramp" } as TransactionData));

      setRawInvoices(invList);
      setRawPayments(payList);
      setRawCashouts(cashList);
    } catch (error) {
      console.error("Failed to retrieve source ledgers:", error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const merchantDoc = await getDoc(doc(db, "merchants", user.uid));
        if (merchantDoc.exists()) {
          const proStatus = merchantDoc.data().isSubscribed === true;
          setIsPro(proStatus);
          if (proStatus) await fetchAllCollections(user.uid);
        } else { setIsPro(false); }
      } else { setIsPro(false); }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const processedData = useMemo(() => {
    const filterByTime = (items: TransactionData[]) => {
      if (timeRange === "all") return items;

      const now = new Date();
      let startBoundary = new Date();

      if (timeRange === "today") {
        startBoundary.setHours(0, 0, 0, 0);
      } else if (timeRange === "7days") {
        startBoundary.setDate(now.getDate() - 7);
      } else if (timeRange === "30days") {
        startBoundary.setDate(now.getDate() - 30);
      } else if (timeRange === "custom") {
        const sLimit = startDate ? new Date(startDate) : new Date(0);
        const eLimit = endDate ? new Date(endDate) : new Date();
        eLimit.setHours(23, 59, 59, 999);

        return items.filter(item => {
          if (!item.timestamp) return false;
          const itemTime = new Date(item.timestamp).getTime();
          return itemTime >= sLimit.getTime() && itemTime <= eLimit.getTime();
        });
      }

      return items.filter(item => {
        if (!item.timestamp) return false;
        return new Date(item.timestamp).getTime() >= startBoundary.getTime();
      });
    };

    return {
      invoices: filterByTime(rawInvoices),
      payments: filterByTime(rawPayments),
      cashouts: filterByTime(rawCashouts)
    };
  }, [timeRange, startDate, endDate, rawInvoices, rawPayments, rawCashouts]);

  useEffect(() => {
    if (!isPro || isLoading) return;

    let sumIn = 0;
    let phpc = 0, usdc = 0, xlm = 0;
    let rxNetTotal = 0, rxWaitTotal = 0, rxSpeedCount = 0;
    let txNetTotal = 0, txWaitTotal = 0, txSpeedCount = 0;
    let cxNetTotal = 0, cxWaitTotal = 0, cxSpeedCount = 0;
    let maxIn = 0;

    let failInv = 0, failPay = 0, failCash = 0;
    let successInv = 0, successPay = 0, successCash = 0;

    const hourlyCounts = new Array(12).fill(0);
    const processTime = (tStr: string) => {
      if (!tStr) return;
      const bucket = Math.floor(new Date(tStr).getHours() / 2);
      if (bucket >= 0 && bucket < 12) hourlyCounts[bucket]++;
    };

    processedData.invoices.forEach((data) => {
      if (data.status === "failed" || data.status === "cancelled") {
        failInv++;
        return;
      }
      successInv++;
      const amt = parseFloat(data.amount || "0");
      sumIn += amt;
      maxIn = Math.max(maxIn, amt);

      if (data.token === "PHPC") phpc += amt;
      if (data.token === "USDC") usdc += amt;
      if (data.token === "XLM") xlm += amt;

      if (data.networkSpeedSeconds && data.networkSpeedSeconds > 0) {
        rxNetTotal += data.networkSpeedSeconds;
        rxWaitTotal += (data.totalWaitTimeSeconds || data.networkSpeedSeconds);
        rxSpeedCount++;
      }
      processTime(data.timestamp);
    });

    let sumOutPay = 0;
    processedData.payments.forEach((data) => {
      if (data.status === "failed" || data.status === "cancelled") {
        failPay++;
        return;
      }
      successPay++;
      sumOutPay += parseFloat(data.amount || "0");

      if (data.networkSpeedSeconds && data.networkSpeedSeconds > 0) {
        txNetTotal += data.networkSpeedSeconds;
        txWaitTotal += (data.totalWaitTimeSeconds || data.networkSpeedSeconds);
        txSpeedCount++;
      }
      processTime(data.timestamp);
    });

    let sumOutCash = 0;
    let mBank = 0, mGcash = 0, mQr = 0;
    processedData.cashouts.forEach((data) => {
      if (data.status === "failed" || data.status === "cancelled") {
        failCash++;
        return;
      }
      successCash++;
      sumOutCash += parseFloat(data.amountToken || data.amount || "0");

      if (data.networkSpeedSeconds && data.networkSpeedSeconds > 0) {
        cxNetTotal += data.networkSpeedSeconds;
        cxWaitTotal += (data.totalWaitTimeSeconds || data.networkSpeedSeconds);
        cxSpeedCount++;
      }

      if (data.payoutMethod === "bank") mBank++;
      if (data.payoutMethod === "gcash") mGcash++;
      if (data.payoutMethod === "qr") mQr++;
      processTime(data.timestamp);
    });

    setTotalIn(sumIn);
    setFeesSaved(sumIn * 0.035);
    setTotalOutPayments(sumOutPay);
    setTotalOutCashouts(sumOutCash);
    setMaxTicketIn(maxIn);

    setInvoiceCount(successInv);
    setPaymentCount(successPay);
    setCashoutCount(successCash);

    setFailedInvoices(failInv);
    setFailedPayments(failPay);
    setFailedCashouts(failCash);

    setAvgInvoice(successInv > 0 ? sumIn / successInv : 0);
    setAvgPayment(successPay > 0 ? sumOutPay / successPay : 0);
    setAvgCashout(successCash > 0 ? sumOutCash / successCash : 0);

    setCashoutMethods({ bank: mBank, gcash: mGcash, qr: mQr, total: successCash });

    setRxSpeeds(rxSpeedCount > 0 ? { net: (rxNetTotal / rxSpeedCount).toFixed(2), wait: (rxWaitTotal / rxSpeedCount).toFixed(2) } : { net: "0.00", wait: "0.00" });
    setTxSpeeds(txSpeedCount > 0 ? { net: (txNetTotal / txSpeedCount).toFixed(2), wait: (txWaitTotal / txSpeedCount).toFixed(2) } : { net: "0.00", wait: "0.00" });
    setCxSpeeds(cxSpeedCount > 0 ? { net: (cxNetTotal / cxSpeedCount).toFixed(2), wait: (cxWaitTotal / cxSpeedCount).toFixed(2) } : { net: "0.00", wait: "0.00" });

    const maxTx = Math.max(...hourlyCounts);
    setHeatmapBars(hourlyCounts.map(c => maxTx > 0 ? (c / maxTx) * 100 : 15));
    setTokenStats({ phpc, usdc, xlm, totalTokens: phpc + usdc + xlm > 0 ? phpc + usdc + xlm : 1 });

  }, [processedData, isPro, isLoading]);

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(124, 58, 237);
      doc.text("COMMAND CENTER AUDIT REPORT", 14, 20);

      doc.setFontSize(10);
      doc.setFont("Helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 26);
      doc.text(`Selected Filter Scope: ${timeRange.toUpperCase()}`, 14, 31);
      if (timeRange === "custom") {
        doc.text(`Date Bounds: ${startDate || "Earliest"} to ${endDate || "Latest"}`, 14, 36);
      }

      autoTable(doc, {
        startY: timeRange === "custom" ? 42 : 38,
        head: [["Financial Metrics Dashboard", "Value Calculation"]],
        body: [
          ["Total Capital Inflow", `PHP ${totalIn.toLocaleString()}`],
          ["Net Capital Retention Position", `PHP ${(totalIn - (totalOutPayments + totalOutCashouts)).toLocaleString()}`],
          ["Combined Operation Outflow", `PHP ${(totalOutPayments + totalOutCashouts).toLocaleString()}`],
          ["Calculated Gateway Fees Saved", `PHP ${feesSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}`]
        ],
        theme: "striped",
        headStyles: { fillColor: [124, 58, 237] },
        styles: { font: "Helvetica", fontSize: 10 }
      });

      const ledgerRows: any[] = [];

      processedData.invoices.forEach(i => ledgerRows.push([
        i.timestamp ? new Date(i.timestamp).toLocaleDateString() : "N/A",
        "INBOUND (Invoice)",
        i.token || "PHP",
        i.amount ? `PHP ${parseFloat(i.amount).toLocaleString()}` : "0",
        i.status?.toUpperCase() || "SUCCESS"
      ]));

      processedData.payments.forEach(p => ledgerRows.push([
        p.timestamp ? new Date(p.timestamp).toLocaleDateString() : "N/A",
        "OUTBOUND (Supplier)",
        p.token || "PHP",
        p.amount ? `PHP ${parseFloat(p.amount).toLocaleString()}` : "0",
        p.status?.toUpperCase() || "SUCCESS"
      ]));

      processedData.cashouts.forEach(c => ledgerRows.push([
        c.timestamp ? new Date(c.timestamp).toLocaleDateString() : "N/A",
        `OFF-RAMP (${c.payoutMethod || "Method"})`,
        "FIAT",
        c.amountToken || c.amount ? `PHP ${parseFloat(c.amountToken || c.amount || "0").toLocaleString()}` : "0",
        c.status?.toUpperCase() || "SUCCESS"
      ]));

      ledgerRows.sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());

      if (ledgerRows.length > 0) {
        autoTable(doc, {
          startY: (doc as any).lastAutoTable.finalY + 12,
          head: [["Date", "Operation Vector", "Asset", "Processed Volume", "Gateway State"]],
          body: ledgerRows,
          theme: "grid",
          headStyles: { fillColor: [79, 70, 229] },
          styles: { fontSize: 9 }
        });
      } else {
        doc.setFontSize(11);
        doc.text("No transactional actions compiled for this timestamp matrix segment.", 14, (doc as any).lastAutoTable.finalY + 15);
      }

      doc.save(`Audit_Report_${timeRange}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error("PDF Generator core crashed:", e);
    } finally {
      setIsExporting(false);
    }
  };

  const pPHPC = Math.round((tokenStats.phpc / tokenStats.totalTokens) * 100) || 0;
  const pUSDC = Math.round((tokenStats.usdc / tokenStats.totalTokens) * 100) || 0;
  const pXLM = Math.max(0, 100 - pPHPC - pUSDC);

  const dashPHPC = `${pPHPC} ${100 - pPHPC}`;
  const dashUSDC = `${pUSDC} ${100 - pUSDC}`;
  const dashXLM = `${pXLM} ${100 - pXLM}`;

  const offsetUSDC = -pPHPC;
  const offsetXLM = -(pPHPC + pUSDC);

  const totalOutGlobal = totalOutPayments + totalOutCashouts;

  if (isLoading) {
    return <div className="min-h-screen relative"><LoadingOverlay isLoading={true} message="Booting Quantum Analytics Logic..." /></div>;
  }

  if (!isPro) {
    return (
      <div style={{ position: "relative", minHeight: "80vh", overflow: "hidden" }}>
        <style>{`
          .blur-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
          @media (max-width: 1024px) { .blur-kpi-grid { grid-template-columns: repeat(2, 1fr); } }
          @media (max-width: 640px) { .blur-kpi-grid { grid-template-columns: 1fr; } }
        `}</style>
        <div style={{ filter: "blur(12px) opacity(0.25)", pointerEvents: "none", userSelect: "none" }}>
          <div className="blur-kpi-grid">{[1, 2, 3, 4].map(i => <div key={i} style={{ height: 140, background: "rgba(255,255,255,0.05)", borderRadius: 16 }} />)}</div>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", zIndex: 10, padding: 16 }}>
          <div style={{ background: "rgba(8,11,20,0.9)", border: "1px solid rgba(124,58,237,0.4)", borderRadius: 24, padding: "48px 40px", maxWidth: 440, width: "100%", textAlign: "center", backdropFilter: "blur(20px)", boxSizing: "border-box" }}>
            <div style={{ fontSize: 56, marginBottom: 20 }}>📊</div>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 12 }}>Unlock Pro Command Analytics</h2>
            <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 32 }}>Deep-dive into independent segment velocities, payment flows, and fiat gateway distributions.</p>
            <motion.button whileHover={{ scale: 1.05 }} onClick={() => navigate("/subscription")} style={{ width: "100%", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", border: "none", borderRadius: 12, padding: "16px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>Upgrade to Pro Dashboard</motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <style>{`
        .cc-header-row { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
        .cc-controls-shelf { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .cc-time-panel { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 6px 12px; borderRadius: 12px; flex-wrap: wrap; }
        .cc-date-inputs { display: flex; align-items: center; gap: 6px; margin-left: 8px; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 8px; flex-wrap: wrap; }
        .cc-ledger-badge { background: rgba(124,58,237,0.06); border: 1px solid rgba(124,58,237,0.2); padding: 10px 18px; borderRadius: 12px; display: flex; alignItems: center; gap: 16px; fontFamily: 'DM Mono',monospace; fontSize: 11px; color: #a78bfa; flex-wrap: wrap; }
        .cc-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }
        .cc-segment-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
        .cc-visuals-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px; }
        .cc-matrix-card { background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.05); borderRadius: 20px; padding: 32px; }
        .cc-matrix-box { display: flex; gap: 40px; align-items: center; flex-wrap: wrap; }

        @media (max-width: 1200px) {
          .cc-segment-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 1024px) {
          .cc-kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .cc-visuals-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 768px) {
          .cc-segment-grid { grid-template-columns: 1fr; }
          .cc-matrix-box { flex-direction: column; justify-content: center; text-align: center; gap: 24px; }
          .cc-matrix-box > div:last-child { width: 100%; }
        }
        @media (max-width: 640px) {
          .cc-header-row { flex-direction: column; align-items: flex-start; }
          .cc-controls-shelf { width: 100%; flex-direction: column; align-items: flex-start; }
          .cc-time-panel, .cc-ledger-badge, .cc-controls-shelf button { width: 100%; box-sizing: border-box; justify-content: space-between; }
          .cc-date-inputs { border-left: none; padding-left: 0; margin-left: 0; margin-top: 8px; width: 100%; justify-content: space-between; }
          .cc-kpi-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="cc-header-row">
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: "#fff", margin: "0 0 4px 0" }}>Command Center</h1>
          <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>Advanced Segment Audits · <span style={{ color: "#4ade80", fontWeight: 800 }}>PRO ACTIVE</span></p>
        </div>

        <div className="cc-controls-shelf">
          <div className="cc-time-panel">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRangeOption)}
              style={{ background: "transparent", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, outline: "none", cursor: "pointer" }}
            >
              <option value="all" style={{ background: "#0b0f19" }}>All Time</option>
              <option value="today" style={{ background: "#0b0f19" }}>Today</option>
              <option value="7days" style={{ background: "#0b0f19" }}>Last 7 Days</option>
              <option value="30days" style={{ background: "#0b0f19" }}>Last 30 Days</option>
              <option value="custom" style={{ background: "#0b0f19" }}>Custom Range</option>
            </select>

            {timeRange === "custom" && (
              <div className="cc-date-inputs">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ background: "transparent", color: "#fff", border: "none", fontSize: 11, outline: "none" }} />
                <span style={{ color: "#6b7280", fontSize: 11 }}>to</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ background: "transparent", color: "#fff", border: "none", fontSize: 11, outline: "none" }} />
              </div>
            )}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            disabled={isExporting}
            onClick={exportToPDF}
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, opacity: isExporting ? 0.6 : 1 }}
          >
            {isExporting ? "Compiling PDF..." : "⬇ Export Audit PDF"}
          </motion.button>

          <div className="cc-ledger-badge">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }} style={{ width: 6, height: 6, background: "#4ade80", borderRadius: "50%", boxShadow: "0 0 8px #4ade80" }} />LEDGER: <strong style={{ color: "#fff" }}>{liveLedger.sequence}</strong></div>
            <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.1)" }} />
            <div>FEE: <strong style={{ color: "#fff" }}>{liveLedger.baseFee} STROOPS</strong></div>
          </div>
        </div>
      </div>

      <div className="cc-kpi-grid">
        <FloatingWrapper delay={0}><AnimatedStatCard delay={0.1} label="Total Inflow" value={`₱${totalIn.toLocaleString()}`} sub="All Customer Payments" accent="#7c3aed" /></FloatingWrapper>
        <FloatingWrapper delay={0.2}><AnimatedStatCard delay={0.2} label="Net Capital Position" value={`₱${(totalIn - totalOutGlobal).toLocaleString()}`} sub="Retained Balance On-chain" accent="#3b82f6" /></FloatingWrapper>
        <FloatingWrapper delay={0.4}><AnimatedStatCard delay={0.3} label="Total Outflow" value={`₱${totalOutGlobal.toLocaleString()}`} sub="Suppliers + Cashouts Combined" accent="#f59e0b" /></FloatingWrapper>
        <FloatingWrapper delay={0.6}><AnimatedStatCard delay={0.4} label="Platform Fees Saved" value={<span>₱{feesSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>} sub={<span style={{ color: "#10b981" }}>vs 3.5% Gateway Rates</span>} accent="#10b981" /></FloatingWrapper>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 16, fontFamily: "'Nunito',sans-serif", display: "flex", alignItems: "center", gap: 8 }}>📊 Independent Segment Audits</h3>
      <div className="cc-segment-grid">
        <motion.div whileHover={{ y: -4 }} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", justifyItems: "center", justifyContent: "space-between", marginBottom: 16 }}><span style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>🧾 RECEIVE SEGMENT</span><span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>Inbound</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Invoices Cleared</span><strong style={{ color: "#fff" }}>{invoiceCount}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Avg Invoice Ticket</span><strong style={{ color: "#4ade80" }}>₱{avgInvoice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>High-Water Mark</span><strong style={{ color: "#fff" }}>₱{maxTicketIn.toLocaleString()}</strong></div>
            <div style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", margin: "4px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Failed / Cancelled</span><strong style={{ color: "#ef4444" }}>{failedInvoices}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Network Speed</span><strong style={{ color: "#10b981" }}>⚡ {rxSpeeds.net}s</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Human Wait Time</span><strong style={{ color: "#f59e0b" }}>⏱ {rxSpeeds.wait}s</strong></div>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -4 }} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>💸 SEND SEGMENT</span><span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>Outbound</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Supplier Disbursals</span><strong style={{ color: "#fff" }}>{paymentCount}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Avg Supplier Ticket</span><strong style={{ color: "#ef4444" }}>₱{avgPayment.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Total Disbursed</span><strong style={{ color: "#fff" }}>₱{totalOutPayments.toLocaleString()}</strong></div>
            <div style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", margin: "4px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Failed / Cancelled</span><strong style={{ color: "#ef4444" }}>{failedPayments}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Network Speed</span><strong style={{ color: "#10b981" }}>⚡ {txSpeeds.net}s</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Human Wait Time</span><strong style={{ color: "#f59e0b" }}>⏱ {txSpeeds.wait}s</strong></div>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -4 }} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><span style={{ color: "#3b82f6", fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>🏦 CASHOUT SEGMENT</span><span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>Off-Ramp</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Avg Bank Clearance</span><strong style={{ color: "#fff" }}>₱{avgCashout.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
            <div style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", margin: "4px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Failed / Cancelled</span><strong style={{ color: "#ef4444" }}>{failedCashouts}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Network Speed</span><strong style={{ color: "#10b981" }}>⚡ {cxSpeeds.net}s</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Human Wait Time</span><strong style={{ color: "#f59e0b" }}>⏱ {cxSpeeds.wait}s</strong></div>
            <div style={{ padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8, marginTop: 4 }}>
              <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em" }}>Gateway Routing Profile</div>
              <MiniBar label="Bank InstaPay" value={cashoutMethods.bank} max={cashoutMethods.total} color="#3b82f6" />
              <MiniBar label="GCash E-Wallet" value={cashoutMethods.gcash} max={cashoutMethods.total} color="#10b981" />
              <MiniBar label="QR Ph Code" value={cashoutMethods.qr} max={cashoutMethods.total} color="#f59e0b" />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="cc-visuals-grid">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="cc-matrix-card">
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 32, display: "flex", justifyContent: "space-between" }}>Asset Settlement Matrix</div>
          <div className="cc-matrix-box">
            <div style={{ position: "relative", width: 160, height: 160, flexShrink: 0 }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 40, ease: "linear" }} style={{ width: "100%", height: "100%" }}>
                <svg viewBox="0 0 36 36" width={160} height={160} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.02)" strokeWidth="3" />
                  {tokenStats.totalTokens > 0 && (
                    <>
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#10b981" strokeWidth="3.5" strokeDasharray={dashPHPC} strokeDashoffset="0" />
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#3b82f6" strokeWidth="3.5" strokeDasharray={dashUSDC} strokeDashoffset={offsetUSDC} />
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#8b5cf6" strokeWidth="3.5" strokeDasharray={dashXLM} strokeDashoffset={offsetXLM} />
                    </>
                  )}
                </svg>
              </motion.div>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 24 }}>💎</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
              {[
                { color: "#10b981", label: "PHPC (Peso)", value: `${pPHPC}%`, amount: `₱${tokenStats.phpc.toLocaleString()}` },
                { color: "#3b82f6", label: "USDC (Dollar)", value: `${pUSDC}%`, amount: `₱${tokenStats.usdc.toLocaleString()}` },
                { color: "#8b5cf6", label: "XLM (Native)", value: `${pXLM}%`, amount: `₱${tokenStats.xlm.toLocaleString()}` }
              ].map((t, i) => (
                <FloatingWrapper key={t.label} delay={i * 0.2} yOffset={3}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: t.color, boxShadow: `0 0 12px ${t.color}`, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: "#d1d5db", fontWeight: 700, textAlign: "left" }}>{t.label}</span>
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div style={{ fontWeight: 900, color: "#fff", fontSize: 16 }}>{t.value}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{t.amount}</div>
                    </div>
                  </div>
                </FloatingWrapper>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="cc-matrix-card">
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 32, display: "flex", justifyContent: "space-between" }}>System Load Window <span style={{ fontSize: 12, color: "#4ade80" }}>Dynamic</span></div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, borderBottom: "1px dashed rgba(255,255,255,.1)", paddingBottom: 10 }}>
            {heatmapBars.map((h, i) => (
              <motion.div
                key={i}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: [0.95, 1, 0.95] }}
                style={{ flex: 1, height: `${h}%`, borderRadius: "6px 6px 0 0", background: h > 50 ? "linear-gradient(180deg, #7c3aed, #4f46e5)" : "rgba(124,58,237,0.2)", transformOrigin: "bottom" }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
                whileHover={{ backgroundColor: "#a855f7" }}
              />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono',monospace", marginTop: 16, fontWeight: 600 }}>
            {["12AM", "4AM", "8AM", "12PM", "4PM", "8PM"].map(t => <span key={t}>{t}</span>)}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}